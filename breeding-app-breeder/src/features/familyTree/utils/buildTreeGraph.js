// Converts flat snake + relationship arrays into ReactFlow nodes and edges.
//
// Layout rules:
//   Gen -2  grandparents at ±(S+Q), connected directly to Gen -1
//   Gen -1  sire at -S (left), dam at +S (right) — male always left
//   Gen  0  selected snake; vertical sibling stack below pair junction when
//           both parents are known, otherwise x=0
//   Gen +1  offspring section:
//             1 mate  → mate beside selected (male left, female right),
//                       pair junction between them, offspring vertical below
//             2+ mates → mates in a horizontal row below selected,
//                        each mate's offspring vertical below her

const NODE_WIDTH  = 192;
const NODE_HEIGHT = 135;   // estimated rendered card height for spacing
const JUNCTION_SIZE = 12;
const CLUTCH_WIDTH  = 132;

const S = 310;   // Gen-1 sire/dam horizontal half-spread from center
const Q = 155;   // Gen-2 grandparent extra horizontal spread

const ROW_GAP      = 190;  // vertical distance between generation rows
const H_GAP        = 140;  // horizontal gap between side-by-side columns
const COL_W        = NODE_WIDTH + H_GAP;   // 332 — one mate column width
const CHILD_V_STEP = NODE_HEIGHT + 25;     // 160 — step per stacked child
const JUNC_DROP    = 160;  // junction sits this far below the parent row top
const JUNC_TO_CHILD = 30;  // first child starts this far below junction bottom

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
  const snakeMap    = new Map(snakes.map(s => [s.id, s]));
  const parentLookup = buildParentLookup(relationships);
  const childLookup  = buildChildLookup(relationships);

  const nodes  = [];
  const edges  = [];
  const placed = new Set();

  function addSnakeNode(id, x, y, nodeRole, generationLabel) {
    if (placed.has(id)) return;
    const snake = snakeMap.get(id);
    if (!snake) return;
    placed.add(id);
    nodes.push({
      id,
      type: 'snakeNode',
      position: { x: x - NODE_WIDTH / 2, y },
      data: { snake, nodeRole, isSelected: id === selectedSnakeId, generationLabel },
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

  function addJunction(id, x, y) {
    if (placed.has(id)) return;
    placed.add(id);
    nodes.push({
      id,
      type: 'junctionNode',
      position: { x: x - JUNCTION_SIZE / 2, y: y - JUNCTION_SIZE / 2 },
      data: {},
      style: { width: JUNCTION_SIZE, height: JUNCTION_SIZE },
    });
  }

  function addClutchNode(id, x, y, label) {
    if (placed.has(id)) return;
    placed.add(id);
    nodes.push({
      id,
      type: 'clutchNode',
      position: { x: x - CLUTCH_WIDTH / 2, y },
      data: { label },
      style: { width: CLUTCH_WIDTH },
    });
  }

  function addEdge(sourceId, targetId, confirmed = true, extra = {}) {
    edges.push({
      id: `e-${sourceId}-${targetId}`,
      source: sourceId,
      target: targetId,
      type: 'step',
      ...extra,
      style: {
        stroke: confirmed ? '#7c3aed' : '#9ca3af',
        strokeWidth: confirmed ? 1.5 : 1,
        strokeDasharray: confirmed ? undefined : '5 4',
        ...(extra.style || {}),
      },
    });
  }

  // Sort child IDs by hatchlingIndex then name
  function sortedChildren(childIds) {
    return [...new Set(childIds || [])]
      .filter(id => snakeMap.has(id))
      .sort((a, b) => {
        const la = Number(snakeMap.get(a)?.hatchlingIndex);
        const lb = Number(snakeMap.get(b)?.hatchlingIndex);
        const ra = Number.isFinite(la) ? la : Number.MAX_SAFE_INTEGER;
        const rb = Number.isFinite(lb) ? lb : Number.MAX_SAFE_INTEGER;
        if (ra !== rb) return ra - rb;
        return String(snakeMap.get(a)?.name || a).localeCompare(String(snakeMap.get(b)?.name || b));
      });
  }

  // Stack children VERTICALLY at columnX, numbered from top, connected from sourceId.
  function placeChildrenVertical(childIds, columnX, startY, sourceId, confirmed = true, childRole = 'offspring', generationLabel = undefined) {
    const ids = sortedChildren(childIds);
    ids.forEach((childId, i) => {
      const role = childId === selectedSnakeId ? 'selected' : childRole;
      addSnakeNode(childId, columnX, startY + i * CHILD_V_STEP, role, generationLabel);
      addEdge(sourceId, childId, confirmed);
    });
    return ids.length;
  }

  // Place a pair junction between sire (left) and dam (right), then stack
  // children vertically below the junction. Male is always the sire (left).
  function placePairWithVerticalChildren({
    sireId, damId, sireX, damX, parentY,
    childIds, confirmed = true, idSuffix, clutchLabel, childRole, generationLabel,
  }) {
    if (!sireId || !damId || !snakeMap.has(sireId) || !snakeMap.has(damId)) return false;
    const jX  = (sireX + damX) / 2;
    const jY  = parentY + JUNC_DROP;
    const jId = `junction-${idSuffix}`;
    const cId = clutchLabel ? `clutch-${idSuffix}` : null;

    addJunction(jId, jX, jY);
    addEdge(sireId, jId, confirmed);
    addEdge(damId,  jId, confirmed);

    let childStartY = jY + JUNC_TO_CHILD;
    if (cId) {
      addClutchNode(cId, jX, childStartY, clutchLabel);
      addEdge(jId, cId, confirmed);
      childStartY += 34;
    }

    placeChildrenVertical(childIds, jX, childStartY, cId || jId, confirmed, childRole, generationLabel);
    return true;
  }

  // ── Gen -2 → Gen -1 (grandparents and parents) ────────────────────────────

  const parents = parentLookup.get(selectedSnakeId) || [];
  const sireRel = parents.find(p => p.role === 'sire');
  const damRel  = parents.find(p => p.role === 'dam');

  const sireX = -S;
  const damX  = +S;
  const genY1 = -ROW_GAP;
  const genY2 = -2 * ROW_GAP;

  // Sire side
  if (sireRel && snakeMap.has(sireRel.parentId)) {
    addSnakeNode(sireRel.parentId, sireX, genY1, 'sire', 'Parents');
    const sp   = parentLookup.get(sireRel.parentId) || [];
    const gsire = sp.find(p => p.role === 'sire');
    const gdam  = sp.find(p => p.role === 'dam');
    if (gsire && snakeMap.has(gsire.parentId)) {
      addSnakeNode(gsire.parentId, sireX - Q, genY2, 'ancestor', 'Grandparents');
      addEdge(gsire.parentId, sireRel.parentId, true);
    } else {
      const pid = `ph-gs-${sireRel.parentId}`;
      addPlaceholder(pid, sireX - Q, genY2, 'sire');
      addEdge(pid, sireRel.parentId, false);
    }
    if (gdam && snakeMap.has(gdam.parentId)) {
      addSnakeNode(gdam.parentId, sireX + Q, genY2, 'ancestor', 'Grandparents');
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
    addPlaceholder('ph-gs-unk', sireX - Q, genY2, 'sire');
    addPlaceholder('ph-gd-unk', sireX + Q, genY2, 'dam');
    addEdge('ph-gs-unk', phId, false);
    addEdge('ph-gd-unk', phId, false);
  }

  // Dam side
  if (damRel && snakeMap.has(damRel.parentId)) {
    addSnakeNode(damRel.parentId, damX, genY1, 'dam', 'Parents');
    const dp    = parentLookup.get(damRel.parentId) || [];
    const mgsire = dp.find(p => p.role === 'sire');
    const mgdam  = dp.find(p => p.role === 'dam');
    if (mgsire && snakeMap.has(mgsire.parentId)) {
      addSnakeNode(mgsire.parentId, damX - Q, genY2, 'ancestor', 'Grandparents');
      addEdge(mgsire.parentId, damRel.parentId, true);
    } else {
      const pid = `ph-mgs-${damRel.parentId}`;
      addPlaceholder(pid, damX - Q, genY2, 'sire');
      addEdge(pid, damRel.parentId, false);
    }
    if (mgdam && snakeMap.has(mgdam.parentId)) {
      addSnakeNode(mgdam.parentId, damX + Q, genY2, 'ancestor', 'Grandparents');
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
    addPlaceholder('ph-mgs-unk', damX - Q, genY2, 'sire');
    addPlaceholder('ph-mgd-unk', damX + Q, genY2, 'dam');
    addEdge('ph-mgs-unk', phId, false);
    addEdge('ph-mgd-unk', phId, false);
  }

  // ── Gen 0: selected + siblings (vertical stack from parents) ──────────────

  if (sireRel && damRel && snakeMap.has(sireRel.parentId) && snakeMap.has(damRel.parentId)) {
    // Both parents known: all siblings (including selected) stack vertically
    const damChildSet = new Set(childLookup.get(damRel.parentId) || []);
    const siblingIds  = (childLookup.get(sireRel.parentId) || []).filter(id => damChildSet.has(id));
    const gen0Ids     = siblingIds.length > 0 ? siblingIds : [selectedSnakeId];
    placePairWithVerticalChildren({
      sireId: sireRel.parentId,
      damId:  damRel.parentId,
      sireX,
      damX,
      parentY: genY1,
      childIds: gen0Ids,
      confirmed: true,
      idSuffix: `parents-${selectedSnakeId}`,
      childRole: 'sibling',
      generationLabel: 'Clutch',
    });
  } else {
    // No pair junction — place selected at center, connect any single known parent
    addSnakeNode(selectedSnakeId, 0, 0, 'selected', 'Selected');
    if (sireRel && snakeMap.has(sireRel.parentId)) addEdge(sireRel.parentId, selectedSnakeId, true);
    if (damRel  && snakeMap.has(damRel.parentId))  addEdge(damRel.parentId,  selectedSnakeId, true);
  }

  // Read selected snake's actual placed position (siblings may have shifted it)
  const selNode = nodes.find(n => n.id === selectedSnakeId);
  const selX    = selNode ? selNode.position.x + NODE_WIDTH / 2 : 0;
  const selY    = selNode ? selNode.position.y : 0;

  // ── Gen +1: offspring ─────────────────────────────────────────────────────

  const rawChildIds = [...new Set(childLookup.get(selectedSnakeId) || [])];
  if (rawChildIds.length > 0) {
    const grouped            = new Map();
    const singleParentChildren = [];

    for (const childId of rawChildIds) {
      const childParents = parentLookup.get(childId) || [];
      const coParentRel  = childParents.find(
        r => r.parentId !== selectedSnakeId && snakeMap.has(r.parentId),
      );
      if (!coParentRel) { singleParentChildren.push(childId); continue; }

      const selectedRole = childParents.find(r => r.parentId === selectedSnakeId)?.role || 'sire';
      const clutchId     = childParents.find(r => r.parentId === selectedSnakeId)?.clutchId
        || coParentRel.clutchId
        || snakeMap.get(childId)?.clutchId
        || childId;
      const sireId = selectedRole === 'sire' ? selectedSnakeId : coParentRel.parentId;
      const damId  = selectedRole === 'dam'  ? selectedSnakeId : coParentRel.parentId;
      const key    = `${sireId}-${damId}-${clutchId}`;
      if (!grouped.has(key)) grouped.set(key, { sireId, damId, clutchId, children: [] });
      grouped.get(key).children.push(childId);
    }

    const groups = Array.from(grouped.values());

    if (groups.length === 1) {
      // ── SINGLE PAIR: mate beside selected, male always left ──────────────
      const group          = groups[0];
      const selectedIsSire = group.sireId === selectedSnakeId;
      const mateId         = selectedIsSire ? group.damId : group.sireId;
      // Male (sire) goes left, female (dam) goes right
      const mateX  = selectedIsSire ? selX + COL_W : selX - COL_W;
      const pSireX = selectedIsSire ? selX : mateX;
      const pDamX  = selectedIsSire ? mateX : selX;

      addSnakeNode(mateId, mateX, selY, selectedIsSire ? 'dam' : 'sire', 'Mate');
      placePairWithVerticalChildren({
        sireId: group.sireId,
        damId:  group.damId,
        sireX:  pSireX,
        damX:   pDamX,
        parentY: selY,
        childIds: group.children,
        confirmed: true,
        idSuffix: `offspring-${group.sireId}-${group.damId}-${group.clutchId}`,
        clutchLabel: group.clutchId && !String(group.clutchId).startsWith('local-clutch-')
          ? `Clutch ${group.clutchId}` : null,
        childRole: 'offspring',
        generationLabel: 'Offspring',
      });
    } else if (groups.length > 1) {
      // ── MULTI-MATE: selected above, mates in a row below, eggs vertical ──
      // Center the mate row under selected
      const totalWidth = groups.length * COL_W - H_GAP;
      const rowStartX  = selX - totalWidth / 2 + NODE_WIDTH / 2;
      const mateRowY   = selY + ROW_GAP;

      groups.forEach((group, idx) => {
        const selectedIsSire = group.sireId === selectedSnakeId;
        const mateId         = selectedIsSire ? group.damId : group.sireId;
        const mateX          = rowStartX + idx * COL_W;

        addSnakeNode(mateId, mateX, mateRowY, selectedIsSire ? 'dam' : 'sire', 'Mates');
        addEdge(selectedSnakeId, mateId, true);

        const childStartY = mateRowY + NODE_HEIGHT + 30;
        placeChildrenVertical(group.children, mateX, childStartY, mateId, true, 'offspring', 'Offspring');
      });
    }

    // Children with no known co-parent connect directly to selected, vertical below
    if (singleParentChildren.length > 0) {
      placeChildrenVertical(
        singleParentChildren,
        selX,
        selY + ROW_GAP,
        selectedSnakeId,
        true,
        'offspring',
        'Offspring',
      );
    }
  }

  return { nodes, edges };
}
