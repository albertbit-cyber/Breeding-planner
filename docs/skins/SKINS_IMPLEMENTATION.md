# Implementing the skins

**Source files live at `D:\Git Clone\Breeding-planner\serpentora-skins`.** Read
`skins.css`, `tw-bridge.css`, and `skins.contrast.txt` from that folder — do not
regenerate or hand-write any of them; copy them to the destinations given in Step 1.

Companion to `skins.css`, `tw-bridge.css`, `skins.contrast.txt`.
Six steps. Each is independently shippable and independently revertable.
Step 1 lands with **zero visible change** — that is the point.

---

## Step 1 — Put the files in `breeding-app-shared` (visual no-op)

Copy from `D:\Git Clone\Breeding-planner\serpentora-skins` to:

```
serpentora-skins\skins.css      →  breeding-app-shared/src/styles/skins.css
serpentora-skins\tw-bridge.css  →  breeding-app-shared/src/styles/tw-bridge.css
```

They go in `shared` and nowhere else. The audit found `AppearanceContext.jsx` forked into
2 versions across 4 apps and `App.css` copy-pasted 4× with up to 1,536 lines diverged.
Authoring a skin 4–5 times is exactly how that happened. `breeding-app-shared` has zero
color literals today — it should own all of them.

**Breeder** (`src/index.css`) — order matters:

```css
@import "tailwindcss";
@import "@breeding/shared/styles/skins.css";
@import "@breeding/shared/styles/tw-bridge.css";   /* AFTER tailwindcss */
```

**admin / lab / marketplace / public** (`src/index.css`) — import `skins.css` only
(no Tailwind in those apps, so no bridge):

```css
@import "@breeding/shared/styles/skins.css";
```

Then **delete the static `:root` mirrors** those three apps carry (`--color-primary`,
`--color-bg`, …) and the `public` app's third naming scheme (`--gold`, `--dark`, `--coral`).
Leave the old variable names alive for one release as aliases if you don't want to sweep
their CSS yet:

```css
:root {
  --color-bg:      var(--sk-bg);
  --color-card:    var(--sk-surface);
  --color-text:    var(--sk-text);
  --color-primary: var(--sk-primary);
}
```

**Verify step 1 before moving on:** the app must look pixel-identical. `default` is
hand-written from your shipped values for exactly this reason. If anything shifts, it is
the bridge — check which `--color-*` you re-pointed that the app was using for a
non-semantic purpose.

---

## Step 2 — Write `data-skin`, and kill the flash

**`AppearanceContext.jsx`** — the effect that already sets `root.dataset.themeMode` gains
one line:

```js
root.dataset.skin      = appearanceState.preset;   // ← new
root.dataset.themeMode = effectiveThemeMode;       // existing
```

**Every `index.html`** — before the stylesheet, blocking:

```html
<script>
  try {
    var a = JSON.parse(localStorage.getItem('breedingPlannerAppearance.v1') || '{}');
    document.documentElement.dataset.skin = a.preset || 'default';
    document.documentElement.dataset.themeMode =
      (!a.themeMode || a.themeMode === 'system')
        ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
        : a.themeMode;
  } catch (e) {}
</script>
```

Eight lines removes the light-flash-on-every-launch, including the
splash-dark → flash-light → dark sequence on the Capacitor build.

Also fix the two static values that give the flash somewhere to land:
`index.html`'s `<meta name="theme-color" content="#000000">` and
`manifest.json`'s `theme_color` / `background_color`. Set them to the **default** skin's
`--sk-bg` (`#f6f7f9`) — they can't be dynamic, and matching the default is better than
matching nothing.

**Delete `src/AuthShell.jsx`.** Zero importers, and it contains a second
`AppearanceProvider` that would write competing values to `documentElement` if ever
re-wired.

---

## Step 3 — Move the presets from JS into CSS

`AppearanceContext.jsx` gets **smaller**.

**Delete:** `DEFAULT_STATUS_COLORS`, `EDITORIAL_STATUS_COLORS`, `HIGH_CONTRAST_COLORS`, and
the `colors: {…}` block inside all 7 presets.

**Presets become references.** All 12 blocks in `skins.css` are exposed to users — the
complete list, ready to paste:

