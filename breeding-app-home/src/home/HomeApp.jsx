import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Outlet, Route, Routes } from 'react-router-dom';
import Navbar from './components/Navbar.jsx';
import Footer from './components/Footer.jsx';
import SerpentoraSite from './v6/SerpentoraSite.jsx';

// The landing page is the only route most visitors ever load, so it is the only
// one in the main bundle. Everything else — the legal pages, the auth forms, the
// deep product pages — is fetched on demand. A visitor reading the front door
// should not also be downloading the terms of service.
// The deeper product routes. Same chrome, same skin, fetched when asked for.
const CollectionPage = lazy(() => import('./v6/pages/CollectionPage.jsx'));
const QuarantinePage = lazy(() => import('./v6/pages/QuarantinePage.jsx'));
const SettingsPage = lazy(() => import('./v6/pages/SettingsPage.jsx'));

const PricingPage = lazy(() => import('./pages/PricingPage.jsx'));
const RegisterPage = lazy(() => import('./pages/RegisterPage.jsx'));
const LoginPage = lazy(() => import('./pages/LoginPage.jsx'));
const PrivacyPage = lazy(() => import('./pages/PrivacyPage.jsx'));
const TermsPage = lazy(() => import('./pages/TermsPage.jsx'));
const ImpressumPage = lazy(() => import('./pages/ImpressumPage.jsx'));

// The landing page carries its own masthead and footer, in its own palette.
// Everything else keeps the light site chrome, so the two are separate layouts
// rather than one shell wrapped around both.
function ChromeLayout() {
  return (
    <>
      <Navbar />
      <main>
        {/* A bare fallback rather than a spinner: these chunks are small and
            local, and a flashing spinner reads worse than a brief blank. */}
        <Suspense fallback={<div style={{ minHeight: '60vh' }} />}>
          <Outlet />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}

export default function HomeApp() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<SerpentoraSite />} />

        {/* The deeper product pages wear the v6 chrome themselves, so they sit
            outside ChromeLayout and carry their own Suspense boundary. */}
        <Route
          path="/collection"
          element={
            <Suspense fallback={<div style={{ minHeight: '100vh', background: '#04100e' }} />}>
              <CollectionPage />
            </Suspense>
          }
        />
        <Route
          path="/quarantine"
          element={
            <Suspense fallback={<div style={{ minHeight: '100vh', background: '#04100e' }} />}>
              <QuarantinePage />
            </Suspense>
          }
        />
        <Route
          path="/settings"
          element={
            <Suspense fallback={<div style={{ minHeight: '100vh', background: '#04100e' }} />}>
              <SettingsPage />
            </Suspense>
          }
        />

        <Route element={<ChromeLayout />}>
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/terms" element={<TermsPage />} />
          {/* Both spellings: German visitors look for "Impressum", and the
              English path is there so the link is guessable either way. */}
          <Route path="/impressum" element={<ImpressumPage />} />
          <Route path="/legal-notice" element={<ImpressumPage />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<SerpentoraSite />} />
      </Routes>
    </BrowserRouter>
  );
}
