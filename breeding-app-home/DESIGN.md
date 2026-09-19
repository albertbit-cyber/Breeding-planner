---
name: Serpentora
description: The marketing site's visual world — "v6 / Jungle Glass", with a second skin, "Hatchling".
skins:
  dark:
    name: Jungle Glass
    pg: "#04100e"
    band: "#062019"
    panel: "rgba(255,255,255,0.055)"
    panel-2: "rgba(3,20,17,0.6)"
    ink: "#e8fff6"
    ink-2: "#a9d3c6"
    ink-3: "#8fc4b4"
    rule: "rgba(255,255,255,0.12)"
    rule-strong: "rgba(255,255,255,0.22)"
    accent: "#7cf5c6"
    accent-strong: "#38e8a0"
    accent-quiet: "rgba(56,232,160,0.18)"
    accent-2: "#4cc9f0"
    on-accent: "#03231c"
    warn: "#ffd166"
    cta-bg: "linear-gradient(135deg, #38e8a0, #4cc9f0)"
    cta-fg: "#03231c"
  light:
    name: Hatchling
    pg: "#fffaf0"
    band: "#f2ecff"
    panel: "#ffffff"
    panel-2: "#fff6e3"
    ink: "#1b1430"
    ink-2: "#4b4166"
    ink-3: "#6b6382"
    rule: "#e2dbf5"
    rule-strong: "#1b1430"
    accent: "#5a37e0"
    accent-strong: "#6c4cf5"
    accent-quiet: "#efe9ff"
    accent-2: "#0d80b8"
    on-accent: "#ffffff"
    warn: "#c2410c"
    cta-bg: "#6c4cf5"
    cta-fg: "#ffffff"
typography:
  dark:
    display: "Sora"
    body: "Outfit"
    mono: "DM Mono"
    display-weight: 400
    display-weight-bold: 700
    tracking: "-0.03em"
  light:
    display: "Bricolage Grotesque"
    body: "Outfit"
    mono: "DM Mono"
    display-weight: 600
    display-weight-bold: 800
    tracking: "-0.035em"
radii:
  lg: "34px (light: 36px)"
  md: "24px (light: 26px)"
  sm: "16px"
  pill: "999px"
---

# Design System: Serpentora marketing site

<!-- Written 2026-09-19, replacing the record of the retired light "Keeper's Field
     Notebook" system that shipped with `breeding-app-public`. That system is gone.
     This describes what actually ships in `src/home/v6/`. -->

## Overview

**Creative North Star: "Jungle Glass."**

The site is a lit vivarium seen at night. The ground is a near-black green (`#04100e`) with
warmer bands (`#062019`) marking the sections; panels are barely-there white films
(`rgba(255,255,255,.055)`) with a 16px backdrop blur, so every surface reads as glass over
foliage rather than as a card on a page. Two slow drifting glows sit behind the whole document.
Light comes from a single mint-to-cyan axis — `#38e8a0` into `#4cc9f0` — and it is the only
saturated thing in the world.

The logic underneath is biological, not decorative. The hero draws a double helix as two dashed
paths crossing through orbit rings; eggs are literal egg shapes, filled when certain and hatched
with a dashed stripe when only probable; genes are chips that fill as copies accumulate. Nothing
is a generic icon. Where the product is uncertain, the interface is visibly uncertain: dashed
borders and hatch fills mean "possible", solid fills mean "known".

**Key characteristics:**
- Near-black green ground, glass panels, one mint-to-cyan light axis.
- Generous radii (34 / 24 / 16) and wide, tight-tracked display type.
- Probability is encoded in fill: solid = known, dashed or hatched = possible.
- Mono is reserved for identifiers, measurements, odds and labels — never for prose.
- Rejected: the generic dark-SaaS formula. No purple gradient, no neon glow on every edge, no
  three identical feature cards, no fake dashboard built from rectangles.

## The two skins

This site ships **two skins, and they are two different design languages** rather than a light
and dark variant of one. That is deliberate: the app's appearance system is a selling point, and
the site demonstrates it by wearing it.

| | Jungle Glass (default) | Hatchling |
|---|---|---|
| Ground | near-black green `#04100e` | cream `#fffaf0` |
| Accent | mint `#7cf5c6` / `#38e8a0` | violet `#5a37e0` / `#6c4cf5` |
| Borders | 1px, white at 12% | **2px, solid `#1b1430`** |
| Shadow | soft, far: `0 40px 90px -50px #000` | **hard offset: `0 12px 0 #1b1430`** |
| Display face | Sora | **Bricolage Grotesque** |
| Blur | `blur(16px)` | **none** |
| CTA | mint-to-cyan gradient | flat violet |

Jungle Glass is the default and is what a first-time visitor sees. The choice is remembered per
device under `serpentora.v6.look`, read on mount rather than during first render so the first
paint is identical for everyone.

**The ouroboros mark does not change with the skin, and that is deliberate.** It is the one fixed
brand asset, and a mark that re-tints per theme stops being a mark. It reads as a third colour in
Hatchling rather than as part of that palette; if that is ever judged wrong, the fix is a
per-skin export, not a CSS hue filter over the existing PNG.

### Named Rules

