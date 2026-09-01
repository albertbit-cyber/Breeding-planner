# Theming / Skinning Retrofit Audit

**Repo:** `Breeding-planner` (monorepo of 5 frontends + 1 backend)
**Worktree:** `.claude/worktrees/appearance-theming` — branch `feature/appearance-theming`, based on `main` @ `9f1fb3b`
**Date:** 2026-08-23
**Scope:** read-only audit. No code was changed.

---

## 0. Executive summary

The app **already has a runtime skinning system** — `AppearanceContext.jsx` — with 7 presets, a
user-facing designer UI, custom-preset saving, density/radius/motion controls, and a documented token
contract in `VISUAL_LANGUAGE.md`. That is the good news.

The bad news is that **almost nothing consumes it**. In the breeder app, 2,433 Tailwind utility classes
name a literal palette color (`bg-white`, `text-neutral-500`, `text-rose-600`), and 3,525 lines of
`App.css` carry 388 hardcoded color literals. The token layer covers the page background, buttons (via
an `!important` sledgehammer), and status badges. Everything else — cards, modals, tables, text
hierarchy, borders, links, focus rings — is hardcoded light-mode.

So this is not a "build a theme system" job. It is a **"connect the ~90% of the UI that ignores the
theme system you already have"** job.

---

## 1. Stack & styling

### 1.1 Framework / build

| App | Framework | Build | Notes |
|---|---|---|---|
| `breeding-app-breeder` | React 18.2 (JS/TS mixed) | Vite 5.4 (`vite.config.mts`) | **primary product.** Also Capacitor 8 Android + Electron shells |
| `breeding-app-admin` | React 18 | Vite 5 | |
| `breeding-app-lab` | React 18 | Vite 5 | Capacitor Android wrapper too |
| `breeding-app-marketplace` | React 18 | Vite 5 | |
| `breeding-app-public` | React 18 | Vite | marketing site (`main.jsx`, not `index.jsx`) |
| `breeding-app-backend` | Node/Express + Prisma | tsc | emits HTML emails |

TypeScript 5.6. No SSR anywhere (`renderToString` / `hydrateRoot` return zero hits repo-wide).

### 1.2 How CSS is authored

**Five systems in use. No CSS Modules, no CSS-in-JS.**

| System | Where | Rough share of breeder UI |
|---|---|---|
| **Tailwind v4 utility classes** (`@tailwindcss/vite`) | `src/App.jsx` (2,114 `className=`), feature components | **~65%** — the dominant system |
| **Global hand-written CSS** | `src/App.css` (3,525 lines), `features/mobile/MobileApp.css` (1,650), `features/familyTree/familyTree.css` | **~25%** |
| **CSS custom properties** injected at runtime | `contexts/AppearanceContext.jsx` → `document.documentElement.style` | **~7%** (37 vars, but few consumers) |
| **Inline `style={{}}`** | 14 files, 36 occurrences in `App.jsx` | **~3%** |
| **Vendor CSS** | `reactflow/dist/style.css` | Family Tree page only |

Only `breeding-app-breeder` has Tailwind. `admin` / `lab` / `marketplace` / `public` are plain global
CSS + inline styles.

`postcss.config.mjs` is empty:
```js
export default { plugins: {} };
```

`src/index.css` (breeder) is 15 lines and contains **no token block at all** — just the Tailwind import
and a body font reset:
```css
@import "tailwindcss";

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', ... sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
```

### 1.3 Is there a theme/token file?

**There is no `tailwind.config.*` anywhere in the repo, and no `@theme` block in any CSS file.**
Tailwind v4 runs on its stock default palette. That is the biggest structural finding: there is no
place where `bg-neutral-50` could be redefined.

There are, however, **four separate token surfaces**:

#### (a) `breeding-app-breeder/src/contexts/AppearanceContext.jsx` — the real system (628 lines)

This is the canonical implementation. Full token definitions, verbatim:

```js
const APPEARANCE_STORAGE_KEY = "breedingPlannerAppearance.v1";
const CUSTOM_PRESET_STORAGE_KEY = "breedingPlannerCustomPresets.v1";

const DEFAULT_STATUS_COLORS = {
  success: { bg: "#f0fdf4", border: "#bbf7d0", text: "#166534" },
  error:   { bg: "#fff1f2", border: "#fecaca", text: "#9f1239" },
  warning: { bg: "#dcfce7", border: "#86efac", text: "#166534" },
  danger:  { bg: "#fee2e2", border: "#fca5a5", text: "#991b1b" },
  neutral: { bg: "#f3f4f6", border: "#d1d5db", text: "#6b7280" },
};

const EDITORIAL_STATUS_COLORS = {
  success: { bg: "#16352c", border: "#235143", text: "#8fd6bd" },
  error:   { bg: "#3a1c1c", border: "#5c2b2b", text: "#e39b9b" },
  warning: { bg: "#362a14", border: "#574019", text: "#e0bc78" },
  danger:  { bg: "#3a1c1c", border: "#5c2b2b", text: "#d98888" },
  neutral: { bg: "#2a2620", border: "#443c30", text: "#a89e8e" },
};

const DEFAULT_APPEARANCE = {
  version: 1,
  preset: "default",
  themeMode: "system",            // system | light | dark | high-contrast
  colors: {
    primary: "#0ea5e9",
    secondary: "#2563eb",
    accent: "#f59e0b",
    background: "#f6f7f9",
    card: "#ffffff",
    text: "#0f172a",
    status: DEFAULT_STATUS_COLORS,
  },
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

const FONT_FAMILIES = {
  default:  "'Space Grotesk', 'Segoe UI', system-ui, -apple-system, sans-serif",
  inter:    "'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif",
  roboto:   "'Roboto', 'Segoe UI', system-ui, -apple-system, sans-serif",
  opensans: "'Open Sans', 'Segoe UI', system-ui, -apple-system, sans-serif",
  serif:    "'Cormorant Garamond', 'Georgia', 'Times New Roman', serif",
  mono:     "'IBM Plex Mono', 'SFMono-Regular', Consolas, Menlo, monospace",
};

const FONT_SIZE_SCALE   = { small: "14px", medium: "16px", large: "18px", xlarge: "20px" };
const LINE_HEIGHT_SCALE = { compact: 1.35, normal: 1.6, relaxed: 1.8 };

const DENSITY_MAP = {
  compact:     { buttonY: "0.35rem", buttonX: "0.85rem", cardPadding: "0.75rem", rowHeight: "2.25rem", listGap: "0.4rem" },
  comfortable: { buttonY: "0.55rem", buttonX: "1rem",    cardPadding: "1.15rem", rowHeight: "2.65rem", listGap: "0.65rem" },
  spacious:    { buttonY: "0.75rem", buttonX: "1.35rem", cardPadding: "1.5rem",  rowHeight: "3.1rem",  listGap: "0.9rem" },
};

const RADIUS_MAP = { sharp: "2px", soft: "8px", rounded: "16px" };

const HIGH_CONTRAST_COLORS = {
  primary: "#ffb100", secondary: "#ffd700", accent: "#ff4d4f",
  background: "#000000", card: "#111111", text: "#ffffff",
  status: DEFAULT_STATUS_COLORS,
};
```

Presets (`APPEARANCE_PRESETS`): `default`, `minimal`, `highContrast`, `visualImpaired`, `darkBreeder`,
`editorial`, `softPastel` — 7 built-in, plus user-saved custom presets.

| Preset | primary | secondary | accent | background | card | text | mode |
|---|---|---|---|---|---|---|---|
| default | `#0ea5e9` | `#2563eb` | `#f59e0b` | `#f6f7f9` | `#ffffff` | `#0f172a` | system |
| minimal | `#0f172a` | `#94a3b8` | `#f97316` | `#fbfbfb` | `#ffffff` | `#0f172a` | light |
| highContrast | `#ffb100` | `#ffd700` | `#ff4d4f` | `#000000` | `#111111` | `#ffffff` | high-contrast |
| visualImpaired | `#005fcc` | `#111827` | `#b45309` | `#ffffff` | `#ffffff` | `#000000` | light |
| darkBreeder | `#12b981` | `#0f172a` | `#ef4444` | `#05070d` | `#111827` | `#e2e8f0` | dark |
| editorial | `#1f5e4e` | `#2b3a52` | `#c8975a` | `#14110f` | `#faf6ef` | `#201b16` | dark |
| softPastel | `#f472b6` | `#a5b4fc` | `#34d399` | `#fef6fb` | `#ffffff` | `#2e1065` | light |

The emitted CSS variable set (`cssVariables`, applied to `document.documentElement`):

```js
"--color-primary", "--color-secondary", "--color-accent",
"--color-bg", "--color-card", "--color-text",
"--status-{success,error,warning,danger,neutral}-{bg,border,text}",   // 15 vars
"--font-family", "--font-family-heading", "--font-size-base", "--line-height",
"--border-radius",
"--button-padding-y", "--button-padding-x", "--card-padding",
"--list-gap", "--table-row-height",
"--overlay-color",     // rgba(15,23,42,0.6) dark / rgba(15,23,42,0.35) light
"--primary", "--primary-border", "--primary-contrast",   // legacy aliases
"--motion-duration",   // 250ms / 0ms
```

