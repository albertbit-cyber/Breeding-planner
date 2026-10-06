// Finds every translation key an app's source asks for, with the English
// default written next to it, so the locale check can compare source to en.
//
// It reads the code with the TypeScript parser rather than a regex, because a
// key only means something together with its namespace: `t` from
// useTranslation("marketplace") looks in marketplace.json, a bare `t` or
// `i18n.t` looks in common.json, and "ns:key" or { ns } override both.
//
// A `t` that arrives as a parameter or prop is read in the namespace of the
// file's own useTranslation() when the file has exactly one. A helper module
// with no hook of its own names the namespace its callers pass in with a
// comment: `// i18n-namespace: marketplace`.
const fs = require("fs");
const path = require("path");
// CI installs each app but not the root, so fall back to an app's copy.
const ts = (() => {
  for (const from of [__dirname, path.join(__dirname, "../breeding-app-breeder"), path.join(__dirname, "../breeding-app-lab")]) {
    try {
      return require(require.resolve("typescript", { paths: [from] }));
    } catch {
      // try the next location
    }
  }
  throw new Error("i18n-source-keys: no typescript package found (install the root or an app's dependencies)");
})();

const PLURAL_SUFFIXES = ["_zero", "_one", "_two", "_few", "_many", "_other"];
const SOURCE_EXT = /\.(jsx?|tsx?|mjs|cjs)$/;
const SKIP_FILE = /\.(test|spec|stories)\.(jsx?|tsx?)$|\.d\.ts$/;
const SKIP_DIR = new Set(["node_modules", "locales", "__tests__", "__mocks__", "build", "dist"]);

const listSourceFiles = (dir, out = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIR.has(entry.name)) listSourceFiles(path.join(dir, entry.name), out);
    } else if (SOURCE_EXT.test(entry.name) && !SKIP_FILE.test(entry.name)) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
};

const scriptKind = (file) => {
  if (file.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (file.endsWith(".ts")) return ts.ScriptKind.TS;
  return ts.ScriptKind.JSX;
};

// A string the parser can read without running anything: '...', "..." or a
// template literal with no ${}.
const staticString = (node) => {
  if (!node) return undefined;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isParenthesizedExpression(node)) return staticString(node.expression);
  return undefined;
};

const objectProp = (node, name) => {
  if (!node || !ts.isObjectLiteralExpression(node)) return undefined;
  for (const prop of node.properties) {
    if (ts.isPropertyAssignment(prop) && prop.name && (prop.name.text === name)) return prop.initializer;
    if (ts.isShorthandPropertyAssignment(prop) && prop.name.text === name) return prop.name;
  }
  return undefined;
};

const isFunctionLike = (node) =>
  ts.isFunctionDeclaration(node) ||
  ts.isFunctionExpression(node) ||
  ts.isArrowFunction(node) ||
  ts.isMethodDeclaration(node) ||
  ts.isConstructorDeclaration(node) ||
  ts.isGetAccessor(node) ||
  ts.isSetAccessor(node);

// useTranslation("ns") / useTranslation(["ns", "common"]) -> "ns"
const hookNamespace = (call, defaultNs) => {
  const arg = call.arguments[0];
  const single = staticString(arg);
  if (single) return single;
  if (arg && ts.isArrayLiteralExpression(arg)) {
    const first = staticString(arg.elements[0]);
    if (first) return first;
  }
  return defaultNs;
};

const isUseTranslationCall = (node) =>
  node && ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "useTranslation";

/**
 * Scan one app.
 * @returns {{ keys: Array<{ns, key, defaultValue, plural, file, line}>, dynamic: Array<{ns, prefix, file, line}> }}
 */
