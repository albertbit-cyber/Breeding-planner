import React from "react";
import BreedingPlannerApp from "./App.jsx";
import AuthGate from "./features/auth/AuthGate.jsx";
import { AppearanceProvider } from "./contexts/AppearanceContext.jsx";

export default function AppShell() {
  return (
    <AppearanceProvider>
      <AuthGate>
        <BreedingPlannerApp />
      </AuthGate>
    </AppearanceProvider>
  );
}
