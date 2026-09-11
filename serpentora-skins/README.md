# serpentora-skins

Drop-in skin system for the Breeding Planner suite.

This folder is expected at `D:\Git Clone\Breeding-planner\serpentora-skins`.

| file | where it goes |
|---|---|
| `skins.css` | `breeding-app-shared/src/styles/skins.css` |
| `tw-bridge.css` | `breeding-app-shared/src/styles/tw-bridge.css` — breeder only, imported **after** `tailwindcss` |
| `skins.contrast.txt` | reference; expected values for the CI contrast test |
| `SKINS_IMPLEMENTATION.md` | the six-step rollout |

12 skins: `default` (visual no-op, reproduces today) + 11 jungle skins —
8 dark (`jungle-glass`, `deep-canopy`, `moss-mist`, `rainforest-night`, `fern-clay`,
`emerald-brass`, `marsh-dusk`, `copper-canopy`, `slate-botanical`) and 2 light
(`bamboo-daylight`, `sandstone-vivarium`).

Start with **SKINS_IMPLEMENTATION.md**. Step 1 lands with zero visible change.

Invariant: a hex literal outside `skins.css` is a bug.