**The Fill Rule.** Fill encodes certainty. A solid fill means observed or confirmed; a dashed
border or a hatched repeating-gradient means possible or pending. This holds for eggs, gene
chips, clearance gates and placeholder plates alike, and it must survive any restyle — it is the
visual form of the product's central promise about odds.

**The One Axis Rule.** All saturated colour comes from the mint-to-cyan axis, plus exactly one
amber (`--warn`) for caution. Amber means a risk the keeper must weigh: a lethal super, an unmet
clearance gate, an unannounced price. It must stay rare enough to keep meaning that.

**The Mono Rule.** `DM Mono` appears on identifiers, measurements, odds, dates and small caps
labels. Never on a sentence. A reader should be able to tell data from prose without reading it.

**The Scoping Rule.** Every token lives under `.v6`, not `:root`. `AppearanceContext` writes
custom properties onto `<html>` for the rest of the suite, and the two palettes must not reach
into each other. A token defined at `:root` is a bug.

**The Honest Copy Rule.** The voice admits limits in the same breath as it claims: "19 further
combinations below 1 in 32 are not shown", "one clean faecal float proves very little", "pricing
not yet announced". This is a brand commitment, not a tone. Copy that overclaims breaks the
system more badly than a wrong colour would. See PRODUCT.md for the claims that may not be made.

## Typography

**Display:** Sora (Jungle Glass) / Bricolage Grotesque (Hatchling), at weight 400 rising to 700,
tracked tight at `-0.03em`. Headlines run large and wide.
**Body:** Outfit throughout both skins — the constant across the two worlds.
**Mono:** DM Mono, for the identifier and measurement roles described above.

### Hierarchy
- **H1** `clamp(40px, 7vw, 86px)`, tight tracking, one per page.
- **H2** `clamp(30px, 4vw, 46px)` for section titles.
- **Lead** 19–21px at 1.6 for the hero paragraph.
- **Copy** 15–18px at 1.5–1.6.
- **Eyebrow / label** 10–11px mono, uppercase, `.14em`–`.2em` tracking.

## Layout

A centred `--wrap` column with generous section padding. Sections alternate plain ground against
`.v6-band` (`#062019`), and the band is the separator — borders are for panels, not for bands.

Grids are declared with a `--min` custom property and `repeat(auto-fit, minmax(var(--min), 1fr))`,
so every grid is intrinsically responsive rather than breakpoint-driven. Three layout primitives
carry almost everything: `.v6-grid`, `.v6-stack` (vertical, `--gap`) and `.v6-cluster`
(horizontal wrap, `--gap`).

## Elevation & depth

Glass, not paper. Panels are a white film over the ground with a 16px backdrop blur and a 1px
white border at 12%; depth comes from blur and the two ambient glows rather than from stacked
shadows. The single deep shadow (`0 40px 90px -50px #000`) is reserved for the hero cards and the
CTA's coloured halo.

In Hatchling the model inverts completely: no blur, 2px solid ink borders and a hard offset
shadow. Both are internally consistent; neither borrows the other's depth model.

## Motion

Ambient and slow. Two glows drift on 26s and 34s cycles; the hero cards float on 9s, 11s and 13s
offsets so they never synchronise; the helix paths flow on 9s and 13s; the status dot pulses on
2.6s. Nothing bounces, nothing reacts fast, because the subject is a five-month breeding season.

`@media (prefers-reduced-motion: reduce)` disables every animation and transition under `.v6`.
This is verified, not assumed: emulating reduced motion leaves zero animating elements.

## Components

- **`.v6-panel`** — the glass surface. `--r-md` radius, 1px rule border, blur.
- **`.v6-plate`** — a dashed, diagonally-hatched placeholder for a product still that has not been
  shot yet. It is scaffolding and should not survive to launch; see PRODUCT.md.
- **`.v6-chip`** — a gene or trait pill. `--on` is a filled, known copy; `--quiet` is absent;
  `--dashed` is possible; `--warn` carries a genetic risk.
- **`.v6-egg`** — an egg silhouette at four sizes, filled by the Fill Rule.
- **`.v6-btn--cta`** — the gradient conversion button. `#03231c` on the mint-to-cyan gradient
  measures 10.48:1 against the mint stop and 8.66:1 against the cyan.
- **`.v6-calc`** — the genetics calculator, the site's centrepiece and its only interactive proof.

## Do's and Don'ts

### Do
- **Do** keep fill meaning certainty; dashed and hatched mean "possible" everywhere.
- **Do** keep mono for identifiers, odds and measurements only.
- **Do** scope every token under `.v6`.
- **Do** keep amber rare, and only for a risk the keeper must weigh.
- **Do** keep both skins internally consistent — Hatchling's hard shadows and 2px borders are not
  a mistake to be softened toward Jungle Glass.
- **Do** paint `html` and `body` from the active skin, not just the `.v6` wrapper.

### Don't
- **Don't** add a second accent hue. The mint-to-cyan axis plus amber is the whole palette.
- **Don't** put a `.v6-plate` in front of a visitor at launch. A labelled gap reads as an
  unfinished product.
- **Don't** let the page grow back into a single scroll. Depth belongs on its own routes.
- **Don't** claim in copy what PRODUCT.md lists as unsupported, however well it would sit in the
  layout.
- **Don't** reach for a generic dark-SaaS move — purple gradient, neon edge glow, three identical
  cards, a fake dashboard of rectangles. The product supplies real forms; use them.
