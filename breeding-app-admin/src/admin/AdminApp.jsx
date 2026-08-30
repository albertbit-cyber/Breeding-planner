import React from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { ToastProvider } from "./hooks/useToast.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import "./admin.css";

import DashboardPage from "./pages/DashboardPage.jsx";
import UsersPage from "./pages/UsersPage.jsx";
import UserDetailPage from "./pages/UserDetailPage.jsx";
import ReportsPage from "./pages/ReportsPage.jsx";
import VerificationPage from "./pages/VerificationPage.jsx";
import LabsPage from "./pages/LabsPage.jsx";
import GeneSubmissionsPage from "./pages/GeneSubmissionsPage.jsx";
import TiersPage from "./pages/TiersPage.jsx";
import TierEditorPage from "./pages/TierEditorPage.jsx";
import NotificationsPage from "./pages/NotificationsPage.jsx";
import EmailsPage from "./pages/EmailsPage.jsx";
import GdprPage from "./pages/GdprPage.jsx";
import TeamPage from "./pages/TeamPage.jsx";
import MarketplacePage from "../features/marketplace/MarketplacePage.jsx";

export default function AdminApp() {
  return (
    <ToastProvider>
      <HashRouter>
        <ErrorBoundary>
          <Routes>
            <Route path="/admin" element={<DashboardPage />} />
            <Route path="/admin/users" element={<UsersPage />} />
            <Route path="/admin/users/:id" element={<UserDetailPage />} />
            <Route path="/admin/reports" element={<ReportsPage />} />
            <Route path="/admin/verification" element={<VerificationPage />} />
            <Route path="/admin/labs" element={<LabsPage />} />
            <Route path="/admin/gene-submissions" element={<GeneSubmissionsPage />} />
            <Route path="/admin/tiers" element={<TiersPage />} />
            <Route path="/admin/tiers/new" element={<TierEditorPage />} />
            <Route path="/admin/tiers/:id" element={<TierEditorPage />} />
            <Route path="/admin/marketplace" element={<MarketplacePage adminMode />} />
            <Route path="/admin/notifications" element={<NotificationsPage />} />
            <Route path="/admin/emails" element={<EmailsPage />} />
            <Route path="/admin/gdpr" element={<GdprPage />} />
            <Route path="/admin/team" element={<TeamPage />} />
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Routes>
        </ErrorBoundary>
      </HashRouter>
    </ToastProvider>
  );
}
