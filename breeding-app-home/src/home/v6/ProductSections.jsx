import React from 'react';
import { LAB_CHAIN, SEASON } from './data.js';

/* Sections № 01 and № 03–06: breeding management, the advisor, the season,
 * the collection, pedigree and health, shed testing, lab and marketplace. */

function SectionHead({ eyebrow, title, aside, children }) {
  return (
    <div className="v6-sechead">
      <div className="v6-sechead__title">
        <span className="v6-eyebrow">{eyebrow}</span>
        <h2 className="v6-h2">{title}</h2>
        {children}
      </div>
      {aside && <p className="v6-sechead__aside">{aside}</p>}
    </div>
  );
}

/* Rendered before the calculator, which is § 02 and lives in its own file. */
export function Breeding() {
  return (
    <section
      id="breeding"
      className="v6-wrap v6-section v6-grid"
      style={{ '--min': '320px', '--gap': '40px', alignItems: 'center', paddingTop: 20 }}
    >
      <div className="v6-stack" style={{ '--gap': '16px' }}>
        <span className="v6-eyebrow">№ 01 · Breeding management</span>
        <h2 className="v6-h2" style={{ maxWidth: '20ch' }}>
          A season that keeps its own notes
        </h2>
        <p className="v6-copy v6-copy--lg" style={{ maxWidth: '48ch' }}>
          Pairings, introductions, locks, ovulation, shed, lay, incubation, hatch. Log it once in the
          rack and the season builds itself into a timeline anyone on your team can read.
        </p>
      </div>

      <div className="v6-panel v6-panel--lg" style={{ padding: 26 }}>
        <svg viewBox="0 0 420 200" style={{ width: '100%', height: 'auto', overflow: 'visible' }}>
          <path
            d="M10 145 C 90 145, 96 55, 160 55 S 250 145, 320 145 S 396 65, 410 65"
            fill="none"
            stroke="var(--rule-strong)"
            strokeWidth="2"
            opacity=".55"
          />
          <path
            d="M10 145 C 90 145, 96 55, 160 55 S 250 145, 250 145"
            fill="none"
            stroke="var(--accent-strong)"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <g fontFamily="DM Mono, monospace" fontSize="10" fill="var(--ink-3)">
            <circle cx="10" cy="145" r="6" fill="var(--accent-strong)" />
            <text x="0" y="170">
              PAIR
            </text>
            <circle cx="160" cy="55" r="6" fill="var(--accent-strong)" />
            <text x="140" y="40">
              LOCK
            </text>
            <circle cx="250" cy="145" r="6" fill="var(--warn)" />
            <text x="230" y="170">
              LAY
            </text>
            <circle cx="410" cy="65" r="6" fill="var(--rule-strong)" />
            <text x="374" y="50">
              HATCH
            </text>
          </g>
        </svg>
        <div className="v6-cluster" style={{ marginTop: 12 }}>
          <span className="v6-chip v6-chip--warn">Day 58 · candling due</span>
          <span className="v6-chip v6-chip--quiet" style={{ padding: '7px 12px' }}>
            31.4 °C stable
          </span>
        </div>
      </div>
    </section>
  );
}

