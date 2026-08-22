import React from 'react';
import SectionShell from './SectionShell.jsx';
import { themeOf } from './theme.js';

/**
 * When a tutorial has no screenshot yet we render a visible placeholder rather
 * than collapsing the slot. A missing screenshot should look unfinished on the
 * page, not quietly reflow into something that looks intentional.
 */
function Screenshot({ image, alt, caption, theme }) {
  if (image) {
    return (
      <figure style={{ margin: '1rem 0 0' }}>
        <img
          src={image}
          alt={alt || ''}
          style={{ width: '100%', display: 'block', borderRadius: 10, border: `1px solid ${theme.border}` }}
        />
        {caption && (
          <figcaption style={{ fontSize: 12, color: theme.desc, marginTop: 6, textAlign: 'center' }}>
            {caption}
          </figcaption>
        )}
      </figure>
    );
  }

  return (
    <div
      style={{
        marginTop: '1rem',
        border: `1px dashed ${theme.border}`,
        borderRadius: 10,
        padding: '1.75rem 1rem',
        textAlign: 'center',
        color: theme.desc,
        fontSize: 12,
      }}
    >
      <i className="ti ti-photo" style={{ fontSize: 20, display: 'block', marginBottom: 6 }} aria-hidden="true" />
      Screenshot to come{alt ? ` — ${alt}` : ''}
    </div>
  );
}

function Tutorial({ item, index }) {
  const theme = themeOf(item.theme);
  const steps = item.steps || [];

  return (
    <article
      style={{
        background: theme.bg,
        border: `1px solid ${theme.border}`,
        borderRadius: 'var(--radius-lg)',
        padding: '1.5rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: 10,
            background: theme.accent,
            color: theme.onAccent,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            fontSize: 15,
            fontWeight: 600,
          }}
        >
          {item.icon
            ? <i className={`ti ${item.icon}`} style={{ fontSize: 19 }} aria-hidden="true" />
            : index + 1}
        </div>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: theme.title }}>{item.title}</h3>
      </div>

      {item.summary && (
        <p style={{ fontSize: 13, lineHeight: 1.65, color: theme.desc, marginBottom: steps.length ? 12 : 0 }}>
          {item.summary}
        </p>
      )}

      {steps.length > 0 && (
        <ol style={{ margin: 0, paddingLeft: 0, listStyle: 'none', counterReset: 'tut' }}>
          {steps.map((step, i) => (
            <li
              key={i}
              style={{
                display: 'flex',
                gap: 9,
                fontSize: 13,
                lineHeight: 1.6,
                color: theme.desc,
                marginBottom: 7,
              }}
            >
              <span
                style={{
                  flexShrink: 0,
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  background: theme.accent,
                  color: theme.onAccent,
                  fontSize: 10,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginTop: 2,
                }}
              >
                {i + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      )}

      {item.showScreenshot !== false && (
        <Screenshot image={item.image} alt={item.imageAlt} caption={item.caption} theme={theme} />
      )}
    </article>
  );
}

export default function TutorialListBlock({
  background = 'soft',
  label,
  title,
  subtitle,
  items = [],
}) {
  return (
    <SectionShell background={background} label={label} title={title} subtitle={subtitle}>
      <div style={{ display: 'grid', gap: 14 }}>
        {items.map((item, i) => (
          <Tutorial key={`${item.title}-${i}`} item={item} index={i} />
        ))}
      </div>
    </SectionShell>
  );
}
