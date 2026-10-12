import React from 'react';
import { Link } from 'react-router-dom';

const PLANS = [
  {
    id: 'free', name: 'Free', topColor: '#a09888',
    freeLabel: true,
    stack: '20 animals',
    desc: 'For a small collection, at no cost.',
    cta: 'Join the waitlist',
    ctaStyle: { border: '1px solid var(--border)', color: 'var(--dark)', background: 'transparent' },
  },
  {
    id: 'hobby', name: 'Hobby', topColor: '#9b65d6',
    monthly: 5,
    stack: '100 animals',
    desc: 'For the growing hobbyist.',
    cta: 'Join the waitlist',
    ctaStyle: { border: '1px solid var(--border)', color: 'var(--dark)', background: 'transparent' },
  },
  {
    id: 'hobby-plus', name: 'Hobby Plus', topColor: '#d86060',
    monthly: 10,
    stack: '250 animals',
    desc: 'More room for a serious collection.',
    cta: 'Join the waitlist',
    ctaStyle: { border: '1px solid var(--border)', color: 'var(--dark)', background: 'transparent' },
  },
  {
    id: 'breeder', name: 'Breeder', topColor: '#c8a840', featured: true,
    monthly: 20,
    stack: '500 animals',
    desc: 'For dedicated breeders.',
    cta: 'Join the waitlist',
    ctaStyle: { background: 'var(--gold)', color: 'var(--dark)', border: 'none', fontWeight: 600 },
  },
  {
    id: 'professional', name: 'Professional', topColor: '#7a7265',
    contactUs: true,
    stack: 'Unlimited',
    desc: 'No limits. Full team access.',
    cta: 'Get in touch',
    ctaStyle: { background: 'var(--dark)', color: '#fff', border: 'none', fontWeight: 500 },
  },
];

const ALL_FEATURES = [
  { icon: 'ti-paw',            label: 'Animal management & health logs' },
  { icon: 'ti-dna-2',          label: 'Genetics calculator & morph prediction' },
  { icon: 'ti-heart',          label: 'Breeding records & clutch management' },
  { icon: 'ti-flask',          label: 'Shed testing & lab orders' },
  { icon: 'ti-robot',          label: 'Breeding Advisor' },
  { icon: 'ti-qrcode',         label: 'QR labels & export' },
  { icon: 'ti-file-import',    label: 'MorphMarket CSV import' },
  { icon: 'ti-device-mobile',  label: 'Android app, works offline' },
  { icon: 'ti-layout-grid',    label: 'Space & rack management' },
  { icon: 'ti-git-branch',     label: 'Family tree visualization' },
  { icon: 'ti-calendar',       label: 'Breeding season calendar' },
];

function PlanCard({ plan }) {
  return (
    <div className={plan.featured ? 'plan-card featured' : 'plan-card'}>
      <div className="plan-top" style={{ background: plan.topColor }} />
      <div className="plan-body">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
          <div className="plan-name">{plan.name}</div>
        </div>

        {plan.freeLabel ? (
          <div style={{ marginBottom: 6 }}><span className="plan-price">Free</span></div>
        ) : plan.contactUs ? (
          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--muted)', marginBottom: 6 }}>Contact us for info</div>
        ) : (
          <div style={{ marginBottom: 6 }}>
            <span className="plan-price">€{plan.monthly}</span>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>/mo, planned</span>
          </div>
        )}

        <div style={{
          background: 'var(--bg)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '8px 12px', marginBottom: 10,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <i className="ti ti-stack" style={{ fontSize: 16, color: 'var(--gold-dk)', flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--dark)' }}>{plan.stack}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>stack limit</div>
          </div>
        </div>

        <div className="plan-desc">{plan.desc}</div>

        {plan.contactUs ? (
          <a
            href="mailto:info@serpentora.com?subject=Serpentora%20Professional%20plan"
            className="btn btn-full"
            style={{ ...plan.ctaStyle, borderRadius: 8, fontSize: 13, padding: '8px', marginBottom: 10 }}
          >
            {plan.cta}
          </a>
        ) : (
          <Link
            to={'/waitlist?plan=' + plan.id}
            className="btn btn-full"
            style={{ ...plan.ctaStyle, borderRadius: 8, fontSize: 13, padding: '8px', marginBottom: 10 }}
          >
            {plan.cta}
          </Link>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--muted)' }}>
          <i className="ti ti-check" style={{ color: 'var(--gold)', fontSize: 13 }} />
          All features included
        </div>
      </div>
    </div>
  );
}

export default function PricingPage() {
  return (
    <section className="section section-soft">
      <div className="container">
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <div className="section-label">Pricing</div>
          <h1 className="section-title">Planned founding-member pricing</h1>
          <p className="section-sub">Every plan is planned to include every feature; only your stack size differs.</p>
        </div>

        <div className="alert" role="note" style={{ background: '#fff', border: '1px solid var(--border)', color: 'var(--dark)', maxWidth: 640, margin: '0 auto 1.75rem', lineHeight: 1.6 }}>
          <strong style={{ fontWeight: 600 }}>Payments are not live yet.</strong>{' '}
          Nothing can be bought today and nobody is charged. These are the prices we plan to launch with.
          Join the waitlist and you keep this founding-member price for as long as you stay subscribed.
        </div>

        <div className="grid-3" style={{ marginBottom: 10 }}>
          {PLANS.slice(0, 3).map(function(p){ return <PlanCard key={p.id} plan={p} />; })}
        </div>
        <div className="grid-2" style={{ maxWidth: 520, margin: '0 auto 2.5rem' }}>
          {PLANS.slice(3).map(function(p){ return <PlanCard key={p.id} plan={p} />; })}
        </div>

        <div style={{
          background: '#fff', border: '1px solid var(--border)',
          borderRadius: 16, padding: '1.75rem 2rem',
        }}>
          <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--gold-dk)', marginBottom: 6 }}>
              What every plan includes
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 500, color: 'var(--dark)' }}>All features. Every tier.</h2>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 6 }}>
              Coming later, as its own product: a marketplace built on the animals you already track.
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px 24px' }}>
            {ALL_FEATURES.map(function(f){
              return (
                <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 30, height: 30, borderRadius: 8, background: 'var(--gold-lt)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <i className={'ti ' + f.icon} style={{ fontSize: 15, color: 'var(--gold-dk)' }} />
                  </div>
                  <span style={{ fontSize: 13, color: 'var(--dark)' }}>{f.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        <p style={{ textAlign: 'center', fontSize: 14, color: 'var(--muted)', marginTop: '1.5rem' }}>
          Need a lab portal or enterprise plan?{' '}
          <a href="mailto:info@serpentora.com" style={{ color: 'var(--gold-dk)', fontWeight: 500 }}>Contact us</a>
        </p>
      </div>
    </section>
  );
}
