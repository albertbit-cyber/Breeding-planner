/* Mendelian maths for the v6 marketing calculator.
 *
 * Ported function-for-function from the `renderVals()` body of
 * `Serpentora Site v6.dc.html`. The design brief calls this the credibility
 * centre of the page, so the arithmetic is deliberately unchanged — it was only
 * lifted out of the render path into pure functions that can be unit-tested.
 *
 * A parent's holding of a gene is stored as a number of copies: 0, 1 or 2.
 * Distributions are arrays indexed by copies: d[0], d[1], d[2] sum to 1. */

/** The ordinary, non-mutant allele. */
export const WILD = { sym: '+', name: 'normal', mut: false };

/** 12.5 → "12.5%", 6.25 → "6.25%", 50 → "50%". Trailing zeros stripped. */
export function pct(p) {
  const v = p * 100;
  const s = v >= 10 ? v.toFixed(1) : v.toFixed(2);
  return s.replace(/\.?0+$/, '') + '%';
}

/** Allele symbol: lowercase initials for a recessive, capitalised otherwise. */
export function geneCode(gene) {
  const init = gene.name
    .split(/\s+/)
    .map((w) => w[0])
    .join('');
  return gene.type === 'rec' ? init.toLowerCase() : init.charAt(0).toUpperCase() + init.slice(1).toLowerCase();
}

/** What a hatchling with `copies` copies looks like, including "normal". */
export function cellLabel(gene, copies) {
  if (gene.type === 'rec') return copies === 2 ? gene.name : copies === 1 ? 'het ' + gene.name : 'normal';
  return copies === 2 ? gene.superName || 'Super ' + gene.name : copies === 1 ? gene.name : 'normal';
}

/** As cellLabel, but a hatchling carrying no copy contributes nothing. */
export function traitLabel(gene, copies) {
  if (!copies) return null;
  if (gene.type === 'rec') return copies === 2 ? gene.name : 'het ' + gene.name;
  return copies === 2 ? gene.superName || 'Super ' + gene.name : gene.name;
}

/** Offspring distribution from two parents holding `a` and `b` copies. */
export function dist(a, b) {
  const alleles = (copies) => (copies === 0 ? [0, 0] : copies === 1 ? [0, 1] : [1, 1]);
  const out = [0, 0, 0];
  for (const x of alleles(a)) for (const y of alleles(b)) out[x + y] += 0.25;
  return out;
}

/** What one parent can pass on, and how often. */
export function gametesOf(gene, copies) {
  const mut = { sym: geneCode(gene), name: gene.name, mut: true };
  if (copies === 2) return [{ a: mut, pct: '100%' }];
  if (copies === 1) {
    return [
      { a: mut, pct: '50%' },
      { a: WILD, pct: '50%' },
    ];
  }
  return [{ a: WILD, pct: '100%' }];
}

/** The two alleles a parent holds. */
export function allelePair(gene, copies) {
  const mut = { sym: geneCode(gene), name: gene.name, mut: true };
  return copies === 2 ? [mut, mut] : copies === 1 ? [mut, WILD] : [WILD, WILD];
}

/** Breeder shorthand for one parent's selections: "het Pied, visual Pastel". */
export function summarise(side, genes) {
  const keys = Object.keys(side);
  if (!keys.length) return 'no genes set';
  return keys.map((k) => traitLabel(genes.find((g) => g.name === k), side[k])).join(', ');
}

/** Genes either parent holds at least one copy of. */
export function activeGenes(genes, male, female) {
  return genes.filter((g) => (male[g.name] || 0) > 0 || (female[g.name] || 0) > 0);
}

/** Per-gene breakdown: every outcome for each gene on its own. */
export function buildPerGene(active, male, female) {
  return active.map((g) => {
    const d = dist(male[g.name] || 0, female[g.name] || 0);
    const rows = [];
    if (g.type === 'rec') {
      if (d[2]) rows.push({ label: g.name + ' (visual)', pct: pct(d[2]) });
      if (d[1]) rows.push({ label: 'het ' + g.name, pct: pct(d[1]) });
      if (d[0]) rows.push({ label: 'no copy', pct: pct(d[0]) });
    } else {
      if (d[2]) rows.push({ label: g.superName || 'Super ' + g.name, pct: pct(d[2]) });
      if (d[1]) rows.push({ label: g.name, pct: pct(d[1]) });
      if (d[0]) rows.push({ label: 'normal', pct: pct(d[0]) });
    }
    let note = null;
    if (g.type === 'rec' && d[1] && d[2]) note = 'Non-visual hatchlings are 66% possible het ' + g.name + '.';
    else if (g.complex) note = g.complex;
    return {
      name: g.name,
      type: g.type === 'rec' ? 'recessive' : g.type === 'inc' ? 'inc. dominant' : 'dominant',
      rows,
      note,
    };
  });
}

