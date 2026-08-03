import React from 'react';

/**
 * Shared shell for the legal pages (/privacy, /terms).
 *
 * These pages are the single source of truth for Serpentora's legal text —
 * deliberately not duplicated into markdown elsewhere, because two copies of a
 * legal document that can drift apart is worse than none.
 */
export default function LegalLayout({ title, updated, summary, children }) {
  return (
    <section className="section section-soft">
      <article
        style={{
          maxWidth: 720,
          margin: '0 auto',
          background: '#fff',
          border: '1px solid var(--border)',
          borderRadius: 16,
          padding: 'clamp(1.5rem, 4vw, 3rem)',
        }}
      >
        <h1 style={{ fontSize: 26, fontWeight: 500, color: 'var(--dark)', marginBottom: 8 }}>
          {title}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: summary ? 20 : 32 }}>
          Last updated {updated}
        </p>

        {summary && (
          <p
            style={{
              fontSize: 14,
              lineHeight: 1.7,
              color: 'var(--dark)',
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: '1rem 1.15rem',
              margin: '0 0 2rem',
            }}
          >
            {summary}
          </p>
        )}

        <div className="legal-body">{children}</div>
      </article>

      <style>{`
        .legal-body { font-size: 14.5px; line-height: 1.75; color: #3a3630; }
        .legal-body h2 {
          font-size: 16px;
          font-weight: 600;
          color: var(--dark);
          margin: 2.25rem 0 .6rem;
        }
        .legal-body h3 {
          font-size: 14px;
          font-weight: 600;
          color: var(--dark);
          margin: 1.5rem 0 .4rem;
        }
        .legal-body p { margin: 0 0 .9rem; }
        .legal-body ul { margin: 0 0 1rem; padding-left: 1.25rem; }
        .legal-body li { margin-bottom: .45rem; }
        .legal-body a { color: var(--gold-dk); }
        .legal-body strong { font-weight: 600; color: var(--dark); }
        .legal-body table { width: 100%; border-collapse: collapse; margin: 0 0 1.25rem; font-size: 13.5px; }
        .legal-body th, .legal-body td {
          text-align: left;
          padding: .6rem .7rem;
          border-bottom: 1px solid var(--border);
          vertical-align: top;
        }
        .legal-body th { font-weight: 600; color: var(--dark); background: var(--bg); }
        .legal-scroll { overflow-x: auto; }
        .legal-fill {
          background: #fdf4d8;
          border-bottom: 1px dashed #c8a840;
          padding: 0 3px;
          font-style: italic;
        }
      `}</style>
    </section>
  );
}
