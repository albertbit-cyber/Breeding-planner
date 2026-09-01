import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

/**
 * Appearance / skin provider.
 *
 * Colors no longer live here. They live in
 * `breeding-app-shared/src/styles/skins.css`, one `[data-skin="…"]` block per
 * skin, and this provider's only job on the color side is to write
 * `data-skin` + `data-theme-mode` onto <html>. Everything that is genuinely
 * dynamic — typography, density, radius, motion, persistence, and the user's
 * own color overrides — still lives here.
 *
 * The invariant the whole system rests on: a hex literal outside skins.css is
 * a bug.
 */

const APPEARANCE_STORAGE_KEY = "breedingPlannerAppearance.v1";
const CUSTOM_PRESET_STORAGE_KEY = "breedingPlannerCustomPresets.v1";

/** Bumped from 1 when colors moved out of JS. See migrateAppearance(). */
export const APPEARANCE_VERSION = 2;

/* ── Skins ──────────────────────────────────────────────────────────────────
   `key` MUST match a [data-skin="…"] block in skins.css exactly. `tone` drives
   the grouped picker — sixteen entries is too many for a flat radio list.     */
export const APPEARANCE_PRESETS = {
  default: {
    key: "default", tone: "default", label: "Default",
    description: "The original sky-blue interface.",
  },
  jungleGlass: {
    key: "jungle-glass", tone: "dark", label: "Jungle Glass",
    description: "Moss green drifting into deep teal, with translucent panels.",
  },
  mossMist: {
    key: "moss-mist", tone: "dark", label: "Moss & Mist",
    description: "Desaturated sage on warm slate green. Softest contrast.",
  },
  rainforestNight: {
    key: "rainforest-night", tone: "dark", label: "Rainforest Night",
    description: "Deep blue-green with a cool cyan read.",
  },
  fernClay: {
    key: "fern-clay", tone: "dark", label: "Fern & Clay",
    description: "Olive base with terracotta warmth.",
  },
  emeraldBrass: {
    key: "emerald-brass", tone: "dark", label: "Emerald & Brass",
    description: "The darkest option, with restrained brass accents.",
  },
  marshDusk: {
    key: "marsh-dusk", tone: "dark", label: "Marsh Dusk",
    description: "Cool grey-plum shell so the moss accents carry the colour.",
  },
  slateBotanical: {
    key: "slate-botanical", tone: "dark", label: "Slate Botanical",
    description: "Neutral blue-grey chrome, chartreuse for data. Most tool-like.",
  },
  bambooDaylight: {
    key: "bamboo-daylight", tone: "light", label: "Bamboo Daylight",
    description: "Light: paper-warm ground, deep green ink, no glare.",
  },
  sandstoneVivarium: {
    key: "sandstone-vivarium", tone: "light", label: "Sandstone Vivarium",
    description: "Light: sand ground, bark browns, one leaf-green accent.",
  },

  /* Added in v2. Each covers an axis the original set didn't. */
  highContrastForest: {
    key: "high-contrast-forest", tone: "dark", label: "High contrast",
    description: "Held to AAA (7:1) on every text pair. Replaces the old high-contrast mode.",
    accessibility: true,
  },
  nocturneAmber: {
    key: "nocturne-amber", tone: "dark", label: "Nocturne Amber",
    description: "Low blue light, for evening and night work.",
  },
  graphiteNeutral: {
    key: "graphite-neutral", tone: "dark", label: "Graphite",
    description: "Zero-hue shell so photos and morph colours read true.",
  },
  obsidianCanopy: {
    key: "obsidian-canopy", tone: "dark", label: "Obsidian Canopy",
    description: "Near-black, for OLED screens and battery.",
  },
  glasshouseMint: {
    key: "glasshouse-mint", tone: "light", label: "Glasshouse Mint",
    description: "Light: cool mint ground with a clear green accent.",
  },
  fieldDaylight: {
    key: "field-daylight", tone: "light", label: "Field Daylight",
    description: "Light: high contrast for bright sunlight and outdoor use.",
    accessibility: true,
  },
};

