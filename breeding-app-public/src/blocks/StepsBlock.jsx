import React from 'react';
import SectionShell from './SectionShell.jsx';
import { BlockButton } from './BlockLink.jsx';
import { themeOf } from './theme.js';

/**
 * Step numbers come from position, not from the content. Authors reorder steps
 * by dragging them; having to renumber afterwards is exactly the kind of chore
 * that leaves a published page reading 1, 2, 2, 4.
 */
export default function StepsBlock({
  background = 'white',
  label,
  title,
  subtitle,
  items = [],
  action,
}) {
  return (
    <SectionShell background={background} label={label} title={title} subtitle={subtitle}>
      <div className="grid-3">
        {items.map((item, i) => {
          const theme = themeOf(item.theme);
          return (
            <div
              key={`${item.title}-${i}`}
              className="step-card"
              style={{ background: theme.bg, borderColor: theme.border }}
            >
              <div className="step-num" style={{ background: theme.accent, color: theme.onAccent }}>
                {i + 1}
              </div>
              <div className="step-title" style={{ color: theme.title }}>{item.title}</div>
              <div className="step-desc" style={{ color: theme.desc }}>{item.desc}</div>
            </div>
          );
        })}
      </div>

      {action && action.label && (
        <div style={{ textAlign: 'center', marginTop: '1.75rem' }}>
          <BlockButton action={action} size="btn-sm" />
        </div>
      )}
    </SectionShell>
  );
}
