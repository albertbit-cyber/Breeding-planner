const fs = require("fs");
const path = require("path");
const { app } = require("electron");
const i18next = require("i18next");

const isPackaged = !!app?.isPackaged;

const resolveAssetPath = (...segments) => {
  if (isPackaged) {
    return path.join(process.resourcesPath, ...segments);
  }
  return path.resolve(__dirname, "..", ...segments);
};

const SETTINGS_PATH = isPackaged
  ? resolveAssetPath("i18n-settings.json")
  : path.resolve(__dirname, "../src/i18n/settings.json");

const LOCALES_DIR = isPackaged
  ? resolveAssetPath("locales")
  : path.resolve(__dirname, "../src/locales");

const loadSettings = () => {
  try {
    const raw = fs.readFileSync(SETTINGS_PATH, "utf-8");
    return JSON.parse(raw);
  } catch (error) {
    console.warn("Unable to load i18n settings; falling back to defaults", error?.message || error);
    return {};
  }
};

const settings = loadSettings();

const ELECTRON_NAMESPACE = "electron";
const SUPPORTED_LANGS = Array.isArray(settings?.supportedLangs)
  ? settings.supportedLangs
  : ["en"];
const FALLBACK_LANGUAGE = settings?.fallbackLng || "en";

const loadNamespaceResources = () => {
  return SUPPORTED_LANGS.reduce((acc, lang) => {
    const filePath = path.join(LOCALES_DIR, lang, `${ELECTRON_NAMESPACE}.json`);
    let data = {};
    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      data = JSON.parse(raw);
    } catch (error) {
      console.warn(`Missing ${ELECTRON_NAMESPACE} locale for ${lang}`, error?.message || error);
      data = {};
    }
    acc[lang] = { [ELECTRON_NAMESPACE]: data };
    return acc;
  }, {});
};

const resources = loadNamespaceResources();

const resolveLanguage = (input) => {
  if (!input || typeof input !== "string") {
    return FALLBACK_LANGUAGE;
  }
  const normalized = input.toLowerCase();
  if (SUPPORTED_LANGS.includes(normalized)) {
    return normalized;
  }
  const shortCode = normalized.split(/[\-_]/)[0];
  if (SUPPORTED_LANGS.includes(shortCode)) {
    return shortCode;
  }
  return FALLBACK_LANGUAGE;
};

const createElectronI18n = (initialLanguage) => {
  const instance = i18next.createInstance();
  const startingLanguage = resolveLanguage(initialLanguage);
  const initPromise = instance.init({
    lng: startingLanguage,
    fallbackLng: FALLBACK_LANGUAGE,
    ns: [ELECTRON_NAMESPACE],
    defaultNS: ELECTRON_NAMESPACE,
    resources,
    interpolation: { escapeValue: false },
  });

  const setLanguage = async (nextLanguage) => {
    const resolved = resolveLanguage(nextLanguage);
    if (instance.language === resolved) {
      return resolved;
    }
    await instance.changeLanguage(resolved);
    return resolved;
  };

  return {
    i18n: instance,
    initPromise,
    resolveLanguage,
    setLanguage,
    t: (key, options) => instance.t(key, options),
    getLanguage: () => instance.language || startingLanguage,
  };
};

module.exports = {
  createElectronI18n,
  resolveLanguage,
  SUPPORTED_LANGS,
  FALLBACK_LANGUAGE,
  ELECTRON_NAMESPACE,
};