const presetList = Object.values(APPEARANCE_PRESETS);
const SKIN_IDS = new Set(presetList.map((p) => p.key));

/* ── Materials ──────────────────────────────────────────────────────────────
   A second, orthogonal axis: <html data-skin="…" data-material="…">.
   Colour is a skin; texture, depth, radius, bevel and type are a material.
   A four-layer shadow cannot live in a --sk-* value, which is why this is not
   just more skins. See breeding-app-shared/src/styles/materials.css.

   `flat` has no [data-material] block on purpose — it lands on the :root
   fallback, which reproduces the current appearance exactly.               */
export const MATERIALS = {
  flat:           { key: "flat",            label: "Flat",                 tone: "surface", description: "No texture. The current appearance." },
  vellum:         { key: "vellum",          label: "Vellum & Letterpress", tone: "paper",   description: "Type pressed into paper. Calmest for long sessions." },
  terrariumGlass: { key: "terrarium-glass", label: "Terrarium Glass",      tone: "surface", description: "Lit and shadowed pane edges." },
  vitrine:        { key: "vitrine",         label: "Museum Vitrine",       tone: "paper",   description: "Brass frame, linen mount, spotlight." },
  blueprint:      { key: "blueprint",       label: "Botanical Blueprint",  tone: "surface", description: "Cyanotype with tracing-paper overlays." },
  rattan:         { key: "rattan",          label: "Woven Rattan",         tone: "paper",   description: "Interlaced warp and weft." },
};

const materialList = Object.values(MATERIALS);
const MATERIAL_IDS = new Set(materialList.map((m) => m.key));

/**
 * Which material/skin pairs may be offered.
 *
 * 96 pairs exist; 81 ship. The blocked ones are not arbitrary:
 *  - glass and blueprint take their depth from LIGHT edges against a dark
 *    ground, so on a light skin they collapse to flat panels while still
 *    costing contrast — worse than `flat`.
 *  - on `high-contrast-forest` only `flat` survives. Texture, translucency
 *    and soft shadow all reduce effective contrast, so every textured
 *    material fights the one job that skin exists to do. The two that used
 *    to survive it (soapstone, basalt) were opaque-bevel materials; with
 *    them removed the AAA skin is deliberately flat-only.
 *
 * Mirrors POLICY in __tests__/materials.compat.test.js, which asserts that the
 * table and materials.css agree on the material list.
 */
const MATERIAL_POLICY = {
  "flat":            { dark: "ok",     light: "ok",     hc: "ok" },
  "vellum":          { dark: "review", light: "ok",     hc: "no" },
  "terrarium-glass": { dark: "ok",     light: "no",     hc: "no" },
  "vitrine":         { dark: "ok",     light: "review", hc: "no" },
  "blueprint":       { dark: "ok",     light: "no",     hc: "no" },
  "rattan":          { dark: "review", light: "ok",     hc: "no" },
};

const HC_SKINS = new Set(["high-contrast-forest"]);

function skinKind(skinId) {
  if (HC_SKINS.has(skinId)) return "hc";
  const preset = presetList.find((p) => p.key === skinId);
  return preset?.tone === "light" || skinId === "default" ? "light" : "dark";
}

/** Materials that may be offered for a skin, in declaration order. */
export function getAllowedMaterials(skinId) {
  const kind = skinKind(skinId);
  return materialList.filter((m) => MATERIAL_POLICY[m.key]?.[kind] !== "no");
}

/** True when the pair ships as-is; `review` pairs are offered but flagged. */
export function materialStatus(materialId, skinId) {
  return MATERIAL_POLICY[materialId]?.[skinKind(skinId)] || "no";
}

/** Used when themeMode resolves the palette instead of an explicit skin. */
const SYSTEM_LIGHT_SKIN = "default";
const SYSTEM_DARK_SKIN = "deep-canopy";

/* ── Non-color settings (still genuinely dynamic) ───────────────────────── */

