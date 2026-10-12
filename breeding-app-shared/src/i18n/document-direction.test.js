import { afterEach, describe, expect, it, vi } from "vitest";
import i18next from "i18next";
import { LANGUAGE_NAMES, SUPPORTED_LANGS, applyDocumentLanguage, bootstrapI18n, isRtl } from "./index";

// Hebrew flips the whole document, not just the copy: <html lang dir> drives text
// alignment, flex order and every logical (start/end) style in the apps.

const stubDocument = () => {
  const documentElement = { lang: "", dir: "" };
  const store = new Map();
  const storage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  vi.stubGlobal("document", { documentElement });
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("window", { localStorage: storage, document: { documentElement } });
  return documentElement;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("document direction", () => {
  it("sets rtl for Hebrew and ltr for the other nine languages", () => {
    const root = stubDocument();
    applyDocumentLanguage("he");
    expect(root).toEqual({ lang: "he", dir: "rtl" });
    for (const lng of SUPPORTED_LANGS.filter((l) => l !== "he")) {
      applyDocumentLanguage(lng);
      expect(root).toEqual({ lang: lng, dir: "ltr" });
    }
  });

  it("reads the base language of a region code", () => {
    expect(isRtl("he-IL")).toBe(true);
    expect(isRtl("de-AT")).toBe(false);
  });

  it("follows the language when the user switches", async () => {
    const root = stubDocument();
    const resources = Object.fromEntries(SUPPORTED_LANGS.map((lng) => [lng, { common: { hello: lng } }]));
    const i18n = bootstrapI18n(i18next.createInstance(), { resources });
    expect(root.dir).toBe("ltr");
    await i18n.changeLanguage("he");
    expect(root).toEqual({ lang: "he", dir: "rtl" });
    await i18n.changeLanguage("de");
    expect(root).toEqual({ lang: "de", dir: "ltr" });
  });

  it("names every language in its own script", () => {
    expect(Object.keys(LANGUAGE_NAMES).sort()).toEqual([...SUPPORTED_LANGS].sort());
    expect(LANGUAGE_NAMES.he).toBe("עברית");
    expect(LANGUAGE_NAMES.de).toBe("Deutsch");
  });
});
