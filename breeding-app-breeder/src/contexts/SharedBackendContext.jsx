import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { getHealth, getCurrentUser, hasStoredAuthSession, normalizeSharedApiError, resetSharedBackendState } from "../shared/apiClient";
import { getSharedApiConfig } from "../shared/config/api";
import { getSharedBackendSnapshot, subscribeSharedBackendStatus } from "../shared/backendStatus";

const SharedBackendContext = createContext({
  snapshot: getSharedBackendSnapshot(),
  retry: async () => {},
  sharedFeaturesEnabled: false,
});

export function SharedBackendProvider({ children }) {
  const [snapshot, setSnapshot] = useState(() => getSharedBackendSnapshot());

  useEffect(() => subscribeSharedBackendStatus(setSnapshot), []);

  const runHealthCheck = async () => {
    resetSharedBackendState();
    const config = getSharedApiConfig();
    console.info("[shared-backend] env loaded:", config.rawUrl ? "yes" : "no");
    console.info("[shared-backend] active storage mode:", "backend-only");
    if (!config.ok) {
      console.warn("[shared-backend] local mode reason:", config.message);
      return;
    }
    try {
      const health = await getHealth();
      console.info("[shared-backend] backend health check success:", health);
      if (hasStoredAuthSession()) {
        try {
          await getCurrentUser();
          console.info("[shared-backend] auth status: authorized");
        } catch (error) {
          const normalized = normalizeSharedApiError(error);
          if (normalized.kind !== "unauthorized") throw normalized;
          console.warn("[shared-backend] auth status: unauthorized");
        }
      } else {
        console.info("[shared-backend] auth status: no stored auth session present");
      }
    } catch (error) {
      const normalized = normalizeSharedApiError(error);
      console.warn("[shared-backend] backend health check failed:", normalized.message, normalized);
    }
  };

  useEffect(() => {
    runHealthCheck();
  }, []);

  useEffect(() => {
    if (snapshot.config.warnings.length) {
      console.warn("[shared-backend] config warnings", snapshot.config.warnings);
    }
  }, [snapshot.config.warnings]);

  useEffect(() => {
    if (!snapshot.backendModeEnabled) {
      console.warn("[shared-backend] reason backend mode is disabled:", snapshot.reason);
    }
  }, [snapshot]);

  const value = useMemo(() => ({
    snapshot,
    retry: runHealthCheck,
    sharedFeaturesEnabled: snapshot.backendModeEnabled,
  }), [snapshot]);

  return (
    <SharedBackendContext.Provider value={value}>
      {children}
    </SharedBackendContext.Provider>
  );
}

export const useSharedBackend = () => useContext(SharedBackendContext);
