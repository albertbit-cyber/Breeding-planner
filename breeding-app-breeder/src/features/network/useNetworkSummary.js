import { useCallback, useEffect, useRef, useState } from 'react';
import { hasStoredAuthSession } from '../../shared/apiClient';
import { networkApi } from './networkApi.js';

const POLL_MS = 60_000;

/**
 * The Messages badge: unread conversations, open requests, animals offered to you and project
 * invitations. Polls once a minute while the window is visible, and right away when it comes
 * back into view. Silent when signed out or offline: the badge simply shows nothing.
 */
export default function useNetworkSummary(enabled = true) {
  const [summary, setSummary] = useState(null);
  const liveRef = useRef(true);

  const refresh = useCallback(async () => {
    if (!enabled || !hasStoredAuthSession()) {
      setSummary(null);
      return null;
    }
    try {
      const next = await networkApi.summary();
      if (liveRef.current) setSummary(next || null);
      return next;
    } catch {
      return null;
    }
  }, [enabled]);

  useEffect(() => {
    liveRef.current = true;
    refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      liveRef.current = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  return { summary, refresh, badge: Number(summary?.total) || 0 };
}
