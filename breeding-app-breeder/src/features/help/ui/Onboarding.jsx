import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { helpStore, useHelpState } from '../helpStore';
import { getTour } from '../tours/registry';

const INVITE_DELAY_MS = 900;

// The first-visit invitation: an inline card in the page flow, never a modal. Shown once,
// to a keeper with nothing of their own yet, when no window and no tour is open, after a
// short pause. Either answer is remembered; so is starting any tour.
export function TourInvitation({ eligible }) {
  const { t } = useTranslation('help');
  const invited = useHelpState(state => state.flags.invited);
  const busy = useHelpState(state => !!state.tour || state.mode || state.menuOpen || state.manualOpen);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!eligible || invited) return undefined;
    const timer = window.setTimeout(() => {
      if (!document.querySelector('[data-dialog]')) setReady(true);
    }, INVITE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [eligible, invited]);

  if (!eligible || invited || busy || !ready) return null;
  return (
    <section className="help-invite" data-help-ui="" aria-labelledby="help-invite-title">
      <div className="help-invite__text">
        <h2 id="help-invite-title" className="help-invite__title">{t('ui.invite.title')}</h2>
        <p className="help-invite__line">{t('ui.invite.text')}</p>
      </div>
      <div className="help-invite__actions">
        <button type="button" className="help-btn appearance-btn appearance-btn--filled" onClick={() => helpStore.startTour('essentials')}>
          {t('ui.invite.start')}
        </button>
        <button type="button" className="help-btn appearance-btn appearance-btn--ghost" onClick={() => helpStore.dismissInvitation()}>
          {t('ui.invite.notNow')}
        </button>
      </div>
    </section>
  );
}

// A small note under the ? until it is dismissed (or Help Mode or the manual is used).
// Hidden while Help Mode, a tour, the menu or the invitation has the keeper's attention.
export function HelpHint() {
  const { t } = useTranslation('help');
  const show = useHelpState(state => (
    state.flags.invited
    && !state.flags.helpHintDismissed
    && !state.mode
    && !state.tour
    && !state.menuOpen
    && !state.manualOpen
  ));
  if (!show) return null;
  return (
    <div className="help-hint" role="note" data-help-ui="">
      <span className="help-hint__text">{t('ui.hint.text')}</span>
      <button type="button" className="help-link help-hint__dismiss" onClick={() => helpStore.dismissHint()}>
        {t('ui.hint.dismiss')}
      </button>
    </div>
  );
}

// "Take a short tour" in a screen's header: a quiet text link, nothing more.
export function TourLink({ tour, className = '' }) {
  const { t } = useTranslation('help');
  const touring = useHelpState(state => !!state.tour);
  if (!getTour(tour) || touring) return null;
  return (
    <button
      type="button"
      data-help-ui=""
      className={`help-link help-tour-link ${className}`}
      onClick={() => helpStore.startTour(tour)}
    >
      {t('ui.tour.link')}
    </button>
  );
}

const SCREEN_TOURS = {
  dashboard: 'tour-dashboard',
  animals: 'tour-animals',
  pairings: 'tour-breeding',
  advisor: 'tour-advisor',
  familyTree: 'tour-family-tree',
  spaces: 'tour-spaces',
  quarantine: 'tour-quarantine',
  calendar: 'tour-calendar',
  shedTerminal: 'tour-lab',
  setup: 'tour-settings',
};

// The link row above each screen: the tour for whichever screen is open.
export function ScreenTourLink({ tab }) {
  const tour = SCREEN_TOURS[tab];
  if (!tour) return null;
  return (
    <div className="help-tour-link-row">
      <TourLink tour={tour} />
    </div>
  );
}
