import { describe, expect, it } from 'vitest';
import {
  activeGenes,
  allelePair,
  buildChain,
  buildClutch,
  buildCombined,
  buildExplain,
  buildPerGene,
  cellLabel,
  dist,
  gametesOf,
  geneCode,
  pct,
  summarise,
} from './genetics.js';
import { GENES } from './data.js';

const gene = (name) => GENES.find((g) => g.name === name);
const PIED = gene('Pied');
const PASTEL = gene('Pastel');
const SPIDER = gene('Spider');
const YELLOW_BELLY = gene('Yellow Belly');

describe('pct', () => {
  it('keeps the decimals a breeder cares about and drops the rest', () => {
    expect(pct(0.5)).toBe('50%');
    expect(pct(1)).toBe('100%');
    expect(pct(0.125)).toBe('12.5%');
    expect(pct(0.0625)).toBe('6.25%');
    expect(pct(0.25)).toBe('25%');
  });
});

describe('dist', () => {
  it('splits het × het one in four', () => {
    expect(dist(1, 1)).toEqual([0.25, 0.5, 0.25]);
  });

  it('gives every hatchling one copy from a visual × normal pairing', () => {
    expect(dist(2, 0)).toEqual([0, 1, 0]);
  });

  it('gives every hatchling two copies from visual × visual', () => {
    expect(dist(2, 2)).toEqual([0, 0, 1]);
  });

  it('never loses probability', () => {
    for (let a = 0; a < 3; a++) {
      for (let b = 0; b < 3; b++) {
        const sum = dist(a, b).reduce((x, y) => x + y, 0);
        expect(sum).toBeCloseTo(1, 10);
      }
    }
  });
});

describe('allele symbols', () => {
  it('lowercases recessives and capitalises the rest', () => {
    expect(geneCode(PIED)).toBe('p');
    expect(geneCode(gene('Desert Ghost'))).toBe('dg');
    expect(geneCode(PASTEL)).toBe('P');
    expect(geneCode(YELLOW_BELLY)).toBe('Yb');
  });

  it('pairs a het with one wild-type allele', () => {
    expect(allelePair(PIED, 1).map((a) => a.sym)).toEqual(['p', '+']);
    expect(allelePair(PIED, 2).map((a) => a.sym)).toEqual(['p', 'p']);
    expect(allelePair(PIED, 0).map((a) => a.sym)).toEqual(['+', '+']);
  });

  it('has a het passing on either allele half the time', () => {
    expect(gametesOf(PIED, 1)).toEqual([
      { a: { sym: 'p', name: 'Pied', mut: true }, pct: '50%' },
      { a: { sym: '+', name: 'normal', mut: false }, pct: '50%' },
    ]);
    expect(gametesOf(PIED, 2).map((x) => x.pct)).toEqual(['100%']);
  });
});

describe('cellLabel', () => {
  it('needs two copies before a recessive is visible', () => {
    expect(cellLabel(PIED, 0)).toBe('normal');
    expect(cellLabel(PIED, 1)).toBe('het Pied');
    expect(cellLabel(PIED, 2)).toBe('Pied');
  });

  it('shows an incomplete dominant on one copy and supers on two', () => {
    expect(cellLabel(PASTEL, 1)).toBe('Pastel');
    expect(cellLabel(PASTEL, 2)).toBe('Super Pastel');
    expect(cellLabel(YELLOW_BELLY, 2)).toBe('Ivory');
  });
});

describe('buildPerGene', () => {
  it('reports visual, het and clear odds for het × het', () => {
    const [row] = buildPerGene([PIED], { Pied: 1 }, { Pied: 1 });
    expect(row.type).toBe('recessive');
    expect(row.rows).toEqual([
      { label: 'Pied (visual)', pct: '25%' },
      { label: 'het Pied', pct: '50%' },
      { label: 'no copy', pct: '25%' },
    ]);
  });

  it('adds the 66% possible-het note when non-visuals can carry', () => {
    const [row] = buildPerGene([PIED], { Pied: 1 }, { Pied: 1 });
    expect(row.note).toBe('Non-visual hatchlings are 66% possible het Pied.');
  });

  it('surfaces the complex a gene belongs to instead', () => {
    const lesser = gene('Lesser');
    const [row] = buildPerGene([lesser], { Lesser: 1 }, {});
    expect(row.note).toBe('BEL complex — Lesser and Butter are the same complex');
  });
});

describe('buildCombined', () => {
  it('merges genotypes that look the same, likeliest first', () => {
    const { outcomes } = buildCombined([PIED], { Pied: 1 }, { Pied: 1 });
    expect(outcomes).toEqual([
      { label: 'Normal het Pied', pct: '50%', bar: '100.0%' },
      { label: 'Normal', pct: '25%', bar: '50.0%' },
      { label: 'Pied', pct: '25%', bar: '50.0%' },
    ]);
  });

  it('multiplies independent genes out to the classic one in eight', () => {
    // Pastel het Pied × het Pied: 50% Pastel × 25% visual Pied = 12.5%.
    const { outcomes } = buildCombined([PIED, PASTEL], { Pied: 1, Pastel: 1 }, { Pied: 1 });
    const piedPastel = outcomes.find((o) => o.label === 'Pied Pastel');
    expect(piedPastel.pct).toBe('12.5%');
  });

  it('shows at most eight rows and counts the rest', () => {
    const active = activeGenes(GENES, { Pied: 1, Clown: 1, Pastel: 1, Enchi: 1 }, { Pied: 1, Clown: 1 });
    const { outcomes, moreNote } = buildCombined(
      active,
      { Pied: 1, Clown: 1, Pastel: 1, Enchi: 1 },
      { Pied: 1, Clown: 1 }
    );
    expect(outcomes).toHaveLength(8);
    expect(moreNote).toMatch(/further combinations below 1 in \d+ are not shown\./);
  });

  it('explains itself when nothing is hidden', () => {
    const { moreNote } = buildCombined([PIED], { Pied: 1 }, { Pied: 1 });
    expect(moreNote).toBe('Combined odds across every gene set on both parents.');
  });
});

