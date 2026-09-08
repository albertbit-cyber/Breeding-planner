# Fixing the audit findings

Companion to `skins.css` (v2), `tw-bridge.css`, `skins.contrast.test.js`.
Addresses **R1–R9** from the 24 Aug 2026 contrast audit, in the order the audit
prioritised them.

**Source files live at `D:\Git Clone\Breeding-planner\serpentora-skins-v2`.**
Read `skins.css`, `tw-bridge.css` and `skins.contrast.test.js` from that folder —
do not regenerate or hand-write them; copy them to the destinations in Step 0.

---

## Read this first

The audit's central finding is that **the skins were never the problem.** There is a
complete `--sk-*` token set; large parts of the UI simply never read it. Nine dark skins
failing ~440 nodes each with near-identical counts is one set of shared bugs, not nine
palette mistakes.

So: **adding skins fixes nothing.** R1 alone — one inline `color` on `.app-root` —
accounts for roughly 300 of the ~370 unreadable nodes per dark skin, and no palette can
survive it. Do R1–R5 before anything else. The six new skins in v2 are the *last* step,
not the first.

---

## Step 0 — Install v2 (visual no-op)

Copy from `D:\Git Clone\Breeding-planner\serpentora-skins-v2`:

```
skins.css                →  breeding-app-shared/src/styles/skins.css
tw-bridge.css            →  breeding-app-shared/src/styles/tw-bridge.css
skins.contrast.test.js   →  breeding-app-shared/src/styles/__tests__/skins.contrast.test.js
```

**breeder** (`src/index.css`) — order matters:

```css
@import "tailwindcss";
@import "@breeding/shared/styles/skins.css";
@import "@breeding/shared/styles/tw-bridge.css";   /* AFTER tailwindcss */
```

**admin / lab / marketplace / public** — `skins.css` only (no Tailwind, no bridge).

v2 adds three things to every skin, each traceable to a finding:

| new role | fixes | why it didn't exist |
|---|---|---|
| `--sk-brand` | R3 | the wordmark had no role, so someone wrote `text-[#3c1b73]` |
| `--sk-primary-quiet` + `--sk-primary-quiet-text` | R5 | no low-emphasis fill existed, so the modal *Add* button used `rgba(15,23,42,0.04)` and vanished |
| `--sk-series-1…6`, respaced 60° apart | — | series 1–2 were seeded from `primary` and `accent`, which collide whenever a skin picks two close hues deliberately |

The series respacing matters for R4: Family Tree maps sire / dam / offspring / selected /
sibling / ancestor onto series 1–6, so two near-identical series colours are two pedigree
roles a user cannot tell apart.

`default` is unchanged in appearance — verify the app looks pixel-identical before going on.

---

## Fix 1 — R1: the frozen inline style on `.app-root`

**~300 nodes per dark skin. One line. Do this first.**

The theme engine writes these inline, where they beat every stylesheet rule:

```
background-color: rgb(246, 247, 249)
color: rgb(15, 23, 42)
```

`--sk-text` resolves correctly and `<body>` uses it correctly — the value is simply
overridden one level down.

In `AppearanceContext.jsx`, find where the root element's `style` is set and **delete both
properties**:

```diff
- root.style.backgroundColor = resolved.colors.background;
- root.style.color           = resolved.colors.text;
```

`skins.css` already carries the replacement:

```css
html, body { background: var(--sk-bg); color: var(--sk-text); }
```

If `.app-root` must keep an explicit background, write **variables**, never values:

```js
root.style.setProperty('background-color', 'var(--sk-bg)');
root.style.setProperty('color', 'var(--sk-text)');
```

**Rule going forward: the theme engine writes custom properties only.** Components read
them. Every one of R1 and R9 comes from breaking that.

---

## Fix 2 — R2: filled buttons never set their foreground

**57 nodes per light skin.** `--sk-text-on-accent` is defined in every skin and unused.
On the light skins `--sk-primary` is a very dark green, so the labels are dark-on-dark —
the Animals toolbar renders as five blank rectangles.

Every rule that sets `background: var(--sk-primary)` **must** set
`color: var(--sk-text-on-accent)`. Use the shared class instead of repeating it:

