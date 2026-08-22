import React from 'react';
import SectionShell from './SectionShell.jsx';
import { BlockButton } from './BlockLink.jsx';

export default function CtaBlock({
  background = 'dark',
  badge,
  title,
  text,
  action,
}) {
  const isDark = background === 'dark';

  return (
    <SectionShell background={background} style={{ textAlign: 'center' }}>
      {badge && badge.text && (
        <div
          className="badge-gold"
          style={
            isDark
              ? { background: 'rgba(200,168,64,.15)', color: '#d4b84a', marginBottom: '1.25rem' }
              : { marginBottom: '1.25rem' }
          }
        >
          {badge.icon && <i className={`ti ${badge.icon}`} style={{ fontSize: 13 }} aria-hidden="true" />}
          {badge.text}
        </div>
      )}

      {title && (
        <h2 className={isDark ? 'section-title-light' : 'section-title'} style={{ marginBottom: 10 }}>
          {title}
        </h2>
      )}

      {text && (
        <p style={{ fontSize: 14, color: 'var(--muted)', maxWidth: 360, margin: '0 auto 1.75rem', lineHeight: 1.7 }}>
          {text}
        </p>
      )}

      <BlockButton action={action} />
    </SectionShell>
  );
}