Plus five `<html>` data attributes:
```js
root.dataset.themeMode         = effectiveThemeMode;      // light | dark | high-contrast
root.dataset.appearanceDensity = appearanceState.layoutDensity;
root.dataset.appearanceRadius  = appearanceState.borderStyle;
root.dataset.backgroundMode    = appearanceState.backgroundMode;
root.dataset.motionPreference  = resolvedMotion.reduced ? "reduced" : "full";
```

#### (b) `breeding-app-admin/src/admin/admin.css` — a second, disconnected token set (`--a-*`)

```css
:root {
  --a-sidebar-w: 240px;
  --a-sidebar-bg: #0f172a;
  --a-sidebar-text: #94a3b8;
  --a-sidebar-hover: rgba(255,255,255,0.06);
  --a-sidebar-active: rgba(99,102,241,0.18);
  --a-sidebar-active-text: #a5b4fc;
  --a-sidebar-border: rgba(255,255,255,0.07);
  --a-sidebar-group: #475569;

  --a-bg: #f1f5f9;
  --a-surface: #ffffff;
  --a-surface-2: #f8fafc;
  --a-border: #e2e8f0;
  --a-border-strong: #cbd5e1;

  --a-text: #0f172a;
  --a-text-2: #475569;
  --a-text-muted: #94a3b8;

  --a-accent: #6366f1;
  --a-accent-dark: #4f46e5;
  --a-accent-light: #eef2ff;

  --a-danger: #ef4444;
  --a-danger-dark: #dc2626;
  --a-danger-light: #fef2f2;
  --a-success: #22c55e;
  --a-success-light: #f0fdf4;
  --a-warning: #f59e0b;

  --a-radius: 8px;
  --a-radius-lg: 12px;
  --a-shadow-sm: 0 1px 2px rgba(15,23,42,0.06);
  --a-shadow:    0 1px 3px rgba(15,23,42,0.1), 0 1px 2px rgba(15,23,42,0.06);
  --a-shadow-md: 0 4px 6px rgba(15,23,42,0.07), 0 2px 4px rgba(15,23,42,0.06);
  --a-shadow-lg: 0 10px 15px rgba(15,23,42,0.1), 0 4px 6px rgba(15,23,42,0.05);
  --a-t: 0.15s ease;
}
```

This is actually the **best-shaped** token set in the repo (it has surface-2, border-strong, text-2,
text-muted, a shadow scale) but it is completely independent of `AppearanceContext` and lives only in
the admin app.

#### (c) `breeding-app-{admin,lab,marketplace}/src/index.css` — a static `:root` mirror

```css
:root {
  /* Shared visual language tokens — see VISUAL_LANGUAGE.md. Default preset values. */
  --color-primary: #0ea5e9;
  --color-secondary: #2563eb;
  --color-accent: #f59e0b;
  --color-bg: #f6f7f9;
  --color-card: #ffffff;
  --color-text: #0f172a;
  --font-family: 'Space Grotesk', 'Segoe UI', system-ui, -apple-system, sans-serif;
  --border-radius: 8px;
}
```

Note: **the breeder — the app that actually needs these — does NOT have this block.** It relies
entirely on the JS provider writing them at runtime. See blocker #6.

#### (d) `breeding-app-public/src/index.css` — a third, differently-named token set (203 lines)

```css
:root {
  /* Brand */
  /* Shared visual language tokens — see VISUAL_LANGUAGE.md */
  --color-primary: #0ea5e9;
  --color-secondary: #2563eb;
  --color-accent: #f59e0b;
  --color-bg: #f6f7f9;
  --color-card: #ffffff;
  --color-text: #0f172a;
  --font-family: 'Space Grotesk', 'Segoe UI', system-ui, -apple-system, sans-serif;

  --dark:     var(--color-text, #0f172a);
  --dark2:    #1e293b;
  --gold:     var(--color-primary, #0ea5e9);
  --gold-lt:  #e0f2fe;
  --gold-dk:  #075985;

  /* Data cell colors (from actual app screenshot) */
  --feed:     #7ea8a2;
  --weight:   #8fa898;
  --cleaning: #c49282;
  --shed:     #d4b96a;
  --meds:     #b8806a;
  --group:    #f0ece0;

  /* Genetics tag colors */
  --coral:    #d86060;
  --coral-lt: #fbd5d5;
  --coral-dk: #a03030;
  --purple:   #9b65d6;
  --purple-lt:#e8dff8;
  --purple-dk:#5a2896;

  /* Surfaces */
  --bg:       var(--color-bg, #f6f7f9);
  --bg-card:  #ffffff;
  --border:   #e5e0d4;
  --muted:    #7a7265;
  --hint:     #a09888;

  --radius:    8px;
  --radius-lg: 12px;
}
```

#### (e) `VISUAL_LANGUAGE.md` — the written contract (5 copies: breeder, admin, lab, marketplace, public)

It explicitly states the rule the codebase violates:

> "Colors are never referenced by hex value in components — only by role, via CSS custom properties.
> This is what lets end users re-skin the breeder app with presets (see §5) without touching component
> code."

and names the source of truth:

> "The canonical implementation lives in `breeding-app-breeder/src/contexts/AppearanceContext.jsx`. It
> is the only app in the suite with a real design-token system."

### 1.4 Is there already a dark mode / theme switcher?

**Yes — and it is only partially wired.**

- **Switcher UI:** `App.jsx:20122 AppearanceSettingsPanel` (Settings → Appearance tab, mounted at
  `App.jsx:19410`), with live preview at `App.jsx:20442 AppearancePreview`. Offers preset picker,
  6 color pickers, theme mode (system/light/dark/high-contrast), font family, size, line spacing,
  density, border style, background mode, motion toggles, and "save as custom preset".
- **Mechanism:** `AppearanceProvider` computes `effectiveThemeMode` (respecting
  `matchMedia('(prefers-color-scheme: dark)')` and `(prefers-reduced-motion: reduce)`), then writes ~37
  CSS custom properties inline onto `document.documentElement.style` and sets the `data-*` attributes.
- **The gap:** switching to `darkBreeder` changes `--color-bg`, `--color-card`, `--color-text`,
  `--primary`. It does **not** change `bg-white`, `text-neutral-500`, `border-neutral-200`, or any of
  the 388 hex literals in `App.css`. The result is a dark page background with light cards and light
  text utilities on top.

**Dead hooks — attributes written but never read:**

| `<html>` attribute | CSS selectors referencing it |
|---|---|
| `data-theme-mode` | **0** |
| `data-appearance-density` | **0** |
| `data-appearance-radius` | **0** |
| `data-motion-preference` | **0** |
| `data-background-mode` | 1 — `App.css:993 .app-root[data-background-mode="logo"]::before` |

Only 7 JS conditionals in the entire breeder branch on `theme === 'dark'`, and they are all in one
place (`App.jsx:26010-26014`, inside `GeneLine` / `GeneLegend`).

The brute-force compensation is an `!important` layer (63 `!important` in `App.css`):

```css
/* App.css:977 */
.app-root {
  min-height: 100vh;
  position: relative;
  isolation: isolate;
  background-color: var(--color-bg, #f6f7f9) !important;
}

/* App.css:1006 — every button in the app, unconditionally */
.app-root button {
  background: var(--primary) !important;
  color: var(--primary-contrast, #fff) !important;
  border-color: var(--primary-border, transparent) !important;
}
.app-root button[disabled] { opacity: 0.6 !important; }
```

That second rule is why the app "looks themed" — it repaints every `<button>` regardless of intent, and
components then have to opt out (`App.css:1015 .status-tag-menu-button`, `App.css:1021
.status-tag-neutral-button`, with an explanatory comment at `App.jsx:19989`).

---

## 2. Color inventory

### 2.1 Totals

Scope: `*.{jsx,tsx,ts,js,css}` under `src/` of the five frontends (excluding `node_modules`).

| Metric | All 5 frontends | breeder only |
|---|---|---|
| **Total color literals** | **2,125** | 657 |
| **Unique color literals** | **383** | 263 |
| hex occurrences (breeder) | — | 559 (182 unique) |
| `rgb()` / `rgba()` (breeder) | — | 99 (81 unique) |
| `hsl()` / `hsla()` (breeder) | — | 3 (3 unique) |

Per app:

| App | color literals | unique | src files |
|---|---|---|---|
| `breeding-app-breeder` | 657 | 263 | 133 |
| `breeding-app-admin` | 565 | 233 | 42 |
| `breeding-app-marketplace` | 434 | 204 | 28 |
| `breeding-app-lab` | 331 | 165 | 104 |
| `breeding-app-public` | 138 | 77 | 14 |
| `breeding-app-shared` | **0** | 0 | 43 |

Breeder, per file (top 14 — everything else is 0):

```
src/App.css                                            388
src/contexts/AppearanceContext.jsx                      53
src/App.jsx                                             50
src/features/mobile/MobileApp.css                       44
src/features/familyTree/components/FamilyTreeCanvas.jsx 12
src/features/familyTree/familyTree.css                  10
src/features/familyTree/components/SnakeNode.jsx         6
src/features/lab/components/BreederShedTestingPanel.jsx  4
src/components/breeding/BreedingPlanFlowchartCard.tsx    3
src/features/familyTree/components/SelectedSnakePanel.jsx 2
src/features/familyTree/components/JunctionNode.jsx      2
src/features/familyTree/utils/buildTreeGraph.js          1
src/features/familyTree/components/StatsBar.jsx          1
src/features/familyTree/FamilyTreePage.jsx               1
```

