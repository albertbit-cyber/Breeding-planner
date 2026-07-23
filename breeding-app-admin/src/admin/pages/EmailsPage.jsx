import React, { useEffect, useState } from "react";
import AdminLayout from "../components/AdminLayout.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import Spinner from "../components/Spinner.jsx";
import { useToast } from "../hooks/useToast.jsx";
import { formatDate } from "../constants.js";
import {
  fetchAdminEmailHistory,
  retryAdminEmailJob,
  fetchAdminEmailSuppressions,
  releaseAdminEmailSuppression,
} from "../../shared/apiClient";

const STATUS_OPTIONS = [
  "pending",
  "processing",
  "provider_accepted",
  "delivered",
  "delivery_delayed",
  "failed",
  "bounced",
  "complained",
  "suppressed",
  "cancelled",
];

const RETRYABLE_STATUSES = new Set(["failed", "cancelled", "bounced"]);

export default function EmailsPage() {
  const toast = useToast();
  const [status, setStatus] = useState("");
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [suppressions, setSuppressions] = useState([]);

  const load = (statusFilter = status) => {
    setLoading(true);
    setError("");
    fetchAdminEmailHistory(statusFilter ? { status: statusFilter } : {})
      .then((data) => setJobs(Array.isArray(data.history) ? data.history : []))
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load email history."))
      .finally(() => setLoading(false));
  };

  const loadSuppressions = () => {
    fetchAdminEmailSuppressions()
      .then((data) => setSuppressions(Array.isArray(data.suppressions) ? data.suppressions : []))
      .catch(() => {});
  };

  useEffect(() => {
    load();
    loadSuppressions();
  }, []); // eslint-disable-line

  const retry = async (job) => {
    const reason = window.prompt("Reason for retrying this email (required):", "Retrying after provider issue resolved");
    if (!reason || !reason.trim()) return;
    try {
      await retryAdminEmailJob(job.id, { reason: reason.trim() });
      toast("Email job re-queued.");
      load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to retry email job.", "error");
    }
  };

  const release = async (emailAddress) => {
    const reason = window.prompt(`Reason for releasing suppression on ${emailAddress} (required):`, "Confirmed valid address");
    if (!reason || !reason.trim()) return;
    try {
      await releaseAdminEmailSuppression(emailAddress, { reason: reason.trim() });
      toast("Suppression released.");
      loadSuppressions();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to release suppression.", "error");
    }
  };

  return (
    <AdminLayout breadcrumbs={[{ label: "Emails" }]}>
      <div className="admin-section">
        <div className="admin-section-header">
          <div>
            <h2>Email Delivery</h2>
            <p>Transactional email jobs sent through the notification queue — invitations, breeding reminders, and account emails.</p>
          </div>
          <div className="admin-row-actions">
            <button type="button" onClick={() => load()}>Refresh</button>
          </div>
        </div>

        <div className="admin-filters">
          <select value={status} onChange={(e) => { setStatus(e.target.value); load(e.target.value); }}>
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {error && <div className="admin-error">{error}</div>}

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Category</th>
                <th>Template</th>
                <th>Recipient</th>
                <th>Status</th>
                <th>Attempts</th>
                <th>Scheduled</th>
                <th>Sent</th>
                <th>Last error</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id}>
                  <td>{job.category}</td>
                  <td>{job.templateKey}</td>
                  <td style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis" }}>{job.recipient}</td>
                  <td><StatusBadge value={job.status} /></td>
                  <td>{job.attemptCount}/{job.maximumAttempts}</td>
                  <td>{formatDate(job.scheduledFor)}</td>
                  <td>{job.sentAt ? formatDate(job.sentAt) : "-"}</td>
                  <td style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" }}>{job.lastErrorMessage || "-"}</td>
                  <td>
                    {RETRYABLE_STATUSES.has(job.status) && (
                      <button type="button" onClick={() => retry(job)}>Retry</button>
                    )}
                  </td>
                </tr>
              ))}
              {!jobs.length && (
                <tr>
                  <td colSpan={9} style={{ textAlign: "center", padding: 24 }}>
                    {loading ? <Spinner /> : <span className="admin-muted">No email jobs found.</span>}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="admin-panel" style={{ marginTop: 24 }}>
          <h3>Suppressed Addresses</h3>
          <p className="admin-muted">Addresses that will not receive optional email after a bounce, complaint, or manual suppression.</p>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Reason</th>
                  <th>Source</th>
                  <th>Since</th>
                  <th>Released</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {suppressions.map((s) => (
                  <tr key={s.emailAddress}>
                    <td>{s.emailAddress}</td>
                    <td>{s.reason}</td>
                    <td>{s.source}</td>
                    <td>{formatDate(s.createdAt)}</td>
                    <td>{s.releasedAt ? formatDate(s.releasedAt) : "-"}</td>
                    <td>
                      {!s.releasedAt && (
                        <button type="button" onClick={() => release(s.emailAddress)}>Release</button>
                      )}
                    </td>
                  </tr>
                ))}
                {!suppressions.length && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", padding: 24 }}>
                      <span className="admin-muted">No suppressed addresses.</span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
