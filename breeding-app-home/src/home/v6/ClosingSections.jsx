import React from 'react';
import { Link } from 'react-router-dom';
import { INVENTORY, PLANS } from './data.js';
import WaitlistForm from './WaitlistForm.jsx';

/* Sections № 10 and № 11, the closing call to action, and the footer. */

const BREEDER_APP = import.meta.env.VITE_BREEDER_APP_URL || 'https://app.serpentora.com';
const MARKETPLACE = import.meta.env.VITE_MARKETPLACE_URL || 'https://mp.serpentora.com';

function Plans() {
  return (
    <div className="v6-band">
      <section id="plans" className="v6-wrap v6-section">
        <div className="v6-sechead">
          <div className="v6-sechead__title">
            <span className="v6-eyebrow">№ 10 · Plans</span>
            <h2 className="v6-h2">Plans for every collection.</h2>
          </div>
          <p className="v6-sechead__aside">
            Every plan includes all features. Only your stack size differs.
            <span
              className="v6-mono"
              style={{
                display: 'block',
                marginTop: 8,
                fontSize: 10.5,
                letterSpacing: '.12em',
                textTransform: 'uppercase',
                color: 'var(--warn)',
              }}
            >
              Pricing not yet announced — waitlist locks founding rates
            </span>
          </p>
        </div>

        <div className="v6-grid" style={{ '--min': '200px', marginBottom: 26 }}>
          {PLANS.map((p) => (
            <div
              key={p.name}
              className="v6-panel v6-stack"
              style={{
                '--gap': '10px',
                minHeight: 200,
                background: p.popular ? 'var(--accent-quiet)' : 'var(--panel)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                <span
                  style={{ fontFamily: 'var(--display)', fontWeight: 'var(--dwb)', fontSize: 24, lineHeight: 1 }}
                >
                  {p.name}
                </span>
                {p.popular && (
                  <span
                    className="v6-mono"
                    style={{
                      fontSize: 8.5,
                      letterSpacing: '.12em',
                      textTransform: 'uppercase',
                      color: 'var(--accent)',
                      border: '1px solid var(--accent-strong)',
                      borderRadius: 'var(--pill)',
                      padding: '3px 8px',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Popular
                  </span>
                )}
              </div>
              <span className="v6-mono" style={{ fontSize: 13, color: 'var(--accent)' }}>
                {p.limit} animals
              </span>
              <span style={{ fontSize: 15, color: 'var(--ink-2)', lineHeight: 1.45, flex: 1 }}>{p.body}</span>
              <a
                href="#waitlist"
                className="v6-btn v6-btn--quiet"
                style={{ color: 'var(--ink)', letterSpacing: '.14em', textTransform: 'uppercase', fontSize: 10, padding: '9px 12px' }}
              >
                {p.cta}
              </a>
            </div>
          ))}
        </div>

        <span className="v6-label v6-label--tight">ALL FEATURES · EVERY TIER</span>
        <div className="v6-grid" style={{ '--min': '260px', '--gap': '0 28px', marginTop: 10 }}>
          {INVENTORY.map((i) => (
            <span
              key={i}
              style={{ fontSize: 15.5, lineHeight: 1.4, padding: '10px 0', borderBottom: '1px solid var(--rule)' }}
            >
              {i}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}

function YourData() {
  return (
    <section
      id="data"
      className="v6-wrap v6-section v6-grid"
      style={{ '--min': '300px', '--gap': '30px', alignItems: 'start' }}
    >
      <div className="v6-stack">
        <span className="v6-eyebrow">№ 11 · Your data</span>
        <h2 className="v6-h2">Your data stays yours.</h2>
      </div>
      <div className="v6-rows v6-rows--ruled">
        {[
          'Local-first — your collection works with no connection and no account.',
          'Exports to PDF, Excel, CSV and calendar files, across every record type.',
          'Manual and scheduled backups, plus a vault of named restore points you hold yourself.',
        ].map((line) => (
          <span key={line} style={{ fontSize: 18, lineHeight: 1.5, padding: '14px 0' }}>
            {line}
          </span>
        ))}
        <span className="v6-note" style={{ fontSize: 15, lineHeight: 1.55, padding: '14px 0', borderBottom: 0 }}>
          Cloud sync across your devices exists and is in daily use; local-first is the promise we
          lead with.
        </span>
      </div>
    </section>
  );
}

function Waitlist() {
  return (
    <section id="waitlist" className="v6-wrap v6-section">
      <div className="v6-waitlist">
        <div
          className="v6-glow"
          style={{ left: -120, top: -120, width: 420, height: 420, filter: 'blur(12px)', animationDuration: '24s' }}
        />
        <div
          className="v6-stack"
          style={{ '--gap': '18px', position: 'relative', alignItems: 'center' }}
        >
          <h2
            className="v6-h2"
            style={{ fontSize: 'clamp(36px, 5vw, 52px)', lineHeight: 1, letterSpacing: '-.035em', maxWidth: '22ch' }}
          >
            Get in early. Help shape it.
          </h2>
          <p className="v6-copy" style={{ fontSize: 19, lineHeight: 1.6, maxWidth: '50ch' }}>
            Serpentora is opening in waves. Join the waitlist and tell us what your season actually
            needs.
          </p>
          <WaitlistForm id="waitlist-email" />
        </div>
      </div>
    </section>
  );
}

function SiteFooter() {
  return (
    <footer className="v6-footer">
      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
        <img
          src="/serpentora-mark.png"
          alt=""
          style={{ width: 26, height: 26, objectFit: 'contain', display: 'block' }}
        />
        <span style={{ fontFamily: 'var(--display)', fontWeight: 'var(--dwb)', fontSize: 16 }}>
          Serpentora
        </span>
      </div>

      <div className="v6-cluster" style={{ '--gap': '20px' }}>
        <a href="#breeding">Breeding</a>
        <a href="#calculator">Genetics</a>
        <a href="#health">Health</a>
        <a href="#lab">Lab</a>
        <a href="#market">Marketplace</a>
        <a href="#appearance">Appearance</a>
        {/* The app and the marketplace are the only external products linked
            publicly — partner labs run their own portal and it stays unlisted. */}
        <a href={BREEDER_APP}>App</a>
        <a href={MARKETPLACE}>Marketplace listings</a>
        {/* German law requires the legal notice be findable, and "Impressum" is
            the word a German visitor scans for — so it is not translated. */}
        <Link to="/privacy">Privacy</Link>
        <Link to="/terms">Terms</Link>
        <Link to="/impressum">Impressum</Link>
      </div>

      <span className="v6-mono" style={{ color: 'var(--ink-3)' }}>
        © 2026 Serpentora · offline first
      </span>
    </footer>
  );
}

export default function ClosingSections() {
  return (
    <>
      <Plans />
      <YourData />
      <Waitlist />
      <SiteFooter />
    </>
  );
}
