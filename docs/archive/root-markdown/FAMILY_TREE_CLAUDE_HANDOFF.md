# Family Tree Handoff For Claude

## Context

The breeder app family tree was updated so local animals can build a usable pedigree even when the shared backend has no family-tree data. The current work is in the split breeder app:

- `breeding-app-breeder/src/App.jsx`
- `breeding-app-breeder/src/features/familyTree/FamilyTreePage.jsx`
- `breeding-app-breeder/src/features/familyTree/utils/buildTreeGraph.js`
- `breeding-app-breeder/src/features/familyTree/components/FamilyTreeCanvas.jsx`
- `breeding-app-breeder/src/features/familyTree/components/JunctionNode.jsx`
- `breeding-app-breeder/src/features/familyTree/components/ClutchNode.jsx`

The app was validated with:

```bash
cd breeding-app-breeder
npm.cmd run build
```

The build passed. The normal existing warnings remain: Vite circular chunk warning and `pdfjs-dist` eval warning.

## What Was Implemented

### 1. Local fallback tree rendering

`FamilyTreePage.jsx` now accepts local `snakes` and `pairings` from `App.jsx`.

If the shared backend returns no graph nodes, it builds a local graph from:

- explicit `sireId` / `damId`
- inferred parent names in hatchling names
- breeder group name matches
- pairing/clutch egg counts

This fixes the issue where the family tree appeared empty when backend data was missing.

### 2. Focused family-tree opening

Added an `Open family tree` button in:

- snake edit modal header
- snake card actions
- animal list row actions

Clicking this button:

- stores the selected snake id in `familyTreeFocusSnakeId`
- closes the edit modal
- switches to the `familyTree` tab
- passes `focusSnakeId` into `FamilyTreePage`

The selected snake becomes the focus node in the tree.

### 3. Parent pair junction line

`buildTreeGraph.js` now draws parent pairs through a junction node:

- sire and dam are connected horizontally into a small `junctionNode`
- child/sibling branches flow out from the junction

This was added so the visual line matches the requested structure: line between male and female, then a split line down to offspring/siblings.

### 4. Clutch grouping and sibling lines

Sibling branches are now grouped by clutch, not only by sire/dam pair.

Relationships may carry `clutchId`. The graph grouping key uses:

- sire id
- dam id
- clutch id

So if the same male and female have multiple clutches, those clutches render as separate sibling lines.

`ClutchNode.jsx` was added and registered in `FamilyTreeCanvas.jsx`. It displays a small `Clutch ...` label between the parent-pair junction and the offspring nodes.

### 5. Hatchling-name parsing

`FamilyTreePage.jsx` now parses names like:

- `25ArunXJenni-1`
- `25 Arun x Jenny - 1`
- `Salisu x Femi 5`

Meaning:

- `25` is hatch year `2025`
- first name is sire/father
- second name is dam/mother
- trailing number is hatchling index in the clutch

Example:

- `Salisu x Femi 1`
- `Salisu x Femi 5`

These infer the same clutch and render as siblings, sorted by hatchling number.

Parent matching is slightly forgiving:

- exact normalized name match
- token match
- loose prefix match
- edit distance of 1 for names of length 4+

This helps `Jenni` match `Jenny`.

### 6. Hatch wizard saves parent metadata

When hatchlings are created from the hatch wizard in `App.jsx`, each created hatchling now saves:

- `sireId`
- `damId`
- `clutchId`
- `hatchlingIndex`
- `sireName`
- `damName`
- `sireGenetics`
- `damGenetics`
- `parentGenetics`
- `metadata.parents`
- `metadata.pairingId`
- `metadata.clutchId`
- `metadata.hatchlingIndex`
- `metadata.hatchDate`

The parent genetics are snapshots at hatch time, using `getDisplayedSnakeGeneticsTokens(parent)`.

## Current Tree Direction Rule

If the selected snake is an offspring, it remains the focus snake and its parents render above it.

The user specifically corrected this rule before implementation.

## Important Notes

- The tree still uses the backend graph if backend nodes exist.
- The local inferred graph is used only when backend graph nodes are empty.
- `FamilyTreePage.jsx` has some existing mojibake in display comments/string output from earlier encoding issues around multiply symbols. Avoid broad rewrites unless needed.
- The user expects hatchling names from 2024, 2025, and 2026 to contain parent names and hatchling numbers.
- Do not revert unrelated dirty worktree changes in `App.jsx`; there were already many unrelated edits.

## Suggested Next Checks

1. Use real local animals:
   - sire `Arun`
   - dam `Jenny`
   - hatchlings `25ArunXJenni-1`, `25ArunXJenni-2`

2. Open one hatchling's family tree:
   - selected hatchling should be the focus node
   - parents should be above

3. Open the sire's family tree:
   - dam should appear beside sire
   - clutch node should appear below the parent-pair junction
   - hatchlings should appear next to each other in hatchling-number order

4. Test multiple clutches for the same parent pair:
   - they should not collapse into one sibling line if `clutchId` differs.
