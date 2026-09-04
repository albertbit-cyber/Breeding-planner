/**
 * The Lineage view: everything the selected animal is connected to, in both directions at once.
 *
 *              [GSire] [GDam]   [GSire] [GDam]        ancestors, N generations up
 *                   [Sire]   [Dam]
 *                         \  /
 *                          o
 *                     [SELECTED]
 *                          |
 *                    ┌─────┴─────┐
 *                 (clutch)    (clutch)                 descendants, N generations down
 *               [c] [c] [c]   [c] [egg]
 *                    |
 *                 (clutch)
 *                  [g] [g]
 *
 * Ancestors are a binary tree, so they lay out by halving spans. Descendants are not -- an
 * animal can have any number of clutches and a clutch any number of members -- so that side is
 * measured before it is placed: every subtree reports the width it needs, and a parent centres
 * itself over the total. Without the measuring pass, branches of different sizes overlap.
 */

import { CONFIDENCE, clutchLabel } from '../pedigreeModel';
import { createGraph, DIMS } from '../graphKit';

const UP_DEPTH = 3;
const DOWN_DEPTH = 3;
const H_GAP = 44;
const COL_W = DIMS.NODE_W + H_GAP;
const UP_ROW_GAP = 235;
const CLUTCH_GAP = 70;
const LABEL_GAP = 20;
// The co-parent's row, measured from the top of the parent's card, and then the offspring row
// below the clutch label. Both are derived from the card height so a taller card cannot make
// two rows touch.
const MATE_DROP = DIMS.NODE_H + 24;
const DOWN_ROW_GAP = MATE_DROP + DIMS.NODE_H + LABEL_GAP + DIMS.CLUTCH_H + 34;

const UP_LABEL = ['', 'Parents', 'Grandparents', 'Great-grandparents'];
const DOWN_LABEL = ['', 'Offspring', 'Grandoffspring', 'Third generation'];

