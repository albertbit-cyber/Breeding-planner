import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { helpStore } from '../helpStore';
import { placePanel } from './placePanel';
import { useTourEngine } from './useTourEngine';

const RING_OUTSET = 6;

// What a running tour draws over the live app: a ring around the target and a panel
// beside it. Neither blocks anything; the app stays fully usable.
export default function TourLayer({ getAppContext, onNavigate, onOffer }) {
  const { t } = useTranslation('help');
  const { tour, step, index, rect, avoidRects, missing, done } = useTourEngine(getAppContext);
  const panelRef = useRef(null);
  const headingRef = useRef(null);
  const [panelSize, setPanelSize] = useState({ width: 360, height: 220 });
  const [viewport, setViewport] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));

  useEffect(() => {
    const onResize = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Measure after every render, but store only a real change, so layout cannot loop.
  useLayoutEffect(() => {
    const node = panelRef.current;
    if (!node) return;
    const next = { width: node.offsetWidth, height: node.scrollHeight };
    setPanelSize(prev => (prev.width === next.width && prev.height === next.height ? prev : next));
  });

  // The heading takes focus when the tour starts or the step changes.
  const stepKey = tour ? `${tour.id}:${index}` : null;
  useEffect(() => {
    if (stepKey) headingRef.current?.focus({ preventScroll: true });
  }, [stepKey]);

  // Alt+G brings focus back to the panel from anywhere in the app.
  useEffect(() => {
    if (!stepKey) return undefined;
    const onKey = (event) => {
      if (event.altKey && (event.key === 'g' || event.key === 'G')) {
        event.preventDefault();
        headingRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stepKey]);

  if (!tour || !step) return null;

  const total = tour.steps.length;
  const last = index === total - 1;
  const placement = placePanel(rect, panelSize, viewport, avoidRects);
  const title = t(step.title.replace(/^help:/, ''));
  const text = t(step.text.replace(/^help:/, ''));
  const missingText = step.missing ? t(step.missing.replace(/^help:/, '')) : t('ui.tour.missing');

  return (
    <>
      {rect ? (
        <div
          className="help-tour-ring"
          aria-hidden="true"
          style={{
            top: rect.top - RING_OUTSET,
            left: rect.left - RING_OUTSET,
            width: rect.width + RING_OUTSET * 2,
            height: rect.height + RING_OUTSET * 2,
          }}
        />
      ) : null}
      <section
        ref={panelRef}
        className="help-tour-panel"
        role="region"
        aria-labelledby="help-tour-heading"
        data-help-ui=""
        style={{ top: placement.top, left: placement.left, maxHeight: placement.maxHeight }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            helpStore.exitTour();
          }
        }}
      >
        <div className="help-tour-panel__top">
          <span className="help-tour-panel__part">{t(step.part.replace(/^help:/, ''))}</span>
          <span className="help-tour-panel__count">{t('ui.tour.stepOf', { current: index + 1, total })}</span>
        </div>
        <div
          className="help-tour-panel__progress"
          role="progressbar"
          aria-label={t('ui.tour.progress')}
          aria-valuemin={1}
          aria-valuemax={total}
          aria-valuenow={index + 1}
        >
          <span style={{ width: `${((index + 1) / total) * 100}%` }} />
        </div>
        <h2 id="help-tour-heading" ref={headingRef} tabIndex={-1} className="help-tour-panel__title">{title}</h2>
        <p className="help-tour-panel__text">{text}</p>
        {done ? <p className="help-tour-panel__done" role="status">{t('ui.tour.done')}</p> : null}
        {missing && !done ? <p className="help-tour-panel__missing">{missingText}</p> : null}
        {step.offer && !done ? (
          <div className="help-tour-panel__offer">
            <button type="button" className="help-btn appearance-btn appearance-btn--ghost" onClick={() => onOffer?.(step.offer.id)}>
              {t(step.offer.label.replace(/^help:/, ''))}
            </button>
            <p className="help-tour-panel__note">{t(step.offer.note.replace(/^help:/, ''))}</p>
          </div>
        ) : null}
        <div className="help-tour-panel__actions">
          {index > 0 ? (
            <button type="button" className="help-btn appearance-btn appearance-btn--ghost" onClick={() => helpStore.backStep()}>
              {t('ui.tour.back')}
            </button>
          ) : null}
          {step.kind === 'info' ? (
            <button type="button" className="help-btn appearance-btn appearance-btn--filled" onClick={() => helpStore.nextStep()}>
              {last ? t('ui.tour.finish') : t('ui.tour.next')}
            </button>
          ) : (
            <button type="button" className="help-btn appearance-btn appearance-btn--ghost" onClick={() => helpStore.skipStep()}>
              {t('ui.tour.skip')}
            </button>
          )}
          {missing && step.route && !done ? (
            <button type="button" className="help-btn appearance-btn appearance-btn--filled" onClick={() => onNavigate?.(step.route)}>
              {t('ui.tour.takeMeThere')}
            </button>
          ) : null}
          <button type="button" className="help-btn help-tour-panel__exit appearance-btn appearance-btn--ghost" onClick={() => helpStore.exitTour()}>
            {t('ui.tour.exit')}
          </button>
        </div>
        <p className="sr-only" aria-live="polite">
          {t('ui.tour.announce', { current: index + 1, total, title, text })}
        </p>
      </section>
    </>
  );
}
