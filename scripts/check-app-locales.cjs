#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const apps = [
  "breeding-app-marketplace",
  "breeding-app-breeder",
  "breeding-app-lab",
  "breeding-app-admin",
];

const reportSame = process.argv.includes("--report-same");

const isPlainObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

const readJson = (filePath) => {
  const raw = fs.readFileSync(filePath, "utf8");
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

const failures = [];
const warnings = [];
const sameRows = [];

for (const app of apps) {
  const settingsPath = path.join(root, app, "src", "i18n", "settings.json");
  const localesDir = path.join(root, app, "src", "locales");
  const settings = readJson(settingsPath);
  const languages = settings.supportedLangs || ["en"];
  const namespaces = settings.namespaces || ["common"];
  const baseLanguage = settings.fallbackLng || "en";

  for (const namespace of namespaces) {
    const basePath = path.join(localesDir, baseLanguage, `${namespace}.json`);
    if (!fs.existsSync(basePath)) {
      failures.push(`${app}: missing base locale ${baseLanguage}/${namespace}.json`);
      continue;
    }

    const baseFlat = flatten(readJson(basePath));
    const baseKeys = Object.keys(baseFlat).sort();

    for (const language of languages) {
      if (language === baseLanguage) continue;
      const targetPath = path.join(localesDir, language, `${namespace}.json`);
      if (!fs.existsSync(targetPath)) {
        failures.push(`${app}: missing locale file ${language}/${namespace}.json`);
        continue;
      }

      let targetFlat;
      try {
        targetFlat = flatten(readJson(targetPath));
      } catch (error) {
        failures.push(`${app}: invalid JSON in ${language}/${namespace}.json: ${error.message}`);
        continue;
      }

      const targetKeys = Object.keys(targetFlat).sort();
      const missing = baseKeys.filter((key) => !(key in targetFlat));
      const extra = targetKeys.filter((key) => !(key in baseFlat));
      if (missing.length) failures.push(`${app}: ${language}/${namespace} missing ${missing.length} key(s): ${missing.join(", ")}`);
      if (extra.length) warnings.push(`${app}: ${language}/${namespace} has ${extra.length} extra key(s): ${extra.join(", ")}`);

      if (reportSame) {
        const same = baseKeys.filter((key) => String(targetFlat[key]) === String(baseFlat[key]));
        if (same.length) {
          sameRows.push({ app, language, namespace, count: same.length });
        }
      }
    }
  }
}

if (failures.length) {
  console.error("App locale verification failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("All app locale files match their English key shape.");

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
