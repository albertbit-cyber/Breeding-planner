import { describe, it, expect } from 'vitest';
import { buildPedigree } from '../pedigreeModel';
import { LAYOUTS, buildGraphForView } from './index';

/**
 * A collection with the awkward shapes in it: a sire used across two dams (half-siblings), a
 * pair used twice in different years (two sibships from one cross), a part-hatched clutch, and
 * a third generation.
 */
const COLLECTION = {
  animals: [
    { id: 'M1', name: 'Confusion', sex: 'M', groups: ['Breeders'] },
    { id: 'M2', name: 'Hydra', sex: 'M', groups: ['Breeders'] },
    { id: 'F1', name: 'Runa', sex: 'F', groups: ['Breeders'] },
    { id: 'F2', name: 'Nova', sex: 'F', groups: ['Breeders'] },

    // Clutch A — Runa x Confusion, 2025
    { id: 'A1', name: 'Runa x Confusion - 1', sex: 'F', pairingId: 'PA', hatchlingIndex: 1 },
    { id: 'A2', name: 'Runa x Confusion - 2', sex: 'M', pairingId: 'PA', hatchlingIndex: 2 },

    // Clutch B — Nova x Confusion, 2025. Half-siblings of clutch A through the sire.
    { id: 'B1', name: 'Nova x Confusion - 1', sex: 'F', pairingId: 'PB', hatchlingIndex: 1 },

    // Clutch C — Runa x Confusion again, 2026. Same pair, different sibship.
    { id: 'C1', name: 'Runa x Confusion - 1', sex: 'M', pairingId: 'PC', hatchlingIndex: 1 },

    // A third generation, out of A1.
    { id: 'G1', name: 'Grandchild', sex: 'F', sireId: 'M2', damId: 'A1' },

    // Nothing recorded either side of it.
    { id: 'X1', name: 'Loner', sex: 'M' },
  ],
  pairings: [
    { id: 'PA', maleId: 'M1', femaleId: 'F1', clutch: { date: '2025-06-01', fertileEggs: 4 } },
    { id: 'PB', maleId: 'M1', femaleId: 'F2', clutch: { date: '2025-07-01', fertileEggs: 1 } },
    { id: 'PC', maleId: 'M1', femaleId: 'F1', clutch: { date: '2026-06-01', fertileEggs: 1 } },
  ],
};

const model = buildPedigree(COLLECTION);
const VIEWS = Object.keys(LAYOUTS);

const snakeIds = graph => graph.nodes.filter(n => n.type === 'snakeNode').map(n => n.id);

/**
 * Rendered footprint of each node type. Layouts set width but let height come from content, so
 * these are measured-from-the-browser figures rather than anything the layout declares.
 */
const FOOTPRINT = {
  snakeNode: { w: 192, h: 148 },
  placeholderNode: { w: 192, h: 70 },
  clutchNode: { w: 168, h: 42 },
  junctionNode: { w: 12, h: 12 },
};

/**
 * Cards that land on top of each other. Overlap is the failure this whole file exists to catch:
 * a layout can produce every right node and edge and still be unreadable, and that only ever
 * showed up by looking at a screenshot.
 */
function overlappingPairs(nodes) {
  const boxes = nodes
    .filter(node => node.type !== 'junctionNode')
    .map(node => ({
      id: node.id,
      x1: node.position.x,
      y1: node.position.y,
      x2: node.position.x + FOOTPRINT[node.type].w,
      y2: node.position.y + FOOTPRINT[node.type].h,
    }));

  const hits = [];
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i];
      const b = boxes[j];
      if (a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2) hits.push([a.id, b.id]);
    }
  }
  return hits;
}

