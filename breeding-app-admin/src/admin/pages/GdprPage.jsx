import React, { useEffect, useState } from "react";
import AdminLayout from "../components/AdminLayout.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import ConfirmModal from "../components/ConfirmModal.jsx";
import Spinner from "../components/Spinner.jsx";
import { useToast } from "../hooks/useToast.jsx";
import { GDPR_WORKFLOW, formatDate } from "../constants.js";
import {
  fetchAdminGdprRequests, createAdminGdprRequest, updateAdminGdprRequest,
} from "../../shared/apiClient";

export default function GdprPage() {
  const toast = useToast();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ userId: "", email: "", requestType: "erasure", notes: "" });
  const [createBusy, setCreateBusy] = useState(false);
  const [confirm, setConfirm] = useState(null); // { kind, id, label }

  const load = () => {
    setLoading(true); setError("");
    fetchAdminGdprRequests()
      .then((data) => setRequests(Array.isArray(data.requests) ? data.requests : []))
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load GDPR requests."))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const createRequest = async (e) => {
    e.preventDefault();
    if (!form.userId && !form.email) { toast("User ID or email is required.", "error"); return; }
    setCreateBusy(true);
    try {
      const userId = form.userId || form.email;
      await createAdminGdprRequest(userId, { type: form.requestType, reason: "Admin GDPR request", adminNote: form.notes });
      toast("GDPR request created.");
      setForm({ userId: "", email: "", requestType: "erasure", notes: "" });
      load();
    } catch (err) { toast(err instanceof Error ? err.message : "Failed to create request.", "error"); }
    finally { setCreateBusy(false); }
  };

  const doConfirmed = async () => {
    const { kind, id } = confirm;
    setConfirm(null);
    const statusMap = { advance: "in_progress", complete: "completed", cancel: "cancelled" };
    const reasonMap = { advance: "Admin advanced stage", complete: "Admin marked complete", cancel: "Admin cancelled request" };
    try {
      await updateAdminGdprRequest(id, { status: statusMap[kind], reason: reasonMap[kind] });
      toast(`Request ${kind === "advance" ? "advanced" : kind === "complete" ? "completed" : "cancelled"}.`);
      load();
    } catch (err) { toast(err instanceof Error ? err.message : "Action failed.", "error"); }
  };

  const stepOf = (req) => {
    const wf = GDPR_WORKFLOW[req.requestType] || [];
    const idx = wf.indexOf(req.status);
    return { idx, total: wf.length, next: wf[idx + 1] };
  };

  return (
    <AdminLayout breadcrumbs={[{ label: "GDPR Tools" }]}>
      {confirm && (
        <ConfirmModal
          title={`Confirm: ${confirm.label}`}
          message="This action modifies the GDPR request status and may trigger automated processes."
          confirmLabel="Yes, proceed"
          danger={confirm.kind === "cancel"}
          onConfirm={doConfirmed}
          onCancel={() => setConfirm(null)}
        />
      )}
      <div className="admin-section">
        <div className="admin-section-header">
          <div>
            <h2>GDPR Tools</h2>
            <p>Manage user data requests: erasure, export, portability, and right to rectification.</p>
          </div>
          <button type="button" onClick={load}>Refresh</button>
        </div>

        <div className="admin-detail-grid">
          <div className="admin-panel">
            <h3>Create GDPR Request</h3>
            <form className="admin-action-grid" onSubmit={createRequest} style={{ gridTemplateColumns: "1fr" }}>
              <label>User ID<input value={form.userId} onChange={(e) => setForm((p) => ({ ...p, userId: e.target.value }))} placeholder="UUID or leave blank if using email" /></label>
              <label>Email<input type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} placeholder="Used to look up if User ID is blank" /></label>
              <label>Request type
                <select value={form.requestType} onChange={(e) => setForm((p) => ({ ...p, requestType: e.target.value }))}>
                  <option value="erasure">Right to erasure (deletion)</option>
                  <option value="portability">Data portability (export)</option>
                  <option value="access">Right of access</option>
                  <option value="rectification">Rectification</option>
                  <option value="restriction">Restriction of processing</option>
                  <option value="objection">Right to object</option>
                </select>
              </label>
              <label>Notes<textarea rows={2} value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} style={{ resize: "vertical" }} /></label>
              <button type="submit" disabled={createBusy}>{createBusy ? "Creating…" : "Create request"}</button>
            </form>
          </div>

          <div className="admin-panel admin-panel-wide">
            <h3>GDPR Workflow Stages</h3>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {Object.entries(GDPR_WORKFLOW).map(([type, stages]) => (
                <div key={type} style={{ background: "var(--a-bg)", borderRadius: 8, padding: "8px 12px", fontSize: 12 }}>
                  <strong>{type}</strong>
                  <div className="admin-muted" style={{ marginTop: 4 }}>{stages.join(" → ")}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {error && <div className="admin-error">{error}</div>}
        {loading ? <Spinner label="Loading GDPR requests…" /> : (
          <div className="admin-table-wrap" style={{ marginTop: 16 }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>User</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Progress</th>
                  <th>Created</th>
                  <th>Updated</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((req) => {
                  const { idx, total, next } = stepOf(req);
                  return (
                    <tr key={req.id}>
                      <td><span className="mono" style={{ fontSize: 12 }}>{String(req.id).slice(0, 8)}…</span></td>
                      <td style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" }}>{req.user?.email || req.userId || "-"}</td>
                      <td><StatusBadge value={req.requestType} /></td>
                      <td><StatusBadge value={req.status} /></td>
                      <td>
                        <div style={{ fontSize: 12 }}>
                          Step {idx + 1}/{total}
                          {next && <span className="admin-muted"> → {next}</span>}
                        </div>
                      </td>
                      <td>{formatDate(req.createdAt)}</td>
                      <td>{formatDate(req.updatedAt)}</td>
                      <td>
                        <div className="admin-row-actions">
                          {next && req.status !== "completed" && req.status !== "cancelled" && (
                            <button type="button" onClick={() => setConfirm({ kind: "advance", id: req.id, label: `Advance to "${next}"` })}>Advance</button>
                          )}
                          {req.status !== "completed" && req.status !== "cancelled" && (
                            <button type="button" onClick={() => setConfirm({ kind: "complete", id: req.id, label: "Mark completed" })}>Complete</button>
                          )}
                          {req.status !== "cancelled" && (
                            <button type="button" style={{ color: "var(--a-danger)" }} onClick={() => setConfirm({ kind: "cancel", id: req.id, label: "Cancel request" })}>Cancel</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!requests.length && (
                  <tr><td colSpan={8} style={{ textAlign: "center", padding: 24 }}><span className="admin-muted">No GDPR requests.</span></td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
