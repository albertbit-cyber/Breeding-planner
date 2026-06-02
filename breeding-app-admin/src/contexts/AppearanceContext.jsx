import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const APPEARANCE_STORAGE_KEY = "breedingPlannerAppearance.v1";
const CUSTOM_PRESET_STORAGE_KEY = "breedingPlannerCustomPresets.v1";
const DEFAULT_APPEARANCE = {
  version: 1,
  preset: "default",
  themeMode: "system", // system | light | dark | high-contrast
  colors: {
    primary: "#0ea5e9",
    secondary: "#2563eb",
    accent: "#f59e0b",
    background: "#f6f7f9",
    card: "#ffffff",
    text: "#0f172a",
  },
  typography: {
    fontFamily: "default",
    fontSize: "medium",
    lineSpacing: "normal",
  },
  layoutDensity: "comfortable",
  borderStyle: "soft",
  backgroundMode: "solid",
  motion: {
    animations: true,
    reducedMotion: false,
  },
};

const FONT_FAMILIES = {
  default: "'Space Grotesk', 'Segoe UI', system-ui, -apple-system, sans-serif",
  inter: "'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif",
  roboto: "'Roboto', 'Segoe UI', system-ui, -apple-system, sans-serif",
  opensans: "'Open Sans', 'Segoe UI', system-ui, -apple-system, sans-serif",
  serif: "'Cormorant Garamond', 'Georgia', 'Times New Roman', serif",
  mono: "'IBM Plex Mono', 'SFMono-Regular', Consolas, Menlo, monospace",
};

const FONT_SIZE_SCALE = {
  small: "14px",
  medium: "16px",
  large: "18px",
  xlarge: "20px",
};

const LINE_HEIGHT_SCALE = {
  compact: 1.35,
  normal: 1.6,
  relaxed: 1.8,
};

const DENSITY_MAP = {
  compact: {
    buttonY: "0.35rem",
    buttonX: "0.85rem",
    cardPadding: "0.75rem",
    rowHeight: "2.25rem",
    listGap: "0.4rem",
  },
  comfortable: {
    buttonY: "0.55rem",
    buttonX: "1rem",
    cardPadding: "1.15rem",
    rowHeight: "2.65rem",
    listGap: "0.65rem",
  },
  spacious: {
    buttonY: "0.75rem",
    buttonX: "1.35rem",
    cardPadding: "1.5rem",
    rowHeight: "3.1rem",
    listGap: "0.9rem",
  },
};

const RADIUS_MAP = {
  sharp: "2px",
  soft: "8px",
  rounded: "16px",
};

const HIGH_CONTRAST_COLORS = {
  primary: "#ffb100",
  secondary: "#ffd700",
  accent: "#ff4d4f",
  background: "#000000",
  card: "#111111",
  text: "#ffffff",
};

const APPEARANCE_PRESETS = {
  default: {
    key: "default",
    label: "Default",
    description: "Balanced palette inspired by the demo brand.",
    state: DEFAULT_APPEARANCE,
  },
  minimal: {
    key: "minimal",
    label: "Minimal",
    description: "Neutral grays with a single accent.",
    state: {
      ...DEFAULT_APPEARANCE,
      themeMode: "light",
      colors: {
        primary: "#0f172a",
        secondary: "#94a3b8",
        accent: "#f97316",
        background: "#fbfbfb",
        card: "#ffffff",
        text: "#0f172a",
      },
      typography: {
        fontFamily: "default",
        fontSize: "medium",
        lineSpacing: "normal",
      },
      layoutDensity: "comfortable",
      borderStyle: "sharp",
    },
  },
  highContrast: {
    key: "highContrast",
    label: "High contrast",
    description: "Meets WCAG AAA for critical surfaces.",
    state: {
      ...DEFAULT_APPEARANCE,
      themeMode: "high-contrast",
      colors: HIGH_CONTRAST_COLORS,
      typography: {
        fontFamily: "inter",
        fontSize: "large",
        lineSpacing: "relaxed",
      },
      layoutDensity: "comfortable",
      borderStyle: "soft",
      motion: {
        animations: false,
        reducedMotion: true,
      },
    },
  },
  visualImpaired: {
    key: "visualImpaired",
    label: "Visually impaired",
    description: "Large text, strong contrast, spacious controls, and reduced motion.",
    state: {
      ...DEFAULT_APPEARANCE,
      preset: "visualImpaired",
      themeMode: "light",
      colors: {
        primary: "#005fcc",
        secondary: "#111827",
        accent: "#b45309",
        background: "#ffffff",
        card: "#ffffff",
        text: "#000000",
      },
      typography: {
        fontFamily: "opensans",
        fontSize: "xlarge",
        lineSpacing: "relaxed",
      },
      layoutDensity: "spacious",
      borderStyle: "soft",
      backgroundMode: "solid",
      motion: {
        animations: false,
        reducedMotion: true,
      },
    },
  },
  darkBreeder: {
    key: "darkBreeder",
    label: "Dark breeder",
    description: "Moody dashboard for low-light field work.",
    state: {
      ...DEFAULT_APPEARANCE,
      themeMode: "dark",
      colors: {
        primary: "#12b981",
        secondary: "#0f172a",
        accent: "#ef4444",
        background: "#05070d",
        card: "#111827",
        text: "#e2e8f0",
      },
      typography: {
        fontFamily: "inter",
        fontSize: "medium",
        lineSpacing: "normal",
      },
      layoutDensity: "comfortable",
      borderStyle: "soft",
    },
  },
  softPastel: {
    key: "softPastel",
    label: "Soft pastel",
    description: "Gentle palette with rounded corners.",
    state: {
      ...DEFAULT_APPEARANCE,
      themeMode: "light",
      colors: {
        primary: "#f472b6",
        secondary: "#a5b4fc",
        accent: "#34d399",
        background: "#fef6fb",
        card: "#ffffff",
        text: "#2e1065",
      },
      typography: {
        fontFamily: "opensans",
        fontSize: "medium",
        lineSpacing: "relaxed",
      },
      layoutDensity: "spacious",
      borderStyle: "rounded",
    },
  },
};