describe.each(VIEWS)('%s layout — invariants', (view) => {
  const graph = buildGraphForView(view, model, 'A1');

  it('draws something', () => {
    expect(graph.nodes.length).toBeGreaterThan(0);
  });

  it('never places the same node twice', () => {
    const ids = graph.nodes.map(n => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('never draws an edge to a node it did not place', () => {
    const placed = new Set(graph.nodes.map(n => n.id));
    for (const edge of graph.edges) {
      expect(placed.has(edge.source), `${edge.id} source`).toBe(true);
      expect(placed.has(edge.target), `${edge.id} target`).toBe(true);
    }
  });

  it('never draws the same edge twice', () => {
    const ids = graph.edges.map(e => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every edge an explicit handle at both ends', () => {
    for (const edge of graph.edges) {
      expect(edge.sourceHandle, edge.id).toBeTruthy();
      expect(edge.targetHandle, edge.id).toBeTruthy();
    }
  });

  it('gives every node a finite position', () => {
    for (const node of graph.nodes) {
      expect(Number.isFinite(node.position.x), `${node.id} x`).toBe(true);
      expect(Number.isFinite(node.position.y), `${node.id} y`).toBe(true);
    }
  });

  it('never lets two cards overlap', () => {
    for (const [a, b] of overlappingPairs(graph.nodes)) {
      expect.fail(`${a} overlaps ${b} in the ${view} layout`);
    }
  });
});

describe('tree layout', () => {
  const graph = buildGraphForView('tree', model, 'A1');

  it('shows the selected animal with its own clutch-mates', () => {
    const ids = snakeIds(graph);
    expect(ids).toContain('A1');
    expect(ids).toContain('A2');       // full sibling, same clutch
  });

  it('does not mix a half-sibling into the selected animal\'s clutch', () => {
    // B1 shares only the sire, so it belongs to another clutch and must not be drawn as a
    // clutch-mate of A1.
    expect(snakeIds(graph)).not.toContain('B1');
  });

  it('shows both parents and all four grandparent slots', () => {
    const ids = snakeIds(graph);
    expect(ids).toContain('M1');
    expect(ids).toContain('F1');
    const placeholders = graph.nodes.filter(n => n.type === 'placeholderNode');
    expect(placeholders).toHaveLength(4);   // no grandparents recorded
  });

  it('draws one junction per clutch, not one per pair', () => {
    // Selected animal's own clutch, plus the one it produced with M2.
    const junctions = graph.nodes.filter(n => n.type === 'junctionNode');
    expect(junctions).toHaveLength(2);
  });

  it('gives the sire a separate branch for each dam he was used with', () => {
    const sireGraph = buildGraphForView('tree', model, 'M1');
    const junctions = sireGraph.nodes.filter(n => n.type === 'junctionNode');
    // Three clutches (Runa 2025, Nova 2025, Runa 2026) plus the sire's own parentless junction.
    expect(junctions.length).toBeGreaterThanOrEqual(3);
    const clutchNodes = sireGraph.nodes.filter(n => n.type === 'clutchNode');
    expect(clutchNodes).toHaveLength(3);
  });

  it('shows the eggs a clutch has not hatched alongside the hatchlings', () => {
    const sireGraph = buildGraphForView('tree', model, 'M1');
    const eggs = sireGraph.nodes.filter(n => n.data?.snake?.isEgg);
    expect(eggs).toHaveLength(2);   // clutch A laid 4, two are out
  });
});

describe('horizontal layout', () => {
  const graph = buildGraphForView('horizontal', model, 'G1');

  it('lays generations out as columns, left to right', () => {
    const xOf = id => graph.nodes.find(n => n.id === id)?.position.x;
    expect(xOf('G1')).toBeLessThan(xOf('A1'));   // child left of its dam
    expect(xOf('A1')).toBeLessThan(xOf('F1'));   // dam left of her own dam
  });

  it('stays ancestral — no offspring, no mates', () => {
    // A2 is G1's aunt, and B1 a half-cousin: neither is an ancestor.
    expect(snakeIds(graph)).not.toContain('A2');
    expect(snakeIds(graph)).not.toContain('B1');
  });

  it('climbs past the grandparents', () => {
    const ids = snakeIds(graph);
    expect(ids).toEqual(expect.arrayContaining(['G1', 'A1', 'M2', 'F1', 'M1']));
  });
});

describe('lineage layout', () => {
  const graph = buildGraphForView('lineage', model, 'A1');

  it('reaches ancestors above and descendants below the selected animal', () => {
    const yOf = id => graph.nodes.find(n => n.id === id)?.position.y;
    expect(yOf('F1')).toBeLessThan(yOf('A1'));   // dam above
    expect(yOf('G1')).toBeGreaterThan(yOf('A1'));  // offspring below
  });

  it('reaches two generations up', () => {
    const parentGraph = buildGraphForView('lineage', model, 'G1');
    expect(snakeIds(parentGraph)).toEqual(expect.arrayContaining(['A1', 'F1', 'M1']));
  });

  it('terminates on a record that makes an animal its own ancestor', () => {
    const cyclic = buildPedigree({
      animals: [
        { id: 'P', name: 'Ouroboros', sex: 'M', sireId: 'Q' },
        { id: 'Q', name: 'Snake Two', sex: 'M', sireId: 'P' },
      ],
    });
    expect(() => buildGraphForView('lineage', cyclic, 'P')).not.toThrow();
  });
});

describe('clutch layout', () => {
  const graph = buildGraphForView('clutch', model, 'F1');

  it('gives each of the dam\'s clutches its own band', () => {
    const clutchNodes = graph.nodes.filter(n => n.type === 'clutchNode');
    expect(clutchNodes).toHaveLength(2);   // Runa x Confusion 2025 and 2026
  });

  it('stacks the bands rather than overlapping them', () => {
    const clutchNodes = graph.nodes
      .filter(n => n.type === 'clutchNode')
      .sort((a, b) => a.position.y - b.position.y);
    expect(clutchNodes[1].position.y).toBeGreaterThan(clutchNodes[0].position.y + 200);
  });

  it('puts the clutch the animal hatched from first', () => {
    const own = buildGraphForView('clutch', model, 'A1');
    const bands = own.nodes
      .filter(n => n.type === 'clutchNode')
      .sort((a, b) => a.position.y - b.position.y);
    expect(bands[0].data.isSelected).toBe(true);
  });

  it('holds an animal with no clutch either side of it without emptying the canvas', () => {
    const lone = buildGraphForView('clutch', model, 'X1');
    expect(snakeIds(lone)).toEqual(['X1']);
  });
});

describe('universe layout', () => {
  const graph = buildGraphForView('universe', model, 'A1');

  it('draws every animal in the collection exactly once', () => {
    const ids = snakeIds(graph);
    for (const animal of COLLECTION.animals) {
      expect(ids.filter(id => id === animal.id), animal.id).toHaveLength(1);
    }
  });

  it('includes an animal with no recorded relatives', () => {
    expect(snakeIds(graph)).toContain('X1');
  });

  it('puts each generation below the one before it', () => {
    const yOf = id => graph.nodes.find(n => n.id === id)?.position.y;
    expect(yOf('M1')).toBeLessThan(yOf('A1'));
    expect(yOf('A1')).toBeLessThan(yOf('G1'));
  });

  it('keeps clutch-mates adjacent and half-siblings apart', () => {
    const xOf = id => graph.nodes.find(n => n.id === id)?.position.x;
    // A1 and A2 are one clutch; B1 and C1 are others in the same generation.
    const gap = Math.abs(xOf('A1') - xOf('A2'));
    expect(Math.abs(xOf('A1') - xOf('B1'))).toBeGreaterThan(gap);
  });
});
