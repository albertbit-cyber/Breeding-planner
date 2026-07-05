import React, { useCallback, useEffect, useState } from "react";
import AdminLayout from "../components/AdminLayout.jsx";
import Spinner from "../components/Spinner.jsx";
import { useToast } from "../hooks/useToast.jsx";
import { useNavigate } from "react-router-dom";
import {
  fetchAdminAccountPanel,
  createAdminUser,
  changeMyEmail,
  changeMyPassword,
  sendAdminUserEmail,
  resendAdminUserEmailVerification,
  updateAdminUserEmailVerified,
} from "../../shared/apiClient";

export default function TeamPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const [account, setAccount] = useState(null);
  const [team, setTeam] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [createForm, setCreateForm] = useState({ fullName: "", email: "", role: "support", sendInvite: true, temporaryPassword: "" });
  const [emailForm, setEmailForm] = useState({ userId: "", subject: "", message: "" });
  const [ownerEmailForm, setOwnerEmailForm] = useState({ email: "", currentPassword: "" });
  const [ownerPasswordForm, setOwnerPasswordForm] = useState({ currentPassword: "", newPassword: "" });
  const [ownerBusy, setOwnerBusy] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    fetchAdminAccountPanel()
      .then((data) => {
        setAccount(data.account || null);
        setTeam(Array.isArray(data.team) ? data.team : []);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load account panel."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const createTeamUser = async (e) => {
    e.preventDefault();
    try {
      const result = await createAdminUser({ ...createForm, reason: "Create admin team user" });
      toast(`Created ${result.user?.email || createForm.email}.`);
      setCreateForm({ fullName: "", email: "", role: "support", sendInvite: true, temporaryPassword: "" });
      load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to create team user.", "error");
    }
  };

  const updateOwnerEmail = async (e) => {
    e.preventDefault();
    setOwnerBusy("email");
    try {
      const result = await changeMyEmail({ email: ownerEmailForm.email, currentPassword: ownerEmailForm.currentPassword }, "admin");
      setAccount(result.user || account);
      setOwnerEmailForm({ email: "", currentPassword: "" });
      toast(result.message || "Email updated.");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to update email.", "error");
    } finally { setOwnerBusy(""); }
  };

  const updateOwnerPassword = async (e) => {
    e.preventDefault();
    setOwnerBusy("password");
    try {
      const result = await changeMyPassword({ currentPassword: ownerPasswordForm.currentPassword, newPassword: ownerPasswordForm.newPassword }, "admin");
      setOwnerPasswordForm({ currentPassword: "", newPassword: "" });
      toast(result.message || "Password updated.");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to update password.", "error");
    } finally { setOwnerBusy(""); }
  };

  const sendEmail = async (e) => {
    e.preventDefault();
    if (!emailForm.userId) { toast("Choose a team user first.", "error"); return; }
    try {
      await sendAdminUserEmail(emailForm.userId, { subject: emailForm.subject, message: emailForm.message, reason: "Admin account communication" });
      toast("Email queued.");
      setEmailForm({ userId: "", subject: "", message: "" });
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to send email.", "error");
    }
  };

  const resendVerification = async (userId) => {
    try {
      await resendAdminUserEmailVerification(userId, { reason: "Admin requested email verification" });
      toast("Verification email queued.");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed.", "error");
    }
  };

  const markVerified = async (userId, verified) => {
    try {
      await updateAdminUserEmailVerified(userId, { verified, reason: verified ? "Admin verified email" : "Admin marked unverified" });
      toast(verified ? "Email marked verified." : "Email marked unverified.");
      load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed.", "error");
    }
  };

  return (
    <AdminLayout breadcrumbs={[{ label: "Team & Account" }]}>
      <div className="admin-section">
        <div className="admin-section-header">
          <div>
            <h2>Team & Account</h2>
            <p>Manage the admin owner login, create team accounts, and send email communications.</p>
          </div>
          <button type="button" onClick={load}>Refresh</button>
        </div>
        {error && <div className="admin-error">{error}</div>}
        {loading ? <Spinner label="Loading account..." /> : (
          <div className="admin-detail-grid">
            <div className="admin-panel">
              <h3>Admin Owner Login</h3>
              <dl className="admin-definition-list">
                <dt>Name</dt><dd>{account?.name || "-"}</dd>
                <dt>Email</dt><dd>{account?.email || "-"}</dd>
                <dt>Role</dt><dd>{account?.role || "-"}</dd>
                <dt>Email verified</dt><dd>{account?.emailVerified ? "Yes" : "No"}</dd>
              </dl>
              <div style={{ marginTop: 16 }}>
                <div className="admin-field-label" style={{ marginBottom: 8 }}>Change Email</div>
                <form className="admin-form-grid" onSubmit={updateOwnerEmail} style={{ gridTemplateColumns: "1fr 1fr auto" }}>
                  <input value={ownerEmailForm.email} onChange={(e) => setOwnerEmailForm((p) => ({ ...p, email: e.target.value }))} placeholder="New email" type="email" required />
                  <input value={ownerEmailForm.currentPassword} onChange={(e) => setOwnerEmailForm((p) => ({ ...p, currentPassword: e.target.value }))} placeholder="Current password" type="password" required />
                  <button type="submit" disabled={Boolean(ownerBusy)}>{ownerBusy === "email" ? "Saving..." : "Change"}</button>
                </form>
                <div className="admin-field-label" style={{ margin: "14px 0 8px" }}>Change Password</div>
                <form className="admin-form-grid" onSubmit={updateOwnerPassword} style={{ gridTemplateColumns: "1fr 1fr auto" }}>
                  <input value={ownerPasswordForm.currentPassword} onChange={(e) => setOwnerPasswordForm((p) => ({ ...p, currentPassword: e.target.value }))} placeholder="Current password" type="password" required />
                  <input value={ownerPasswordForm.newPassword} onChange={(e) => setOwnerPasswordForm((p) => ({ ...p, newPassword: e.target.value }))} placeholder="New password" type="password" required minLength={8} />
                  <button type="submit" disabled={Boolean(ownerBusy)}>{ownerBusy === "password" ? "Saving..." : "Change"}</button>
                </form>
              </div>
            </div>

            <div className="admin-panel">
              <h3>Create Team User</h3>
              <form className="admin-form-grid" onSubmit={createTeamUser} style={{ gridTemplateColumns: "1fr" }}>
                <input value={createForm.fullName} onChange={(e) => setCreateForm((p) => ({ ...p, fullName: e.target.value }))} placeholder="Full name" required />
                <input value={createForm.email} onChange={(e) => setCreateForm((p) => ({ ...p, email: e.target.value }))} placeholder="Email" type="email" required />
                <select value={createForm.role} onChange={(e) => setCreateForm((p) => ({ ...p, role: e.target.value }))}>
                  <option value="support">Support</option>
                  <option value="moderator">Moderator</option>
                  <option value="admin">Admin</option>
                  <option value="lab">Lab staff</option>
                </select>
                <input value={createForm.temporaryPassword} onChange={(e) => setCreateForm((p) => ({ ...p, temporaryPassword: e.target.value }))} placeholder="Temporary password (optional)" />
                <label className="admin-checkbox-row">
                  <input type="checkbox" checked={createForm.sendInvite} onChange={(e) => setCreateForm((p) => ({ ...p, sendInvite: e.target.checked }))} />
                  Send invite & verification email
                </label>
                <button type="submit">Create user</button>
              </form>
            </div>

            <div className="admin-panel admin-panel-wide">
              <h3>Team Members</h3>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Email</th><th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {team.map((user) => (
                      <tr key={user.id}>
                        <td>{user.name || "-"}</td>
                        <td>{user.email}</td>
                        <td>{user.role}</td>
                        <td>{user.status}</td>
                        <td>{user.emailVerified ? "Verified" : "Unverified"}</td>
                        <td>
                          <div className="admin-row-actions">
                            <button type="button" onClick={() => navigate(`/admin/users/${user.id}`)}>Open</button>
                            <button type="button" onClick={() => resendVerification(user.id)}>Resend verify</button>
                            <button type="button" onClick={() => markVerified(user.id, !user.emailVerified)}>
                              {user.emailVerified ? "Mark unverified" : "Mark verified"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!team.length && <tr><td colSpan={6} className="admin-muted" style={{ textAlign: "center", padding: 20 }}>No team users found.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="admin-panel admin-panel-wide">
              <h3>Email Communication</h3>
              <form className="admin-form-grid" onSubmit={sendEmail} style={{ gridTemplateColumns: "1fr 1fr 1fr auto" }}>
                <select value={emailForm.userId} onChange={(e) => setEmailForm((p) => ({ ...p, userId: e.target.value }))} required>
                  <option value="">Choose team user</option>
                  {team.map((u) => <option key={u.id} value={u.id}>{u.email}</option>)}
                </select>
                <input value={emailForm.subject} onChange={(e) => setEmailForm((p) => ({ ...p, subject: e.target.value }))} placeholder="Subject" required />
                <textarea rows={2} value={emailForm.message} onChange={(e) => setEmailForm((p) => ({ ...p, message: e.target.value }))} placeholder="Message" required style={{ resize: "vertical" }} />
                <button type="submit">Send</button>
              </form>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
