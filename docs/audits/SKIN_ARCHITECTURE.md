# Skin Architecture — recommended approach

**Companion to** [`THEMING_RETROFIT_AUDIT.md`](./THEMING_RETROFIT_AUDIT.md).
**Date:** 2026-08-23 · **Worktree:** `feature/appearance-theming`
**Status:** proposal. No code changed.

---

## 0. The finding that decides the architecture

The audit's blocker #1 said the 2,433 Tailwind palette-literal classes (`bg-white`, `text-neutral-500`,
`border-neutral-200`) were each a manual edit. **That was too pessimistic.** I compiled the installed
Tailwind against those exact class names to check what they actually emit:

```
.bg-neutral-50   { background-color: var(--color-neutral-50); }
.bg-white        { background-color: var(--color-white); }
.text-neutral-500{ color: var(--color-neutral-500); }
.text-rose-600   { color: var(--color-rose-600); }
.ring-sky-400    { --tw-ring-color: var(--color-sky-400); }
```

**Tailwind v4 compiles every color utility to `var(--color-*)`.** The stock palette is already a set of
CSS custom properties. So the palette is re-pointable at runtime *without touching a single one of the
2,433 call sites.*

I then verified that a user `@theme` block actually re-points them:

```css
@theme {
  --color-neutral-500: var(--sk-text-muted);
  --color-white: var(--sk-surface);
}
```
emits `--color-white: var(--sk-surface)` into `:root`, and `.bg-white` keeps referencing
`var(--color-white)` — a live chain that resolves at paint time, not build time.

Opacity modifiers survive the chain too (this matters for the 12+ modal scrims):
```css
.bg-white\/80 {
  background-color: var(--color-white);
  @supports (color: color-mix(in lab, red, red)) {
    background-color: color-mix(in oklab, var(--color-white) 80%, transparent);
  }
}
```

**Consequence:** the retrofit's centre of gravity moves from "edit 26,174 lines of `App.jsx`" to
"write one ~40-line bridge file." That is the difference between a multi-month refactor and a
contained one.

---

## 1. Recommended shape: three layers, one anchor

```
┌─ Layer 3 ── AppearanceContext (JS, existing) ───────────────────────┐
│  writes  <html data-skin="…" data-theme-mode="…">                   │
│  writes  inline --sk-* ONLY for user custom-picker overrides        │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ inline style beats stylesheet
┌─ Layer 1 ── skins.css ───▼──────────────────────────────────────────┐
│  :root, [data-skin="editorial"], [data-theme-mode="dark"] { … }     │
│  ~24 --sk-* semantic roles. THE ONLY PLACE A HEX APPEARS.           │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ consumed by
┌─ Layer 2 ── bridge.css ──▼──────────────────────────────────────────┐
│  @theme { --color-neutral-500: var(--sk-text-muted); … }            │
│  re-points Tailwind's stock palette → semantic roles.               │
│  Converts all 2,433 existing utility classes. Write once, never     │
│  touch again.                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

**Anchor: `data-skin` on `document.documentElement`** — not `.app-root`. Two reasons from the audit:
the 15 `createPortal(…, document.body)` sites escape `.app-root` entirely, and the provider already
writes `root.dataset.themeMode` in exactly the `useEffect` where `data-skin` belongs
(`AppearanceContext.jsx`, the effect that currently sets `root.dataset.*`).

**Why this shape and not the alternatives:**

| Alternative | Why not |
|---|---|
| Migrate JSX to semantic classes (`bg-surface`) | 2,433 edits inside a 26k-line file, for the same end state the bridge gives for free. Do it opportunistically later, never as a prerequisite. |
| Keep expanding the JS `cssVariables` object | Colors stay trapped in JS, still 4 forked copies, and every new skin is a code change + rebuild. CSS is the right medium for a palette. |
| Ship a component library first | Correct long-term, wrong first move. It blocks skinning behind a full UI rewrite. |
| CSS-in-JS / styled-components | Adds a runtime to an app that has none, and doesn't solve the Tailwind literals at all. |

---

## 2. Layer 1 — the skin file (this is what "creating a skin" means)

**A skin is a flat CSS block. ~24 declarations, no JS, no rebuild-time logic.** This is the deliverable
format — a designer or an AI can author a new skin without reading any application code.

```css
/* breeding-app-shared/src/styles/skins.css */

