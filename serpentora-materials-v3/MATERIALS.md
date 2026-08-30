# Materials — installing the ten directions as skins

Companion to `materials.css`, `skins.css`, `tw-bridge.css` and the two test files.

**Source files live at `D:\Git Clone\Breeding-planner\serpentora-materials-v3`.**
Read them from that folder — do not regenerate or hand-write them; copy them to the
destinations in Step 1.

---

## The one thing to understand first

You asked for the ten mockups "as skins". They can't be — and the reason shapes the whole
package.

A skin is a flat block of colour values. A texture, a four-layer shadow, a bevel and a
type pairing are not values; they're component CSS. Pressing type *into* vellum needs a
`text-shadow` with two offsets. Glass needs a lit top edge and a dark bottom edge, which is
two more shadow layers. None of that fits in a `--sk-*` variable.

So material is a **second, orthogonal axis**:

```html
<html data-skin="deep-canopy" data-material="soapstone">
```

| layer | owns | file |
|---|---|---|
| skin | hue, text, status, data series | `skins.css` |
| material | texture, depth, radius, bevel, type | `materials.css` |

18 skins × 10 materials. Every material surface is built with `color-mix()` over the skin's
own `--sk-bg` / `--sk-surface`, so **no material hardcodes a hue** — switching skin still
moves colour, switching material still changes only feel. That's why all ten mockups read
green-and-yellow despite being ten different materials.

**The honest caveat:** four of the ten are paper (vellum, journal, vitrine, rattan). A
paper card face is light *by definition* — that's what paper is. On a dark skin those read
as light cards in a dark room. Legible (the material supplies its own ink) but a different
product than the skin promises. That's the compatibility table below, and it's a real
constraint rather than something to engineer away.

---

## Step 1 — Install

```
materials.css               →  breeding-app-shared/src/styles/materials.css
materials-bridge.css        →  breeding-app-shared/src/styles/materials-bridge.css
skins.css                   →  breeding-app-shared/src/styles/skins.css
tw-bridge.css               →  breeding-app-shared/src/styles/tw-bridge.css
skins.contrast.test.js      →  breeding-app-shared/src/styles/__tests__/
materials.compat.test.js    →  breeding-app-shared/src/styles/__tests__/
```

**breeder** (`src/index.css`) — order matters, materials last:

```css
@import "tailwindcss";
@import "@breeding/shared/styles/skins.css";
@import "@breeding/shared/styles/tw-bridge.css";   /* AFTER tailwindcss */
@import "@breeding/shared/styles/materials.css";   /* AFTER skins */
@import "@breeding/shared/styles/materials-bridge.css";   /* LAST */
```

**admin / lab / marketplace / public** — `skins.css`, `materials.css`,
`materials-bridge.css`. No `tw-bridge.css` (no Tailwind), but the material bridge is
still wanted: its `@theme` block is simply inert there while the selector rules work.

### Why there are two material files

`materials.css` styles `.mt-shell`, `.mt-card`, `.mt-btn`, `.mt-well`, `.mt-chip`. Your
components don't carry those classes, so setting `data-material` on its own changes only
the few elements that happen to have one — you get the skin's ground and maybe the
wordmark, and **none of the texture, card faces or bevels.** If blueprint looks like a
flat dark-teal app rather than a cyanotype, that's this.

`materials-bridge.css` maps the `--mt-*` variables onto selectors you already have, the
same way `tw-bridge.css` did for colour. It gets you roughly 80% with no JSX edits.

**The bridge's selectors are guesses from the audit's findings.** Real, but your card
markup may differ — every block is labelled with what it targets. Comment out anything
that misfires and add the `.mt-*` class to that component instead: the bridge is the fast
path, the classes are the precise one.

**Two prerequisites, both from `FIXES.md`:**

- **Fix 1** — while `.app-root` carries an inline `background-color`, no shell texture can
  appear. Inline style beats every rule in this file; that is not overridable from CSS.
- **Fix 2** — while the `.app-root button { … !important }` hammer exists, no material
  bevel reaches a button.

Neither is optional. The material layer is mostly invisible until both are done.

Four things the bridge genuinely can't do, which need the real classes:
the vitrine's frame > case > mount stack, lacquer's sheen band (it needs `::after` on a
positioned shell), seams on panels that aren't `rounded-*`, and anything drawn on
`<canvas>` — Family Tree, charts and QR take no CSS, so pass the `--mt-*` / `--sk-*`
values into them from JS.

