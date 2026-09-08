# Handover to Claude Design — Four appearance presets on the public website

**Target:** `breeding-app-public` on `main` — the Serpentora public marketing site
(home, pricing, login, register, and three legal pages). See §9 for one open question about
a divergent `breeding-app-home` fork.

**Three deliverables:**

1. **Implement** the four presets on the marketing site — Default, Jungle Glass,
   Sandstone Vivarium, Glasshouse Mint.
2. **Present** them: a picker that lets a visitor choose, and that makes the choice feel
   like a product feature rather than a settings toggle.
3. **Show** them: design how each of the four actually looks across the site — not just
   "the tokens resolve," but a deliberate answer for every section on every page.

Everything you need is below. The palette is already built, already contrast-audited, and
already live in four other frontends — you are not designing colours from scratch. You are
deciding how a marketing site *behaves* across four grounds, one of which is dark.

---

## 1. How the system works

A **skin** is one flat block of semantic `--sk-*` custom properties under
`[data-skin="…"]` on `<html>`. Selecting a preset means writing one attribute. There is no
JS palette, no build step, no per-component branching.

```html
<html data-skin="jungle-glass">
```

Three things follow from that, and they shape your whole approach:

- **A skin carries colour only — no geometry.** Radius, density, and spacing live on
  *separate* attributes (§4). All four presets are, by default, geometrically identical.
  Jungle Glass is not "the rounded one." If you want a preset to carry a shape signature
  too, that is a design decision to make deliberately — see §9.
- **Roles, not pigments.** Every token names a job (`--sk-surface-2`, `--sk-text-muted`,
  `--sk-primary-quiet`), never a colour. If something looks wrong under one preset, the
  component is using the wrong *role*, not the wrong *value*.
- **A hex literal outside `skins.css` is a bug.** That is the system's stated invariant.
  It is what makes four presets cost the same as one.

---

## 2. The four presets — full palettes

Copied verbatim from `breeding-app-shared/src/styles/skins.css` on `main`. That file is
authoritative; never retype or re-derive these values.

Labels and descriptions are the ones the app already uses (`APPEARANCE_PRESETS` in
`breeding-app-breeder/src/contexts/AppearanceContext.jsx`). **Use these exact strings** so
the website and the app name the same thing the same way.

---

### 2.1 Default — `data-skin="default"`

> *The original sky-blue interface.*

`color-scheme: light`. Reproduces today's shipped appearance; ships as a visual no-op.

```css
--sk-bg:                 #f6f7f9;   --sk-bg-2:            #f6f7f9;
--sk-surface:            #ffffff;   --sk-surface-2:       #fafafa;
--sk-surface-3:          #f5f5f5;   --sk-surface-raised:  #ffffff;
--sk-scrim:              15 23 42;

--sk-border:             #e5e5e5;   --sk-border-strong:   #d4d4d4;

--sk-text:               #171717;   --sk-text-secondary:  #404040;
--sk-text-muted:         #737373;   --sk-text-subtle:     #5f5f5f;
--sk-text-on-accent:     #ffffff;

--sk-brand:              #3c1b73;
--sk-primary:            #0369a1;   --sk-primary-hover:   #075985;
--sk-primary-quiet:      #f0f9ff;   --sk-primary-quiet-text: #075985;
--sk-accent:             #b45309;   --sk-link:            #0369a1;
--sk-focus:              #0ea5e9;

--sk-success-bg: #f0fdf4;  --sk-success-border: #bbf7d0;  --sk-success-text: #166534;
--sk-warning-bg: #fffbeb;  --sk-warning-border: #fde68a;  --sk-warning-text: #92400e;
--sk-danger-bg:  #fee2e2;  --sk-danger-border:  #fca5a5;  --sk-danger-text:  #991b1b;
--sk-info-bg:    #eff6ff;  --sk-info-border:    #bfdbfe;  --sk-info-text:    #1e40af;

--sk-shadow-color: 15 23 42;

--sk-series-1: #0369a1;  --sk-series-2: #9d174d;  --sk-series-3: #047857;
--sk-series-4: #6d28d9;  --sk-series-5: #b45309;  --sk-series-6: #4338ca;
```