:root,
[data-skin="default"] {
  /* ── surfaces ─────────────────────────────────────────── */
  --sk-bg:              #f6f7f9;   /* page canvas */
  --sk-surface:         #ffffff;   /* cards, panels, table rows  (was bg-white ×133) */
  --sk-surface-2:       #fafafa;   /* subtle fills, zebra rows   (was bg-neutral-50 ×88) */
  --sk-surface-3:       #f5f5f5;   /* hover fills                (was bg-neutral-100) */
  --sk-surface-raised:  #ffffff;   /* modals, popovers, menus */
  --sk-scrim:           15 23 42;  /* modal backdrop, as R G B channels — see §4.1 */

  /* ── lines ────────────────────────────────────────────── */
  --sk-border:          #e5e5e5;   /* default divider            (was border-neutral-200 ×28) */
  --sk-border-strong:   #d4d4d4;   /* inputs, emphasised edges */

  /* ── text ─────────────────────────────────────────────── */
  --sk-text:            #171717;   /* headings, primary copy */
  --sk-text-secondary:  #404040;   /* body                       (was text-neutral-700/600 ×120) */
  --sk-text-muted:      #737373;   /* labels, hints              (was text-neutral-500 ×334) */
  --sk-text-subtle:     #a3a3a3;   /* placeholders, disabled */
  --sk-text-on-accent:  #ffffff;   /* copy that sits ON --sk-primary — see §4.3 */

  /* ── brand ────────────────────────────────────────────── */
  --sk-primary:         #0ea5e9;
  --sk-primary-hover:   #0284c7;
  --sk-accent:          #f59e0b;
  --sk-link:            #0284c7;
  --sk-focus:           #38bdf8;   /* focus ring — must contrast with BOTH surface and primary */

  /* ── status (keeps the existing 3-part bg/border/text shape) ── */
  --sk-success-bg: #f0fdf4;  --sk-success-border: #bbf7d0;  --sk-success-text: #166534;
  --sk-warning-bg: #fffbeb;  --sk-warning-border: #fde68a;  --sk-warning-text: #92400e;
  --sk-danger-bg:  #fee2e2;  --sk-danger-border:  #fca5a5;  --sk-danger-text:  #991b1b;
  --sk-info-bg:    #eff6ff;  --sk-info-border:    #bfdbfe;  --sk-info-text:    #1e40af;

  /* ── depth ────────────────────────────────────────────── */
  --sk-shadow-color: 15 23 42;
  --sk-shadow-1: 0 1px 2px rgb(var(--sk-shadow-color) / 0.06);
  --sk-shadow-2: 0 4px 12px rgb(var(--sk-shadow-color) / 0.08);
  --sk-shadow-3: 0 24px 72px rgb(var(--sk-shadow-color) / 0.32);

  /* ── data series (Family Tree roles, charts) ──────────── */
  --sk-series-1: #0ea5e9;  --sk-series-2: #ec4899;  --sk-series-3: #10b981;
  --sk-series-4: #7c3aed;  --sk-series-5: #f59e0b;  --sk-series-6: #6366f1;
}
```

A dark skin is the **same 24 keys, different values** — no new selectors, no `@media` gymnastics:

```css
[data-skin="dark-breeder"] {
  --sk-bg: #05070d;  --sk-surface: #111827;  --sk-surface-2: #1a2231;
  --sk-surface-3: #232c3d;  --sk-surface-raised: #1a2231;  --sk-scrim: 0 0 0;
  --sk-border: #263041;  --sk-border-strong: #35415a;
  --sk-text: #e2e8f0;  --sk-text-secondary: #b8c2d1;
  --sk-text-muted: #8792a5;  --sk-text-subtle: #5d6779;
  --sk-text-on-accent: #05070d;
  --sk-primary: #12b981;  --sk-primary-hover: #0ea371;
  --sk-accent: #ef4444;  --sk-link: #34d399;  --sk-focus: #34d399;
  --sk-success-bg: #0f2b21; --sk-success-border: #1d4b3a; --sk-success-text: #6ee7b7;
  /* …warning / danger / info… */
  --sk-shadow-color: 0 0 0;
  /* …series… */
}
```

**Rule for the file: a hex literal outside `skins.css` is a bug.** That is the invariant
`VISUAL_LANGUAGE.md` already claims and the code never enforced.

---

## 3. Layer 2 — the bridge (write once)

```css
/* breeding-app-shared/src/styles/tw-bridge.css — imported AFTER "tailwindcss" */
@theme {
  /* neutral ramp carries the entire text/surface hierarchy in this app */
  --color-white:       var(--sk-surface);
  --color-neutral-50:  var(--sk-surface-2);
  --color-neutral-100: var(--sk-surface-3);
  --color-neutral-200: var(--sk-border);
  --color-neutral-300: var(--sk-border-strong);
  --color-neutral-400: var(--sk-text-subtle);
  --color-neutral-500: var(--sk-text-muted);      /* ← 334 sites, one line */
  --color-neutral-600: var(--sk-text-secondary);
  --color-neutral-700: var(--sk-text-secondary);
  --color-neutral-800: var(--sk-text);
  --color-neutral-900: var(--sk-text);

  /* semantic ramps the app already uses by convention */
  --color-rose-600:    var(--sk-danger-text);
  --color-rose-200:    var(--sk-danger-border);
  --color-amber-50:    var(--sk-warning-bg);
  --color-amber-200:   var(--sk-warning-border);
  --color-amber-700:   var(--sk-warning-text);
  --color-emerald-50:  var(--sk-success-bg);
  --color-emerald-700: var(--sk-success-text);
  --color-sky-400:     var(--sk-focus);
  --color-sky-600:     var(--sk-link);
  --color-sky-700:     var(--sk-link);
  --color-violet-500:  var(--sk-series-4);
  /* … */
}

