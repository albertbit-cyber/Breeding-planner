import React from "react";
import LabAppShell from "./features/lab/LabAppShell.jsx";
import AuthGate from "./features/auth/AuthGate.jsx";
import { AppearanceProvider } from "./contexts/AppearanceContext.jsx";
import { SharedBackendProvider } from "./contexts/SharedBackendContext.jsx";
import SharedBackendBanner from "./components/SharedBackendBanner.jsx";
import { BatchOrderProvider } from "./features/lab/contexts/BatchOrderContext.jsx";

// Ensure hash is rooted at /lab so AuthGate uses "lab" scope (not "breeder"),
// matching the breedingPlannerLabAuthSession key that roleGuard reads.
if (typeof window !== "undefined") {
  const hash = window.location.hash.replace(/^#/, "").trim();
  if (!hash || (!hash.startsWith("/lab") && !hash.startsWith("/admin"))) {
    window.location.hash = "#/lab";
  }
}

export default function AppEntry() {
  return (
    <AppearanceProvider>
      <SharedBackendProvider>
        <BatchOrderProvider>
          <SharedBackendBanner />
          <AuthGate>
            <LabAppShell />
          </AuthGate>
        </BatchOrderProvider>
      </SharedBackendProvider>
    </AppearanceProvider>
  );
}