**Character.** Cool neutral grey ground, pure-white cards, sky-blue primary, amber accent.
The wordmark is the outlier: `--sk-brand` is a deep violet `#3c1b73` that appears nowhere
else in the palette — it is the legacy brand colour, given a role so nobody reaches for a
literal again. Shadows are blue-tinted (`15 23 42`), which is why the current site reads
cool even in its greys.

**On the website.** This is the control condition and the out-of-box default. `--sk-bg`
and `--sk-bg-2` are *identical*, so the `.sk-canvas` gradient is flat here — any
gradient-driven treatment you design will be invisible under Default and must not be
load-bearing. Cards separate from ground by only `#ffffff` on `#f6f7f9`; the separation is
carried by the border and shadow, not by value contrast.

---

### 2.2 Jungle Glass — `data-skin="jungle-glass"`

> *Moss green drifting into deep teal, with translucent panels.*

`color-scheme: dark`. The signature skin, and the only dark ground in this set.

```css
--sk-bg:                 #16211c;   --sk-bg-2:            #152325;
--sk-surface:            #202a26;   --sk-surface-2:       #2a3430;
--sk-surface-3:          #343f3a;   --sk-surface-raised:  #252f2b;
--sk-scrim:              0 0 0;

--sk-border:             #455750;   --sk-border-strong:   #5b6e66;

--sk-text:               #ebf7f1;   --sk-text-secondary:  #c7d7d0;
--sk-text-muted:         #a2b5ad;   --sk-text-subtle:     #85978f;
--sk-text-on-accent:     #ffffff;

--sk-brand:              #a8dca8;
--sk-primary:            #396a2e;   --sk-primary-hover:   #4a7c3f;
--sk-primary-quiet:      #2b3a28;   --sk-primary-quiet-text: #b3e4a9;
--sk-accent:             #c4b86e;   --sk-link:            #a0d2a1;
--sk-focus:              #c2f0a9;

--sk-success-bg: #1a3622;  --sk-success-border: #325e3f;  --sk-success-text: #9de3af;
--sk-warning-bg: #3d2c03;  --sk-warning-border: #684e0e;  --sk-warning-text: #f3c96e;
--sk-danger-bg:  #4b201e;  --sk-danger-border:  #7d3c38;  --sk-danger-text:  #ffbcb6;
--sk-info-bg:    #0e3443;  --sk-info-border:    #225972;  --sk-info-text:    #91dbfe;

--sk-shadow-color: 0 0 0;

/* hues 140 200 260 320 20 80 — 60° apart, anchored on the primary */
--sk-series-1: #89c37c;  --sk-series-2: #3cc7ce;  --sk-series-3: #86b2fa;
--sk-series-4: #d299df;  --sk-series-5: #f19293;  --sk-series-6: #d7a955;
```

**Character.** Moss green ground that drifts toward teal — and unlike Default, `--sk-bg`
(`#16211c`, green) and `--sk-bg-2` (`#152325`, teal) genuinely differ, so the `.sk-canvas`
gradient *reads* here. It is the one preset where the "Living Glass" shell (§5) pays for
itself. The wordmark inverts to a pale green `#a8dca8`. Accent is brass `#c4b86e`, not
gold. The focus ring `#c2f0a9` is the brightest thing in the palette at 11.5:1 — a
deliberate near-chartreuse that snaps.

**On the website — the important one.** `--sk-shadow-color` is pure black `0 0 0`, and a
black shadow on a near-black ground is nearly invisible. **Depth here comes from surface
steps and borders, not from elevation.** The four-step ramp
(`#16211c` → `#202a26` → `#2a3430` → `#343f3a`) plus a comparatively strong border
`#455750` is the entire depth vocabulary. Any card treatment you design that leans on
`box-shadow` will look flat under Jungle Glass and correct everywhere else — design the
card so the border does the work, and let the shadow be additive.

`--sk-primary` `#396a2e` is a mid-tone green with the lowest text-on-primary ratio of the
four (6.4:1 — comfortably passing, but the least headroom). Large filled buttons are fine;
small filled text needs care.

