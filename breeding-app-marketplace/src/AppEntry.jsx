import React, { useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AppearanceProvider } from "./contexts/AppearanceContext.jsx";
import { SharedBackendProvider } from "./contexts/SharedBackendContext.jsx";
import PricingPage from "./features/subscriptions/PricingPage.jsx";
import RequireAuth from "./marketplace/components/RequireAuth.jsx";
import Shell from "./marketplace/components/Shell.jsx";
import BrowsePage from "./marketplace/routes/BrowsePage.jsx";
import DashboardPage from "./marketplace/routes/DashboardPage.jsx";
import InboxPage from "./marketplace/routes/InboxPage.jsx";
import ListingPage from "./marketplace/routes/ListingPage.jsx";
import NotFoundPage from "./marketplace/routes/NotFoundPage.jsx";
import SavedPage from "./marketplace/routes/SavedPage.jsx";
import SellPage from "./marketplace/routes/SellPage.jsx";
import StorePage from "./marketplace/routes/StorePage.jsx";
import { ToastProvider } from "./marketplace/ui/Toast.jsx";
import "./marketplace/marketplace.css";

/**
 * The marketplace used to be one scrolling page with no router at all: no
 * `react-router` in package.json, buyer, seller and admin surfaces stacked in
 * a single component, and a "Pricing" button that set `window.location.hash`
 * while nothing listened -- so `PricingPage` was rendered by nothing.
 *
 * Real routes mean a listing can be linked, shared into the forum where this
 * trade actually happens, opened in a new tab, and left with the back button.
 */

/**
 * Where the app is mounted. GitHub Pages serves it from `/Breeding-planner/`
 * (the deploy workflow passes that as PUBLIC_URL), so without a basename the
 * router would compare the full path against its routes, match nothing, and
 * render the not-found page on the home page. Vite bakes the build base in as
 * `BASE_URL`, which is the same value, so the two cannot drift apart.
 */
const BASENAME = (import.meta.env.BASE_URL || "/").replace(/\/$/, "") || "/";

/** A page change should start at the top of the new page, not mid-scroll. */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);
  return null;
}

export default function AppEntry() {
  return (
    <AppearanceProvider>
      <SharedBackendProvider>
        <ToastProvider>
          <BrowserRouter basename={BASENAME}>
            <ScrollToTop />
            <Routes>
              <Route element={<Shell />}>
                {/* Public: browsing, a listing and a store need no account. */}
                <Route index element={<BrowsePage />} />
                <Route path="a/:id" element={<ListingPage />} />
                <Route path="s/:userId" element={<StorePage />} />
                <Route path="pricing" element={<PricingPage />} />

                {/* Signed in. */}
                <Route
                  path="saved"
                  element={
                    <RequireAuth>
                      <SavedPage />
                    </RequireAuth>
                  }
                />
                <Route
                  path="inbox"
                  element={
                    <RequireAuth>
                      <InboxPage />
                    </RequireAuth>
                  }
                />
                <Route
                  path="inbox/:conversationId"
                  element={
                    <RequireAuth>
                      <InboxPage />
                    </RequireAuth>
                  }
                />

                {/* Breeder only. */}
                <Route
                  path="sell"
                  element={
                    <RequireAuth seller>
                      <SellPage />
                    </RequireAuth>
                  }
                />
                <Route
                  path="sell/:listingId"
                  element={
                    <RequireAuth seller>
                      <SellPage />
                    </RequireAuth>
                  }
                />
                <Route
                  path="dashboard"
                  element={
                    <RequireAuth seller>
                      <DashboardPage />
                    </RequireAuth>
                  }
                />

                {/* The old hash links, kept working. */}
                <Route path="marketplace" element={<Navigate to="/" replace />} />
                <Route path="*" element={<NotFoundPage />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </ToastProvider>
      </SharedBackendProvider>
    </AppearanceProvider>
  );
}
