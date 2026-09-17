import React, { useMemo, useState } from 'react';
import { GENES, TAGS } from './data.js';
import {
  activeGenes,
  buildChain,
  buildClutch,
  buildCombined,
  buildExplain,
  buildPerGene,
  summarise,
} from './genetics.js';

/* Section № 02 — the one genuinely interactive system on the page.
 *
 * Each gene is a tri-state chip per parent: click cycles none → het/visual →
 * visual/super. Everything below the chips is derived, so there is no state to
 * keep in sync beyond the two selections and the display toggles. */

const CHIP_STATES = [
  { background: 'transparent', borderColor: 'var(--rule-strong)', color: 'var(--ink-2)' },
  { background: 'var(--accent-quiet)', borderColor: 'var(--accent-strong)', color: 'var(--accent)' },
  { background: 'var(--accent-strong)', borderColor: 'var(--accent-strong)', color: 'var(--on-accent)' },
];

const TYPE_HINT = { rec: 'Recessive', inc: 'Incomplete dominant', dom: 'Dominant' };

function GeneChips({ side, selections, onCycle }) {
  return (
    <div className="v6-cluster" style={{ '--gap': '7px' }}>
      {GENES.map((gene) => {
        const copies = selections[gene.name] || 0;
        return (
          <button
            key={gene.name}
            type="button"
            className="v6-gene"
            title={TYPE_HINT[gene.type]}
            aria-label={`${gene.name}, ${side}: ${TAGS[gene.type][copies] || 'not set'}`}
            style={{ border: '1px solid', ...CHIP_STATES[copies] }}
            onClick={() => onCycle(gene.name)}
          >
            <span>{gene.name}</span>
            <span className="v6-gene__tag">{TAGS[gene.type][copies]}</span>
          </button>
        );
      })}
    </div>
  );
}

function OutcomeBar({ label, pct, bar }) {
  return (
    <div className="v6-stack" style={{ '--gap': '5px' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 16, lineHeight: 1.25 }}>{label}</span>
        <span className="v6-mono" style={{ fontSize: 11.5, color: 'var(--accent)', flex: 'none' }}>
          {pct}
        </span>
      </div>
      <div className="v6-bar">
        <span style={{ width: bar }} />
      </div>
    </div>
  );
}