const FONT_FAMILIES = {
  default: "'Space Grotesk', 'Segoe UI', system-ui, -apple-system, sans-serif",
  inter: "'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif",
  roboto: "'Roboto', 'Segoe UI', system-ui, -apple-system, sans-serif",
  opensans: "'Open Sans', 'Segoe UI', system-ui, -apple-system, sans-serif",
  serif: "'Cormorant Garamond', 'Georgia', 'Times New Roman', serif",
  mono: "'IBM Plex Mono', 'SFMono-Regular', Consolas, Menlo, monospace",
};

const FONT_SIZE_SCALE = { small: "14px", medium: "16px", large: "18px", xlarge: "20px" };
const LINE_HEIGHT_SCALE = { compact: 1.35, normal: 1.6, relaxed: 1.8 };

/**
 * Audit R9. "high-contrast" is no longer a theme mode.
 *
 * It used to multiply over whatever skin was active, which meant it dropped
 * the canvas to #000000 while the rest of the palette stayed where it was —
 * on some bases that produced literal black-on-black, so the mode that exists
 * for low vision produced the least readable screen in the product. A modifier
 * can always land on a palette that defeats it; a skin cannot.
 *
 * It is now the `high-contrast-forest` skin, held to 7:1 (AAA) by the contrast
 * test, with `field-daylight` as its light counterpart.
 */
const THEME_MODES = ["system", "light", "dark"];
export const HIGH_CONTRAST_SKIN = "high-contrast-forest";
const DENSITIES = ["compact", "comfortable", "spacious"];
const RADII = ["sharp", "soft", "rounded"];
const BACKGROUND_MODES = ["solid", "logo"];

const DEFAULT_APPEARANCE = {
  version: APPEARANCE_VERSION,
  preset: "default",
  material: "flat",
  themeMode: "system",
  /** Sparse: only roles the user has explicitly overridden. Empty by default. */
  colorOverrides: {},
  typography: {
    fontFamily: "default",
    headingFontFamily: "inherit",
    fontSize: "medium",
    lineSpacing: "normal",
  },
  layoutDensity: "comfortable",
  borderStyle: "soft",
  backgroundMode: "solid",
  motion: { animations: true, reducedMotion: false },
};

/* ── Color overrides ────────────────────────────────────────────────────────
   The six pickers write skin roles directly. `secondary` had no real role in
   the old system — App.css:1009 was misusing it as a button border — so it now
   maps to the border-strong role, which is what it was actually doing.        */
export const COLOR_PICKERS = [
  { key: "background", roles: ["--sk-bg", "--sk-bg-2"] },
  { key: "card", roles: ["--sk-surface", "--sk-surface-raised"] },
  { key: "text", roles: ["--sk-text"] },
  { key: "primary", roles: ["--sk-primary"] },
  { key: "secondary", roles: ["--sk-border-strong"] },
  { key: "accent", roles: ["--sk-accent"] },
];

const PICKER_KEYS = new Set(COLOR_PICKERS.map((p) => p.key));
const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/* ── Contrast guard ─────────────────────────────────────────────────────────
   sanitizeAppearance used to validate shape only, which is how a user could
   save — and cloud-sync — an unreadable preset. These are the same two pairs
   the CI contrast test enforces on skins.                                     */

const channel = (c) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};

export function luminance(hex) {
  const h = hex.replace("#", "");
  const n = h.length === 3 ? h.split("").map((x) => x + x).join("") : h;
  return (
    0.2126 * channel(parseInt(n.slice(0, 2), 16)) +
    0.7152 * channel(parseInt(n.slice(2, 4), 16)) +
    0.0722 * channel(parseInt(n.slice(4, 6), 16))
  );
}

