# serpentora-skins v2

Skin system + remediation package for the Breeding Planner suite.
Addresses **R1–R9** of the 24 Aug 2026 contrast audit.

Expected at `D:\Git Clone\Breeding-planner\serpentora-skins-v2`.

## Start here

**`FIXES.md`** — the ten-step rollout, one section per audit finding.

Read the "Read this first" note before anything else: the audit's finding is that the
skins were never the problem, so **adding skins fixes nothing on its own.** R1 alone —
one inline `color` on `.app-root` — accounts for ~300 of the ~370 unreadable nodes per
dark skin. Do Fix 1 first, re-run your audit script, then decide the rest.

## Files

| file | destination |
|---|---|
| `skins.css` | `breeding-app-shared/src/styles/skins.css` |
| `tw-bridge.css` | `breeding-app-shared/src/styles/tw-bridge.css` — breeder only, imported **after** `tailwindcss` |
| `skins.contrast.test.js` | `breeding-app-shared/src/styles/__tests__/` |
| `skins.contrast.txt` | reference — measured ratios for all 18 skins |
| `FIXES.md` | the rollout |

## What's in v2

**18 skins** — `default` (visual no-op, reproduces today) + 11 jungle + 6 new:

*dark* · `jungle-glass` `deep-canopy` `moss-mist` `rainforest-night` `fern-clay`
`emerald-brass` `marsh-dusk` `copper-canopy` `slate-botanical` `nocturne-amber`
`graphite-neutral` `obsidian-canopy` `high-contrast-forest`

*light* · `bamboo-daylight` `sandstone-vivarium` `glasshouse-mint` `field-daylight`

The six added in v2 each cover an axis the original eleven didn't:
accessibility (AAA, 7:1), low blue light, zero-hue shell, OLED near-black,
cool light, and high-contrast light.

**Three new roles**, each traceable to a finding:

- `--sk-brand` — R3. The wordmark had no role, so someone wrote `text-[#3c1b73]`.
- `--sk-primary-quiet` / `--sk-primary-quiet-text` — R5. No low-emphasis fill existed,
  so the modal *Add* button used `rgba(15,23,42,0.04)` and vanished.
- `--sk-series-1…6` respaced 60° apart in hue, anchored on the primary. Previously
  series 1–2 were seeded from `primary` and `accent`, which collide whenever a skin
  picks two close hues deliberately. Family Tree maps six pedigree roles onto these,
  so a collision is two roles a user can't tell apart.

**Shared classes** so the audit's pairing bugs can't recur: `.sk-btn` (`--filled`
`--quiet` `--ghost` `--danger` + a real `[disabled]`), `.sk-scrim`, `.sk-wordmark`.

## Verify

```bash
node skins.contrast.test.js
```

18 skins, no failures. Thresholds: 4.5:1 on every text pair (7:1 for
`high-contrast-forest`), 3:1 focus against both surface and primary, 1.5:1
border/surface, series ≥60° apart and ≥3:1 on surface.

The static test can't catch R1 — that bug is an inline style, not a stylesheet value.
Keep your DOM audit script and run both.

## Invariant

A hex literal outside `skins.css` is a bug.
