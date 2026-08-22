import React from 'react';
import SectionShell from './SectionShell.jsx';
import { themeOf } from './theme.js';

export default function FeatureGridBlock({
  background = 'soft',
  label,
  title,
  subtitle,
  items = [],
}) {
  return (
    <SectionShell background={background} label={label} title={title} subtitle={subtitle}>
      <div className="grid-auto">
        {items.map((item, i) => {
          const theme = themeOf(item.theme);
          return (
            <div
              key={`${item.title}-${i}`}
              className="feat-card"
              style={{ background: theme.bg, borderColor: theme.border }}
            >
              {item.icon && (
                <div className="feat-icon" style={{ background: theme.accent }}>
                  <i className={`ti ${item.icon}`} aria-hidden="true" />
                </div>
              )}
              <div className="feat-title" style={{ color: theme.title }}>{item.title}</div>
              <div className="feat-desc" style={{ color: theme.desc }}>{item.desc}</div>
            </div>
          );
        })}
      </div>
    </SectionShell>
  );
}
