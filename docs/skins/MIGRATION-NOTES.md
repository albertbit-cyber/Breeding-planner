# Skin system — migration notes

> **Updated for materials v3 (24 Aug 2026)** — see §7. Previously updated for skins v2: The v2 package (`serpentora-skins-v2`)
> is installed and audit findings R1–R9 are applied. See §5 for what changed and
> §6 for the one v2 claim that does not hold.

What changed, what it costs, and the three places the rollout doc's plan had to
be adjusted against the actual codebase.

Branch: `feature/appearance-theming`. Companion docs:
[`SKINS_IMPLEMENTATION.md`](./SKINS_IMPLEMENTATION.md) (the plan),
[`../audits/THEMING_RETROFIT_AUDIT.md`](../audits/THEMING_RETROFIT_AUDIT.md) (why),
[`../audits/SKIN_ARCHITECTURE.md`](../audits/SKIN_ARCHITECTURE.md) (the shape).

---

## 1. Three deviations from the plan

### 1.1 Import path: relative, not `@breeding/shared`

The plan specified `@import "@breeding/shared/styles/skins.css"`. That specifier
cannot resolve in this repo:

- the package is named `breeding-app-shared`, not `@breeding/shared`
- the root `package.json` has no `workspaces` field
- no app declares the shared package as a dependency
- breeder's `src/` contained zero references to it

A Vite alias would not have worked for the breeder either: the Tailwind v4 Vite
plugin resolves `@import` with its own resolver **before** Vite sees the file,
so Vite aliases are invisible at that point. Relative paths satisfy both
resolvers with no config:

```css
/* breeding-app-breeder/src/index.css */
@import "tailwindcss";
@import "../../breeding-app-shared/src/styles/skins.css";
@import "../../breeding-app-shared/src/styles/tw-bridge.css";   /* AFTER tailwindcss */
```

If npm workspaces are added later, switching to a package specifier is a
five-line change.

### 1.2 `default` is exempt from the contrast test

The plan said "all 12 skins pass today" and `skins.contrast.txt` reported
"failures: none" — but the fixture listed only **11** rows. `default` was
absent, and measuring it explains why:

| pair | ratio | threshold |
|---|---|---|
| `--sk-text-on-accent` on `--sk-primary` | **2.77** | 4.5 |
| `--sk-focus` on `--sk-surface` | **2.14** | 3.0 |
| `--sk-focus` on `--sk-primary` | **1.29** | 3.0 |
| `--sk-border` on `--sk-surface` | **1.26** | 1.5 |

This is not a defect in the skin. `default` reproduces the interface as it
ships, and the shipped interface really does put white on `#0ea5e9` (2.77:1)
and `#e5e5e5` borders on white (1.26:1). Holding `default` to the contract
would mean changing the current look, which is the one thing it must not do.

So `default` is exempt, the exemption is documented at its definition in
`contrast.mjs`, and a test asserts the exemption list never grows beyond that
one entry. **The four numbers above are real accessibility debt in the shipped
product** and should be fixed on their own terms, not hidden by widening the
exemption.

### 1.3 High contrast needed a 13th block

Step 3 deletes `HIGH_CONTRAST_COLORS` from `AppearanceContext.jsx` and suggests
keeping `themeMode: 'high-contrast'` as an orthogonal modifier — but `skins.css`
had no `[data-theme-mode="high-contrast"]` block, so selecting it would have
changed nothing at all.

One was authored and appended after every skin block (equal specificity, later
wins, so it layers over any skin). Its primary is a restrained amber rather
than the old `#ffb100`: the focus ring must clear 3:1 against both the primary
fill and the black surface while `--sk-text-on-accent` clears 4.5:1 against the
fill, which only holds for a primary with relative luminance between ~0.18 and
~0.30. It passes all 11 pairs — see the fixture.

The old `visualImpaired` preset carried non-colour settings too (xlarge type,
spacious density, reduced motion). The high-contrast toggle now applies the
type and motion parts, so users who relied on it are not dropped onto a
mid-contrast jungle skin.

---

