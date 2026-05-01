import React, { useEffect, useState } from "react";
import BreedingPlannerApp from "./App.jsx";
import AuthGate from "./features/auth/AuthGate.jsx";
import LabAppShell from "./features/lab/LabAppShell.jsx";
import MarketplacePage from "./features/marketplace/MarketplacePage.jsx";
import { AppearanceProvider } from "./contexts/AppearanceContext.jsx";
import { SharedBackendProvider } from "./contexts/SharedBackendContext.jsx";
import SharedBackendBanner from "./components/SharedBackendBanner.jsx";
import { BatchOrderProvider } from "./features/lab/contexts/BatchOrderContext.jsx";

const normalizeHashPath = (hashValue) => {
  const raw = String(hashValue || "").replace(/^#/, "").trim();
  if (!raw) return "/";
  if (raw.startsWith("/")) return raw;
  return `/${raw}`;
};

const isLabSectionPath = (path) => normalizeHashPath(path).startsWith("/lab");
const isMarketplacePath = (path) => normalizeHashPath(path).startsWith("/marketplace");

function AppSectionRouter() {
  const [hashPath, setHashPath] = useState(() => normalizeHashPath(window?.location?.hash));

  useEffect(() => {
    const onHashChange = () => {
      setHashPath(normalizeHashPath(window.location.hash));
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  if (isLabSectionPath(hashPath)) {
    return <LabAppShell />;
  }

  if (isMarketplacePath(hashPath)) {
    return <MarketplacePage />;
  }

  return <BreedingPlannerApp />;
}

export default function AppShell() {
  return (
    <AppearanceProvider>
      <SharedBackendProvider>
        <BatchOrderProvider>
          <SharedBackendBanner />
          <AuthGate>
            <AppSectionRouter />
          </AuthGate>
        </BatchOrderProvider>
      </SharedBackendProvider>
    </AppearanceProvider>
  );
}
