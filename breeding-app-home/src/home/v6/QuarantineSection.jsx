import React from 'react';
import {
  CHECK_MAP,
  DIAGNOSTICS,
  GATES,
  Q_BOARD,
  Q_RECORD,
  SOURCE_RISK,
  TIPS,
  WEEKLY_CHECK,
} from './data.js';
import { SectionHead } from './ProductSections.jsx';

/* Section № 08 — the longest section on the page, and the one whose copy is
 * most deliberate: it states what each test cannot prove and that the app
 * records rather than diagnoses. None of that hedging is padding. */

const RISK_COLUMNS = '1fr .6fr 1.5fr';

export default function QuarantineSection() {
  return (
    <div className="v6-band">
      <section
        id="quarantine"
        className="v6-wrap v6-section v6-stack"
        style={{ '--gap': '44px' }}
      >
        <div>
          <SectionHead
            eyebrow="№ 08 · Quarantine"
            title="Quarantine, kept properly."
            aside="Where a new animal earns its way into your collection — with the clock, the checks, the tests and the separation all tracked, and none of it left to memory."
          />
          <div className="v6-grid" style={{ '--min': '300px', '--gap': '24px' }}>
            <p className="v6-copy" style={{ fontSize: 17.5, lineHeight: 1.65 }}>
              This is the one part of keeping snakes where a lapse is invisible until it is
              expensive. Miss a weekly check and nothing happens. Miss six and you find out about
              the mites when they are already in the rack. Serpentora keeps the calendar, asks the
              questions, remembers the answers, and tells you what each animal is waiting on.
            </p>
            <div className="v6-panel v6-stack" style={{ '--gap': '8px' }}>
              <span
                style={{
                  fontFamily: 'var(--display)',
                  fontWeight: 'var(--dw)',
                  fontSize: 24,
                  lineHeight: 1.25,
                  color: 'var(--accent)',
                }}
              >
                A record and a prompt. Never a rule.
              </span>
              <span className="v6-copy" style={{ fontSize: 16.5 }}>
                Nothing here blocks you from pairing, feeding, selling or moving an animal. Every
                default is a suggestion you can overwrite. The app’s job is to make sure you know.
              </span>
            </div>
          </div>
        </div>

        {/* It starts when the animal does — plus the source-risk table. */}
        <div className="v6-grid" style={{ '--min': '320px', '--gap': '24px', alignItems: 'start' }}>
          <div className="v6-stack" style={{ '--gap': '14px' }}>
            <h3 className="v6-h4">It starts when the animal does.</h3>
            <p className="v6-copy" style={{ fontSize: 16.5 }}>
              When you add an animal, tick <em>“newly acquired animal (bought, traded or
              imported)”</em>. That tags the animal, opens a quarantine record dated today, and sets
              a suggested duration — no separate setup, no second form. Tell it where the animal came
              from and the clock adjusts itself, because risk is not uniform.
            </p>
            <span className="v6-angle">
              Tick one box when the animal arrives. The clock, the checks and the paperwork start on
              their own.
            </span>
          </div>

          <div className="v6-panel v6-panel--flush">
            <div
              className="v6-label v6-label--tight"
              style={{ display: 'grid', gridTemplateColumns: RISK_COLUMNS, gap: 14, padding: '11px 18px', borderBottom: '1px solid var(--rule)' }}
            >
              <span>SOURCE</span>
              <span>SUGGESTED</span>
              <span>WHY</span>
            </div>
            {SOURCE_RISK.map((r) => (
              <div
                key={r.source}
                style={{
                  display: 'grid',
                  gridTemplateColumns: RISK_COLUMNS,
                  gap: 14,
                  padding: '10px 18px',
                  borderBottom: '1px solid var(--rule)',
                  alignItems: 'baseline',
                }}
              >
                <span style={{ fontSize: 15, lineHeight: 1.35 }}>{r.source}</span>
                <span className="v6-mono" style={{ color: 'var(--accent)' }}>
                  {r.days}
                </span>
                <span style={{ fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.4 }}>{r.why}</span>
              </div>
            ))}
            <div className="v6-foot">Every number is a starting point you can change per animal.</div>
          </div>
        </div>

        {/* The board. */}
        <div className="v6-stack" style={{ '--gap': '16px' }}>
          <div className="v6-split" style={{ gap: 16 }}>
            <h3 className="v6-h4">The board.</h3>
            <span style={{ fontSize: 15.5, color: 'var(--ink-3)' }}>
              Four numbers that tell you what today looks like.
            </span>
          </div>
          <div className="v6-grid" style={{ '--min': '180px' }}>
            {Q_BOARD.map((b) => (
              <div key={b.label} className="v6-panel v6-stack" style={{ '--gap': '6px' }}>
                <span className="v6-figure" style={{ fontSize: 44 }}>
                  {b.count}
                </span>
                <span className="v6-label v6-label--tight" style={{ textTransform: 'uppercase' }}>
                  {b.label}
                </span>
              </div>
            ))}
          </div>
          <div className="v6-grid" style={{ '--min': '300px', '--gap': '24px' }}>
            <p className="v6-copy" style={{ fontSize: 16.5 }}>
              Below the counts sits every animal, longest-running first — because the animal that has
              been shut away the longest is the one most easily forgotten. Each shows a day-of-plan
              progress bar, its source, any open findings and its weight change since intake.
            </p>
            <div className="v6-stack" style={{ '--gap': '8px' }}>
              <span className="v6-label v6-label--tight">ONE NEXT ACTION, NOT FOUR</span>
              <span className="v6-copy" style={{ fontSize: 16.5 }}>
                Each animal shows the single item that matters most: an outstanding test result
                outranks a due faecal, which outranks a due weekly check.
              </span>
            </div>
          </div>
        </div>

        {/* The weekly check. */}
        <div className="v6-grid" style={{ '--min': '320px', '--gap': '24px', alignItems: 'start' }}>
          <div className="v6-panel v6-panel--flush" style={{ display: 'flex', flexDirection: 'column' }}>
            <span
              className="v6-label v6-label--tight"
              style={{ padding: '12px 18px', borderBottom: '1px solid var(--rule)' }}
            >
              OBSERVATION CHECK — WEEK 03
            </span>
            {WEEKLY_CHECK.map((c) => (
              <div
                key={c.label}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 14,
                  alignItems: 'baseline',
                  padding: '12px 18px',
                  borderBottom: '1px solid var(--rule)',
                }}
              >
                <span style={{ fontSize: 16 }}>{c.label}</span>
                <span className="v6-mono" style={{ color: 'var(--accent)' }}>
                  {c.answer}
                </span>
              </div>
            ))}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 14,
                alignItems: 'center',
                padding: '12px 18px',
                background: 'var(--panel-2)',
              }}
            >
              <span className="v6-note">Weight and note optional</span>
              <span
                style={{
                  borderRadius: 'var(--pill)',
                  background: 'var(--cta-bg)',
                  color: 'var(--cta-fg)',
                  fontFamily: 'var(--mono)',
                  fontSize: 10,
                  letterSpacing: '.14em',
                  textTransform: 'uppercase',
                  padding: '8px 14px',
                }}
              >
                Confirm
              </span>
            </div>
          </div>

          <div className="v6-stack">
            <h3 className="v6-h4">The weekly check.</h3>
            <p className="v6-copy" style={{ fontSize: 16.5 }}>
              Built to cost almost nothing when there is nothing to report — every answer
              pre-selected to “nothing to report”, plus an optional weight and note. Confirm and you
              are done. The app tracks the cadence: weekly observation checks, faecal testing from
              around week two and roughly every four weeks after.
            </p>
            <p className="v6-copy" style={{ fontSize: 16.5 }}>
              Findings behave sensibly. A flag raised on the 12th and followed by a clean check on
              the 19th closes itself. Normal states are not findings — a section that cries wolf
              every week gets ignored.
            </p>
            <span className="v6-angle">
              One tap when everything is fine — and a complete record whether it is or not.
            </span>
          </div>
        </div>

        {/* What to check, and how. */}
        <div className="v6-grid" style={{ '--min': '320px', '--gap': '24px', alignItems: 'start' }}>
          <div className="v6-stack">
            <h3 className="v6-h4">What to check, and how.</h3>
            <p className="v6-copy" style={{ fontSize: 16.5 }}>
              Every check carries a{' '}
              <strong style={{ fontWeight: 600, color: 'var(--accent)' }}>?</strong> that opens full
              guidance — what you are looking for, how to look, what normal looks like, and what is
              worth acting on — anchored to anatomical diagrams with numbered points you can tap.
            </p>
            <div className="v6-cluster" style={{ '--gap': '7px' }}>
              {CHECK_MAP.map((c) => (
                <span key={c} className="v6-chip">
                  {c}
                </span>
              ))}
            </div>
            <div className="v6-plate" style={{ aspectRatio: '16 / 9' }}>
              Still · check map — numbered anatomical points, head in profile
            </div>
          </div>

          <div className="v6-stack">
            <span className="v6-label v6-label--tight">SPECIFIC, NOT GENERIC</span>
            <div className="v6-rows v6-rows--ruled">
              {TIPS.map((t) => (
                <span key={t} style={{ fontSize: 16, lineHeight: 1.55, color: 'var(--ink-2)', padding: '12px 0' }}>
                  {t}
                </span>
              ))}
            </div>
            <span className="v6-note">
              Guidance and records only — not veterinary advice. Findings are flagged, not diagnosed.
            </span>
          </div>
        </div>

        {/* Tests and laboratories. */}
        <div className="v6-stack" style={{ '--gap': '16px' }}>
          <div className="v6-split" style={{ gap: 16 }}>
            <h3 className="v6-h4">Tests and laboratories.</h3>
            <span style={{ fontSize: 15.5, color: 'var(--ink-3)' }}>
              The vocabulary for a better conversation with your vet.
            </span>
          </div>
          <p className="v6-copy" style={{ fontSize: 16.5, maxWidth: '80ch' }}>
            Ten health diagnostics grouped by how routinely they are run. Each gives method, sample,
            turnaround, timing — and its limitation, which tells you what a result does <em>not</em>{' '}
            mean.
          </p>
          <div className="v6-grid" style={{ '--min': '260px' }}>
            {DIAGNOSTICS.map((d) => (
              <div key={d.group} className="v6-panel v6-stack" style={{ '--gap': '12px' }}>
                <span
                  className="v6-label v6-label--accent"
                  style={{ fontSize: 10, letterSpacing: '.16em' }}
                >
                  {d.group}
                </span>
                <div className="v6-stack" style={{ '--gap': '6px' }}>
                  {d.tests.map((t) => (
                    <span key={t} style={{ fontSize: 16, lineHeight: 1.35 }}>
                      {t}
                    </span>
                  ))}
                </div>
                <span
                  className="v6-note"
                  style={{ borderTop: '1px solid var(--rule)', paddingTop: 10 }}
                >
                  {d.limit}
                </span>
              </div>
            ))}
          </div>
          <span className="v6-note" style={{ maxWidth: '80ch' }}>
            Alongside it, six laboratories known to run reptile diagnostics across the US, Canada,
            Germany, the EU and UK. Deliberately unpriced, not exhaustive, and not an endorsement.
            These are health diagnostics ordered through a vet — not the orderable genetic shed tests
            in № 05.
          </span>
        </div>

        {/* Real separation. */}
        <div className="v6-grid" style={{ '--min': '320px', '--gap': '24px', alignItems: 'start' }}>
          <div className="v6-stack">
            <h3 className="v6-h4">Real separation, actually checked.</h3>
            <p className="v6-copy" style={{ fontSize: 16.5 }}>
              Quarantine is only quarantine if the animal is somewhere else. The app knows which rack
              every animal sits in, so it checks: are your quarantined animals actually in the
              quarantine room? It reports, and offers a one-tap move — it never moves an animal on
              its own.
            </p>
            <span className="v6-angle">
              The app knows where every animal lives — so it can tell you when “quarantined” is only
              true on paper.
            </span>
          </div>
          <div className="v6-panel v6-stack" style={{ '--gap': '10px' }}>
            <span className="v6-label v6-label--tight">HOUSING CHECK</span>
            <span
              style={{ fontFamily: 'var(--display)', fontWeight: 'var(--dwb)', fontSize: 28, lineHeight: 1.1 }}
            >
              4 of 6 in the quarantine room
            </span>
            <span style={{ fontSize: 15.5, color: 'var(--warn)', lineHeight: 1.5 }}>
              Two animals are still in Rack B, alongside the collection. Move to a free tub?
            </span>
          </div>
        </div>

        {/* The full record, and clearance. */}
        <div className="v6-grid" style={{ '--min': '320px', '--gap': '24px', alignItems: 'start' }}>
          <div className="v6-stack">
            <h3 className="v6-h4">The full record.</h3>
            <div className="v6-rows v6-rows--ruled">
              {Q_RECORD.map((r) => (
                <div
                  key={r.name}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '.6fr 1.4fr',
                    gap: 16,
                    padding: '11px 0',
                    alignItems: 'baseline',
                  }}
                >
                  <span
                    className="v6-mono"
                    style={{ fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase' }}
                  >
                    {r.name}
                  </span>
                  <span style={{ fontSize: 15.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>{r.body}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="v6-stack">
            <h3 className="v6-h4">Clearance. Six gates — it reports, never blocks.</h3>
            <div className="v6-panel v6-panel--flush">
              {GATES.map((g) => (
                <div
                  key={g.label}
                  style={{
                    display: 'flex',
                    gap: 12,
                    alignItems: 'baseline',
                    padding: '11px 18px',
                    borderBottom: '1px solid var(--rule)',
                  }}
                >
                  <span className="v6-mono" style={{ color: g.color, flex: 'none' }}>
                    {g.mark}
                  </span>
                  <span style={{ fontSize: 15.5, lineHeight: 1.4, flex: 1 }}>{g.label}</span>
                  <span style={{ fontSize: 14, color: g.color, lineHeight: 1.4, textAlign: 'right' }}>
                    {g.reason}
                  </span>
                </div>
              ))}
              <div className="v6-foot">
                Clear it anyway and the app records what you overrode instead of arguing with you.
              </div>
            </div>
          </div>
        </div>

        {/* The notice you cannot switch off. */}
        <div
          className="v6-panel v6-panel--lg v6-panel--deep v6-grid"
          style={{ '--min': '300px', '--gap': '24px', alignItems: 'start' }}
        >
          <div className="v6-stack" style={{ '--gap': '10px' }}>
            <span className="v6-label v6-label--tight v6-label--accent">
              THE NOTICE YOU CANNOT SWITCH OFF
            </span>
            <span
              style={{ fontFamily: 'var(--display)', fontWeight: 'var(--dwb)', fontSize: 26, lineHeight: 1.15 }}
            >
              It will tell you what you are looking at. It will never pretend to tell you what it
              means.
            </span>
          </div>
          <div className="v6-stack">
            <span className="v6-copy" style={{ fontSize: 16.5 }}>
              “Quarantine records what you see. One sign can have several very different causes, and
              the obvious answer might be the wrong one. If something concerning shows up, seek a
              veterinarian who specialises in reptiles.” It appears the first time you quarantine an
              animal and at unpredictable intervals after. It cannot be turned off — only spaced out.
            </span>
            <span
              className="v6-mono"
              style={{
                fontSize: 10,
                letterSpacing: '.12em',
                textTransform: 'uppercase',
                color: 'var(--accent)',
                lineHeight: 1.7,
              }}
            >
              Records and prompts only · not veterinary advice · findings flagged, not diagnosed
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
