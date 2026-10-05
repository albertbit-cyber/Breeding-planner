import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar.jsx';
import Footer from './components/Footer.jsx';
import HomePage from './pages/HomePage.jsx';
import PricingPage from './pages/PricingPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import PrivacyPage from './pages/PrivacyPage.jsx';
import TermsPage from './pages/TermsPage.jsx';
import ImpressumPage from './pages/ImpressumPage.jsx';
import VerifyCertificatePage from './pages/VerifyCertificatePage.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <main>
        <Routes>
          <Route path="/"         element={<HomePage />} />
          <Route path="/pricing"  element={<PricingPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/login"    element={<LoginPage />} />
          <Route path="/privacy"  element={<PrivacyPage />} />
          <Route path="/terms"    element={<TermsPage />} />
          {/* Both spellings: German visitors look for "Impressum", and the
              English path is there so the link is guessable either way. */}
          <Route path="/impressum" element={<ImpressumPage />} />
          <Route path="/legal-notice" element={<ImpressumPage />} />
          {/* The certificate PDF links to /verify/<code>; the bare path is the form. */}
          <Route path="/verify" element={<VerifyCertificatePage />} />
          <Route path="/verify/:code" element={<VerifyCertificatePage />} />
          {/* Fallback */}
          <Route path="*" element={<HomePage />} />
        </Routes>
      </main>
      <Footer />
    </BrowserRouter>
  );
}
