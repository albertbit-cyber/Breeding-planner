/**
 * The Horizontal view: a conventional pedigree chart, read left to right.
 *
 *   [SELECTED] ─┬─ [Sire] ─┬─ [Sire's sire]
 *               │          └─ [Sire's dam]
 *               └─ [Dam]  ─┬─ [Dam's sire]
 *                          └─ [Dam's dam]
 *
 * This is the shape a printed pedigree takes, and the one people compare against a breeder's
 * paperwork, so it stays strictly ancestral -- no offspring, no mates.
 *
 * Rows are assigned from the ancestry that is actually recorded, not from a fixed 2^depth grid.
 * The grid version reserved a slot for every ancestor a chart *could* have, so an animal with
 * two known grandparents was laid out across sixteen slots and arrived on screen as five cards
 * marooned in an empty field. Here only the leaves -- the animals whose own parents are not
 * drawn -- take a row each, and every animal below them is centred on its two parents. A
 * shallow pedigree comes out compact, and a lopsided one does not tear open a gap on the side
 * that happens to be better recorded.
 */

import { createGraph, DIMS } from '../graphKit';

const MAX_DEPTH = 4;
const COL_GAP = 118;
const COL_W = DIMS.NODE_W + COL_GAP;
const ROW_H = DIMS.NODE_H + 30;

const GENERATION_LABEL = ['Selected', 'Parents', 'Grandparents', 'Great-grandparents', 'Fourth generation'];

export function buildHorizontalGraph(model, selectedId, { depth = MAX_DEPTH } = {}) {
  const graph = createGraph({ selectedId, orientation: 'h' });
  if (!model.get(selectedId)) return { nodes: [], edges: [], orientation: 'h' };

  /**
   * Build the ancestor tree first, without placing anything. `seen` stops a record that makes an
   * animal its own ancestor from recursing forever, and also keeps an animal that appears twice
   * in a pedigree -- line breeding does that routinely -- from being expanded on both branches.
   */
  const build = (id, generation, role, seen) => {
    const animal = id ? model.get(id) : null;

    if (!animal) {
      // Only the immediate parents get a placeholder. Deeper than that, an unknown ancestor is
      // simply where the record ends, and dashed cards would claim more than we know.
      if (generation > 1) return null;
      return { id: null, role, generation, parents: [], confidence: null };
    }
    if (seen.has(animal.id)) return null;

    const node = { id: animal.id, animal, role, generation, parents: [], confidence: null };
    if (generation >= depth) return node;

    const nextSeen = new Set(seen).add(animal.id);
    const parents = model.parents(animal.id);
    node.confidence = parents.confidence;
    node.parents = [
      build(parents.sireId, generation + 1, 'sire', nextSeen),
      build(parents.damId, generation + 1, 'dam', nextSeen),
    ].filter(Boolean);

    return node;
  };

  const root = build(selectedId, 0, 'selected', new Set());
  if (!root) return { nodes: [], edges: [], orientation: 'h' };

  // Assign a row to every leaf, then centre each animal on the parents above and below it.
  let nextRow = 0;
  const assignRow = (node) => {
    if (!node.parents.length) {
      node.row = nextRow;
      nextRow += 1;
      return node.row;
    }
    const rows = node.parents.map(assignRow);
    node.row = rows.reduce((sum, row) => sum + row, 0) / rows.length;
    return node.row;
  };
  assignRow(root);

  const totalHeight = Math.max(nextRow, 1) * ROW_H;

  const place = (node, childAnchor, confidence) => {
    const x = node.generation * COL_W;
    const y = node.row * ROW_H - totalHeight / 2;
    const label = GENERATION_LABEL[node.generation] || `Generation ${node.generation}`;

    const anchorId = node.id || `ph:${node.role}:${childAnchor}`;
    if (node.animal) graph.snake(node.animal, x, y, { role: node.role, generationLabel: label });
    else graph.placeholder(anchorId, x, y, node.role, label);

    if (childAnchor) graph.link(anchorId, childAnchor, { confidence, dir: 'h' });

    for (const parent of node.parents) place(parent, anchorId, node.confidence);
  };

  place(root, null, null);

  return { nodes: graph.nodes, edges: graph.edges, orientation: 'h' };
}