```diff
- <button className="px-4 py-2 rounded-lg" style={{ background: 'var(--sk-primary)' }}>
+ <button className="sk-btn sk-btn--filled">
```

`skins.css` ships `.sk-btn` with `--filled`, `--quiet`, `--ghost`, `--danger` and a
`[disabled]` state that uses **real colours, not `opacity`** — opacity reads as invisible
on dark skins.

Also delete the hammer in `App.css`, which is why the 15 portal buttons look different from
everything else and why two components carry explicit opt-outs
(`.status-tag-menu-button`, `.status-tag-neutral-button` — delete those too):

```css
/* DELETE */
.app-root button {
  background: var(--primary) !important;
  color: var(--primary-contrast, #fff) !important;
  border-color: var(--primary-border, transparent) !important;
}
```

`--primary-contrast` dies with it — it was aliased to `--color-text`, which is the live bug
that makes the shipped `minimal` preset render invisible labels. Use
`--sk-text-on-accent`, which every skin authors explicitly and the test verifies.

---

## Fix 3 — R5: `#0f172a` baked into twelve component rules

The symptom worth understanding: the Add-animal modal's primary **Add** button computes to
`background rgba(15,23,42,0.04)` / `border rgba(15,23,42,0.15)` — on a dark surface that is
a 4%-alpha dark wash on dark, so the app's main creation CTA has no visible fill or border
at all and reads as loose text beside the outlined *Cancel*.

That button wanted a low-emphasis fill and there wasn't one. v2 adds it:

```diff
- background-color: rgba(15, 23, 42, 0.04);
- border-color:     rgba(15, 23, 42, 0.15);
+ background-color: var(--sk-primary-quiet);
+ color:            var(--sk-primary-quiet-text);
+ border-color:     var(--sk-border);
```

The twelve rules to sweep, all straightforward token swaps:

```
.upgrade-modal-backdrop            → .sk-scrim (see Fix 5)
.auth-overlay                      → .sk-scrim
.auth-card-brand h1                → var(--sk-brand)
.auth-primary-actions button.ghost → .sk-btn--ghost
.auth-registration-actions .ghost  → .sk-btn--ghost
.auth-field input/textarea/select  → var(--sk-surface) / var(--sk-border) / var(--sk-text)
.auth-field-label                  → var(--sk-text-secondary)
.auth-multiselect-option           → var(--sk-surface-2) / var(--sk-text)
.auth-floating-chip                → var(--sk-surface-2) / var(--sk-text)   ← the 1.14:1 pill
.appearance-btn                    → .sk-btn--ghost
.appearance-btn--ghost             → .sk-btn--ghost
.marketplace-detail                → var(--sk-surface) / var(--sk-text)
.bp-header-mobile__search input    → var(--sk-surface-2) / var(--sk-text)
```

Where a translucent wash is genuinely wanted, derive it from the token rather than a
literal: `color-mix(in srgb, var(--sk-text) 4%, transparent)`.

---

## Fix 4 — R3: the wordmark

```diff
- <div className="text-[28px] leading-tight font-semibold tracking-tight text-[#3c1b73]">
+ <div className="sk-wordmark text-[28px] leading-tight font-semibold tracking-tight">
```

`#3c1b73` measures 1.12–1.13:1 on all 17 screens of all nine dark skins — the product name
is the least readable thing on the page. Every v2 skin authors `--sk-brand`, checked against
**both** `--sk-bg` and `--sk-surface` (the wordmark appears on both). `default` keeps
`#3c1b73`, so nothing changes on the light default.

---

## Fix 5 — R4: light `-50` tints inside themed panels

Four chips and one button hardcode Tailwind `-50` backgrounds. Surrounding text is
correctly near-white on dark skins, so you get light-on-light at ~1.0:1.

`tw-bridge.css` already re-points `--color-violet-50`, `--color-pink-50`, `--color-sky-50`
and `--color-red-50` at the semantic tokens, which fixes these **without touching the
call sites**. Two still need edits, because their *foreground* is the wrong half of the
pair:

```diff
  /* Danger zone — white on near-white in ALL 12 skins; invisible today */
- className="bg-red-50 border-red-200 text-white"
+ className="sk-btn sk-btn--danger"
```

```diff
  /* Family Tree "Switch snake" selected row, and the Puri/Boris animal chips */
- className="bg-violet-50 text-white"
+ style={{ background: 'var(--sk-info-bg)', color: 'var(--sk-info-text)' }}
```

