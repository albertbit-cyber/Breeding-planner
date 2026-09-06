import React, { createContext, useContext, useEffect, useState } from "react";
import {
  applySkinToRoot,
  readStoredAppearance,
  systemPrefersDark,
  systemPrefersReducedMotion,
} from "../../../breeding-app-shared/src/styles/applySkin.mjs";

/**
 * Thin skin provider.
 *
 * This app has no appearance UI — it only needs to honour the skin the user
 * chose. Colors come from `breeding-app-shared/src/styles/skins.css` via the
 * [data-skin] attribute this writes; nothing here holds a color value.
 *
 * The rich provider (presets, pickers, contrast guard) lives in the breeder,
 * which is the only app that lets a user change appearance. The shared logic
 * both rely on is in applySkin.mjs so the two cannot drift the way the four
 * forked copies of this file did.
 */

const AppearanceContext = createContext({
  appearanceState: {},
  skinId: "default",
  effectiveThemeMode: "light",
});

export function AppearanceProvider({ children }) {
  const [appearanceState, setAppearanceState] = useState(() => readStoredAppearance());
  const [systemTheme, setSystemTheme] = useState(() => (systemPrefersDark() ? "dark" : "light"));
  const [systemMotion, setSystemMotion] = useState(() => systemPrefersReducedMotion());
  const [resolved, setResolved] = useState({ skinId: "default", effectiveThemeMode: "light" });

  // Another tab (or the breeder on the same origin) changing the skin should
  // be reflected here rather than needing a reload.
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onStorage = () => setAppearanceState(readStoredAppearance());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const dark = window.matchMedia("(prefers-color-scheme: dark)");
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onDark = (e) => setSystemTheme(e.matches ? "dark" : "light");
    const onMotion = (e) => setSystemMotion(e.matches);

    const add = (m, h) =>
      typeof m.addEventListener === "function" ? m.addEventListener("change", h) : m.addListener?.(h);
    const remove = (m, h) =>
      typeof m.removeEventListener === "function" ? m.removeEventListener("change", h) : m.removeListener?.(h);

    add(dark, onDark);
    add(motion, onMotion);
    return () => {
      remove(dark, onDark);
      remove(motion, onMotion);
    };
  }, []);

  useEffect(() => {
    const next = applySkinToRoot(appearanceState, { systemTheme, systemMotion });
    if (next) setResolved(next);
  }, [appearanceState, systemTheme, systemMotion]);

  return (
    <AppearanceContext.Provider
      value={{
        appearanceState,
        skinId: resolved.skinId,
        effectiveThemeMode: resolved.effectiveThemeMode,
      }}
    >
      {children}
    </AppearanceContext.Provider>
  );
}

export function useAppearance() {
  return useContext(AppearanceContext);
}
