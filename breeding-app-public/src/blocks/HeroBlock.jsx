import React from 'react';
import SectionShell from './SectionShell.jsx';
import { BlockButton } from './BlockLink.jsx';
import { pillThemeOf } from './theme.js';

/**
 * Headline is authored as three optional parts rather than one string with
 * markup in it, so the admin form can show plain text inputs and the highlighted
 * run stays a styled element instead of user-supplied HTML.
 */
function Headline({ start, highlight, end }) {
  return (
    <h1
      style={{
        fontSize: 'clamp(24px, 5vw, 34px)',
        fontWeight: 500,
        lineHeight: 1.25,
        maxWidth: 520,
        margin: '0 auto .875rem',
        color: 'var(--dark)',
      }}
    >
      {start}
      {highlight && (
        <>
          {start ? ' ' : null}
          <span style={{ background: 'var(--gold-lt)', color: 'var(--gold-dk)', padding: '1px 8px', borderRadius: 6 }}>
            {highlight}
          </span>
        </>
      )}
      {end ? ` ${end}` : null}
    </h1>
  );
}

export default function HeroBlock({
  background = 'soft',
  badge,
  headlineStart,
  headlineHighlight,
  headlineEnd,
  subtext,
  pills = [],
  actions = [],
  preview,
}) {
  return (
    <SectionShell background={background}>
      <div style={{ textAlign: 'center' }}>
        {badge && badge.text && (
          <div className="badge-gold" style={{ marginBottom: '1.25rem' }}>
            {badge.icon && <i className={`ti ${badge.icon}`} style={{ fontSize: 13 }} aria-hidden="true" />}
            {badge.text}
          </div>
        )}

        <Headline start={headlineStart} highlight={headlineHighlight} end={headlineEnd} />

        {subtext && (
          <p style={{ fontSize: 15, color: 'var(--muted)', maxWidth: 440, margin: '0 auto 1.75rem', lineHeight: 1.7 }}>
            {subtext}
          </p>
        )}

        {pills.length > 0 && (
          <div
            className="hero-pills"
            style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginBottom: '1.75rem' }}
          >
            {pills.map((pill, i) => (
              <span key={`${pill.label}-${i}`} className="pill" style={pillThemeOf(pill.theme)}>
                {pill.icon && <i className={`ti ${pill.icon}`} style={{ fontSize: 12 }} aria-hidden="true" />}
                {pill.label}
              </span>
            ))}
          </div>
        )}

        {actions.length > 0 && (
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginBottom: '2.75rem' }}>
            {actions.map((action, i) => (
              <BlockButton key={`${action.label}-${i}`} action={action} />
            ))}
          </div>
        )}

        {preview && preview.image && (
          <div className="app-preview">
            {preview.url && (
              <div className="browser-bar">
                <div className="browser-dot" style={{ background: '#ef4444' }} />
                <div className="browser-dot" style={{ background: '#f59e0b' }} />
                <div className="browser-dot" style={{ background: '#22c55e' }} />
                <div className="browser-url">{preview.url}</div>
              </div>
            )}
            <img
              src={preview.image}
              alt={preview.alt || ''}
              style={{ width: '100%', display: 'block', borderRadius: preview.url ? '0 0 10px 10px' : 10 }}
            />
          </div>
        )}
      </div>
    </SectionShell>
  );
}
