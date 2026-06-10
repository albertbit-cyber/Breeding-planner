import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import settings from "./settings.json";

import enCommon from "../locales/en/common.json";
import enAnimals from "../locales/en/animals.json";
import enAdvisor from "../locales/en/advisor.json";
import enAuth from "../locales/en/auth.json";
import enElectron from "../locales/en/electron.json";

import esCommon from "../locales/es/common.json";
import esAnimals from "../locales/es/animals.json";
import esAdvisor from "../locales/es/advisor.json";
import esAuth from "../locales/es/auth.json";
import esElectron from "../locales/es/electron.json";

import frCommon from "../locales/fr/common.json";
import frAnimals from "../locales/fr/animals.json";
import frAdvisor from "../locales/fr/advisor.json";
import frAuth from "../locales/fr/auth.json";
import frElectron from "../locales/fr/electron.json";

import itCommon from "../locales/it/common.json";
import itAnimals from "../locales/it/animals.json";
import itAdvisor from "../locales/it/advisor.json";
import itAuth from "../locales/it/auth.json";
import itElectron from "../locales/it/electron.json";

import deCommon from "../locales/de/common.json";
import deAnimals from "../locales/de/animals.json";
import deAdvisor from "../locales/de/advisor.json";
import deAuth from "../locales/de/auth.json";
import deElectron from "../locales/de/electron.json";

import nlCommon from "../locales/nl/common.json";
import nlAnimals from "../locales/nl/animals.json";
import nlAdvisor from "../locales/nl/advisor.json";
import nlAuth from "../locales/nl/auth.json";
import nlElectron from "../locales/nl/electron.json";

import plCommon from "../locales/pl/common.json";
import plAnimals from "../locales/pl/animals.json";
import plAdvisor from "../locales/pl/advisor.json";
import plAuth from "../locales/pl/auth.json";
import plElectron from "../locales/pl/electron.json";

import ptCommon from "../locales/pt/common.json";
import ptAnimals from "../locales/pt/animals.json";
import ptAdvisor from "../locales/pt/advisor.json";
import ptAuth from "../locales/pt/auth.json";
import ptElectron from "../locales/pt/electron.json";

import csCommon from "../locales/cs/common.json";
import csAnimals from "../locales/cs/animals.json";
import csAdvisor from "../locales/cs/advisor.json";
import csAuth from "../locales/cs/auth.json";
import csElectron from "../locales/cs/electron.json";

import heCommon from "../locales/he/common.json";
import heAnimals from "../locales/he/animals.json";
import heAdvisor from "../locales/he/advisor.json";
import heAuth from "../locales/he/auth.json";
import heElectron from "../locales/he/electron.json";

const {
  supportedLangs: SUPPORTED_LANGS = ["en"],
  namespaces: NAMESPACES = ["common"],
  fallbackLng: FALLBACK_LANGUAGE = "en",
  defaultNamespace: DEFAULT_NAMESPACE = "common",
} = settings || {};

const resources = {
  en: {
    common: enCommon,
    animals: enAnimals,
    advisor: enAdvisor,
    auth: enAuth,
    electron: enElectron,
  },
  es: {
    common: esCommon,
    animals: esAnimals,
    advisor: esAdvisor,
    auth: esAuth,
    electron: esElectron,
  },
  fr: {
    common: frCommon,
    animals: frAnimals,
    advisor: frAdvisor,
    auth: frAuth,
    electron: frElectron,
  },
  it: {
    common: itCommon,
    animals: itAnimals,
    advisor: itAdvisor,
    auth: itAuth,
    electron: itElectron,
  },
  de: {
    common: deCommon,
    animals: deAnimals,
    advisor: deAdvisor,
    auth: deAuth,
    electron: deElectron,
  },
  nl: {
    common: nlCommon,
    animals: nlAnimals,
    advisor: nlAdvisor,
    auth: nlAuth,
    electron: nlElectron,
  },
  pl: {
    common: plCommon,
    animals: plAnimals,
    advisor: plAdvisor,
    auth: plAuth,
    electron: plElectron,
  },
  pt: {
    common: ptCommon,
    animals: ptAnimals,
    advisor: ptAdvisor,
    auth: ptAuth,
    electron: ptElectron,
  },
  cs: {
    common: csCommon,
    animals: csAnimals,
    advisor: csAdvisor,
    auth: csAuth,
    electron: csElectron,
  },
  he: {
    common: heCommon,
    animals: heAnimals,
    advisor: heAdvisor,
    auth: heAuth,
    electron: heElectron,
  },
};

// Resolve the language to initialise with.
// - Returning users: restore whatever they stored in localStorage.
// - First-time users (nothing stored): always start in English.
const getInitialLanguage = () => {
  try {
    const stored = localStorage.getItem("i18nextLng");
    const base = stored ? stored.split("-")[0] : "";
    if (base && SUPPORTED_LANGS.includes(base)) return base;
  } catch {
    // ignore – localStorage may be unavailable
  }
  return FALLBACK_LANGUAGE;
};

if (!i18n.isInitialized) {
  i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources,
      lng: getInitialLanguage(), // explicit > detector; ensures English on first load
      fallbackLng: FALLBACK_LANGUAGE,
      ns: NAMESPACES,
      defaultNS: DEFAULT_NAMESPACE,
      fallbackNS: DEFAULT_NAMESPACE,
      supportedLngs: SUPPORTED_LANGS,
      interpolation: {
        escapeValue: false,
      },
      detection: {
        // Only cache language changes the user explicitly makes via the selector.
        order: ["localStorage"],
        caches: ["localStorage"],
      },
    });
}

export default i18n;
