# serpentora-materials v3

Two-axis appearance system for the Breeding Planner suite:
**18 skins × 10 materials**, plus the audit remediation from v2.

Expected at `D:\Git Clone\Breeding-planner\serpentora-materials-v3`.

## Start here

**`MATERIALS.md`** — the five-step rollout, the compatibility matrix, and the cost
breakdown per material.

Read its first section before anything else. The ten mockups can't be skins: a texture,
a four-layer shadow and a type pairing aren't colour values, they're component CSS. So
material is a second axis on `<html>`:

```html
<html data-skin="deep-canopy" data-material="soapstone">
```

| layer | owns | file |
|---|---|---|
| skin | hue, text, status, data series | `skins.css` |
| material | texture, depth, radius, bevel, type | `materials.css` |

Every material mixes its surfaces over the skin's own `--sk-bg` / `--sk-surface`, so no
material hardcodes a hue — that's why all ten mockups read green-and-yellow.

## Files

| file | destination |
|---|---|
| `materials.css` | `breeding-app-shared/src/styles/materials.css` |
| `materials-bridge.css` | `breeding-app-shared/src/styles/materials-bridge.css` — makes the material land without adding classes |
| `skins.css` | `breeding-app-shared/src/styles/skins.css` |
| `tw-bridge.css` | `breeding-app-shared/src/styles/tw-bridge.css` — breeder only, after `tailwindcss` |
| `materials.compat.test.js` | `breeding-app-shared/src/styles/__tests__/` |
| `skins.contrast.test.js` | `breeding-app-shared/src/styles/__tests__/` |
| `skins.contrast.txt` | reference — measured ratios, 18 skins |
| `MATERIALS.md` | the rollout |

Import order: `tailwindcss` → `skins.css` → `tw-bridge.css` → `materials.css` →
`materials-bridge.css`.

**If a material looks almost unchanged, you're missing the bridge** — or one of the two
prerequisites in `FIXES.md`. `materials.css` styles `.mt-*` classes your components don't
have; `materials-bridge.css` maps the same variables onto selectors you already use.
And no shell texture can appear while `.app-root` carries its inline `background-color`
(Fix 1), nor any button bevel while the `!important` button hammer exists (Fix 2).

## The ten materials

| id | from | tone |
|---|---|---|
| `vellum` | Vellum & Letterpress — type pressed into paper | paper |
| `terrarium-glass` | Terrarium Glass — lit and shadowed pane edges | surface |
| `journal` | Field Journal — cloth board, gummed labels, tipped-in cards | paper |
| `soapstone` | Carved Soapstone — chiselled bevels, no gloss | surface |
| `vitrine` | Museum Vitrine — brass frame, linen mount, spotlight | paper |
| `moss-relief` | Moss Relief — soft raised pads, light off-centre | surface |
| `blueprint` | Botanical Blueprint — cyanotype, tracing-paper overlays | surface |
| `lacquer` | Lacquer & Inlay — brass hairlines, one sheen band | surface |
| `rattan` | Woven Rattan — interlaced warp and weft | paper |
| `basalt` | Basalt & Gold Seam — matte stone, one gold seam | surface |

Plus `flat` — no block, lands on the `:root` fallback, reproduces current appearance.
**Installing `materials.css` without setting `data-material` changes nothing.**

## Not all 180 pairs ship

Four materials are paper, and a paper card face is light by definition. On a dark skin
they read as light cards in a dark room — legible, but a different product than the skin
promises. And glass, blueprint and lacquer get their depth from light edges against a
dark ground, so on a light skin they collapse to flat panels.

`MATERIALS.md` carries the full matrix and a `getAllowedMaterials(skinId)` helper for the
picker. Short version: 8 of 10 materials suit dark skins; 4 suit light skins; only
`soapstone` and `basalt` belong on `high-contrast-forest`, because their depth is opaque
bevels that don't touch the text/background pair.

## Verify

```bash
node materials.compat.test.js     # contract + matrix
node skins.contrast.test.js       # 18 skins
```

The material test checks structure and policy, not perception — `color-mix()`,
`box-shadow` and `background-blend-mode` don't resolve outside a browser. Keep your DOM
audit script for the pairs marked `review`.

## Invariant

A hex literal outside `skins.css` and `materials.css` is a bug.
