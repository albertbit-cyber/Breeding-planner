import React, { useState } from 'react';
import { Link } from 'react-router-dom';

const PLANS = [
  {
    id: 'free', name: 'Free', topColor: '#a09888',
    freeLabel: true,
    stack: '20 animals',
    desc: 'Get started at no cost, forever.',
    cta: 'Get started',
    ctaStyle: { border: '1px solid var(--border)', color: 'var(--dark)', background: 'transparent' },
  },
  {
    id: 'hobby', name: 'Hobby', topColor: '#9b65d6',
    monthly: 5, yearly: 4,
    stack: '100 animals',
    desc: 'For the growing hobbyist.',
    cta: '14-day trial',
    ctaStyle: { border: '1px solid var(--border)', color: 'var(--dark)', background: 'transparent' },
  },
  {
    id: 'hobby-plus', name: 'Hobby Plus', topColor: '#d86060',
    monthly: 10, yearly: 8,
    stack: '250 animals',
    desc: 'More room for a serious collection.',
    cta: '14-day trial',
    ctaStyle: { border: '1px solid var(--border)', color: 'var(--dark)', background: 'transparent' },
  },
  {
    id: 'breeder', name: 'Breeder', topColor: '#c8a840', featured: true,
    monthly: 20, yearly: 17,
    stack: '500 animals',
    desc: 'For dedicated breeders.',
    cta: 'Start free trial',
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
  { icon: 'ti-building-store', label: 'Marketplace & sales listings' },
  { icon: 'ti-robot',          label: 'AI breeding advisor & tools' },
  { icon: 'ti-qrcode',         label: 'QR labels & export' },
  { icon: 'ti-brand-telegram', label: 'Telegram alerts & notifications' },
  { icon: 'ti-device-mobile',  label: 'Mobile app (iOS & Android)' },
  { icon: 'ti-layout-grid',    label: 'Space & rack management' },
  { icon: 'ti-git-branch',     label: 'Family tree visualization' },
  { icon: 'ti-calendar',       label: 'Breeding season calendar' },
];

function PlanCard({ plan, yearly }) {
  const price = yearly ? plan.yearly : plan.monthly;
  return (
    <div className={plan.featured ? 'plan-card featured' : 'plan-card'}>
      <div className="plan-top" style={{ background: plan.topColor }} />
      <div className="plan-body">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
          <div className="plan-name">{plan.name}</div>
          {plan.featured && (
            <span className="badge-gold" style={{ fontSize: 10, padding: '2px 8px' }}>Most popular</span>
          )}
        </div>

        {plan.freeLabel ? (
          <div style={{ marginBottom: 6 }}><span className="plan-price">Free</span></div>
        ) : plan.contactUs ? (
          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--muted)', marginBottom: 6 }}>Contact us for info</div>
        ) : (
          <div style={{ marginBottom: 6 }}>
            <span className="plan-price">{price}</span>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>/mo{yearly ? ', billed yearly' : ''}</span>
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

        <Link
          to={plan.contactUs ? '/contact' : '/register?plan=' + plan.id}
          className="btn btn-full"
          style={{ ...plan.ctaStyle, borderRadius: 8, fontSize: 13, padding: '8px', marginBottom: 10 }}
        >
          {plan.cta}
        </Link>

        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--muted)' }}>
          <i className="ti ti-check" style={{ color: 'var(--gold)', fontSize: 13 }} />
          All features included
        </div>
      </div>
    </div>
  );
}

export default function PricingPage() {
  const [yearly, setYearly] = useState(false);

  return (
    <section className="section section-soft">
      <div className="container">
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <div className="section-label">Pricing</div>
          <h1 className="section-title">Plans for every collection</h1>
          <p className="section-sub">Every plan includes all features. Only your stack size differs.</p>
        </div>

        <div className="toggle-row">
          <span style={{ fontWeight: yearly ? 400 : 500, color: yearly ? 'var(--muted)' : 'var(--dark)' }}>Monthly</span>
          <label className="sw">
            <input type="checkbox" checked={yearly} onChange={function(e){ setYearly(e.target.checked); }} />
            <span className="sw-track"></span>
          </label>
          <span style={{ fontWeight: yearly ? 500 : 400, color: yearly ? 'var(--dark)' : 'var(--muted)' }}>
            Yearly <span className="badge-gold" style={{ fontSize: 10, padding: '2px 8px' }}>Save ~17%</span>
          </span>
        </div>

        <div className="grid-3" style={{ marginBottom: 10 }}>
          {PLANS.slice(0, 3).map(function(p){ return <PlanCard key={p.id} plan={p} yearly={yearly} />; })}
        </div>
        <div className="grid-2" style={{ maxWidth: 520, margin: '0 auto 2.5rem' }}>
          {PLANS.slice(3).map(function(p){ return <PlanCard key={p.id} plan={p} yearly={yearly} />; })}
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
          <a href="mailto:hello@breedingplanner.com" style={{ color: 'var(--gold-dk)', fontWeight: 500 }}>Contact us</a>
        </p>
      </div>
    </section>
  );
}
