import { afterEach, describe, expect, it, vi } from "vitest";
import i18next from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { SUPPORTED_LANGS, bootstrapI18n, getInitialLanguage } from "./index";

// One copy of the rule the breeder and lab apps used to test separately:
// a first-time visitor lands in English whatever the browser asks for, and a
// returning visitor gets back the language they picked.
//
// Each case gets its own i18next instance, so the singleton problem that kept
// the app copies to one case per file does not apply here.

const stubBrowser = ({ stored } = {}) => {
  const store = new Map(stored ? [["i18nextLng", stored]] : []);
  const storage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  const navigator = { language: "es-ES", languages: ["es-ES", "es"] };
  const document = { documentElement: { lang: "es" }, cookie: "" };
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("navigator", navigator);
  vi.stubGlobal("document", document);
  vi.stubGlobal("window", { localStorage: storage, navigator, document });
};

const resources = Object.fromEntries(
  SUPPORTED_LANGS.map((lng) => [lng, { common: { hello: `hello-${lng}` } }])
);

const boot = () => bootstrapI18n(i18next.createInstance(), { resources, plugins: [LanguageDetector] });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("initial language", () => {
  it("offers the ten settings languages, English first", () => {
    expect(SUPPORTED_LANGS).toEqual(["en", "es", "fr", "it", "de", "nl", "pl", "pt", "cs", "he"]);
  });

  it("starts in English for a first-time visitor on a Spanish browser", () => {
    stubBrowser();
    const i18n = boot();
    expect(i18n.language).toBe("en");
    expect(i18n.t("hello")).toBe("hello-en");
  });

  it("restores a returning visitor's stored language by its base code", () => {
    stubBrowser({ stored: "de-AT" });
    expect(getInitialLanguage()).toBe("de");
    expect(boot().language).toBe("de");
  });

  it("ignores a stored language the apps do not offer", () => {
    stubBrowser({ stored: "ja" });
    expect(boot().language).toBe("en");
  });

  it("falls back to English when localStorage is unavailable", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(getInitialLanguage()).toBe("en");
  });

  it("does not re-initialise an instance that is already running", () => {
    const init = vi.fn();
    const instance = { isInitialized: true, use: vi.fn(), init };
    expect(bootstrapI18n(instance, { resources })).toBe(instance);
    expect(init).not.toHaveBeenCalled();
  });
});
