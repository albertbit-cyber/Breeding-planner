import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { checkFeatureAccess, fetchPublicSubscriptionTiers } from "../../shared/apiClient";
import { useSharedBackend } from "../../contexts/SharedBackendContext.jsx";
import { ANIMAL_CAP_FEATURE } from "./animalCap";

/**
 * The account's feature access, fetched once after sign-in and kept.
 *
 * Only the features the backend actually gates for a breeder are asked about.
 * The answer is stored on the device so a reload or a dropped connection still
 * knows the account's limits; it is cleared when the account is signed out.
 * A feature that could not be checked is left unknown, never treated as denied:
 * the app works on this device either way, and the backend still enforces.
 */
export const GATED_FEATURES = [ANIMAL_CAP_FEATURE, "marketplace.create_listing"];

const STORAGE_KEY = "serpentora.featureAccess.v1";

const EMPTY = { access: {}, tiers: [], fetchedAt: null };

const readCache = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (parsed && typeof parsed === "object" && parsed.access) return { ...EMPTY, ...parsed };
  } catch {
    // ignore - storage may be unavailable or hold something older
  }
  return EMPTY;
};

const writeCache = (value) => {
  try {
    if (value) localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore - the in-memory copy still serves this session
  }
};

const FeatureAccessContext = createContext({
  ...EMPTY,
  status: "idle",
  refresh: async () => {},
  openUpgrade: () => {},
  setUpgradeHandler: () => {},
});

export function FeatureAccessProvider({ children }) {
  const { snapshot } = useSharedBackend();
  const [cached, setCached] = useState(readCache);
  const [status, setStatus] = useState("idle");
  const fetchedForSession = useRef(false);
  const upgradeHandler = useRef(null);

  const signedIn = snapshot?.state === "connected" && snapshot?.authStatus === "authorized";
  // Only a reachable backend can say the account is signed out; offline keeps the cache.
  const signedOut = snapshot?.state === "connected" && snapshot?.authStatus === "unauthorized";

  const refresh = useCallback(async () => {
    setStatus("loading");
    const [tiersResult, ...accessResults] = await Promise.allSettled([
      fetchPublicSubscriptionTiers(),
      ...GATED_FEATURES.map((featureKey) => checkFeatureAccess(featureKey)),
    ]);
    setCached((previous) => {
      const access = { ...previous.access };
      GATED_FEATURES.forEach((featureKey, index) => {
        const result = accessResults[index];
        if (result.status === "fulfilled" && result.value && typeof result.value === "object") {
          access[featureKey] = result.value;
        }
      });
      const tiers = tiersResult.status === "fulfilled" && Array.isArray(tiersResult.value?.tiers)
        ? tiersResult.value.tiers
        : previous.tiers;
      const next = { access, tiers, fetchedAt: new Date().toISOString() };
      writeCache(next);
      return next;
    });
    setStatus(accessResults.some((result) => result.status === "rejected") ? "partial" : "ready");
  }, []);

  useEffect(() => {
    if (signedIn && !fetchedForSession.current) {
      fetchedForSession.current = true;
      refresh();
    }
    if (signedOut) {
      fetchedForSession.current = false;
      writeCache(null);
      setCached(EMPTY);
      setStatus("idle");
    }
  }, [refresh, signedIn, signedOut]);

  const setUpgradeHandler = useCallback((handler) => {
    upgradeHandler.current = typeof handler === "function" ? handler : null;
  }, []);

  const openUpgrade = useCallback(() => {
    upgradeHandler.current?.();
  }, []);

  const value = useMemo(() => ({
    ...cached,
    status,
    refresh,
    openUpgrade,
    setUpgradeHandler,
  }), [cached, openUpgrade, refresh, setUpgradeHandler, status]);

  return <FeatureAccessContext.Provider value={value}>{children}</FeatureAccessContext.Provider>;
}

export const useFeatureAccess = () => useContext(FeatureAccessContext);