```js
const APPEARANCE_PRESETS = {
  default:            { key: 'default',            label: 'Default',            description: 'The original sky-blue interface.' },
  jungleGlass:        { key: 'jungle-glass',       label: 'Jungle Glass',       description: 'Moss green drifting into deep teal, with translucent panels.' },
  deepCanopy:         { key: 'deep-canopy',        label: 'Deep Canopy',        description: 'Single-hue forest green. The calmest of the set.' },
  mossMist:           { key: 'moss-mist',          label: 'Moss & Mist',        description: 'Desaturated sage on warm slate green. Softest contrast.' },
  rainforestNight:    { key: 'rainforest-night',   label: 'Rainforest Night',   description: 'Deep blue-green with a cool cyan read.' },
  fernClay:           { key: 'fern-clay',          label: 'Fern & Clay',        description: 'Olive base with terracotta warmth.' },
  emeraldBrass:       { key: 'emerald-brass',      label: 'Emerald & Brass',    description: 'The darkest option, with restrained brass accents.' },
  marshDusk:          { key: 'marsh-dusk',         label: 'Marsh Dusk',         description: 'Cool grey-plum shell so the moss accents carry the colour.' },
  copperCanopy:       { key: 'copper-canopy',      label: 'Copper Canopy',      description: 'Dark olive with copper. The warmest dark skin.' },
  slateBotanical:     { key: 'slate-botanical',    label: 'Slate Botanical',    description: 'Neutral blue-grey chrome, chartreuse for data. Most tool-like.' },
  bambooDaylight:     { key: 'bamboo-daylight',    label: 'Bamboo Daylight',    description: 'Light: paper-warm ground, deep green ink, no glare.' },
  sandstoneVivarium:  { key: 'sandstone-vivarium', label: 'Sandstone Vivarium', description: 'Light: sand ground, bark browns, one leaf-green accent.' },
};
```

The `key` must match a `[data-skin="…"]` block in `skins.css` exactly. Twelve is a lot for
a flat radio list — group the picker as **Default / Dark (8) / Light (2)** and let the
swatch do the talking. `color-scheme` is declared per skin, so each block already tells the
browser which side it's on.

**Keep in JS:** `themeMode` resolution, the `matchMedia` listeners, typography, density,
radius, motion, persistence, and the custom-picker overrides. Those are genuinely dynamic.

**Bump the persisted version to 2. Old preset names do not migrate** — `minimal`,
`highContrast`, `visualImpaired`, `darkBreeder`, `editorial`, and `softPastel` are retired.
`sanitizeAppearance` should fall back to `default` for any `preset` it doesn't recognise,
which also covers stale cloud-synced state and hand-edited localStorage:

```js
const SKIN_IDS = new Set(Object.values(APPEARANCE_PRESETS).map(p => p.key));
const preset = SKIN_IDS.has(raw.preset) ? raw.preset : 'default';
```

Two consequences to accept deliberately:

- Existing users land on `default` at next load, not on a translated equivalent. If that's
  too abrupt, the honest version is a one-time dismissible notice pointing at the new
  picker — not a silent guess at which jungle skin they'd have wanted.
- **`highContrast` and `visualImpaired` were the accessibility presets.** None of the 11
  jungle skins replaces them — they are all mid-contrast by design, which is the point of
  the direction. Keep `themeMode: 'high-contrast'` working as an orthogonal modifier over
  any skin, or author a 13th `high-contrast` block. Retiring them with no replacement is
  the one part of this change that costs a user something real.

**Custom colors keep working unchanged** — the pickers write inline `--sk-*` on
`documentElement`, and inline style beats the stylesheet, so a custom preset layers on top
of whichever skin it started from. Rename the six picker targets:

| picker | writes |
|---|---|
| background | `--sk-bg` (and `--sk-bg-2` to the same value) |
| card | `--sk-surface` |
| text | `--sk-text` |
| primary | `--sk-primary` |
| secondary | `--sk-border-strong` |
| accent | `--sk-accent` |

Note `secondary` had no real role — `App.css:1009` was misusing it as a button border.

**Add the contrast guard here.** `sanitizeAppearance` validates shape only, so a user can
already save and cloud-sync an unreadable preset. Reject (or auto-nudge) any custom value
that drops `--sk-text` on `--sk-surface` below 4.5, or `--sk-text-on-accent` on
`--sk-primary` below 4.5. The `--sk-text-on-accent` check is the one that catches the live
`minimal`-preset bug — invisible button labels shipping today.

---

## Step 4 — The `App.css` sweep

This is the biggest mechanical step, and it is all in CSS, not JSX.

1. **388 color literals → `var(--sk-*)`.** Mostly mapping onto `--sk-surface`,
   `--sk-border`, `--sk-text-*`. The clusters (`#dde3ea`, `#e5e7eb`, `#e2e8f0`, `#d0d7e2`,
   `#cbd5e1`, `#d9e2ec`) are all one role: `--sk-border`.

2. **29 `box-shadow:` declarations → `var(--sk-shadow-1|2|3)`.** Do **not** carry the five
   brand tints (`rgba(124,58,237,…)`, `rgba(37,99,235,…)`, `rgba(115,64,182,…)`) across —
   they're the mess being replaced. Each skin's shadow derives from its own
   `--sk-shadow-color` channels, so there is nothing per-skin to author.

3. **Remove the hammer.**

```css
/* delete this */
.app-root button {
  background: var(--primary) !important;
  color: var(--primary-contrast, #fff) !important;
  border-color: var(--primary-border, transparent) !important;
}
```

   Replace with opt-in variants, and delete the two opt-outs that exist to escape it
   (`.status-tag-menu-button`, `.status-tag-neutral-button`):