---

### 2.3 Sandstone Vivarium — `data-skin="sandstone-vivarium"`

> *Light: sand ground, bark browns, one leaf-green accent.*

`color-scheme: light`.

```css
--sk-bg:                 #faf3e6;   --sk-bg-2:            #f9eee2;
--sk-surface:            #fffdfa;   --sk-surface-2:       #f9f3e8;
--sk-surface-3:          #efe9de;   --sk-surface-raised:  #feffff;
--sk-scrim:              25 24 23;

--sk-border:             #d6cdbc;   --sk-border-strong:   #c0b6a6;

--sk-text:               #2e2a22;   --sk-text-secondary:  #4e483d;
--sk-text-muted:         #615a4c;   --sk-text-subtle:     #787162;
--sk-text-on-accent:     #ffffff;

--sk-brand:              #2b3200;
--sk-primary:            #323700;   --sk-primary-hover:   #252800;
--sk-primary-quiet:      #ebf0d4;   --sk-primary-quiet-text: #414700;
--sk-accent:             #905b2a;   --sk-link:            #475417;
--sk-focus:              #848d3d;

--sk-success-bg: #e0f7e5;  --sk-success-border: #aeddb9;  --sk-success-text: #0f592e;
--sk-warning-bg: #fdefd1;  --sk-warning-border: #e9cc8f;  --sk-warning-text: #5f4600;
--sk-danger-bg:  #feebe9;  --sk-danger-border:  #febcb6;  --sk-danger-text:  #832323;
--sk-info-bg:    #e0f4fe;  --sk-info-border:    #a0d9f5;  --sk-info-text:    #00526e;

--sk-shadow-color: 50 39 19;

/* hues 115 175 235 295 355 55 — 60° apart, anchored on the primary */
--sk-series-1: #6d7614;  --sk-series-2: #04816b;  --sk-series-3: #0678a6;
--sk-series-4: #745faa;  --sk-series-5: #a14f72;  --sk-series-6: #a15a22;
```

**Character.** Warm sand ground with a warm near-white card, bark-brown accent `#905b2a`,
and a primary `#323700` so dark and desaturated it reads as near-black olive rather than
as "green." Text-on-primary is 12.5:1 — the filled button is the highest-contrast element
in the set. Shadows are warm brown (`50 39 19`), not grey, so elevation tints toward the
ground instead of greying it out.

**On the website.** The ground is genuinely warm (`#faf3e6`), which makes any leftover
pure-white or cool-grey literal in the JSX stand out immediately — this preset is the best
detector for an incomplete sweep. `--sk-focus` `#848d3d` sits at 3.5:1 on surface: that
clears the 3:1 floor for a *focus indicator*, but it is not a text colour and should never
be used as one. Because primary is near-black, a filled primary button and dark body text
sit close in value — rely on shape and weight, not colour, to distinguish a CTA from a
heading.

---

### 2.4 Glasshouse Mint — `data-skin="glasshouse-mint"`

> *Light: cool mint ground with a clear green accent.*

`color-scheme: light`. The only cool-ground light option in the whole 16-skin set.

```css
--sk-bg:                 #eef8f4;   --sk-bg-2:            #eaf5f1;
--sk-surface:            #fdfffe;   --sk-surface-2:       #eef7f3;
--sk-surface-3:          #e4edea;   --sk-surface-raised:  #ffffff;
--sk-scrim:              24 25 24;

--sk-border:             #c2d0cb;   --sk-border-strong:   #acb9b4;

--sk-text:               #222826;   --sk-text-secondary:  #404945;
--sk-text-muted:         #505c57;   --sk-text-subtle:     #66726e;
--sk-text-on-accent:     #ffffff;

--sk-brand:              #013728;
--sk-primary:            #003a2a;   --sk-primary-hover:   #002b1e;
--sk-primary-quiet:      #d6f6e8;   --sk-primary-quiet-text: #004c38;
--sk-accent:             #046869;   --sk-link:            #00553f;
--sk-focus:              #2f9474;

--sk-success-bg: #e1f8e6;  --sk-success-border: #acdcb8;  --sk-success-text: #0a562b;
--sk-warning-bg: #fef0d2;  --sk-warning-border: #e7ca8e;  --sk-warning-text: #5c4300;
--sk-danger-bg:  #feeceb;  --sk-danger-border:  #ffbab3;  --sk-danger-text:  #7f2021;
--sk-info-bg:    #e1f5ff;  --sk-info-border:    #9ed7f3;  --sk-info-text:    #004f6a;

--sk-shadow-color: 29 45 39;

/* hues 168 228 288 348 48 108 — 60° apart, anchored on the primary */
--sk-series-1: #017c5d;  --sk-series-2: #027396;  --sk-series-3: #675ca7;
--sk-series-4: #984b74;  --sk-series-5: #9d5126;  --sk-series-6: #706d03;
```