**Pair the tokens.** `--sk-danger-bg` / `--sk-danger-text`, `--sk-primary` /
`--sk-text-on-accent`, `--sk-surface` / `--sk-text` are inseparable — a rule that sets one
must set the other. That is the invariant behind R2, R4 and R5 alike.

Modal backdrops (~12) move to the shared class:

```diff
- className="fixed inset-0 bg-black/40 backdrop-blur-md flex items-center justify-center"
+ className="sk-scrim fixed inset-0 flex items-center justify-center"
```

`--color-black` is deliberately **not** overridden in the bridge — the label-preview
checkerboard and the QR renderer need true black.

---

## Fix 6 — R6: muted text and icons on the raw Tailwind ramp

The only fix needing a real sweep, ~60 nodes per skin. Most of it the bridge handles
(`text-neutral-*`, `text-sky-300`, `text-pink-300`, `text-amber-500` are all re-pointed),
but check these by hand because the bridge maps them by *ramp position*, not by intent:

| what | now | should be |
|---|---|---|
| ♂ / ♀ sex glyphs | `text-sky-300` / `text-pink-300` | `--sk-series-3` / `--sk-series-4` |
| "No record", "Unknown Sire/Dam" | `text-neutral-300` | `--sk-text-subtle` |
| Family Tree stat captions | `text-neutral-400` | `--sk-text-muted` (not subtle — they're labels, not hints) |
| "(Mock data)" | `text-amber-500` | `--sk-warning-text` |
| "Download latest snapshot" | `text-neutral-300` | `--sk-link` — it's a link |

The sex glyphs and the pedigree stat captions are the two most common, and the stat tiles
are effectively unlabelled on dark skins today.

---

## Fix 7 — R7: the sky accent that leaks through every skin

The Cards/List segmented toggle and the "Scanner ready" chip stay `#0ea5e9` under every
preset, so a green forest skin shows a sky-blue control. The bridge re-points
`--color-sky-500` → `--sk-primary`, which handles most of it. Two things it can't:

- White-on-sky measured **2.77:1** even on untouched Default. Once the fill is
  `--sk-primary`, set the label to `--sk-text-on-accent` (Fix 2) and it passes everywhere.
- The disabled "Save preset" button is **1.49:1** (`#6ec9f2` on `#0ea5e9`). Use
  `.sk-btn[disabled]`, which is `--sk-surface-3` / `--sk-text-subtle` — every skin keeps
  disabled controls above 3:1, visibly disabled rather than invisible.

---

## Fix 8 — R8: glyphs painted in their own background colour

The 🌳 tile and the "P" avatar render foreground exactly equal to background — ratio
**1.00** in all 12 skins. The glyph is simply gone.

```diff
- <div className="w-8 h-8 rounded-xl" style={{ background: c, color: c }}>
+ <div className="w-8 h-8 rounded-xl" style={{ background: c, color: 'var(--sk-text-on-accent)' }}>
```

Avatar initials on a series-coloured fill: dark skins pair series with `--sk-bg`, light
skins with `--sk-surface`. Simplest correct choice is `--sk-text-on-accent`.

---

## Fix 9 — R9: high-contrast mode

Do this **after** Fix 1, which removes most of it. What remains is architectural: today
"high contrast" drops the canvas to `#000000` while the frozen `#0f172a` ink stays put,
producing literal black-on-black — the mode that exists to help users with low vision
currently makes the least readable screen in the product.

v2's recommendation: **stop layering.** `high-contrast-forest` is a skin held to 7:1 (AAA)
on every text pair, not a modifier over an unknown base. A modifier can always land on a
palette that defeats it; a skin cannot.

```diff
- themeMode: 'high-contrast'   // multiplies over whatever skin is active
+ preset: 'high-contrast-forest'
```

If you keep a high-contrast *toggle* for discoverability, make it select that skin rather
than post-process the active one. And note what the audit exposed: retiring the old
`highContrast` / `visualImpaired` presets with no replacement costs a user something real —
`high-contrast-forest` is that replacement, and `field-daylight` is its light counterpart.

---

## Step 10 — Lock it in

**Wire the test.** `skins.contrast.test.js` parses `skins.css` and asserts the whole
contract — every text pair, the focus ring against both surface and primary, status
quartets, and series separation. Runs standalone or under vitest:

```bash
node breeding-app-shared/src/styles/__tests__/skins.contrast.test.js
npx vitest run skins.contrast
```

All 18 skins pass today; `skins.contrast.txt` holds the measured values.

One thing the test will print: `default` carries **three pinned legacy shortfalls** —
focus ring 2.77:1 on surface and 2.14:1 on primary, border 1.26:1 on surface. Those are
today's shipped values, which is the audit's own R7 point that even untouched Default
fails. They are pinned at value rather than ignored, so `default` can't drift worse and a
new failure still breaks the build. Fixing them costs the visual no-op, so it's a product
call: **fix the two focus ratios** (a focus ring nobody can see is an accessibility
failure, and the change is confined to `:focus-visible`), and leave the border until
someone owns the divider weight.

**Extend it to the DOM.** The static test can't catch R1 — the bug isn't in `skins.css`, it's
an inline style. Your audit script already does this; keep it. Run it over the 12 (now 18)
presets × the route table on every build and fail under 4.5:1. That turns the report into a
regression test.

**Lint the invariant.** These should fail CI outside the token layer, since R3, R4, R6 and
R7 all come from them:

```
text-neutral-*  text-sky-*  text-pink-*  text-amber-*  bg-*-50
text-[#...]     bg-[#...]   any hex literal outside skins.css
```

**Add the custom-preset guard.** `sanitizeAppearance` validates shape only, so a user can
save and cloud-sync an unreadable preset today. Reject or auto-nudge any custom value that
drops `--sk-text` on `--sk-surface`, or `--sk-text-on-accent` on `--sk-primary`, below 4.5 —
reuse `ratio()` exported from the test file.

**Freeze the non-DOM surfaces deliberately.** The 13 backend email templates, the jsPDF
certificates and labels, the Capacitor splash and status bar, and the PWA manifest stay on
`default`. Record that in `VISUAL_LANGUAGE.md` as a decision, not an omission — a breeder's
personal skin shouldn't change what their customers receive by email. One consequence to
surface in the UI: `html2canvas` exports **will** bake the active skin into shared images.

While you're in there: `index.html`'s `<meta name="theme-color" content="#000000">` and
`manifest.json`'s `theme_color` / `background_color` should be `default`'s `--sk-bg`
(`#f6f7f9`) — they can't be dynamic, and matching the default beats matching nothing.
`serpentora-logo.svg` should use `currentColor`, and `index.html` loads only 2 of the 6
fonts the settings panel offers — including the two the accessibility presets specify.

---

## Order, and what each step buys

| # | Fix | Root | Nodes fixed | Effort |
|---|---|---|---:|---|
| 0 | Install v2, verify no-op | — | 0 | 20 min |
| 1 | Drop the inline `color`/`background-color` on `.app-root` | R1 | ~300 per dark skin | one line |
| 2 | `--sk-text-on-accent` on every primary fill; delete the `!important` hammer | R2 | 57 per light skin | small |
| 3 | Token the twelve `#0f172a` component rules | R5 | modal CTA + auth surfaces | small |
| 4 | `--sk-brand` on the wordmark | R3 | 17 screens × 9 skins | one line |
| 5 | `-50` tints → semantic bg/text pairs; fix *Return to Defaults* | R4 | ~10, one failing on all 12 skins | small |
| 6 | Sweep `text-neutral-*` etc. through the ramp | R6 | ~60 per skin | medium |
| 7 | Theme the Cards/List toggle; fix disabled contrast | R7 | ~6 per skin | small |
| 8 | Give the 🌳 and "P" glyphs a real foreground | R8 | 2 per skin | trivial |
| 9 | High contrast becomes a skin, not a modifier | R9 | 71 on Animals alone | small after 1 |
| 10 | Tests, lint, custom-preset guard | — | prevents recurrence | half a day |

Fixes 1–5 are cheap and remove the overwhelming majority of the damage. **6 is the only one
that needs a real sweep.** Do 1 first and re-run your audit script before anything else —
it should drop the dark skins from ~440 failures to under 100, and that number tells you
whether the remaining fixes are worth doing in the order above or a different one.
