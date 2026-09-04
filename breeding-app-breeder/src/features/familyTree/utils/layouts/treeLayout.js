/**
 * The Tree view: two generations up, the selected animal's own sibship, and every clutch it has
 * produced, one branch per clutch.
 *
 *                [GSire] [GDam]        [GSire] [GDam]      generation -2
 *                     [Sire]        [Dam]                  generation -1
 *                            \      /
 *                             (o)  <- one junction, this clutch
 *                          [Clutch label]
 *          [sib] [sib] [SELECTED] [sib] [egg]              generation 0
 *                             |
 *          ┌──────────────────┴──────────────────┐         one block per clutch
 *      [mate A] (o)                       [mate B] (o)
 *      [Clutch A label]                   [Clutch B label]
 *      [c] [c] [c]                        [c] [egg]        generation +1
 *
 * Siblings run across, not down, because a clutch reads as a band that way and because two
 * bands under two junctions is what makes half-siblings legible at a glance.
 */

import { CONFIDENCE } from '../pedigreeModel';
import { createGraph, DIMS } from '../graphKit';
import { clutchLabel } from '../pedigreeModel';

const ROW_GAP = 250;          // generation -2 -> -1, and selected -> mate row
const PARENT_SPREAD = 330;    // sire/dam either side of the sibship centre
const GP_SPREAD = 172;        // grandparents either side of their child
const H_GAP = 44;             // between cards in a row
const COL_W = DIMS.NODE_W + H_GAP;
const BLOCK_GAP = 90;         // between two offspring clutch blocks
const JUNCTION_DROP = 170;    // junction below the parents' row top
const LABEL_GAP = 26;
const CHILD_GAP = 34;

/** Lays ids out in a centred horizontal row and returns where each one landed. */
function placeRow(graph, model, ids, centerX, y, { role, generationLabel }) {
  const width = ids.length * COL_W - H_GAP;
  const startX = centerX - width / 2 + DIMS.NODE_W / 2;
  const positions = new Map();

  ids.forEach((id, index) => {
    const animal = model.get(id);
    if (!animal) return;
    const x = startX + index * COL_W;
    graph.snake(animal, x, y, {
      role: animal.isEgg ? 'egg' : role,
      generationLabel,
    });
    positions.set(id, x);
  });

  return { positions, width };
}

/** Width a clutch block needs: its children row, or its parent pair, whichever is wider. */
function blockWidth(memberCount) {
  const childrenWidth = Math.max(memberCount, 1) * COL_W - H_GAP;
  return Math.max(childrenWidth, DIMS.NODE_W * 2 + H_GAP);
}