**Character.** Cool mint ground, near-white cool card, deep pine primary `#003a2a`, clear
teal accent `#046869`. Highest text-on-primary in the set (12.8:1) and the highest
text-on-surface (14.9:1) — the crispest, most clinical of the four. Shadows are green-grey
(`29 45 39`). It is the natural light counterpart to Jungle Glass: same family, inverted.

**On the website.** The value gap between ground `#eef8f4` and card `#fdfffe` is small, so
cards float only slightly — borders carry the separation, same as under Jungle Glass but
for the opposite reason. `--sk-focus` `#2f9474` is 3.7:1 on surface: a valid focus ring,
not a text colour. Because primary and accent are both deep greens, an all-green section
can go monotone — this is the preset where `--sk-accent` and `--sk-series-*` earn their
keep as separators.

---

### 2.5 Measured contrast — already audited

From `docs/skins/skins.contrast.txt`, computed at generation time. `failures: none` across
all 16 skins. Thresholds: 4.5 for text pairs, 3.0 for focus, 1.5 for border-on-surface.

| skin | text/surf | muted/surf | subtle/surf | sec/surf-2 | on-primary | brand/bg | brand/surf | link/surf | focus/surf | focus/primary | border/surf |
|---|---|---|---|---|---|---|---|---|---|---|---|
| default *(see note)* | — | — | — | — | — | — | — | — | — | — | — |
| jungle-glass | 13.4 | 6.9 | 4.8 | 8.6 | 6.4 | 10.6 | 9.5 | 8.6 | 11.5 | 5.0 | 1.9 |
| sandstone-vivarium | 14.1 | 6.7 | 4.8 | 8.2 | 12.5 | 12.2 | 13.3 | 8.1 | 3.5 | 3.5 | 1.6 |
| glasshouse-mint | 14.9 | 6.9 | 5.0 | 8.5 | 12.8 | 12.3 | 13.2 | 8.8 | 3.7 | 3.4 | 1.6 |

*The audit table covers the 16 generated skins; `default` is the pre-existing shipped
palette reproduced as a no-op and is not row-listed there.*

**Do not "adjust" a skin colour to make a component look right.** These values are
generated in OKLCH from a per-skin hue/chroma intent, and four other frontends consume the
same file. If a pairing genuinely fails in situ, change the role the component uses, or
raise it — don't patch the value.

Two things the table tells you that are easy to miss:

- `--sk-text-subtle` sits at 4.8–5.0 across the board. It clears 4.5 **on `--sk-surface`**.
  Don't stack it on `--sk-surface-2` or `-3` without rechecking.
- Focus is 3.4–3.7 on the two warm/cool light presets versus 11.5 on Jungle Glass. The ring
  is much quieter on light grounds — if your focus treatment relies on colour alone it will
  feel inconsistent across presets. Consider a shared ring geometry that reads regardless.

---

## 3. Shapes and geometry

This is the second half of the ask, and it works differently from colour: **shape is not
part of a skin.** It comes from three independent `<html>` attributes plus a shared set of
derived tokens.

### 3.1 Radius

```css
[data-appearance-radius="sharp"]   { --sk-radius: 2px;  }
[data-appearance-radius="soft"]    { --sk-radius: 8px;  }   /* the default */
[data-appearance-radius="rounded"] { --sk-radius: 16px; }
```

