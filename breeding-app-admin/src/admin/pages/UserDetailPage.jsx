import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import AdminLayout from "../components/AdminLayout.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import CopyButton from "../components/CopyButton.jsx";
import ConfirmModal from "../components/ConfirmModal.jsx";
import PromptModal from "../components/PromptModal.jsx";
import Spinner from "../components/Spinner.jsx";
import { useToast } from "../hooks/useToast.jsx";
import {
  ROLE_OPTIONS, STATUS_OPTIONS, VERIFICATION_OPTIONS,
  SUBSCRIPTION_STATUS_OPTIONS, PAYMENT_STATUS_OPTIONS,
  PERMISSION_LABELS, REASON_OPTIONS,
  rolePermissions, formatDate, dateInputValue,
} from "../constants.js";
import {
  fetchAdminUserDetail,
  sendAdminUserEmail,
  resendAdminUserEmailVerification,
  updateAdminUserEmailVerified,
  updateAdminUserRole,
  updateAdminUserStatus,
  updateAdminUserVerification,
  updateAdminUserSubscription,
  fetchAdminMarketplacePermission,
  updateAdminMarketplacePermission,
  fetchSubscriptionTiers,
  fetchFeatureCatalog,
  fetchUserSubscriptionPanel,
  assignUserSubscriptionTier,
  addUserFeatureOverride,
  removeUserFeatureOverride,
  resetUserUsage,
} from "../../shared/apiClient";

/* ── Req asterisk ─────────────────────────────────────────────────────────── */
function Req() { return <span className="admin-required">*</span>; }

