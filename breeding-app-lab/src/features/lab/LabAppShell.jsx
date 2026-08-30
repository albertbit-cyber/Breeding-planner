import React, { useCallback, useEffect, useMemo, useState } from "react";
import { canAccessLabApp, getCurrentAppRole } from "./auth/roleGuard";
import LabDashboardPage from "./pages/LabDashboardPage.jsx";
import IncomingOrdersPage from "./pages/IncomingOrdersPage.jsx";
import SampleIntakePage from "./pages/SampleIntakePage.jsx";
import OrderDetailsPage from "./pages/OrderDetailsPage.jsx";
import ResultEntryPage from "./pages/ResultEntryPage.jsx";
import CompletedTestsPage from "./pages/CompletedTestsPage.jsx";
import { createLabApiClient } from "./api/client";
import TestCatalogPage from "./pages/TestCatalogPage.jsx";
import PricingLogicPage from "./pages/PricingLogicPage.jsx";
import LabSettingsPage from "./pages/LabSettingsPage.jsx";
import LabTeamPage from "./pages/LabTeamPage.jsx";
import MyAccountPage from "./pages/MyAccountPage.jsx";
import SharedBackendGuard from "../../components/SharedBackendGuard.jsx";
import GlobalScanOverlay from "./components/GlobalScanOverlay.jsx";

const DEFAULT_ROUTE = "/lab/dashboard";

// All localStorage keys owned by the Lab app — cleared during a dev reset.
const LAB_STORAGE_KEYS = [
  "breedingPlannerLabMemoryStore",
  "breedingPlannerLabAuthSession",
  "breedingPlannerLabAuthToken",
  "breedingPlannerLabRefreshToken",
  "breedingPlannerUsers",
  "breedingPlannerDemoUserSeeded",
];

// True only when running under `vite dev` (import.meta.env.DEV).
// The Developer Tools tab is hidden in production builds.
const isDevEnv = typeof import.meta !== "undefined" && Boolean(import.meta.env?.DEV);

/**
 * Dev-only panel — clears all Lab app local data and reloads to a clean state.
 * TEMP DEV TOOL - REMOVE BEFORE PRODUCTION
 */
function LabDevToolsPanel({ onReset }) {
  const [deleteState, setDeleteState] = useState({
    loading: false,
    error: "",
    message: "",
  });

  const handleDeleteAllOrders = useCallback(async () => {
    const confirmed = window.confirm(
      "This will permanently delete every shared lab order from the backend.\n\nDeleted orders will disappear from the breeder app as well.\n\nThis cannot be undone. Continue?"
    );
    if (!confirmed) return;

    setDeleteState({ loading: true, error: "", message: "" });
    try {
      const api = createLabApiClient();
      const result = await api.deleteAllLabOrders();
      setDeleteState({
        loading: false,
        error: "",
        message: `Deleted ${result.deletedOrders} orders, ${result.deletedAnimals} animals, and ${result.deletedAnimalTests} test rows from the shared backend.`,
      });
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("lab:test-orders-cleared", { detail: result }));
      }
    } catch (error) {
      setDeleteState({
        loading: false,
        error: error instanceof Error ? error.message : "Failed to delete shared lab orders.",
        message: "",
      });
    }
  }, []);

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <strong>Developer Tools</strong> — this section is only visible in development mode and
        contains destructive actions. It will not appear in production builds.
      </div>
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-4 space-y-2">
        <div className="font-semibold text-red-700">Reset Lab App to Defaults</div>
        <div className="text-xs text-red-700/90">
          Permanently erases all local Lab app data on this device (orders, users, auth session,
          test catalog overrides) and reloads to a factory-default state.
        </div>
        <button
          type="button"
          className="mt-2 rounded-xl border border-red-400 bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 transition"
          onClick={onReset}
        >
          Reset Lab Data
        </button>
      </div>
      <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-4 space-y-2">
        <div className="font-semibold text-rose-700">Delete All Shared Lab Orders</div>
        <div className="text-xs text-rose-700/90">
          Permanently deletes every hosted lab order from the shared backend. Because breeder shed testing history loads from the same backend, those orders are removed from the breeder app too.
        </div>
        {deleteState.error ? (
          <div className="rounded-lg border border-rose-300 bg-white px-3 py-2 text-xs text-rose-700">
            {deleteState.error}
          </div>
        ) : null}
        {deleteState.message ? (
          <div className="rounded-lg border border-emerald-300 bg-white px-3 py-2 text-xs text-emerald-700">
            {deleteState.message}
          </div>
        ) : null}
        <button
          type="button"
          className="mt-2 rounded-xl border border-rose-500 bg-rose-600 px-3 py-2 text-sm font-medium text-white hover:bg-rose-700 transition disabled:cursor-not-allowed disabled:opacity-60"
          onClick={handleDeleteAllOrders}
          disabled={deleteState.loading}
        >
          {deleteState.loading ? "Deleting Shared Orders..." : "Delete All Shared Orders"}
        </button>
      </div>
    </section>
  );
}

