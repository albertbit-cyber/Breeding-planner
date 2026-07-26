import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminLayout from "../components/AdminLayout.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import CopyButton from "../components/CopyButton.jsx";
import PaginationControls from "../components/PaginationControls.jsx";
import Spinner from "../components/Spinner.jsx";
import { useToast } from "../hooks/useToast.jsx";
import { STATUS_OPTIONS, formatDate } from "../constants.js";
import { fetchAdminLabAccounts, createAdminUser } from "../../shared/apiClient";

export default function LabsPage() {
  const navigate = useNavigate();
  const toast = useToast();

  const [filters, setFilters] = useState({ search: "", status: "", page: 1, pageSize: 25 });
  const [labs, setLabs] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", labName: "", country: "", temporaryPassword: "", sendInvite: true });
  const [createBusy, setCreateBusy] = useState(false);

  const load = (f = filters) => {
    setLoading(true); setError("");
    fetchAdminLabAccounts(f)
      .then((data) => {
        setLabs(Array.isArray(data.labs) ? data.labs : []);
        setTotal(Number(data.total || 0));
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load lab accounts."))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []); // eslint-disable-line

  const updateFilter = (key, value) => setFilters((p) => ({ ...p, [key]: value, page: 1 }));
  const changePage = (page) => { const nf = { ...filters, page }; setFilters(nf); load(nf); };

  const createLab = async (e) => {
    e.preventDefault();
    setCreateBusy(true);
    try {
      await createAdminUser({ fullName: form.name, email: form.email, role: "lab", temporaryPassword: form.temporaryPassword, sendInvite: form.sendInvite, reason: "Admin created lab account" });
      toast(`Lab account created for ${form.email}.`);
      setForm({ name: "", email: "", labName: "", country: "", temporaryPassword: "", sendInvite: true });
      setShowCreate(false);
      load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to create lab account.", "error");
    } finally { setCreateBusy(false); }
  };

  return (
    <AdminLayout breadcrumbs={[{ label: "Lab Accounts" }]}>
      <div className="admin-section">
        <div className="admin-section-header">
          <div>
            <h2>Lab Accounts</h2>
            <p>Manage laboratory partner accounts and their access.</p>
          </div>
          <div className="admin-row-actions">
            <button type="button" onClick={() => load()}>Refresh</button>
            <button type="button" onClick={() => setShowCreate(!showCreate)}>{showCreate ? "Cancel" : "Create Lab"}</button>
          </div>
        </div>

        {showCreate && (
          <div className="admin-panel" style={{ marginBottom: 16 }}>
            <h3>Create Lab Account</h3>
            <form className="admin-action-grid" onSubmit={createLab}>
              <label>Full name<input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required /></label>
              <label>Email<input type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} required /></label>
              <label>Lab name<input value={form.labName} onChange={(e) => setForm((p) => ({ ...p, labName: e.target.value }))} /></label>
              <label>Country<input value={form.country} onChange={(e) => setForm((p) => ({ ...p, country: e.target.value }))} /></label>
              <label>Temp password<input value={form.temporaryPassword} onChange={(e) => setForm((p) => ({ ...p, temporaryPassword: e.target.value }))} /></label>
              <label className="admin-checkbox-row"><input type="checkbox" checked={form.sendInvite} onChange={(e) => setForm((p) => ({ ...p, sendInvite: e.target.checked }))} /> Send invite email</label>
              <button type="submit" disabled={createBusy}>{createBusy ? "Creating…" : "Create lab"}</button>
            </form>
          </div>
        )}

        <div className="admin-filters">
          <input value={filters.search} onChange={(e) => updateFilter("search", e.target.value)} onKeyDown={(e) => e.key === "Enter" && load(filters)} placeholder="Search name, email…" />
          <select value={filters.status} onChange={(e) => updateFilter("status", e.target.value)}>
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <button type="button" onClick={() => load(filters)}>Apply</button>
        </div>

        {error && <div className="admin-error">{error}</div>}

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Email</th>
                <th>Lab Name</th>
                <th>Country</th>
                <th>Status</th>
                <th>Joined</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {labs.map((lab) => (
                <tr key={lab.id}>
                  <td><div className="admin-id-cell"><span className="mono">{String(lab.id).slice(0, 8)}…</span><CopyButton value={lab.id} /></div></td>
                  <td>{lab.name || "-"}</td>
                  <td style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis" }}>{lab.email}</td>
                  <td>{lab.labName || "-"}</td>
                  <td>{lab.country || "-"}</td>
                  <td><StatusBadge value={lab.status} /></td>
                  <td>{formatDate(lab.joinedDate)}</td>
                  <td>
                    <button type="button" onClick={() => navigate(`/admin/users/${lab.id}`)}>Open</button>
                  </td>
                </tr>
              ))}
              {!labs.length && (
                <tr>
                  <td colSpan={8} style={{ textAlign: "center", padding: 24 }}>
                    {loading ? <Spinner /> : <span className="admin-muted">No lab accounts found.</span>}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="admin-table-footer">
          <span className="admin-muted">{total.toLocaleString()} labs total</span>
          <PaginationControls page={filters.page} pageSize={filters.pageSize} total={total} onPage={changePage} />
        </div>
      </div>
    </AdminLayout>
  );
}
