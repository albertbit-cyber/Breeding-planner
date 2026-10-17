#!/usr/bin/env node
// Locale check for the four apps.
//
//   1. Source -> en: every translation key the source asks for (t("..."),
//      i18n.t, <Trans i18nKey>) must exist in the English locale of the
//      namespace it resolves to. A key that only renders from its in-code
//      default is a failure: translators never see it.
//   2. en -> other languages: every language has every English key.
//
// Flags:
//   --lang en          check only these languages (comma separated); "en" alone
//                      runs the source check without the translation check
//   --write-en         add keys missing from en, using the in-code English
//                      default as the value, then check
//   --report-same      list how many values per language still equal English
//   --verbose          print every missing key instead of the first few
const fs = require("fs");
const path = require("path");
const { scanApp, resolves, PLURAL_SUFFIXES } = require("./i18n-source-keys.cjs");

const root = path.join(__dirname, "..");
const apps = [
  "breeding-app-marketplace",
  "breeding-app-breeder",
  "breeding-app-lab",
  "breeding-app-admin",
];

const args = process.argv.slice(2);
const flagValue = (name) => {
  const inline = args.find((a) => a.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
};
const reportSame = args.includes("--report-same");
const writeEn = args.includes("--write-en");
const verbose = args.includes("--verbose");
const langFilter = flagValue("--lang") ? new Set(flagValue("--lang").split(",").map((s) => s.trim())) : null;

const isPlainObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

const readRaw = (filePath) => fs.readFileSync(filePath, "utf8");
const readJson = (filePath) => {
  const raw = readRaw(filePath);
  return JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
};

const flatten = (value, prefix = "", out = {}) => {
  if (!isPlainObject(value)) {
    if (prefix) out[prefix] = value;
    return out;
  }
  for (const [key, child] of Object.entries(value)) {
    const next = prefix ? `${prefix}.${key}` : key;
    if (isPlainObject(child)) {
      flatten(child, next, out);
    } else {
      out[next] = child;
    }
  }
  return out;
};

const sample = (list) => (verbose || list.length <= 8 ? list.join(", ") : `${list.slice(0, 8).join(", ")}, … (+${list.length - 8} more, --verbose for all)`);

// The locale files' own layout: two-space or tab indent, one key per line, and
// small option objects inside arrays kept on one line. Re-serialising with
// JSON.stringify would reflow those and bury the real change in the diff.
const formatJson = (value, indent, depth = 0) => {
  const pad = indent.repeat(depth + 1);
  const end = indent.repeat(depth);
  if (Array.isArray(value)) {
    if (!value.length) return "[]";
    const items = value.map((item) =>
      isPlainObject(item) && Object.values(item).every((v) => v === null || typeof v !== "object")
        ? `${pad}{ ${Object.entries(item).map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(", ")} }`
        : `${pad}${formatJson(item, indent, depth + 1)}`
    );
    return `[\n${items.join(",\n")}\n${end}]`;
  }
  if (isPlainObject(value)) {
    const entries = Object.entries(value);
    if (!entries.length) return "{}";
    return `{\n${entries.map(([k, v]) => `${pad}${JSON.stringify(k)}: ${formatJson(v, indent, depth + 1)}`).join(",\n")}\n${end}}`;
  }
  return JSON.stringify(value);
};

// Write keys into an en file the way that file is already laid out: common.json
// keeps dotted keys flat at the top level, the other namespaces nest.
const addKeysToFile = (filePath, entries) => {
  const raw = readRaw(filePath);
  const bom = raw.charCodeAt(0) === 0xfeff ? "﻿" : "";
  const data = JSON.parse(bom ? raw.slice(1) : raw);
  const indentMatch = raw.match(/\n([ \t]+)"/);
  const indent = indentMatch ? indentMatch[1] : "  ";
  const flatLayout = Object.keys(data).some((k) => k.includes("."));
  const conflicts = [];

  for (const [key, value] of entries) {
    if (flatLayout) {
      data[key] = value;
      continue;
    }
    const parts = key.split(".");
    let node = data;
    let ok = true;
    for (const part of parts.slice(0, -1)) {
      if (node[part] === undefined) node[part] = {};
      if (!isPlainObject(node[part])) {
        ok = false;
        break;
      }
      node = node[part];
    }
    if (ok && node[parts[parts.length - 1]] === undefined) node[parts[parts.length - 1]] = value;
    else if (!ok) conflicts.push(key);
  }

  const trailing = raw.endsWith("\n") ? "\n" : "";
  const eol = raw.includes("\r\n") ? "\r\n" : "\n";
  const text = formatJson(data, indent).replace(/\n/g, eol);
  fs.writeFileSync(filePath, `${bom}${text}${trailing ? eol : ""}`, "utf8");
  return conflicts;
};

// Namespaces one app loads on top of the shared settings.json list (which lab shares
// too). They are checked like the rest: source against en, every language against en.
// breeder `help`: the in-app help system's text, translated into all ten languages 2026-10-16.
const APP_NAMESPACES = {
  "breeding-app-breeder": ["help"],
};

const failures = [];
const translationFailures = [];
const warnings = [];
const sameRows = [];
const summary = [];

for (const app of apps) {
  // Breeder and lab take their language settings from breeding-app-shared.
  const ownSettingsPath = path.join(root, app, "src", "i18n", "settings.json");
  const settingsPath = fs.existsSync(ownSettingsPath)
    ? ownSettingsPath
    : path.join(root, "breeding-app-shared", "src", "i18n", "settings.json");
  const localesDir = path.join(root, app, "src", "locales");
  const settings = readJson(settingsPath);
  const languages = settings.supportedLangs || ["en"];
  const namespaces = settings.namespaces || ["common"];
  const baseLanguage = settings.fallbackLng || "en";
  const defaultNs = settings.defaultNamespace || "common";
  const basePath = (ns) => path.join(localesDir, baseLanguage, `${ns}.json`);
  // Everything the app loads: the shared namespaces plus its own.
  const loaded = [...namespaces, ...(APP_NAMESPACES[app] || [])];
  const loadBase = () => {
    const flatByNs = {};
    for (const ns of loaded) {
      if (fs.existsSync(basePath(ns))) flatByNs[ns] = flatten(readJson(basePath(ns)));
    }
    return flatByNs;
  };

  // ---- 1. source -> en ----
  const { keys: used, dynamic } = scanApp(path.join(root, app, "src"), { namespaces: loaded, defaultNs });
  const unique = new Map();
  for (const entry of used) {
    const id = `${entry.ns}:${entry.key}`;
    const seen = unique.get(id);
    if (!seen) unique.set(id, { ...entry, sites: [entry] });
    else {
      seen.sites.push(entry);
      seen.plural = seen.plural || entry.plural;
      seen.returnObjects = seen.returnObjects || entry.returnObjects;
      if (seen.defaultValue === undefined) seen.defaultValue = entry.defaultValue;
      if (!Object.keys(seen.pluralDefaults).length) seen.pluralDefaults = entry.pluralDefaults;
    }
  }

  let flatByNs = loadBase();
  const unknownNs = [...unique.values()].filter((e) => !loaded.includes(e.ns));
  for (const e of unknownNs) failures.push(`${app}: ${e.sites[0].file}:${e.sites[0].line} uses namespace "${e.ns}", which the app does not load`);

  let missing = [...unique.values()].filter((e) => loaded.includes(e.ns) && !resolves(flatByNs, e.ns, e, defaultNs));

  if (writeEn && missing.length) {
    const byNs = new Map();
    const unwritable = [];
    for (const e of missing) {
      const values = [];
      if (Object.keys(e.pluralDefaults).length) {
        // i18next reads a plain defaultValue as the _other form when _one is given.
        const forms = { ...e.pluralDefaults };
        if (forms._other === undefined && e.defaultValue !== undefined) forms._other = e.defaultValue;
        for (const [suffix, value] of Object.entries(forms)) values.push([`${e.key}${suffix}`, value]);
      } else if (e.defaultValue !== undefined) {
        values.push([e.key, e.defaultValue]);
      }
      if (!values.length) {
        unwritable.push(e);
        continue;
      }
      // Different English at different call sites would collapse to one string.
      const defaults = new Set(e.sites.map((s) => s.defaultValue).filter((v) => v !== undefined));
      if (defaults.size > 1) {
        failures.push(`${app}: ${e.ns}:${e.key} has ${defaults.size} different English defaults; give each meaning its own key`);
        continue;
      }
      if (!byNs.has(e.ns)) byNs.set(e.ns, []);
      byNs.get(e.ns).push(...values);
    }
    for (const [ns, entries] of byNs) {
      entries.sort(([a], [b]) => a.localeCompare(b));
      const conflicts = addKeysToFile(basePath(ns), entries);
      conflicts.forEach((key) => failures.push(`${app}: cannot add ${ns}:${key}, a parent of it is already a string`));
      console.log(`${app}: added ${entries.length - conflicts.length} key(s) to ${baseLanguage}/${ns}.json`);
    }
    unwritable.forEach((e) => failures.push(`${app}: ${e.ns}:${e.key} (${e.sites[0].file}:${e.sites[0].line}) has no literal English default to write; add it to ${baseLanguage}/${e.ns}.json by hand`));
    flatByNs = loadBase();
    missing = [...unique.values()].filter((e) => loaded.includes(e.ns) && !resolves(flatByNs, e.ns, e, defaultNs));
  }

  // A template-literal key cannot be checked key by key, but a family with no
  // English entries at all only ever renders its in-code fallback.
  for (const d of dynamic) {
    if (!d.prefix) continue;
    const hasFamily = [d.ns, defaultNs].some((ns) => Object.keys(flatByNs[ns] || {}).some((k) => k.startsWith(d.prefix)));
    if (!hasFamily) warnings.push(`${app}: dynamic key ${d.ns}:${d.prefix}* (${d.file}:${d.line}) has no English entries`);
  }

  for (const e of missing) {
    const site = e.sites[0];
    failures.push(`${app}: ${e.ns}:${e.key} is used in ${site.file}:${site.line} but missing from ${baseLanguage}/${e.ns}.json`);
  }

  // ---- 2. en -> other languages ----
  let enKeyCount = 0;
  for (const namespace of loaded) {
    if (!fs.existsSync(basePath(namespace))) {
      failures.push(`${app}: missing base locale ${baseLanguage}/${namespace}.json`);
      continue;
    }

    const baseFlat = flatten(readJson(basePath(namespace)));
    const baseKeys = Object.keys(baseFlat).sort();
    enKeyCount += baseKeys.length;

    for (const language of languages) {
      if (language === baseLanguage) continue;
      if (langFilter && !langFilter.has(language)) continue;
      const targetPath = path.join(localesDir, language, `${namespace}.json`);
      if (!fs.existsSync(targetPath)) {
        translationFailures.push(`${app}: missing locale file ${language}/${namespace}.json`);
        continue;
      }

      let targetFlat;
      try {
        targetFlat = flatten(readJson(targetPath));
      } catch (error) {
        translationFailures.push(`${app}: invalid JSON in ${language}/${namespace}.json: ${error.message}`);
        continue;
      }

      const targetKeys = Object.keys(targetFlat).sort();
      const missingKeys = baseKeys.filter((key) => !(key in targetFlat));
      // A language's own plural forms (Polish _few/_many, Hebrew _two…) are not
      // in English but belong to an English plural key.
      const ownPluralForm = (key) => {
        const m = key.match(/^(.*)_(zero|one|two|few|many|other)$/);
        return Boolean(m) && `${m[1]}_other` in baseFlat;
      };
      const extra = targetKeys.filter((key) => !(key in baseFlat) && !ownPluralForm(key));
      if (missingKeys.length) translationFailures.push(`${app}: ${language}/${namespace} missing ${missingKeys.length} key(s): ${sample(missingKeys)}`);
      if (extra.length) warnings.push(`${app}: ${language}/${namespace} has ${extra.length} extra key(s): ${sample(extra)}`);

      if (reportSame) {
        const same = baseKeys.filter((key) => String(targetFlat[key]) === String(baseFlat[key]));
        if (same.length) {
          sameRows.push({ app, language, namespace, count: same.length });
        }
      }
    }
  }

  summary.push({ app, used: unique.size, missing: missing.length, dynamic: dynamic.length, enKeys: enKeyCount });
}

console.log("\nKeys per app (used in source / missing from en / en keys total / dynamic keys not checked):");
summary.forEach((s) => console.log(`- ${s.app}: ${s.used} used, ${s.missing} missing, ${s.enKeys} in en, ${s.dynamic} dynamic`));

if (warnings.length) {
  console.log("\nLocale warnings:");
  warnings.forEach((warning) => console.log(`- ${warning}`));
}

if (reportSame) {
  console.log("\nSame-as-English values:");
  if (!sameRows.length) {
    console.log("- none");
  } else {
    sameRows.forEach(({ app, language, namespace, count }) => {
      console.log(`- ${app} ${language}/${namespace}: ${count}`);
    });
  }
}

if (failures.length) {
  console.error("\nSource keys missing from English:");
  failures.forEach((failure) => console.error(`- ${failure}`));
}
if (translationFailures.length) {
  console.error("\nTranslations missing English keys:");
  translationFailures.forEach((failure) => console.error(`- ${failure}`));
}
if (failures.length || translationFailures.length) {
  console.error("\nApp locale verification failed.");
  process.exit(1);
}

console.log(langFilter ? `\nApp locales pass for: ${[...langFilter].join(", ")}.` : "\nAll app locale files pass: every source key is in English and every language matches it.");