const normalizeHashPath = (hashValue) => {
  const raw = String(hashValue || "").replace(/^#/, "").trim();
  if (!raw) return DEFAULT_ROUTE;
  if (raw.startsWith("/")) return raw;
  return `/${raw}`;
};

const parseRoute = (path) => {
  const [pathOnly, queryString] = String(path || "").split("?");
  const normalized = normalizeHashPath(pathOnly);
  const params = new URLSearchParams(queryString || "");
  if (normalized === "/lab" || normalized === "/lab/") {
    return { route: "/lab/dashboard" };
  }
  if (normalized === "/lab/dashboard") return { route: "/lab/dashboard" };
  if (normalized === "/lab/shed-tests") return { route: "/lab/incoming-orders" };
  if (normalized === "/lab/incoming-orders") return { route: "/lab/incoming-orders" };
  if (normalized === "/admin/shed-tests") return { route: "/lab/incoming-orders" };
  // "/admin" used to land on a local-data oversight screen inside this portal.
  // Platform oversight lives in the admin console now, so send stragglers to the
  // dashboard rather than to a page that no longer exists.
  if (normalized === "/admin" || normalized === "/admin/") return { route: "/lab/dashboard" };
  // presetToken/presetOrderId let the global Scan action (see GlobalScanOverlay)
  // land directly on the right step for a sample instead of making the tech
  // re-scan or hunt for the right order in a dropdown.
  if (normalized === "/lab/sample-intake") {
    return { route: "/lab/sample-intake", presetToken: params.get("token") || undefined };
  }
  if (normalized === "/lab/result-entry") {
    return { route: "/lab/result-entry", presetOrderId: params.get("orderId") || undefined };
  }
  if (normalized === "/lab/completed-tests") return { route: "/lab/completed-tests" };
  if (normalized === "/lab/test-catalog") return { route: "/lab/test-catalog" };
  if (normalized === "/lab/pricing-logic") return { route: "/lab/pricing-logic" };
  if (normalized === "/lab/settings") return { route: "/lab/settings" };
  if (normalized === "/lab/team") return { route: "/lab/team" };
  if (normalized === "/lab/account") return { route: "/lab/account" };
  if (normalized === "/lab/dev-tools") return { route: "/lab/dev-tools" };
  if (normalized.startsWith("/lab/orders/")) {
    const orderId = decodeURIComponent(normalized.replace("/lab/orders/", "")).trim();
    return { route: "/lab/orders/:orderId", orderId };
  }
  return { route: "/lab/not-found" };
};

const navItems = [
  { path: "/lab/dashboard", label: "Dashboard" },
  { path: "/lab/incoming-orders", label: "All Shed Orders" },
  { path: "/lab/sample-intake", label: "Sample Intake" },
  { path: "/lab/result-entry", label: "Result Entry" },
  { path: "/lab/completed-tests", label: "Completed Tests" },
  { path: "/lab/test-catalog", label: "Test Catalog", roles: ["lab_staff", "admin"] },
  { path: "/lab/pricing-logic", label: "Pricing & Logic", roles: ["lab_staff", "admin"] },
  { path: "/lab/settings", label: "Laboratory Settings", roles: ["lab_staff", "admin"] },
  { path: "/lab/team", label: "Team", roles: ["lab_staff", "admin"] },
  { path: "/lab/account", label: "My Account" },
  { path: "/lab/orders/placeholder-order-id", label: "Order Details" },
];

const navigateToHashPath = (path) => {
  if (typeof window === "undefined") return;
  window.location.hash = path;
};

const pageForRoute = (parsedRoute, role) => {
  switch (parsedRoute.route) {
    case "/lab/dashboard":
      return <LabDashboardPage />;
    case "/lab/incoming-orders":
      return <IncomingOrdersPage />;
    case "/lab/sample-intake":
      return <SampleIntakePage presetToken={parsedRoute.presetToken} />;
    case "/lab/result-entry":
      return <ResultEntryPage presetOrderId={parsedRoute.presetOrderId} />;
    case "/lab/completed-tests":
      return <CompletedTestsPage />;
    case "/lab/test-catalog":
      if (role !== "lab_staff" && role !== "admin") {
        return (
          <section className="space-y-3">
            <h1 className="text-2xl font-semibold text-rose-700">Test Catalog Restricted</h1>
            <p className="text-sm text-neutral-700">Only lab staff or admin users can manage the test catalog.</p>
          </section>
        );
      }
      return <TestCatalogPage />;
    case "/lab/pricing-logic":
      if (role !== "lab_staff" && role !== "admin") {
        return (
          <section className="space-y-3">
            <h1 className="text-2xl font-semibold text-rose-700">Pricing &amp; Logic Restricted</h1>
            <p className="text-sm text-neutral-700">Only lab staff or admin users can access pricing logic.</p>
          </section>
        );
      }
      return <PricingLogicPage />;
    case "/lab/settings":
      return <LabSettingsPage />;
    case "/lab/team":
      return <LabTeamPage />;
    // Personal account details are available to anyone signed in — a member
    // still needs to be able to change their own password.
    case "/lab/account":
      return <MyAccountPage />;
    case "/lab/orders/:orderId":
      return <OrderDetailsPage orderId={parsedRoute.orderId} />;
    default:
      return (
        <section className="space-y-3">
          <h1 className="text-2xl font-semibold text-neutral-900">Lab Route Not Found</h1>
          <p className="text-sm text-neutral-600">This route is not defined in the initial lab shell.</p>
          <button
            type="button"
            className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm"
            onClick={() => navigateToHashPath("/lab/dashboard")}
          >
            Back to Lab Dashboard
          </button>
        </section>
      );
  }
};

const getLabUserName = () => {
  try {
    const raw = localStorage.getItem("breedingPlannerLabAuthSession");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.profile?.displayName || parsed?.profile?.fullName || null;
  } catch {
    return null;
  }
};

export default function LabAppShell() {
  const [hashPath, setHashPath] = useState(() => normalizeHashPath(window?.location?.hash));
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);

  useEffect(() => {
    const onHashChange = () => {
      setHashPath(normalizeHashPath(window.location.hash));
    };

    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // Close the mobile nav drawer and scan overlay whenever the route changes.
  useEffect(() => {
    setMobileNavOpen(false);
    setScanOpen(false);
  }, [hashPath]);

  const role = useMemo(() => getCurrentAppRole(), [hashPath]);
  const isAllowed = canAccessLabApp(role);
  const parsedRoute = useMemo(() => parseRoute(hashPath), [hashPath]);

  // Clears all Lab-owned localStorage keys and reloads to a clean state.
  // Only callable from the Developer Tools tab (dev builds only).
  const handleLabReset = useCallback(() => {
    const confirmed = window.confirm(
      "This will permanently erase all local Lab app data on this device and restore factory defaults.\n\nThis cannot be undone. Continue?"
    );
    if (!confirmed) return;
    LAB_STORAGE_KEYS.forEach((key) => {
      try { localStorage.removeItem(key); } catch { /* storage not available */ }
    });
    window.alert("Lab data cleared. The app will now reload.");
    window.location.reload();
  }, []);
  const visibleNavItems = useMemo(
    () => navItems.filter((item) => !Array.isArray(item.roles) || item.roles.includes(role)),
    [role]
  );

  if (!isAllowed) {
    return (
      <div className="min-h-screen bg-neutral-100 p-6 text-neutral-900">
        <div className="mx-auto max-w-3xl rounded-2xl border border-rose-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-rose-700">Lab Access Restricted</h1>
          <p className="mt-2 text-sm text-neutral-700">
            Only <code>lab_staff</code> or <code>admin</code> roles can access the laboratory portal.
          </p>
          <p className="mt-2 text-sm text-neutral-600">
            Current role: <span className="font-mono">{role}</span>
          </p>
          <button
            type="button"
            className="mt-4 rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm"
            onClick={() => navigateToHashPath("/")}
          >
            Return to Breeder App
          </button>
        </div>
      </div>
    );
  }

  // Shared between the desktop sidebar and the mobile drawer so every nav
  // item (including Sample Intake's QR scanner) is reachable on any screen
  // size — the sidebar itself is desktop-only (`lg:block`).
  const navButtons = (onNavigate) => (
    <>
      {isDevEnv && (
        <button
          type="button"
          onClick={() => onNavigate("/lab/dev-tools")}
          className={`w-full rounded-xl border px-3 py-2 text-left text-sm transition ${
            parsedRoute.route === "/lab/dev-tools"
              ? "border-amber-600 bg-amber-600 text-white"
              : "border-amber-200 bg-amber-50 text-amber-800 hover:border-amber-300"
          }`}
        >
          Developer Tools
        </button>
      )}
      {visibleNavItems.map((item) => {
        const isActive =
          parsedRoute.route === item.path ||
          (item.path.includes("placeholder-order-id") && parsedRoute.route === "/lab/orders/:orderId");

        return (
          <button
            key={item.path}
            type="button"
            onClick={() => onNavigate(item.path)}
            className={`w-full rounded-xl border px-3 py-2 text-left text-sm transition ${
              isActive
                ? "border-neutral-900 bg-neutral-900 text-white"
                : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300"
            }`}
          >
            {item.label}
          </button>
        );
      })}
      <div className="mt-3 border-t border-neutral-200 pt-3">
        {getLabUserName() ? (
          <div className="mb-2 px-1 text-xs text-neutral-500 truncate">
            Signed in as <span className="font-medium text-neutral-700">{getLabUserName()}</span>
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("lab:logout"))}
          className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-left text-sm text-neutral-600 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700"
        >
          Sign Out
        </button>
      </div>
    </>
  );

  const isBottomTabActive = (path) =>
    parsedRoute.route === path ||
    (path === "/lab/orders/placeholder-order-id" && parsedRoute.route === "/lab/orders/:orderId");

  return (
    <div className="min-h-screen bg-neutral-100 pb-20 text-neutral-900 lg:pb-0">
      {/* Compact mobile title bar — navigation itself lives in the bottom tab
          bar below, kept off this row so it doesn't compete for space. */}
      <div className="flex items-center gap-2 border-b border-neutral-200 bg-white px-4 py-3 lg:hidden">
        <div className="text-xs uppercase tracking-wide text-neutral-500">Laboratory</div>
        <div className="text-base font-semibold text-neutral-900">Laboratory</div>
      </div>

      {/* "More" bottom sheet — the rest of the nav list (Sample Intake without
          scanning, Completed Tests, catalog/pricing/admin pages, sign out)
          that doesn't fit as a primary bottom-tab icon. */}
      {mobileNavOpen ? (
        <>
          <button
            type="button"
            aria-label="Close menu"
            className="fixed inset-0 z-30 bg-neutral-950/40 lg:hidden"
            onClick={() => setMobileNavOpen(false)}
          />
          <nav className="fixed inset-x-0 bottom-16 z-30 max-h-[65vh] overflow-y-auto rounded-t-2xl border-t border-neutral-200 bg-white p-3 shadow-lg lg:hidden">
            {navButtons(navigateToHashPath)}
          </nav>
        </>
      ) : null}

      {/* Bottom tab bar — the most-needed actions, Scan always reachable from
          any page, everything else lives above it in the page content. */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-neutral-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden">
        <div className="mx-auto flex max-w-md items-stretch justify-between">
          <button
            type="button"
            onClick={() => navigateToHashPath("/lab/dashboard")}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${
              isBottomTabActive("/lab/dashboard") ? "text-neutral-900" : "text-neutral-500"
            }`}
          >
            <span className="text-lg leading-none">🏠</span>
            Dashboard
          </button>
          <button
            type="button"
            onClick={() => navigateToHashPath("/lab/incoming-orders")}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${
              isBottomTabActive("/lab/incoming-orders") ? "text-neutral-900" : "text-neutral-500"
            }`}
          >
            <span className="text-lg leading-none">📋</span>
            Orders
          </button>
          <button
            type="button"
            onClick={() => setScanOpen(true)}
            className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-neutral-900"
          >
            <span className="-mt-4 flex h-11 w-11 items-center justify-center rounded-full bg-neutral-900 text-lg text-white shadow-lg">
              📷
            </span>
            Scan
          </button>
          <button
            type="button"
            onClick={() => navigateToHashPath("/lab/result-entry")}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${
              isBottomTabActive("/lab/result-entry") ? "text-neutral-900" : "text-neutral-500"
            }`}
          >
            <span className="text-lg leading-none">🧪</span>
            Results
          </button>
          <button
            type="button"
            onClick={() => setMobileNavOpen((open) => !open)}
            aria-expanded={mobileNavOpen}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${
              mobileNavOpen ? "text-neutral-900" : "text-neutral-500"
            }`}
          >
            <span className="text-lg leading-none">⋯</span>
            More
          </button>
        </div>
      </nav>

      {scanOpen ? <GlobalScanOverlay onClose={() => setScanOpen(false)} /> : null}

      <div className="mx-auto flex max-w-7xl gap-4 p-4 lg:p-6">
        <aside className="hidden w-64 shrink-0 rounded-2xl border border-neutral-200 bg-white p-3 shadow-sm lg:block">
          <div className="px-2 py-2">
            <div className="text-xs uppercase tracking-wide text-neutral-500">Laboratory</div>
            <div className="text-lg font-semibold text-neutral-900">Laboratory</div>
          </div>
          <nav className="mt-2 flex flex-col gap-1">
            {navButtons(navigateToHashPath)}
          </nav>
        </aside>

        <main className="min-w-0 flex-1 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm lg:p-6">
          <div className="mb-4 hidden items-center justify-between gap-2 border-b border-neutral-100 pb-3 lg:flex">
            <div>
              <div className="text-xs uppercase tracking-wide text-neutral-500">Lab Workflow</div>
              <div className="text-lg font-semibold text-neutral-900">{parsedRoute.route}</div>
            </div>
          </div>
          <SharedBackendGuard featureName="Lab workflow pages">
            {parsedRoute.route === "/lab/dev-tools" ? (
              <LabDevToolsPanel onReset={handleLabReset} />
            ) : (
              pageForRoute(parsedRoute, role)
            )}
          </SharedBackendGuard>
        </main>
      </div>
    </div>
  );
}