## 2. Step 1 is a no-op for neutrals, not for semantics

The plan's gate was "the app must look pixel-identical." Measured against
Tailwind 4.3.1's actual compiled palette, **the neutral ramp is a true no-op**
but 13 mappings shift. Roughly 290 call sites change colour:

| tw variable | stock v4 | default skin | sites | note |
|---|---|---|---|---|
| `--color-white` | `#fff` | `#ffffff` | 133 | identical |
| `--color-neutral-50` | `#fafafa` | `#fafafa` | 88 | identical |
| `--color-neutral-100` | `#f5f5f5` | `#f5f5f5` | — | identical |
| `--color-neutral-200` | `#e5e5e5` | `#e5e5e5` | 28 | identical |
| `--color-neutral-300` | `#d4d4d4` | `#d4d4d4` | — | identical |
| `--color-neutral-500` | `#737373` | `#737373` | 334 | identical |
| `--color-neutral-700` | `#404040` | `#404040` | 64 | identical |
| `--color-neutral-900` | `#171717` | `#171717` | 33 | identical |
| `--color-neutral-400` | `#a1a1a1` | `#a3a3a3` | 10 | imperceptible |
| `--color-neutral-600` | `#525252` | `#404040` | 56 | slightly darker |
| `--color-neutral-800` | `#262626` | `#171717` | 23 | slightly darker |
| `--color-rose-600` | `#ec003f` | `#991b1b` | **28** | **most visible** |
| `--color-rose-200` | `#ffccd3` | `#fca5a5` | 6 | visible |
| `--color-amber-700` | `#bb4d00` | `#92400e` | 8 | visible |
| `--color-amber-200` | `#fee685` | `#fde68a` | 10 | imperceptible |
| `--color-emerald-50` | `#ecfdf5` | `#f0fdf4` | 4 | imperceptible |
| `--color-emerald-700` | `#007a55` | `#166534` | — | visible |
| `--color-sky-400` | `#00bcff` | `#38bdf8` | 4 | visible |
| `--color-sky-600` | `#0084d1` | `#0284c7` | 3 | subtle |
| `--color-sky-700` | `#0069a8` | `#0284c7` | — | visible |
| `--color-violet-500` | `#8e51ff` | `#7c3aed` | 5 | visible |

Cause: Tailwind v4.1+ ships an oklch/P3 palette that is more saturated than the
classic hex values the skins use (`#991b1b` is v3 `red-800`). The shift is also
a *unification* — the app previously used two different reds for one idea
(`text-rose-600` `#ec003f` in JSX, `#991b1b` in the status tokens). One role
cannot be both, so a perfect no-op was never available while unifying them.

**Expect `text-rose-600` error text to go from bright crimson to dark brick
red.** That is the largest single visual change in Step 1.

---

## 3. What was done

| Area | Result |
|---|---|
| `skins.css` | 12 skins + high-contrast modifier, in `breeding-app-shared/src/styles/` |
| `tw-bridge.css` | re-points Tailwind's palette; converts ~2,000 utility sites with no JSX edits |
| Imports | all 5 apps, relative paths; legacy `--color-*` kept as read-through aliases for one release |
| `AppearanceContext` (breeder) | 628 → 512 lines; **zero colour literals**; writes `data-skin` |
| `AppearanceContext` (admin/lab/marketplace) | 544 → 83 lines each, all three sharing `applySkin.mjs` |
| `App.css` | 388 literals + 28 shadows → `var(--sk-*)`; **every** remaining hex is a `var()` fallback |
| `MobileApp.css` | literals + 231 legacy `--color-*` references remapped |
| Button hammer | `.app-root button { … !important }` deleted; `.btn--filled/quiet/danger` variants added |
| `--primary-contrast` | retired for `--sk-text-on-accent` — fixes the invisible-label bug |
| Scrims | 15 rewritten to `.sk-scrim` |
| Family Tree | `--ft-purple*` scoped and routed at series roles; 21 JSX colour sites converted |
| SVG chart chrome | plot area, baseline, point fill → skin roles |
| Dead code | `AuthShell.jsx` (second `AppearanceProvider`, zero importers) deleted |
| FOUC | blocking pre-paint script in all 5 `index.html`; `theme-color` + manifests set to `#f6f7f9` |
| Fonts | all 6 offered families now actually loaded (was 2 of 6) |
| Density / radius / motion | the three dead `<html>` attributes now have CSS that reads them |

