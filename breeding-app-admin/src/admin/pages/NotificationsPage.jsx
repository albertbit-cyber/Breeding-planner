import React, { useState } from "react";
import AdminLayout from "../components/AdminLayout.jsx";
import { useToast } from "../hooks/useToast.jsx";
import { sendAdminNotification } from "../../shared/apiClient";

const AUDIENCE_OPTIONS = [
  { value: "all", label: "All users" },
  { value: "breeders", label: "Breeders only" },
  { value: "labs", label: "Labs only" },
  { value: "admins", label: "Admins only" },
  { value: "verified_breeders", label: "Verified breeders" },
];

const EMPTY = { title: "", message: "", audience: "all", type: "info", reason: "" };

export default function NotificationsPage() {
  const toast = useToast();
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [lastSent, setLastSent] = useState(null);

  const update = (key, value) => setForm((p) => ({ ...p, [key]: value }));

  const send = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.message.trim()) { setError("Title and message are required."); return; }
    if (!form.reason.trim()) { setError("Reason is required."); return; }
    setBusy(true); setError("");
    try {
      const result = await sendAdminNotification({
        audience: form.audience,
        title: form.title,
        message: form.message,
        type: form.type,
        reason: form.reason,
      });
      setLastSent({ ...form, sent: result.sent ?? "?" });
      setForm(EMPTY);
      toast(`Notification sent to ${result.sent ?? "?"} recipient(s).`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to send notification.";
      setError(msg); toast(msg, "error");
    } finally { setBusy(false); }
  };

  const TYPE_STYLE = {
    info: { border: "#6366f1", bg: "#eef2ff" },
    warning: { border: "#d97706", bg: "#fef3c7" },
    success: { border: "#15803d", bg: "#f0fdf4" },
    error: { border: "#dc2626", bg: "#fef2f2" },
  };

  return (
    <AdminLayout breadcrumbs={[{ label: "Announcements" }]}>
      <div className="admin-section">
        <div className="admin-section-header">
          <div>
            <h2>Announcements</h2>
            <p>Send in-app notifications to users. Choose the audience and compose your message.</p>
          </div>
        </div>

        <div className="admin-detail-grid">
          <div className="admin-panel">
            <h3>Compose Notification</h3>
            {error && <div className="admin-error">{error}</div>}
            <form className="admin-action-grid" onSubmit={send} style={{ gridTemplateColumns: "1fr" }}>
              <label>
                Title *
                <input value={form.title} onChange={(e) => update("title", e.target.value)} placeholder="Notification title" required />
              </label>
              <label>
                Message *
                <textarea rows={4} value={form.message} onChange={(e) => update("message", e.target.value)} placeholder="Notification body…" required style={{ resize: "vertical" }} />
              </label>
              <label>
                Audience
                <select value={form.audience} onChange={(e) => update("audience", e.target.value)}>
                  {AUDIENCE_OPTIONS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                </select>
              </label>
              <label>
                Type
                <select value={form.type} onChange={(e) => update("type", e.target.value)}>
                  <option value="info">Info</option>
                  <option value="warning">Warning</option>
                  <option value="success">Success / Announcement</option>
                  <option value="error">Urgent / Alert</option>
                </select>
              </label>
              <label>
                Reason for sending *
                <input value={form.reason} onChange={(e) => { update("reason", e.target.value); setError(""); }} placeholder="Internal reason (required)" className={!form.reason ? "admin-action-reason-required" : ""} />
              </label>
              <button type="submit" disabled={busy}>{busy ? "Sending…" : "Send notification"}</button>
            </form>
          </div>

          <div className="admin-panel">
            <h3>Preview</h3>
            {form.title || form.message ? (
              <div style={{
                borderLeft: `4px solid ${TYPE_STYLE[form.type]?.border || "#6366f1"}`,
                background: TYPE_STYLE[form.type]?.bg || "#eef2ff",
                borderRadius: "var(--a-radius)",
                padding: "12px 14px",
              }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>{form.title || "(no title)"}</div>
                <div style={{ fontSize: 13, color: "var(--a-text-2)", lineHeight: 1.5 }}>{form.message || "(no message)"}</div>
                <div style={{ fontSize: 11, color: "var(--a-text-muted)", marginTop: 8 }}>
                  Audience: {AUDIENCE_OPTIONS.find((a) => a.value === form.audience)?.label} · Type: {form.type}
                </div>
              </div>
            ) : (
              <p className="admin-muted">Fill in the form to see a preview here.</p>
            )}

            {lastSent && (
              <div style={{ marginTop: 16 }}>
                <h3>Last Sent</h3>
                <div style={{
                  borderLeft: `4px solid ${TYPE_STYLE[lastSent.type]?.border || "#6366f1"}`,
                  background: TYPE_STYLE[lastSent.type]?.bg || "#eef2ff",
                  borderRadius: "var(--a-radius)",
                  padding: "12px 14px",
                }}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>{lastSent.title}</div>
                  <div style={{ fontSize: 13, color: "var(--a-text-2)", lineHeight: 1.5 }}>{lastSent.message}</div>
                  <div style={{ fontSize: 11, color: "var(--a-text-muted)", marginTop: 8 }}>
                    Sent to {lastSent.sent} recipient(s) · {AUDIENCE_OPTIONS.find((a) => a.value === lastSent.audience)?.label}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
