import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import AdminLayout from "../components/AdminLayout.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import CopyButton from "../components/CopyButton.jsx";
import PaginationControls from "../components/PaginationControls.jsx";
import ConfirmModal from "../components/ConfirmModal.jsx";
import Spinner from "../components/Spinner.jsx";
import { useToast } from "../hooks/useToast.jsx";
import {
  REPORT_TYPE_OPTIONS, REPORT_STATUS_OPTIONS, REPORT_ACTION_OPTIONS, REASON_OPTIONS, formatDate,
} from "../constants.js";
import {
  fetchAdminReports, updateAdminReportStatus, applyAdminReportAction,
} from "../../shared/apiClient.js";

function ReportActionModal({ report, onClose, onDone }) {
  const toast = useToast();
  const [status, setStatus] = useState(report.status || "pending");
  const [action, setAction] = useState(report.action || "no_action");
  const [reason, setReason] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    if (!reason.trim()) { setError("Reason is required."); return; }
    setBusy(true); setError("");
    try {
      await updateAdminReportStatus(report.id, { status, reason, internalNote });
      await applyAdminReportAction(report.id, { action, reason, internalNote });
      toast("Report updated.");
      onDone();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to update report.";
      setError(msg); toast(msg, "error");
    } finally { setBusy(false); }
  };

  return (
    <div className="admin-modal-backdrop">
      <div className="admin-modal">
        <div className="admin-modal-header">
          <h3>Manage Report</h3>
          <button type="button" className="admin-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="admin-modal-body">
          <div style={{ marginBottom: 8 }}>
            <strong>Report #{String(report.id).slice(0, 8)}…</strong>
            <span style={{ marginLeft: 8 }}><StatusBadge value={report.type} /></span>
          </div>
          {error && <div className="admin-error">{error}</div>}
          <div className="admin-action-grid">
            <label>Status<select value={status} onChange={(e) => setStatus(e.target.value)}>{REPORT_STATUS_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}</select></label>
            <label>Action<select value={action} onChange={(e) => setAction(e.target.value)}>{REPORT_ACTION_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}</select></label>
            <label>
              Reason *
              <select value={reason} onChange={(e) => { setReason(e.target.value); setError(""); }} className={!reason ? "admin-action-reason-required" : ""}>
                <option value="">Select reason…</option>
                {REASON_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
            <label>Internal note<textarea rows={2} value={internalNote} onChange={(e) => setInternalNote(e.target.value)} /></label>
          </div>
        </div>
        <div className="admin-modal-footer">
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="button" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const toast = useToast();

  const [filters, setFilters] = useState({
    search: searchParams.get("search") || "",
    type: searchParams.get("type") || "",
    status: searchParams.get("status") || "",
    action: searchParams.get("action") || "",
    page: Number(searchParams.get("page") || 1),
    pageSize: 25,
  });
  const [reports, setReports] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);

  const load = (f = filters) => {
    setLoading(true); setError("");
    fetchAdminReports(f)
      .then((data) => {
        setReports(Array.isArray(data.reports) ? data.reports : []);
        setTotal(Number(data.total || 0));
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load reports."))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []); // eslint-disable-line

  const updateFilter = (key, value) => setFilters((p) => ({ ...p, [key]: value, page: 1 }));
  const changePage = (page) => { const nf = { ...filters, page }; setFilters(nf); load(nf); };

  const openReport = (report) => setSelected(report);

  return (
    <AdminLayout breadcrumbs={[{ label: "Reports" }]}>
      {selected && (
        <ReportActionModal report={selected} onClose={() => setSelected(null)} onDone={() => { setSelected(null); load(); }} />
      )}
      <div className="admin-section">
        <div className="admin-section-header">
          <div>
            <h2>Reports</h2>
            <p>Review user reports, assign admins, and record actions taken.</p>
          </div>
          <button type="button" onClick={() => load()}>Refresh</button>
        </div>

        <div className="admin-filters">
          <input value={filters.search} onChange={(e) => updateFilter("search", e.target.value)} onKeyDown={(e) => e.key === "Enter" && load(filters)} placeholder="Search reporter, target, notes…" />
          <select value={filters.type} onChange={(e) => updateFilter("type", e.target.value)}>
            <option value="">All types</option>
            {REPORT_TYPE_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <select value={filters.status} onChange={(e) => updateFilter("status", e.target.value)}>
            <option value="">All statuses</option>
            {REPORT_STATUS_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <select value={filters.action} onChange={(e) => updateFilter("action", e.target.value)}>
            <option value="">All actions</option>
            {REPORT_ACTION_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <button type="button" onClick={() => load(filters)}>Apply</button>
        </div>

        {error && <div className="admin-error">{error}</div>}

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Report ID</th>
                <th>Type</th>
                <th>Reporter</th>
                <th>Target</th>
                <th>Status</th>
                <th>Action</th>
                <th>Assigned</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r.id}>
                  <td><div className="admin-id-cell"><span className="mono">{String(r.id).slice(0, 8)}…</span><CopyButton value={r.id} /></div></td>
                  <td><StatusBadge value={r.type} /></td>
                  <td style={{ maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis" }}>{r.reporter?.email || "-"}</td>
                  <td style={{ maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis" }}>{r.targetUser?.email || r.targetUserId || "-"}</td>
                  <td><StatusBadge value={r.status} /></td>
                  <td><StatusBadge value={r.action} /></td>
                  <td>{r.assignedAdmin?.email || "Unassigned"}</td>
                  <td>{formatDate(r.createdAt)}</td>
                  <td>
                    <div className="admin-row-actions">
                      <button type="button" onClick={() => openReport(r)}>Manage</button>
                      {r.targetUserId && (
                        <button type="button" onClick={() => navigate(`/admin/users/${r.targetUserId}`)}>User</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!reports.length && (
                <tr>
                  <td colSpan={9} style={{ textAlign: "center", padding: 24 }}>
                    {loading ? <Spinner /> : <span className="admin-muted">No reports found.</span>}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="admin-table-footer">
          <span className="admin-muted">{total.toLocaleString()} reports total</span>
          <PaginationControls page={filters.page} pageSize={filters.pageSize} total={total} onPage={changePage} />
        </div>
      </div>
    </AdminLayout>
  );
}