/* ── Action Controls ──────────────────────────────────────────────────────── */
function ActionControls({ user, onUpdated }) {
  const toast = useToast();
  const [draftRole, setDraftRole] = useState(user.role || "buyer");
  const [draftStatus, setDraftStatus] = useState(user.status || "active");
  const [draftVerification, setDraftVerification] = useState(user.verificationStatus || "not_applied");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(null);

  useEffect(() => {
    setDraftRole(user.role || "buyer");
    setDraftStatus(user.status || "active");
    setDraftVerification(user.verificationStatus || "not_applied");
  }, [user.role, user.status, user.verificationStatus]);

  const DESTRUCTIVE_STATUSES = ["suspended", "banned", "deleted"];
  const DESTRUCTIVE_ROLES = ["admin"];

  const run = async (kind, value) => {
    if (!reason.trim()) { setError("Reason is required."); return; }
    setBusy(kind); setError(""); setConfirm(null);
    try {
      let result;
      if (kind === "role") result = await updateAdminUserRole(user.id, { role: value, reason, internalNote: note });
      if (kind === "status") result = await updateAdminUserStatus(user.id, { status: value, reason, internalNote: note });
      if (kind === "verification") result = await updateAdminUserVerification(user.id, { verificationStatus: value, reason, internalNote: note });
      setReason(""); setNote("");
      toast(`${kind.charAt(0).toUpperCase() + kind.slice(1)} updated to "${value}".`);
      onUpdated(result?.user);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Action failed.";
      setError(msg); toast(msg, "error");
    } finally { setBusy(""); }
  };

  const requestAction = (kind, value) => {
    if (!reason.trim()) { setError("Select a reason before applying."); return; }
    const isDestructive =
      (kind === "status" && DESTRUCTIVE_STATUSES.includes(value)) ||
      (kind === "role" && DESTRUCTIVE_ROLES.includes(value));
    if (isDestructive) setConfirm({ kind, value });
    else run(kind, value);
  };

  return (
    <div className="admin-panel">
      <h3>Admin Actions</h3>
      {confirm && (
        <ConfirmModal
          title={`Confirm: change ${confirm.kind} to "${confirm.value}"`}
          message={`This will modify "${user.name || user.email}". Are you sure?`}
          confirmLabel="Yes, apply"
          danger
          onConfirm={() => run(confirm.kind, confirm.value)}
          onCancel={() => setConfirm(null)}
        />
      )}
      <div className="admin-action-reason">
        <div className="admin-field-label">Reason <Req /></div>
        <select value={reason} onChange={(e) => { setReason(e.target.value); setError(""); }} className={!reason ? "admin-action-reason-required" : ""}>
          <option value="">Select reason…</option>
          {REASON_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Internal note (optional)" />
      </div>
      {error && <div className="admin-error">{error}</div>}
      <div className="admin-action-grid">
        <label>
          Role
          <select value={draftRole} onChange={(e) => setDraftRole(e.target.value)}>
            {ROLE_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <button type="button" disabled={Boolean(busy) || draftRole === user.role} onClick={() => requestAction("role", draftRole)}>
            {busy === "role" ? "Saving…" : "Change Role"}
          </button>
        </label>
        <label>
          Status
          <select value={draftStatus} onChange={(e) => setDraftStatus(e.target.value)}>
            {STATUS_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <button type="button" disabled={Boolean(busy) || draftStatus === user.status} onClick={() => requestAction("status", draftStatus)}>
            {busy === "status" ? "Saving…" : "Change Status"}
          </button>
        </label>
        <label>
          Breeder Verification
          <select value={draftVerification} onChange={(e) => setDraftVerification(e.target.value)}>
            {VERIFICATION_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <button type="button" disabled={Boolean(busy) || draftVerification === user.verificationStatus} onClick={() => requestAction("verification", draftVerification)}>
            {busy === "verification" ? "Saving…" : "Change Verification"}
          </button>
        </label>
      </div>
    </div>
  );
}

/* ── Marketplace Permission Panel ─────────────────────────────────────────── */
function MarketplacePermissionPanel({ userId }) {
  const toast = useToast();
  const [permission, setPermission] = useState(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let m = true;
    fetchAdminMarketplacePermission(userId)
      .then((data) => m && setPermission(data.permission || {}))
      .catch((err) => m && setError(err instanceof Error ? err.message : "Unable to load permissions."));
    return () => { m = false; };
  }, [userId]);

  const updateField = (key, value) => setPermission((prev) => ({ ...(prev || {}), [key]: value }));

  const save = async () => {
    if (!reason.trim()) { setError("Reason is required."); return; }
    setBusy(true); setError("");
    try {
      const result = await updateAdminMarketplacePermission(userId, {
        canAccess: permission?.canAccess !== false,
        activeListingLimit: Number(permission?.activeListingLimit || 0),
        requireApproval: Boolean(permission?.requireApproval),
        featuredBreeder: Boolean(permission?.featuredBreeder),
        disabledReason: permission?.disabledReason || "",
        reason,
      });
      setPermission(result.permission);
      setReason("");
      toast("Marketplace permissions saved.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to update.";
      setError(msg); toast(msg, "error");
    } finally { setBusy(false); }
  };

  return (
    <div className="admin-panel">
      <h3>Marketplace Permissions</h3>
      {error && <div className="admin-error">{error}</div>}
      {!permission ? <Spinner label="Loading…" /> : (
        <div className="admin-action-grid">
          <label className="admin-checkbox-row"><input type="checkbox" checked={permission.canAccess !== false} onChange={(e) => updateField("canAccess", e.target.checked)} /> Allow marketplace access</label>
          <label className="admin-checkbox-row"><input type="checkbox" checked={Boolean(permission.requireApproval)} onChange={(e) => updateField("requireApproval", e.target.checked)} /> Require listing approval</label>
          <label className="admin-checkbox-row"><input type="checkbox" checked={Boolean(permission.featuredBreeder)} onChange={(e) => updateField("featuredBreeder", e.target.checked)} /> Featured breeder</label>
          <label>Active listing limit<input type="number" value={permission.activeListingLimit || 0} onChange={(e) => updateField("activeListingLimit", e.target.value)} /></label>
          <label>Disabled reason<input value={permission.disabledReason || ""} onChange={(e) => updateField("disabledReason", e.target.value)} /></label>
          <label><span className="admin-field-label">Reason <Req /></span><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Required" className={!reason ? "admin-action-reason-required" : ""} /></label>
          <button type="button" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save marketplace controls"}</button>
        </div>
      )}
    </div>
  );
}

/* ── Subscription Panel ───────────────────────────────────────────────────── */
function SubscriptionPanel({ user, onUpdated }) {
  const toast = useToast();
  const subscription = user?.subscription || {};
  const [draft, setDraft] = useState({
    plan: subscription.plan || "free",
    status: subscription.status || "inactive",
    paymentStatus: subscription.paymentStatus || "none",
    startDate: dateInputValue(subscription.startDate),
    renewalDate: dateInputValue(subscription.renewalDate),
    trialEndsAt: dateInputValue(subscription.trialEndsAt),
    reason: "", internalNote: "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDraft((p) => ({
      ...p,
      plan: subscription.plan || "free",
      status: subscription.status || "inactive",
      paymentStatus: subscription.paymentStatus || "none",
      startDate: dateInputValue(subscription.startDate),
      renewalDate: dateInputValue(subscription.renewalDate),
      trialEndsAt: dateInputValue(subscription.trialEndsAt),
    }));
  }, [subscription.plan, subscription.status]); // eslint-disable-line

  const update = (key, value) => setDraft((p) => ({ ...p, [key]: value }));

  const save = async () => {
    if (!draft.reason.trim()) { setError("Reason is required."); return; }
    setBusy(true); setError("");
    try {
      const result = await updateAdminUserSubscription(user.id, draft);
      onUpdated(result.user);
      setDraft((p) => ({ ...p, reason: "", internalNote: "" }));
      toast("Subscription updated.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Update failed.";
      setError(msg); toast(msg, "error");
    } finally { setBusy(false); }
  };

  return (
    <div className="admin-panel">
      <h3>Subscription</h3>
      {error && <div className="admin-error">{error}</div>}
      <div className="admin-action-grid">
        <label>Plan<select value={draft.plan} onChange={(e) => update("plan", e.target.value)}><option value="free">free</option><option value="hobby">hobby</option><option value="breeder">breeder</option><option value="professional">professional</option><option value="enterprise">enterprise</option></select></label>
        <label>Status<select value={draft.status} onChange={(e) => update("status", e.target.value)}>{SUBSCRIPTION_STATUS_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}</select></label>
        <label>Payment<select value={draft.paymentStatus} onChange={(e) => update("paymentStatus", e.target.value)}>{PAYMENT_STATUS_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}</select></label>
        <label>Start date<input type="date" value={draft.startDate} onChange={(e) => update("startDate", e.target.value)} /></label>
        <label>Renewal date<input type="date" value={draft.renewalDate} onChange={(e) => update("renewalDate", e.target.value)} /></label>
        <label>Trial ends<input type="date" value={draft.trialEndsAt} onChange={(e) => update("trialEndsAt", e.target.value)} /></label>
        <label><span className="admin-field-label">Reason <Req /></span><input value={draft.reason} onChange={(e) => update("reason", e.target.value)} placeholder="Required" className={!draft.reason ? "admin-action-reason-required" : ""} /></label>
        <label>Internal note<input value={draft.internalNote} onChange={(e) => update("internalNote", e.target.value)} /></label>
        <button type="button" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save subscription"}</button>
      </div>
    </div>
  );
}

/* ── User Tier Subscription Panel ──────────────────────────────────────────── */
function UserTierSubscriptionPanel({ userId }) {
  const toast = useToast();
  const [tiers, setTiers] = useState([]);
  const [features, setFeatures] = useState([]);
  const [panel, setPanel] = useState(null);
  const [form, setForm] = useState({ tierId: "", status: "active", paymentStatus: "none", trialEndsAt: "", renewsAt: "", reason: "manual_assignment", internalNote: "" });
  const [override, setOverride] = useState({ featureKey: "", enabled: true, limitOverride: "", reason: "", expiresAt: "" });
  const [removeTarget, setRemoveTarget] = useState(null);
  const [error, setError] = useState("");

  const load = () =>
    Promise.all([fetchSubscriptionTiers(), fetchFeatureCatalog(), fetchUserSubscriptionPanel(userId)])
      .then(([tierData, featureData, panelData]) => {
        setTiers(Array.isArray(tierData.tiers) ? tierData.tiers : []);
        setFeatures(Array.isArray(featureData.features) ? featureData.features : []);
        setPanel(panelData);
        const currentTierId = panelData.subscription?.tier?.id || "";
        setForm((p) => ({ ...p, tierId: currentTierId, status: panelData.subscription?.status || "active", paymentStatus: panelData.subscription?.paymentStatus || "none" }));
      });

  useEffect(() => { load().catch((err) => setError(err instanceof Error ? err.message : "Unable to load.")); }, [userId]); // eslint-disable-line

  const assign = async () => {
    setError("");
    try { await assignUserSubscriptionTier(userId, form); await load(); toast("Tier assigned."); }
    catch (err) { const msg = err instanceof Error ? err.message : "Failed."; setError(msg); toast(msg, "error"); }
  };

  const addOverride = async () => {
    setError("");
    try {
      await addUserFeatureOverride(userId, { ...override, limitOverride: override.limitOverride === "" ? null : Number(override.limitOverride) });
      setOverride({ featureKey: "", enabled: true, limitOverride: "", reason: "", expiresAt: "" });
      await load(); toast("Override added.");
    } catch (err) { const msg = err instanceof Error ? err.message : "Failed."; setError(msg); toast(msg, "error"); }
  };

  const doRemoveOverride = async (reason) => {
    const entry = removeTarget; setRemoveTarget(null);
    try { await removeUserFeatureOverride(userId, entry.id, { reason: reason || "override_removed" }); await load(); toast("Override removed."); }
    catch (err) { toast(err instanceof Error ? err.message : "Failed.", "error"); }
  };

  const doResetUsage = async () => {
    setError("");
    try { await resetUserUsage(userId, { featureKey: "", reason: "manual_usage_reset" }); await load(); toast("Usage reset."); }
    catch (err) { const msg = err instanceof Error ? err.message : "Failed."; setError(msg); toast(msg, "error"); }
  };

  return (
    <div className="admin-panel admin-panel-wide">
      {removeTarget && (
        <PromptModal
          title="Remove feature override"
          message={`Remove override for "${removeTarget.featureKey}"?`}
          label="Reason"
          required={false}
          confirmLabel="Remove override"
          danger
          onConfirm={doRemoveOverride}
          onCancel={() => setRemoveTarget(null)}
        />
      )}
      <h3>Tier & Subscription Management</h3>
      {error && <div className="admin-error">{error}</div>}
      <div className="admin-detail-grid">
        <div>
          <dl className="admin-definition-list">
            <dt>Current tier</dt><dd>{panel?.subscription?.tier?.name || "No active tier"}</dd>
            <dt>Status</dt><dd>{panel?.subscription?.status || "-"}</dd>
            <dt>Payment</dt><dd>{panel?.subscription?.paymentStatus || "-"}</dd>
            <dt>Trial ends</dt><dd>{formatDate(panel?.subscription?.trialEndsAt)}</dd>
            <dt>Renewal</dt><dd>{formatDate(panel?.subscription?.renewsAt)}</dd>
          </dl>
          <div className="admin-action-grid" style={{ marginTop: 12 }}>
            <label>Change tier<select value={form.tierId} onChange={(e) => setForm((p) => ({ ...p, tierId: e.target.value }))}><option value="">Select tier</option>{tiers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
            <label>Status<select value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}>{["active", "trialing", "paused", "cancelled", "past_due", "lifetime"].map((v) => <option key={v} value={v}>{v}</option>)}</select></label>
            <label>Payment<select value={form.paymentStatus} onChange={(e) => setForm((p) => ({ ...p, paymentStatus: e.target.value }))}>{PAYMENT_STATUS_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}</select></label>
            <label>Trial ends<input type="date" value={form.trialEndsAt} onChange={(e) => setForm((p) => ({ ...p, trialEndsAt: e.target.value }))} /></label>
            <label>Renews at<input type="date" value={form.renewsAt} onChange={(e) => setForm((p) => ({ ...p, renewsAt: e.target.value }))} /></label>
            <label>Reason<input value={form.reason} onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))} /></label>
            <button type="button" onClick={assign}>Assign / update subscription</button>
            <button type="button" onClick={doResetUsage}>Reset monthly usage</button>
          </div>
        </div>
        <div>
          <h3>Manual Feature Overrides</h3>
          <div className="admin-action-grid">
            <label>Feature<select value={override.featureKey} onChange={(e) => setOverride((p) => ({ ...p, featureKey: e.target.value }))}><option value="">Select feature</option>{features.map((f) => <option key={f.featureKey} value={f.featureKey}>{f.featureGroup} – {f.featureName}</option>)}</select></label>
            <label className="admin-checkbox-row"><input type="checkbox" checked={override.enabled} onChange={(e) => setOverride((p) => ({ ...p, enabled: e.target.checked }))} /> Enabled</label>
            <label>Limit override<input type="number" value={override.limitOverride} onChange={(e) => setOverride((p) => ({ ...p, limitOverride: e.target.value }))} /></label>
            <label>Expires at<input type="date" value={override.expiresAt} onChange={(e) => setOverride((p) => ({ ...p, expiresAt: e.target.value }))} /></label>
            <label>Reason<input value={override.reason} onChange={(e) => setOverride((p) => ({ ...p, reason: e.target.value }))} /></label>
            <button type="button" onClick={addOverride}>Add override</button>
          </div>
          {(panel?.overrides || []).map((entry) => (
            <div key={entry.id} className="admin-log-row">
              <strong>{entry.featureKey}</strong>
              <span>{entry.enabled ? "enabled" : "disabled"} {entry.limitOverride != null ? `· limit ${entry.limitOverride}` : ""}</span>
              <button type="button" onClick={() => setRemoveTarget(entry)} style={{ background: "none", border: "none", color: "var(--a-danger)", cursor: "pointer", fontSize: 12, padding: 0 }}>Remove</button>
            </div>
          ))}
        </div>
      </div>
      <div className="admin-detail-grid" style={{ marginTop: 12 }}>
        <div className="admin-panel">
          <h3>Enabled Features</h3>
          <p className="admin-muted" style={{ marginTop: 0 }}>{(panel?.enabledFeatures || []).join(", ") || "None"}</p>
        </div>
        <div className="admin-panel">
          <h3>Current Usage</h3>
          {(panel?.usage || []).length ? panel.usage.map((entry) => (
            <div key={entry.id} className="admin-log-row">
              <strong>{entry.featureKey}</strong>
              <span>{entry.usedAmount} / {entry.limitAmount ?? "unlimited"}</span>
            </div>
          )) : <p className="admin-muted" style={{ marginTop: 0 }}>No usage tracked yet.</p>}
        </div>
      </div>
    </div>
  );
}