const presetList = Object.values(APPEARANCE_PRESETS);

function sanitizeCustomPresetEntry(entry) {
  if (!entry || typeof entry !== "object") return null;
  const key = typeof entry.key === "string" && entry.key.trim() ? entry.key.trim() : null;
  const label = typeof entry.label === "string" && entry.label.trim() ? entry.label.trim() : null;
  if (!key || !label) return null;
  const description = typeof entry.description === "string" && entry.description.trim()
    ? entry.description.trim()
    : "Custom preset";
  const state = sanitizeAppearance({ ...(entry.state || {}), preset: key });
  return { key, label, description, state };
}

function loadCustomPresets() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CUSTOM_PRESET_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(sanitizeCustomPresetEntry).filter(Boolean);
  } catch (err) {
    console.warn("Failed to load custom appearance presets", err);
    return [];
  }
}

function sanitizeAppearance(raw = {}) {
  const base = { ...DEFAULT_APPEARANCE };
  const incoming = typeof raw === "object" && raw !== null ? raw : {};
  const colors = { ...base.colors, ...(incoming.colors || {}) };
  const typography = { ...base.typography, ...(incoming.typography || {}) };
  const motion = { ...base.motion, ...(incoming.motion || {}) };
  return {
    version: typeof incoming.version === "number" ? incoming.version : base.version,
    preset: typeof incoming.preset === "string" ? incoming.preset : base.preset,
    themeMode: incoming.themeMode === "dark" || incoming.themeMode === "light" || incoming.themeMode === "high-contrast" || incoming.themeMode === "system"
      ? incoming.themeMode
      : base.themeMode,
    colors,
    typography,
    layoutDensity: ["compact", "comfortable", "spacious"].includes(incoming.layoutDensity) ? incoming.layoutDensity : base.layoutDensity,
    borderStyle: ["sharp", "soft", "rounded"].includes(incoming.borderStyle) ? incoming.borderStyle : base.borderStyle,
    backgroundMode: ["solid", "logo"].includes(incoming.backgroundMode) ? incoming.backgroundMode : base.backgroundMode,
    motion: {
      animations: motion.animations !== false,
      reducedMotion: motion.reducedMotion === true,
    },
  };
}

function mergeAppearance(base, updates = {}) {
  const sanitizedBase = sanitizeAppearance(base);
  const next = {
    ...sanitizedBase,
    ...updates,
    colors: { ...sanitizedBase.colors, ...(updates.colors || {}) },
    typography: { ...sanitizedBase.typography, ...(updates.typography || {}) },
    motion: { ...sanitizedBase.motion, ...(updates.motion || {}) },
  };
  if (!updates.preset && (updates.colors || updates.typography || updates.layoutDensity || updates.borderStyle || updates.backgroundMode)) {
    next.preset = "custom";
  }
  return sanitizeAppearance(next);
}

function loadStoredAppearance() {
  if (typeof window === "undefined") return DEFAULT_APPEARANCE;
  try {
    const raw = window.localStorage.getItem(APPEARANCE_STORAGE_KEY);
    if (!raw) return DEFAULT_APPEARANCE;
    const parsed = JSON.parse(raw);
    return sanitizeAppearance(parsed);
  } catch (err) {
    console.warn("Failed to read appearance settings", err);
    return DEFAULT_APPEARANCE;
  }
}

