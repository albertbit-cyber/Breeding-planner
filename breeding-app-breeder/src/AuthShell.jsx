import React, { useEffect, useState } from "react";
import BreedingPlannerApp from "./App.jsx";
import AuthGate from "./features/auth/AuthGate.jsx";
import AdminApp from "./admin/AdminApp.jsx";
import LabAppShell from "./features/lab/LabAppShell.jsx";
import LaunchPage from "./features/launch/LaunchPage.jsx";
import MarketplacePage from "./features/marketplace/MarketplacePage.jsx";
import PricingPage from "./features/subscriptions/PricingPage.jsx";
import MobileApp from "./features/mobile/MobileApp.jsx";
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
const isMobilePath = (path) => normalizeHashPath(path).startsWith("/mobile");
const isPricingPath = (path) => normalizeHashPath(path).startsWith("/pricing");
const isAdminPath = (path) => normalizeHashPath(path).startsWith("/admin");
const isBreederPath = (path) => {
  const normalized = normalizeHashPath(path);
  return normalized === "/breeder" || normalized.startsWith("/breeder/");
};
const isNativeMobileShell = () => {
  try {
    return Boolean(window?.Capacitor?.isNativePlatform?.() || window?.Capacitor?.getPlatform?.() === "android");
  } catch {
    return false;
  }
};

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

  if (isAdminPath(hashPath)) {
    return <AdminApp />;
  }

  if (isMarketplacePath(hashPath)) {
    return <MarketplacePage />;
  }

  if (isMobilePath(hashPath)) {
    return <MobileApp />;
  }

  if (isPricingPath(hashPath)) {
    return <PricingPage />;
  }

  if (hashPath === "/" && isNativeMobileShell()) {
    return <BreedingPlannerApp />;
  }

  if (hashPath === "/") {
    return <LaunchPage />;
  }

  if (isBreederPath(hashPath)) {
    return <BreedingPlannerApp />;
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
