import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * Who is looking, and what they were trying to do before we asked them to
 * sign in.
 *
 * The marketplace is public: browsing, filtering, opening a listing and opening
 * a store all work signed out. Authentication is requested at the moment of an
 * action that genuinely needs an identity -- saving, messaging, offering,
 * selling -- and the action is replayed afterwards rather than lost.
 */

const AUTH_SESSION_KEY = "breedingPlannerBreederAuthSession";
const LEGACY_AUTH_SESSION_KEY = "breedingPlannerAuthSession";
const INTENT_KEY = "serpentoraMarketIntent";

export const SESSION_EVENT = "serpentora:session";

const readRaw = () => {
  try {
    return (
      localStorage.getItem(AUTH_SESSION_KEY) || localStorage.getItem(LEGACY_AUTH_SESSION_KEY) || ""
    );
  } catch {
    return "";
  }
};

export const readSession = () => {
  try {
    const parsed = JSON.parse(readRaw() || "null");
    if (!parsed || parsed.isAuthenticated !== true) return ANONYMOUS;
    const profile = parsed.profile || {};
    const role = String(parsed.role || profile.role || "").trim().toLowerCase();
    return {
      isAuthenticated: true,
      userId: parsed.userId || profile.id || profile.userId || "",
      role,
      isSeller: role === "breeder" || role === "admin",
      isAdmin: role === "admin",
      displayName: profile.displayName || profile.fullName || parsed.username || "Keeper",
    };
  } catch {
    return ANONYMOUS;
  }
};

const ANONYMOUS = Object.freeze({
  isAuthenticated: false,
  userId: "",
  role: "",
  isSeller: false,
  isAdmin: false,
  displayName: "",
});

/**
 * `storage` only fires in *other* tabs, so signing in inside this one has to
 * announce itself. AuthGate writes the session and we re-read on both signals.
 */
export const announceSessionChange = () => {
  try {
    window.dispatchEvent(new Event(SESSION_EVENT));
  } catch {
    // Older browsers without the Event constructor simply miss the nudge.
  }
};

export const useSession = () => {
  const [session, setSession] = useState(readSession);

  useEffect(() => {
    const refresh = () => setSession(readSession());
    window.addEventListener("storage", refresh);
    window.addEventListener(SESSION_EVENT, refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener(SESSION_EVENT, refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  return session;
};

/* ── Held intent ─────────────────────────────────────────────────────────── */

export const rememberIntent = (intent) => {
  try {
    sessionStorage.setItem(INTENT_KEY, JSON.stringify({ ...intent, at: Date.now() }));
  } catch {
    // A held intent is a convenience; losing it only costs a repeated click.
  }
};

export const peekIntent = () => {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(INTENT_KEY) || "null");
    if (!parsed) return null;
    // Anything older than an hour is stale enough to be surprising.
    if (Date.now() - Number(parsed.at || 0) > 3600000) return null;
    return parsed;
  } catch {
    return null;
  }
};

export const takeIntent = () => {
  const intent = peekIntent();
  try {
    sessionStorage.removeItem(INTENT_KEY);
  } catch {
    // ignore
  }
  return intent;
};

/**
 * Wraps an action that needs an account. Returns `[run, pending]` where
 * `pending` is the intent to show in the sign-in sheet, or null.
 */
export const useAuthAction = () => {
  const session = useSession();
  const [pending, setPending] = useState(null);

  const run = useCallback(
    (intent, action) => {
      if (session.isAuthenticated) {
        action();
        return true;
      }
      rememberIntent(intent);
      setPending(intent);
      return false;
    },
    [session.isAuthenticated]
  );

  const dismiss = useCallback(() => setPending(null), []);

  return useMemo(() => ({ run, pending, dismiss, session }), [run, pending, dismiss, session]);
};