### Verification

```
breeder     build ✓   typecheck ✓   80 tests ✓
admin       build ✓
lab         build ✓
marketplace build ✓
public      build ✓
shared      147 contrast tests ✓   enforced failures: 0
```

Confirmed in the production bundle, not just in theory:

```css
--color-neutral-500:var(--sk-text-muted)
.text-neutral-500{color:var(--color-neutral-500)}
.bg-white,.bg-white\/70{background-color:var(--color-white)}
```

All 12 `[data-skin=…]` blocks, the high-contrast block, and `.sk-scrim` are
present in `build/assets/index-*.css`.

---

## 4. Known gaps

1. **No visual-regression baseline.** Playwright is configured but has no
   `toHaveScreenshot` assertions anywhere, so "pixel-identical" was verified by
   reasoning about the compiled palette (§2), not by comparing renders. Worth
   adding before the next sweep.

2. **~486 buttons were never individually reviewed.** The hammer was replaced
   with a narrow `:where()` baseline that deliberately skips any button already
   carrying a Tailwind background utility or a `.btn` variant, so styled buttons
   keep exactly what they had. Buttons that depended on the hammer now get a
   neutral skin-aware default. A pass to assign real variants is still owed.

3. **Non-DOM surfaces are frozen on `default` by design** — 13 backend email
   templates, jsPDF certificates and labels, the Capacitor splash/status bar
   (`#07110d`), and the PWA manifest. A breeder's personal skin should not
   change what their customers receive by email. Note that `html2canvas`
   exports **will** bake the active skin into shared images.

4. **`serpentora-logo.svg` still has baked brand colour** (`#00a551`,
   `#0971b8`). It needs a `currentColor` variant or a mono version.

5. **The stylelint rule is not wired up.** The invariant — a hex literal outside
   `skins.css` is a bug — now holds in `App.css` and `MobileApp.css`, but
   nothing enforces it in CI yet.

6. **Old presets do not migrate.** `minimal`, `highContrast`, `visualImpaired`,
   `darkBreeder`, `editorial`, `softPastel` are retired; `sanitizeAppearance`
   falls back to `default` for anything unrecognised, which also covers stale
   cloud-synced state. `highContrast` and `visualImpaired` are the exception —
   they map to the high-contrast theme mode rather than being dropped. Existing
   users on the other four land on `default` at next load; a one-time notice
   pointing at the new picker would be kinder than a silent reset.


---

## 5. skins v2 — audit findings R1–R9

Installed from `serpentora-skins-v2`: 18 skins, three new roles (`--sk-brand`,
`--sk-primary-quiet`, `--sk-primary-quiet-text`), series respaced 60° apart, and
shared `.sk-btn` / `.sk-scrim` / `.sk-wordmark` classes.

