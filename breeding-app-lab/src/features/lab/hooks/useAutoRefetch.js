import { useCallback, useEffect, useRef } from "react";

/**
 * Shared auto-refresh hook used across the lab pages.
 *
 * Triggers a re-fetch:
 *   - Immediately on mount
 *   - Every `intervalMs` milliseconds
 *   - When the window regains focus
 *   - When any of the custom `events` are dispatched on `window`
 *
 * `fetchFn` is called with `{ initial }`. Only the mount call is initial; every
 * other one is a background refresh. Pages use that to keep showing what they
 * already have instead of tearing the view down and rendering a spinner --
 * whoever is reading the queue did not ask for it to vanish every twenty
 * seconds, and whatever they had open in it went with it.
 *
 * @param {(context: { initial: boolean }) => void | Promise<void>} fetchFn
 * @param {{ intervalMs?: number, events?: string[], focusThrottleMs?: number }} options
 * @returns {{ refetch: () => void }}
 */
export function useAutoRefetch(fetchFn, { intervalMs = 30_000, events = [], focusThrottleMs = 5_000 } = {}) {
  const fetchFnRef = useRef(fetchFn);
  const lastFetchAtRef = useRef(0);
  const hasLoadedOnceRef = useRef(false);

  // Keep the ref current so the interval and listeners always call the latest
  // version without being re-registered when fetchFn changes identity.
  useEffect(() => {
    fetchFnRef.current = fetchFn;
  }, [fetchFn]);

  const run = useCallback((options) => {
    lastFetchAtRef.current = Date.now();
    // `initial` means "show that something is happening": the first load, and an
    // explicit press of Refresh, because a person asked and deserves feedback.
    // The timer, the window regaining focus and the workflow events are all
    // background, and must leave what is on screen alone.
    const initial = options?.initial ?? !hasLoadedOnceRef.current;
    hasLoadedOnceRef.current = true;
    fetchFnRef.current({ initial });
  }, []);

  // Ignores whatever it is handed -- it is wired straight to onClick in places,
  // and a MouseEvent must not be read as options.
  const refetch = useCallback(() => run({ initial: true }), [run]);

  // The event list is almost always written inline at the call site, so it is a
  // new array on every render. Depending on it directly tore this effect down
  // and rebuilt the interval on every render, which quietly reset the countdown
  // and made the poll fire late or not at all.
  const eventsKey = events.join("|");

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const names = eventsKey ? eventsKey.split("|") : [];

    const handleEvent = () => run({ initial: false });

    // A window that is alt-tabbed away from and back to -- to read a tube label,
    // or a paper form -- would otherwise refetch on every single return.
    const handleFocus = () => {
      if (Date.now() - lastFetchAtRef.current < focusThrottleMs) return;
      run({ initial: false });
    };

    names.forEach((name) => window.addEventListener(name, handleEvent));
    window.addEventListener("focus", handleFocus);
    const timer = window.setInterval(handleEvent, intervalMs);

    return () => {
      names.forEach((name) => window.removeEventListener(name, handleEvent));
      window.removeEventListener("focus", handleFocus);
      window.clearInterval(timer);
    };
  }, [run, intervalMs, eventsKey, focusThrottleMs]);

  // Mount.
  useEffect(() => {
    run();
  }, [run]);

  return { refetch };
}