export function contrastRatio(a, b) {
  const l1 = luminance(a);
  const l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/** Reads a resolved skin role off <html>, so guards compare against what the
 *  active skin actually renders rather than against a hardcoded assumption. */
function readRole(role, fallback) {
  if (typeof window === "undefined" || typeof getComputedStyle !== "function") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(role).trim();
  return HEX.test(v) ? v : fallback;
}

/**
 * Validates a proposed set of picker values against the roles they would sit
 * on. Returns `{ ok }` or `{ ok: false, reason, ratio, required }`.
 */
export function checkColorContrast(next = {}, current = {}) {
  const merged = { ...current, ...next };
  const surface = merged.card || readRole("--sk-surface", "#ffffff");
  const text = merged.text || readRole("--sk-text", "#171717");
  const primary = merged.primary || readRole("--sk-primary", "#0ea5e9");
  const onAccent = readRole("--sk-text-on-accent", "#ffffff");

  const bodyRatio = contrastRatio(text, surface);
  if (bodyRatio < 4.5) {
    return {
      ok: false, reason: "text-on-surface", ratio: bodyRatio, required: 4.5,
      message: "Body text would not be readable on the card colour.",
    };
  }

  const accentRatio = contrastRatio(onAccent, primary);
  if (accentRatio < 4.5) {
    return {
      ok: false, reason: "text-on-accent", ratio: accentRatio, required: 4.5,
      message: "Button labels would not be readable on the primary colour.",
    };
  }

  return { ok: true };
}

/* ── Sanitize / migrate ─────────────────────────────────────────────────── */

function sanitizeColorOverrides(raw) {
  if (!raw || typeof raw !== "object") return {};
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    if (PICKER_KEYS.has(key) && typeof value === "string" && HEX.test(value.trim())) {
      out[key] = value.trim().toLowerCase();
    }
  }
  return out;
}

/**
 * v1 state carried a full `colors` object and one of seven preset names.
 * None of those names survive: `minimal`, `highContrast`, `visualImpaired`,
 * `darkBreeder`, `editorial`, `softPastel` are retired. Anything unrecognised
 * falls back to `default`, which also covers stale cloud-synced state and
 * hand-edited localStorage.
 *
 * `highContrast` is the one case with a real successor — it becomes the
 * orthogonal high-contrast theme mode rather than vanishing, so users who
 * relied on it for legibility are not silently dropped onto `default`.
 */
function migrateAppearance(raw) {
  if (!raw || typeof raw !== "object") return {};
  if (raw.version === APPEARANCE_VERSION) return raw;

  const next = { ...raw, version: APPEARANCE_VERSION };

  // The retired accessibility presets, and any state still carrying the
  // retired "high-contrast" theme mode, land on the AAA skin rather than on
  // `default` — dropping a low-vision user onto a mid-contrast palette is the
  // one migration that costs someone something real.
  if (raw.preset === "highContrast" || raw.preset === "visualImpaired"
      || raw.themeMode === "high-contrast") {
    next.preset = HIGH_CONTRAST_SKIN;
    next.themeMode = "dark";
  } else {
    // Only reached when the block above did not already choose a skin. It used
    // to run unconditionally and clobbered HIGH_CONTRAST_SKIN on the very next
    // line, which silently undid the one migration that costs someone
    // something real — the case the comment above exists to protect.
    next.preset = SKIN_IDS.has(raw.preset) ? raw.preset : "default";
  }

  // v1 `colors` was a full palette, not a sparse override set. It described the
  // old presets rather than a user's intent, so it is dropped rather than
  // reinterpreted — guessing which jungle skin someone wanted is worse than
  // starting them clean.
  delete next.colors;
  next.colorOverrides = {};

  return next;
}

/**
 * Retired skins and materials, and what replaces them.
 *
 * These are applied in sanitizeAppearance, NOT in migrateAppearance: a state
 * saved before the removal still carries the CURRENT version number, so
 * migrateAppearance early-returns and never sees it. Every read goes through
 * sanitize, so that is the only place a retirement is guaranteed to be caught.
 *
 * Skins map to their nearest surviving neighbour rather than to `default`,
 * which is light — bouncing someone off a dark skin onto a light one is a
 * worse outcome than a slightly different green.
 */
