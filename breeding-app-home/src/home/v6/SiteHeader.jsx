import React from 'react';
import { Link } from 'react-router-dom';
import { useLook } from './useLook.js';

const NAV = [
  ['#breeding', 'Breeding'],
  ['#calculator', 'Genetics'],
  ['#health', 'Health'],
  ['#lab', 'Lab'],
  ['#quarantine', 'Quarantine'],
  ['#setup', 'Settings'],
  ['#plans', 'Plans'],
  ['#appearance', 'Appearance'],
];

const STATS = [
  ['635', 'genes and morphs, curated species by species.'],
  ['21', 'species with their own care, sexing and season rules.'],
  ['1', 'record per animal — hatch, pairing, lab result, sale.'],
  ['0', 'signal required — it works offline in the reptile room.'],
];

function Masthead() {
  const { toggle, lookLabel } = useLook();

  return (
    <div className="v6-mast">
      <nav className="v6-nav">
        <Link to="/" className="v6-nav__brand">
          <img src="/serpentora-mark.png" alt="" className="v6-nav__mark" />
          <span className="v6-nav__word">Serpentora</span>
        </Link>

        <div className="v6-nav__links">
          {NAV.map(([href, label]) => (
            <a key={href} href={href}>
              {label}
            </a>
          ))}
        </div>

        <div className="v6-nav__actions">
          <button
            type="button"
            onClick={toggle}
            title="Switch appearance"
            className="v6-btn v6-btn--sm"
            style={{ background: 'transparent', padding: '10px 15px', fontSize: 11 }}
          >
            {lookLabel}
          </button>
          {/* Kept for people who already have an account: the site sells a
              waitlist, but sign-in is live and shouldn't be hidden from them. */}
          <Link to="/login" className="v6-nav__signin">
            Sign in
          </Link>
          <a href="#waitlist" className="v6-btn v6-btn--cta v6-btn--sm" style={{ fontSize: 11.5 }}>
            Join waitlist
          </a>
        </div>
      </nav>
    </div>
  );
}

