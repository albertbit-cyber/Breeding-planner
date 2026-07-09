import React from "react";
import BreedingPlannerApp from "./App.jsx";
import MobileApp from "./features/mobile/MobileApp.jsx";
import AuthGate from "./features/auth/AuthGate.jsx";
import { AppearanceProvider } from "./contexts/AppearanceContext.jsx";
import { SharedBackendProvider } from "./contexts/SharedBackendContext.jsx";
import SharedBackendBanner from "./components/SharedBackendBanner.jsx";
import { BatchOrderProvider } from "./features/lab/contexts/BatchOrderContext.jsx";

const isNativeMobileShell = () => {
  if (import.meta.env.VITE_PLATFORM === "android") return true;
  try {
    return Boolean(window?.Capacitor?.isNativePlatform?.() || window?.Capacitor?.getPlatform?.() === "android");
  } catch {
    return false;
  }
};

export default function AppEntry() {
  if (isNativeMobileShell()) {
    return (
      <AppearanceProvider>
        <SharedBackendProvider>
          <BatchOrderProvider>
            <MobileApp />
          </BatchOrderProvider>
        </SharedBackendProvider>
      </AppearanceProvider>
    );
  }

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

