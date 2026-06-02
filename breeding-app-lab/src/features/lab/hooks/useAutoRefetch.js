import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Shared auto-refresh hook used across lab pages and the breeder panel.
 *
 * Triggers a re-fetch:
 *   - Immediately on mount
 *   - Every `intervalMs` milliseconds
 *   - When the window regains focus
 *   - When any of the custom `events` are dispatched on `window`
 *
 * @param {() => void | Promise<void>} fetchFn  Async or sync function to call on each refresh.
 * @param {{ intervalMs?: number, events?: string[] }} options
 * @returns {{ refetch: () => void }}
 */
export function useAutoRefetch(fetchFn, { intervalMs = 30_000, events = [] } = {}) {
  const [revision, setRevision] = useState(0);
  const fetchFnRef = useRef(fetchFn);

  // Keep ref current so the interval/event handlers always call the latest version
  // without needing to be re-registered when fetchFn changes.
  useEffect(() => {
    fetchFnRef.current = fetchFn;
  }, [fetchFn]);

  const refetch = useCallback(() => setRevision((r) => r + 1), []);

  // Register polling, focus listener, and custom event listeners.
  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const handle = () => refetch();

    const allEvents = [...events, "focus"];
    allEvents.forEach((evt) => window.addEventListener(evt, handle));

    const timer = window.setInterval(handle, intervalMs);

    return () => {
      allEvents.forEach((evt) => window.removeEventListener(evt, handle));
      window.clearInterval(timer);
    };
  }, [refetch, intervalMs, events]);

  // Call fetchFn whenever revision increments (mount + every trigger above).
  useEffect(() => {
    fetchFnRef.current();
  }, [revision]);

  return { refetch };
}
