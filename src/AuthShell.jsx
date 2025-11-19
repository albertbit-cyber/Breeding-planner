import React from "react";
import BreedingPlannerApp from "./App.jsx";
import AuthGate from "./features/auth/AuthGate.jsx";

export default function AppShell() {
  return (
    <AuthGate>
      <BreedingPlannerApp />
    </AuthGate>
  );
}