/* v4 preflight is `border: 0 solid` → bare `border` inherits currentColor.
   One rule gives every bare-`border` element a real token. */
*, ::before, ::after { border-color: var(--sk-border); }
```

That block plus the preflight rule converts roughly **2,000 of the 2,433** literal utility sites.
`App.jsx` is not edited.

> Note: `@theme inline` is the documented v4 variant that removes the `--color-*` → `--sk-*` indirection
> hop. I verified the plain `@theme` form above compiles and chains correctly; I did **not** test
> `inline`. Start with the tested form.

---

## 4. What the bridge does *not* fix — four bounded pockets

These are the honest residue. All four are small and enumerable, unlike the 2,433.

### 4.1 Modal scrims — ~12 strings
Verified: `.bg-black/40` compiles to `color-mix(in oklab, var(--color-black) 40%, transparent)`.
So it *would* follow `--color-black` — but overriding `--color-black` globally also hits the
`LabLabelPreview` checkerboard, QR rendering, and any true-black intent. **Don't.** Instead do a
bounded find-replace of the ~12 scrim class strings listed in audit §2.3.4 onto one shared class:
```css
.sk-scrim { background: rgb(var(--sk-scrim) / 0.45); backdrop-filter: blur(12px); }
```
This also finally uses the `--overlay-color` token the audit found was defined and consumed by exactly
one class.

### 4.2 Shadows — 37 declarations
Verified: `shadow-2xl` emits `--tw-shadow: 0 25px 50px -12px var(--tw-shadow-color, rgb(0 0 0/0.25))`,
and `--tw-shadow-color` is registered `@property … inherits: false`. **An inherited variable cannot
re-point it** — there is no one-line fix. Options, in order of preference:
1. Replace the 29 hardcoded `box-shadow:` declarations in `App.css` with `var(--sk-shadow-1|2|3)`.
   Mechanical, ~29 edits, in CSS not JSX.
2. Accept stock Tailwind `shadow-*` on dark skins and lean on `--sk-border` + `--sk-surface-2` for
   elevation instead — which is the correct dark-mode idiom anyway.

Do **not** try to tint shadows with brand hue per skin; audit §2.3.1 shows five different brand tints
already, and that is the mess being replaced.

### 4.3 `--primary-contrast` — the live bug
Audit blocker #4: `--primary-contrast` is aliased to `--color-text`, so the shipped `minimal` preset
(primary `#0f172a`, text `#0f172a`) renders invisible button labels *today*. `--sk-text-on-accent` in
§2 is a **separate, explicitly authored** role — never derived. Every skin must set it, and the skin
review checklist (§7) must check it against `--sk-primary`.