The site aliases this as `--radius: var(--sk-radius, 8px)`. Note that `--radius-lg` is
**still a literal `12px`** in the site's `index.css` and does not scale with the setting —
a real gap if you use the radius axis.

Pills (`.pill`, `.badge-gold`) are `999px` and unaffected.

### 3.2 Density

```css
[data-appearance-density="compact"]     { --sk-card-pad: .75rem;  --sk-row-h: 2.25rem; --sk-list-gap: .40rem; --sk-btn-y: .35rem; --sk-btn-x: .85rem; }
[data-appearance-density="comfortable"] { --sk-card-pad: 1.15rem; --sk-row-h: 2.65rem; --sk-list-gap: .65rem; --sk-btn-y: .55rem; --sk-btn-x: 1rem;   }
[data-appearance-density="spacious"]    { --sk-card-pad: 1.50rem; --sk-row-h: 3.10rem; --sk-list-gap: .90rem; --sk-btn-y: .75rem; --sk-btn-x: 1.35rem; }
```

### 3.3 Elevation

Derived from each skin's own shadow channel, so a new skin never authors a shadow:

```css
--sk-shadow-1: 0 1px  2px rgb(var(--sk-shadow-color) / 0.06);
--sk-shadow-2: 0 4px 12px rgb(var(--sk-shadow-color) / 0.10);
--sk-shadow-3: 0 24px 72px rgb(var(--sk-shadow-color) / 0.32);
```

Per-preset shadow colour: Default `15 23 42` (blue-grey) · Jungle Glass `0 0 0` (black,
and effectively invisible on its ground) · Sandstone `50 39 19` (warm brown) · Glasshouse
Mint `29 45 39` (green-grey). **This is the single biggest cross-preset shape difference**
and the reason §2.2 warns against shadow-dependent card design.

### 3.4 Borders, focus, scrim, motion

```css
:where(a, button, input, select, textarea, [tabindex]):focus-visible {
  outline: 2px solid var(--sk-focus);
  outline-offset: 2px;
}
.sk-scrim { background: rgb(var(--sk-scrim) / 0.45); backdrop-filter: blur(12px); }

[data-motion-preference="reduced"] *, ::before, ::after {
  animation-duration: 0ms !important; transition-duration: 0ms !important;
}
```

Borders: `--sk-border` for standard separation, `--sk-border-strong` for emphasis.
Border-on-surface ratios are deliberately low (1.6–1.9) — these are separators, not lines.

### 3.5 The current site's own shape vocabulary

`--radius: var(--sk-radius, 8px)` · `--radius-lg: 12px` (literal) · pills `999px` ·
auth card `16px` · feature icon `10px` · animal card `10px` · avatar and step-number
circles `50%` · browser dots `8px` circles · toggle track `10px`. Section padding
`4rem 1.5rem`; container `max-width: 860px`; one breakpoint at `640px`.

---

## 4. The component kit you already have

`skins.css` ships a small set of pre-paired classes, each written to fix a specific audit
finding. Prefer them over inventing equivalents — they encode pairings that broke before.

| class | what it guarantees |
|---|---|
| `.sk-btn` + `--filled` / `--quiet` / `--ghost` / `--danger` | every filled control gets its paired foreground; a rule can no longer set background without text colour |
| `.sk-btn[disabled]` | real colours, not opacity — *"opacity reads as invisible on dark skins"* |
| `.sk-scrim` | replaces ~12 hardcoded `bg-black/NN` backdrops |
| `.sk-wordmark` | the brand colour has a role, so nobody reaches for a literal |
| `.sk-canvas` | `linear-gradient(165deg, --sk-bg-2, --sk-bg 55%, --sk-bg-2)` — the optional Living Glass ground |
| `.sk-glass` | `color-mix` surface at 78%, 70% border, `blur(18px)`, `--sk-shadow-2` |
| `.sk-gene--het/super/recessive/incdom/dominant/other` | genetics chips as background/foreground **pairs**, hues routed to data-series roles |
| `.sk-sex-male/female/unknown` | were hardcoded `text-sky-500` / `text-pink-500` |
| `.sk-tab-active`, `.sk-on-accent` | paired foreground for saturated fills |

