import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import AdminLayout from "../components/AdminLayout.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import CopyButton from "../components/CopyButton.jsx";
import PaginationControls from "../components/PaginationControls.jsx";
import Spinner from "../components/Spinner.jsx";
import {
  ROLE_OPTIONS, STATUS_OPTIONS, VERIFICATION_OPTIONS,
  SUBSCRIPTION_OPTIONS, ACTIVITY_OPTIONS, formatDate,
} from "../constants.js";
import { fetchAdminUsers } from "../../shared/apiClient";

export default function UsersPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [filters, setFilters] = useState({
    search: searchParams.get("search") || "",
    role: searchParams.get("role") || "",
    status: searchParams.get("status") || "",
    verification: searchParams.get("verification") || "",
    subscription: searchParams.get("subscription") || "",
    activity: searchParams.get("activity") || "",
    page: Number(searchParams.get("page") || 1),
    pageSize: 25,
  });
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = (nextFilters = filters) => {
    setLoading(true);
    setError("");
    fetchAdminUsers(nextFilters)
      .then((data) => {
        setUsers(Array.isArray(data.users) ? data.users : []);
        setTotal(Number(data.total || 0));
        setFilters((prev) => ({
          ...prev,
          page: Number(data.page || nextFilters.page || 1),
          pageSize: Number(data.pageSize || nextFilters.pageSize || 25),
        }));
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load users."))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []); // eslint-disable-line

  const updateFilter = (key, value) => setFilters((prev) => ({ ...prev, [key]: value, page: 1 }));
  const changePage = (page) => { const nf = { ...filters, page }; setFilters(nf); load(nf); };

  return (
    <AdminLayout breadcrumbs={[{ label: "Users" }]}>
      <div className="admin-section">
        <div className="admin-section-header">
          <div>
            <h2>All Users</h2>
            <p>Search and filter user accounts. Click a row to open the full user profile.</p>
          </div>
          <button type="button" onClick={() => load(filters)}>Refresh</button>
        </div>

        <div className="admin-filters">
          <input
            value={filters.search}
            onChange={(e) => updateFilter("search", e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load(filters)}
            placeholder="Search name, email, breeder name…"
          />
          <select value={filters.role} onChange={(e) => updateFilter("role", e.target.value)}>
            <option value="">All roles</option>
            {ROLE_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <select value={filters.status} onChange={(e) => updateFilter("status", e.target.value)}>
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <select value={filters.verification} onChange={(e) => updateFilter("verification", e.target.value)}>
            <option value="">All verification</option>
            {VERIFICATION_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <select value={filters.subscription} onChange={(e) => updateFilter("subscription", e.target.value)}>
            <option value="">All plans</option>
            {SUBSCRIPTION_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <select value={filters.activity} onChange={(e) => updateFilter("activity", e.target.value)}>
            <option value="">All activity</option>
            {ACTIVITY_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <button type="button" onClick={() => load(filters)}>Apply</button>
        </div>

        {error && <div className="admin-error">{error}</div>}

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>User ID</th>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Plan</th>
                <th>Verified</th>
                <th>Country</th>
                <th>Joined</th>
                <th>Last Login</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>
                    <div className="admin-id-cell">
                      <span className="mono" title={user.id}>{String(user.id).slice(0, 8)}…</span>
                      <CopyButton value={user.id} />
                    </div>
                  </td>
                  <td>{user.name || "-"}</td>
                  <td style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis" }}>{user.email}</td>
                  <td><StatusBadge value={user.role} /></td>
                  <td><StatusBadge value={user.status} /></td>
                  <td>{user.subscription?.plan || "free"}</td>
                  <td><StatusBadge value={user.verificationStatus} /></td>
                  <td>{user.country || "-"}</td>
                  <td>{formatDate(user.joinedDate)}</td>
                  <td>{formatDate(user.lastLoginAt)}</td>
                  <td>
                    <div className="admin-row-actions">
                      <button type="button" onClick={() => navigate(`/admin/users/${user.id}`)}>Open</button>
                      <button type="button" onClick={() => navigate(`/admin/reports?search=${encodeURIComponent(user.email)}`)}>Reports</button>
                    </div>
                  </td>
                </tr>
              ))}
              {!users.length && (
                <tr>
                  <td colSpan={11} style={{ textAlign: "center", padding: 24 }}>
                    {loading ? <Spinner /> : <span className="admin-muted">No users found.</span>}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="admin-table-footer">
          <span className="admin-muted">{total.toLocaleString()} users total</span>
          <PaginationControls page={filters.page} pageSize={filters.pageSize} total={total} onPage={changePage} />
        </div>
      </div>
    </AdminLayout>
  );
}
