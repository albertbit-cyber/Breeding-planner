import React from "react";
import MarketplacePage from "./features/marketplace/MarketplacePage.jsx";
import AuthGate from "./features/auth/AuthGate.jsx";
import { AppearanceProvider } from "./contexts/AppearanceContext.jsx";
import { SharedBackendProvider } from "./contexts/SharedBackendContext.jsx";
import SharedBackendBanner from "./components/SharedBackendBanner.jsx";

export default function AppEntry() {
  return (
    <AppearanceProvider>
      <SharedBackendProvider>
        <SharedBackendBanner />
        <AuthGate>
          <MarketplacePage />
        </AuthGate>
      </SharedBackendProvider>
    </AppearanceProvider>
  );
}