export function buildLineageGraph(model, selectedId, { up = UP_DEPTH, down = DOWN_DEPTH } = {}) {
  const graph = createGraph({ selectedId, orientation: 'v' });
  const selected = model.get(selectedId);
  if (!selected) return { nodes: [], edges: [], orientation: 'v' };

  graph.snake(selected, 0, 0, { role: 'selected', generationLabel: 'Selected' });

  // ── Upward: ancestors ────────────────────────────────────────────────────────────────

  // A generation up doubles the number of slots, so the horizontal reach doubles with it.
  const climb = (childId, childX, generation) => {
    if (generation > up) return;
    const parents = model.parents(childId);
    if (!parents.sireId && !parents.damId && generation > 1) return;

    const y = -generation * UP_ROW_GAP;
    const spread = COL_W * 2 ** (up - generation);
    const label = UP_LABEL[generation] || `Generation -${generation}`;

    const branch = (parentId, x, role) => {
      const animal = parentId ? model.get(parentId) : null;
      let anchorId;
      if (animal) {
        anchorId = animal.id;
        graph.snake(animal, x, y, { role, generationLabel: label });
      } else {
        if (generation > 1) return null;
        anchorId = `ph:${role}:${childId}`;
        graph.placeholder(anchorId, x, y, role, label);
      }
      graph.link(anchorId, childId, { confidence: animal ? parents.confidence : undefined });
      if (animal) climb(animal.id, x, generation + 1);
      return anchorId;
    };

    branch(parents.sireId, childX - spread / 2, 'sire');
    branch(parents.damId, childX + spread / 2, 'dam');
  };

  climb(selectedId, 0, 1);

  // ── Downward: descendants ────────────────────────────────────────────────────────────

  // Guards a malformed record that makes an animal its own descendant from recursing forever.
  const onPath = new Set([selectedId]);

  /**
   * A clutch block is its members side by side, plus one column on the left for the co-parent.
   * Reserving that column is what stops a mate card from landing on top of the neighbouring
   * branch: the measuring pass and the placing pass have to agree on the width, so both call
   * this rather than each doing their own arithmetic.
   */
  const blockWidth = childrenWidth => Math.max(childrenWidth + COL_W, COL_W * 2.4);

  /** How much horizontal room a descendant subtree needs, measured before anything is placed. */
  const measure = (id, generation) => {
    if (generation > down || onPath.has(id)) return COL_W;
    onPath.add(id);
    const clutches = model.clutchesOf(id);
    let width = 0;
    for (const clutch of clutches) {
      let childrenWidth = 0;
      for (const memberId of clutch.memberIds) {
        childrenWidth += measure(memberId, generation + 1);
      }
      width += blockWidth(childrenWidth) + CLUTCH_GAP;
    }
    onPath.delete(id);
    return Math.max(COL_W, width - (clutches.length ? CLUTCH_GAP : 0));
  };

  const descend = (parentId, parentX, parentY, generation) => {
    if (generation > down || onPath.has(`d:${parentId}`)) return;
    onPath.add(`d:${parentId}`);

    const clutches = model.clutchesOf(parentId);
    if (clutches.length) {
      const memberWidthsPerClutch = clutches.map(clutch =>
        clutch.memberIds.map(id => measure(id, generation + 1)));
      const childrenWidths = memberWidthsPerClutch.map(widths =>
        widths.reduce((sum, width) => sum + width, 0));
      const widths = childrenWidths.map(blockWidth);
      const total = widths.reduce((sum, width) => sum + width, 0) + CLUTCH_GAP * (clutches.length - 1);

      // The co-parent sits clear of the parent's own row, and the label clear of the co-parent.
      // Tucking either one up against the row above put cards through each other.
      const mateY = parentY + MATE_DROP;
      const junctionY = mateY + DIMS.NODE_H / 2;
      const labelY = mateY + DIMS.NODE_H + LABEL_GAP;
      const childY = parentY + DOWN_ROW_GAP;
      const label = DOWN_LABEL[generation] || `Generation +${generation}`;

      let cursorX = parentX - total / 2;

      clutches.forEach((clutch, index) => {
        const blockLeft = cursorX;
        cursorX += widths[index] + CLUTCH_GAP;

        // The co-parent takes the reserved left column; the members are centred in what is left,
        // so the two can never land on each other however wide the branch below grows.
        const mateX = blockLeft + COL_W / 2;
        const centerX = blockLeft + COL_W + childrenWidths[index] / 2;

        const mateId = clutch.sireId === parentId ? clutch.damId : clutch.sireId;
        const mate = mateId ? model.get(mateId) : null;
        const jId = `j:${clutch.key}:${parentId}`;

        graph.junction(jId, centerX, junctionY);
        graph.link(parentId, jId, { confidence: CONFIDENCE.RECORDED, targetHandle: 't-top' });

        if (mate) {
          // `snake` is a no-op when the animal is already on the canvas from another branch;
          // either way the link below ties this clutch to it.
          graph.snake(mate, mateX, mateY, {
            role: clutch.sireId === parentId ? 'dam' : 'sire',
            generationLabel: label,
          });
          graph.link(mate.id, jId, { confidence: CONFIDENCE.RECORDED, targetHandle: 't-left' });
        }

        const labelId = `c:${clutch.key}:${parentId}`;
        graph.clutch(labelId, centerX, labelY, {
          label: clutchLabel(clutch, model),
          hatchedCount: clutch.childIds.length,
          eggCount: clutch.eggIds.length,
        });
        graph.link(jId, labelId, { confidence: CONFIDENCE.RECORDED });

        // Members are spaced by the room their own descendants need, not evenly.
        const memberWidths = memberWidthsPerClutch[index];
        let memberX = centerX - childrenWidths[index] / 2;

        clutch.memberIds.forEach((memberId, memberIndex) => {
          const memberWidth = memberWidths[memberIndex];
          const x = memberX + memberWidth / 2;
          memberX += memberWidth;

          const animal = model.get(memberId);
          if (!animal) return;
          graph.snake(animal, x, childY, {
            role: animal.isEgg ? 'egg' : 'offspring',
            generationLabel: label,
          });
          graph.link(labelId, memberId, { confidence: model.parents(memberId).confidence });

          descend(memberId, x, childY, generation + 1);
        });
      });
    }

    onPath.delete(`d:${parentId}`);
  };

  descend(selectedId, 0, 0, 1);

  return { nodes: graph.nodes, edges: graph.edges, orientation: 'v' };
}