**On top of that, 2,433 Tailwind palette-literal utility classes in breeder JSX** (163 distinct
classes). These are colors too, and they are invisible to any hex grep:

| Utility prefix | occurrences |
|---|---|
| `text-*` | 1,252 |
| `bg-*` | 722 |
| `border-*` | 440 |
| `ring-*` | 14 |
| `shadow-*` / `accent-*` / `divide-*` | 5 |

Top Tailwind color classes in `App.jsx` alone:
`text-neutral-500` ×334 · `bg-white` ×133 · `bg-neutral-50` ×88 · `text-neutral-700` ×64 ·
`text-neutral-600` ×56 · `text-neutral-900` ×33 · `text-rose-600` ×28 · `border-neutral-200` ×28 ·
`text-neutral-800` ×23 · `bg-black` ×15 · `bg-amber-50` ×11 · `text-neutral-400` ×10 ·
`border-amber-200` ×10 · `bg-neutral-100` ×8 · `text-amber-700` ×8.

Arbitrary-value color classes also exist:
`text-[#3c1b73]`, `text-[#8257b1]`, and a checkerboard in
`features/lab/components/LabLabelPreview.jsx:102`:
```
bg-[linear-gradient(45deg,#111_25%,transparent_25%,transparent_50%,#111_50%,#111_75%,transparent_75%,transparent)]
```

### 2.2 Top 30 color literals by frequency (all frontends)

| # | Value | Count | Principal files |
|---|---|---|---|
| 1 | `#fff` | 116 | `breeder/src/App.css` (34), `marketplace/src/App.css` (21), `lab/src/App.css` (17), `admin/src/App.css` (17), `public/src/index.css` (11), `breeder/src/App.jsx`, `breeder/src/features/mobile/MobileApp.css` |
| 2 | `#f8fafc` | 66 | `admin/src/App.css` (17), `marketplace/src/App.css` (16), `breeder/src/App.css` (15), `lab/src/App.css` (14), `admin/src/admin/admin.css` (3), `breeder/src/App.jsx` (SVG chart plot area) |
| 3 | `#e2e8f0` | 63 | `marketplace/src/App.css` (21), `breeder/src/App.css` (12), `admin/src/App.css` (12), `lab/src/App.css` (11), all 4 `contexts/AppearanceContext.jsx` |
| 4 | `#64748b` | 57 | `marketplace/src/App.css` (18), `breeder/src/App.css` (13), `lab/src/App.css` (12), `admin/src/App.css` (12), `breeder/src/components/breeding/BreedingPlanFlowchartCard.tsx` |
| 5 | `#0f172a` | 50 | `breeder/src/App.css` (7), `marketplace/src/App.css` (6), `lab/src/App.css` (6), `admin/src/App.css` (6), all `contexts/AppearanceContext.jsx`, all `index.css` |
| 6 | `#334155` | 49 | `marketplace/src/App.css` (15), `admin/src/App.css` (12), `lab/src/App.css` (11), `breeder/src/App.css` (11) |
| 7 | `#ffffff` | 40 | all 4 `AppearanceContext.jsx`, all `index.css`, all `App.css` |
| 8 | `#475569` | 33 | `marketplace/src/App.css` (10), `breeder/src/App.css` (8), `lab` (6), `admin` (6), `admin/src/admin/admin.css` (2) |
| 9 | `#667085` | 29 | `admin/src/App.css` (11), `marketplace` (6), `lab` (6), `breeder` (6) |
| 10 | `#d9e2ec` | 28 | `marketplace/src/App.css` (7), `lab` (7), `breeder` (7), `admin` (7) |
| 11 | `#f6f7f9` | 25 | all `AppearanceContext.jsx`, all `index.css`, all `App.css` (default page bg) |
| 12 | `#2563eb` | 25 | all `AppearanceContext.jsx` (secondary), all `index.css`, `breeder/src/features/mobile/MobileApp.css` |
| 13 | `#0ea5e9` | 25 | all `AppearanceContext.jsx` (primary), all `index.css`, `breeder/src/features/familyTree/components/{FamilyTreeCanvas,SnakeNode}.jsx` |
| 14 | `#e5e7eb` | 24 | `breeder/src/App.css`, `breeder/src/App.jsx`, `breeder/src/features/familyTree/components/FamilyTreeCanvas.jsx`, `admin/src/admin/admin.css` |
| 15 | `#07110d` | 24 | `{breeder,lab,admin,marketplace}/src/App.css` (6 each) + `breeder/capacitor.config.ts` (splash + status bar) |
| 16 | `#e1e7ef` | 23 | all 4 `App.css` |
| 17 | `#cbd5e1` | 23 | all 4 `App.css`, `admin/src/admin/admin.css` |
| 18 | `#94a3b8` | 22 | all 4 `App.css`, all `AppearanceContext.jsx` (minimal preset), `admin/src/admin/admin.css` |
| 19 | `#166534` | 21 | all 4 `App.css`, `AppearanceContext.jsx` (success/warning text), `admin/src/admin/admin.css`, backend `email/templates/layout.ts` |
| 20 | `#7c3aed` | 20 | `breeder/src/App.css` (10) + the whole Family Tree feature (`FamilyTreeCanvas`, `JunctionNode`, `SelectedSnakePanel`, `SnakeNode`, `familyTree.css`, `FamilyTreePage`, `buildTreeGraph`) |
| 21 | `#21a36d` | 20 | all 4 `App.css` (5 each) |
| 22 | `#475467` | 19 | all 4 `App.css` |
| 23 | `#dde3ea` | 18 | all 4 `App.css` |
| 24 | `rgba(15,23,42,0.08)` | 17 | `breeder/src/App.css` (tab active bg, card shadows) |
| 25 | `#18212f` | 17 | all 4 `App.css` (`.admin-shell` text) |
| 26 | `#a9bab1` | 16 | all 4 `App.css` |
| 27 | `#cdd5df` | 15 | all 4 `App.css` |
| 28 | `#f59e0b` | 14 | all `AppearanceContext.jsx` (accent), all `index.css`, `breeder/.../SnakeNode.jsx`, `breeder/.../MobileApp.css`, `admin/src/admin/admin.css`, `public/src/pages/HomePage.jsx` |
| 29 | `#dcfce7` | 14 | all 4 `App.css`, `AppearanceContext.jsx` (warning bg), `admin/src/admin/admin.css` |
| 30 | `rgba(15,23,42,0.45)` | 13 | `breeder/src/App.css` (modal shadows) |

**Structural note:** the "all 4 `App.css`" pattern above is the signature of a **fork**. `App.css` was
copy-pasted into each app and then diverged:

| App | changed lines vs `breeder/src/App.css` (3,525 lines) |
|---|---|
| `admin` | 1,536 |
| `marketplace` | 1,073 |
| `lab` | 876 |

Same for `AppearanceContext.jsx` — 4 copies, 2 distinct versions:

| App | lines | md5 (first 12) |
|---|---|---|
| breeder | 628 | `a0c773d9a2cd` |
| marketplace | 628 | `a0c773d9a2cd` (byte-identical to breeder) |
| admin | 544 | `7cf58f71ef05` |
| lab | 544 | `7cf58f71ef05` (byte-identical to admin) |

The 544-line variant is 96 diff-lines behind — missing the `editorial` preset,
`EDITORIAL_STATUS_COLORS`, and `headingFontFamily`.

### 2.3 Hard cases — colors in contexts that resist tokenizing

#### 2.3.1 `box-shadow` — 37 in breeder, none use a variable