| # | Finding | What was done |
|---|---|---|
| R1 | frozen inline `color` + `background-color` on `.app-root` | `appRootStyle` deleted; `html, body` inherit from skins.css. **The single biggest fix.** In this codebase it was worse than the audit described: `resolvedAppearance.colors` no longer existed after the v1 refactor, so both values were always the hardcoded `#f6f7f9` / `#0f172a` fallbacks |
| R2 | filled buttons never set their foreground | every `--sk-primary` fill now pairs `--sk-text-on-accent`; `.appearance-btn--filled` was still on `--sk-text`; 17 `text-white`-on-coloured-fill sites moved to `.sk-on-accent` |
| R3 | wordmark `text-[#3c1b73]` | `.sk-wordmark` / `--sk-brand`; the strapline `text-[#8257b1]` went to secondary |
| R4 | `-50` tints inside themed panels | bridge extended so every `-50` background has its paired text ramp (`red-700/800/900`, `rose-50/700/800`, `amber-800/900`, `emerald-*`, `sky-800/900`, `violet-100/200/700/800`, `pink-700`) |
| R5 | `#0f172a` baked into twelve rules | all 9 remaining `rgba(15,23,42,…)` swapped; the modal CTA now uses `--sk-primary-quiet` |
| R6 | muted text/icons on the raw ramp | `text-neutral-300` → `-400`; stat captions → muted; "(Mock data)" → warning; sex glyphs already on `.sk-sex-*` |
| R7 | sky accent leaking through every skin | Cards/List toggle → `.sk-tab-active`; disabled controls use real colours with `opacity: 1` forced, covering the ~34 `disabled:opacity-*` call sites without editing them |
| R8 | glyphs painted in their own background | 🌳 tile, both avatar placeholders and the active view tab now set `--sk-text-on-accent` |
| R9 | high contrast layered as a modifier | retired as a theme mode; it is now the `high-contrast-forest` skin (AAA 7:1). Applied in all four places: `AppearanceContext`, `applySkin.mjs`, the settings UI, and the five pre-paint scripts. Legacy `highContrast` / `visualImpaired` / `themeMode: 'high-contrast'` state migrates **to that skin**, not to `default` |

Two additions beyond the list, both the same class of bug the audit describes:

- **Genetics chips** set a Tailwind background and, except for Het, *no
  foreground at all* — so the label inherited page ink and went light-on-light
  ("Pinstripe" measured 1.96:1). Now six paired `.sk-gene--*` classes.
- **`.auth-floating-chip button`** was a 15%-white pill with white text, which
  worked only while the chip was a dark slab. Once the chip followed
  `--sk-surface-2` it measured 1.04:1. Both halves now come from one ramp.

### Measured result

DOM audit (rendered foreground vs rendered background, every text node, 8 skins):

```
skin                    nodes  <4.5:1        before
default                    99       0
deep-canopy                99       0        ~440
jungle-glass               99       0        ~440
emerald-brass              99       0        ~440
obsidian-canopy            99       0
bamboo-daylight            99       0
sandstone-vivarium         99       0
high-contrast-forest       99       0
```

Disabled controls are held to 3:1 rather than 4.5 — WCAG exempts them and the
skin contract targets "visibly disabled, not invisible".

---

## 6. One v2 claim that does not hold

`skins.css` v2 and `FIXES.md` both describe `default` as a **visual no-op**. It
is not. Fourteen roles changed against v1:

| role | v1 | v2 |
|---|---|---|
| `--sk-primary` | `#0ea5e9` | `#0369a1` |
| `--sk-primary-hover` | `#0284c7` | `#075985` |
| `--sk-link` | `#0284c7` | `#0369a1` |
| `--sk-accent` | `#f59e0b` | `#b45309` |
| `--sk-focus` | `#38bdf8` | `#0ea5e9` |
| `--sk-text-subtle` | `#a3a3a3` | `#5f5f5f` |
| `--sk-series-1…6` | sky/pink/emerald/violet/amber/indigo | all darkened |

The app's primary action colour moves from sky blue to a noticeably darker blue.
That is a deliberate, defensible change — it is what fixes the 2.77:1
white-on-sky that the audit itself raises as R7 — but it is a **visible change
to the shipped look**, not a no-op, and Step 0's "verify the app looks
pixel-identical" gate cannot pass as written. Worth a product decision rather
than a silent adoption.

Separately, v2's test file ships as CommonJS while `breeding-app-shared` is
`"type": "module"`; it was converted to ESM on install. `skins.css` v2 also
dropped the `.sk-sex-*` classes two Family Tree components depend on — re-added.


---

## 7. materials v3 — the second axis

`serpentora-materials-v3` shipped `skins.css` and `tw-bridge.css` byte-identical
to v2, so this was a materials-only rollout: **18 skins × 10 materials**, with
material as a second attribute on `<html>`.

```html
<html data-skin="deep-canopy" data-material="soapstone">
```

