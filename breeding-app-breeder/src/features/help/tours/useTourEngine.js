import { useCallback, useEffect, useRef, useState } from 'react';
import { helpStore, useHelpState } from '../helpStore';
import { findTarget, openDialog } from './findTarget';
import { getTour } from './registry';

const TICK_MS = 250;
const MISSING_AFTER_MS = 1400;
const ADVANCE_MS = 700;
const ADVANCE_REDUCED_MS = 300;

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const numericCounts = (data) =>
  Object.fromEntries(Object.entries(data || {}).filter(([, value]) => typeof value === 'number'));

const sameRect = (a, b) => !!a && !!b && a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height;

// One engine per window. Every 250ms, and on scroll or resize (one frame later), it finds
// the step's target, measures it, and re-checks the step's done() against the app's own
// state. When a do step first turns true it arms once, shows "Done", and moves on after
// 700ms (300ms with reduced motion), but only if that same step is still the active one.
//
// getAppContext() returns { data, route, view } from the app's state; the engine adds
// modal, base and has().
export function useTourEngine(getAppContext) {
  const active = useHelpState(state => state.tour);
  const tour = active ? getTour(active.id) : null;
  const step = tour ? tour.steps[active.index] : null;
  const key = active ? `${active.id}:${active.index}` : null;

  const [rect, setRect] = useState(null);
  const [avoidRects, setAvoidRects] = useState([]);
  const [missing, setMissing] = useState(false);
  const [doneKey, setDoneKey] = useState(null);

  const armed = useRef(null);
  const missingSince = useRef(0);
  const scrolledFor = useRef(null);
  const contextRef = useRef(getAppContext);
  contextRef.current = getAppContext;

  const buildContext = useCallback(() => {
    const app = contextRef.current?.() || { data: {}, route: [], view: {} };
    const base = helpStore.getState().tour?.base || {};
    const dialog = typeof document !== 'undefined' ? openDialog(document) : null;
    return {
      data: app.data || {},
      route: app.route || [],
      view: { ...(app.view || {}), manualOpen: helpStore.getState().manualOpen, menuOpen: helpStore.getState().menuOpen },
      // Until the engine has recorded the baseline, nothing that already exists counts.
      base: Object.keys(base).length ? base : numericCounts(app.data),
      modal: dialog ? dialog.getAttribute('data-dialog') : null,
      has: target => !!findTarget(target),
    };
  }, []);

  // A new step: record what exists now, restart the missing timer, disarm.
  useEffect(() => {
    if (!key) return;
    const app = contextRef.current?.() || { data: {} };
    helpStore.setTourBase(numericCounts(app.data));
    missingSince.current = Date.now();
    armed.current = null;
    scrolledFor.current = null;
    setMissing(false);
    setDoneKey(null);
  }, [key]);

  const tick = useCallback(() => {
    if (!step || !key) return;
    const element = step.target ? findTarget(step.target) : null;

    if (element && scrolledFor.current !== key && !step.noScroll) {
      scrolledFor.current = key;
      const box = element.getBoundingClientRect();
      const offscreen = box.bottom < 0 || box.top > window.innerHeight || box.right < 0 || box.left > window.innerWidth;
      if (offscreen) element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    }

    const box = element ? element.getBoundingClientRect() : null;
    const next = box ? { top: box.top, left: box.left, width: box.width, height: box.height } : null;
    setRect(prev => (sameRect(prev, next) || (!prev && !next) ? prev : next));
    const avoid = (step.avoid || [])
      .map(id => findTarget(id))
      .filter(Boolean)
      .map(node => { const r = node.getBoundingClientRect(); return { top: r.top, left: r.left, width: r.width, height: r.height }; });
    setAvoidRects(prev => (prev.length === avoid.length && prev.every((r, i) => sameRect(r, avoid[i])) ? prev : avoid));

    if (!step.target || element) {
      missingSince.current = Date.now();
      setMissing(false);
    } else if (Date.now() - missingSince.current >= MISSING_AFTER_MS) {
      setMissing(true);
    }

    if (step.kind === 'do' && typeof step.done === 'function' && armed.current !== key) {
      let done = false;
      try {
        done = !!step.done(buildContext());
      } catch {
        done = false;
      }
      if (done) {
        armed.current = key;
        setDoneKey(key);
        window.setTimeout(() => {
          const current = helpStore.getState().tour;
          if (current && `${current.id}:${current.index}` === key) helpStore.nextStep();
        }, prefersReducedMotion() ? ADVANCE_REDUCED_MS : ADVANCE_MS);
      }
    }
  }, [step, key, buildContext]);

  useEffect(() => {
    if (!key) return undefined;
    tick();
    const interval = window.setInterval(tick, TICK_MS);
    let frame = 0;
    const onMove = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => { frame = 0; tick(); });
    };
    window.addEventListener('scroll', onMove, { capture: true, passive: true });
    window.addEventListener('resize', onMove);
    return () => {
      window.clearInterval(interval);
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onMove, { capture: true });
      window.removeEventListener('resize', onMove);
    };
  }, [key, tick]);

  return {
    tour,
    step,
    index: active?.index ?? 0,
    rect,
    avoidRects,
    missing,
    done: !!key && doneKey === key,
  };
}