```
breeder/src/App.css:398   box-shadow: 0 10px 30px rgba(22, 101, 52, 0.12);
breeder/src/App.css:1067  0%, 100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.25); }
breeder/src/App.css:1068  50%      { box-shadow: 0 0 0 6px rgba(59, 130, 246, 0); }
breeder/src/App.css:1099  box-shadow: 0 25px 80px rgba(15, 23, 42, 0.45);
breeder/src/App.css:1182  box-shadow: 0 12px 30px rgba(37, 99, 235, 0.35);
breeder/src/App.css:1199  box-shadow: 0 12px 34px rgba(37, 99, 235, 0.4);
breeder/src/App.css:1429  box-shadow: 0 10px 24px rgba(115, 64, 182, 0.18);
breeder/src/App.css:1436  box-shadow: 0 12px 30px rgba(115, 64, 182, 0.35);
breeder/src/App.css:1457  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.08);
breeder/src/App.css:1483  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.08);
breeder/src/App.css:1496  box-shadow: 0 0 0 3px rgba(194, 152, 255, 0.25);
breeder/src/App.css:1506  box-shadow: 0 0 0 3px rgba(194, 152, 255, 0.35);
breeder/src/App.css:1526  box-shadow: 0 15px 30px rgba(14, 165, 233, 0.25);   /* .appearance-btn--filled */
breeder/src/App.css:1538  box-shadow: 0 18px 32px rgba(220, 38, 38, 0.35);    /* .appearance-btn--danger */
breeder/src/App.css:1548  box-shadow: 0 18px 38px rgba(15, 23, 42, 0.12);
breeder/src/App.css:1572  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.22);
breeder/src/App.css:1640  box-shadow: 0 16px 36px rgba(15, 23, 42, 0.1);
breeder/src/App.css:2075  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.06);
breeder/src/App.css:2233  box-shadow: 0 24px 72px rgba(15, 23, 42, 0.32);
breeder/src/App.css:2480  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.28);
breeder/src/App.css:2781  box-shadow: inset 0 -4px 0 #21a36d;
breeder/src/App.css:2858  box-shadow: 0 14px 30px rgba(0, 0, 0, 0.35);
breeder/src/App.css:2873  box-shadow: 0 -12px 28px rgba(0, 0, 0, 0.36);
breeder/src/App.css:3047  box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.08);
breeder/src/App.css:3108  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);
breeder/src/App.css:3195  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.14);
breeder/src/App.css:3268  box-shadow: 0 4px 16px rgba(124, 58, 237, 0.45);
breeder/src/App.css:3276  box-shadow: 0 2px 8px rgba(124, 58, 237, 0.35);
breeder/src/App.css:3342  box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.16);
breeder/src/features/familyTree/familyTree.css:28   box-shadow: 0 4px 24px 0 rgba(124, 58, 237, 0.07);
breeder/src/features/familyTree/familyTree.css:132  box-shadow: 0 2px 8px rgba(124, 58, 237, 0.08);
breeder/src/features/familyTree/familyTree.css:148  box-shadow: 0 2px 8px rgba(124, 58, 237, 0.08);
breeder/src/features/mobile/MobileApp.css:45   box-shadow: 0 8px 32px rgba(0,0,0,0.4);
breeder/src/features/mobile/MobileApp.css:269  box-shadow: 0 0 0 9999px rgba(0,0,0,0.35);  /* QR scanner scrim */
```

JS-side:
```
breeder/src/App.jsx:8902   boxShadow: '0 4px 16px rgba(0,0,0,0.12)'   // #bp-legend-tooltip (imperative DOM node)
breeder/src/App.jsx:20901  boxShadow: active ? '0 0 0 3px var(--status-success-bg, #f0fdf4)' : 'none'
breeder/src/features/familyTree/components/StatsBar.jsx:17  boxShadow: '0 0 0 3px rgba(52, 211, 153, 0.2)'
```

Plus Tailwind `shadow-sm` / `shadow-xl` / `shadow-2xl` (stock black-alpha) on every modal panel and card.

**Why it's hard:** shadows are tinted (`rgba(115,64,182)`, `rgba(37,99,235)`, `rgba(124,58,237)`) — they
encode brand hue, not just elevation. And a light-mode shadow (dark alpha on light) is invisible in dark
mode; dark themes need a different elevation strategy (lighter surface, or a border) rather than a
recolored shadow. There is no `--shadow-color` token today.

#### 2.3.2 `border` colors

440 Tailwind `border-*` classes (mostly `border-neutral-200`), plus the bare `border` utility used on
every `Card`, `Badge`, modal panel, and table. `App.css` border literals cluster on `#dde3ea`,
`#e5e7eb`, `#e2e8f0`, `#d0d7e2`, `#cbd5e1`, `#d9e2ec`, `#ddd6fe` (Family Tree).

There is **no `--color-border` / `--color-divider` token at all** — the closest is `--color-secondary`,
which `App.css:1009` misuses as a button border color.

#### 2.3.3 Background gradients — 16, one of which is tokenized

```
breeder/src/App.css:517   linear-gradient(90deg, rgba(13, 38, 30, 0.92), rgba(20, 83, 65, 0.75)), …
breeder/src/App.css:744   linear-gradient(120deg, var(--color-secondary), var(--color-primary));   ← the ONE tokenized gradient
breeder/src/App.css:1060  linear-gradient(90deg, rgba(56, 189, 248, 0.2), rgba(14, 165, 233, 0.35));
breeder/src/App.css:1433  linear-gradient(135deg, #f4ccff, #d8a6ff);
breeder/src/App.css:1535  linear-gradient(135deg, #f87171, #dc2626);   /* .appearance-btn--danger */
breeder/src/App.css:1561  linear-gradient(145deg, rgba(255,255,255,0.8), rgba(255,255,255,0));
                          /* .appearance-preview::before — a white sheen; inverts wrongly on dark skins */
breeder/src/App.css:1583  linear-gradient(rgba(244,247,251,0.88), rgba(244,247,251,0.96)), …

breeder/src/features/familyTree/components/SnakeNode.jsx:34-39
    selected:  'linear-gradient(135deg, #7c3aed, #a78bfa)',
    sire:      'linear-gradient(135deg, #0ea5e9, #38bdf8)',
    dam:       'linear-gradient(135deg, #ec4899, #f9a8d4)',
    offspring: 'linear-gradient(135deg, #10b981, #6ee7b7)',
    sibling:   'linear-gradient(135deg, #f59e0b, #fcd34d)',
    ancestor:  'linear-gradient(135deg, #6366f1, #a5b4fc)',

breeder/src/features/familyTree/components/SelectedSnakePanel.jsx:35-36
    ? 'linear-gradient(135deg, #7c3aed, #a78bfa)'
    : 'linear-gradient(135deg, #7c3aed, #f472b6)';

breeder/src/features/familyTree/FamilyTreePage.jsx:538   'linear-gradient(135deg, #7c3aed, #a78bfa)'
breeder/src/features/lab/components/LabLabelPreview.jsx:102   bg-[linear-gradient(45deg,#111_25%,…)]  (transparency checkerboard)
```

#### 2.3.4 `backdrop-filter` / blurred glass surfaces

```
breeder/src/App.css:1085  backdrop-filter: blur(8px);
breeder/src/App.css:1511  backdrop-filter: blur(12px);   /* .appearance-overlay */
breeder/src/App.css:1554  backdrop-filter: blur(6px);    /* .appearance-preview */
```

Plus Tailwind `backdrop-blur-sm` / `backdrop-blur-md` on **12+ distinct modal scrims** in `App.jsx`,
each pairing the blur with a hardcoded alpha-black:

```
"fixed inset-0 bg-black/30 backdrop-blur-md flex items-center justify-center p-4 z-[10010]"
"fixed inset-0 bg-black/40 backdrop-blur-md flex items-center justify-center p-4 z-[10010]"
"fixed inset-0 bg-black/40 backdrop-blur-md flex items-center justify-center p-4 z-[10020]"
"fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-[200]"
"fixed inset-0 bg-black/45 backdrop-blur-md flex items-center justify-center p-4 z-[10020]"
"fixed inset-0 z-[250] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
"fixed inset-0 z-40  flex items-center justify-center bg-black/40 p-4"
"fixed inset-0 z-50  flex items-center justify-center bg-black/45 p-4"
"fixed inset-0 z-40  flex items-start  justify-center overflow-y-auto bg-black/40 p-3 sm:p-4"
"fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
"absolute inset-0 bg-white/80 backdrop-blur-sm …"   ← white scrim; inverts wrongly on dark
```

The `--overlay-color` token exists and *is* theme-aware, but only `.appearance-overlay` uses it.

#### 2.3.5 SVG `fill` / `stroke`

Only **9** `currentColor` usages in the whole breeder src. Explicit values:

