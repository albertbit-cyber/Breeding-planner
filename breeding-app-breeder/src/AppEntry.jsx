import React, { useEffect } from "react";
import BreedingPlannerApp from "./App.jsx";
import AuthGate from "./features/auth/AuthGate.jsx";
import { AppearanceProvider } from "./contexts/AppearanceContext.jsx";
import { SharedBackendProvider } from "./contexts/SharedBackendContext.jsx";
import { FeatureAccessProvider } from "./features/subscriptions/FeatureAccessContext.jsx";
import SharedBackendBanner from "./components/SharedBackendBanner.jsx";
import { BatchOrderProvider } from "./features/lab/contexts/BatchOrderContext.jsx";
import { initPlatform, isNativeShell } from "./platform/index.js";

// One app on every platform. The Android shell used to mount a separate, smaller app here,
// which is why the phone lacked backups and most modules; it now runs Serpentora itself and
// the differences between browser, Electron and the phone live in src/platform/.
export default function AppEntry() {
  useEffect(() => {
    initPlatform();
  }, []);

  return (
    <AppearanceProvider>
      <SharedBackendProvider>
        <FeatureAccessProvider>
          <BatchOrderProvider>
            {/* Diagnostics are for developers; production shows a status dot in Settings. */}
            {import.meta.env.DEV && !isNativeShell ? <SharedBackendBanner /> : null}
            <AuthGate>
              <BreedingPlannerApp />
            </AuthGate>
          </BatchOrderProvider>
        </FeatureAccessProvider>
      </SharedBackendProvider>
    </AppearanceProvider>
  );
}
