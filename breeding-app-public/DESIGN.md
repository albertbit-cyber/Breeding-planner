---
name: Serpentora
description: Genetics-first breeding management for reptile keepers.
colors:
  primary: "#0ea5e9"
  primary-deep: "#075985"
  primary-wash: "#e0f2fe"
  secondary: "#2563eb"
  accent: "#f59e0b"
  ink: "#0f172a"
  ink-soft: "#1e293b"
  surface: "#ffffff"
  surface-sunken: "#f6f7f9"
  rule: "#e2e8f0"
  margin-note: "#64748b"
  faint-pencil: "#94a3b8"
  tab-teal: "#d0e8e5"
  tab-sage: "#d8eadc"
  tab-terracotta: "#f0ddd6"
  tab-gold: "#f5edcc"
  tab-clay: "#ecddd4"
  tab-violet: "#e8dff8"
  mark-teal: "#5e9a96"
  mark-sage: "#6a9e7a"
  mark-terracotta: "#c09080"
  mark-gold: "#c8a840"
  mark-clay: "#b07868"
  mark-violet: "#9b65d6"
  gene-coral: "#d86060"
  gene-coral-wash: "#fbd5d5"
  gene-coral-deep: "#a03030"
  gene-violet: "#9b65d6"
  gene-violet-wash: "#e8dff8"
  gene-violet-deep: "#5a2896"
  status-success: "#166534"
  status-success-wash: "#f0fdf4"
  status-error: "#9f1239"
  status-error-wash: "#fff1f2"
typography:
  display:
    fontFamily: "Space Grotesk, Segoe UI, system-ui, -apple-system, sans-serif"
    fontSize: "clamp(24px, 5vw, 34px)"
    fontWeight: 500
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Space Grotesk, Segoe UI, system-ui, -apple-system, sans-serif"
    fontSize: "26px"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "normal"
  title:
    fontFamily: "Space Grotesk, Segoe UI, system-ui, -apple-system, sans-serif"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "normal"
  body:
    fontFamily: "Space Grotesk, Segoe UI, system-ui, -apple-system, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.7
    letterSpacing: "normal"
  body-small:
    fontFamily: "Space Grotesk, Segoe UI, system-ui, -apple-system, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  label:
    fontFamily: "Space Grotesk, Segoe UI, system-ui, -apple-system, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.08em"
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
rounded:
  sm: "6px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  section: "64px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "10px 22px"
    typography: "{typography.body-small}"
  button-primary-hover:
    backgroundColor: "{colors.ink-soft}"
    textColor: "{colors.surface}"
  button-accent:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "10px 22px"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "10px 22px"
  button-large:
    padding: "13px 30px"
  button-small:
    padding: "6px 14px"
  card-tab:
    backgroundColor: "{colors.tab-teal}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "24px"
  card-plan:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "18px"
  card-auth:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    padding: "32px"
  input-field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "10px 14px"
  badge-wash:
    backgroundColor: "{colors.primary-wash}"
    textColor: "{colors.primary-deep}"
    rounded: "{rounded.pill}"
    padding: "4px 14px"
  tag-gene:
    backgroundColor: "{colors.gene-coral-wash}"
    textColor: "{colors.gene-coral-deep}"
    rounded: "{rounded.sm}"
    padding: "4px 10px"
---

# Design System: Serpentora

## Overview

**Creative North Star: "The Keeper's Field Notebook"**

Serpentora is where a breeder's collection becomes a record. The visual world takes its cue from the
thing a serious keeper already owns: a working notebook, thumbed and annotated, where every animal has
a page, every pairing has a date, and colour-coded tabs let you find the right section without reading
a word. The page is not a brochure about breeding software. It is the notebook, opened.