The genetics chips matter for the marketing site specifically: the homepage mock renders
morph tags, and the audit found one ("Pinstripe") had measured **1.96:1** because a
Tailwind background was set with no foreground. Use `.sk-gene--*` rather than re-inventing
chip colours.

---

## 5. The website today

React 18 + Vite, plain CSS, no Tailwind, no CSS-in-JS.

```
src/
  index.css              imports skins.css + materials; reset; token aliases; component CSS
  App.jsx, main.jsx
  components/  Navbar.jsx  Footer.jsx  Logo.jsx  LegalLayout.jsx
  pages/       HomePage.jsx  PricingPage.jsx  LoginPage.jsx  RegisterPage.jsx
               TermsPage.jsx  PrivacyPage.jsx  ImpressumPage.jsx
```

**Half the migration is done.** `index.css` already opens with the shared imports, sets
`body { background: var(--sk-surface); color: var(--sk-text); }`, and aliases the site's
legacy names onto skin roles:

```css
--dark: var(--sk-text);          --gold: var(--sk-primary);
--dark2: var(--sk-text-secondary); --gold-lt: var(--sk-success-bg);
--bg: var(--sk-bg);              --gold-dk: var(--sk-primary-hover);
--bg-card: var(--sk-surface);    --border: var(--sk-border);
--muted: var(--sk-text-muted);   --hint: var(--sk-text-subtle);

--feed: var(--sk-series-3);   --weight: var(--sk-series-1);
--cleaning: var(--sk-series-5); --shed: var(--sk-series-2);
--meds: var(--sk-series-6);   --group: var(--sk-surface-3);
--coral: var(--sk-danger-text); --purple: var(--sk-series-4);
```

**So the site has the palette and no way to change it.** There is no appearance context, no
provider, no picker, and nothing writes `data-skin` — every visitor is permanently on
`:root`, i.e. Default. That is the gap.

### 5.1 What's left in the sweep

The stylesheet was migrated; the JSX was not.

| file | hex literals | inline `style={{…}}` |
|---|---|---|
| `pages/HomePage.jsx` | 53 | 34 |
| `pages/PricingPage.jsx` | 7 | 31 |
| `components/Navbar.jsx` | 8 | 15 |
| `pages/LoginPage.jsx` | 1 | 15 |
| `pages/RegisterPage.jsx` | 0 | 13 |
| `components/Footer.jsx` | 7 | 11 |
| `components/LegalLayout.jsx` | 4 | 4 |
| `components/Logo.jsx` | 0 | 1 |
| `index.css` | 25 | 0 |
| **total** | **105** | **124** |

A literal inside an inline style cannot be re-skinned by a CSS variable. Each has to move
to a `--sk-*` role — usually by lifting the inline style into a class in `index.css`, which
is already skin-aware. Expect this to be the bulk of the hours.

### 5.2 Reuse, don't rebuild

`breeding-app-shared/src/styles/applySkin.mjs` is framework-free and already defines the
contract. It exists *because* this logic had forked into four drifting copies.

- `APPEARANCE_STORAGE_KEY = 'breedingPlannerAppearance.v1'`
- `readStoredAppearance()` — parses the persisted blob, safely
- `resolveSkinId(preset, themeMode, systemTheme)` — an explicit skin always wins
- `systemPrefersDark()`, `systemPrefersReducedMotion()`
- a function that stamps the `data-*` attributes onto `<html>`

Preserve its deliberate failure mode: an unrecognised preset matches no `[data-skin]`
block, so `:root` — which *is* Default — applies. Bad state degrades to the shipped look.
Don't add validation that throws.

**Import it. Do not fork it.**

---

## 6. Deliverable 2 — presenting the presets

The marketing site has no settings page, so the picker needs a home and a rationale.

**Requirements:**
- Exactly the four presets in §2, using the app's labels and descriptions verbatim.
- A visible swatch or live preview per option — the point is to *show* the range, not to
  offer a dropdown of four words.