**Fonts.** The materials use four display faces beyond what the app loads today. Add to
every `index.html` — and note the audit already found that only 2 of the 6 fonts the
settings panel offers are actually loaded, so this needs doing regardless:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400..700&family=Cormorant+Garamond:wght@400;500;600&family=Inconsolata:wght@400;500;600&family=Space+Grotesk:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
```

| material | needs |
|---|---|
| vellum, soapstone, moss-relief, lacquer, rattan, basalt, terrarium-glass | Fraunces |
| journal, vitrine | Cormorant Garamond |
| blueprint | Inconsolata |

**Installing `materials.css` without setting `data-material` changes nothing** — the
`:root` block is a flat fallback that reproduces current appearance. Same no-op discipline
as `default` in the skin layer. Verify that before going further.

---

## Step 2 — Write the attribute

In `AppearanceContext.jsx`, beside the line that already sets `data-skin`:

```js
root.dataset.skin     = appearanceState.preset;
root.dataset.material = appearanceState.material || 'flat';
```

And in the pre-paint script in each `index.html`, so material doesn't flash either:

```html
<script>
  try {
    var a = JSON.parse(localStorage.getItem('breedingPlannerAppearance.v2') || '{}');
    document.documentElement.dataset.skin = a.preset || 'default';
    document.documentElement.dataset.material = a.material || 'flat';
  } catch (e) {}
</script>
```

`'flat'` has no block, which is the point — it lands on the `:root` fallback.

Add to the preset list:

```js
const MATERIALS = {
  flat:              { key: 'flat',              label: 'Flat',                 tone: 'surface' },
  vellum:            { key: 'vellum',            label: 'Vellum & Letterpress', tone: 'paper'   },
  terrariumGlass:    { key: 'terrarium-glass',   label: 'Terrarium Glass',      tone: 'surface' },
  journal:           { key: 'journal',           label: 'Field Journal',        tone: 'paper'   },
  soapstone:         { key: 'soapstone',         label: 'Carved Soapstone',     tone: 'surface' },
  vitrine:           { key: 'vitrine',           label: 'Museum Vitrine',       tone: 'paper'   },
  mossRelief:        { key: 'moss-relief',       label: 'Moss Relief',          tone: 'surface' },
  blueprint:         { key: 'blueprint',         label: 'Botanical Blueprint',  tone: 'surface' },
  lacquer:           { key: 'lacquer',           label: 'Lacquer & Inlay',      tone: 'surface' },
  rattan:            { key: 'rattan',            label: 'Woven Rattan',         tone: 'paper'   },
  basalt:            { key: 'basalt',            label: 'Basalt & Gold Seam',   tone: 'surface' },
};
```

---

## Step 3 — Gate the picker

180 pairs exist; not all of them should ship. Filter the material list by the active skin
rather than letting users find the bad combinations themselves:

```js
import { POLICY } from './materials.compat.test.js';   // or copy the table

const LIGHT_SKINS = ['default','bamboo-daylight','sandstone-vivarium','glasshouse-mint','field-daylight'];
const HC_SKINS    = ['high-contrast-forest'];