function getInitialSystemTheme() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "light";
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getInitialSystemMotion() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const AppearanceContext = createContext({
  appearanceState: DEFAULT_APPEARANCE,
  resolvedAppearance: {
    mode: "light",
    colors: DEFAULT_APPEARANCE.colors,
    typography: DEFAULT_APPEARANCE.typography,
    density: DENSITY_MAP[DEFAULT_APPEARANCE.layoutDensity],
    borderRadius: RADIUS_MAP[DEFAULT_APPEARANCE.borderStyle],
    motion: DEFAULT_APPEARANCE.motion,
  },
  updateAppearance: () => {},
  resetAppearance: () => {},
  applyPreset: () => {},
  hydrateAppearance: () => {},
  appearancePresets: presetList,
  customPresets: [],
  saveCustomPreset: () => ({ ok: false }),
  effectiveThemeMode: "light",
});

export function AppearanceProvider({ children }) {
  const [appearanceState, setAppearanceState] = useState(() => loadStoredAppearance());
  const [systemTheme, setSystemTheme] = useState(() => getInitialSystemTheme());
  const [systemMotion, setSystemMotion] = useState(() => getInitialSystemMotion());
  const [customPresets, setCustomPresets] = useState(() => loadCustomPresets());

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (event) => setSystemTheme(event.matches ? "dark" : "light");
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", handler);
    } else if (typeof media.addListener === "function") {
      media.addListener(handler);
    }
    return () => {
      if (typeof media.removeEventListener === "function") media.removeEventListener("change", handler);
      else if (typeof media.removeListener === "function") media.removeListener(handler);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = (event) => setSystemMotion(event.matches);
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", handler);
    } else if (typeof media.addListener === "function") {
      media.addListener(handler);
    }
    return () => {
      if (typeof media.removeEventListener === "function") media.removeEventListener("change", handler);
      else if (typeof media.removeListener === "function") media.removeListener(handler);
    };
  }, []);

  const effectiveThemeMode = appearanceState.themeMode === "system" ? systemTheme : appearanceState.themeMode;

  const resolvedColors = useMemo(() => {
    const presetColors = APPEARANCE_PRESETS[appearanceState.preset]?.state?.colors || DEFAULT_APPEARANCE.colors;
    const merged = { ...presetColors, ...appearanceState.colors };
    if (effectiveThemeMode === "high-contrast") {
      return { ...merged, ...HIGH_CONTRAST_COLORS };
    }
    return merged;
  }, [appearanceState.colors, appearanceState.preset, effectiveThemeMode]);

  const resolvedTypography = useMemo(() => ({
    fontFamily: FONT_FAMILIES[appearanceState.typography.fontFamily] || FONT_FAMILIES.default,
    fontSize: FONT_SIZE_SCALE[appearanceState.typography.fontSize] || FONT_SIZE_SCALE.medium,
    lineSpacing: LINE_HEIGHT_SCALE[appearanceState.typography.lineSpacing] || LINE_HEIGHT_SCALE.normal,
  }), [appearanceState.typography.fontFamily, appearanceState.typography.fontSize, appearanceState.typography.lineSpacing]);

  const resolvedDensity = useMemo(() => DENSITY_MAP[appearanceState.layoutDensity] || DENSITY_MAP.comfortable, [appearanceState.layoutDensity]);
  const resolvedRadius = useMemo(() => RADIUS_MAP[appearanceState.borderStyle] || RADIUS_MAP.soft, [appearanceState.borderStyle]);

  const resolvedMotion = useMemo(() => ({
    animationsEnabled: appearanceState.motion.animations !== false,
    reduced: appearanceState.motion.reducedMotion || systemMotion,
  }), [appearanceState.motion.animations, appearanceState.motion.reducedMotion, systemMotion]);

  const cssVariables = useMemo(() => ({
    "--color-primary": resolvedColors.primary,
    "--color-secondary": resolvedColors.secondary,
    "--color-accent": resolvedColors.accent,
    "--color-bg": resolvedColors.background,
    "--color-card": resolvedColors.card,
    "--color-text": resolvedColors.text,
    "--font-family": resolvedTypography.fontFamily,
    "--font-size-base": resolvedTypography.fontSize,
    "--line-height": resolvedTypography.lineSpacing,
    "--border-radius": resolvedRadius,
    "--button-padding-y": resolvedDensity.buttonY,
    "--button-padding-x": resolvedDensity.buttonX,
    "--card-padding": resolvedDensity.cardPadding,
    "--list-gap": resolvedDensity.listGap,
    "--table-row-height": resolvedDensity.rowHeight,
    "--overlay-color": effectiveThemeMode === "dark" ? "rgba(15,23,42,0.6)" : "rgba(15,23,42,0.35)",
    "--primary": resolvedColors.primary,
    "--primary-border": resolvedColors.secondary,
    "--primary-contrast": resolvedColors.text,
    "--motion-duration": resolvedMotion.animationsEnabled ? "250ms" : "0ms",
  }), [resolvedColors, resolvedTypography, resolvedRadius, resolvedDensity, effectiveThemeMode, resolvedMotion.animationsEnabled]);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const root = document.documentElement;
    Object.entries(cssVariables).forEach(([token, value]) => {
      root.style.setProperty(token, value);
    });
    root.dataset.themeMode = effectiveThemeMode;
    root.dataset.appearanceDensity = appearanceState.layoutDensity;
    root.dataset.appearanceRadius = appearanceState.borderStyle;
    root.dataset.backgroundMode = appearanceState.backgroundMode;
    root.dataset.motionPreference = resolvedMotion.reduced ? "reduced" : "full";
    return () => {
      Object.keys(cssVariables).forEach((token) => {
        root.style.removeProperty(token);
      });
    };
  }, [cssVariables, effectiveThemeMode, appearanceState.layoutDensity, appearanceState.borderStyle, appearanceState.backgroundMode, resolvedMotion.reduced]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(appearanceState));
    } catch (err) {
      console.warn("Failed to persist appearance settings", err);
    }
  }, [appearanceState]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(CUSTOM_PRESET_STORAGE_KEY, JSON.stringify(customPresets));
    } catch (err) {
      console.warn("Failed to persist custom appearance presets", err);
    }
  }, [customPresets]);

  const appearancePresets = useMemo(() => [...presetList, ...customPresets], [customPresets]);

  const updateAppearance = useCallback((updates) => {
    setAppearanceState((prev) => mergeAppearance(prev, updates));
  }, []);

  const resetAppearance = useCallback((presetKey = "default") => {
    const preset = appearancePresets.find(item => item.key === presetKey) || APPEARANCE_PRESETS.default;
    setAppearanceState(() => sanitizeAppearance({ ...preset.state, preset: preset.key }));
  }, [appearancePresets]);

  const applyPreset = useCallback((presetKey) => {
    const preset = appearancePresets.find(item => item.key === presetKey) || APPEARANCE_PRESETS[presetKey];
    if (!preset) return;
    setAppearanceState(() => sanitizeAppearance({ ...preset.state, preset: preset.key }));
  }, [appearancePresets]);

  const saveCustomPreset = useCallback((label) => {
    const trimmed = typeof label === "string" ? label.trim() : "";
    if (!trimmed) {
      return { ok: false, reason: "empty" };
    }

    setCustomPresets((prev) => {
      const existingKeys = new Set([
        ...prev.map(item => item.key),
        ...presetList.map(item => item.key),
      ]);
      const baseSlug = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "preset";
      let slug = baseSlug;
      let suffix = 1;
      while (existingKeys.has(slug)) {
        slug = `${baseSlug}-${suffix}`;
        suffix += 1;
      }
      const nextState = sanitizeAppearance({ ...appearanceState, preset: slug });
      const description = `Saved ${new Date().toLocaleDateString()}`;
      const nextPreset = {
        key: slug,
        label: trimmed,
        description,
        state: nextState,
      };
      return [...prev.filter(item => item.key !== slug), nextPreset];
    });

    return { ok: true };
  }, [appearanceState]);

  const hydrateAppearance = useCallback((externalState) => {
    if (!externalState || typeof externalState !== "object") return;
    setAppearanceState(() => sanitizeAppearance(externalState));
  }, []);

  const resolvedAppearance = useMemo(() => ({
    mode: effectiveThemeMode,
    colors: resolvedColors,
    typography: resolvedTypography,
    density: resolvedDensity,
    borderRadius: resolvedRadius,
    backgroundMode: appearanceState.backgroundMode,
    motion: resolvedMotion,
  }), [effectiveThemeMode, resolvedColors, resolvedTypography, resolvedDensity, resolvedRadius, appearanceState.backgroundMode, resolvedMotion]);

  return (
    <AppearanceContext.Provider
      value={{
        appearanceState,
        resolvedAppearance,
        updateAppearance,
        resetAppearance,
        applyPreset,
        hydrateAppearance,
        appearancePresets,
        customPresets,
        saveCustomPreset,
        effectiveThemeMode,
      }}
    >
      {children}
    </AppearanceContext.Provider>
  );
}

export function useAppearance() {
  return useContext(AppearanceContext);
}
