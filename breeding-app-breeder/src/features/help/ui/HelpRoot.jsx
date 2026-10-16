import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { helpStore, useHelpState } from '../helpStore';
import HelpModePill from './HelpModePill';
import HelpPopover from './HelpPopover';
import HelpMenu from './HelpMenu';
import HelpManual from './HelpManual';
import TourLayer from '../tours/TourLayer';
import { TOURS } from '../tours/registry';
import { useTranslation } from 'react-i18next';
import './help.css';

// The window an explanation stays open through: a pressed control scrolls itself into
// view just after the press, and that scroll must not close what it just opened.
const SCROLL_GRACE_MS = 500;

// Everything help draws, in one portal on <body>, above every app overlay.
export default function HelpRoot({ getTourContext, onNavigate, onOffer }) {
  const { t } = useTranslation('help');
  const tours = TOURS.map(tour => ({ id: tour.id, title: t(tour.title), description: t(tour.description) }));
  const touring = useHelpState(state => !!state.tour);
  const mode = useHelpState(state => state.mode);
  const menuOpen = useHelpState(state => state.menuOpen);
  const manualOpen = useHelpState(state => state.manualOpen);
  const manualTopic = useHelpState(state => state.manualTopic);
  const popover = useHelpState(state => state.popover);

  useEffect(() => {
    document.body.classList.toggle('help-mode', mode);
    return () => document.body.classList.remove('help-mode');
  }, [mode]);

  // Escape closes the innermost help layer first. With nothing of help's open it is
  // left alone, so the app's own Escape still works.
  useEffect(() => {
    const onKey = (event) => {
      if (event.key !== 'Escape') return;
      const state = helpStore.getState();
      let handled = true;
      if (state.popover) helpStore.closePopover();
      else if (state.manualOpen) helpStore.closeManual();
      else if (state.menuOpen) helpStore.closeMenu();
      else handled = false;
      if (handled) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  // A scroll outside the popover (after the grace period) or a resize closes it.
  useEffect(() => {
    if (!popover) return undefined;
    const openedAt = Date.now();
    const onScroll = (event) => {
      if (Date.now() - openedAt < SCROLL_GRACE_MS) return;
      const target = event.target;
      if (target instanceof Element && target.closest('.help-popover')) return;
      helpStore.closePopover();
    };
    const onResize = () => helpStore.closePopover();
    window.addEventListener('scroll', onScroll, { capture: true, passive: true });
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', onScroll, { capture: true });
      window.removeEventListener('resize', onResize);
    };
  }, [popover]);

  // Closing the menu or manual hands focus back to what opened it (the ?, usually).
  const windowOpen = menuOpen || manualOpen;
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !windowOpen) {
      const opener = helpStore.takeOpener();
      if (opener && opener.isConnected && typeof opener.focus === 'function') opener.focus({ preventScroll: true });
    }
    wasOpen.current = windowOpen;
  }, [windowOpen]);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <>
      {mode ? <HelpModePill /> : null}
      {popover ? <HelpPopover key="popover" popover={popover} /> : null}
      {menuOpen ? <HelpMenu tours={tours} onStartTour={(id, at) => helpStore.startTour(id, at)} /> : null}
      {manualOpen ? <HelpManual topicId={manualTopic} /> : null}
      {touring ? <TourLayer getAppContext={getTourContext} onNavigate={onNavigate} onOffer={onOffer} /> : null}
    </>,
    document.body,
  );
}