const RETIRED_SKINS = {
  "deep-canopy":   "moss-mist",   // both calm single-note greens
  "copper-canopy": "fern-clay",   // both olive with a warm metal accent
};

/** Only `journal` has a surviving same-tone match; the four surface materials
 *  were all opaque-bevel/sheen looks with no equivalent left, so they land on
 *  `flat`, which is honest rather than approximate. */
const RETIRED_MATERIALS = {
  journal:        "vellum",
  soapstone:      "flat",
  basalt:         "flat",
  "moss-relief":  "flat",
  lacquer:        "flat",
};

function resolveRetiredSkin(preset, fallback) {
  const mapped = RETIRED_SKINS[preset] || preset;
  return SKIN_IDS.has(mapped) ? mapped : fallback;
}

function resolveRetiredMaterial(material, preset, base) {
  const mapped = RETIRED_MATERIALS[material] || material;
  const resolved = MATERIAL_IDS.has(mapped) ? mapped : base.material;
  // A replacement still has to be legal on the skin it lands next to —
  // journal → vellum is fine on a light skin but blocked on the AAA one.
  // materialStatus falls back to the flat default, never to something worse.
  const skin = resolveRetiredSkin(preset, base.preset);
  return materialStatus(resolved, skin) === "no" ? base.material : resolved;
}

export function sanitizeAppearance(raw = {}) {
  const incoming = migrateAppearance(typeof raw === "object" && raw !== null ? raw : {});
  const base = DEFAULT_APPEARANCE;
  const typography = { ...base.typography, ...(incoming.typography || {}) };
  const motion = { ...base.motion, ...(incoming.motion || {}) };

  return {
    version: APPEARANCE_VERSION,
    preset: resolveRetiredSkin(incoming.preset, base.preset),
    material: resolveRetiredMaterial(incoming.material, incoming.preset, base),
    themeMode: THEME_MODES.includes(incoming.themeMode) ? incoming.themeMode : base.themeMode,
    colorOverrides: sanitizeColorOverrides(incoming.colorOverrides),
    typography: {
      fontFamily: FONT_FAMILIES[typography.fontFamily] ? typography.fontFamily : base.typography.fontFamily,
      headingFontFamily:
        typography.headingFontFamily === "inherit" || FONT_FAMILIES[typography.headingFontFamily]
          ? typography.headingFontFamily
          : "inherit",
      fontSize: FONT_SIZE_SCALE[typography.fontSize] ? typography.fontSize : base.typography.fontSize,
      lineSpacing: LINE_HEIGHT_SCALE[typography.lineSpacing] ? typography.lineSpacing : base.typography.lineSpacing,
    },
    layoutDensity: DENSITIES.includes(incoming.layoutDensity) ? incoming.layoutDensity : base.layoutDensity,
    borderStyle: RADII.includes(incoming.borderStyle) ? incoming.borderStyle : base.borderStyle,
    backgroundMode: BACKGROUND_MODES.includes(incoming.backgroundMode) ? incoming.backgroundMode : base.backgroundMode,
    motion: {
      animations: motion.animations !== false,
      reducedMotion: motion.reducedMotion === true,
    },
  };
}

function mergeAppearance(base, updates = {}) {
  const sanitizedBase = sanitizeAppearance(base);
  return sanitizeAppearance({
    ...sanitizedBase,
    ...updates,
    colorOverrides: { ...sanitizedBase.colorOverrides, ...(updates.colorOverrides || {}) },
    typography: { ...sanitizedBase.typography, ...(updates.typography || {}) },
    motion: { ...sanitizedBase.motion, ...(updates.motion || {}) },
  });
}

/**
 * sanitizeAppearance always allocates, so a no-op hydrate still produced a new
 * object identity. That is enough to loop: the planner snapshot in App.jsx
 * memoises on `appearanceState`, and it feeds the sync round-trip that calls
 * hydrateAppearance again — new identity, recompute, hydrate, forever
 * ("Maximum update depth exceeded").
 *
 * Every setter below routes through this, so a state change that changes
 * nothing keeps the previous object and the cycle cannot start. Key order is
 * fixed by sanitizeAppearance, so stringify is a sound comparison here.
 */
