import React from 'react';

/**
 * A compact figures bar. Deliberately not built on SectionShell: this strip uses
 * tighter padding than a full section, and giving it the standard 4rem would
 * make it read as its own chapter rather than a rule under the hero.
 */
export default function StatsBlock({ background = 'dark', items = [] }) {
  if (items.length === 0) return null;

  const isDark = background === 'dark';

  return (
    <section
      className={isDark ? 'section-dark' : 'section-soft'}
      style={{ padding: '1.5rem' }}
    >
      <div className="container">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${items.length}, 1fr)`,
            textAlign: 'center',
            gap: '1rem',
          }}
        >
          {items.map((item, i) => (
            <div key={`${item.label}-${i}`}>
              <div style={{ fontSize: 20, fontWeight: 500, color: 'var(--gold)' }}>{item.value}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>{item.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
