import React from 'react';
import { Link } from 'react-router-dom';

//  Feature cards (data-cell color palette)
const FEATURES = [
  { bg: '#d0e8e5', border: '#a8ccc8', iconBg: '#5e9a96', tc: '#1c3a38', dc: '#2a5450', icon: 'ti-paw',           title: 'Animal management',    desc: 'Full records -- genetics, health logs, feeding, weight, photos, and QR labels for every animal.' },
  { bg: '#d8eadc', border: '#aed0b4', iconBg: '#6a9e7a', tc: '#1c3824', dc: '#2a5238', icon: 'ti-dna-2',         title: 'Genetics calculator',   desc: 'Predict morph outcomes, het probabilities, BEL complex, and multi-generation pairings.' },
  { bg: '#f0ddd6', border: '#d4b4a4', iconBg: '#c09080', tc: '#3c1c10', dc: '#5a3020', icon: 'ti-heart',         title: 'Breeding records',      desc: 'Pairings, ovulation, egg incubation, clutch management, and hatchling tracking.' },
  { bg: '#f5edcc', border: '#e0d090', iconBg: '#c8a840', tc: '#3c2c08', dc: '#5a4010', icon: 'ti-flask',         title: 'Shed testing & lab',    desc: 'Order genetic tests, track samples, receive certified results, and auto-update genetics.' },
  { bg: '#ecddd4', border: '#d0b4a0', iconBg: '#b07868', tc: '#2c1008', dc: '#4a2818', icon: 'ti-building-store',title: 'Marketplace',           desc: 'List animals, manage your store, contact sellers, and export directly to MorphMarket.' },
  { bg: '#e8dff8', border: '#c8b4ec', iconBg: '#9b65d6', tc: '#2c0c60', dc: '#4a2480', icon: 'ti-robot',         title: 'AI tools',              desc: 'Breeding advisor, health summaries, AI sales copy, and Telegram real-time alerts.' },
];

//  Steps 
const STEPS = [
  { bg: '#f5edcc', border: '#e0d090', numBg: '#c8a840', numColor: '#1c1c1a', tc: '#3c2c08', dc: '#5a4010', n: '1', title: 'Create your account',  desc: 'Sign up free. Set up your keeper profile in under 2 minutes.' },
  { bg: '#fbd5d5', border: '#e8a8a8', numBg: '#d86060', numColor: '#fff',    tc: '#4c1010', dc: '#6a2020', n: '2', title: 'Add your collection',   desc: 'Log animals manually or in bulk. Record genetics, health history, and photos.' },
  { bg: '#e8dff8', border: '#c8b4ec', numBg: '#9b65d6', numColor: '#fff',    tc: '#2c0c60', dc: '#4a2480', n: '3', title: 'Plan, breed, and sell', desc: 'Use the genetics calculator, order lab tests, track the season, and list on the marketplace.' },
];

