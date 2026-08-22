import React, { useState } from 'react';
import SectionShell from './SectionShell.jsx';
import BlockLink from './BlockLink.jsx';
import { accentOf } from './theme.js';

const CTA_VARIANT = {
  outline: { border: '1px solid var(--border)', color: 'var(--dark)', background: 'transparent' },
  gold: { background: 'var(--gold)', color: 'var(--dark)', border: 'none', fontWeight: 600 },
  dark: { background: 'var(--dark)', color: '#fff', border: 'none', fontWeight: 500 },
};

function Price({ plan, yearly }) {
  if (plan.priceMode === 'free') {
    return <div style={{ marginBottom: 6 }}><span className="plan-price">{plan.freeLabel || 'Free'}</span></div>;
  }

  if (plan.priceMode === 'contact') {
    return (
      <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--muted)', marginBottom: 6 }}>
        {plan.contactLabel || 'Contact us for info'}
      </div>
    );
  }

  const amount = yearly ? plan.yearly : plan.monthly;
  return (
    <div style={{ marginBottom: 6 }}>
      <span className="plan-price">{plan.currencySymbol || ''}{amount}</span>
      <span style={{ fontSize: 13, color: 'var(--muted)' }}>
        /mo{yearly ? ', billed yearly' : ''}
      </span>
    </div>
  );
}

function PlanCard({ plan, yearly }) {
  return (
    <div className={plan.featured ? 'plan-card featured' : 'plan-card'}>
      <div className="plan-top" style={{ background: accentOf(plan.accent) }} />
      <div className="plan-body">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
          <div className="plan-name">{plan.name}</div>
          {plan.featured && plan.featuredLabel && (
            <span className="badge-gold" style={{ fontSize: 10, padding: '2px 8px' }}>{plan.featuredLabel}</span>
          )}
        </div>

        <Price plan={plan} yearly={yearly} />

        {plan.stackLabel && (
          <div
            style={{
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '8px 12px',
              marginBottom: 10,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <i className="ti ti-stack" style={{ fontSize: 16, color: 'var(--gold-dk)', flexShrink: 0 }} aria-hidden="true" />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--dark)' }}>{plan.stackLabel}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>{plan.stackSubLabel || 'stack limit'}</div>
            </div>
          </div>
        )}

        {plan.desc && <div className="plan-desc">{plan.desc}</div>}

        {plan.cta && plan.cta.label && (
          <BlockLink
            href={plan.cta.href}
            className="btn btn-full"
            style={{
              ...(CTA_VARIANT[plan.cta.variant] || CTA_VARIANT.outline),
              borderRadius: 8,
              fontSize: 13,
              padding: '8px',
              marginBottom: 10,
            }}
          >
            {plan.cta.label}
          </BlockLink>
        )}

        {plan.footnote && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--muted)' }}>
            <i className="ti ti-check" style={{ color: 'var(--gold)', fontSize: 13 }} aria-hidden="true" />
            {plan.footnote}
          </div>
        )}
      </div>
    </div>
  );
}

export default function PricingTableBlock({
  background = 'soft',
  label,
  title,
  subtitle,
  titleAs = 'h1',
  showBillingToggle = true,
  monthlyLabel = 'Monthly',
  yearlyLabel = 'Yearly',
  savingsBadge,
  plans = [],
  children,
}) {
  const [yearly, setYearly] = useState(false);

  const firstRow = plans.slice(0, 3);
  const secondRow = plans.slice(3);

  return (
    <SectionShell
      background={background}
      label={label}
      title={title}
      subtitle={subtitle}
      titleAs={titleAs}
    >
      {showBillingToggle && (
        <div className="toggle-row">
          <span style={{ fontWeight: yearly ? 400 : 500, color: yearly ? 'var(--muted)' : 'var(--dark)' }}>
            {monthlyLabel}
          </span>
          <label className="sw">
            <input
              type="checkbox"
              checked={yearly}
              onChange={(e) => setYearly(e.target.checked)}
              aria-label={`Show ${yearlyLabel.toLowerCase()} pricing`}
            />
            <span className="sw-track" />
          </label>
          <span style={{ fontWeight: yearly ? 500 : 400, color: yearly ? 'var(--dark)' : 'var(--muted)' }}>
            {yearlyLabel}
            {savingsBadge && (
              <span className="badge-gold" style={{ fontSize: 10, padding: '2px 8px', marginLeft: 6 }}>
                {savingsBadge}
              </span>
            )}
          </span>
        </div>
      )}

      {firstRow.length > 0 && (
        <div className="grid-3" style={{ marginBottom: 10 }}>
          {firstRow.map((plan) => <PlanCard key={plan.id || plan.name} plan={plan} yearly={yearly} />)}
        </div>
      )}

      {secondRow.length > 0 && (
        <div className="grid-2" style={{ maxWidth: 520, margin: '0 auto 2.5rem' }}>
          {secondRow.map((plan) => <PlanCard key={plan.id || plan.name} plan={plan} yearly={yearly} />)}
        </div>
      )}

      {children}
    </SectionShell>
  );
}