const scanApp = (srcDir, { namespaces, defaultNs = "common" }) => {
  const keys = [];
  const dynamic = [];
  const nsSet = new Set(namespaces);

  for (const file of listSourceFiles(srcDir)) {
    const text = fs.readFileSync(file, "utf8");
    if (!/\bt\(|\.t\(|useTranslation|i18nKey/.test(text)) continue;
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKind(file));
    const rel = path.relative(srcDir, file).replace(/\\/g, "/");

    // Namespace for a `t` this file did not bind itself.
    const usesTuples = /\btranslateTuple\b/.test(text);
    const hint = text.match(/\/\/\s*i18n-namespace:\s*([\w-]+)/);
    const hookNamespaces = new Set();
    // Local hooks that wrap useTranslation, e.g. useAdvisorTranslation, which
    // also strips a leading "advisor." from the key.
    const customHooks = new Map();
    const collect = (node) => {
      if (isUseTranslationCall(node)) hookNamespaces.add(hookNamespace(node, defaultNs));
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        /^use\w*Translation$/.test(node.name.text) &&
        node.initializer &&
        isFunctionLike(node.initializer)
      ) {
        let inner;
        const find = (n) => {
          if (!inner && isUseTranslationCall(n)) inner = n;
          if (!inner) ts.forEachChild(n, find);
        };
        find(node.initializer);
        if (inner) {
          const ns = hookNamespace(inner, defaultNs);
          const strips = node.initializer.getText(sf).includes(`^${ns}\\.`);
          customHooks.set(node.name.text, { ns, strip: strips ? `${ns}.` : "" });
        }
      }
      ts.forEachChild(node, collect);
    };
    collect(sf);
    const fileNs = hint ? hint[1] : hookNamespaces.size === 1 ? [...hookNamespaces][0] : defaultNs;
    // A file whose only hook is a local wrapper hands that wrapper around as `t`.
    const onlyHook = customHooks.size === 1 && hookNamespaces.size === 1 ? [...customHooks.values()][0] : null;
    const fileBinding = !hint && onlyHook ? onlyHook : { ns: fileNs };

    // Scope stack of { name -> namespace } for translate functions bound from
    // useTranslation(). A `t` that is not bound anywhere (a prop, a parameter)
    // resolves to fileNs; i18n.t to the default namespace.
    const scopes = [new Map()];
    const bind = (name, ns, strip = "") => scopes[scopes.length - 1].set(name, { ns, strip });
    const lookup = (name) => {
      for (let i = scopes.length - 1; i >= 0; i -= 1) {
        if (scopes[i].has(name)) return scopes[i].get(name);
      }
      return undefined;
    };

    const record = (call, { ns, strip = "" }, keyNode, optionsNode) => {
      const line = sf.getLineAndCharacterOfPosition(call.getStart(sf)).line + 1;
      const optNs = staticString(objectProp(optionsNode, "ns"));
      let resolvedNs = optNs || ns;
      const key = staticString(keyNode);
      if (key === undefined) {
        if (keyNode && ts.isTemplateExpression(keyNode)) {
          const head = keyNode.head.text;
          dynamic.push({ ns: resolvedNs, prefix: strip && head.startsWith(strip) ? head.slice(strip.length) : head, file: rel, line });
        }
        return;
      }
      let bareKey = strip && key.startsWith(strip) ? key.slice(strip.length) : key;
      const colon = key.indexOf(":");
      if (colon > 0 && nsSet.has(key.slice(0, colon))) {
        resolvedNs = key.slice(0, colon);
        bareKey = key.slice(colon + 1);
      }
      let defaultValue = staticString(optionsNode);
      if (defaultValue === undefined) defaultValue = staticString(objectProp(optionsNode, "defaultValue"));
      const plural = Boolean(objectProp(optionsNode, "count"));
      const returnObjects = Boolean(objectProp(optionsNode, "returnObjects"));
      // defaultValue_one / defaultValue_other: English plural forms, one key each.
      const pluralDefaults = {};
      for (const suffix of PLURAL_SUFFIXES) {
        const value = staticString(objectProp(optionsNode, `defaultValue${suffix}`));
        if (value !== undefined) pluralDefaults[suffix] = value;
      }
      keys.push({ ns: resolvedNs, key: bareKey, defaultValue, pluralDefaults, plural, returnObjects, file: rel, line });
    };

    const visit = (node) => {
      const opensScope = isFunctionLike(node);
      if (opensScope) scopes.push(new Map());

      // const { t } = useTranslation("ns")  /  const { t: tr } = useTranslation()
      if (ts.isVariableDeclaration(node) && isUseTranslationCall(node.initializer)) {
        const ns = hookNamespace(node.initializer, defaultNs);
        if (ts.isObjectBindingPattern(node.name)) {
          for (const el of node.name.elements) {
            const prop = el.propertyName ? el.propertyName.text : el.name.text;
            if (prop === "t" && ts.isIdentifier(el.name)) bind(el.name.text, ns);
          }
        } else if (ts.isArrayBindingPattern(node.name)) {
          const first = node.name.elements[0];
          if (first && ts.isBindingElement(first) && ts.isIdentifier(first.name)) {
            bind(first.name.text, ns);
          }
        }
      }

      // const t = useAdvisorTranslation()
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer &&
        ts.isCallExpression(node.initializer) &&
        ts.isIdentifier(node.initializer.expression) &&
        customHooks.has(node.initializer.expression.text)
      ) {
        const hook = customHooks.get(node.initializer.expression.text);
        bind(node.name.text, hook.ns, hook.strip);
      }

      if (ts.isCallExpression(node)) {
        const callee = node.expression;
        const [keyNode, optionsNode] = node.arguments;
        if (ts.isIdentifier(callee)) {
          const bound = lookup(callee.text);
          if (bound !== undefined) record(node, bound, keyNode, optionsNode);
          else if (callee.text === "t") record(node, fileBinding, keyNode, optionsNode);
        } else if (
          ts.isPropertyAccessExpression(callee) &&
          callee.name.text === "t" &&
          ts.isIdentifier(callee.expression) &&
          /^(i18n|i18next)$/.test(callee.expression.text)
        ) {
          record(node, { ns: defaultNs }, keyNode, optionsNode);
        }
      }

      // The quarantine module keeps labels as ['key', 'English default'] tuples and renders
      // them through translateTuple(t, tuple); a file that uses that helper declares them.
      if (
        usesTuples &&
        ts.isArrayLiteralExpression(node) &&
        node.elements.length === 2 &&
        /^[a-z][\w]*(\.[\w-]+)+$/.test(staticString(node.elements[0]) || "") &&
        staticString(node.elements[1]) !== undefined
      ) {
        keys.push({
          ns: fileBinding.ns,
          key: staticString(node.elements[0]),
          defaultValue: staticString(node.elements[1]),
          pluralDefaults: {},
          plural: false,
          returnObjects: false,
          file: rel,
          line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
        });
      }

      // <Trans ns="..." i18nKey="..." defaults="..." />
      if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && node.tagName.getText(sf) === "Trans") {
        const attrs = {};
        for (const attr of node.attributes.properties) {
          if (ts.isJsxAttribute(attr) && attr.initializer) {
            const init = ts.isJsxExpression(attr.initializer) ? attr.initializer.expression : attr.initializer;
            attrs[attr.name.getText(sf)] = staticString(init);
          }
        }
        if (attrs.i18nKey) {
          let transNs = attrs.ns || fileBinding.ns;
          let transKey = attrs.i18nKey;
          const colon = transKey.indexOf(":");
          if (colon > 0 && nsSet.has(transKey.slice(0, colon))) {
            transNs = transKey.slice(0, colon);
            transKey = transKey.slice(colon + 1);
          }
          keys.push({
            ns: transNs,
            key: transKey,
            defaultValue: attrs.defaults,
            pluralDefaults: {},
            plural: false,
            returnObjects: false,
            file: rel,
            line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
          });
        }
      }

      ts.forEachChild(node, visit);
      if (opensScope) scopes.pop();
    };

    visit(sf);
  }

  return { keys, dynamic };
};

// True when i18next would find something for this key: the key itself, a
// plural form of it, or (for returnObjects) a subtree under it. fallbackNS is
// common, so common counts for every namespace.
const resolves = (flatByNs, ns, { key, plural, returnObjects }, defaultNs = "common") => {
  const tryNs = (n) => {
    const flat = flatByNs[n];
    if (!flat) return false;
    if (key in flat) return true;
    if (plural && PLURAL_SUFFIXES.some((s) => `${key}${s}` in flat)) return true;
    if (!returnObjects) return false;
    const prefix = `${key}.`;
    return Object.keys(flat).some((k) => k.startsWith(prefix));
  };
  return tryNs(ns) || (ns !== defaultNs && tryNs(defaultNs));
};

module.exports = { scanApp, resolves, listSourceFiles, PLURAL_SUFFIXES };