Skin owns hue, text, status and data series. Material owns texture, depth,
radius, bevel and type. Every material surface is `color-mix()`ed over the
skin's own `--sk-bg` / `--sk-surface`, so no material hardcodes a hue.

### What was wired

- `materials.css` + `materials.compat.test.js` into `breeding-app-shared`
  (the test converted from CommonJS to ESM, as v2's was).
- Imported in all five apps, after `skins.css` (and after `tw-bridge.css` in the
  breeder).
- `MATERIALS`, `material` state, sanitisation, and `data-material` in
  `AppearanceContext`; `applySkin.mjs` and all five pre-paint scripts write it
  too, so material doesn't flash either.
- `getAllowedMaterials(skinId)` / `materialStatus()` implementing the policy
  table, and a material picker in the Appearance panel that only lists pairs the
  policy permits. **Verified: on `default` the picker offers 8 and correctly
  withholds Terrarium Glass, Blueprint and Lacquer** — the three that need a
  dark ground to read against.
- Switching skin drops a now-blocked material back to `flat` rather than
  rendering a combination the table says must not ship.
- `.mt-shell` on the app root, `.mt-card` on the `Card` primitive **and the
  animal card**, `.mt-well` on the activity tiles, `.mt-chip` on badges,
  `.mt-wordmark`, `.mt-display`, `.mt-label`.
- The display faces (Fraunces, Cormorant Garamond, Inconsolata) added to all
  five shells alongside the six the appearance panel already offered.

`.app-root` had to stop setting `background-color` / `color`: App.css is
unlayered and imported after `materials.css`, so it would have won and every
material would have rendered flat. `.mt-shell` owns them now.

### `flat` is a genuine no-op

Measured on the `default` skin: `shellBg rgb(246,247,249)`, no texture,
`cardBg rgb(255,255,255)`, Space Grotesk. Identical to the v2 baseline.

### Two measured fixes to materials.css

Both appended and clearly marked; the shipped blocks were not regenerated.

**1. Paper materials re-scope the bridge, not just `color`.** The shipped rule
sets `color` on `.mt-card`, which only reaches descendants that *inherit*.
Anything with an explicit text class does not — the Tailwind bridge maps those
to `--sk-text-*`, which on a dark skin is near-white, and near-white on a paper
face measured **1.11:1**.

Re-scoping `--sk-*` inside the card was not enough either, and the reason is a
real cascade subtlety worth recording: `--color-neutral-600: var(--sk-text-secondary)`
is declared **at `:root`**, so its reference is substituted there. Redefining
`--sk-text-secondary` deeper in the tree never reaches the utility. The
`--color-*` names have to be re-declared in the same scope. Paper-on-dark went
from 29 failures per pair to 0.

**2. Surface materials restore muted contrast.** The skins guarantee
`--sk-text-muted` ≥ 4.5:1 against `--sk-surface`; a surface material repaints
the card slightly darker, so muted landed at **4.05–4.46** on light skins.
Corrected via `--mt-muted-base`, a separate name resolved at `:root` — necessary
because `--sk-text-muted` cannot reference itself. `flat` is excluded so the
no-op stays one.

### Measured result

DOM audit over 18 skin × material pairs — the paper-on-dark risk, every
`review` pair, and the two AAA survivors:

```
skin                  material           nodes  fails
deep-canopy           vellum                99      0
deep-canopy           journal               99      0
deep-canopy           vitrine               99      0
deep-canopy           rattan                99      0
obsidian-canopy       vellum / rattan       99      0
default               soapstone / basalt    99      0
default               vitrine / moss-relief 99      0
bamboo-daylight       soapstone / basalt    99      0
high-contrast-forest  soapstone / basalt    99      0
deep-canopy           lacquer / blueprint   99      0
deep-canopy           terrarium-glass       99      0
deep-canopy           moss-relief           99      0

total failures across 18 pairs: 0
```

The skin-only audit still reports 0 on all 8 skins. `materials.compat.test.js`
reports the contract intact: 180 pairs, 101 ship, 56 review, 23 blocked.

### The judgement that has not changed

A light paper card face on a dark skin is now *legible* — but it is still a
different product than the skin promises. Fixing the contrast does not make
`vellum` on `deep-canopy` a good default; it makes it a defensible option. The
`review` marking in the policy table is a design call, not a contrast one, and
it stands.

### One correction to my own tooling

The first pair audit reported ~17 failures per paper pair that did not exist.
`color-mix()` computes to `oklab()`, and the audit's colour parser only matched
`rgb()` — so the walk-up skipped the light card face and measured against the
dark shell. It now resolves any CSS colour space through a 1×1 canvas. Worth
knowing before trusting any earlier material-layer numbers.


---

## 8. materials-bridge.css (v3, second drop)

The bridge maps `--mt-*` onto selectors the app already has, so a material lands
without adding `.mt-*` everywhere. Installed last in the chain:
`tailwindcss → skins.css → tw-bridge.css → materials.css → materials-bridge.css`,
in all five apps.

### A shipped syntax bug that broke the build

`materials-bridge.css` line 245 read:

```
→ pass --mt-*/--sk-* values in JS
```

The `*/` inside `--mt-*/` **terminates the CSS comment early**, so
`--sk-* values in JS` parsed as a custom property with no value and Tailwind
failed the build with *"Invalid custom property, expected a value"*. Anyone
installing the file as-is hits this. Changed to `--mt- and --sk-`. The original
is kept at `docs/skins/materials-bridge.original.css` for comparison.

### The card selector was 100% false positives

The file asks you to confirm its selectors. Measured on the Animals screen:

```
.app-root :is(.rounded-xl,.rounded-2xl,.rounded-lg):not(button)…
    8 matches — 8 false positives, 0 real panels
    (Cards/List toggle, "Scanner ready" chip, five filter <label>s)
```

Zero real cards, because the real ones already carry `.mt-card`. Every
structural rule (card face, blueprint outline, journal tilt, basalt/lacquer
seam) is narrowed from the `rounded-*` guess to `.mt-card` — the bridge's own
recommended path. These measured clean and were kept: wells (6), buttons (42),
chips (21), small-caps labels (78), headings (4).

### The `@theme` re-point had to be scoped

The bridge re-points `--color-white` at `--mt-card-bg` in `@theme`, i.e. at
`:root`. Measured shell/card lightness on deep-canopy:

| material | shell L* | card L* |
|---|---:|---:|
| vellum | 84 | 89 |
| journal | **22** | 90 |
| rattan | **34** | 91 |
| vitrine | **−16** | 82 |

Only vellum is paper throughout. The other three are a light card on a **dark**
board, so a global re-point painted every non-card `bg-white` surface — header,
banner, wordmark — with a light paper face while the surrounding ink stayed
near-white. Measured "Serpentora" 1.04, "Logo" 1.07, "Retry" 1.02. The re-point
now applies at `.app-root .mt-card`, and the body-scope paper ink is limited to
vellum.

### Prerequisite that had to be done first

The bridge re-points `--color-white`, so `text-white` stops meaning white and
starts meaning "the card face". 37 `text-white` labels still sat on solid fills
(`bg-neutral-900`, `primaryBtnClass`) and would have become the card colour on
their own buttons. All converted to `.sk-on-accent`, which resolves to `#ffffff`
in every skin.

### Measured result

```
18 skin × material pairs        0 failures
8 skins, skin-only audit        0 failures
flat                            still a verified no-op
```

`.app-root` under blueprint computes the cyanotype grid with
`background-blend-mode: normal, normal, soft-light`, and `html`/`body`/`.app-root`
now agree on `--mt-shell-bg`.

### Vitrine

MATERIALS.md wants `.mt-shell > .mt-case > .mt-card`. The app-root's children are
inline JSX in a 26k-line component, so adding a wrapper for one material was not
worth the layout risk. The same two-element stack already exists in the document:
under `[data-material="vitrine"]`, `body` becomes the brass frame and `.app-root`
the inner case. Correct nesting, no JSX change, inert on every other material.
The shipped `border-image` approximation is dropped rather than doubled up — it
was also the only palette hex literal in the file.
