# Breeding Planner / Serpentora

## Design skills: who owns which decision

Four design tools are installed. They overlap, so ownership is fixed. When two of them
disagree about the same decision, the owner below wins and the other stays quiet.

| Responsibility | Owner | Not owned by |
|---|---|---|
| Visual direction, composition, typography, palette, anti-generic judgment | `design-taste-frontend` | Impeccable, Emil |
| Motion, easing, duration, micro-interaction, perceived responsiveness | `emil-design-eng` | design-taste-frontend |
| Design QA: hierarchy, spacing, a11y, consistency, responsive, unfinished detail | `impeccable` (`critique`, `audit`, `polish`) | design-taste-frontend |
| Rendered-result verification at real viewports | Playwright browser MCP (`.mcp.json`) | any skill's self-assessment |

### The standing conflicts, and how they resolve

- **`DESIGN.md` is a record, not a rival direction.** Impeccable's `document` mode wrote
  `breeding-app-public/DESIGN.md` describing the incumbent "Keeper's Field Notebook" world.
  Treat it as the current state and as binding constraint, which is exactly the input
  `design-taste-frontend`'s redesign protocol expects. Direction *changes* are
  `design-taste-frontend`'s call; `DESIGN.md` is then updated to match. Do not let
  Impeccable invent a new visual world (its `new-work` flow) on a surface that already has one.
- **Never run Impeccable's `init` on this repo again without reading what exists.**
  `breeding-app-public/PRODUCT.md` (233 lines) and `DESIGN.md` (457 lines) are hand-verified
  against the codebase and are better than anything a fresh interview would produce.
  `PRODUCT.md` is the authority on what the product may *claim*; check copy against its
  "Claims that are NOT supported" list before writing any marketing string.
- **`design-taste-frontend` is tuned for greenfield landing pages.** Several of its hard
  rules conflict with this product's committed system on purpose. Where they collide, the
  brief and `DESIGN.md` win, per that skill's own "The brief wins" and Redesign Protocol:
  - it bans multi-hue palettes as "one accent only"; here the six notebook tab hues are
    *categorical* (a hue names a module) and stay;
  - it bans light/dark section flipping; here the alternating Cool Paper / Ink bands are the
    documented Band Rule and stay.
  Its anti-slop rules that do NOT conflict (em-dash ban, eyebrow restraint, no three-equal-card
  filler, no div-based fake screenshots, hero discipline) apply in full.

### Workflow for UI work

1. **Understand** — read `PRODUCT.md`, `DESIGN.md`, and the actual component. Do not start coding.
2. **Direction** — `design-taste-frontend` sets or confirms the visual direction. State the design read in one line.
3. **Build** — implement, preserving function and content.
4. **Inspect** — run the app, view it in the browser at desktop and mobile. Code compiling is not done.
5. **QA** — `impeccable critique` or `audit` against the implementation.
6. **Fix** — resolve real hierarchy, responsive, a11y and consistency problems.
7. **Motion** — only once layout is stable, apply `emil-design-eng`.
8. **Final browser pass** — desktop and mobile again; fix what is left.

Do not polish motion on a layout that may still change (step 7 comes after step 6, deliberately).

## Notes

- `.claude/skills/` is gitignored on purpose: skills are machine-local, installed per developer.
- Sub-app dev ports in use: breeder/admin/marketplace 5173, lab 5174, public 5174, home 5178.
  Check the port is free before starting a server; another app is often already running.