/** The worked example for one focused gene: gametes, Punnett square, outcomes. */
export function buildExplain(focus, maleCopies, femaleCopies) {
  const pa = allelePair(focus, maleCopies);
  const pb = allelePair(focus, femaleCopies);
  const cells = [];
  for (const x of pa) {
    for (const y of pb) {
      const k = (x.mut ? 1 : 0) + (y.mut ? 1 : 0);
      const pair = [x, y].sort((p, q) => (p.mut === q.mut ? 0 : p.mut ? -1 : 1));
      cells.push({
        geno: pair[0].sym + ' / ' + pair[1].sym,
        trait: cellLabel(focus, k),
        bg: k === 2 || (focus.type !== 'rec' && k === 1) ? 'var(--accent-quiet)' : 'transparent',
      });
    }
  }
  const d = dist(maleCopies, femaleCopies);
  const rows = [2, 1, 0]
    .filter((k) => d[k])
    .map((k) => ({
      label: cellLabel(focus, k),
      pct: pct(d[k]),
      bar: Math.round(d[k] * 100) + '%',
    }));
  const describe = (copies) => {
    const l = cellLabel(focus, copies);
    return l === 'normal' ? 'no copy' : l;
  };
  return {
    gene: focus.name,
    kind:
      focus.type === 'rec'
        ? 'Recessive — two copies needed to see it'
        : focus.type === 'inc'
          ? 'Incomplete dominant — one copy shows, two make the super form'
          : 'Dominant — one copy shows',
    sireLine: describe(maleCopies) + ' · carries ' + pa[0].sym + ' / ' + pa[1].sym,
    damLine: describe(femaleCopies) + ' · carries ' + pb[0].sym + ' / ' + pb[1].sym,
    sireGametes: gametesOf(focus, maleCopies),
    damGametes: gametesOf(focus, femaleCopies),
    colHeads: pb.map((a) => a.sym),
    rowHeads: pa.map((a) => a.sym),
    cells,
    rows,
    legend: geneCode(focus) + ' = the ' + focus.name + ' allele.  + = the ordinary (wild-type) allele.',
  };
}

/** Combined odds across every active gene, merged by phenotype. */
export function buildCombined(active, male, female) {
  let combos = [{ parts: [], p: 1 }];
  for (const g of active) {
    const d = dist(male[g.name] || 0, female[g.name] || 0);
    const next = [];
    for (const c of combos) {
      for (let k = 0; k < 3; k++) {
        if (!d[k]) continue;
        const l = traitLabel(g, k);
        next.push({ parts: l ? c.parts.concat(l) : c.parts, p: c.p * d[k] });
      }
    }
    combos = next;
  }

  const merged = {};
  for (const c of combos) {
    const visuals = c.parts.filter((x) => x.indexOf('het ') !== 0);
    const hets = c.parts.filter((x) => x.indexOf('het ') === 0);
    const key = (visuals.length ? visuals.join(' ') : 'Normal') + (hets.length ? ' ' + hets.join(' ') : '');
    merged[key] = (merged[key] || 0) + c.p;
  }

  const all = Object.keys(merged)
    .map((k) => ({ key: k, p: merged[k] }))
    .sort((a, b) => b.p - a.p);
  const top = all.slice(0, 8);
  const max = top.length ? top[0].p : 1;
  const remaining = all.length - top.length;

  return {
    outcomes: top.map((o) => ({
      label: o.key,
      pct: pct(o.p),
      bar: ((o.p / max) * 100).toFixed(1) + '%',
    })),
    moreNote:
      remaining > 0
        ? remaining +
          ' further combinations below 1 in ' +
          Math.round(1 / (top[top.length - 1].p || 1)) +
          ' are not shown.'
        : 'Combined odds across every gene set on both parents.',
  };
}

