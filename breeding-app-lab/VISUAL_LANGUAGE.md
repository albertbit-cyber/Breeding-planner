# Visual Language

This document is the single source of truth for how every frontend in this product suite should look
and feel: **breeder**, **lab**, **admin**, **marketplace**, and **public**. Copy this file into any new
or existing frontend repo unchanged. If a frontend's current styling conflicts with this doc, this doc
wins — update the frontend, not the doc (propose changes here first, then roll them out everywhere).

## Source of truth

The palette lives in **`breeding-app-shared/src/styles/skins.css`** — one
`[data-skin="…"]` block per skin, plus a `[data-theme-mode="high-contrast"]`
modifier. That file is the only place in the entire repo where a colour literal
belongs.

`breeding-app-breeder/src/contexts/AppearanceContext.jsx` no longer holds any
colours. It decides which skin is active and stamps `data-skin` /
`data-theme-mode` onto `<html>`; everything genuinely dynamic (typography,
density, radius, motion, persistence, user overrides) still lives there. The
other four frontends share `breeding-app-shared/src/styles/applySkin.mjs` and
carry an 83-line provider that only reads.

**Invariant: a hex literal outside `skins.css` is a bug.**

### How Tailwind participates

The breeder is the only Tailwind app. `tw-bridge.css` re-points Tailwind v4's
stock palette variables at the skin roles:

```css
@theme {
  --color-neutral-500: var(--sk-text-muted);   /* 334 existing call sites */
  --color-white:       var(--sk-surface);
  --color-neutral-200: var(--sk-border);
}
```

Tailwind v4 compiles every colour utility to `var(--color-*)`, so this converts
roughly 2,000 existing `bg-white` / `text-neutral-500` / `border-neutral-200`
usages without editing a single one of them. Import order matters:
`tailwindcss`, then `skins.css`, then `tw-bridge.css`.

`--color-black` is deliberately **not** re-pointed — the label-preview
checkerboard and QR rendering need true black. Modal scrims use `.sk-scrim`.

## 1. Color roles

Colours are never referenced by hex value in components — only by role.

| Role | Variable | Used for |
|---|---|---|
| Page ground | `--sk-bg`, `--sk-bg-2` | app/page background |
| Surface | `--sk-surface` | cards, panels, table rows |
| Surface (subtle) | `--sk-surface-2`, `--sk-surface-3` | zebra rows, hover fills |
| Raised | `--sk-surface-raised` | modals, popovers, menus |
| Scrim | `--sk-scrim` (R G B channels) | modal backdrops, via `.sk-scrim` |
| Divider | `--sk-border`, `--sk-border-strong` | borders, inputs |
| Text | `--sk-text` | headings, primary copy |
| Text (secondary) | `--sk-text-secondary` | body |
| Text (muted) | `--sk-text-muted` | labels, hints |
| Text (subtle) | `--sk-text-subtle` | placeholders, disabled |
| On accent | `--sk-text-on-accent` | copy that sits **on** `--sk-primary` |
| Brand | `--sk-primary`, `--sk-primary-hover`, `--sk-accent` | actions, highlights |
| Wordmark | `--sk-brand` | the product name — checked against **both** `--sk-bg` and `--sk-surface` |
| Low-emphasis fill | `--sk-primary-quiet`, `--sk-primary-quiet-text` | secondary CTAs that need a fill but not the full primary |
| Link | `--sk-link` | links |
| Focus | `--sk-focus` | focus rings |
| Status | `--sk-{success,warning,danger,info}-{bg,border,text}` | state feedback |
| Elevation | `--sk-shadow-color`, `--sk-shadow-1/2/3` | shadows |
| Data series | `--sk-series-1` … `--sk-series-6` | charts, Family Tree roles |

`--sk-text-on-accent` is authored explicitly by every skin and is **never**
derived from `--sk-text`. Conflating them is what made the old `minimal` preset
render invisible button labels.

### Authoring a skin

One `[data-skin="your-name"]` block, ~34 declarations, then:

```
node breeding-app-shared/src/styles/__tests__/skins.contrast.test.js   # prints a table
npm --prefix breeding-app-shared run test                              # under vitest
```

The test enforces every text pair, the focus ring against **both** surface and
primary, the four status quartets, and that the six data series stay >= 60 deg
apart and >= 3:1 on surface. `high-contrast-forest` is held to 7:1 (AAA).

`default` carries three pinned legacy shortfalls (focus 2.77 / 2.14, border
1.26) — today's shipped values, pinned at value rather than ignored so they
cannot drift worse. See `docs/skins/MIGRATION-NOTES.md`.

**The static test cannot catch everything.** The worst finding of the 24 Aug
audit was an inline style on `.app-root`, not a stylesheet value — skins.css
passed its own suite while the running app was unreadable. Keep the DOM audit
(measure rendered foreground against rendered background, per skin, per route)
and run both.

### Surfaces frozen on `default`

These deliberately do **not** follow the user's skin: the 13 backend email
templates, jsPDF certificates and labels, the Capacitor splash and status bar,
and the PWA manifest. A breeder's personal skin should not change what their
customers receive by email. Note that `html2canvas` exports *will* bake the
active skin into shared images.

## 2. Typography

- **Default font stack:** `'Space Grotesk', 'Segoe UI', system-ui, -apple-system, sans-serif`
  (CSS variable: `--font-family`)