export default function HomePage() {
  return (
    <>
      {/*  HERO  */}
      <section className="section section-soft">
        <div className="container" style={{ textAlign: 'center' }}>
          <div className="badge-gold" style={{ marginBottom: '1.25rem' }}>
            <i className="ti ti-sparkles" style={{ fontSize: 13 }} aria-hidden="true" />
            The complete platform for reptile breeders
          </div>

          <h1 style={{
            fontSize: 'clamp(24px, 5vw, 34px)', fontWeight: 500, lineHeight: 1.25,
            maxWidth: 520, margin: '0 auto .875rem', color: 'var(--dark)',
          }}>
            Manage your collection with{' '}
            <span style={{ background: 'var(--gold-lt)', color: 'var(--gold-dk)', padding: '1px 8px', borderRadius: 6 }}>
              genetics-first
            </span>{' '}
            precision
          </h1>
          <p style={{ fontSize: 15, color: 'var(--muted)', maxWidth: 440, margin: '0 auto 1.75rem', lineHeight: 1.7 }}>
            Track animals, predict morphs, order lab tests, and sell on the marketplace -- all in one place.
          </p>

          {/* Feature pills using genetics-tag colors */}
          <div className="hero-pills" style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginBottom: '1.75rem' }}>
            {[
              ['var(--coral-lt)',  'var(--coral-dk)',  'ti-paw',            'Animals'],
              ['var(--purple-lt)', 'var(--purple-dk)', 'ti-dna-2',          'Genetics'],
              ['var(--coral-lt)',  'var(--coral-dk)',  'ti-heart',          'Breeding'],
              ['var(--gold-lt)',   'var(--gold-dk)',   'ti-flask',          'Lab testing'],
              ['var(--purple-lt)', 'var(--purple-dk)', 'ti-building-store', 'Marketplace'],
              ['var(--gold-lt)',   'var(--gold-dk)',   'ti-robot',          'AI tools'],
            ].map(([bg, color, icon, label]) => (
              <span key={label} className="pill" style={{ background: bg, color }}>
                <i className={`ti ${icon}`} style={{ fontSize: 12 }} aria-hidden="true" />
                {label}
              </span>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginBottom: '2.75rem' }}>
            <Link to="/register" className="btn btn-primary btn-lg">Start for free</Link>
            <Link to="/pricing"  className="btn btn-outline btn-lg">See pricing</Link>
          </div>

          {/* App preview -- actual screenshot */}
          <div className="app-preview">
            <div className="browser-bar">
              <div className="browser-dot" style={{ background: '#ef4444' }} />
              <div className="browser-dot" style={{ background: '#f59e0b' }} />
              <div className="browser-dot" style={{ background: '#22c55e' }} />
              <div className="browser-url">app.breedingplanner.com</div>
            </div>
            <img
              src="/screenshot.jpeg"
              alt="Breeding Planner app screenshot"
              style={{ width: '100%', display: 'block', borderRadius: '0 0 10px 10px' }}
            />
          </div>
        </div>
      </section>

      {/*  STATS  */}
      <section className="section-dark" style={{ padding: '1.5rem' }}>
        <div className="container">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', textAlign: 'center', gap: '1rem' }}>
            {[['500+', 'morph genetics built in'], ['7 plans', 'from free to enterprise'], ['Web  iOS  Android', 'all platforms included']].map(([v, l]) => (
              <div key={l}>
                <div style={{ fontSize: 20, fontWeight: 500, color: 'var(--gold)' }}>{v}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>{l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/*  FEATURES  */}
      <section className="section section-soft">
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
            <div className="section-label">Platform features</div>
            <h2 className="section-title">Everything a breeder needs</h2>
            <p className="section-sub">Records, genetics, lab testing, and sales -- one platform.</p>
          </div>
          <div className="grid-auto">
            {FEATURES.map(f => (
              <div key={f.title} className="feat-card" style={{ background: f.bg, borderColor: f.border }}>
                <div className="feat-icon" style={{ background: f.iconBg }}>
                  <i className={`ti ${f.icon}`} aria-hidden="true" />
                </div>
                <div className="feat-title" style={{ color: f.tc }}>{f.title}</div>
                <div className="feat-desc"  style={{ color: f.dc }}>{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/*  HOW IT WORKS  */}
      <section className="section" style={{ background: '#fff', borderTop: '1px solid var(--border)' }}>
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
            <div className="section-label">How it works</div>
            <h2 className="section-title">Up and running in minutes</h2>
          </div>
          <div className="grid-3">
            {STEPS.map(s => (
              <div key={s.n} className="step-card" style={{ background: s.bg, borderColor: s.border }}>
                <div className="step-num"  style={{ background: s.numBg, color: s.numColor }}>{s.n}</div>
                <div className="step-title" style={{ color: s.tc }}>{s.title}</div>
                <div className="step-desc"  style={{ color: s.dc }}>{s.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/*  BOTTOM CTA  */}
      <section className="section section-dark" style={{ textAlign: 'center' }}>
        <div className="container">
          <div className="badge-gold" style={{ background: 'rgba(200,168,64,.15)', color: '#d4b84a', marginBottom: '1.25rem' }}>
            <i className="ti ti-rocket" style={{ fontSize: 13 }} aria-hidden="true" />
            No credit card required
          </div>
          <h2 className="section-title-light" style={{ marginBottom: 10 }}>
            Ready to take your collection to the next level?
          </h2>
          <p style={{ fontSize: 14, color: 'var(--muted)', maxWidth: 360, margin: '0 auto 1.75rem', lineHeight: 1.7 }}>
            Start free, upgrade when you're ready. Every plan includes the full mobile app.
          </p>
          <Link to="/register" className="btn btn-gold btn-lg">Create your account</Link>
        </div>
      </section>
    </>
  );
}