/* ── Main Page ─────────────────────────────────────────────────────────────── */
export default function UserDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("overview");
  const [emailDraft, setEmailDraft] = useState({ subject: "", message: "" });
  const [emailBusy, setEmailBusy] = useState("");

  useEffect(() => {
    let m = true;
    setDetail(null); setError("");
    fetchAdminUserDetail(decodeURIComponent(id))
      .then((data) => m && setDetail(data))
      .catch((err) => m && setError(err instanceof Error ? err.message : "Unable to load user."));
    return () => { m = false; };
  }, [id]);

  const onUpdated = (nextUser) => setDetail((prev) => ({ ...prev, user: nextUser }));

  const sendUserEmail = async (e) => {
    e.preventDefault();
    if (!emailDraft.subject.trim() || !emailDraft.message.trim()) { toast("Subject and message required.", "error"); return; }
    setEmailBusy("send");
    try {
      await sendAdminUserEmail(user.id, { subject: emailDraft.subject, message: emailDraft.message, reason: "Admin user communication" });
      toast("Email queued.");
      setEmailDraft({ subject: "", message: "" });
    } catch (err) { toast(err instanceof Error ? err.message : "Failed.", "error"); }
    finally { setEmailBusy(""); }
  };

  const resendVerification = async () => {
    setEmailBusy("verify");
    try { await resendAdminUserEmailVerification(user.id, { reason: "Admin resent email verification" }); toast("Verification email queued."); }
    catch (err) { toast(err instanceof Error ? err.message : "Failed.", "error"); }
    finally { setEmailBusy(""); }
  };

  const setEmailVerified = async (verified) => {
    setEmailBusy("mark");
    try {
      const result = await updateAdminUserEmailVerified(user.id, { verified, reason: verified ? "Admin verified" : "Admin unverified" });
      onUpdated(result.user);
      toast(verified ? "Email marked verified." : "Email marked unverified.");
    } catch (err) { toast(err instanceof Error ? err.message : "Failed.", "error"); }
    finally { setEmailBusy(""); }
  };

  if (error) return (
    <AdminLayout breadcrumbs={[{ label: "Users", href: "/admin/users" }, { label: "Error" }]}>
      <div className="admin-error">{error}</div>
    </AdminLayout>
  );

  if (!detail) return (
    <AdminLayout breadcrumbs={[{ label: "Users", href: "/admin/users" }, { label: "Loading…" }]}>
      <Spinner label="Loading user…" />
    </AdminLayout>
  );

  const user = detail.user || {};
  const permissions = rolePermissions(user.role);
  const socialLinks = user.socialLinks || {};

  const TABS = [
    { key: "overview", label: "Overview" },
    { key: "subscriptions", label: "Subscriptions" },
    { key: "actions", label: "Reports & Actions" },
    { key: "audit", label: "Audit Log" },
  ];

  return (
    <AdminLayout breadcrumbs={[{ label: "Users", href: "/admin/users" }, { label: user.name || user.email }]}>
      <div className="admin-section">
        <button type="button" className="admin-back" onClick={() => navigate("/admin/users")}>← Back to Users</button>

        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{user.name || user.email}</h2>
            <StatusBadge value={user.status} />
            <StatusBadge value={user.role} />
            <StatusBadge value={user.verificationStatus} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span className="admin-muted" style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}>{user.id}</span>
            <CopyButton value={user.id} />
          </div>
        </div>

        <div className="admin-tabs">
          {TABS.map((t) => (
            <button key={t.key} type="button" className={`admin-tab${tab === t.key ? " is-active" : ""}`} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === "overview" && (
          <div className="admin-detail-grid">
            <div className="admin-panel">
              <h3>Identity</h3>
              {user.profileImageUrl && <img className="admin-profile-photo" src={user.profileImageUrl} alt="" />}
              <dl className="admin-definition-list">
                <dt>Name</dt><dd>{user.name || "-"}</dd>
                <dt>Email</dt><dd>{user.email}</dd>
                <dt>Phone</dt><dd>{user.phone || "-"}</dd>
                <dt>Country</dt><dd>{user.country || "-"}</dd>
                <dt>City</dt><dd>{user.city || "-"}</dd>
                <dt>Language</dt><dd>{user.language || "-"}</dd>
                <dt>Breeder name</dt><dd>{user.breederName || "-"}</dd>
                <dt>Website</dt><dd>{user.websiteUrl || "-"}</dd>
                <dt>Social</dt><dd>{[socialLinks.instagram, socialLinks.facebook, socialLinks.telegram].filter(Boolean).join(", ") || "-"}</dd>
                <dt>Joined</dt><dd>{formatDate(user.joinedDate)}</dd>
                <dt>Last login</dt><dd>{formatDate(user.lastLoginAt)}</dd>
                <dt>Email verified</dt><dd>{user.emailVerified ? "Yes" : "No"}</dd>
              </dl>
            </div>

            <div className="admin-panel">
              <h3>Role & Permissions</h3>
              <dl className="admin-definition-list">
                <dt>Role</dt><dd><StatusBadge value={user.role} /></dd>
                {PERMISSION_LABELS.map((p) => (
                  <React.Fragment key={p}>
                    <dt style={{ fontSize: 12 }}>{p}</dt>
                    <dd style={{ color: permissions[p] ? "#15803d" : "#991b1b", fontSize: 12 }}>{permissions[p] ? "✓ allowed" : "✗ blocked"}</dd>
                  </React.Fragment>
                ))}
              </dl>
            </div>

            <div className="admin-panel admin-panel-wide">
              <h3>Email Communication</h3>
              <form className="admin-form-grid" onSubmit={sendUserEmail} style={{ gridTemplateColumns: "1fr 2fr auto auto auto" }}>
                <label>
                  <span className="admin-field-label">Subject <Req /></span>
                  <input value={emailDraft.subject} onChange={(e) => setEmailDraft((p) => ({ ...p, subject: e.target.value }))} />
                </label>
                <label style={{ gridColumn: "2" }}>
                  <span className="admin-field-label">Message <Req /></span>
                  <textarea rows={2} value={emailDraft.message} onChange={(e) => setEmailDraft((p) => ({ ...p, message: e.target.value }))} style={{ resize: "vertical" }} />
                </label>
                <button type="submit" disabled={Boolean(emailBusy)}>{emailBusy === "send" ? "Sending…" : "Send email"}</button>
                <button type="button" disabled={Boolean(emailBusy)} onClick={resendVerification}>{emailBusy === "verify" ? "Sending…" : "Resend verify"}</button>
                <button type="button" disabled={Boolean(emailBusy)} onClick={() => setEmailVerified(!user.emailVerified)}>
                  {emailBusy === "mark" ? "Saving…" : user.emailVerified ? "Mark unverified" : "Mark verified"}
                </button>
              </form>
            </div>

            <ActionControls user={user} onUpdated={onUpdated} />
            <MarketplacePermissionPanel userId={user.id} />
          </div>
        )}

        {tab === "subscriptions" && (
          <div className="admin-detail-grid">
            <SubscriptionPanel user={user} onUpdated={onUpdated} />
            <UserTierSubscriptionPanel userId={user.id} />
          </div>
        )}

        {tab === "actions" && (
          <div className="admin-detail-grid">
            <div className="admin-panel admin-panel-wide">
              <h3>Reports Connected to User</h3>
              {(detail.reports || []).length ? (
                <div className="admin-mini-table">
                  {(detail.reports || []).map((report) => (
                    <div key={report.id} className="admin-mini-row">
                      <div className="admin-id-cell"><span className="mono">{String(report.id).slice(0, 8)}…</span><CopyButton value={report.id} /></div>
                      <StatusBadge value={report.type} />
                      <StatusBadge value={report.status} />
                      <span>{report.reporter?.email || "-"}</span>
                      <span>{formatDate(report.createdAt)}</span>
                      <span>{report.assignedAdmin?.email || "Unassigned"}</span>
                    </div>
                  ))}
                </div>
              ) : <p className="admin-muted">No reports connected to this user.</p>}
            </div>
            <div className="admin-panel admin-panel-wide">
              <h3>Activity Timeline</h3>
              {(detail.activity || []).length ? detail.activity.map((entry) => (
                <div key={entry.id} className="admin-log-row">
                  <span>{entry.action}</span>
                  <span className="admin-muted">{formatDate(entry.createdAt)}</span>
                </div>
              )) : <p className="admin-muted">No activity timeline entries yet.</p>}
            </div>
          </div>
        )}

        {tab === "audit" && (
          <div className="admin-panel">
            <h3>Audit Log</h3>
            {(detail.auditLogs || []).length ? detail.auditLogs.map((entry) => (
              <div key={entry.id} className="admin-log-row">
                <strong>{entry.action}</strong>
                <span>{entry.reason}</span>
                <span className="admin-muted">{formatDate(entry.createdAt)}</span>
              </div>
            )) : <p className="admin-muted">No admin actions recorded.</p>}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
