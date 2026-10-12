import { describe, it, expect, vi } from "vitest";

// A first-time visitor must land in English even when their browser asks for
// another language. Only one case fits per file: i18next is a singleton that
// vitest will not reset between tests in the same file, so a second import
// would reuse the already-initialised instance.
//
// The browser globals go in vi.hoisted so they exist before the static import
// below runs. Importing here, rather than with `await import()` inside the
// test, keeps loading i18next and every locale file in collection; inside the
// test body it ran on the 5-second test clock and timed out on a busy machine.
vi.hoisted(() => {
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
});

import i18n from "./index.js";

describe("initial language", () => {
  it("starts in English for a first-time visitor on a Spanish browser", () => {
    expect(i18n.language).toBe("en");
  });
});