The frame around that notebook is cool and instrument-like. Chrome, rules, and margin notes sit in
cool slate greys, and the single interactive voice is an instrument sky blue (#0ea5e9) inherited from
the suite tokens. The content inside the frame is warm: the six tab hues — teal, sage, terracotta,
gold, clay, violet — are the notebook's ink set, and they are the one place this system is allowed to
get warm. That temperature break is deliberate and load-bearing. Cool frame, warm content. It is what
keeps a records product from reading as either a clinical dashboard or a craft-paper hobby site.

Surfaces here have weight. Cards lift toward the reader on hover, the primary call to action is a
solid slab of notebook ink rather than a tinted outline, and pressing anything gives back. The system
is tactile and confident: things look like they can be picked up. Restraint lives in the palette and
the type scale, not in the physicality.

**Key Characteristics:**
- Cool slate chrome framing a warm six-hue content palette — the temperature break is the signature.
- Instrument sky (#0ea5e9) is the only interactive colour; ink black (#0f172a) is the only primary CTA.
- Colour is categorical, never decorative: a hue always means a module.
- Lifted surfaces with a real shadow vocabulary; depth responds to intent.
- Tight, functional type at small sizes; the hero is the only place type gets large.
- Rejected: generic SaaS landing tropes (gradient hero, glass cards, blob illustrations) and the look of the product's own internal dashboards.

## Colors

A cool slate-and-sky chrome wrapped around a warm, six-part categorical ink set.

### Primary
- **Instrument Sky** (`#0ea5e9`): The single interactive voice. Links, focus rings, active navigation,
  toggle-on state, the accent CTA on dark sections, and the numerals in the stats band. It is the
  suite's `--color-primary` and it is the reason the landing page and the breeder app read as one
  company.
- **Deep Sky** (`#075985`): Text-weight sky. Used where sky must carry legible type — section eyebrow
  labels, active nav link text, badge text, and inline links inside body copy.
- **Sky Wash** (`#e0f2fe`): The tint behind badge pills and the highlighted phrase in the hero
  headline. Never a large surface; it is a highlighter stroke, not a background.

### Secondary
- **Signal Blue** (`#2563eb`): Border accents and the secondary action edge. Reserved; if a screen
  needs only one blue, it uses Instrument Sky and omits this entirely.

### Tertiary
- **Marker Amber** (`#f59e0b`): Attention and "new" markers only. It is the suite accent and it must
  stay rare enough that its appearance means something.

### Neutral
- **Notebook Ink** (`#0f172a`): Primary text, the primary button slab, the dark stats band, and the
  footer. This is the darkest value in the system and it does real structural work.
- **Soft Ink** (`#1e293b`): The one step up from Ink, used for dividers inside dark sections and for
  the primary button's hover state.
- **Page** (`#ffffff`): Card and panel surface, and the background of the "How it works" band.
- **Cool Paper** (`#f6f7f9`): The sunken page background behind hero and feature sections. The
  alternation between Page and Cool Paper is what separates bands — not borders alone.
- **Ruled Line** (`#e2e8f0`): Every 1px border, card edge, input stroke, and divider.
- **Margin Note** (`#64748b`): Secondary body copy, descriptions, plan sub-text.
- **Faint Pencil** (`#94a3b8`): Tertiary text only — the browser-chrome URL, the nav tagline, animal
  ID lines, placeholder text.

### The Notebook Ink Set
Six categorical hues, each owning one module of the product. Used as tinted card surfaces with a
matching solid mark colour for the icon chip.

- **Tab Teal** surface `#d0e8e5` / mark `#5e9a96` — Animal management.
- **Tab Sage** surface `#d8eadc` / mark `#6a9e7a` — Genetics calculator.
- **Tab Terracotta** surface `#f0ddd6` / mark `#c09080` — Breeding records.
- **Tab Gold** surface `#f5edcc` / mark `#c8a840` — Shed testing and lab.
- **Tab Clay** surface `#ecddd4` / mark `#b07868` — currently Marketplace, but the marketplace is
  spinning out as its own product and must not appear in the feature list (see PRODUCT.md). Treat this
  hue as reserved and unassigned until a replacement module claims it.
- **Tab Violet** surface `#e8dff8` / mark `#9b65d6` — AI tools.

### Genetics Tags
Morph and het tags carry their own two-hue coding, distinct from the tab set because they appear
*inside* content rather than as section markers.

- **Gene Coral** `#d86060` / wash `#fbd5d5` / deep `#a03030` — visual morph traits.
- **Gene Violet** `#9b65d6` / wash `#e8dff8` / deep `#5a2896` — het and recessive traits, rendered
  italic to mark them as probabilistic rather than observed.

### Status
Fixed and not themeable: success `#166534` on `#f0fdf4`, error `#9f1239` on `#fff1f2`.

### Named Rules

**The Temperature Break Rule.** Chrome is cool, content is warm. Navigation, footer, borders, body
text, buttons, and inputs draw only from the slate-and-sky neutrals. The six tab hues and the two gene
hues appear only inside content cards and tags. A warm border on a nav bar, or a slate feature card,
breaks the system.

**The One Voice Rule.** Instrument Sky is the only interactive colour on the page. If something is
clickable and coloured, it is sky. Nothing decorative may be sky.

**The Categorical Colour Rule.** A hue always names a module. Tab Gold means lab testing everywhere it
appears; it is never chosen because a card needed variety. If a new section has no module, it gets a
neutral surface, not the next unused hue.

**The Ink CTA Rule.** The primary call to action is a solid slab of Notebook Ink (`#0f172a`) with white
text — not sky. Sky is reserved for the accent CTA on dark sections, where ink would disappear. Two
ink CTAs never appear in the same viewport.

## Typography

**Display Font:** Space Grotesk (fallback: Segoe UI, system-ui, -apple-system, sans-serif)
**Body Font:** Space Grotesk — the system is single-family by design
**Label/Mono Font:** ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace

**Character:** Space Grotesk carries a slight technical geometry and distinctive digits, which is
exactly right for a product where numbers — weights, dates, clutch counts, probabilities — are the
content. Held at medium weight (500) rather than bold, it reads as competent rather than loud. The
monospace face appears only on identifiers: animal IDs, codes, and tabular data cells, where character
alignment is the point.

> **Implementation gap:** `--font-family` declares Space Grotesk but `index.html` loads no webfont —
> only the Tabler icon font. Every visitor currently falls through to Segoe UI. Space Grotesk is
> normative in this system; the font must be loaded for the design to be the shipped design.

### Hierarchy
- **Display** (500, `clamp(24px, 5vw, 34px)`, 1.25, -0.01em): The hero headline, once per page. This is
  the only place type is allowed to be large.
- **Headline** (500, 26px, 1.3): Section titles. Drops to 20px below 640px.
- **Title** (500, 14–15px, 1.4): Card titles, plan names, the nav wordmark.
- **Body** (400, 15px, 1.7): Hero sub-copy and section sub-copy. Cap measure at 60–70ch; the hero
  sub-copy is deliberately narrower still (~440px) so it breaks into three tight lines under the
  headline.
- **Body Small** (400, 13px, 1.6): Card descriptions, step descriptions, nav links, footer links.
- **Label** (600, 11px, 0.08em, uppercase): Section eyebrows in Deep Sky, and data-cell labels.
- **Mono** (400, 12px): Animal IDs, codes, and tabular figures only.

### Named Rules

**The One Large Thing Rule.** Exactly one element per page may use Display. Everything else lives in
the 11–26px band. The hierarchy comes from weight, colour, and spacing, not from size escalation.

**The Small-and-Sharp Rule.** This system runs small on purpose — a notebook's authority comes from
density, not from generous type. When a block feels weak, raise its weight to 500 or move it onto a
tinted surface; do not raise its size.

## Layout

A single centred column, `max-width: 860px`, gutter `1.5rem` (24px). The page is a stack of full-bleed
bands whose backgrounds alternate — Cool Paper, then dark Ink, then Cool Paper, then Page — with each
band padded `64px` vertically (`4rem 1.5rem`). Band background is the primary separator; a border
appears only where two same-coloured bands meet.

Content grids are three shapes only: a fixed two-column (`grid-2`), a fixed three-column (`grid-3`),
and an auto-fitting track (`grid-auto`, `minmax(175px, 1fr)`) used for the feature tabs. Grid gap is
`12px` throughout.

Spacing rhythm runs `4 / 8 / 12 / 16 / 24 / 64`. Card internal padding sits at `24px` for tab cards and
`18px` for plan cards; the auth card is the one generous surface at `32px`.

There is a single breakpoint at **640px**, where both fixed grids collapse to one column, Display drops
to 20px, the hero pill row is hidden entirely, and the desktop nav swaps for a disclosure menu.

### Named Rules

**The Band Rule.** Vertical structure comes from alternating band backgrounds, not from rules or
dividers. If two adjacent bands share a background, one of them is wrong.

**The 860 Rule.** Content never exceeds 860px of measure, at any viewport. Wide screens get more
margin, never wider text.

## Elevation & Depth

This system is **lifted**. Surfaces carry real weight and respond to intent: they sit on the page with
a faint resting shadow, rise under the cursor, and press back when clicked. Depth is the primary
signal that something is interactive — which is what lets the palette stay this restrained.

Depth escalates in one direction only: rest → raised → lifted → overlay. A surface never skips a step,
and a surface that cannot be interacted with never leaves rest.

> **Implementation gap:** the incumbent code is flat — separation is carried almost entirely by 1px
> `Ruled Line` borders, with a single hover shadow specified for pricing cards. Lifted is the committed
> direction for this surface, not a description of what ships today.

### Shadow Vocabulary
- **Rest** (`box-shadow: 0 1px 2px rgba(15,23,42,0.06)`): The default for any card or panel that sits
  on Cool Paper. Barely visible; it exists to stop surfaces from looking printed on.
- **Raised** (`box-shadow: 0 4px 16px rgba(15,23,42,0.08)`): Hover state for tab cards, plan cards, and
  any clickable surface. Paired with `translateY(-2px)`.
- **Lifted** (`box-shadow: 0 10px 30px -8px rgba(15,23,42,0.16)`): The featured pricing tier and the
  app-preview frame — surfaces that must sit above their neighbours at rest.
- **Overlay** (`box-shadow: 0 24px 60px -12px rgba(15,23,42,0.28)`): Modals and the mobile disclosure
  menu, over a `rgba(15,23,42,0.35)` backdrop.
- **Focus** (`box-shadow: 0 0 0 3px rgba(14,165,233,0.35)`): The focus ring. Always sky, always 3px,
  never replaced by a border colour change alone.

### Named Rules

**The Lift-On-Intent Rule.** Shadow escalation is a response to the user, not a decoration. A card that
is not clickable stays at Rest forever, no matter how important it is.

**The Shadow-And-Border Rule.** Lifted surfaces keep their 1px Ruled Line border. The border defines
the edge; the shadow defines the height. Dropping the border when adding a shadow makes cards read as
floating glass, which is the anti-reference.

## Shapes

Rectilinear and softly cornered. Four radii do all the work: `6px` for small inline tags, `8px` for
buttons, inputs, and default surfaces, `12px` for cards and panels, and `16px` for the auth card and
other prominent dialogs. Pills (`999px`) are reserved for badges, hero pills, and chip-style
elements — never for cards or buttons.

Borders are always exactly 1px and always Ruled Line, with two exceptions: input fields use 1.5px so
the focus transition has something to change, and the featured pricing card uses 2px in Instrument Sky
as its only distinguishing mark.

The recurring silhouette is the **tab card**: a tinted rectangle with a 12px radius, a solid mark-colour
icon chip in its top-left at 44×44 with a 10px radius, and text in two weights beneath. Repeated six
times across the feature grid and three times across the steps grid, it is the page's structural motif.

### Named Rules

**The Pill Exception Rule.** Radius scale applies to surfaces; pills apply to labels. A badge, hero
pill, or status chip is always fully rounded regardless of the surrounding radius. A button is never
a pill.

## Components

### Buttons
- **Character:** Tactile and confident. Solid, generously padded, and physically responsive.
- **Shape:** Softly cornered (8px). Never pill, never square.
- **Primary:** Notebook Ink (`#0f172a`) fill, white text, `10px 22px` padding, weight 500. The page's
  main conversion action.
- **Accent:** Instrument Sky (`#0ea5e9`) fill, Ink text, weight 600. Used only on dark bands, where the
  ink button would vanish.
- **Outline:** Transparent fill, Ink text, 1px Ruled Line border. The secondary path — "See pricing"
  beside "Start for free".
- **Sizes:** Large `13px 30px` for hero and band CTAs; default `10px 22px`; small `6px 14px` for the
  nav.
- **Hover / Focus:** `translateY(-1px)` with a lift to Raised shadow, over `250ms`. Focus shows the 3px
  sky ring. Active presses to `scale(0.97)`.
- **Disabled:** `opacity: 0.55`, `cursor: not-allowed`, no hover response.

### Cards / Containers
- **Corner Style:** 12px (`rounded.lg`).
- **Background:** Page white for plan and auth cards; a tab hue for feature and step cards.
- **Shadow Strategy:** Rest at idle, Raised on hover for interactive cards, Lifted permanently for the
  featured tier. See Elevation & Depth.
- **Border:** 1px Ruled Line, retained at every elevation. The featured plan card takes 2px Instrument
  Sky instead.
- **Internal Padding:** 24px for tab cards, 18px for plan cards, 32px for the auth card.

### Inputs / Fields
- **Style:** White fill, 1.5px Ruled Line stroke, 8px radius, `10px 14px` padding, 14px text.
- **Label:** 13px, weight 500, Notebook Ink, 5px above the field.
- **Focus:** Border shifts to Instrument Sky and the 3px sky ring appears. Both, together — the ring
  alone is too subtle at 1.5px, the border alone fails at distance.
- **Error:** 12px error text beneath in `#9f1239`; the border shifts to the same hue.

### Navigation
- **Style:** Sticky, translucent white (`rgba(255,255,255,0.97)`) with an 8px backdrop blur and a
  bottom Ruled Line. Vertical padding `0.75rem`.
- **Brand:** Logo mark beside a two-line lockup — wordmark at 15px/500 in Ink, descriptor beneath at
  11px in Faint Pencil.
- **Links:** 13px Body Small in Margin Note; the active route shifts to Deep Sky at weight 600.
- **Actions:** "Sign in" as a plain link, "Get started free" as a small Primary button.
- **Mobile:** Below 640px the link row is replaced by a disclosure button; the open panel is a white
  sheet at Overlay elevation with 14px links stacked at 1rem intervals.

### Tab Card (signature)
The page's defining component. A tinted surface drawn from the Notebook Ink Set, with a 44×44 solid
mark-colour icon chip at 10px radius, a 14px/500 title, and a 13px/1.6 description. Title and
description take two darker steps of the card's own hue rather than a neutral, so each tab is a
self-contained tonal family. Six of them form the feature grid; three tinted variants with circular
44×44 numerals form the steps grid.

### Genetics Tag (signature)
A small (6px radius) inline tag pairing a wash background with deep text from the same hue. Coral marks
visual traits; violet marks het and recessive traits and is set in italic — the italic is the system's
way of saying "probabilistic, not observed", and it must survive any restyle.

## Do's and Don'ts

### Do:
- **Do** keep the temperature break: cool slate chrome, warm tab hues inside content only.
- **Do** use Instrument Sky (`#0ea5e9`) as the only interactive colour, and Notebook Ink (`#0f172a`) as
  the only primary CTA fill.
- **Do** let a hue mean a module. Tab Gold is lab testing wherever it appears.
- **Do** keep the 1px Ruled Line border on lifted surfaces — border for edge, shadow for height.
- **Do** hold body and card type in the 11–26px band and let exactly one Display element per page.
- **Do** keep het and recessive genetics tags italic; the italic carries meaning.
- **Do** alternate band backgrounds to structure the page, and cap measure at 860px.
- **Do** load Space Grotesk before treating the type system as shipped.

### Don't:
- **Don't** drift toward the generic SaaS landing page: no purple gradient hero, no floating glassy
  cards, no abstract blob illustrations, no three-column icon grid standing in for content.
- **Don't** let this page look like the breeder, lab, or admin dashboards. It is a Persuade surface;
  the internal apps are Operate surfaces and their density and chrome do not belong here.
- **Don't** introduce a seventh tab hue. If a new module appears, it takes a neutral surface until a
  hue is assigned deliberately.
- **Don't** reintroduce warm neutrals (`#e5e0d4`, `#7a7265`, `#a09888`) for borders or body text — they
  are the pre-migration editorial palette and they fight the sky accent.
- **Don't** use Instrument Sky decoratively, or place two Ink CTAs in one viewport.
- **Don't** solve a weak block by enlarging its type; raise weight or move it onto a tinted surface.
- **Don't** make a button a pill or a badge a rectangle.
- **Don't** hardcode a hex where a suite token exists — the whole point of the migration is that a
  palette change propagates.