describe('buildChain', () => {
  it('multiplies each gene’s likeliest outcome into one number', () => {
    const chain = buildChain([PIED, PASTEL], { Pied: 1, Pastel: 1 }, { Pied: 1, Pastel: 1 });
    expect(chain.multi).toBe(true);
    expect(chain.math).toBe('50% × 50% = 25%');
    expect(chain.label).toBe('Pastel het Pied');
  });

  // A gene only one parent carries splits 50/50 between one copy and none, and
  // the tie goes to "no copy" — so the likeliest chain drops it rather than
  // claiming a coin toss as the expected outcome.
  it('breaks a 50/50 tie towards no copy', () => {
    const chain = buildChain([PASTEL], { Pastel: 1 }, {});
    expect(chain.steps[0].outcome).toBe('normal');
    expect(chain.label).toBe('Normal');
  });

  it('stays quiet about combining when only one gene is set', () => {
    expect(buildChain([PIED], { Pied: 1 }, { Pied: 1 }).multi).toBe(false);
  });
});

describe('buildExplain', () => {
  it('lays out the four Punnett cells for het × het', () => {
    const explain = buildExplain(PIED, 1, 1);
    expect(explain.cells).toHaveLength(4);
    expect(explain.cells.map((c) => c.geno)).toEqual(['p / p', 'p / +', 'p / +', '+ / +']);
    expect(explain.cells.map((c) => c.trait)).toEqual(['Pied', 'het Pied', 'het Pied', 'normal']);
  });

  it('names the inheritance pattern and the parents’ genotypes', () => {
    const explain = buildExplain(PIED, 1, 2);
    expect(explain.kind).toBe('Recessive — two copies needed to see it');
    expect(explain.sireLine).toBe('het Pied · carries p / +');
    expect(explain.damLine).toBe('Pied · carries p / p');
  });

  it('orders outcomes from most to least copies', () => {
    const explain = buildExplain(PASTEL, 1, 1);
    expect(explain.rows).toEqual([
      { label: 'Super Pastel', pct: '25%', bar: '25%' },
      { label: 'Pastel', pct: '50%', bar: '50%' },
      { label: 'normal', pct: '25%', bar: '25%' },
    ]);
  });
});

describe('buildClutch', () => {
  it('apportions whole eggs that still add up to the clutch', () => {
    const clutch = buildClutch(PIED, 1, 1, 6, null);
    expect(clutch.eggs).toHaveLength(6);
    expect(clutch.legend.map((l) => l.expect)).toEqual(['≈ 2 of 6', '≈ 3 of 6', '≈ 1 of 6']);
  });

  it('adds up for every clutch size, including awkward ones', () => {
    for (let size = 1; size <= 24; size++) {
      expect(buildClutch(PIED, 1, 1, size, null).eggs).toHaveLength(size);
    }
  });

  it('labels carriers as looking normal', () => {
    const clutch = buildClutch(PIED, 1, 1, 6, null);
    const carrier = clutch.legend.find((l) => l.label === 'het Pied');
    expect(carrier.role).toBe('Carrier — looks normal');
    expect(carrier.dash).toBe('dashed');
  });

  it('leaves the simulated clutch unrolled until a seed arrives', () => {
    expect(buildClutch(PIED, 1, 1, 6, null).rolled).toBeNull();
    expect(buildClutch(PIED, 1, 1, 6, 12345).rolled).toHaveLength(6);
  });

  it('rolls the same clutch for the same seed', () => {
    const a = buildClutch(PIED, 1, 1, 8, 99).rolledLegend.map((r) => r.n);
    const b = buildClutch(PIED, 1, 1, 8, 99).rolledLegend.map((r) => r.n);
    expect(a).toEqual(b);
    expect(a.reduce((x, y) => x + y, 0)).toBe(8);
  });

  it('rolls a different clutch for a different seed', () => {
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8].map((s) =>
      buildClutch(PIED, 1, 1, 8, s * 7919).rolledLegend.map((r) => r.n).join('-')
    );
    expect(new Set(seeds).size).toBeGreaterThan(1);
  });
});

describe('parent summaries', () => {
  it('reads back in breeder shorthand', () => {
    expect(summarise({ Pied: 1, Pastel: 2 }, GENES)).toBe('het Pied, Super Pastel');
  });

  it('says so when nothing is set', () => {
    expect(summarise({}, GENES)).toBe('no genes set');
  });
});

describe('warnings', () => {
  it('keeps the wobble and lethal-super warning on Spider', () => {
    expect(SPIDER.warn).toBe('Spider carries wobble; the super form is not viable.');
  });

  it('finds the genes either parent carries', () => {
    expect(activeGenes(GENES, { Pied: 1 }, { Spider: 2 }).map((g) => g.name)).toEqual(['Pied', 'Spider']);
  });
});
