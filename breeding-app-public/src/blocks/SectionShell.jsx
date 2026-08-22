import React from 'react';

/**
 * Every block sits in a section with one of three backgrounds and an optional
 * heading cluster (eyebrow label / title / subtitle). Keeping that in one place
 * means a block author picks a background from a dropdown and cannot invent a
 * fourth one.
 */
const BACKGROUNDS = {
  soft:  { className: 'section section-soft', style: undefined },
  white: { className: 'section', style: { background: '#fff', borderTop: '1px solid var(--border)' } },
  dark:  { className: 'section section-dark', style: undefined },
};

export const BACKGROUND_NAMES = Object.keys(BACKGROUNDS);

export default function SectionShell({
  background = 'soft',
  label,
  title,
  subtitle,
  headingAlign = 'center',
  titleAs: TitleTag = 'h2',
  style,
  children,
}) {
  const surface = BACKGROUNDS[background] || BACKGROUNDS.soft;
  const isDark = background === 'dark';
  const hasHeading = Boolean(label || title || subtitle);

  return (
    <section className={surface.className} style={{ ...surface.style, ...style }}>
      <div className="container">
        {hasHeading && (
          <div style={{ textAlign: headingAlign, marginBottom: '2.5rem' }}>
            {label && <div className="section-label">{label}</div>}
            {title && (
              <TitleTag className={isDark ? 'section-title-light' : 'section-title'}>{title}</TitleTag>
            )}
            {subtitle && <p className="section-sub">{subtitle}</p>}
          </div>
        )}
        {children}
      </div>
    </section>
  );
}