```css
.btn         { padding: var(--sk-btn-y) var(--sk-btn-x); border-radius: var(--sk-radius); border: 1px solid transparent; }
.btn--filled { background: var(--sk-primary); color: var(--sk-text-on-accent); }
.btn--filled:hover { background: var(--sk-primary-hover); }
.btn--quiet  { background: var(--sk-surface-2); color: var(--sk-text-secondary); border-color: var(--sk-border); }
.btn--danger { background: var(--sk-danger-text); color: var(--sk-surface); }
.btn[disabled] { background: var(--sk-surface-3); color: var(--sk-text-subtle); border-color: var(--sk-border); }
```

   Note the disabled state uses real colors, not `opacity: 0.6` — opacity reads badly on
   dark skins. Budget a pass over every `<button>` that currently relies on the hammer;
   the 15 portal buttons never received it, so they're already the "unstyled" baseline and
   tell you what the variants need to cover.

4. **`--primary-contrast` dies here.** It was aliased to `--color-text`. Use
   `--sk-text-on-accent`, which every skin authors explicitly and the checklist verifies.

Then repeat for `MobileApp.css` — it already has 207 `var()` calls and is the best-tokenized
file in the repo, so it's mostly a rename.

---

## Step 5 — The four pockets

**Scrims (~12).** Replace each hardcoded backdrop string with the shared class:

```diff
- className="fixed inset-0 bg-black/40 backdrop-blur-md flex items-center justify-center p-4 z-[10010]"
+ className="sk-scrim fixed inset-0 flex items-center justify-center p-4 z-[10010]"
```

Same for the one inverted `bg-white/80`. `.sk-scrim` ships in `skins.css`.

**Family Tree.** `familyTree.css` declares `--ft-purple*` in a global `:root` despite a
comment claiming isolation. Point them at the series roles and scope them properly:

```css
.ft-page {
  --ft-purple:        var(--sk-series-4);
  --ft-purple-light:  var(--sk-surface-2);
  --ft-purple-medium: var(--sk-series-6);
  --ft-purple-border: var(--sk-border);
}
```

Then `FamilyTreeCanvas.jsx`'s eight role colors and `SnakeNode.jsx`'s six gradients become
series reads — `sire → --sk-series-1`, `dam → --sk-series-2`,
`offspring → --sk-series-3`, `selected → --sk-series-4`, `sibling → --sk-series-5`,
`ancestor → --sk-series-6`. React Flow's `<Background color>` and minimap take
`--sk-border` / `--sk-surface-2`. This is the one pocket that needs JSX edits — about 20
sites, all in one feature folder.

**SVG chart chrome.** `WeightTrendMiniChart` (`App.jsx:16062-16090`): `fill="#f8fafc"` →
`var(--sk-surface-2)`, `stroke="#e2e8f0"` → `var(--sk-border)`, point `fill="#fff"` →
`var(--sk-surface)`. The series stroke is already themeable.

**Freeze the non-DOM surfaces deliberately.** The 13 backend email templates, the jsPDF
certificates and labels, the Capacitor splash/status bar, and the PWA manifest all stay on
the `default` palette. Write that down in `VISUAL_LANGUAGE.md` as a decision, not an
omission — a breeder's personal skin should not change what their customers receive by
email. One consequence to flag in the UI: `html2canvas` exports **will** bake the active
skin into shared images.

Also fix the two loose ends the audit found while you're here: `serpentora-logo.svg` should
use `currentColor` (or ship a mono variant), and `index.html` only loads 2 of the 6 fonts
the settings panel offers — including the two the accessibility presets specify.

---

## Step 6 — Lock it down

**Contrast test.** Parse `skins.css`, assert the checklist. This is the only thing standing
between users and an unreadable custom preset, and it's cheap:

```js
// skins.contrast.test.js
const THRESHOLDS = [
  ['--sk-text',           '--sk-surface',   4.5],
  ['--sk-text-muted',     '--sk-surface',   4.5],   // the 334-site role
  ['--sk-text-secondary', '--sk-surface-2', 4.5],
  ['--sk-text-on-accent', '--sk-primary',   4.5],   // catches the live bug
  ['--sk-focus',          '--sk-surface',   3.0],
  ['--sk-focus',          '--sk-primary',   3.0],
  ['--sk-border',         '--sk-surface',   1.5],
];
```

Ratios in `skins.contrast.txt` are the expected values — all 12 skins pass today.

**Lint the invariant.** A hex literal outside `skins.css` fails CI:

```
no-restricted-syntax / stylelint color-no-hex, with skins.css the only exception
```

**Update `VISUAL_LANGUAGE.md`** — it already documents the contract the code was violating.
It becomes accurate for the first time, plus: how to author a skin (one block, 25 roles,
run the test), and which surfaces are frozen on `default`.

---

## Order of value, if you can't do all six

1 + 2 gets you a correct foundation and kills the flash — half a day, no visible change.
3 makes skin switching real. **4 is where the app actually starts looking skinned** — until
the `App.css` sweep and the button hammer are done, dark skins still show light cards. 5 and
6 are polish and safety, and can trail a release behind.