- **Fallback system stack** (used where the app doesn't opt into Space Grotesk): `-apple-system,
  BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans',
  'Helvetica Neue', sans-serif`
- **Monospace:** `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace` (IDs, codes, mono
  data cells)
- **Base size scale** (`--font-size-base`): small `14px` · medium `16px` (default) · large `18px` ·
  xlarge `20px`
- **Line height** (`--line-height`): compact `1.35` · normal `1.6` (default) · relaxed `1.8`
- Alternate font options exist for accessibility/branding presets (Inter, Roboto, Open Sans, Cormorant
  Garamond for serif/editorial contexts, IBM Plex Mono) — don't introduce new font families outside
  this list without updating this doc.

## 3. Spacing & density

Layout density is a single toggle that scales button/card padding and row height together — never
hardcode padding on interactive elements; read it from density tokens instead.

| Density | button padding (Y / X) | card padding | table row height | list gap |
|---|---|---|---|---|
| Compact | `0.35rem` / `0.85rem` | `0.75rem` | `2.25rem` | `0.4rem` |
| Comfortable (default) | `0.55rem` / `1rem` | `1.15rem` | `2.65rem` | `0.65rem` |
| Spacious | `0.75rem` / `1.35rem` | `1.5rem` | `3.1rem` | `0.9rem` |

CSS variables: `--button-padding-y`, `--button-padding-x`, `--card-padding`, `--table-row-height`,
`--list-gap`.

## 4. Corner radius

| Style | Value | Variable |
|---|---|---|
| Sharp | `2px` | `--border-radius` |
| Soft (default) | `8px` | `--border-radius` |
| Rounded | `16px` | `--border-radius` |
| Pill (buttons/tags/badges only, not cards) | `999px` | n/a — use directly |

Cards, panels, tables, and inputs use `--border-radius` (or a fixed `8px`/`12px` if the frontend has no
theming). Buttons, badges, tags, and chips commonly use fully-rounded pill shapes (`border-radius:
999px`) regardless of the active radius preset — this is a deliberate exception, not an inconsistency.

## 5. Motion

- Standard transition duration: `--motion-duration`, `250ms` by default, `0ms` when animations are
  disabled.
- Respect `prefers-reduced-motion` and the app's own "reduce motion" toggle — both map to the same
  `data-motion-preference="reduced"` attribute on `<html>`.
- Interactive feedback conventions: buttons scale to `0.97` on `:active`, hover states use `opacity:
  0.88` or a `translateY(-1px)` lift + shadow increase — pick one per component, don't combine both on
  the same element.

## 6. Component patterns

### Buttons
- Solid fill using `--color-primary` background, contrast text color, `--border-radius` (or pill for
  chip-style actions), horizontal/vertical padding from the density scale.
- Disabled state: `opacity: 0.6`, `cursor: not-allowed`.
- Ghost/secondary variant: transparent background, 1px border in a neutral gray (`#d0d7e2` /
  `#cdd5df` family), same radius as primary.

### Cards / panels
- White (`--color-card`) surface, 1px neutral border (`#dde3ea` / `#e1e7ef` family), `8–12px` radius,
  padding from `--card-padding`.
- Hover-interactive cards (e.g. pricing tiers) add a soft shadow on hover
  (`0 4px 16px rgba(15,23,42,0.08)`) rather than changing the border.

### Badges / pills / tags
- Always pill-shaped (`999px`) or `6px` radius for small inline tags.
- Pair a light tint background with a matching dark text color from the same hue (see semantic status
  table in §1) — never a saturated background with white text for these small elements.

### Tables
- Header row: light gray background (`#f1f4f8` family), bold `700` weight, muted text color
  (`#475467` family).
- Row height from `--table-row-height`; borders are 1px, bottom-only, in the neutral border family.

### Overlays / modals
- Backdrop: `rgba(15, 23, 42, 0.35–0.45)`, optionally with `backdrop-filter: blur(8–12px)`.
- Modal surface: `--color-card`, larger radius (`16–32px` for prominent dialogs like auth), generous
  padding, entrance animation is a short fade + upward translate (`auth-fade-in` pattern: opacity 0→1,
  translateY 25px→0, ~0.35s ease).

## 7. Current state across frontends (as of this writing)

Only **breeder** implements the token system above. The other frontends currently hardcode their own
independent palettes and should be migrated toward the tokens in this doc rather than treated as
separate brands:

- **admin** — hardcoded dark-navy dashboard (`#101828` sidebar, `#f6f7f9` background, ad hoc greens/
  reds for status). Its `App.css` also bundles marketplace, auth-overlay, and appearance-designer
  styles together.
- **marketplace** — hardcoded forest-green brand (`#12392b`, `#14533f`, `#e7f5ee`), distinct from both
  admin and breeder.
- **public** (marketing site) — a third, independent "editorial" palette (`#1c1c1a` near-black + `#c8a840`
  gold accent, cream `#faf8f3` background) with its own CSS variable set.
- **lab** — no dedicated theme file; its shell CSS is largely copy-pasted from admin's (same hex
  values for backgrounds, status colors, etc.), meaning lab and admin already drift in and out of sync
  by hand-copying rather than sharing a real source.

**Migration guidance:** don't attempt a big-bang rewrite. When touching a component in any of these
apps, prefer swapping its hardcoded hex values for the matching CSS variable from §1–§5 (e.g. replace
`background: #101828` with a value driven by `--color-text` / a dark neutral token) so the app
gradually converges on this system instead of accumulating a sixth palette.

## 8. Do / don't

- **Do** read colors, radius, spacing, and font from the variables in this doc.
- **Do** keep the pill-shape exception for buttons/badges even when the active radius preset is
  "sharp" or "soft."
- **Do** respect `prefers-reduced-motion` and the app's reduced-motion setting.
- **Don't** introduce a new hex color for something this doc already has a role for (primary, accent,
  success, error, etc.).
- **Don't** hardcode font families outside the stack list in §2.
- **Don't** copy another frontend's CSS file wholesale to "match" the look — wire up the same variable
  names instead, so a future palette change propagates everywhere automatically.
