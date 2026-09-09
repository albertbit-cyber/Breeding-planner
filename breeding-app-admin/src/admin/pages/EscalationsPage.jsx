import React, { useEffect, useState } from "react";
import AdminLayout from "../components/AdminLayout.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import Spinner from "../components/Spinner.jsx";
import { useToast } from "../hooks/useToast.jsx";
import useAdminActor from "../hooks/useAdminActor";
import { formatDate } from "../constants.js";
import {
  fetchAdminEscalations,
  createAdminEscalation,
  reviewAdminEscalation,
} from "../../shared/apiClient";

/**
 * Both halves of the moderator relationship on one page: a moderator writes
 * here and nowhere else in the console, and the owner reads what was written
 * and decides what follows.
 *
 * Raising an escalation deliberately changes nothing about the thing it points
 * at — no status moves, no account is touched. It is a note with a pointer.
 */
export default function EscalationsPage() {
  const toast = useToast();
  const actor = useAdminActor();
  const [escalations, setEscalations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ subject: "", note: "", subjectUserId: "" });
  const [busy, setBusy] = useState(false);

  const load = () => {
    setLoading(true);
    setError("");
    fetchAdminEscalations()
      .then((data) => setEscalations(Array.isArray(data.escalations) ? data.escalations : []))
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load escalations."))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const raise = async (e) => {
    e.preventDefault();
    if (!form.subject.trim() || !form.note.trim()) {
      toast("A subject and a description are both required.", "error");
      return;
    }
    setBusy(true);
    try {
      await createAdminEscalation({
        subject: form.subject.trim(),
        note: form.note.trim(),
        ...(form.subjectUserId.trim() ? { subjectUserId: form.subjectUserId.trim() } : {}),
      });
      toast("Raised for the account owner.");
      setForm({ subject: "", note: "", subjectUserId: "" });
      load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to raise escalation.", "error");
    } finally {
      setBusy(false);
    }
  };

  const review = async (id, status) => {
    try {
      await reviewAdminEscalation(id, { status });
      toast(status === "resolved" ? "Marked resolved." : "Marked acknowledged.");
      load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to update escalation.", "error");
    }
  };

  return (
    <AdminLayout breadcrumbs={[{ label: "Escalations" }]}>
      <div className="admin-section">
        <div className="admin-section-header">
          <div>
            <h2>Escalations</h2>
            <p>
              Things a moderator has asked the account owner to look at. Raising one records a
              concern; it does not change the user, listing or report it refers to.
            </p>
          </div>
          <button type="button" onClick={load}>Refresh</button>
        </div>

        <div className="admin-panel">
          <h3>Raise something for the owner</h3>
          <form className="admin-action-grid" onSubmit={raise} style={{ gridTemplateColumns: "1fr" }}>
            <label>
              Subject
              <input
                value={form.subject}
                maxLength={200}
                placeholder="Short summary"
                onChange={(e) => setForm((p) => ({ ...p, subject: e.target.value }))}
              />
            </label>
            <label>
              What should the owner look at?
              <textarea
                rows={3}
                value={form.note}
                maxLength={4000}
                style={{ resize: "vertical" }}
                onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))}
              />
            </label>
            <label>
              User ID this is about <span className="admin-muted">(optional)</span>
              <input
                value={form.subjectUserId}
                placeholder="Leave blank if it isn't about one account"
                onChange={(e) => setForm((p) => ({ ...p, subjectUserId: e.target.value }))}
              />
            </label>
            <button type="submit" disabled={busy}>{busy ? "Raising…" : "Raise for the owner"}</button>
          </form>
        </div>

        {error && <div className="admin-error">{error}</div>}
        {loading ? (
          <Spinner label="Loading escalations…" />
        ) : !escalations.length ? (
          <div className="admin-panel admin-muted" style={{ marginTop: 16 }}>
            Nothing has been escalated.
          </div>
        ) : (
          <div className="admin-table-wrap" style={{ marginTop: 16 }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Raised by</th>
                  <th>About</th>
                  <th>Raised</th>
                  <th>Status</th>
                  {actor.isOwner && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {escalations.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>{row.subject}</strong>
                      <div className="admin-muted" style={{ marginTop: 4 }}>{row.note}</div>
                    </td>
                    <td>{row.raisedBy?.fullName || row.raisedBy?.email || "—"}</td>
                    <td className="mono">{row.subjectUser?.email || row.relatedReportId || "—"}</td>
                    <td>{formatDate(row.createdAt)}</td>
                    <td><StatusBadge value={row.status} /></td>
                    {actor.isOwner && (
                      <td>
                        {row.status !== "resolved" && (
                          <div className="admin-row-actions">
                            {row.status === "open" && (
                              <button type="button" onClick={() => review(row.id, "acknowledged")}>
                                Acknowledge
                              </button>
                            )}
                            <button type="button" onClick={() => review(row.id, "resolved")}>
                              Resolve
                            </button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