- Keyboard-operable, focus-visible against `--sk-focus`, labelled for screen readers.
- Persists via `APPEARANCE_STORAGE_KEY`; applied **before first paint** (§7.5).
- Honours `systemPrefersReducedMotion()` for any transition between presets.

**Suggested home, open to your judgment:** a compact control in the footer, optionally
mirrored in the navbar. But see §9(3) — there is a real argument for making this a
first-class homepage moment instead, and we have no fixed view.

**Defaulting.** Ship Default out of the box; honour a saved choice on return.
`resolveSkinId` already has an opinion here that will bite you: with no explicit skin, a
dark system preference resolves to `deep-canopy` — **not one of our four**. Either pass
`themeMode: 'light'` so the site always starts on Default, or expose "match my system" as
a deliberate fifth control and decide what it maps to. Don't leave it accidental.

---

## 7. Deliverable 3 — how each preset should look on the site

Design an answer for every one of these. They are where the presets stop being a token
swap and start being a design problem.

### 7.1 The alternating section rhythm

The page alternates `.section` / `.section-soft` (ground) with one deliberately
`.section-dark` band (ink background, `#f5f2ec` headings via `.section-title-light`).
Under Jungle Glass the ground is *already* dark, so "the dark section" has no meaning and
the rhythm collapses.

Re-express it as a **role** — a contrast band that steps away from `--sk-bg` in whichever
direction the skin allows (`--sk-surface-2`/`-3`, or a `--sk-primary`-tinted band) — and
verify the page still has rhythm on all four. This is the highest-value single decision in
the handover.

### 7.2 The fake app preview

`HomePage.jsx` renders a mock of the product: browser chrome (`.browser-bar`,
`.browser-dot`, `.browser-url`), animal cards, morph tag chips, and a colour-coded data
grid. At 53 hex literals and 34 inline styles it is the densest block on the site.

*Design call needed* — see §9(1).

### 7.3 Cards and depth

Per §3.3, elevation behaves differently under each preset and is effectively absent under
Jungle Glass. Design `.plan-card`, `.feat-card`, `.step-card`, `.animal-card`, `.auth-card`
so the **border** carries separation and the shadow is additive. Check the featured pricing
card (`2px solid var(--gold)` → `--sk-primary`) specifically: under Sandstone the primary
is near-black olive, so "highlighted plan" may read as "outlined in black."

### 7.4 Forms and auth

`LoginPage` and `RegisterPage` are the highest-stakes surfaces — a mis-skinned field looks
broken rather than merely off-brand. `.field input` currently has `background: #fff` and a
`1.5px` border; `:focus` sets `border-color: var(--gold)`. Route all of it through roles,
and note that focus contrast is 3.5–3.7 on the light presets versus 11.5 on Jungle Glass.

`.alert-error` / `.alert-success` / `.field-error` are hardcoded and duplicate the
`--sk-{success,warning,danger,info}-{bg,border,text}` quartets. Fold them in.

### 7.5 First paint

A saved preset must be on `<html>` *before* first paint or the visitor sees a flash of
Default. Stamp it from a small inline script in `index.html`, ahead of the React bundle,
using `applySkin.mjs` — not from a `useEffect`.

### 7.6 Coverage

All seven pages, both sides of the single `640px` breakpoint. The three legal pages carry
no literals and should come free — confirm rather than assume.

---

## 8. Rules

- **No new dependencies.** Runtime is `react`, `react-dom`, `react-router-dom`. Keep it so.
- **No Tailwind.** `tw-bridge.css` in the shared styles is breeder-app-only; ignore it here.
- **Don't edit `skins.css`.** Generated in OKLCH; hand-edits break the audit and four other
  frontends. Raise issues instead of patching locally.
- **Don't touch the app.** `breeding-app-breeder`, `-lab`, `-admin`, `-marketplace` are out
  of scope. Their picker already works; this is parity on the marketing site.
- **Materials are out of scope.** A second, orthogonal texture axis (`data-material`, ten
  options: vellum, terrarium-glass, journal, soapstone, vitrine, moss-relief, …) exists and
  is already imported here, but is not being exposed on the website. Skins only. Context is
  in `docs/skins/MATERIALS.md` if you want to know what is coming.
