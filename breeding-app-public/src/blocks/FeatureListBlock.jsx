import React from 'react';
import SectionShell from './SectionShell.jsx';

/**
 * A flat icon-and-label list, for "what's included" style content. Distinct from
 * FeatureGridBlock, which sells six things with a paragraph each; this one
 * enumerates a dozen at a glance.
 */
function List({ items }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px 24px' }}>
      {items.map((item, i) => (
        <div key={`${item.label}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              background: 'var(--gold-lt)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <i className={`ti ${item.icon}`} style={{ fontSize: 15, color: 'var(--gold-dk)' }} aria-hidden="true" />
          </div>
          <span style={{ fontSize: 13, color: 'var(--dark)' }}>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

/** The list inside a white panel — the form it takes at the foot of /pricing. */
export function FeatureListPanel({ label, title, items = [] }) {
  return (
    <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: '1.75rem 2rem' }}>
      {(label || title) && (
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          {label && (
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '.07em',
                textTransform: 'uppercase',
                color: 'var(--gold-dk)',
                marginBottom: 6,
              }}
            >
              {label}
            </div>
          )}
          {title && <h2 style={{ fontSize: 18, fontWeight: 500, color: 'var(--dark)' }}>{title}</h2>}
        </div>
      )}
      <List items={items} />
    </div>
  );
}

export default function FeatureListBlock({
  background = 'soft',
  label,
  title,
  subtitle,
  panel = false,
  items = [],
}) {
  if (panel) {
    return (
      <SectionShell background={background} subtitle={subtitle}>
        <FeatureListPanel label={label} title={title} items={items} />
      </SectionShell>
    );
  }

  return (
    <SectionShell background={background} label={label} title={title} subtitle={subtitle}>
      <List items={items} />
    </SectionShell>
  );
}