```
breeder/src/App.jsx:16062  fill="#f8fafc"                 // WeightTrendMiniChart plot area
breeder/src/App.jsx:16070  stroke="#e2e8f0"               // baseline, strokeDasharray="4 4"
breeder/src/App.jsx:16090  fill="#fff"                    // data-point centers
breeder/src/App.jsx:16079  stroke={accent}                // series line — this one IS themeable
breeder/src/App.jsx:16074  fill={`url(#${gradientId})`}   // area gradient built from {accent} stops
```

Static SVG assets carry baked brand color:
```
breeder/src/logo.svg                              fill="#61DAFB"   (React logo — stale CRA leftover)
breeder/src/assets/branding/serpentora-logo.svg   #00a551, #0971b8, #0972b8
```

#### 2.3.6 Canvas / chart / graph configs

There is **no charting library** (no Chart.js, Recharts, D3, Nivo). Visualization is:

1. **Hand-rolled SVG sparkline** — `App.jsx:15998 WeightTrendMiniChart`. Series color comes from an
   `accent` prop (themeable); plot area / baseline / point fill are hardcoded (above).

2. **React Flow 11.11.4** — `features/familyTree/components/FamilyTreeCanvas.jsx`, imports
   `reactflow/dist/style.css`. Its node/edge/minimap color arrays are inline:
```js
// FamilyTreeCanvas.jsx:99-118
if (n.type === 'placeholderNode') return '#e5e7eb';
if (n.type === 'junctionNode')    return '#7c3aed';
if (n.type === 'clutchNode')      return '#8b5cf6';
if (n.data?.isSelected)           return '#7c3aed';
if (role === 'sire')              return '#0ea5e9';
if (role === 'dam')               return '#ec4899';
if (role === 'offspring')         return '#10b981';
return '#a78bfa';
…
style={{ background: '#f5f3ff', border: '1px solid #ddd6fe' }}                       // minimap
style={{ borderRadius: '10px', overflow: 'hidden', border: '1px solid #ddd6fe' }}    // canvas
<Background gap={20} size={1} color="#ede9fe" variant="dots" />
```

3. **Family Tree scoped palette** — `features/familyTree/familyTree.css` declares its own violet
   sub-theme in a **global `:root`** (it leaks out of its own scope despite the comment claiming
   isolation):
```css
/* Uses CSS custom properties so it stays isolated from the
   rest of the app and doesn't break existing pages. */
:root {
  --ft-purple:         #7c3aed;
  --ft-purple-light:   #ede9fe;
  --ft-purple-medium:  #a78bfa;
  --ft-purple-border:  #ddd6fe;
  --ft-header-h:       52px;
  --ft-stats-h:        44px;
  --ft-left-w:         272px;
  --ft-right-w:        288px;
}
.ft-page { … background: #faf9ff; border: 1px solid var(--ft-purple-border); … }
.ft-header { … background: white; }
```

4. **Role color maps in JSX (Tailwind classes, not tokens):**
```js
// features/familyTree/components/SnakeNode.jsx:5  and  SelectedSnakePanel.jsx:12
const SEX_COLOR = { male: 'text-sky-500', female: 'text-pink-500', unknown: 'text-neutral-400' };
```

### 2.4 Colors from DB / API / user input

**None from the database.** `breeding-app-backend/prisma/schema.prisma` has **zero** color, hex,
swatch, theme, or appearance columns (grep for `color|colour|hex|swatch|theme|appearance` returns only
`notificationPreferences` at `:152` / `:1412` and `contactPreference` at `:333`).

**From user input — yes, one path, and it is the important one:**

- The **six appearance colors are user-chosen hex values** (`primary`, `secondary`, `accent`,
  `background`, `card`, `text`) via the color pickers defined at `App.jsx:20139-20144`. They are stored
  raw and written straight into `document.documentElement.style` with **no contrast validation**. A user
  can pick `card: #ffffff` + `text: #ffffff` and produce an unreadable app; nothing prevents it.
- **Custom presets** are user-named and user-colored, persisted to `localStorage`
  (`breedingPlannerCustomPresets.v1`), sanitized only for *shape* (`sanitizeCustomPresetEntry` →
  `sanitizeAppearance`), never for legibility.

**Derived-from-data, not stored-as-color:**

- Status → tone mapping is computed from a status *string*, then resolved through status tokens:
```js
// App.jsx:13087
function getStatusTone(status) {
  const normalized = typeof status === 'string' ? status.trim().toLowerCase() : '';
  if (normalized === 'active' || normalized === 'breeder') return 'success';
  if (normalized === 'quarantine') return 'danger';
  if (normalized === 'sold') return 'neutral';
  if (normalized === 'holdback') return 'neutral';
  if (normalized.includes('grow') || normalized.includes('sale') || normalized.includes('sell') || normalized === 'hold') return 'warning';
  return 'neutral';
}
```
  Users can create **custom status tags** (`customStatusTags` in planner state) — those fall through to
  `'neutral'`. Colors are not user-set here, so this path is safe.

- The mobile app uses a **named-color** status map that bypasses tokens entirely:
```js
// features/mobile/MobileApp.jsx:1385
const STATUS_COLORS = { "active":"green", "for sale":"blue", "sold":"gray", "deceased":"red", "quarantine":"orange" };
// :1604
<span className={`mbl-pill mbl-pill--status mbl-pill--${statusColor}`}>{animal.status}</span>
```

- Morph / genetics colors are **not** data-driven in breeder — they are CSS classes (`tag-coral`,
  `tag-purple` in `public/src/index.css`) and the Family Tree role gradients.

---

## 3. Semantic usage

Where each role currently resolves. "Token" = flows through `AppearanceContext`. "Literal" = hardcoded.

| Role | Current value(s) | Where defined | Token? |
|---|---|---|---|
| **Page background** | `var(--color-bg, #f6f7f9)` | `App.css:977 .app-root` (with `!important`), `App.css:984 .app-root::before` | ✅ token |
| **Card / panel surface** | `bg-white` (Tailwind) ×133; `#ffffff` / `white` in `App.css`; `--color-card` exists but is **read by almost nothing** | `App.jsx:13075 Card`, ~40 inline `bg-white` panels | ❌ literal |
| **Elevated / modal surface** | `bg-white … rounded-2xl shadow-2xl border` on 12+ portal panels | `App.jsx` portals (`11203, 11302, 11332, 11508, 11654, 11680, 11867, 13030, 13586, 13622, 13740, 13854, 15179`) | ❌ literal |
| **Border / divider** | Tailwind bare `border` + `border-neutral-200` (×28) / `-100` / `-300`; `#dde3ea`, `#e5e7eb`, `#e2e8f0`, `#d0d7e2`, `#cbd5e1`, `#d9e2ec`, `#ddd6fe` | `App.css` throughout; `admin.css` has `--a-border` / `--a-border-strong` | ❌ **no token exists** |
| **Primary text** | `var(--color-text, #0f172a)`; but in JSX `text-neutral-900` ×33 / `text-neutral-800` ×23 | `AppearanceContext` + `App.jsx` | ⚠️ split |
| **Secondary text** | `text-neutral-700` ×64, `text-neutral-600` ×56; `#475467`, `#334155` | `App.jsx`, `App.css` | ❌ **no token** |
| **Muted text** | `text-neutral-500` ×334 (the single most common color decision in the app), `text-neutral-400` ×10; `#667085`, `#94a3b8` | `App.jsx`, `App.css`, `admin.css` (`--a-text-muted`) | ❌ **no token** |
| **Primary accent / brand** | `var(--color-primary)` = `#0ea5e9`; alias `--primary` | `AppearanceContext`; forced onto every button via `App.css:1006` | ✅ token |
| **Accent foreground** | `--primary-contrast` = `--color-text` — **semantically wrong**; contrast-on-primary is aliased to body text color | `AppearanceContext` `cssVariables` | ⚠️ broken token |
| **Link** | `text-sky-600` / `text-sky-700` + `hover:underline` | `App.jsx` (multiple) | ❌ literal, unrelated to `--color-primary` |
| **Focus ring** | `focus-visible:ring-2 focus-visible:ring-sky-400` (14 `ring-*` total); `App.css:1542 outline: 2px solid var(--color-primary, #0ea5e9)` (only `.appearance-btn`); `App.css:1494` / `:1504` `outline: none` on header search (**removes** the indicator) | mixed | ⚠️ mostly literal |
| **Success** | `--status-success-{bg,border,text}` = `#f0fdf4` / `#bbf7d0` / `#166534` | `AppearanceContext:9`; consumed by `App.jsx:13098 StatusBadge` | ✅ token |
| **Warning** | `--status-warning-*` = `#dcfce7` / `#86efac` / `#166534` — note: **warning is green**, same hue family as success | `AppearanceContext:12` | ✅ token (but miscolored) |
| **Danger** | `--status-danger-*` = `#fee2e2` / `#fca5a5` / `#991b1b`; also `text-rose-600` ×28, `border-rose-200` ×6, `.appearance-btn--danger` gradient `#f87171→#dc2626` | `AppearanceContext:14` + literals | ⚠️ split |
| **Error** | `--status-error-*` = `#fff1f2` / `#fecaca` / `#9f1239` (distinct from danger) | `AppearanceContext:10` | ✅ token |
| **Info** | **does not exist.** No `--status-info-*`, no `--color-info`. Informational UI borrows `bg-amber-50` / `border-amber-200` or sky | — | ❌ missing role |
| **Disabled** | `App.css:1012 .app-root button[disabled] { opacity: 0.6 !important; }`; Tailwind `disabled:opacity-*` | `App.css:1011` | ⚠️ opacity-only (reads poorly on dark) |
| **Chart / data series** | `accent` prop → sparkline stroke; React Flow role map `#0ea5e9 / #ec4899 / #10b981 / #7c3aed / #8b5cf6 / #a78bfa / #e5e7eb`; SnakeNode gradient pairs | `App.jsx:15998`, `FamilyTreeCanvas.jsx:99-118`, `SnakeNode.jsx:34-39` | ❌ literal |
| **Shadow color** | `rgba(15,23,42,α)` most common; also `rgba(0,0,0,α)`, `rgba(124,58,237,α)`, `rgba(37,99,235,α)`, `rgba(115,64,182,α)` | `App.css` (29), `familyTree.css` (3), `MobileApp.css` (2), 3 JS sites | ❌ **no token** |
| **Overlay / scrim** | `--overlay-color` = `rgba(15,23,42,0.6)` dark / `rgba(15,23,42,0.35)` light — **used by exactly one class** (`.appearance-overlay`). Every other scrim is `bg-black/30…/45` or `bg-white/80` | `AppearanceContext` `cssVariables`; `App.css:1509` | ⚠️ token exists, unused |

---

## 4. Surface architecture

### 4.1 Root element / where a `data-skin` attribute would go

Four candidate layers, all present:

1. **`breeding-app-breeder/index.html`** — `<div id="root">`. Currently has a hardcoded
   `<meta name="theme-color" content="#000000" />` and Google Fonts links for Space Grotesk +
   Cormorant Garamond. **No pre-paint theme script.**
```html
<meta name="theme-color" content="#000000" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" />
…
<div id="root"></div>
<script type="module" src="/src/index.jsx"></script>
```

2. **`src/index.jsx`** — mounts `<AppEntry />` into `#root` inside `React.StrictMode`; imports
   `./index.css` then `./App.css`.

3. **`src/AppEntry.jsx`** — **the theme provider seam.** Both branches wrap in `AppearanceProvider`:
```jsx
export default function AppEntry() {
  if (isNativeMobileShell()) {
    return (
      <AppearanceProvider>
        <SharedBackendProvider>
          <BatchOrderProvider>
            <MobileApp />
          </BatchOrderProvider>
        </SharedBackendProvider>
      </AppearanceProvider>
    );
  }

  return (
    <AppearanceProvider>
      <SharedBackendProvider>
        <BatchOrderProvider>
          <SharedBackendBanner />
          <AuthGate>
            <BreedingPlannerApp />
          </AuthGate>
        </BatchOrderProvider>
      </SharedBackendProvider>
    </AppearanceProvider>
  );
}
```

4. **`App.jsx:10249`** — the DOM shell element:
```jsx
<div className="app-root w-full min-h-screen"
     style={{ ...appRootStyle, '--breeder-logo-bg': breederLogoBackground }}>
```

**A `data-skin` attribute belongs on `document.documentElement`**, alongside the existing
`data-theme-mode`, written from the same `useEffect` in `AppearanceContext.jsx` that currently sets
`root.dataset.themeMode`. `.app-root` is the wrong home because portals escape it (below).

**Dead code:** `src/AuthShell.jsx` (`export default function AppShell`) contains a *second*
`AppearanceProvider` tree — grep shows **zero importers**. Two providers would each write to
`documentElement` and fight. Currently unreachable, but a live landmine for a retrofit.

### 4.2 Portals rendered outside the root

`App.jsx` imports `createPortal` (line 2) and uses it at **15 sites**, all targeting `document.body` —
i.e. **outside `.app-root`**. Any theming keyed on `.app-root` misses all of them:

| Line | Portal |
|---|---|
| `App.jsx:7096` | top-level overlay in `BreedingPlannerApp` |
| `App.jsx:11203` | Photo gallery lightbox |
| `App.jsx:11302` | Add-animal modal |
| `App.jsx:11332` | Leucistic-type modal |
| `App.jsx:11508` | Hatch wizard |
| `App.jsx:11654` | Import modal |
| `App.jsx:11680` | Pairing modal |
| `App.jsx:11867` | Edit-snake modal |
| `App.jsx:12864` | QR scanner (`createPortal(scannerContent, document.body)`) |
| `App.jsx:13030` | `ConfirmDeleteSnakeModal` |
| `App.jsx:13586` | `QRModal` |
| `App.jsx:13622` | `EggBoxModal` |
| `App.jsx:13740` | `ExportQrModal` |
| `App.jsx:13854` | `ExportPairingQrModal` |
| `App.jsx:15179` | `FeedPrepModal` |

Plus a **manually appended DOM node** that is not a React portal at all:
```jsx
// App.jsx:8902 — legend tooltip, imperatively positioned, hardcoded light colors
<div id="bp-legend-tooltip" style={{display:'none', position:'absolute', zIndex:500,
  background:'#fff', border:'1px solid #e5e7eb', borderRadius:12, padding:'10px 14px',
  boxShadow:'0 4px 16px rgba(0,0,0,0.12)'}}>
```

And four `document.body.appendChild(link)` download-trigger sites (`App.jsx:1765, 1811, 2368, 16812`) —
harmless for theming (invisible `<a>` elements).

Because the provider writes to `document.documentElement`, **CSS-variable-based** theming *does* reach
the portals. Only `.app-root`-scoped rules (including the `.app-root button { … !important }` hammer) do
not — which is why portal buttons look different from in-tree buttons today.

### 4.3 Iframes, emails, print, PDF, server-rendered HTML

| Surface | Location | Palette source |
|---|---|---|
| **Transactional emails** (13 templates) | `breeding-app-backend/src/email/templates/` — shared chrome in `layout.ts` | **Fully independent hardcoded palette.** Needs the skin applied separately, or deliberately frozen. |
| **Print stylesheet** | `features/lab/components/BreederShedTestingPanel.jsx:195` — one inline `@media print` block | independent |
| **PDF generation (jsPDF)** | `utils/pdf/labCertificatePdf.ts` (`:248-440`), `utils/pdf/labOrderLabelsPdf.ts:44` | RGB triplets via `doc.setFillColor / setDrawColor / setTextColor` — a separate color space entirely |
| **Blob windows** | `features/lab/components/BreederShedTestingPanel.jsx:91, 516` — `window.open(blobUrl, "_blank")` | new document, no app CSS |
| **Android / Capacitor native chrome** | `breeding-app-breeder/capacitor.config.ts:23, 29` — `backgroundColor: "#07110d"` (splash + status bar) | hardcoded, not theme-linked |
| **PWA manifest** | `public/manifest.json` — `"theme_color": "#000000"`, `"background_color": "#ffffff"` | hardcoded |
| **`index.html` meta** | `<meta name="theme-color" content="#000000" />` | hardcoded |
| **Server-rendered HTML** | none — no SSR anywhere | n/a |
| **Iframes** | none found | n/a |

`breeding-app-backend/src/email/templates/layout.ts` — the shared email chrome, verbatim:
```html
<body style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 0;">
    <table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:8px;overflow:hidden;" cellpadding="0" cellspacing="0">
      <td style="background:#166534;padding:20px 28px;">
        <span style="color:#ffffff;font-size:18px;font-weight:700;">${escapeHtml(BRAND_NAME)}</span>
      <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:#111827;">${escapeHtml(heading)}</h1>
      <div style="font-size:14px;line-height:1.6;color:#374151;">${bodyHtml}</div>
      <a href="${escapeHtml(ctaUrl)}" style="display:inline-block;background:#166534;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 20px;border-radius:6px;">${escapeHtml(ctaLabel)}</a>
      <td style="padding:16px 28px;border-top:1px solid #e5e7eb;">
        <p style="margin:0;font-size:12px;color:#9ca3af;">You are receiving this email because of activity on your ${escapeHtml(BRAND_NAME)} account.</p>
```
Note the email brand green `#166534` matches nothing in the app palette (app primary is sky `#0ea5e9`).

---

## 5. Component surface area

### 5.1 Counts

| Metric | breeder |
|---|---|
| `.jsx` / `.tsx` files | 42 |
| Capitalized function components (all files) | **120** |
| …of which declared **inside `App.jsx`** | **46** |
| `App.jsx` size | **26,174 lines** |
| `className=` occurrences in `App.jsx` | 2,114 |
| `style={{` in `App.jsx` | 36 |

There is effectively **no shared presentational component library.** `src/components/` holds six files:
```
components/GeneAutocomplete.jsx
components/LanguageSwitcher.jsx
components/SharedBackendBanner.jsx
components/SharedBackendGuard.jsx
components/breeding/BreedingAdvisorProgressModal.tsx
components/breeding/BreedingPlanFlowchartCard.tsx
```

Ranking by import count is not meaningful here — the presentational components are co-located in
`App.jsx` and never imported. For reference, the most-imported *local modules* repo-wide are all
services and data, not UI: `testOrderService` (15), `lab` (15), `labStore` (12), `pairing` (11),
`labPricing` (11), `apiClient` (11), `labStatus` (9), `geneDatabase` (8), `SharedBackendContext.jsx` (8).

### 5.2 The 20 highest-leverage presentational components

Ranked by how much surface they paint:

| # | Component | Path | Theming state |
|---|---|---|---|
| 1 | `BreedingPlannerApp` (shell, `.app-root`) | `App.jsx:6586` | ✅ token bg |
| 2 | `Card` | `App.jsx:13075` | ❌ `bg-white border rounded-2xl shadow-sm` |
| 3 | `Badge` | `App.jsx:13084` | ❌ `bg-neutral-50` |
| 4 | `StatusBadge` | `App.jsx:13098` | ✅ **the model to copy** — reads `var(--status-${tone}-*)` |
| 5 | `SexBadge` | `App.jsx:13114` | ❌ `bg-neutral-50 text-neutral-600` |
| 6 | `TabButton` | `App.jsx:13059` | ⚠️ `.appearance-tab--active/inactive` → hardcoded `rgba(15,23,42,…)` |
| 7 | `SnakeCard` | `App.jsx:15313` | ❌ Tailwind literals |
| 8 | `SnakeListTable` | `App.jsx:16159` | ❌ Tailwind literals |
| 9 | `WeightTrendMiniChart` | `App.jsx:15998` | ⚠️ series themed, chrome literal |
| 10 | `PairingInlineCard` | `App.jsx:20914` | ❌ |
| 11 | `PairingStageTracker` | `App.jsx:20883` | ❌ |
| 12 | `BreedingDashboardSection` | `App.jsx:20498` | ❌ |
| 13 | `AppearanceSettingsPanel` | `App.jsx:20122` | ✅ the switcher itself |
| 14 | `AppearancePreview` | `App.jsx:20442` | ⚠️ white-sheen `::before` breaks on dark |
| 15 | `FloatingDialog` / `ChoiceDialog` | `App.jsx:23554` / `23575` | ❌ portal + `bg-black/40` |
| 16 | `ConfirmDeleteSnakeModal` | `App.jsx:13026` | ❌ portal |
| 17 | `QRModal` / `EggBoxModal` / `ExportQrModal` / `ExportPairingQrModal` | `App.jsx:13582 / 13604 / 13704 / 13790` | ❌ portals |
| 18 | `CalendarSection` | `App.jsx:24459` | ❌ |
| 19 | `LogsEditor` | `App.jsx:24224` | ❌ |
| 20 | `SnakeNode` / `JunctionNode` / `ClutchNode` / `PlaceholderNode` | `features/familyTree/components/` | ❌ inline gradients |

The two patterns side by side — `StatusBadge` (right) vs `Card` / `Badge` (wrong):

```jsx
// App.jsx:13098 — CORRECT: semantic role → token, with fallback
function StatusBadge({ status }) {
  const tone = getStatusTone(status);
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-semibold"
      style={{
        background:  `var(--status-${tone}-bg, #f3f4f6)`,
        borderColor: `var(--status-${tone}-border, #d1d5db)`,
        color:       `var(--status-${tone}-text, #6b7280)`,
      }}
    >{status}</span>
  );
}