function preserveIfUnchanged(prev, next) {
  try {
    return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
  } catch {
    return next;
  }
}

/* ── Custom presets ─────────────────────────────────────────────────────── */

function sanitizeCustomPresetEntry(entry) {
  if (!entry || typeof entry !== "object") return null;
  const key = typeof entry.key === "string" && entry.key.trim() ? entry.key.trim() : null;
  const label = typeof entry.label === "string" && entry.label.trim() ? entry.label.trim() : null;
  if (!key || !label) return null;
  return {
    key,
    label,
    description:
      typeof entry.description === "string" && entry.description.trim()
        ? entry.description.trim()
        : "Custom preset",
    /** A custom preset is a base skin plus overrides — not a full palette. */
    state: sanitizeAppearance(entry.state || {}),
  };
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

function loadStoredAppearance() {
  if (typeof window === "undefined") return DEFAULT_APPEARANCE;
  try {
    const raw = window.localStorage.getItem(APPEARANCE_STORAGE_KEY);
    if (!raw) return DEFAULT_APPEARANCE;
    return sanitizeAppearance(JSON.parse(raw));
  } catch (err) {
    console.warn("Failed to read appearance settings", err);
    return DEFAULT_APPEARANCE;
  }
}

function getInitialSystemTheme() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getInitialSystemMotion() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Resolves which [data-skin] block should be active.
 *
 * The skin picker is the light/dark choice — each block declares its own
 * `color-scheme`. themeMode therefore only decides the palette for users who
 * have never picked a skin, which keeps "Match system" working for the
 * majority who never open the appearance panel. An explicit skin always wins.
 */
export function resolveSkinId(preset, themeMode, systemTheme) {
  if (preset && preset !== "default" && SKIN_IDS.has(preset)) return preset;
  const effective = themeMode === "system" ? systemTheme : themeMode;
  if (effective === "dark") return SYSTEM_DARK_SKIN;
  return SYSTEM_LIGHT_SKIN;
}

/* ── Context ────────────────────────────────────────────────────────────── */

const AppearanceContext = createContext({
  appearanceState: DEFAULT_APPEARANCE,
  resolvedAppearance: {
    mode: "light",
    skinId: "default",
    typography: DEFAULT_APPEARANCE.typography,
    motion: { animationsEnabled: true, reduced: false },
  },
  updateAppearance: () => {},
  resetAppearance: () => {},
  applyMaterial: () => {},
  allowedMaterials: [],
  applyPreset: () => {},
  hydrateAppearance: () => {},
  setColorOverride: () => ({ ok: false }),
  clearColorOverrides: () => {},
  appearancePresets: presetList,
  customPresets: [],
  saveCustomPreset: () => ({ ok: false }),
  effectiveThemeMode: "light",
  skinId: "default",
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
    if (typeof media.addEventListener === "function") media.addEventListener("change", handler);
    else if (typeof media.addListener === "function") media.addListener(handler);
    return () => {
      if (typeof media.removeEventListener === "function") media.removeEventListener("change", handler);
      else if (typeof media.removeListener === "function") media.removeListener(handler);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = (event) => setSystemMotion(event.matches);
    if (typeof media.addEventListener === "function") media.addEventListener("change", handler);
    else if (typeof media.addListener === "function") media.addListener(handler);
    return () => {
      if (typeof media.removeEventListener === "function") media.removeEventListener("change", handler);
      else if (typeof media.removeListener === "function") media.removeListener(handler);
    };
  }, []);

  const effectiveThemeMode = appearanceState.themeMode === "system" ? systemTheme : appearanceState.themeMode;
  const skinId = useMemo(
    () => resolveSkinId(appearanceState.preset, appearanceState.themeMode, systemTheme),
    [appearanceState.preset, appearanceState.themeMode, systemTheme],
  );

  const resolvedTypography = useMemo(() => {
    const fontFamily = FONT_FAMILIES[appearanceState.typography.fontFamily] || FONT_FAMILIES.default;
    const headingKey = appearanceState.typography.headingFontFamily || "inherit";
    return {
      fontFamily,
      headingFontFamily: headingKey === "inherit" ? fontFamily : FONT_FAMILIES[headingKey] || fontFamily,
      fontSize: FONT_SIZE_SCALE[appearanceState.typography.fontSize] || FONT_SIZE_SCALE.medium,
      lineSpacing: LINE_HEIGHT_SCALE[appearanceState.typography.lineSpacing] || LINE_HEIGHT_SCALE.normal,
    };
  }, [appearanceState.typography]);

  const resolvedMotion = useMemo(
    () => ({
      animationsEnabled: appearanceState.motion.animations !== false,
      reduced: appearanceState.motion.reducedMotion || systemMotion,
    }),
    [appearanceState.motion.animations, appearanceState.motion.reducedMotion, systemMotion],
  );

  /**
   * Non-color variables only. The palette arrives via [data-skin] in skins.css;
   * writing colors here would defeat the whole arrangement.
   */
  const cssVariables = useMemo(
    () => ({
      "--font-family": resolvedTypography.fontFamily,
      "--font-family-heading": resolvedTypography.headingFontFamily,
      "--font-size-base": resolvedTypography.fontSize,
      "--line-height": String(resolvedTypography.lineSpacing),
      "--motion-duration": resolvedMotion.animationsEnabled ? "250ms" : "0ms",
    }),
    [resolvedTypography, resolvedMotion.animationsEnabled],
  );

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const root = document.documentElement;

    Object.entries(cssVariables).forEach(([token, value]) => root.style.setProperty(token, value));

    root.dataset.skin = skinId;
    root.dataset.material = appearanceState.material || "flat";
    root.dataset.themeMode = effectiveThemeMode;
    root.dataset.appearanceDensity = appearanceState.layoutDensity;
    root.dataset.appearanceRadius = appearanceState.borderStyle;
    root.dataset.backgroundMode = appearanceState.backgroundMode;
    root.dataset.motionPreference = resolvedMotion.reduced ? "reduced" : "full";

    return () => {
      Object.keys(cssVariables).forEach((token) => root.style.removeProperty(token));
    };
  }, [
    cssVariables,
    skinId,
    appearanceState.material,
    effectiveThemeMode,
    appearanceState.layoutDensity,
    appearanceState.borderStyle,
    appearanceState.backgroundMode,
    resolvedMotion.reduced,
  ]);

  /**
   * User color overrides are written as inline --sk-* on <html>. Inline style
   * beats the stylesheet, so an override layers cleanly on whichever skin is
   * active and disappears the moment it is cleared.
   */
  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const root = document.documentElement;
    const written = [];

    for (const picker of COLOR_PICKERS) {
      const value = appearanceState.colorOverrides[picker.key];
      if (!value) continue;
      for (const role of picker.roles) {
        root.style.setProperty(role, value);
        written.push(role);
      }
    }

    return () => written.forEach((role) => root.style.removeProperty(role));
  }, [appearanceState.colorOverrides]);

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
    setAppearanceState((prev) => preserveIfUnchanged(prev, mergeAppearance(prev, updates)));
  }, []);

  /** Guarded: refuses an override that would make text or button labels unreadable. */
  const setColorOverride = useCallback(
    (key, value) => {
      if (!PICKER_KEYS.has(key)) return { ok: false, reason: "unknown-role" };
      if (typeof value !== "string" || !HEX.test(value.trim())) return { ok: false, reason: "invalid-hex" };

      const next = value.trim().toLowerCase();
      const check = checkColorContrast(
        { [key]: next },
        appearanceState.colorOverrides,
      );
      if (!check.ok) return check;

      setAppearanceState((prev) =>
        preserveIfUnchanged(prev, mergeAppearance(prev, { colorOverrides: { ...prev.colorOverrides, [key]: next } })),
      );
      return { ok: true };
    },
    [appearanceState.colorOverrides],
  );

  const clearColorOverrides = useCallback(() => {
    setAppearanceState((prev) => preserveIfUnchanged(prev, sanitizeAppearance({ ...prev, colorOverrides: {} })));
  }, []);

  const applyPreset = useCallback(
    (presetKey) => {
      const custom = customPresets.find((item) => item.key === presetKey);
      if (custom) {
        setAppearanceState((prev) => preserveIfUnchanged(prev, sanitizeAppearance(custom.state)));
        return;
      }
      if (!SKIN_IDS.has(presetKey)) return;
      setAppearanceState((prev) => {
        // Switching skin can make the active material a blocked pair (e.g.
        // lacquer on a light skin). Drop to `flat` rather than render a
        // combination the policy table says must not ship.
        const keepMaterial = getAllowedMaterials(presetKey).some((m) => m.key === prev.material);
        return preserveIfUnchanged(prev, sanitizeAppearance({
          ...prev,
          preset: presetKey,
          material: keepMaterial ? prev.material : "flat",
          colorOverrides: {},
        }));
      });
    },
    [customPresets],
  );

  const resetAppearance = useCallback(
    (presetKey = "default") => {
      setAppearanceState((prev) =>
        preserveIfUnchanged(
          prev,
          sanitizeAppearance({ ...DEFAULT_APPEARANCE, preset: SKIN_IDS.has(presetKey) ? presetKey : "default" }),
        ),
      );
    },
    [],
  );

  const saveCustomPreset = useCallback(
    (label) => {
      const trimmed = typeof label === "string" ? label.trim() : "";
      if (!trimmed) return { ok: false, reason: "empty" };

      setCustomPresets((prev) => {
        const taken = new Set([...prev.map((i) => i.key), ...presetList.map((i) => i.key)]);
        const baseSlug =
          trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "preset";
        let slug = baseSlug;
        let suffix = 1;
        while (taken.has(slug)) {
          slug = `${baseSlug}-${suffix}`;
          suffix += 1;
        }
        return [
          ...prev,
          {
            key: slug,
            label: trimmed,
            description: `Saved ${new Date().toLocaleDateString()}`,
            state: sanitizeAppearance(appearanceState),
          },
        ];
      });

      return { ok: true };
    },
    [appearanceState],
  );

  const applyMaterial = useCallback((materialId) => {
    if (!MATERIAL_IDS.has(materialId)) return;
    setAppearanceState((prev) => preserveIfUnchanged(prev, sanitizeAppearance({ ...prev, material: materialId })));
  }, []);

  const allowedMaterials = useMemo(() => getAllowedMaterials(skinId), [skinId]);

  const hydrateAppearance = useCallback((externalState) => {
    if (!externalState || typeof externalState !== "object") return;
    setAppearanceState((prev) => preserveIfUnchanged(prev, sanitizeAppearance(externalState)));
  }, []);

  const resolvedAppearance = useMemo(
    () => ({
      mode: effectiveThemeMode,
      skinId,
      material: appearanceState.material || "flat",
      typography: resolvedTypography,
      backgroundMode: appearanceState.backgroundMode,
      motion: resolvedMotion,
    }),
    [effectiveThemeMode, skinId, appearanceState.material, resolvedTypography, appearanceState.backgroundMode, resolvedMotion],
  );

  return (
    <AppearanceContext.Provider
      value={{
        appearanceState,
        resolvedAppearance,
        updateAppearance,
        resetAppearance,
        applyPreset,
        applyMaterial,
        allowedMaterials,
        hydrateAppearance,
        setColorOverride,
        clearColorOverrides,
        appearancePresets,
        customPresets,
        saveCustomPreset,
        effectiveThemeMode,
        skinId,
      }}
    >
      {children}
    </AppearanceContext.Provider>
  );
}

export function useAppearance() {
  return useContext(AppearanceContext);
}
