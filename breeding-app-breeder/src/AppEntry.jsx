import React from "react";
import BreedingPlannerApp from "./App.jsx";
import AuthGate from "./features/auth/AuthGate.jsx";
import { AppearanceProvider } from "./contexts/AppearanceContext.jsx";
import { SharedBackendProvider } from "./contexts/SharedBackendContext.jsx";
import SharedBackendBanner from "./components/SharedBackendBanner.jsx";
import { BatchOrderProvider } from "./features/lab/contexts/BatchOrderContext.jsx";

export default function AppEntry() {
  return (
    <AppearanceProvider>
      <SharedBackendProvider>
        <BatchOrderProvider>
          <SharedBackendBanner />
          <AuthGate>
            <BreedingPlannerApp />
          </AuthGate>
        </BatchOrderProvider>
      </SharedBackendProvider>
    </AppearanceProvider>
  );
}

