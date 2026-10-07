import React, { useEffect, useMemo, useRef } from 'react';
import { getTopic, resolveTopic, topicsByCategory, categoryLabel } from '../registry';
import { helpStore } from '../helpStore';
import { useHelpTranslator } from './useHelpTranslator';

// The whole registry as a readable reference: contents, or one topic.
export default function HelpManual({ topicId }) {
  const { t, translator } = useHelpTranslator();
  const headingRef = useRef(null);
  const topic = getTopic(topicId);
  const resolved = useMemo(() => (topic ? resolveTopic(topic, translator) : null), [topic, translator]);
  const sections = useMemo(
    () => topicsByCategory().map(group => ({
      category: group.category,
      label: categoryLabel(translator, group.category),
      topics: group.topics.map(item => resolveTopic(item, translator)),
    })),
    [translator],
  );

  useEffect(() => { headingRef.current?.focus({ preventScroll: true }); }, [topicId]);

  const open = id => helpStore.set({ manualTopic: id });

  return (
    <div className="help-window-scrim sk-scrim" data-help-ui="" onClick={() => helpStore.closeManual()}>
      <div
        className="help-window help-window--manual"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-manual-title"
        onClick={event => event.stopPropagation()}
      >
        <div className="help-manual__head">
          <h2 id="help-manual-title" className="help-window__title">{t('ui.manual.title')}</h2>
          <button type="button" className="help-window__close appearance-btn appearance-btn--ghost" onClick={() => helpStore.closeManual()}>
            {t('ui.manual.close')}
          </button>
        </div>
        <div className="help-manual__body">
          {resolved ? (
            <article>
              <p className="help-manual__eyebrow">{resolved.categoryLabel}</p>
              <h3 ref={headingRef} tabIndex={-1} className="help-manual__topic-title">{resolved.title}</h3>
              <p className="help-manual__short">{resolved.short}</p>
              {resolved.more ? <p className="help-manual__more">{resolved.more}</p> : null}
              {resolved.tips.length ? (
                <>
                  <h4 className="help-manual__h">{t('ui.manual.tips')}</h4>
                  <ul className="help-manual__tips">{resolved.tips.map(tip => <li key={tip}>{tip}</li>)}</ul>
                </>
              ) : null}
              {resolved.related.length ? (
                <>
                  <h4 className="help-manual__h">{t('ui.manual.related')}</h4>
                  <div className="help-chips">
                    {resolved.related.map(id => (
                      <button key={id} type="button" className="help-chip" onClick={() => open(id)}>
                        {resolveTopic(getTopic(id), translator).title}
                      </button>
                    ))}
                  </div>
                </>
              ) : null}
              <p className="help-manual__all">
                <button type="button" className="help-link" onClick={() => open(null)}>{t('ui.manual.allSections')}</button>
              </p>
            </article>
          ) : (
            <nav aria-labelledby="help-manual-contents">
              <h3 id="help-manual-contents" ref={headingRef} tabIndex={-1} className="sr-only">{t('ui.manual.contents')}</h3>
              {sections.map(section => (
                <section key={section.category} className="help-manual__section">
                  <h4 className="help-manual__section-title">{section.label}</h4>
                  <ul className="help-manual__list">
                    {section.topics.map(item => (
                      <li key={item.id}>
                        <button type="button" className="help-link" onClick={() => open(item.id)}>{item.title}</button>
                        <span className="help-manual__desc">{item.short}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </nav>
          )}
        </div>
      </div>
    </div>
  );
}