- **Copy is fixed.** Marketing copy and product claims are not open for rewriting.
- Site and app are intended to live on different origins (serpentora.com vs
  app.serpentora.com), so the shared `localStorage` key does **not** carry a visitor's
  choice between them. Don't design as though it does.

---

## 9. Decisions we want from you

1. **Does the app preview re-skin with the site, or stay pinned to Default?**
   Our lean: **re-skin it** — it is the most persuasive possible demonstration that
   appearance settings are a real feature. The counter-argument is that it should depict
   the product as literally shipped. Your call, with reasons.

2. **Does `.section-dark` survive as a band?** A contrast band that inverts on light
   presets and softens on Jungle Glass is one answer; dropping the band on dark grounds in
   favour of rule lines is another. §7.1.

3. **How loudly does the picker announce itself?** A quiet footer control is safe. A
   deliberate "see it your way" moment on the homepage is a marketing asset — and the app
   ships 16 skins, so there is a real story to tell. Pick one and say why.

4. **Should a preset carry shape as well as colour?** Per §3 a skin is colour-only, and all
   four are geometrically identical by default. You *could* pair each with a radius and
   density signature — Jungle Glass rounded and spacious, Sandstone sharp and compact.
   That would be a new idea, not an existing one, and it would diverge from how the app
   behaves. Recommend for or against; don't do it silently.

5. **Four, or a teaser for the full set?** The ask is four. The app groups all 16 by `tone`
   (default / dark / light) precisely because a flat list of sixteen is unusable. If you
   think the site should hint at more, say so rather than adding them.

---

## 10. Done looks like

- Four named presets selectable on the marketing site, persisting across reloads and
  navigations, with no flash of the wrong preset on load.
- Zero colour literals in `src/**/*.jsx`; the only hex values reaching the site come from
  `skins.css`.
- All seven pages legible and *deliberate-looking* — not merely functional — on all four
  presets, at both breakpoints.
- The contrast floors in §2.5 still hold in situ; nothing was "adjusted to look right."
- `applySkin.mjs` imported, not forked.
- A stated answer to each question in §9.

---

## 11. Open question for the requester (not for you)

There are two divergent copies of this site in the repo, and this handover targets the first:

- **`breeding-app-public` on `main`** — imports `skins.css`, tokens aliased to `--sk-*`,
  no picker. Everything measured above.
- **`breeding-app-home` on `deploy/home`** — a restructured fork (`src/home/…`) whose
  `home.css` also imports `skins.css`, but which still carries the **pre-skin**
  `AppearanceContext.jsx` (the old `--color-*` preset system, zero `data-skin` references).
  It is behind `main` on appearance.

Which is the deployed marketing site needs confirming before work starts. If it is
`breeding-app-home`, everything here still applies, but §5's paths and counts must be
re-measured and that fork's stale `AppearanceContext.jsx` becomes an extra hard spot.

---

## Appendix — file map

| file | why |
|---|---|
| `breeding-app-shared/src/styles/skins.css` | **source of truth** — the four blocks, the component kit, the shape wiring |
| `breeding-app-shared/src/styles/applySkin.mjs` | framework-free persistence + resolution + stamping |
| `docs/skins/skins.contrast.txt` | measured ratios, all 16 skins |
| `docs/audits/SKIN_ARCHITECTURE.md` | why the system is shaped this way |
| `docs/skins/MIGRATION-NOTES.md`, `docs/skins/FIXES.md` | what the four app migrations hit |
| `docs/skins/MATERIALS.md` | the texture axis — out of scope, context only |
| `breeding-app-breeder/src/contexts/AppearanceContext.jsx` | the picker model to stay consistent with |
| `breeding-app-public/src/index.css` | the site's half-migrated stylesheet |
| `docs/design/CLAUDE_DESIGN_HANDOFF.md` | full product/visual-language brief for the suite |
| `breeding-app-public/DESIGN.md`, `.impeccable/design.json` | the site's own design system |
