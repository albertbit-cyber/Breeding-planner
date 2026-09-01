import React from "react";
import HomeApp from "./home/HomeApp.jsx";
import { AppearanceProvider } from "./contexts/AppearanceContext.jsx";
import { SharedBackendProvider } from "./contexts/SharedBackendContext.jsx";

// Deliberately no AuthGate and no SharedBackendBanner around the tree, unlike
// the sibling portals: this is the public front door, so a visitor who is
// signed out — or who arrives while the backend is down — must still get the
// whole marketing site. Only the sign-in and sign-up forms talk to the backend,
// and they surface their own errors inline.
export default function AppEntry() {
  return (
    <AppearanceProvider>
      <SharedBackendProvider>
        <HomeApp />
      </SharedBackendProvider>
    </AppearanceProvider>
  );
}
