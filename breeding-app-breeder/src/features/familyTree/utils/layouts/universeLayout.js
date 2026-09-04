/**
 * The Universe view: the whole collection at once, as one connected graph.
 *
 * Rows are generations, worked out from the data rather than declared: an animal with no
 * recorded parents sits at the top, and everything else sits one row below the deepest parent
 * it has. Inside a row, siblings are kept adjacent and each clutch hangs from its own junction,
 * so the shape of who came from where survives even at this scale.
 *
 * Animals with no recorded relatives are real members of the collection and are drawn too, in a
 * band of their own at the end -- omitting them would quietly under-report what is kept.
 */

import { computeGenerations } from '../pedigreeModel';
import { createGraph, DIMS } from '../graphKit';

const H_GAP = 34;
const COL_W = DIMS.NODE_W + H_GAP;
const CLUTCH_GAP = 72;
const ROW_GAP = 260;
const JUNCTION_LIFT = 96;

export function buildUniverseGraph(model, selectedId) {
  const graph = createGraph({ selectedId, orientation: 'v' });
  if (!model.animalsById.size) return { nodes: [], edges: [], orientation: 'v' };

  const depth = computeGenerations(model);

  // Anything with neither a parent nor a child is unconnected, and goes in its own band rather
  // than padding out the first generation.
  const isConnected = id => {
    const { sireId, damId } = model.parents(id);
    return Boolean(sireId || damId || model.children(id).length);
  };

  const rows = new Map();
  const loners = [];
  for (const id of model.animalsById.keys()) {
    if (!isConnected(id)) { loners.push(id); continue; }
    const generation = depth.get(id) ?? 0;
    if (!rows.has(generation)) rows.set(generation, []);
    rows.get(generation).push(id);
  }

  const generations = [...rows.keys()].sort((a, b) => a - b);
  const placedX = new Map();

  for (const generation of generations) {
    const ids = rows.get(generation);

    // Group the row by clutch so siblings end up side by side, unclutched animals last.
    const groups = new Map();
    const ungrouped = [];
    for (const id of ids) {
      const key = model.parents(id).clutchKey;
      if (!key) { ungrouped.push(id); continue; }
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(id);
    }

    const blocks = [
      ...[...groups.entries()].map(([key, members]) => ({ key, members })),
      ...ungrouped.map(id => ({ key: null, members: [id] })),
    ];

    const blockWidths = blocks.map(block => block.members.length * COL_W - H_GAP);
    const totalWidth = blockWidths.reduce((sum, w) => sum + w, 0) + CLUTCH_GAP * (blocks.length - 1);

    const y = generation * ROW_GAP;
    let cursorX = -totalWidth / 2;

    blocks.forEach((block, blockIndex) => {
      const width = blockWidths[blockIndex];
      const startX = cursorX + DIMS.NODE_W / 2;
      cursorX += width + CLUTCH_GAP;

      block.members.forEach((id, index) => {
        const animal = model.get(id);
        if (!animal) return;
        const x = startX + index * COL_W;
        graph.snake(animal, x, y, {
          role: animal.isEgg ? 'egg' : 'offspring',
          generationLabel: generation === 0 ? 'Foundation' : `Generation ${generation}`,
        });
        placedX.set(id, x);
      });
    });
  }

  if (loners.length) {
    const y = (generations.length ? Math.max(...generations) + 1 : 0) * ROW_GAP;
    const width = loners.length * COL_W - H_GAP;
    let x = -width / 2 + DIMS.NODE_W / 2;
    for (const id of loners) {
      const animal = model.get(id);
      if (animal) graph.snake(animal, x, y, { role: 'ancestor', generationLabel: 'Unlinked' });
      placedX.set(id, x);
      x += COL_W;
    }
  }

  // One junction per clutch, sitting just above the siblings it produced.
  for (const clutch of model.clutches.values()) {
    const members = clutch.memberIds.filter(id => placedX.has(id));
    if (!members.length) continue;

    const centerX = members.reduce((sum, id) => sum + placedX.get(id), 0) / members.length;
    const memberY = (depth.get(members[0]) ?? 0) * ROW_GAP;

    const jId = `j:${clutch.key}`;
    graph.junction(jId, centerX, memberY - JUNCTION_LIFT);
    graph.link(clutch.sireId, jId, { confidence: 'recorded', targetHandle: 't-left' });
    graph.link(clutch.damId, jId, { confidence: 'recorded', targetHandle: 't-right' });
    for (const id of members) {
      graph.link(jId, id, { confidence: model.parents(id).confidence });
    }
  }

  return { nodes: graph.nodes, edges: graph.edges, orientation: 'v' };
}