export function getAllowedMaterials(skinId) {
  const kind = HC_SKINS.includes(skinId) ? 'hc'
             : LIGHT_SKINS.includes(skinId) ? 'light' : 'dark';
  return Object.entries(POLICY)
    .filter(([, p]) => p[kind] !== 'no')
    .map(([id]) => id);
}
```

### Compatibility table

`ok` ships · `review` needs a look before shipping · `no` must not be offered

| material | tone | dark skins | light skins | high-contrast-forest |
|---|---|---|---|---|
| Vellum | paper | review | **ok** | no |
| Terrarium Glass | surface | **ok** | no | no |
| Field Journal | paper | review | **ok** | no |
| Carved Soapstone | surface | **ok** | review | **ok** |
| Museum Vitrine | paper | **ok** | review | no |
| Moss Relief | surface | **ok** | review | no |
| Botanical Blueprint | surface | **ok** | no | no |
| Lacquer & Inlay | surface | **ok** | no | no |
| Woven Rattan | paper | review | **ok** | no |
| Basalt & Gold Seam | surface | **ok** | review | **ok** |

Why the `no`s are `no`:

- **Glass, blueprint, lacquer on light skins.** All three get their depth from light edges
  against a dark ground. On a light skin there's nothing for the highlight to read against
  and they collapse to flat panels — worse than `flat`, because the bevels still cost
  contrast.
- **Everything except soapstone and basalt on `high-contrast-forest`.** That skin exists to
  clear 7:1. Texture, translucency and soft shadows all reduce effective contrast, so
  pairing them fights the skin's only job. Soapstone and basalt survive because their depth
  is opaque bevels, which don't touch the text/background pair.
- **Moss Relief on the AAA skin** is the sharpest case: it's low-contrast *by construction*.
  The two are opposites.

---

## Step 4 — Use the classes

The material layer ships component classes so the app doesn't repeat shadow stacks. Each
reads only `--mt-*` and `--sk-*`, so it's correct for every pair without knowing either.

```jsx
<div className="mt-shell">
  <div className="mt-wordmark">Serpentora</div>

  <button className="mt-btn mt-btn--primary">+ Add animal</button>
  <button className="mt-btn mt-btn--ghost">Export QR</button>

  <div className="mt-card">
    <h2 className="mt-display">Athena</h2>
    <div className="mt-label">BP-2024-0142 · Hatchlings 2026</div>

    <div className="mt-well">
      <div className="mt-display">14</div>
      <div className="mt-label">offspring</div>
    </div>

    <span className="mt-chip">Pastel</span>
  </div>
</div>
```

| class | role |
|---|---|
| `.mt-shell` | the page ground — texture, blend, ambient shadow |
| `.mt-card` | a panel — bevel, lift, optional tilt and blur |
| `.mt-card--seam` | adds the accent rule (basalt's gold seam, lacquer's inlay) |
| `.mt-well` | recessed container — stat cells, inputs, list wells |
| `.mt-btn` + `--primary` / `--quiet` / `--ghost` / `--danger` | buttons; `--primary` sets `--sk-text-on-accent` itself, so audit R2 can't recur through this layer |
| `.mt-chip` | morph tags, status pills |
| `.mt-display` / `.mt-label` / `.mt-wordmark` | the type roles, including the engrave/emboss `text-shadow` |
| `.mt-case` | vitrine only — the inner case between brass frame and mount |

Two materials need one extra wrapper:

```jsx
{/* vitrine: brass frame > case > linen mount */}
<div className="mt-shell"><div className="mt-case"><div className="mt-card">…</div></div></div>

{/* basalt / lacquer: the seam */}
<div className="mt-card mt-card--seam">…</div>
```

---

## Step 5 — Verify

```bash
node materials.compat.test.js     # contract + the matrix
node skins.contrast.test.js       # 18 skins, unchanged from v2
```

`materials.compat.test.js` checks what a static test honestly can:

- every material declares the full `--mt-*` contract (a missing variable means one pair
  silently falls back to flat in one place, which is miserable to debug),
- `--mt-tone` matches the policy table,
- no surface material hardcodes a hex where it should `color-mix()` over a skin role,
- the policy table and the CSS agree on the material list — a picker offering a material
  with no block renders the fallback.

**What it can't check:** the material layer is `color-mix()`, `box-shadow` and
`background-blend-mode`, none of which resolve outside a browser. So the perceptual half is
still your DOM audit script — point it at every pair marked `review`, plus `ok` pairs on the
paper materials, since those are the ones where a light card face meets a dark skin's text
tokens.

Add both to CI. And keep the hex-literal lint from the v2 package: `materials.css` is now
the second and last file allowed to contain one.

---

## Cost, if you're picking one

**Cheapest** — `soapstone`, `basalt`, `moss-relief`. One bevel recipe, no imagery, no extra
wrapper. A day each to apply across the five screens.

**Middle** — `vellum`, `lacquer`, `rattan`, `blueprint`, `terrarium-glass`. Each wants some
care: vellum's debossed type needs checking at every font size; lacquer's sheen needs the
reduced-motion path (shipped); blueprint changes the type system wholesale.

**Most expensive** — `journal`, `vitrine`. Both want real photography and per-card
placement to look intentional rather than gimmicky. The vitrine frame also costs real
vertical space on a phone, which matters for the Capacitor build.

My recommendation stands from the mockups: **`soapstone` or `basalt`** if you want depth
that's cheap and calm, **`lacquer`** if you want the app to look expensive, **`vellum`** if
breeders will stare at it for hours. And `flat` should stay the default — the material axis
is worth shipping as a preference, not as a mandate.
