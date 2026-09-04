/**
 * The small amount of machinery every layout shares.
 *
 * Layouts differ in where things go, not in what they are, so node construction, edge styling
 * and de-duplication live here and each layout is left to be only its own geometry.
 *
 * Coordinates: callers give the CENTRE x and the TOP y of a node, because layouts reason about
 * columns and rows. ReactFlow wants the top-left corner, so the conversion happens once, here.
 */

import { CONFIDENCE } from './pedigreeModel';

export const DIMS = {
  NODE_W: 192,
  NODE_H: 148,      // rendered card height, used for vertical spacing
  JUNCTION: 12,
  CLUTCH_W: 168,
  CLUTCH_H: 42,
};

/** How sure we are of a link decides how it is drawn. A guess must never look like a record. */
const EDGE_STYLE = {
  [CONFIDENCE.RECORDED]: { stroke: '#7c3aed', strokeWidth: 1.6, strokeDasharray: undefined },
  [CONFIDENCE.INFERRED]: { stroke: '#a78bfa', strokeWidth: 1.4, strokeDasharray: '6 3' },
  [CONFIDENCE.GUESSED]: { stroke: '#c4b5fd', strokeWidth: 1.2, strokeDasharray: '3 4' },
  unknown: { stroke: '#d4d4d8', strokeWidth: 1, strokeDasharray: '5 4' },
};

const DEFAULT_HANDLES = {
  v: { source: 's-bottom', target: 't-top' },
  h: { source: 's-right', target: 't-left' },
};

export function createGraph({ selectedId = null, orientation = 'v' } = {}) {
  const nodes = [];
  const edges = [];
  const placed = new Set();
  const linked = new Set();

  const push = (node) => {
    if (placed.has(node.id)) return false;
    placed.add(node.id);
    nodes.push(node);
    return true;
  };

  return {
    nodes,
    edges,
    orientation,
    has: id => placed.has(id),

    /** An animal card. `x` is its centre, `y` its top. */
    snake(animal, x, y, { role = 'ancestor', generationLabel, dimmed = false } = {}) {
      if (!animal?.id) return false;
      return push({
        id: animal.id,
        type: 'snakeNode',
        position: { x: x - DIMS.NODE_W / 2, y },
        data: {
          snake: animal,
          nodeRole: animal.id === selectedId ? 'selected' : role,
          isSelected: animal.id === selectedId,
          generationLabel,
          dimmed,
        },
        style: { width: DIMS.NODE_W, ...(dimmed ? { opacity: 0.55 } : null) },
      });
    },

    /** A dashed card standing in for a parent nobody recorded. */
    placeholder(id, x, y, role, generationLabel) {
      return push({
        id,
        type: 'placeholderNode',
        position: { x: x - DIMS.NODE_W / 2, y },
        data: { role, generationLabel },
        style: { width: DIMS.NODE_W },
      });
    },

    /** The dot where a pair meets. `x` and `y` are both centres. */
    junction(id, x, y) {
      return push({
        id,
        type: 'junctionNode',
        position: { x: x - DIMS.JUNCTION / 2, y: y - DIMS.JUNCTION / 2 },
        data: {},
        style: { width: DIMS.JUNCTION, height: DIMS.JUNCTION },
      });
    },

    /** The labelled card naming a clutch. `x` is its centre, `y` its top. */
    clutch(id, x, y, { label, hatchedCount = 0, eggCount = 0, isSelected = false } = {}) {
      return push({
        id,
        type: 'clutchNode',
        position: { x: x - DIMS.CLUTCH_W / 2, y },
        data: { label, hatchedCount, eggCount, isSelected },
        style: { width: DIMS.CLUTCH_W },
      });
    },

    /**
     * Connect two placed nodes. Silently skips when either end is missing, so a layout can
     * link optimistically without first checking what it managed to place.
     */
    link(sourceId, targetId, { confidence, dir = orientation, sourceHandle, targetHandle } = {}) {
      if (!sourceId || !targetId) return false;
      if (!placed.has(sourceId) || !placed.has(targetId)) return false;
      const id = `e:${sourceId}->${targetId}`;
      if (linked.has(id)) return false;
      linked.add(id);

      const style = EDGE_STYLE[confidence] || EDGE_STYLE.unknown;
      edges.push({
        id,
        source: sourceId,
        target: targetId,
        sourceHandle: sourceHandle || DEFAULT_HANDLES[dir].source,
        targetHandle: targetHandle || DEFAULT_HANDLES[dir].target,
        type: dir === 'h' ? 'smoothstep' : 'step',
        style,
      });
      return true;
    },
  };
}

/**
 * Places one clutch: a junction between its two parents, a label card, and the members stacked
 * below. Shared by every vertically-stacked layout, which is where the sibling rules actually
 * become visible -- one call is one sibship, so half-siblings cannot merge by construction.
 */
export function placeClutchVertical(graph, model, clutch, {
  sireX, damX, parentY, sireId, damId, label,
  childRole = 'offspring', generationLabel, memberIds,
  junctionDrop = 168, labelGap = 26, childGap = 30, childStep = DIMS.NODE_H + 26,
}) {
  const ids = memberIds || clutch?.memberIds || [];
  const junctionX = (sireX + damX) / 2;
  const junctionY = parentY + junctionDrop;
  const key = clutch?.key || `${sireId || 'x'}|${damId || 'x'}`;
  const junctionId = `j:${key}`;

  graph.junction(junctionId, junctionX, junctionY);
  graph.link(sireId, junctionId, { confidence: CONFIDENCE.RECORDED, dir: 'v', targetHandle: 't-left' });
  graph.link(damId, junctionId, { confidence: CONFIDENCE.RECORDED, dir: 'v', targetHandle: 't-right' });

  let cursorY = junctionY + labelGap;
  let parentOfChildren = junctionId;

  if (label) {
    const clutchNodeId = `c:${key}`;
    graph.clutch(clutchNodeId, junctionX, cursorY, {
      label,
      hatchedCount: clutch?.childIds?.length || 0,
      eggCount: clutch?.eggIds?.length || 0,
    });
    graph.link(junctionId, clutchNodeId, { confidence: CONFIDENCE.RECORDED, dir: 'v', sourceHandle: 's-bottom' });
    parentOfChildren = clutchNodeId;
    cursorY += DIMS.CLUTCH_H + childGap;
  } else {
    cursorY += childGap;
  }

  ids.forEach((id, index) => {
    const animal = model.get(id);
    if (!animal) return;
    graph.snake(animal, junctionX, cursorY + index * childStep, {
      role: animal.isEgg ? 'egg' : childRole,
      generationLabel,
    });
    graph.link(parentOfChildren, id, {
      confidence: model.parents(id).confidence,
      dir: 'v',
      sourceHandle: parentOfChildren === junctionId ? 's-bottom' : 's-bottom',
    });
  });

  return { junctionId, junctionX, junctionY, count: ids.length };
}
