import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getTopic, resolveAll, resolveTopic, topicsByCategory, categoryLabel } from '../registry';
import { indexTopics, searchTopics } from '../search';
import { helpStore } from '../helpStore';
import { useTranslation } from 'react-i18next';
import { useHelpTranslator } from './useHelpTranslator';

const SECTION_PEERS = 6;

// The whole registry as a readable, searchable reference. Three views: contents, one
// topic, search results. Every jump pushes onto a history that Back pops. Typing a query
// shows results over the topic; clearing the query returns to it.
export default function HelpManual({ topicId }) {
  const { t } = useTranslation('help');
  const { translator } = useHelpTranslator();
  const [query, setQuery] = useState('');
  const [history, setHistory] = useState([]);
  const headingRef = useRef(null);
  const bodyRef = useRef(null);

  const all = useMemo(() => resolveAll(translator), [translator]);
  const index = useMemo(() => indexTopics(all), [all]);
  const sections = useMemo(
    () => topicsByCategory().map(group => ({
      category: group.category,
      label: categoryLabel(translator, group.category),
      topics: group.topics.map(item => resolveTopic(item, translator)),
    })),
    [translator],
  );

  const topic = getTopic(topicId);
  const resolved = useMemo(() => (topic ? resolveTopic(topic, translator) : null), [topic, translator]);
  const results = useMemo(() => searchTopics(index, query), [index, query]);
  const searching = query.trim() !== '';

  useEffect(() => {
    bodyRef.current?.scrollTo?.({ top: 0 });
    if (!searching) headingRef.current?.focus({ preventScroll: true });
  }, [topicId, searching]);

  const go = (id) => {
    setHistory(stack => [...stack, topicId]);
    setQuery('');
    helpStore.set({ manualTopic: id });
  };
  const back = () => {
    const previous = history[history.length - 1] ?? null;
    setHistory(history.slice(0, -1));
    setQuery('');
    helpStore.set({ manualTopic: previous });
  };

  const titleOf = id => resolveTopic(getTopic(id), translator).title;
  const peers = resolved
    ? (sections.find(section => section.category === resolved.category)?.topics || [])
      .filter(item => item.id !== resolved.id && !item.minor && !resolved.related.includes(item.id))
      .slice(0, SECTION_PEERS)
    : [];

  const entry = item => (
    <li key={item.id}>
      <button type="button" className="help-link" onClick={() => go(item.id)}>{item.title}</button>
      <span className="help-manual__desc">{item.short}</span>
    </li>
  );

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
          <div className="help-manual__head-start">
            {history.length && !searching ? (
              <button type="button" className="help-window__close appearance-btn appearance-btn--ghost" onClick={back}>
                <span aria-hidden="true">&larr; </span>{t('ui.manual.back')}
              </button>
            ) : null}
            <h2 id="help-manual-title" className="help-window__title">{t('ui.manual.title')}</h2>
          </div>
          <button type="button" className="help-window__close appearance-btn appearance-btn--ghost" onClick={() => helpStore.closeManual()}>
            {t('ui.manual.close')}
          </button>
        </div>

        <div className="help-manual__search">
          <label htmlFor="help-manual-search" className="sr-only">{t('ui.manual.search')}</label>
          <input
            id="help-manual-search"
            type="search"
            className="help-manual__input"
            value={query}
            placeholder={t('ui.manual.searchPlaceholder')}
            onChange={event => setQuery(event.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        <div ref={bodyRef} className="help-manual__body" aria-live={searching ? 'polite' : undefined}>
          {searching ? (
            results.length ? (
              <>
                <p className="help-manual__count">{t('ui.manual.found', { count: results.length })}</p>
                <ul className="help-manual__list">{results.map(entry)}</ul>
              </>
            ) : (
              <p className="help-manual__empty">{t('ui.manual.nothing', { query: query.trim() })}</p>
            )
          ) : resolved ? (
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
                      <button key={id} type="button" className="help-chip" onClick={() => go(id)}>{titleOf(id)}</button>
                    ))}
                  </div>
                </>
              ) : null}
              {peers.length ? (
                <>
                  <h4 className="help-manual__h">{t('ui.manual.inSection', { section: resolved.categoryLabel })}</h4>
                  <ul className="help-manual__list help-manual__list--compact">{peers.map(entry)}</ul>
                </>
              ) : null}
              <p className="help-manual__all">
                <button type="button" className="help-link" onClick={() => go(null)}>{t('ui.manual.allSections')}</button>
              </p>
            </article>
          ) : (
            <nav aria-labelledby="help-manual-contents">
              <h3 id="help-manual-contents" ref={headingRef} tabIndex={-1} className="sr-only">{t('ui.manual.contents')}</h3>
              {sections.map((section) => {
                const main = section.topics.filter(item => !item.minor);
                const minor = section.topics.filter(item => item.minor);
                return (
                  <section key={section.category} className="help-manual__section">
                    <h4 className="help-manual__section-title">{section.label}</h4>
                    <ul className="help-manual__list">{main.map(entry)}</ul>
                    {minor.length ? (
                      <details className="help-manual__minor">
                        <summary>{t('ui.manual.moreFields', { count: minor.length })}</summary>
                        <ul className="help-manual__list help-manual__list--compact">{minor.map(entry)}</ul>
                      </details>
                    ) : null}
                  </section>
                );
              })}
            </nav>
          )}
        </div>
      </div>
    </div>
  );
}
