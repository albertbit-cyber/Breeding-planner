import React from "react";
import LabAppShell from "./features/lab/LabAppShell.jsx";
import AuthGate from "./features/auth/AuthGate.jsx";
import { AppearanceProvider } from "./contexts/AppearanceContext.jsx";
import { SharedBackendProvider } from "./contexts/SharedBackendContext.jsx";
import SharedBackendBanner from "./components/SharedBackendBanner.jsx";
import { BatchOrderProvider } from "./features/lab/contexts/BatchOrderContext.jsx";

import { entryHashFor } from "./features/auth/entryHash";

// Ensure hash is rooted at /lab so AuthGate uses "lab" scope (not "breeder"),
// matching the breedingPlannerLabAuthSession key that roleGuard reads.
if (typeof window !== "undefined") {
  const next = entryHashFor(window.location.hash);
  if (next) window.location.hash = next;
}

export default function AppEntry() {
  return (
    <AppearanceProvider>
      <SharedBackendProvider>
        <BatchOrderProvider>
          {/* Full diagnostics in dev; production only speaks up when the backend is unreachable. */}
          <SharedBackendBanner quiet={!import.meta.env.DEV} />
          <AuthGate>
            <LabAppShell />
          </AuthGate>
        </BatchOrderProvider>
      </SharedBackendProvider>
    </AppearanceProvider>
  );
}