function ParentCard({ variant, name, meta, swatch, chips }) {
  return (
    <div className={`v6-hero__card v6-hero__card--${variant}`}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
        <div className="v6-swatch" style={{ background: swatch }} />
        <div className="v6-stack" style={{ '--gap': '2px' }}>
          <span style={{ fontFamily: 'var(--display)', fontWeight: 'var(--dwb)', fontSize: 16.5 }}>
            {name}
          </span>
          <span className="v6-mono" style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>
            {meta}
          </span>
        </div>
      </div>
      <div className="v6-cluster" style={{ '--gap': '6px', marginTop: 13 }}>
        {chips.map(([label, on]) => (
          <span key={label} className={`v6-chip${on ? ' v6-chip--on' : ' v6-chip--quiet'}`}>
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

function Hero() {
  return (
    <section className="v6-hero">
      <span className="v6-hero__tag">
        <span className="v6-dot" />
        Early access opening in waves
      </span>

      <h1 className="v6-h1">The living system behind every clutch</h1>

      <p className="v6-lead">
        Animals, genetics, pairings, pedigrees, quarantine and lab work in one place that behaves
        like biology — connected, traceable, and honest about odds.
      </p>

      <div className="v6-cluster" style={{ '--gap': '12px', justifyContent: 'center' }}>
        <a href="#waitlist" className="v6-btn v6-btn--cta">
          Join the waitlist
        </a>
        <a href="#calculator" className="v6-btn">
          Try the calculator
        </a>
      </div>

      <div className="v6-hero__stage">
        <svg viewBox="0 0 1100 440" className="v6-hero__web" aria-hidden="true">
          <defs>
            <linearGradient id="v6-helix" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="var(--accent-strong)" stopOpacity=".1" />
              <stop offset=".5" stopColor="var(--accent-2)" stopOpacity=".9" />
              <stop offset="1" stopColor="var(--accent-strong)" stopOpacity=".15" />
            </linearGradient>
          </defs>
          <circle cx="550" cy="220" r="150" fill="var(--accent-quiet)" />
          <circle cx="550" cy="220" r="196" fill="none" stroke="var(--rule)" strokeWidth="1" />
          <circle
            cx="550"
            cy="220"
            r="240"
            fill="none"
            stroke="var(--rule)"
            strokeWidth="1"
            strokeDasharray="4 10"
          />
          <path
            d="M90 220 C 250 50, 320 390, 480 220 S 690 50, 780 220 S 950 390, 1030 220"
            fill="none"
            stroke="url(#v6-helix)"
            strokeWidth="2.6"
            strokeDasharray="14 10"
            style={{ animation: 'v6-flow 9s linear infinite' }}
          />
          <path
            d="M90 220 C 250 390, 320 50, 480 220 S 690 390, 780 220 S 950 50, 1030 220"
            fill="none"
            stroke="url(#v6-helix)"
            strokeWidth="2.6"
            strokeDasharray="14 10"
            opacity=".55"
            style={{ animation: 'v6-flow 13s linear infinite reverse' }}
          />
          <g fill="var(--accent-strong)">
            <circle cx="240" cy="140" r="5" />
            <circle cx="386" cy="292" r="4" />
            <circle cx="700" cy="140" r="5" />
            <circle cx="866" cy="300" r="4" />
          </g>
          <g fill="var(--warn)">
            <circle cx="480" cy="220" r="6" />
            <circle cx="780" cy="220" r="6" />
          </g>
        </svg>

        <img src="/serpentora-mark.png" alt="" className="v6-hero__mark" />

        <ParentCard
          variant="sire"
          name="Kova"
          meta="SIRE ♂ · 2022 · 1,410 g"
          swatch="var(--cta-bg)"
          chips={[
            ['Pastel', true],
            ['het Pied', false],
          ]}
        />
        <ParentCard
          variant="dam"
          name="Wren"
          meta="DAM ♀ · 2021 · 2,060 g"
          swatch="var(--accent-2)"
          chips={[
            ['het Pied', false],
            ['Clown', true],
          ]}
        />

        <div className="v6-hero__clutch">
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 14 }}>
            <span className="v6-mono" style={{ letterSpacing: '.16em', color: 'var(--accent)' }}>
              PROJECTED CLUTCH · 6 EGGS
            </span>
            <span className="v6-mono" style={{ color: 'var(--ink-3)' }}>
              odds, not promises
            </span>
          </div>
          <div
            style={{
              display: 'flex',
              gap: 12,
              marginTop: 16,
              alignItems: 'flex-end',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', gap: 9 }}>
              <div
                className="v6-egg"
                style={{ background: 'var(--accent-strong)', border: '1px solid var(--accent-strong)' }}
              />
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="v6-egg"
                  style={{
                    background:
                      'repeating-linear-gradient(135deg, var(--accent-quiet) 0 4px, var(--panel) 4px 8px)',
                    border: '1px dashed var(--accent)',
                  }}
                />
              ))}
              {[0, 1].map((i) => (
                <div
                  key={i}
                  className="v6-egg"
                  style={{ background: 'var(--panel)', border: '1px solid var(--rule-strong)' }}
                />
              ))}
            </div>
            <div className="v6-stack" style={{ '--gap': '7px', flex: 1, minWidth: 180 }}>
              {[
                ['Pastel Pied', '12.5%'],
                ['het Pied carriers', '50%'],
              ].map(([label, value]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15 }}>
                  <span>{label}</span>
                  <span className="v6-mono" style={{ color: 'var(--accent)' }}>
                    {value}
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

function StatsLedger() {
  return (
    <section className="v6-wrap" style={{ padding: '50px 28px' }}>
      <div className="v6-grid" style={{ '--min': '230px', '--gap': '18px' }}>
        {STATS.map(([figure, line]) => (
          <div key={figure} className="v6-panel" style={{ padding: 24 }}>
            <span className="v6-figure">{figure}</span>
            <p className="v6-copy" style={{ marginTop: 8, fontSize: 16.5, lineHeight: 1.5 }}>
              {line}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function SiteHeader() {
  return (
    <>
      <Masthead />
      <Hero />
      <StatsLedger />
    </>
  );
}
