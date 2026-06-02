// Converts flat snake + relationship arrays into ReactFlow nodes and edges.
// Positions are calculated using a binary pedigree layout:
//   - Gen -2 (grandparents): spread at ±(S + Q) around center
//   - Gen -1 (parents):      spread at ±S from center
//   - Gen  0 (selected):     x = 0
//   - Gen +1 (offspring):    evenly spaced below center

const NODE_WIDTH = 192;
const S = 310;   // horizontal half-spread between parents and center
const Q = 155;   // additional half-spread for grandparents from their child
const ROW_GAP = 210;
const OFFSPRING_SPACING = 240;

function buildParentLookup(relationships) {
  const map = new Map();
  for (const rel of relationships) {
    if (!map.has(rel.childId)) map.set(rel.childId, []);
    map.get(rel.childId).push(rel);
  }
  return map;
}

function buildChildLookup(relationships) {
  const map = new Map();
  for (const rel of relationships) {
    if (!map.has(rel.parentId)) map.set(rel.parentId, []);
    map.get(rel.parentId).push(rel.childId);
  }
  return map;
}

export function buildTreeGraph({ snakes, relationships, selectedSnakeId }) {
  const snakeMap = new Map(snakes.map(s => [s.id, s]));
  const parentLookup = buildParentLookup(relationships);
  const childLookup = buildChildLookup(relationships);

  const nodes = [];
  const edges = [];
  const placed = new Set();

  function addSnakeNode(id, x, y, nodeRole) {
    if (placed.has(id)) return;
    const snake = snakeMap.get(id);
    if (!snake) return;
    placed.add(id);
    nodes.push({
      id,
      type: 'snakeNode',
      position: { x: x - NODE_WIDTH / 2, y },
      data: { snake, nodeRole, isSelected: id === selectedSnakeId },
      style: { width: NODE_WIDTH },
    });
  }

  function addPlaceholder(id, x, y, role) {
    if (placed.has(id)) return;
    placed.add(id);
    nodes.push({
      id,
      type: 'placeholderNode',
      position: { x: x - NODE_WIDTH / 2, y },
      data: { role },
      style: { width: NODE_WIDTH },
    });
  }

  function addEdge(sourceId, targetId, confirmed = true) {
    edges.push({
      id: `e-${sourceId}-${targetId}`,
      source: sourceId,
      target: targetId,
      type: 'smoothstep',
      style: {
        stroke: confirmed ? '#7c3aed' : '#9ca3af',
        strokeWidth: confirmed ? 2 : 1.5,
        strokeDasharray: confirmed ? undefined : '6 4',
      },
    });
  }

  // ── Gen 0: selected snake ──────────────────────────────────
  addSnakeNode(selectedSnakeId, 0, 0, 'selected');

  // ── Gen -1: parents ────────────────────────────────────────
  const parents = parentLookup.get(selectedSnakeId) || [];
  const sireRel = parents.find(p => p.role === 'sire');
  const damRel  = parents.find(p => p.role === 'dam');

  const sireX = -S;
  const damX  = +S;
  const genY1 = -ROW_GAP;
  const genY2 = -2 * ROW_GAP;

  // Sire side
  if (sireRel && snakeMap.has(sireRel.parentId)) {
    addSnakeNode(sireRel.parentId, sireX, genY1, 'sire');
    addEdge(sireRel.parentId, selectedSnakeId, true);
    // Sire's parents (gen -2)
    const sp = parentLookup.get(sireRel.parentId) || [];
    const gsire = sp.find(p => p.role === 'sire');
    const gdam  = sp.find(p => p.role === 'dam');
    if (gsire && snakeMap.has(gsire.parentId)) {
      addSnakeNode(gsire.parentId, sireX - Q, genY2, 'ancestor');
      addEdge(gsire.parentId, sireRel.parentId, true);
    } else {
      const pid = `ph-gs-${sireRel.parentId}`;
      addPlaceholder(pid, sireX - Q, genY2, 'sire');
      addEdge(pid, sireRel.parentId, false);
    }
    if (gdam && snakeMap.has(gdam.parentId)) {
      addSnakeNode(gdam.parentId, sireX + Q, genY2, 'ancestor');
      addEdge(gdam.parentId, sireRel.parentId, true);
    } else {
      const pid = `ph-gd-${sireRel.parentId}`;
      addPlaceholder(pid, sireX + Q, genY2, 'dam');
      addEdge(pid, sireRel.parentId, false);
    }
  } else {
    const phId = `ph-sire-${selectedSnakeId}`;
    addPlaceholder(phId, sireX, genY1, 'sire');
    addEdge(phId, selectedSnakeId, false);
    addPlaceholder(`ph-gs-unk`, sireX - Q, genY2, 'sire');
    addPlaceholder(`ph-gd-unk`, sireX + Q, genY2, 'dam');
    addEdge(`ph-gs-unk`, phId, false);
    addEdge(`ph-gd-unk`, phId, false);
  }

  // Dam side
  if (damRel && snakeMap.has(damRel.parentId)) {
    addSnakeNode(damRel.parentId, damX, genY1, 'dam');
    addEdge(damRel.parentId, selectedSnakeId, true);
    // Dam's parents (gen -2)
    const dp = parentLookup.get(damRel.parentId) || [];
    const mgsire = dp.find(p => p.role === 'sire');
    const mgdam  = dp.find(p => p.role === 'dam');
    if (mgsire && snakeMap.has(mgsire.parentId)) {
      addSnakeNode(mgsire.parentId, damX - Q, genY2, 'ancestor');
      addEdge(mgsire.parentId, damRel.parentId, true);
    } else {
      const pid = `ph-mgs-${damRel.parentId}`;
      addPlaceholder(pid, damX - Q, genY2, 'sire');
      addEdge(pid, damRel.parentId, false);
    }
    if (mgdam && snakeMap.has(mgdam.parentId)) {
      addSnakeNode(mgdam.parentId, damX + Q, genY2, 'ancestor');
      addEdge(mgdam.parentId, damRel.parentId, true);
    } else {
      const pid = `ph-mgd-${damRel.parentId}`;
      addPlaceholder(pid, damX + Q, genY2, 'dam');
      addEdge(pid, damRel.parentId, false);
    }
  } else {
    const phId = `ph-dam-${selectedSnakeId}`;
    addPlaceholder(phId, damX, genY1, 'dam');
    addEdge(phId, selectedSnakeId, false);
    addPlaceholder(`ph-mgs-unk`, damX - Q, genY2, 'sire');
    addPlaceholder(`ph-mgd-unk`, damX + Q, genY2, 'dam');
    addEdge(`ph-mgs-unk`, phId, false);
    addEdge(`ph-mgd-unk`, phId, false);
  }

  // ── Gen +1: offspring ──────────────────────────────────────
  const childIds = [...new Set(childLookup.get(selectedSnakeId) || [])];
  if (childIds.length > 0) {
    const totalW = (childIds.length - 1) * OFFSPRING_SPACING;
    const startX = -totalW / 2;
    childIds.forEach((childId, i) => {
      addSnakeNode(childId, startX + i * OFFSPRING_SPACING, ROW_GAP, 'offspring');
      addEdge(selectedSnakeId, childId, true);
    });
  }

  return { nodes, edges };
}
