/**
 * The Clutch view: the selected animal's clutches, each one whole.
 *
 * Every other view is organised around an animal. This one is organised around the clutch --
 * the clutch it came out of, with its siblings, and each clutch it has produced since. A band
 * per clutch, parents on top, everything that clutch holds laid out beneath, eggs included.
 *
 *   ── Runa x Confusion 2026 ────────────────────────────
 *        [Sire]      [Dam]
 *              \    /
 *               (o)
 *          [Clutch label]
 *     [h1] [h2] [h3] [h4] [h5] [h6] [h7] [h8]
 *     [egg] [egg]
 *
 * Members wrap rather than running off to the right, because a clutch is meant to be taken in
 * at once and a twelve-egg clutch on one line cannot be.
 */

import { CONFIDENCE, clutchLabel } from '../pedigreeModel';
import { createGraph, DIMS } from '../graphKit';

const H_GAP = 40;
const COL_W = DIMS.NODE_W + H_GAP;
const MAX_PER_ROW = 8;
const MEMBER_ROW_STEP = DIMS.NODE_H + 34;
const PARENT_SPREAD = 300;
const JUNCTION_DROP = 168;
const LABEL_GAP = 26;
const MEMBERS_GAP = 34;
const BAND_GAP = 120;

/** Lays members out in centred rows of at most MAX_PER_ROW, and reports how tall that was. */
function placeMembers(graph, model, memberIds, centerX, topY, labelId) {
  const rows = [];
  for (let i = 0; i < memberIds.length; i += MAX_PER_ROW) {
    rows.push(memberIds.slice(i, i + MAX_PER_ROW));
  }

  rows.forEach((row, rowIndex) => {
    const width = row.length * COL_W - H_GAP;
    const startX = centerX - width / 2 + DIMS.NODE_W / 2;
    const y = topY + rowIndex * MEMBER_ROW_STEP;

    row.forEach((id, index) => {
      const animal = model.get(id);
      if (!animal) return;
      graph.snake(animal, startX + index * COL_W, y, {
        role: animal.isEgg ? 'egg' : 'offspring',
        generationLabel: undefined,
      });
      graph.link(labelId, id, { confidence: model.parents(id).confidence });
    });
  });

  return Math.max(rows.length, 1) * MEMBER_ROW_STEP;
}

export function buildClutchGraph(model, selectedId) {
  const graph = createGraph({ selectedId, orientation: 'v' });
  const selected = model.get(selectedId);
  if (!selected) return { nodes: [], edges: [], orientation: 'v' };

  // The clutch it hatched from comes first, then the ones it produced, oldest first.
  const own = model.parents(selectedId).clutchKey;
  const bands = [];
  if (own && model.clutch(own)) bands.push({ clutch: model.clutch(own), kind: 'origin' });
  for (const clutch of model.clutchesOf(selectedId)) {
    if (clutch.key !== own) bands.push({ clutch, kind: 'produced' });
  }

  if (!bands.length) {
    // Nothing recorded either side of it -- show the animal alone rather than an empty canvas.
    graph.snake(selected, 0, 0, { role: 'selected', generationLabel: 'No clutch recorded' });
    return { nodes: graph.nodes, edges: graph.edges, orientation: 'v' };
  }

  let cursorY = 0;

  bands.forEach(({ clutch, kind }) => {
    const label = kind === 'origin' ? 'Hatched from' : 'Produced';

    const sire = clutch.sireId ? model.get(clutch.sireId) : null;
    const dam = clutch.damId ? model.get(clutch.damId) : null;

    const sireAnchor = sire ? sire.id : `ph:sire:${clutch.key}`;
    const damAnchor = dam ? dam.id : `ph:dam:${clutch.key}`;

    if (sire) graph.snake(sire, -PARENT_SPREAD, cursorY, { role: 'sire', generationLabel: label });
    else graph.placeholder(sireAnchor, -PARENT_SPREAD, cursorY, 'sire', label);

    if (dam) graph.snake(dam, PARENT_SPREAD, cursorY, { role: 'dam', generationLabel: label });
    else graph.placeholder(damAnchor, PARENT_SPREAD, cursorY, 'dam', label);

    const junctionY = cursorY + JUNCTION_DROP;
    const jId = `j:${clutch.key}`;
    graph.junction(jId, 0, junctionY);
    graph.link(sireAnchor, jId, { confidence: sire ? CONFIDENCE.RECORDED : undefined, targetHandle: 't-left' });
    graph.link(damAnchor, jId, { confidence: dam ? CONFIDENCE.RECORDED : undefined, targetHandle: 't-right' });

    const labelId = `c:${clutch.key}`;
    const labelY = junctionY + LABEL_GAP;
    graph.clutch(labelId, 0, labelY, {
      label: clutchLabel(clutch, model),
      hatchedCount: clutch.childIds.length,
      eggCount: clutch.eggIds.length,
      isSelected: kind === 'origin',
    });
    graph.link(jId, labelId, { confidence: CONFIDENCE.RECORDED });

    const membersTop = labelY + DIMS.CLUTCH_H + MEMBERS_GAP;
    const membersHeight = placeMembers(graph, model, clutch.memberIds, 0, membersTop, labelId);

    cursorY = membersTop + membersHeight + BAND_GAP;
  });

  return { nodes: graph.nodes, edges: graph.edges, orientation: 'v' };
}
