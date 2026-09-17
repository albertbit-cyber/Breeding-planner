import React from 'react';
import { BrowserRouter, Outlet, Route, Routes } from 'react-router-dom';
import Navbar from './components/Navbar.jsx';
import Footer from './components/Footer.jsx';
import SerpentoraSite from './v6/SerpentoraSite.jsx';
import PricingPage from './pages/PricingPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import PrivacyPage from './pages/PrivacyPage.jsx';
import TermsPage from './pages/TermsPage.jsx';
import ImpressumPage from './pages/ImpressumPage.jsx';

// The landing page carries its own masthead and footer, in its own palette.
// Everything else keeps the light site chrome, so the two are separate layouts
// rather than one shell wrapped around both.
function ChromeLayout() {
  return (
    <>
      <Navbar />
      <main>
        <Outlet />
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