// App.jsx:13075 / 13084 — hardcoded light-mode
function Card({ title, children }) {
  return (
    <div className="bg-white border rounded-2xl shadow-sm">
      <div className="px-4 py-3 border-b font-semibold">{title}</div>
      <div className="p-4">{children}</div>
    </div>
  );
}
function Badge({ children }) {
  return <span className="px-2 py-0.5 text-xs rounded-full border bg-neutral-50">{children}</span>;
}
```

Notable large components outside `App.jsx`:
`features/mobile/MobileApp.jsx` (3,000 lines — mobile shell, best CSS-var coverage via
`MobileApp.css`'s 207 `var()` calls), `features/auth/AuthGate.jsx` (1,485),
`features/suggestions/SuggestionsTab.tsx` (1,365),
`features/lab/components/BreederShedTestingPanel.jsx` (883),
`features/lab/components/ShedTestTerminalPanel.jsx` (822),
`features/familyTree/FamilyTreePage.jsx` (632),
`features/marketplace/MarketplacePage.jsx` (536),
`features/animals/ReproductiveIntelligencePanel.jsx` (511).

### 5.3 Component libraries needing theme override

**None.** No MUI, Chakra, Radix, shadcn, Ant Design, styled-components, or Emotion anywhere in the repo
(verified against every `package.json`). This is a meaningful simplification — there is no vendor theme
config to fight.

The **one** vendor stylesheet is React Flow:
```js
// features/familyTree/components/FamilyTreeCanvas.jsx:10
import 'reactflow/dist/style.css';
```
overridden by hand in `features/familyTree/familyTree.css:124-148`
(`.react-flow__attribution`, `.react-flow__controls`, `.react-flow__controls-button`,
`.react-flow__controls-button:hover`, `.react-flow__minimap`).

### 5.4 Charting / visualization libs and where their color arrays live

| Lib | Where | Color array location |
|---|---|---|
| **reactflow 11.11.4** | `features/familyTree/components/FamilyTreeCanvas.jsx` | inline node-color fn `:99-107`, minimap `:110-111`, canvas border `:116`, `<Background color="#ede9fe">` `:118` |
| **hand-rolled SVG** | `App.jsx:15998 WeightTrendMiniChart` | `accent` prop + literals at `:16062, 16070, 16090` |
| **qrcode 1.5.1 / html5-qrcode / jsqr** | QR modals | QR renders black-on-white by default; no theme hookup |
| **jspdf 2.5.1** | `utils/pdf/*` | `setFillColor` / `setDrawColor` / `setTextColor` RGB triplets |
| **html2canvas 1.4.1** | screenshot / export | rasterizes whatever is on screen — **will bake the active skin into exported images** |

---

## 6. Persistence & user state

### 6.1 Where preferences live

**Three layers, no DB column.**

#### (a) `localStorage` — primary

| Key | Written by | Contents |
|---|---|---|
| `breedingPlannerAppearance.v1` | `AppearanceContext.jsx:3` | full `appearanceState` object (below) |
| `breedingPlannerCustomPresets.v1` | `AppearanceContext.jsx:4` | `Array<{key, label, description, state}>` |
| `breedingPlannerSnakes` | `App.jsx:1007` | the whole animal dataset |
| `bpSyncTombstones` | sync layer | deletion tombstones |

`appearanceState` shape as persisted:
```jsonc
{
  "version": 1,
  "preset": "default",              // or "custom", or a saved-preset slug
  "themeMode": "system",            // system | light | dark | high-contrast
  "colors": {
    "primary": "#0ea5e9", "secondary": "#2563eb", "accent": "#f59e0b",
    "background": "#f6f7f9", "card": "#ffffff", "text": "#0f172a",
    "status": {
      "success": { "bg": "#f0fdf4", "border": "#bbf7d0", "text": "#166534" },
      "error":   { "bg": "#fff1f2", "border": "#fecaca", "text": "#9f1239" },
      "warning": { "bg": "#dcfce7", "border": "#86efac", "text": "#166534" },
      "danger":  { "bg": "#fee2e2", "border": "#fca5a5", "text": "#991b1b" },
      "neutral": { "bg": "#f3f4f6", "border": "#d1d5db", "text": "#6b7280" }
    }
  },
  "typography": {
    "fontFamily": "default",        // default|inter|roboto|opensans|serif|mono
    "headingFontFamily": "inherit",
    "fontSize": "medium",           // small|medium|large|xlarge
    "lineSpacing": "normal"         // compact|normal|relaxed
  },
  "layoutDensity": "comfortable",   // compact|comfortable|spacious
  "borderStyle": "soft",            // sharp|soft|rounded
  "backgroundMode": "solid",        // solid|logo
  "motion": { "animations": true, "reducedMotion": false }
}
```

#### (b) Cloud sync — appearance rides inside `plannerState`

It *is* server-persisted, just not in a dedicated column:
```js
// App.jsx:7193
const plannerSyncState = useMemo(() => normalizePlannerStateRecord({
  version: 1,
  groups, showGroups, hiddenGroups,
  customStatusTags, removedStatusTags,
  morphAliases: normalizeMorphAliasDatabase(morphAliases),
  geneAliases: mergeGeneAliasRows(geneAliases),
  leucisticType: lastLeucisticType === 'blackEye' ? 'blackEye' : 'bel',
  breederInfo: normalizeBreederInfo(breederInfo),
  backupSettings: normalizeBackupSettings(backupSettings),
  appearance: appearanceState,      // ← line 7205
  theme,
  lastFeedDefaults,
  rooms, heatRacks, terrariums,
  spaces: buildLegacySpacesSnapshot(rooms, heatRacks, terrariums),
}), [appearanceState, /* … */]);
```
and rehydrated:
```js
// App.jsx:7250
if (state.appearance && typeof state.appearance === 'object') {
  hydrateAppearance(state.appearance);
}
```
Note `theme` alongside it is **not** a second theme system — `App.jsx:6590` sets
`const theme = effectiveThemeMode;` and passes it as a prop for the 7 dark-mode conditionals.

This matters: **the appearance blob is inside the same sync payload with known 413 and merge-conflict
history.** Growing the token set grows that payload.

#### (c) Prisma schema — nothing

No `theme`, `skin`, `appearance`, or `preferences` JSON column on `User`. Adding a first-class column
is greenfield.

### 6.2 SSR / hydration / flash-of-wrong-theme

**No SSR.** All five frontends are client-only Vite SPAs.

**FOUC risk: real, and currently active.** The sequence on every page load:

1. Browser parses `index.html` → paints `<body>` with **no** custom properties set.
2. `index.css` + `App.css` apply. Breeder's `index.css` has **no `:root` token block**, so every
   `var(--color-bg, #f6f7f9)` falls back to its hardcoded **light** default.
3. Vite loads the JS bundle; React mounts; `AppearanceProvider` runs `loadStoredAppearance()` from
   `localStorage`, then a `useEffect` writes the ~37 properties onto `documentElement`.

For a user on `darkBreeder` or `editorial`, steps 1-2 paint a **light** app (`#f6f7f9` bg, white cards),
then it snaps dark once React commits. On the Capacitor Android build with a `#07110d` splash, the
transition reads as splash-dark → flash-light → dark.

There is **no** blocking `<script>` in `index.html` that reads `localStorage` and stamps the theme before
first paint — the standard fix. Nothing in `index.html` references the theme beyond the static
`<meta name="theme-color" content="#000000">`.

A secondary flash exists on the cloud path: `hydrateAppearance(state.appearance)` fires **after** the
network round-trip, so a user whose server-side appearance differs from `localStorage` gets a *second*
theme change seconds into the session.

---

## 7. Images & assets

| Asset | Path | Issue |
|---|---|---|
| `logo.svg` | `breeder/src/logo.svg` | `fill="#61DAFB"` — the React logo, a CRA leftover. Fixed cyan. |
| `serpentora-logo.svg` | `breeder/src/assets/branding/serpentora-logo.svg` | baked `#00a551`, `#0971b8`, `#0972b8` — **not** `currentColor`, so it cannot follow a skin |
| App icons (6 PNGs) | `breeder/public/app-icons/icon_{16,32,128,256,512,1024}x…png` | raster, fixed background. `icon_512x512.png` is used as a **tiled page background** at `App.css:995` when `backgroundMode: "logo"` — a baked-color image sitting behind a themeable surface at `opacity: 0.14` |
| `logo192.png`, `logo512.png` | `breeder/public/` | PWA icons, raster |
| `favicon.ico` | `breeder/public/` | raster |
| `ball-python-launch.png` | `breeder/public/marketplace/` | marketing photo |
| Bundled fonts | `breeder/src/**/*.ttf` (2 files) | fine — not color |
| Google Fonts | `index.html` `<link>` → Space Grotesk, Cormorant Garamond | **external CDN dependency**; the other four `FONT_FAMILIES` options (Inter, Roboto, Open Sans, IBM Plex Mono) are **not loaded anywhere** — selecting them silently falls back to `'Segoe UI', system-ui` |

**`currentColor` adoption is 9 occurrences across the entire breeder src.** Effectively every icon and
glyph is a literal color or a Tailwind `text-*` class.

---

## 8. Blockers

Ranked by how much they'd hurt a runtime skin-switch retrofit.

1. **No Tailwind config / no `@theme` block, with 2,433 palette-literal utility classes.**
   Tailwind v4 runs stock. `text-neutral-500` (×334), `bg-white` (×133), `bg-neutral-50` (×88),
   `border-neutral-200` (×28) are spelled out at 2,433 call sites, and there is no file today where
   the palette they name could be remapped.

   > **Correction (verified after this section was first written).** I compiled the installed Tailwind
   > against these exact class names. They do **not** bake hex — every color utility emits
   > `var(--color-*)` (`.bg-white { background-color: var(--color-white) }`,
   > `.text-neutral-500 { color: var(--color-neutral-500) }`), and a user `@theme` block re-points them
   > at runtime. So this is **not** 2,433 manual edits: a ~40-line `@theme` bridge converts roughly
   > 2,000 of them with `App.jsx` untouched. It remains the largest item to *decide*, but it is a
   > contained one. Blockers #3, #5 and #9 are the real remaining work. See
   > [`SKIN_ARCHITECTURE.md`](./SKIN_ARCHITECTURE.md) §0-§3 for the compiler output and the bridge.

2. **`App.jsx` is 26,174 lines with 46 components and 2,114 `className=` sites.**
   The retrofit has no natural seams. There is no `<Button>`, `<Panel>`, or `<Table>` to fix once —
   40+ modal panels each independently spell out `bg-white … rounded-2xl shadow-2xl border`. Any token
   migration is a very large, review-only diff in one file.

3. **Missing semantic roles.** No tokens exist for **border/divider**, **secondary text**, **muted
   text**, **shadow color**, **info**, or **surface-2/elevated**. Muted text alone is 344 hardcoded
   sites. You cannot migrate what has no destination — the token set must be extended before any
   find-and-replace starts. (`admin/src/admin/admin.css`'s `--a-*` set is the right shape to steal.)

4. **`--primary-contrast` is aliased to `--color-text`.** `AppearanceContext` sets
   `"--primary-contrast": resolvedColors.text`, and `App.css:1006` paints every button
   `background: var(--primary) !important; color: var(--primary-contrast) !important`. On the `minimal`
   preset (`primary: #0f172a`, `text: #0f172a`) that is **dark text on a dark button** — invisible
   labels. Any skin whose primary approaches its text color is already broken today.

5. **The `.app-root button { … !important }` hammer.** 63 `!important` declarations in `App.css`, the
   worst being a blanket repaint of every `<button>`. Components already opt out one at a time
   (`.status-tag-menu-button`, `.status-tag-neutral-button`). Introducing real button variants means
   unwinding this rule and auditing every button that currently depends on it — and portal buttons
   (15 sites) never received it, so they already diverge.

6. **Flash of wrong theme on every load, with no pre-paint hook.** No blocking script in `index.html`;
   breeder's `index.css` has no `:root` fallback block; tokens arrive only after React mounts.
   Dark-mode users see a light flash on every launch, and a *second* flash after cloud sync rehydrates.
   Cheap to fix, but it must land before shipping more skins or it becomes more visible.

7. **Four `data-*` attributes written to `<html>` that nothing reads.** `data-theme-mode` (0 CSS
   references), `data-appearance-density` (0), `data-appearance-radius` (0), `data-motion-preference`
   (0). The system *looks* wired but the CSS side was never written — density, radius, and
   reduced-motion are non-functional despite having full UI controls and persisted state.

8. **Fork drift across 5 apps.** `App.css` copy-pasted 4× (876-1,536 lines diverged);
   `AppearanceContext.jsx` copy-pasted 4× in 2 versions (admin and lab are 96 lines behind, missing the
   `editorial` preset and `headingFontFamily`); `VISUAL_LANGUAGE.md` copy-pasted 5×; `public` uses a
   third naming scheme (`--gold`, `--dark`, `--coral`). `breeding-app-shared` — the one package that
   *should* own this — has **zero color literals and no theming code at all.** Any token change must be
   applied 4-5× or the packages consolidated first.

9. **Scrims and elevation are inverted-mode-hostile.** 12+ modal backdrops hardcode `bg-black/30…/45`
   and one uses `bg-white/80`. The theme-aware `--overlay-color` token exists and is used by exactly one
   class. 37 `box-shadow` declarations use dark-alpha shadows that vanish on dark backgrounds, several
   tinted with brand-specific hues (`rgba(124,58,237,…)`, `rgba(37,99,235,…)`). Dark mode needs a
   different elevation model, not recolored shadows.

10. **User-supplied colors with no contrast guardrail.** Six free-form hex pickers
    (`App.jsx:20139-20144`) write straight to `documentElement` via `sanitizeAppearance`, which validates
    *shape* only. Users can already save and cloud-sync an unreadable custom preset. More tokens = more
    ways to produce an unusable app.

11. **Family Tree is a second, competing theme.** `features/familyTree/familyTree.css` declares
    `--ft-purple*` in a **global `:root`** (despite a comment claiming isolation), and
    `FamilyTreeCanvas.jsx` hardcodes eight role colors plus a React Flow minimap/background palette. It
    is a violet island in a sky-blue app and will stay violet through every skin.

12. **Non-app surfaces need their own palette plumbing.** 13 backend email templates (independent
    hardcoded palette, brand green `#166534` matching nothing in the app), jsPDF certificate/label
    generation (RGB triplets), the Capacitor splash/status bar (`#07110d`), the PWA manifest
    (`theme_color: #000000`), and `index.html`'s `<meta name="theme-color">`. Also: `html2canvas`
    exports will **bake the active skin** into shared images.

13. **Only 2 of 6 offered fonts are actually loaded.** `index.html` fetches Space Grotesk and Cormorant
    Garamond. Selecting Inter / Roboto / Open Sans / IBM Plex Mono in the settings panel silently falls
    back to `'Segoe UI', system-ui` — including on `highContrast` and `visualImpaired`, the two
    accessibility presets, which specify `inter` and `opensans` respectively.

14. **`src/AuthShell.jsx` is unreachable dead code containing a second `AppearanceProvider`.** Zero
    importers today. If it is ever re-wired, two providers will write competing values to
    `document.documentElement`.

15. **Focus rings are hardcoded, and in one place removed.** `focus-visible:ring-sky-400` is fixed sky
    regardless of skin; `App.css:1494` and `:1504` set `outline: none` on the header search field with no
    replacement. A high-contrast skin cannot strengthen focus indication.

---

## 9. What's already good (start here)

- **`StatusBadge` (`App.jsx:13098`) is the correct pattern in miniature** — computes a semantic tone,
  reads `var(--status-${tone}-{bg,border,text})` with sane fallbacks. Copy this shape everywhere.
- **`features/mobile/MobileApp.css` has 207 `var()` calls** — by far the best-tokenized stylesheet in the
  repo. The mobile shell would likely theme correctly today with comparatively little work.
- The provider already handles `prefers-color-scheme` and `prefers-reduced-motion` with proper
  `addEventListener` / `addListener` fallbacks, and `sanitizeAppearance` / `mergeAppearance` give a clean
  versioned migration seam (`version: 1`).
- **`VISUAL_LANGUAGE.md` already documents the intended contract**, including the exact rule being
  violated. It is a spec, not a description — treat the gap as a to-do list.
- **`admin/src/admin/admin.css`'s `--a-*` set** is a well-shaped token vocabulary (surface-2,
  border-strong, text-2, text-muted, 4-step shadow scale). It is the missing half of
  `AppearanceContext`'s token set.
- **No component library to fight.** No MUI/Radix/shadcn theme config, no CSS-in-JS runtime, no SSR
  hydration-mismatch class of bug.