function Gametes({ title, line, gametes }) {
  return (
    <div className="v6-stack" style={{ '--gap': '10px', padding: '16px 18px' }}>
      <span className="v6-label">{title}</span>
      <span style={{ fontSize: 15.5, color: 'var(--ink-2)' }}>{line}</span>
      <div className="v6-cluster" style={{ '--gap': '8px' }}>
        {gametes.map((x, i) => (
          <div key={`${x.a.sym}-${i}`} className="v6-gamete">
            <span className="v6-mono" style={{ fontSize: 13, color: 'var(--accent)' }}>
              {x.a.sym}
            </span>
            <span style={{ fontSize: 14.5, color: 'var(--ink-2)' }}>{x.a.name}</span>
            <span className="v6-mono">{x.pct}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PunnettSquare({ explain }) {
  return (
    <div className="v6-stack" style={{ '--gap': '10px', padding: '16px 18px' }}>
      <span className="v6-label">EVERY COMBINATION</span>
      <div style={{ display: 'grid', gridTemplateColumns: '26px 1fr', gap: 6 }}>
        <div />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {explain.colHeads.map((h, i) => (
            <span
              key={`col-${i}`}
              className="v6-mono"
              style={{ color: 'var(--accent)', textAlign: 'center' }}
            >
              {h}
            </span>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateRows: '1fr 1fr', gap: 6 }}>
          {explain.rowHeads.map((h, i) => (
            <span
              key={`row-${i}`}
              className="v6-mono"
              style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center' }}
            >
              {h}
            </span>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {explain.cells.map((c, i) => (
            <div key={`cell-${i}`} className="v6-square__cell" style={{ background: c.bg }}>
              <span className="v6-mono" style={{ fontSize: 11.5, color: 'var(--ink-2)' }}>
                {c.geno}
              </span>
              <span style={{ fontSize: 15, lineHeight: 1.25 }}>{c.trait}</span>
            </div>
          ))}
        </div>
      </div>
      <span className="v6-note" style={{ fontSize: 14 }}>
        {explain.legend}
      </span>
    </div>
  );
}

function Egg({ egg, size = 'v6-egg--sm', title }) {
  return (
    <div
      className={`v6-egg ${size}`}
      title={title ?? egg.title}
      style={{ border: `1.5px ${egg.dash} ${egg.border}`, background: egg.fill }}
    />
  );
}

function ClutchPanel({ clutch, eggs, setEggs, roll }) {
  return (
    <div className="v6-stack" style={{ '--gap': '14px' }}>
      <span className="v6-label">STEP 3 — YOUR CLUTCH, EGG BY EGG</span>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 16,
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div className="v6-cluster" style={{ '--gap': '12px', alignItems: 'center' }}>
          <span className="v6-label v6-label--tight" style={{ color: 'var(--ink-2)' }}>
            EGGS LAID
          </span>
          <div className="v6-stepper">
            <button type="button" aria-label="One egg fewer" onClick={() => setEggs(-1)}>
              −
            </button>
            <span className="v6-stepper__value">{clutch.n}</span>
            <button type="button" aria-label="One egg more" onClick={() => setEggs(1)}>
              +
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={roll}
          className="v6-btn v6-btn--cta"
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 10.5,
            letterSpacing: '.14em',
            textTransform: 'uppercase',
            padding: '11px 16px',
          }}
        >
          Hatch an imaginary clutch
        </button>
      </div>

      <div
        className="v6-grid"
        style={{
          '--min': '290px',
          '--gap': '0px',
          border: '1px solid var(--rule)',
          borderRadius: 'var(--r-md)',
          background: 'var(--panel)',
          overflow: 'hidden',
        }}
      >
        <div className="v6-stack" style={{ '--gap': '14px', padding: 18 }}>
          <span className="v6-label v6-label--tight" style={{ color: 'var(--ink-2)' }}>
            WHAT THE ODDS SAY
          </span>
          <div className="v6-cluster" style={{ '--gap': '9px' }}>
            {clutch.eggs.map((egg, i) => (
              <Egg key={`odds-${i}`} egg={egg} />
            ))}
          </div>
          <div className="v6-rows v6-rows--ruled" style={{ borderTop: '1px solid var(--rule)' }}>
            {clutch.legend.map((l) => (
              <div key={l.label} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '9px 0' }}>
                <Egg egg={l} size="v6-egg--xs" title={l.label} />
                <div className="v6-stack" style={{ '--gap': '1px', flex: 1 }}>
                  <span style={{ fontSize: 16, lineHeight: 1.2 }}>{l.label}</span>
                  <span
                    className="v6-mono"
                    style={{
                      fontSize: 9.5,
                      letterSpacing: '.1em',
                      textTransform: 'uppercase',
                      color: 'var(--ink-2)',
                    }}
                  >
                    {l.role}
                  </span>
                </div>
                <div
                  className="v6-stack"
                  style={{ '--gap': '1px', alignItems: 'flex-end', flex: 'none' }}
                >
                  <span className="v6-mono" style={{ fontSize: 11.5, color: 'var(--accent)' }}>
                    {l.pct}
                  </span>
                  <span className="v6-mono" style={{ fontSize: 10, color: 'var(--ink-2)' }}>
                    {l.expect}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div
          className="v6-stack"
          style={{ '--gap': '14px', padding: 18, borderTop: '1px solid var(--rule)' }}
        >
          <span className="v6-label v6-label--tight" style={{ color: 'var(--ink-2)' }}>
            WHAT NATURE ACTUALLY DID
          </span>
          {clutch.rolled ? (
            <div className="v6-stack" style={{ '--gap': '14px' }}>
              <div className="v6-cluster" style={{ '--gap': '9px' }}>
                {clutch.rolled.map((egg, i) => (
                  <Egg key={`rolled-${i}`} egg={egg} />
                ))}
              </div>
              <div className="v6-cluster" style={{ '--gap': '8px' }}>
                {clutch.rolledLegend.map((r) => (
                  <div
                    key={r.label}
                    style={{
                      border: '1px solid var(--rule-strong)',
                      borderRadius: 'var(--pill)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 11px',
                    }}
                  >
                    <Egg egg={r} size="v6-egg--xxs" title={r.label} />
                    <span className="v6-mono">{r.n}×</span>
                    <span style={{ fontSize: 14.5, color: 'var(--ink-2)' }}>{r.label}</span>
                  </div>
                ))}
              </div>
              <p className="v6-copy" style={{ fontSize: 16, maxWidth: '46ch' }}>
                {clutch.rolledNote}
              </p>
              <button
                type="button"
                onClick={roll}
                className="v6-btn v6-btn--quiet"
                style={{ alignSelf: 'flex-start', color: 'var(--accent)', letterSpacing: '.14em', textTransform: 'uppercase', fontSize: 10 }}
              >
                Lay another clutch
              </button>
            </div>
          ) : (
            <div className="v6-stack" style={{ '--gap': '12px' }}>
              <div className="v6-cluster" style={{ '--gap': '9px', opacity: 0.45 }}>
                {clutch.eggs.map((_, i) => (
                  <div
                    key={`ghost-${i}`}
                    className="v6-egg v6-egg--sm"
                    style={{ border: '1.5px dashed var(--rule-strong)' }}
                  />
                ))}
              </div>
              <p className="v6-copy" style={{ fontSize: 16, maxWidth: '46ch' }}>
                Press <em>hatch an imaginary clutch</em> and every egg rolls its own dice. Do it a
                few times: the odds hold across hundreds of clutches, not across your one incubator.
              </p>
            </div>
          )}
        </div>
      </div>

      <p className="v6-copy" style={{ fontSize: 16.5, maxWidth: '74ch' }}>
        A 25% result does not mean one egg in four. Each egg rolls independently — four eggs can come
        out four visuals, or none at all, and the maths shrugs and says <em>yes, that was allowed</em>.
      </p>
    </div>
  );
}

export default function Calculator() {
  const [male, setMale] = useState({});
  const [female, setFemale] = useState({});
  const [explainOpen, setExplainOpen] = useState(false);
  const [focusName, setFocusName] = useState(null);
  const [eggs, setEggs] = useState(6);
  const [roll, setRoll] = useState(null);

  const cycle = (side, setSide) => (name) => {
    setSide((current) => {
      const next = { ...current };
      next[name] = ((next[name] || 0) + 1) % 3;
      if (!next[name]) delete next[name];
      return next;
    });
    // A changed pairing invalidates the clutch that was rolled for the old one.
    setRoll(null);
  };

  const model = useMemo(() => {
    const active = activeGenes(GENES, male, female);
    const demo = active.length === 0;

    // With nothing selected the worked example still has something to teach, so
    // it falls back to het Pied × het Pied and says that it is doing so.
    const focus = demo
      ? GENES[0]
      : active.find((g) => g.name === focusName) || active[0];
    const maleCopies = demo ? 1 : male[focus.name] || 0;
    const femaleCopies = demo ? 1 : female[focus.name] || 0;

    return {
      active,
      demo,
      perGene: buildPerGene(active, male, female),
      ...buildCombined(active, male, female),
      chain: buildChain(active, male, female),
      explain: buildExplain(focus, maleCopies, femaleCopies),
      clutch: buildClutch(focus, maleCopies, femaleCopies, eggs, roll),
      warnings: active.filter((g) => g.warn).map((g) => g.warn),
      maleSummary: summarise(male, GENES),
      femaleSummary: summarise(female, GENES),
    };
  }, [male, female, focusName, eggs, roll]);

  const hasResults = model.active.length > 0;

  return (
    <section id="calculator" className="v6-wrap v6-section">
      <div className="v6-stack" style={{ '--gap': '14px', marginBottom: 24, maxWidth: '60ch' }}>
        <span className="v6-eyebrow">№ 02 · Genetics &amp; calculator</span>
        <h2 className="v6-h2">Every outcome, and the reason for it</h2>
        <p className="v6-copy v6-copy--lg">
          Tap a gene once for het or single-gene, twice for visual or super. Recessives, dominants,
          incomplete dominants, complexes and supers — with wobble, kinking and lethal-super flags.
        </p>
      </div>

      <div className="v6-calc">
        <div className="v6-calc__cols">
          <div className="v6-calc__col">
            <div className="v6-calc__head">
              <span className="v6-label v6-label--ink">SIRE ♂</span>
              <span className="v6-calc__summary">{model.maleSummary}</span>
            </div>
            <GeneChips side="sire" selections={male} onCycle={cycle('m', setMale)} />
          </div>

          <div className="v6-calc__col">
            <div className="v6-calc__head">
              <span className="v6-label v6-label--ink">DAM ♀</span>
              <span className="v6-calc__summary">{model.femaleSummary}</span>
            </div>
            <GeneChips side="dam" selections={female} onCycle={cycle('f', setFemale)} />
            <div className="v6-cluster" style={{ '--gap': '8px', marginTop: 'auto' }}>
              <button
                type="button"
                className="v6-btn v6-btn--quiet"
                onClick={() => {
                  setMale({ Pastel: 1, Pied: 1 });
                  setFemale({ Clown: 2, Pied: 1 });
                  setRoll(null);
                }}
              >
                Load example
              </button>
              <button
                type="button"
                className="v6-btn v6-btn--quiet"
                onClick={() => {
                  setMale({});
                  setFemale({});
                  setRoll(null);
                }}
              >
                Clear
              </button>
            </div>
          </div>

          <div
            className="v6-calc__col"
            style={{ background: 'var(--panel-2)' }}
          >
            <span
              className="v6-label v6-label--ink"
              style={{ borderBottom: '1px solid var(--rule)', paddingBottom: 9 }}
            >
              PROJECTED CLUTCH
            </span>

            {hasResults ? (
              <>
                <div className="v6-stack" style={{ '--gap': '9px' }}>
                  {model.outcomes.map((o) => (
                    <OutcomeBar key={o.label} {...o} />
                  ))}
                </div>
                <span className="v6-note">{model.moreNote}</span>
              </>
            ) : (
              <span style={{ fontSize: 17, color: 'var(--ink-2)', lineHeight: 1.55 }}>
                Set genes on either parent to see per-gene odds, combined odds, projected visuals and
                projected hets.
              </span>
            )}

            {model.warnings.length > 0 && (
              <div
                className="v6-stack"
                style={{ '--gap': '8px', borderTop: '1px solid var(--rule)', paddingTop: 12 }}
              >
                {model.warnings.map((w) => (
                  <div
                    key={w}
                    style={{
                      display: 'flex',
                      gap: 10,
                      alignItems: 'flex-start',
                      fontSize: 15,
                      color: 'var(--warn)',
                      lineHeight: 1.45,
                    }}
                  >
                    <span className="v6-mono" style={{ flex: 'none', paddingTop: 2 }}>
                      !
                    </span>
                    <span>{w}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {hasResults && (
          <div className="v6-calc__block">
            <span className="v6-label">PER GENE</span>
            <div className="v6-grid" style={{ '--min': '230px', '--gap': '12px' }}>
              {model.perGene.map((p) => (
                <div key={p.name} className="v6-pergene">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                    <span
                      style={{
                        fontFamily: 'var(--display)',
                        fontWeight: 'var(--dw)',
                        fontSize: 21,
                        lineHeight: 1,
                      }}
                    >
                      {p.name}
                    </span>
                    <span
                      className="v6-mono"
                      style={{
                        fontSize: 9.5,
                        letterSpacing: '.1em',
                        textTransform: 'uppercase',
                        color: 'var(--ink-3)',
                      }}
                    >
                      {p.type}
                    </span>
                  </div>
                  {p.rows.map((r) => (
                    <div
                      key={r.label}
                      style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 15.5, color: 'var(--ink-2)' }}
                    >
                      <span>{r.label}</span>
                      <span className="v6-mono" style={{ color: 'var(--ink)' }}>
                        {r.pct}
                      </span>
                    </div>
                  ))}
                  {p.note && (
                    <span className="v6-note" style={{ fontSize: 14, lineHeight: 1.45 }}>
                      {p.note}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ borderTop: '1px solid var(--rule)' }}>
          <button
            type="button"
            className="v6-explain__toggle"
            aria-expanded={explainOpen}
            onClick={() => setExplainOpen((v) => !v)}
          >
            <span>How is this calculated?</span>
            <span style={{ fontSize: 16, color: 'var(--accent)' }}>{explainOpen ? '−' : '+'}</span>
          </button>

          {explainOpen && (
            <div className="v6-explain">
              <div className="v6-stack" style={{ '--gap': '10px', maxWidth: '74ch' }}>
                {model.demo && (
                  <span
                    className="v6-mono"
                    style={{ fontSize: 10.5, letterSpacing: '.14em', color: 'var(--accent)' }}
                  >
                    WORKED EXAMPLE — HET PIED × HET PIED. SET GENES ABOVE FOR YOUR OWN PAIRING.
                  </span>
                )}
                <p className="v6-copy" style={{ fontSize: 17, lineHeight: 1.55 }}>
                  Each hatchling gets one copy of every gene from the sire and one from the dam.
                  Serpentora lists what each parent can pass on, combines every possibility, and
                  counts how often each result appears.
                </p>
              </div>

              {model.active.length > 1 && (
                <div className="v6-stack" style={{ '--gap': '9px' }}>
                  <span className="v6-label">STEP 1 — ONE GENE AT A TIME</span>
                  <div className="v6-cluster" style={{ '--gap': '6px' }}>
                    {model.active.map((g) => {
                      const on = model.explain.gene === g.name;
                      return (
                        <button
                          key={g.name}
                          type="button"
                          aria-pressed={on}
                          className="v6-chip"
                          style={{ cursor: 'pointer', ...CHIP_STATES[on ? 2 : 0] }}
                          onClick={() => setFocusName(g.name)}
                        >
                          {g.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="v6-square">
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 10,
                    alignItems: 'baseline',
                    justifyContent: 'space-between',
                    padding: '15px 18px',
                    borderBottom: '1px solid var(--rule)',
                  }}
                >
                  <span
                    style={{ fontFamily: 'var(--display)', fontWeight: 'var(--dw)', fontSize: 26, lineHeight: 1 }}
                  >
                    {model.explain.gene}
                  </span>
                  <span className="v6-mono" style={{ fontSize: 10.5, color: 'var(--accent)' }}>
                    {model.explain.kind}
                  </span>
                </div>

                <div className="v6-grid v6-rows--ruled" style={{ '--min': '250px', '--gap': '0px' }}>
                  <div style={{ borderBottom: '1px solid var(--rule)' }}>
                    <Gametes
                      title="SIRE ♂ CAN PASS"
                      line={model.explain.sireLine}
                      gametes={model.explain.sireGametes}
                    />
                  </div>
                  <div style={{ borderBottom: '1px solid var(--rule)' }}>
                    <Gametes
                      title="DAM ♀ CAN PASS"
                      line={model.explain.damLine}
                      gametes={model.explain.damGametes}
                    />
                  </div>
                </div>

                <div className="v6-grid" style={{ '--min': '260px', '--gap': '0px' }}>
                  <PunnettSquare explain={model.explain} />
                  <div className="v6-stack" style={{ '--gap': '10px', padding: '16px 18px' }}>
                    <span className="v6-label">WHICH GIVES</span>
                    {model.explain.rows.map((r) => (
                      <div
                        key={r.label}
                        className="v6-stack"
                        style={{ '--gap': '5px', padding: '9px 0', borderBottom: '1px solid var(--rule)' }}
                      >
                        <OutcomeBar {...r} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {model.chain.multi && (
                <div className="v6-stack" style={{ '--gap': '11px' }}>
                  <span className="v6-label">STEP 2 — GENES COMBINE</span>
                  <p className="v6-copy" style={{ fontSize: 16, lineHeight: 1.55, maxWidth: '74ch' }}>
                    Each gene is inherited independently, so Serpentora works out each on its own,
                    then multiplies the chances together.
                  </p>
                  <div className="v6-cluster" style={{ '--gap': '10px' }}>
                    {model.chain.steps.map((s) => (
                      <div
                        key={s.name}
                        className="v6-stack"
                        style={{
                          '--gap': '4px',
                          border: '1px solid var(--rule)',
                          borderRadius: 'var(--r-sm)',
                          padding: '12px 16px',
                          minWidth: 170,
                        }}
                      >
                        <span className="v6-label v6-label--tight">{s.name}</span>
                        <span style={{ fontSize: 16, lineHeight: 1.25 }}>{s.outcome}</span>
                        <span className="v6-mono" style={{ fontSize: 12, color: 'var(--accent)' }}>
                          {s.pct}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div
                    style={{
                      border: '1px solid var(--rule-strong)',
                      borderRadius: 'var(--r-sm)',
                      padding: '13px 16px',
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 10,
                      alignItems: 'baseline',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span className="v6-mono" style={{ fontSize: 12, color: 'var(--ink-2)' }}>
                      {model.chain.math}
                    </span>
                    <span style={{ fontSize: 16.5 }}>{model.chain.label}</span>
                  </div>
                </div>
              )}

              <ClutchPanel
                clutch={model.clutch}
                eggs={eggs}
                setEggs={(delta) => {
                  setEggs((n) => Math.min(24, Math.max(1, n + delta)));
                  setRoll(null);
                }}
                roll={() => setRoll(Math.floor(Math.random() * 4294967296))}
              />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
