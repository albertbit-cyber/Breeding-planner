import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminLayout from "../components/AdminLayout.jsx";
import Spinner from "../components/Spinner.jsx";
import { fetchAdminDashboard } from "../../shared/apiClient";

function StatCard({ label, value, onClick }) {
  return (
    <button type="button" className="admin-stat-card" onClick={onClick}>
      <span className="admin-stat-label">{label}</span>
      <span className="admin-stat-value">{Number(value || 0).toLocaleString()}</span>
      <span className="admin-stat-link">View →</span>
    </button>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [cards, setCards] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true);
    setError("");
    fetchAdminDashboard()
      .then((data) => setCards(data.cards || {}))
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load dashboard."))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  return (
    <AdminLayout breadcrumbs={[{ label: "Dashboard" }]}>
      <div className="admin-section">
        <div className="admin-section-header">
          <div>
            <h2>Dashboard</h2>
            <p>Platform overview — users, verifications, reports, and subscriptions at a glance.</p>
          </div>
          <button type="button" onClick={load}>Refresh</button>
        </div>
        {error && <div className="admin-error">{error}</div>}
        {loading ? (
          <Spinner label="Loading dashboard..." />
        ) : (
          <div className="admin-card-grid">
            <StatCard label="Total Users" value={cards.totalUsers} onClick={() => navigate("/admin/users")} />
            <StatCard label="New This Week" value={cards.newUsersThisWeek} onClick={() => navigate("/admin/users")} />
            <StatCard label="Pending Verification" value={cards.pendingBreederVerification} onClick={() => navigate("/admin/verification")} />
            <StatCard label="Suspended Users" value={cards.suspendedUsers} onClick={() => navigate("/admin/users?status=suspended")} />
            <StatCard label="Reported Users" value={cards.reportedUsers} onClick={() => navigate("/admin/reports")} />
            <StatCard label="Verified Breeders" value={cards.verifiedBreeders} onClick={() => navigate("/admin/users?role=breeder&verification=approved")} />
            <StatCard label="Active Subscriptions" value={cards.activeSubscriptions} onClick={() => navigate("/admin/tiers")} />
            <StatCard label="Expired Subscriptions" value={cards.expiredSubscriptions} onClick={() => navigate("/admin/users")} />
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
