import { describe, it, expect, vi } from "vitest";

// A first-time visitor must land in English even when their browser asks for
// another language. Only one case fits per file: i18next is a singleton that
// vitest will not reset between tests in the same file, so a second import
// would reuse the already-initialised instance.
describe("initial language", () => {
  it("starts in English for a first-time visitor on a Spanish browser", async () => {
    const store = new Map();
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

    const { default: i18n } = await import("./index.js");
    expect(i18n.language).toBe("en");
  });
});