function Advisor() {
  return (
    <section id="advisor" className="v6-wrap v6-section">
      <div className="v6-sechead">
        <div className="v6-sechead__title">
          <span className="v6-eyebrow">№ 03 · Breeding advisor</span>
          <h2 className="v6-h2">
            Anyone can tell you what a pairing makes. Serpentora tells you{' '}
            <span style={{ color: 'var(--accent)' }}>which pairing to make</span>.
          </h2>
        </div>
      </div>

      <div className="v6-grid" style={{ '--min': '320px', '--gap': '22px', alignItems: 'start' }}>
        <div className="v6-stack" style={{ '--gap': '18px' }}>
          <p className="v6-copy" style={{ fontSize: 17.5, lineHeight: 1.65 }}>
            Type the goal in plain language. Set required, optional and avoid traits, a minimum
            probability and how much each trait matters. The Advisor ranks your own animals by their
            chance of hitting it — with projected visuals, projected hets and holdback hints.
          </p>
          <div className="v6-stack" style={{ '--gap': '10px' }}>
            {[
              'Turn any suggestion into a multi-generation breeding plan',
              'Export the shortlist before the season starts',
            ].map((line, i) => (
              <div
                key={line}
                className="v6-panel"
                style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '14px 18px' }}
              >
                <span
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    background: 'var(--accent-quiet)',
                    border: '1px solid var(--accent-strong)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: 'var(--mono)',
                    fontSize: 11,
                    color: 'var(--accent)',
                    flex: 'none',
                  }}
                >
                  {i + 1}
                </span>
                <span style={{ fontSize: 16 }}>{line}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="v6-panel v6-panel--lg v6-stack" style={{ '--gap': '16px' }}>
          <span className="v6-label v6-label--tight">GOAL</span>
          <span
            style={{ fontFamily: 'var(--display)', fontWeight: 'var(--dw)', fontSize: 26, lineHeight: 1.25 }}
          >
            “clown desert ghost with pastel and possible het pied”
            <span
              style={{
                display: 'inline-block',
                width: 2,
                height: 22,
                background: 'var(--accent-strong)',
                marginLeft: 4,
                verticalAlign: -3,
              }}
            />
          </span>
          <div style={{ borderTop: '1px solid var(--rule)', paddingTop: 14 }}>
            <span className="v6-label v6-label--tight" style={{ display: 'block', marginBottom: 8 }}>
              RANKED PAIRINGS FROM YOUR COLLECTION
            </span>
            <div className="v6-rows">
              {[
                ['Kova × Wren', '6.25% · holdback ♀', 'var(--accent)', 'var(--ink)'],
                ['Anton × Wren', '3.12%', 'var(--accent)', 'var(--ink)'],
                ['Arun × Wren', 'below minimum', 'var(--ink-3)', 'var(--ink-2)'],
              ].map(([pair, odds, oddsColor, nameColor]) => (
                <div
                  key={pair}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 0',
                  }}
                >
                  <span style={{ fontSize: 16, color: nameColor }}>{pair}</span>
                  <span className="v6-mono" style={{ fontSize: 11.5, color: oddsColor }}>
                    {odds}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Season() {
  return (
    <div className="v6-band">
      <section id="season" className="v6-wrap v6-section">
        <SectionHead
          eyebrow="№ 04 · The season"
          title="One season, from the first pairing to a hatchling on the tree."
          aside="Five-month appointment schedule generated on creation. Every step you log becomes the next one’s reminder."
        />
        <div className="v6-grid" style={{ '--min': '200px' }}>
          {SEASON.map((s) => (
            <div key={s.step} className="v6-panel v6-stack" style={{ '--gap': '10px', padding: 18 }}>
              <span className="v6-label v6-label--tight v6-label--accent" style={{ letterSpacing: '.14em' }}>
                {s.step}
              </span>
              <span
                style={{ fontFamily: 'var(--display)', fontWeight: 'var(--dwb)', fontSize: 22, lineHeight: 1.05 }}
              >
                {s.title}
              </span>
              <span style={{ fontSize: 15, color: 'var(--ink-2)', lineHeight: 1.5, flex: 1 }}>{s.body}</span>
              <div className="v6-plate" style={{ aspectRatio: '3 / 4', padding: 9, fontSize: 8.5 }}>
                {s.shot}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Collection() {
  const animals = [
    ['Kova ♂', 'SRP-BP-0142 · Pastel het Pied', 'var(--cta-bg)'],
    ['Wren ♀', 'SRP-BP-0090 · Clown het Pied', 'var(--accent-2)'],
    ['Ash ♀', 'SRP-LG-0007 · Leopard gecko', 'var(--warn)'],
  ];

  return (
    <section className="v6-wrap v6-section">
      <div className="v6-split" style={{ alignItems: 'flex-end', gap: 20, marginBottom: 24 }}>
        <h2 className="v6-h2">Your animals, card by card</h2>
        <span className="v6-eyebrow" style={{ letterSpacing: '.16em' }}>
          Collection · QR rack scanning
        </span>
      </div>

      <div className="v6-grid" style={{ '--min': '220px', '--gap': '18px' }}>
        {animals.map(([name, id, swatch]) => (
          <div key={name} className="v6-panel" style={{ padding: 18 }}>
            <div
              style={{
                height: 118,
                borderRadius: 'var(--r-sm)',
                background: swatch,
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background:
                    'repeating-linear-gradient(115deg, rgba(255,255,255,.2) 0 3px, transparent 3px 11px)',
                }}
              />
            </div>
            <div className="v6-stack" style={{ '--gap': '4px', marginTop: 13 }}>
              <span style={{ fontFamily: 'var(--display)', fontWeight: 'var(--dwb)', fontSize: 18 }}>
                {name}
              </span>
              <span className="v6-mono" style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>
                {id}
              </span>
            </div>
          </div>
        ))}

        <div
          style={{
            border: '1px dashed var(--rule-strong)',
            borderRadius: 'var(--r-md)',
            padding: 18,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            minHeight: 190,
          }}
        >
          <span style={{ fontFamily: 'var(--display)', fontWeight: 'var(--dwb)', fontSize: 34 }}>+</span>
          <span style={{ fontSize: 15.5, color: 'var(--ink-2)', textAlign: 'center' }}>
            Scan a QR label to add
          </span>
        </div>
      </div>
    </section>
  );
}

function PedigreeAndHealth() {
  return (
    <section className="v6-wrap v6-section v6-grid" style={{ '--min': '320px', '--gap': '20px' }}>
      <div className="v6-panel v6-panel--lg">
        <span className="v6-eyebrow">№ 06 · Pedigree &amp; rack</span>
        <h3 className="v6-h3" style={{ margin: '10px 0 16px' }}>
          Four generations, one glance
        </h3>
        <svg viewBox="0 0 620 240" style={{ width: '100%', height: 'auto' }}>
          <g stroke="var(--rule-strong)" strokeWidth="1.6" fill="none" opacity=".7">
            <path d="M80 50 C 180 50, 200 120, 300 120" />
            <path d="M80 190 C 180 190, 200 120, 300 120" />
            <path d="M340 120 C 430 120, 450 55, 545 55" />
            <path d="M340 120 C 430 120, 450 185, 545 185" />
          </g>
          <circle cx="80" cy="50" r="26" fill="var(--accent-quiet)" stroke="var(--accent-strong)" strokeWidth="1.5" />
          <circle cx="80" cy="190" r="26" fill="var(--accent-quiet)" stroke="var(--accent-2)" strokeWidth="1.5" />
          <circle cx="320" cy="120" r="30" fill="var(--panel)" stroke="var(--warn)" strokeWidth="1.5" />
          <circle cx="545" cy="55" r="21" fill="var(--panel)" stroke="var(--rule-strong)" />
          <circle cx="545" cy="185" r="21" fill="var(--panel)" stroke="var(--rule-strong)" />
          <g fontFamily="DM Mono, monospace" fontSize="11" fill="var(--ink-2)" textAnchor="middle">
            <text x="80" y="55">♂</text>
            <text x="80" y="195">♀</text>
            <text x="320" y="125">CLUTCH</text>
            <text x="545" y="60">F1</text>
            <text x="545" y="190">F1</text>
            <text x="330" y="232" fill="var(--ink-3)">
              COI 3.1% · 2 shared ancestors
            </text>
          </g>
        </svg>
      </div>

      <div id="health" className="v6-panel v6-panel--lg v6-stack" style={{ '--gap': '14px' }}>
        <span className="v6-eyebrow">Quarantine &amp; health</span>
        <h3 className="v6-h3" style={{ fontSize: 'clamp(26px, 2.8vw, 32px)' }}>
          New arrivals, handled properly
        </h3>
        <p className="v6-copy">
          Serpentora sets the isolation clock from where the animal came from, then runs weekly
          checks and flags what needs a vet.
        </p>
        <div className="v6-rows" style={{ marginTop: 2 }}>
          {[
            ['Bred here', 'none'],
            ['Known breeder', '90 days'],
            ['Shop · expo', '120 days'],
            ['Import · wild-caught', '180 days'],
          ].map(([source, days]) => (
            <div
              key={source}
              style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '9px 0', fontSize: 15.5 }}
            >
              <span>{source}</span>
              <span className="v6-mono" style={{ color: 'var(--accent)' }}>
                {days}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ShedTesting() {
  return (
    <section id="shed" className="v6-wrap v6-section">
      <SectionHead
        eyebrow="№ 05 · Shed testing"
        title="Send the shed. Get the answer back where it belongs."
        aside="Over 40 orderable morph tests plus sex determination. A disputed het claim stops being an argument and becomes a certificate number."
      />

      <div className="v6-grid" style={{ '--min': '230px', marginBottom: 22 }}>
        {LAB_CHAIN.map((c) => (
          <div key={c.n} className="v6-panel v6-stack" style={{ '--gap': '10px', minHeight: 190 }}>
            <span
              style={{
                width: 34,
                height: 34,
                borderRadius: '50%',
                background: 'var(--accent-quiet)',
                border: '1px solid var(--accent-strong)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: 'var(--mono)',
                fontSize: 11,
                color: 'var(--accent)',
              }}
            >
              {c.n}
            </span>
            <span
              style={{ fontFamily: 'var(--display)', fontWeight: 'var(--dwb)', fontSize: 22, lineHeight: 1.08 }}
            >
              {c.title}
            </span>
            <span style={{ fontSize: 15.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>{c.body}</span>
          </div>
        ))}
      </div>

      <div className="v6-grid" style={{ '--min': '300px', '--gap': '20px', alignItems: 'center' }}>
        <div className="v6-plate" style={{ aspectRatio: '16 / 7' }}>
          Still · certificate with verification code visible, animal numbers blurred
        </div>
        <div className="v6-stack">
          <span className="v6-copy" style={{ fontSize: 16.5 }}>
            Partner labs work the queue in their own portal: intake, result entry, completed tests,
            catalog and pricing.
          </span>
          <span className="v6-copy" style={{ fontSize: 16.5 }}>
            Buyers verify a certificate by its number and code. No screenshots, no trust required.
          </span>
        </div>
      </div>
    </section>
  );
}

function LabAndMarket() {
  return (
    <section id="lab" className="v6-wrap v6-section v6-grid" style={{ '--min': '320px', '--gap': '20px' }}>
      <div className="v6-panel v6-panel--lg v6-stack" style={{ '--gap': '15px' }}>
        <span className="v6-eyebrow">Laboratory</span>
        <h3 className="v6-h3" style={{ fontSize: 'clamp(26px, 2.8vw, 32px)' }}>
          Order a test, keep the trail
        </h3>
        <p className="v6-copy">
          Sexing, pathogen screens and genetic confirmation. Request → sample → lab → result,
          attached to the animal for good.
        </p>
        <div className="v6-cluster" style={{ '--gap': '8px', alignItems: 'center' }}>
          {[
            ['Requested', 'on'],
            ['Sample', 'on'],
            ['In lab', 'quiet'],
            ['Result', 'dashed'],
          ].map(([label, kind], i, arr) => (
            <React.Fragment key={label}>
              <span
                className={`v6-chip v6-chip--${kind === 'on' ? 'on' : kind}`}
                style={{ padding: '8px 13px' }}
              >
                {label}
              </span>
              {i < arr.length - 1 && <span style={{ color: 'var(--ink-3)' }}>→</span>}
            </React.Fragment>
          ))}
        </div>
      </div>

      <div id="market" className="v6-panel v6-panel--lg v6-stack" style={{ '--gap': '15px' }}>
        <span className="v6-eyebrow">Marketplace</span>
        <h3 className="v6-h3" style={{ fontSize: 'clamp(26px, 2.8vw, 32px)' }}>
          List an animal with its whole history
        </h3>
        <div className="v6-stack" style={{ '--gap': '10px' }}>
          {[
            ['Pastel Clown male', 'Pedigree · 2 lab results attached', 'var(--cta-bg)'],
            ['het Pied female', 'Pedigree · genetic confirmation', 'var(--accent-2)'],
          ].map(([name, meta, swatch]) => (
            <div
              key={name}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                border: '1px solid var(--rule)',
                borderRadius: 'var(--r-sm)',
                padding: '13px 15px',
              }}
            >
              <div className="v6-swatch" style={{ background: swatch }} />
              <div className="v6-stack" style={{ '--gap': '2px', flex: 1 }}>
                <span style={{ fontSize: 16.5 }}>{name}</span>
                <span className="v6-mono" style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>
                  {meta}
                </span>
              </div>
              <span className="v6-mono" style={{ color: 'var(--accent)' }}>
                Verified
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export { SectionHead };

/* Everything from § 03 to the marketplace pair, in the design's own order. */
export default function ProductSections() {
  return (
    <>
      <Advisor />
      <Season />
      <Collection />
      <PedigreeAndHealth />
      <ShedTesting />
      <LabAndMarket />
    </>
  );
}