export function buildTreeGraph(model, selectedId) {
  const graph = createGraph({ selectedId, orientation: 'v' });
  const selected = model.get(selectedId);
  if (!selected) return { nodes: [], edges: [], orientation: 'v' };

  const { sireId, damId, clutchKey, confidence } = model.parents(selectedId);
  const ownClutch = clutchKey ? model.clutch(clutchKey) : null;

  const genY0 = 0;
  const genY1 = genY0 - ROW_GAP;
  const genY2 = genY1 - ROW_GAP;

  // ── Generation 0: the selected animal and whoever shares its clutch ──────────────────

  const sibship = ownClutch?.memberIds?.length ? ownClutch.memberIds : [selectedId];
  const { positions } = placeRow(graph, model, sibship, 0, genY0, {
    role: 'sibling',
    generationLabel: 'Clutch',
  });
  const selX = positions.get(selectedId) ?? 0;

  // ── Generations -1 and -2 ────────────────────────────────────────────────────────────

  const sireX = -PARENT_SPREAD;
  const damX = PARENT_SPREAD;

  /** Places one parent and the two grandparents above it, standing in where a record is absent. */
  const placeParentBranch = (parentId, x, role) => {
    const parent = parentId ? model.get(parentId) : null;
    const anchorId = parent ? parent.id : `ph:${role}:${selectedId}`;

    if (parent) {
      graph.snake(parent, x, genY1, { role, generationLabel: 'Parents' });
    } else {
      graph.placeholder(anchorId, x, genY1, role, 'Parents');
    }

    const gp = parent ? model.parents(parent.id) : { sireId: null, damId: null, confidence: null };
    const slots = [
      { id: gp.sireId, role: 'sire', x: x - GP_SPREAD },
      { id: gp.damId, role: 'dam', x: x + GP_SPREAD },
    ];

    for (const slot of slots) {
      const grandparent = slot.id ? model.get(slot.id) : null;
      if (grandparent) {
        graph.snake(grandparent, slot.x, genY2, { role: 'ancestor', generationLabel: 'Grandparents' });
        graph.link(grandparent.id, anchorId, { confidence: gp.confidence || CONFIDENCE.RECORDED });
      } else {
        const phId = `ph:g${slot.role}:${anchorId}`;
        graph.placeholder(phId, slot.x, genY2, slot.role, 'Grandparents');
        graph.link(phId, anchorId, {});
      }
    }

    return anchorId;
  };

  const sireAnchor = placeParentBranch(sireId, sireX, 'sire');
  const damAnchor = placeParentBranch(damId, damX, 'dam');

  // The junction the whole sibship hangs from. Drawn even when one parent is only a placeholder,
  // so the clutch still reads as one group rather than as unrelated animals.
  const junctionId = `j:${clutchKey || selectedId}`;
  graph.junction(junctionId, 0, genY1 + JUNCTION_DROP);
  graph.link(sireAnchor, junctionId, { confidence: sireId ? confidence : undefined, targetHandle: 't-left' });
  graph.link(damAnchor, junctionId, { confidence: damId ? confidence : undefined, targetHandle: 't-right' });

  let sibshipSource = junctionId;
  if (ownClutch) {
    const labelId = `c:${ownClutch.key}`;
    graph.clutch(labelId, 0, genY1 + JUNCTION_DROP + LABEL_GAP, {
      label: clutchLabel(ownClutch, model),
      hatchedCount: ownClutch.childIds.length,
      eggCount: ownClutch.eggIds.length,
      isSelected: true,
    });
    graph.link(junctionId, labelId, { confidence: CONFIDENCE.RECORDED });
    sibshipSource = labelId;
  }

  for (const id of sibship) {
    graph.link(sibshipSource, id, { confidence: model.parents(id).confidence });
  }

  // ── Generation +1: one block per clutch the selected animal produced ─────────────────

  const clutches = model.clutchesOf(selectedId);
  if (clutches.length) {
    const widths = clutches.map(clutch => blockWidth(clutch.memberIds.length));
    const totalWidth = widths.reduce((sum, w) => sum + w, 0) + BLOCK_GAP * (clutches.length - 1);

    const mateRowY = genY0 + ROW_GAP;
    const junctionY = mateRowY + DIMS.NODE_H / 2;
    // The label clears the bottom of the mate card rather than sitting level with the junction,
    // which put it straight through the mate whenever the mate was the nearer of the two.
    const labelY = mateRowY + DIMS.NODE_H + LABEL_GAP;
    const childY = labelY + DIMS.CLUTCH_H + CHILD_GAP;

    let cursorX = selX - totalWidth / 2;

    clutches.forEach((clutch, index) => {
      const width = widths[index];
      const centerX = cursorX + width / 2;
      cursorX += width + BLOCK_GAP;

      const selectedIsSire = clutch.sireId === selectedId;
      const mateId = selectedIsSire ? clutch.damId : clutch.sireId;
      const mate = mateId ? model.get(mateId) : null;

      // The male keeps the left side, as everywhere else in the app.
      const mateOnLeft = !selectedIsSire;
      const mateX = centerX + (mateOnLeft ? -COL_W : COL_W) / 2;
      const junctionX = centerX;

      const mateAnchor = mate ? mate.id : `ph:mate:${clutch.key}`;
      if (mate) {
        graph.snake(mate, mateX, mateRowY, {
          role: selectedIsSire ? 'dam' : 'sire',
          generationLabel: 'Mates',
        });
      } else {
        graph.placeholder(mateAnchor, mateX, mateRowY, selectedIsSire ? 'dam' : 'sire', 'Mates');
      }

      const jId = `j:${clutch.key}`;
      graph.junction(jId, junctionX, junctionY);
      // The selected animal is a row up, so it drops into the junction from above; the mate is
      // alongside and comes in from its own side.
      graph.link(selectedId, jId, { confidence: CONFIDENCE.RECORDED, targetHandle: 't-top' });
      graph.link(mateAnchor, jId, {
        confidence: mate ? CONFIDENCE.RECORDED : undefined,
        targetHandle: mateOnLeft ? 't-left' : 't-right',
      });

      const labelId = `c:${clutch.key}`;
      graph.clutch(labelId, junctionX, labelY, {
        label: clutchLabel(clutch, model),
        hatchedCount: clutch.childIds.length,
        eggCount: clutch.eggIds.length,
      });
      graph.link(jId, labelId, { confidence: CONFIDENCE.RECORDED });

      placeRow(graph, model, clutch.memberIds, junctionX, childY, {
        role: 'offspring',
        generationLabel: 'Offspring',
      });
      for (const id of clutch.memberIds) {
        graph.link(labelId, id, { confidence: model.parents(id).confidence });
      }
    });
  }

  return { nodes: graph.nodes, edges: graph.edges, orientation: 'v' };
}
