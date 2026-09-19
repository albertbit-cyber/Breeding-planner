import React from 'react';

/**
 * The opening of a deeper route.
 *
 * Deliberately not a second hero: these pages are reached from the nav by
 * someone who already knows what the product is, so they get a title and a
 * sentence of orientation rather than a pitch and a call to action.
 */
export default function PageIntro({ eyebrow, title, lead }) {
  return (
    <section className="v6-wrap" style={{ padding: '54px 28px 8px' }}>
      <div className="v6-stack" style={{ '--gap': '14px', maxWidth: '46ch' }}>
        <span className="v6-eyebrow">{eyebrow}</span>
        <h1
          className="v6-h2"
          style={{ fontSize: 'clamp(32px, 4.6vw, 52px)', lineHeight: 1.05, letterSpacing: '-.035em' }}
        >
          {title}
        </h1>
        {lead && (
          <p className="v6-copy" style={{ fontSize: 18, lineHeight: 1.6, maxWidth: '54ch' }}>
            {lead}
          </p>
        )}
      </div>
    </section>
  );
}