### 4.4 Non-DOM surfaces
The bridge cannot reach: 13 backend email templates, jsPDF certificates/labels (RGB triplets),
Capacitor splash/status bar (`#07110d`), PWA manifest, `<meta name="theme-color">`, and `html2canvas`
exports (which will bake the active skin into shared images). **Recommendation: freeze these on the
`default` skin deliberately** and say so in `VISUAL_LANGUAGE.md`. A user's personal skin should not
change what their customers receive by email.

---

## 5. Layer 3 — what changes in `AppearanceContext.jsx`

It gets **smaller**, not bigger.

**Remove from JS:** every color object — `DEFAULT_STATUS_COLORS`, `EDITORIAL_STATUS_COLORS`,
`HIGH_CONTRAST_COLORS`, and the `colors: {…}` block inside all 7 presets. Those move to `skins.css`.

**Presets become references:**
```js
const APPEARANCE_PRESETS = {
  default:      { key: "default",      label: "Default",           description: "…" },
  editorial:    { key: "editorial",    label: "Editorial",         description: "…" },
  darkBreeder:  { key: "darkBreeder",  label: "Dark breeder",      description: "…" },
  // …no colors. The skin id IS the contract.
};
```

**Keep in JS:** `themeMode` resolution, `matchMedia` listeners, typography/density/radius/motion (those
are genuinely dynamic), persistence, and the custom-picker overrides.

**The effect gains one line:**
```js
root.dataset.skin = appearanceState.preset;   // ← new; drives skins.css
root.dataset.themeMode = effectiveThemeMode;  // existing
```

