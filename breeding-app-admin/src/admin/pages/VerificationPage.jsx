import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminLayout from "../components/AdminLayout.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import PaginationControls from "../components/PaginationControls.jsx";
import PromptModal from "../components/PromptModal.jsx";
import Spinner from "../components/Spinner.jsx";
import { useToast } from "../hooks/useToast.jsx";
import { VERIFICATION_REQUEST_STATUS_OPTIONS, formatDate } from "../constants.js";
import {
  fetchAdminVerificationRequests,
  updateAdminVerificationRequest,
} from "../../shared/apiClient.js";

export default function VerificationPage() {
  const navigate = useNavigate();
  const toast = useToast();

  const [filters, setFilters] = useState({ status: "pending", page: 1, pageSize: 25 });
  const [queue, setQueue] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [prompt, setPrompt] = useState(null); // { kind, id, name }

  const load = (f = filters) => {
    setLoading(true); setError("");
    fetchAdminVerificationRequests(f)
      .then((data) => {
        setQueue(Array.isArray(data.requests) ? data.requests : []);
        setTotal(Number(data.total || 0));
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load queue."))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []); // eslint-disable-line

  const changePage = (page) => { const nf = { ...filters, page }; setFilters(nf); load(nf); };

  const doAction = async (reason) => {
    const { kind, id } = prompt;
    setPrompt(null);
    const statusMap = { approve: "approved", reject: "rejected", more_info: "more_info_requested" };
    try {
      await updateAdminVerificationRequest(id, { status: statusMap[kind], reason: reason || "Verification reviewed", adminNote: reason });
      toast(kind === "approve" ? "Approved." : kind === "reject" ? "Rejected." : "Info requested.");
      load();
    } catch (err) { toast(err instanceof Error ? err.message : "Action failed.", "error"); }
  };

  return (
    <AdminLayout breadcrumbs={[{ label: "Breeder Verification" }]}>
      {prompt && (
        <PromptModal
          title={prompt.kind === "approve" ? `Approve ${prompt.name}` : prompt.kind === "reject" ? `Reject ${prompt.name}` : `Request info from ${prompt.name}`}
          message={prompt.kind === "approve" ? "Optionally add a note:" : prompt.kind === "reject" ? "Reason for rejection:" : "What additional info is needed?"}
          label={prompt.kind === "more_info" ? "Message to applicant" : "Reason"}
          required={prompt.kind !== "approve"}
          confirmLabel={prompt.kind === "approve" ? "Approve" : prompt.kind === "reject" ? "Reject" : "Request info"}
          danger={prompt.kind === "reject"}
          onConfirm={doAction}
          onCancel={() => setPrompt(null)}
        />
      )}
      <div className="admin-section">
        <div className="admin-section-header">
          <div>
            <h2>Breeder Verification</h2>
            <p>Review and action pending verification requests from breeders.</p>
          </div>
          <button type="button" onClick={() => load()}>Refresh</button>
        </div>

        <div className="admin-filters">
          <select value={filters.status} onChange={(e) => { const nf = { ...filters, status: e.target.value, page: 1 }; setFilters(nf); load(nf); }}>
            <option value="">All statuses</option>
            {VERIFICATION_REQUEST_STATUS_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>

        {error && <div className="admin-error">{error}</div>}

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Applicant</th>
                <th>Email</th>
                <th>Country</th>
                <th>Status</th>
                <th>Submitted</th>
                <th>Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {queue.map((req) => (
                <tr key={req.id}>
                  <td>{req.user?.name || req.userId}</td>
                  <td style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis" }}>{req.user?.email || "-"}</td>
                  <td>{req.user?.country || "-"}</td>
                  <td><StatusBadge value={req.status} /></td>
                  <td>{formatDate(req.createdAt)}</td>
                  <td>{formatDate(req.updatedAt)}</td>
                  <td>
                    <div className="admin-row-actions">
                      <button type="button" onClick={() => navigate(`/admin/users/${req.userId}`)}>Profile</button>
                      <button type="button" onClick={() => setPrompt({ kind: "approve", id: req.id, name: req.user?.name || req.userId })}>Approve</button>
                      <button type="button" onClick={() => setPrompt({ kind: "reject", id: req.id, name: req.user?.name || req.userId })}>Reject</button>
                      <button type="button" onClick={() => setPrompt({ kind: "more_info", id: req.id, name: req.user?.name || req.userId })}>More info</button>
                    </div>
                  </td>
                </tr>
              ))}
              {!queue.length && (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: 24 }}>
                    {loading ? <Spinner /> : <span className="admin-muted">No verification requests found.</span>}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="admin-table-footer">
          <span className="admin-muted">{total.toLocaleString()} requests total</span>
          <PaginationControls page={filters.page} pageSize={filters.pageSize} total={total} onPage={changePage} />
        </div>
      </div>
    </AdminLayout>
  );
}
