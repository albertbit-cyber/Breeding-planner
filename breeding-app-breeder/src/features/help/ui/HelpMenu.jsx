import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { helpStore, useHelpState } from '../helpStore';

// What the ? opens: explore (Help Mode), the manual, and the guided tours.
// `tours` and `onStartTour` arrive with the tour engine; until then the section is absent.
export default function HelpMenu({ tours = [], onStartTour }) {
  const { t } = useTranslation('help');
  const mode = useHelpState(state => state.mode);
  const flags = useHelpState(state => state.flags);
  const primaryRef = useRef(null);

  useEffect(() => { primaryRef.current?.focus(); }, []);

  const paused = flags.paused ? tours.find(item => item.id === flags.paused.tour) : null;

  return (
    <div className="help-window-scrim sk-scrim" data-help-ui="" onClick={() => helpStore.closeMenu()}>
      <div
        className="help-window help-window--menu"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-menu-title"
        onClick={event => event.stopPropagation()}
      >
        <div className="help-window__head">
          <h2 id="help-menu-title" className="help-window__title">{t('ui.menu.title')}</h2>
          <button type="button" className="help-window__close appearance-btn appearance-btn--ghost" onClick={() => helpStore.closeMenu()}>
            {t('ui.menu.close')}
          </button>
        </div>

        <button
          ref={primaryRef}
          type="button"
          className="help-menu__primary help-btn appearance-btn appearance-btn--filled"
          onClick={() => helpStore.setMode(!mode)}
        >
          {mode ? t('ui.menu.exit') : t('ui.menu.explore')}
        </button>
        {!mode ? <p className="help-menu__hint">{t('ui.menu.exploreHint')}</p> : null}

        <button type="button" className="help-menu__row help-btn appearance-btn appearance-btn--ghost" onClick={() => helpStore.openManual(null)}>
          {t('ui.menu.manual')}
        </button>
        <p className="help-menu__hint">{t('ui.menu.manualHint')}</p>

        {tours.length ? (
          <section className="help-menu__section" aria-labelledby="help-menu-tours">
            <h3 id="help-menu-tours" className="help-menu__h">{t('ui.menu.tours')}</h3>
            {paused ? (
              <button
                type="button"
                className="help-menu__row help-btn appearance-btn appearance-btn--filled"
                onClick={() => onStartTour?.(paused.id, flags.paused.index)}
              >
                {t('ui.menu.resume', { title: paused.title })}
              </button>
            ) : null}
            <ul className="help-tour-list">
              {tours.map(item => {
                const done = flags.completed.includes(item.id);
                return (
                  <li key={item.id} className="help-tour-list__item">
                    <div className="help-tour-list__text">
                      <span className="help-tour-list__title">{item.title}</span>
                      {done ? <span className="help-tour-list__done">{t('ui.menu.done')}</span> : null}
                      <span className="help-tour-list__desc">{item.description}</span>
                    </div>
                    <button type="button" className="help-btn appearance-btn appearance-btn--ghost" onClick={() => onStartTour?.(item.id, 0)}>
                      {done ? t('ui.menu.again') : t('ui.menu.start')}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {tours.length ? <p className="help-menu__note">{t('ui.menu.difference')}</p> : null}
      </div>
    </div>
  );
}