**Wire up the four dead attributes** (audit blocker #7) while you are in here — `data-appearance-density`,
`data-appearance-radius`, `data-motion-preference` are written today and read by zero CSS selectors. They
belong in `skins.css` alongside the palette:
```css
[data-appearance-density="compact"]    { --sk-card-pad: .75rem; --sk-row-h: 2.25rem; /* … */ }
[data-appearance-radius="sharp"]       { --sk-radius: 2px; }
[data-motion-preference="reduced"] *   { animation-duration: 0ms !important; transition-duration: 0ms !important; }
```

**User custom colors** keep writing inline `--sk-*` on `documentElement` — inline style beats the
stylesheet, so a custom preset naturally layers on top of whichever skin it started from. That is the
existing mechanism, just renamed.

---

## 6. Two things to fix in the same pass (they are one-liners)

**FOUC** (audit blocker #6) — add to each `index.html`, before the stylesheet:
```html
<script>
  try {
    var a = JSON.parse(localStorage.getItem('breedingPlannerAppearance.v1') || '{}');
    var m = a.themeMode === 'system' || !a.themeMode
      ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : a.themeMode;
    document.documentElement.dataset.skin = a.preset || 'default';
    document.documentElement.dataset.themeMode = m;
  } catch (e) {}
</script>
```
Eight lines removes the light-flash-on-every-launch that dark-skin users see today, including the
splash-dark → flash-light → dark sequence on the Capacitor Android build.

**Fork drift** (audit blocker #8) — `skins.css` and `tw-bridge.css` live in **`breeding-app-shared`**,
which the audit found has zero color literals and no theming code. Each app imports them. Otherwise
every skin has to be authored 4-5 times, which is exactly how `AppearanceContext.jsx` ended up forked
into two versions 96 lines apart.

---

## 7. Skin review checklist

Every new skin block must pass before merge. This is the guardrail the audit found completely absent
(blocker #10 — six free-form hex pickers with shape-only validation, already able to produce and
cloud-sync an unreadable app).

- [ ] `--sk-text` on `--sk-surface` ≥ 4.5:1
- [ ] `--sk-text-muted` on `--sk-surface` ≥ 4.5:1 — **the 334-site role; the one most likely to fail**
- [ ] `--sk-text-secondary` on `--sk-surface-2` ≥ 4.5:1
- [ ] `--sk-text-on-accent` on `--sk-primary` ≥ 4.5:1 — catches the live `minimal`-preset bug
- [ ] `--sk-focus` ≥ 3:1 against **both** `--sk-surface` and `--sk-primary`
- [ ] each `--sk-*-text` on its matching `--sk-*-bg` ≥ 4.5:1
- [ ] `--sk-border` visible against `--sk-surface` (≥ 1.5:1)
- [ ] all 6 `--sk-series-*` distinguishable from each other and from `--sk-surface`

Worth automating as a vitest that parses `skins.css` and asserts contrast — cheap, and it is the only
thing standing between users and an unreadable custom preset.

---

## 8. Sequence

Each step is independently shippable and independently revertable.

| # | Step | Effort | Unblocks |
|---|---|---|---|
| 1 | `skins.css` + `tw-bridge.css` in `breeding-app-shared`; `default` skin only, values chosen to match today's look **exactly** | S | everything; ships as a visual no-op |
| 2 | `data-skin` line in `AppearanceContext`; pre-paint script in `index.html` | XS | FOUC fix, skin switching |
| 3 | Port the 7 existing presets from JS objects to `skins.css` blocks; strip the color objects from JS | M | real dark mode |
| 4 | `App.css` sweep: 388 literals → `var(--sk-*)`; the 63 `!important` and the `.app-root button` hammer come out here | M–L | frees buttons/portals |
| 5 | The four pockets — scrims, shadows, Family Tree, SVG chart chrome | M | full coverage |
| 6 | Contrast test + skin authoring guide in `VISUAL_LANGUAGE.md` | S | safe third-party skins |

**Step 1 is a visual no-op that ships on day one.** If the `default` skin's 24 values are chosen to
reproduce the current appearance exactly, the bridge lands with zero visible change — and from that
point every subsequent skin is a 24-line CSS block.

---

## 9. Answer in one paragraph

**A skin should be a flat CSS block of ~24 semantic `--sk-*` roles under a `[data-skin="…"]` selector
on `<html>`, bridged into Tailwind's stock palette by a single `@theme` file.** Because Tailwind v4
already compiles `bg-white` and `text-neutral-500` to `var(--color-white)` / `var(--color-neutral-500)`
— verified against the installed compiler, not assumed — re-pointing those variables converts ~2,000 of
the 2,433 hardcoded utility sites without editing `App.jsx` at all. The existing `AppearanceContext`
stays, gets *smaller* (colors move out of JS into CSS), and gains one line writing `data-skin`. The
honest residue is four bounded pockets: ~12 modal scrims, 37 shadow declarations, the Family Tree's
violet island, and the non-DOM surfaces (email/PDF/native chrome) which should be deliberately frozen
on the default skin rather than themed.
