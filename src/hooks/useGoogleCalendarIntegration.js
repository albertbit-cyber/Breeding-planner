import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const GIS_SRC = "https://accounts.google.com/gsi/client";
const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
const USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v2/userinfo";
const CALENDAR_LIST_ENDPOINT = "https://www.googleapis.com/calendar/v3/users/me/calendarList";

const scriptPromises = new Map();

function loadScript(src) {
  if (scriptPromises.has(src)) {
    return scriptPromises.get(src);
  }

  const promise = new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("Google identity services require a browser environment."));
      return;
    }

    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === "true") {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Failed to load Google Identity Services.")));
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      script.dataset.loaded = "true";
      resolve();
    };
    script.onerror = () => reject(new Error("Failed to load Google Identity Services."));
    document.head.appendChild(script);
  });

  scriptPromises.set(src, promise);
  return promise;
}

export function useGoogleCalendarIntegration() {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const isSupported = Boolean(clientId);

  const tokenClientRef = useRef(null);
  const [isReady, setIsReady] = useState(false);
  const [accessToken, setAccessToken] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [calendars, setCalendars] = useState([]);
  const [selectedCalendarId, setSelectedCalendarId] = useState("primary");
  const [lastError, setLastError] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoadingCalendars, setIsLoadingCalendars] = useState(false);

  useEffect(() => {
    if (!isSupported) return;

    let cancelled = false;

    loadScript(GIS_SRC)
      .then(() => {
        if (cancelled) return;
        const google = window.google;
        if (!google?.accounts?.oauth2) {
          throw new Error("Google Identity Services unavailable in this environment.");
        }
        tokenClientRef.current = google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: GOOGLE_CALENDAR_SCOPE,
          callback: () => {},
        });
        setIsReady(true);
      })
      .catch((err) => {
        if (!cancelled) {
          setLastError(err instanceof Error ? err : new Error(String(err)));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [clientId, isSupported]);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;

    const headers = { Authorization: `Bearer ${accessToken}` };

    const fetchProfileAndCalendars = async () => {
      try {
        setLastError(null);
        const userResponse = await fetch(USERINFO_ENDPOINT, { headers });
        if (!userResponse.ok) {
          const info = await userResponse.json().catch(() => ({}));
          throw new Error(info?.error?.message || "Unable to fetch Google profile.");
        }
        const profile = await userResponse.json();
        if (cancelled) return;
        setUserProfile({
          name: profile?.name || profile?.email || "Google user",
          email: profile?.email || "",
        });

        setIsLoadingCalendars(true);
        const calendarRes = await fetch(CALENDAR_LIST_ENDPOINT, { headers });
        if (!calendarRes.ok) {
          const info = await calendarRes.json().catch(() => ({}));
          throw new Error(info?.error?.message || "Unable to fetch calendar list.");
        }
        const calendarJson = await calendarRes.json();
        if (cancelled) return;
        setCalendars(Array.isArray(calendarJson.items) ? calendarJson.items : []);
        if (!selectedCalendarId && calendarJson.items?.length) {
          setSelectedCalendarId(calendarJson.items[0].id);
        }
      } catch (error) {
        if (!cancelled) {
          setLastError(error instanceof Error ? error : new Error(String(error)));
        }
      } finally {
        if (!cancelled) {
          setIsLoadingCalendars(false);
        }
      }
    };

    fetchProfileAndCalendars();

    return () => {
      cancelled = true;
    };
  }, [accessToken, selectedCalendarId]);

  const signIn = useCallback(() => {
    if (!tokenClientRef.current) {
      setLastError(new Error("Google services are still loading."));
      return;
    }
    setLastError(null);
    tokenClientRef.current.callback = (response) => {
      if (response?.error) {
        setLastError(new Error(response.error));
        return;
      }
      if (response?.access_token) {
        setAccessToken(response.access_token);
      }
    };
    tokenClientRef.current.requestAccessToken({ prompt: accessToken ? "" : "consent" });
  }, [accessToken]);

  const signOut = useCallback(() => {
    if (accessToken && window.google?.accounts?.oauth2?.revoke) {
      try {
        window.google.accounts.oauth2.revoke(accessToken);
      } catch (err) {
        // ignore revoke failures
      }
    }
    setAccessToken(null);
    setUserProfile(null);
    setCalendars([]);
    setSelectedCalendarId("primary");
  }, [accessToken]);

  const syncEvents = useCallback(
    async (eventPayloads) => {
      if (!accessToken) {
        throw new Error("Connect Google Calendar before syncing.");
      }
      if (!selectedCalendarId) {
        throw new Error("Select a target calendar.");
      }
      if (!Array.isArray(eventPayloads) || !eventPayloads.length) {
        return { synced: 0 };
      }

      setIsSyncing(true);
      setLastError(null);

      try {
        let synced = 0;
        const calendarId = encodeURIComponent(selectedCalendarId);
        for (const payload of eventPayloads) {
          const body = {
            summary: payload.summary,
            description: payload.description || undefined,
            start: { date: payload.startDate },
            end: { date: payload.endDate },
            iCalUID: payload.uid,
            source: payload.source || undefined,
            extendedProperties: payload.extendedProperties || undefined,
          };

          const response = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/import`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(body),
            }
          );

          if (!response.ok) {
            const info = await response.json().catch(() => ({}));
            throw new Error(info?.error?.message || `Failed to sync event: ${payload.summary}`);
          }

          synced += 1;
        }

        return { synced };
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        setLastError(err);
        throw err;
      } finally {
        setIsSyncing(false);
      }
    },
    [accessToken, selectedCalendarId]
  );

  return {
    isSupported,
    isReady,
    isSignedIn: Boolean(accessToken),
    user: userProfile,
    calendars,
    selectedCalendarId,
    setSelectedCalendarId,
    isLoadingCalendars,
    isSyncing,
    lastError,
    signIn,
    signOut,
    syncEvents,
  };
}