/** The chance of hitting the likeliest outcome of every active gene at once. */
export function buildChain(active, male, female) {
  const steps = active.map((g) => {
    const d = dist(male[g.name] || 0, female[g.name] || 0);
    let best = 0;
    for (let k = 1; k < 3; k++) if (d[k] > d[best]) best = k;
    return {
      name: g.name,
      p: d[best],
      pct: pct(d[best]),
      outcome: cellLabel(g, best),
      part: traitLabel(g, best),
    };
  });

  let chainP = 1;
  for (const s of steps) chainP *= s.p;

  const parts = steps.map((s) => s.part).filter(Boolean);
  const visuals = parts.filter((x) => x.indexOf('het ') !== 0);
  const hets = parts.filter((x) => x.indexOf('het ') === 0);

  return {
    steps: steps.map((s) => ({ name: s.name, outcome: s.outcome, pct: s.pct })),
    multi: steps.length > 1,
    math: steps.map((s) => s.pct).join(' × ') + ' = ' + pct(chainP),
    label: (visuals.length ? visuals.join(' ') : 'Normal') + (hets.length ? ' ' + hets.join(' ') : ''),
  };
}

/** Appearance of one egg category, for the clutch illustration. */
function eggStyle(focus, k) {
  const visual = k === 2 || (focus.type !== 'rec' && k === 1);
  const carrier = focus.type === 'rec' && k === 1;
  return {
    visual,
    carrier,
    role: visual ? 'Visual' : carrier ? 'Carrier — looks normal' : 'No copy',
    fill: visual
      ? k === 2
        ? 'var(--accent-strong)'
        : 'var(--accent-quiet)'
      : carrier
        ? 'repeating-linear-gradient(135deg, var(--accent-quiet) 0 4px, var(--panel) 4px 8px)'
        : 'var(--panel)',
    border: visual ? 'var(--accent-strong)' : carrier ? 'var(--accent)' : 'var(--rule-strong)',
    dash: carrier ? 'dashed' : 'solid',
  };
}

/** Largest-remainder apportionment: whole eggs that still sum to the clutch. */
function apportion(probabilities, total) {
  const raw = probabilities.map((p) => p * total);
  const counts = raw.map(Math.floor);
  let left = total - counts.reduce((a, b) => a + b, 0);
  const order = raw.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0]);
  for (let i = 0; left > 0; i++, left--) counts[order[i % order.length][1]]++;
  return counts;
}

/**
 * The clutch panel: expected split for `size` eggs, plus — when `seed` is set —
 * one simulated clutch where each egg rolled its own dice.
 *
 * The roll uses a seeded LCG rather than Math.random directly so that a given
 * seed always produces the same clutch; React may render more than once per
 * click, and the eggs must not reshuffle underneath the reader.
 */
export function buildClutch(focus, maleCopies, femaleCopies, size, seed) {
  const d = dist(maleCopies, femaleCopies);
  const cats = [2, 1, 0]
    .filter((k) => d[k] > 0)
    .map((k) => ({ p: d[k], label: cellLabel(focus, k), pct: pct(d[k]), ...eggStyle(focus, k) }));

  const counts = apportion(
    cats.map((c) => c.p),
    size
  );

  let rolled = null;
  if (seed != null) {
    let x = seed;
    const rnd = () => (x = (x * 1664525 + 1013904223) % 4294967296) / 4294967296;
    rolled = cats.map(() => 0);
    for (let i = 0; i < size; i++) {
      const r = rnd();
      let acc = 0;
      let pick = cats.length - 1;
      for (let j = 0; j < cats.length; j++) {
        acc += cats[j].p;
        if (r <= acc) {
          pick = j;
          break;
        }
      }
      rolled[pick]++;
    }
  }

  const build = (nums) => {
    const out = [];
    cats.forEach((c, i) => {
      for (let j = 0; j < nums[i]; j++) {
        out.push({ fill: c.fill, border: c.border, dash: c.dash, title: c.label });
      }
    });
    return out;
  };

  const surprise = rolled
    ? cats.map((c, i) => Math.abs(rolled[i] - counts[i])).reduce((a, b) => a + b, 0)
    : 0;

  return {
    n: size,
    eggs: build(counts),
    legend: cats.map((c, i) => ({ ...c, expect: '≈ ' + counts[i] + ' of ' + size })),
    rolled: rolled ? build(rolled) : null,
    rolledLegend: rolled
      ? cats.map((c, i) => ({ label: c.label, n: rolled[i], fill: c.fill, border: c.border, dash: c.dash }))
      : null,
    rolledNote: rolled
      ? surprise === 0
        ? 'Textbook. Enjoy it — this is the rarest outcome of all.'
        : surprise <= 2
          ? 'Close to the odds. Nature is being polite today.'
          : "Nothing like the odds. Nature didn't read the maths."
      : null,
  };
}
