# Visual Language

This document is the single source of truth for how every frontend in this product suite should look
and feel: **breeder**, **lab**, **admin**, **marketplace**, and **public**. Copy this file into any new
or existing frontend repo unchanged. If a frontend's current styling conflicts with this doc, this doc
wins — update the frontend, not the doc (propose changes here first, then roll them out everywhere).

## Source of truth

The canonical implementation lives in `breeding-app-breeder/src/contexts/AppearanceContext.jsx`. It is
the only app in the suite with a real design-token system: colors, typography, spacing, radius, and
motion are all expressed as CSS custom properties on `<html>`, computed from a small set of named
presets. Every other frontend should wire its own components to these same variable names rather than
hardcoding hex values.

## 1. Color roles

Colors are never referenced by hex value in components — only by role, via CSS custom properties.
This is what lets end users re-skin the breeder app with presets (see §5) without touching component
code, and it's what lets every other frontend match without copy-pasting colors.

| Role | CSS variable | Default value | Used for |
|---|---|---|---|
| Primary | `--color-primary` | `#0ea5e9` | Primary actions, links, active states, focus rings |
| Secondary | `--color-secondary` | `#2563eb` | Secondary actions, border accents |
| Accent | `--color-accent` | `#f59e0b` | Highlights, callouts, "new"/attention markers |
| Background | `--color-bg` | `#f6f7f9` | App/page background |
| Card | `--color-card` | `#ffffff` | Panels, cards, modals, table surfaces |
| Text | `--color-text` | `#0f172a` | Primary text color |

Derived/compat aliases set alongside the above (some older components read these names — new code
should prefer the `--color-*` names above):

- `--primary` = `--color-primary`
- `--primary-border` = `--color-secondary`
- `--primary-contrast` = `--color-text`
- `--overlay-color` = `rgba(15,23,42,0.35)` in light mode, `rgba(15,23,42,0.6)` in dark mode

### Semantic status colors (fixed, not themeable)

These are used consistently for state feedback regardless of the active preset:

| State | Background | Border | Text |
|---|---|---|---|
| Success | `#f0fdf4` | `#bbf7d0` | `#166534` |
| Error | `#fff1f2` | `#fecaca` | `#9f1239` |
| Warning / recommended | `#dcfce7` | `#86efac` | `#166534` |
| Danger / inactive | `#fee2e2` | `#fca5a5` | `#991b1b` |
| Neutral / hidden | `#f3f4f6` | `#d1d5db` | `#6b7280` |

### Preset palette (reference)

The breeder app ships six presets. Any frontend that offers theming should be able to reuse this table
verbatim; frontends that don't offer theming should just use the **Default** row.

| Preset | primary | secondary | accent | background | text |
|---|---|---|---|---|---|
| Default | `#0ea5e9` | `#2563eb` | `#f59e0b` | `#f6f7f9` | `#0f172a` |
| Minimal | `#0f172a` | `#94a3b8` | `#f97316` | `#fbfbfb` | `#0f172a` |
| High contrast | `#ffb100` | `#ffd700` | `#ff4d4f` | `#000000` | `#ffffff` |
| Visually impaired | `#005fcc` | `#111827` | `#b45309` | `#ffffff` | `#000000` |
| Dark breeder | `#12b981` | `#0f172a` | `#ef4444` | `#05070d` | `#e2e8f0` |
| Soft pastel | `#f472b6` | `#a5b4fc` | `#34d399` | `#fef6fb` | `#2e1065` |

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
