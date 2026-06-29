import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import MarketplacePage from "../features/marketplace/MarketplacePage.jsx";
import {
  fetchAdminDashboard,
  fetchAdminReports,
  fetchAdminVerificationRequests,
  fetchAdminUserDetail,
  fetchAdminUsers,
  addUserFeatureOverride,
  applyAdminReportAction,
  archiveSubscriptionTier,
  assignUserSubscriptionTier,
  createAdminGdprRequest,
  createSubscriptionTier,
  duplicateSubscriptionTier,
  fetchFeatureCatalog,
  fetchAdminGdprRequests,
  fetchAdminLabAccounts,
  fetchAdminMarketplacePermission,
  fetchSubscriptionTier,
  fetchSubscriptionTiers,
  fetchUserSubscriptionPanel,
  removeUserFeatureOverride,
  resetUserUsage,
  sendAdminNotification,
  updateSubscriptionTier,
  updateAdminGdprRequest,
  updateAdminLabAccount,
  updateAdminMarketplacePermission,
  updateAdminReportStatus,
  updateAdminVerificationRequest,
  updateAdminUserRole,
  updateAdminUserStatus,
  updateAdminUserSubscription,
  updateAdminUserVerification,
} from "../shared/apiClient";

// ── Toast ─────────────────────────────────────────────────────────────────────
const ToastCtx = createContext(null);

function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const show = useCallback((message, type = "success") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4500);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div className="admin-toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`admin-toast admin-toast--${t.type}`}>
            <span>{t.message}</span>
            <button type="button" onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}>×</button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

const useToast = () => useContext(ToastCtx) ?? (() => {});

// ── ConfirmModal ───────────────────────────────────────────────────────────────
function ConfirmModal({ title, message, confirmLabel = "Confirm", danger = false, onConfirm, onCancel }) {
  return (
    <div className="admin-modal-backdrop" onClick={onCancel}>
      <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        {message && <p>{message}</p>}
        <div className="admin-modal-actions">
          <button type="button" className="admin-modal-cancel" onClick={onCancel}>Cancel</button>
          <button type="button" className={`admin-modal-confirm${danger ? " danger" : ""}`} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

// ── PromptModal — collects a reason string before a destructive action ─────────
function PromptModal({ title, message, label = "Reason", required = true, danger = false, confirmLabel = "Confirm", onConfirm, onCancel }) {
  const [value, setValue] = useState("");
  const submit = () => {
    if (required && !value.trim()) return;
    onConfirm(value.trim());
  };
  return (
    <div className="admin-modal-backdrop" onClick={onCancel}>
      <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        {message && <p>{message}</p>}
        <div className="admin-prompt-modal">
          <div className="admin-field-label">{label}{required && <span className="admin-required">*</span>}</div>
          <textarea rows={3} value={value} onChange={(e) => setValue(e.target.value)} placeholder={required ? "Required" : "Optional"} />
        </div>
        <div className="admin-modal-actions" style={{ marginTop: 16 }}>
          <button type="button" className="admin-modal-cancel" onClick={onCancel}>Cancel</button>
          <button type="button" className={`admin-modal-confirm${danger ? " danger" : ""}`} disabled={required && !value.trim()} onClick={submit}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

// ── CopyButton ─────────────────────────────────────────────────────────────────
function CopyButton({ value }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(String(value || "")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button type="button" className="admin-copy-btn" title={copied ? "Copied!" : "Copy ID"} onClick={copy}>
      {copied ? "✓" : "⧉"}
    </button>
  );
}

// ── Spinner ────────────────────────────────────────────────────────────────────
function Spinner({ label = "Loading..." }) {
  return <div className="admin-loading-row"><div className="admin-spinner" /><span>{label}</span></div>;
}

// ── Required asterisk ──────────────────────────────────────────────────────────
function Req() { return <span className="admin-required">*</span>; }

// ── StatusBadge ────────────────────────────────────────────────────────────────
function StatusBadge({ value }) {
  const key = String(value || "").toLowerCase().replace(/\s+/g, "_");
  return <span className={`admin-badge admin-badge--${key}`}>{value || "-"}</span>;
}

const AUTH_STORAGE_KEY = "breedingPlannerAdminAuthSession";

const readRole = () => {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return String(parsed?.role || parsed?.profile?.role || "").trim().toLowerCase();
  } catch {
    return "";
  }
};

const adminPath = () => {
  const hash = String(window.location.hash || "#/admin").replace(/^#/, "");
  return hash.startsWith("/admin") ? hash : "/admin";
};

const go = (path) => {
  window.location.hash = path;
};

const formatDate = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString();
};

const ROLE_OPTIONS = ["buyer", "breeder", "lab", "moderator", "admin", "support"];
const STATUS_OPTIONS = ["active", "pending", "restricted", "suspended", "banned", "deleted"];
const VERIFICATION_OPTIONS = ["not_applied", "pending", "approved", "rejected", "revoked", "more_info_requested"];
const SUBSCRIPTION_OPTIONS = ["free", "hobby", "breeder", "professional", "lab", "enterprise"];
const ACTIVITY_OPTIONS = ["active_today", "active_this_week", "inactive_30_days"];
const SUBSCRIPTION_STATUS_OPTIONS = ["inactive", "active", "trialing", "past_due", "expired", "cancelled", "lifetime"];
const PAYMENT_STATUS_OPTIONS = ["none", "paid", "pending", "failed", "waived", "refunded"];
const REPORT_TYPE_OPTIONS = ["fake_listing", "incorrect_genetics", "scam_suspicion", "abusive_message", "non_payment", "animal_welfare_concern", "spam", "other"];
const REPORT_STATUS_OPTIONS = ["open", "under_review", "waiting_for_response", "resolved", "dismissed", "escalated"];
const REPORT_ACTION_OPTIONS = ["warn_user", "restrict_messaging", "remove_listing", "suspend_account", "ban_account", "escalate_report"];
const VERIFICATION_REQUEST_STATUS_OPTIONS = ["pending_review", "approved", "rejected", "more_info_requested", "revoked"];
const PERMISSION_LABELS = [
  "can_create_listings",
  "can_publish_marketplace_animals",
  "can_use_lab_system",
  "can_manage_test_orders",
  "can_access_admin_panel",
  "can_moderate_listings",
  "can_message_users",
  "can_create_collaborations",
];

const rolePermissions = (role) => {
  const normalized = String(role || "").toLowerCase();
  return {
    can_create_listings: ["breeder", "admin"].includes(normalized),
    can_publish_marketplace_animals: ["breeder", "admin"].includes(normalized),
    can_use_lab_system: ["lab", "admin"].includes(normalized),
    can_manage_test_orders: ["lab", "admin"].includes(normalized),
    can_access_admin_panel: ["admin", "moderator", "support"].includes(normalized),
    can_moderate_listings: ["admin", "moderator"].includes(normalized),
    can_message_users: normalized !== "banned",
    can_create_collaborations: ["breeder", "admin"].includes(normalized),
  };
};

const logoSrc = `${typeof process !== "undefined" ? (process.env.PUBLIC_URL || "") : ""}/app-icons/icon_512x512.png`;

function AdminLayout({ path, title, children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const nav = [
    { label: "Dashboard", items: [["/admin", "Dashboard"]] },
    { label: "Users", items: [
      ["/admin/users", "All Users"],
      ["/admin/users?verification=pending", "Pending Verification"],
      ["/admin/users?status=suspended", "Suspended Users"],
    ] },
    { label: "Breeders", items: [
      ["/admin/verification?status=pending_review", "Applications"],
      ["/admin/users?role=breeder&verification=approved", "Verified Breeders"],
    ] },
    { label: "Subscriptions", items: [
      ["/admin/tiers", "Tier Overview"],
      ["/admin/tiers/new", "Create Tier"],
      ["/admin/users", "User Subscriptions"],
    ] },
    { label: "Reports", items: [
      ["/admin/reports?status=open", "Open Reports"],
      ["/admin/reports?type=scam_suspicion", "Marketplace Disputes"],
      ["/admin/reports?type=abusive_message", "Message Reports"],
    ] },
    { label: "Marketplace", items: [
      ["/admin/marketplace", "Listings"],
    ] },
    { label: "Labs", items: [
      ["/admin/labs", "Lab Accounts"],
    ] },
    { label: "Messages", items: [
      ["/admin/notifications", "Announcements"],
    ] },
    { label: "Settings", items: [
      ["/admin/gdpr", "GDPR Tools"],
    ] },
  ];

  const navigate = (href) => {
    go(href);
    setSidebarOpen(false);
  };

  return (
    <div className="admin-shell">
      {sidebarOpen && <div className="admin-sidebar-overlay" onClick={() => setSidebarOpen(false)} />}
      <aside className={`admin-sidebar${sidebarOpen ? " is-open" : ""}`}>
        <div className="admin-brand">
          <img src={logoSrc} alt="Admin" className="admin-brand-logo" />
          Admin Panel
          <button type="button" className="admin-sidebar-close" onClick={() => setSidebarOpen(false)}>×</button>
        </div>
        <nav>
          {nav.map((group) => (
            <div key={group.label} className="admin-nav-group">
              <span>{group.label}</span>
              {group.items.map(([href, label]) => {
                const hrefOnly = href.split("?")[0];
                const active = path === hrefOnly || (hrefOnly !== "/admin" && path.startsWith(hrefOnly));
                return (
                  <button
                    key={`${group.label}:${label}:${href}`}
                    type="button"
                    className={active ? "active" : ""}
                    onClick={() => navigate(href)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>
      <main className="admin-main">
        <div className="admin-topbar">
          <div className="admin-topbar-left">
            <button type="button" className="admin-hamburger" onClick={() => setSidebarOpen(true)}>☰</button>
            <div>
              <div className="admin-eyebrow">Protected admin workspace</div>
              <h1>{title || "Admin Panel"}</h1>
            </div>
          </div>
          <div className="admin-topbar-actions">
            <button type="button" onClick={() => go("/")}>Start</button>
            <button type="button" onClick={() => go("/breeder")}>Breeder App</button>
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}

function DashboardCard({ label, value, onClick }) {
  return (
    <button type="button" className="admin-card" onClick={onClick}>
      <span>{label}</span>
      <strong>{Number(value || 0).toLocaleString()}</strong>
    </button>
  );
}

function AdminDashboard() {
  const [cards, setCards] = useState({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    setError("");
    fetchAdminDashboard()
      .then((data) => setCards(data.cards || {}))
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load dashboard."))
      .finally(() => setLoading(false));
  };

  useEffect(() => { let m = true; load(); return () => { m = false; }; }, []);

  return (
    <section className="admin-section">
      <div className="admin-section-header">
        <div>
          <h2>Dashboard</h2>
          <p>Summary of platform users, breeder verification, reports, and subscriptions.</p>
        </div>
        <button type="button" onClick={load}>Refresh</button>
      </div>
      {error && <div className="admin-error">{error}</div>}
      {loading ? <Spinner label="Loading dashboard..." /> : (
        <div className="admin-card-grid">
          <DashboardCard label="Total Users" value={cards.totalUsers} onClick={() => go("/admin/users")} />
          <DashboardCard label="New Users This Week" value={cards.newUsersThisWeek} onClick={() => go("/admin/users")} />
          <DashboardCard label="Pending Breeder Verification" value={cards.pendingBreederVerification} onClick={() => go("/admin/users?verification=pending")} />
          <DashboardCard label="Suspended Users" value={cards.suspendedUsers} onClick={() => go("/admin/users?status=suspended")} />
          <DashboardCard label="Reported Users" value={cards.reportedUsers} onClick={() => go("/admin/reports")} />
          <DashboardCard label="Verified Breeders" value={cards.verifiedBreeders} onClick={() => go("/admin/users?role=breeder&verification=approved")} />
          <DashboardCard label="Active Subscriptions" value={cards.activeSubscriptions} onClick={() => go("/admin/users?subscription=breeder")} />
          <DashboardCard label="Expired Subscriptions" value={cards.expiredSubscriptions} onClick={() => go("/admin/users")} />
        </div>
      )}
    </section>
  );
}

function useAdminQuery(path) {
  return useMemo(() => {
    const query = path.includes("?") ? path.slice(path.indexOf("?") + 1) : "";
    return Object.fromEntries(new URLSearchParams(query).entries());
  }, [path]);
}

function PaginationControls({ page, pageSize, total, onPage }) {
  const ps = Number(pageSize || 25);
  const pageCount = Math.max(1, Math.ceil(Number(total || 0) / ps));
  const from = Math.min((page - 1) * ps + 1, Number(total || 0));
  const to = Math.min(page * ps, Number(total || 0));
  return (
    <div className="admin-pagination">
      <span className="admin-muted">
        {Number(total || 0) > 0 ? `Showing ${from.toLocaleString()}–${to.toLocaleString()} of ${Number(total).toLocaleString()}` : "No records"}
      </span>
      <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
      <span>Page {page} of {pageCount}</span>
      <button type="button" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>Next</button>
    </div>
  );
}

function UsersPage({ path }) {
  const initial = useAdminQuery(path);
  const [filters, setFilters] = useState({
    search: initial.search || "",
    role: initial.role || "",
    status: initial.status || "",
    verification: initial.verification || "",
    subscription: initial.subscription || "",
    activity: initial.activity || "",
    page: Number(initial.page || 1),
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
        setFilters((prev) => ({ ...prev, page: Number(data.page || nextFilters.page || 1), pageSize: Number(data.pageSize || nextFilters.pageSize || 25) }));
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load users."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    const nextFilters = {
      search: initial.search || "",
      role: initial.role || "",
      status: initial.status || "",
      verification: initial.verification || "",
      subscription: initial.subscription || "",
      activity: initial.activity || "",
      page: Number(initial.page || 1),
      pageSize: 25,
    };
    setFilters(nextFilters);
    load(nextFilters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  const updateFilter = (key, value) => setFilters((prev) => ({ ...prev, [key]: value, page: 1 }));
  const changePage = (page) => {
    const nextFilters = { ...filters, page };
    setFilters(nextFilters);
    load(nextFilters);
  };

  return (
    <section className="admin-section">
      <div className="admin-section-header">
        <h2>All Users</h2>
        <p>Search, filter, and open user records for role, status, verification, subscription, reports, and audit review.</p>
      </div>
      <div className="admin-filters">
        <input value={filters.search} onChange={(e) => updateFilter("search", e.target.value)} placeholder="Search name, email, breeder" />
        <select value={filters.role} onChange={(e) => updateFilter("role", e.target.value)}>
          <option value="">All roles</option>
          {ROLE_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select value={filters.status} onChange={(e) => updateFilter("status", e.target.value)}>
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select value={filters.verification} onChange={(e) => updateFilter("verification", e.target.value)}>
          <option value="">All verification</option>
          {VERIFICATION_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select value={filters.subscription} onChange={(e) => updateFilter("subscription", e.target.value)}>
          <option value="">All subscriptions</option>
          {SUBSCRIPTION_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select value={filters.activity} onChange={(e) => updateFilter("activity", e.target.value)}>
          <option value="">All activity</option>
          {ACTIVITY_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
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
              <th>Subscription</th>
              <th>Verified Status</th>
              <th>Country</th>
              <th>Joined Date</th>
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
                <td>{user.email}</td>
                <td>{user.role}</td>
                <td><StatusBadge value={user.status} /></td>
                <td>{user.subscription?.plan || "free"}</td>
                <td><StatusBadge value={user.verificationStatus} /></td>
                <td>{user.country || "-"}</td>
                <td>{formatDate(user.joinedDate)}</td>
                <td>{formatDate(user.lastLoginAt)}</td>
                <td>
                  <div className="admin-row-actions">
                    <button type="button" onClick={() => go(`/admin/users/${user.id}`)}>Open</button>
                    <button type="button" onClick={() => go(`/admin/reports?search=${encodeURIComponent(user.email)}`)}>Reports</button>
                  </div>
                </td>
              </tr>
            ))}
            {!users.length && (
              <tr><td colSpan={11}>{loading ? <Spinner /> : "No users found."}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="admin-table-footer">
        <div className="admin-muted">{total.toLocaleString()} user records</div>
        <PaginationControls page={filters.page} pageSize={filters.pageSize} total={total} onPage={changePage} />
      </div>
    </section>
  );
}

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
    if (!reason.trim()) {
      setError("Reason is required for admin actions.");
      return;
    }
    setBusy(kind);
    setError("");
    setConfirm(null);
    try {
      let result;
      if (kind === "role") result = await updateAdminUserRole(user.id, { role: value, reason, internalNote: note });
      if (kind === "status") result = await updateAdminUserStatus(user.id, { status: value, reason, internalNote: note });
      if (kind === "verification") result = await updateAdminUserVerification(user.id, { verificationStatus: value, reason, internalNote: note });
      setReason("");
      setNote("");
      toast(`${kind.charAt(0).toUpperCase() + kind.slice(1)} updated to "${value}".`);
      onUpdated(result?.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Admin action failed.");
      toast(err instanceof Error ? err.message : "Admin action failed.", "error");
    } finally {
      setBusy("");
    }
  };

  const requestAction = (kind, value) => {
    if (!reason.trim()) { setError("Select a reason before applying changes."); return; }
    const isDestructive =
      (kind === "status" && DESTRUCTIVE_STATUSES.includes(value)) ||
      (kind === "role" && DESTRUCTIVE_ROLES.includes(value));
    if (isDestructive) {
      setConfirm({ kind, value, label: `${kind}: ${value}` });
    } else {
      run(kind, value);
    }
  };

  return (
    <div className="admin-panel">
      <h3>Admin Actions</h3>
      {confirm && (
        <ConfirmModal
          title={`Confirm: change ${confirm.kind} to "${confirm.value}"`}
          message={`This will ${confirm.value === "banned" || confirm.value === "deleted" ? "permanently affect" : "modify"} user "${user.name || user.email}". Are you sure?`}
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
          <option value="spam">spam</option>
          <option value="fake_profile">fake_profile</option>
          <option value="payment_issue">payment_issue</option>
          <option value="fraud_suspicion">fraud_suspicion</option>
          <option value="policy_violation">policy_violation</option>
          <option value="user_request">user_request</option>
          <option value="other">other</option>
        </select>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Internal note (optional)" />
      </div>
      {error && <div className="admin-error">{error}</div>}
      <div className="admin-action-grid">
        <label>
          Role
          <select value={draftRole} onChange={(e) => setDraftRole(e.target.value)}>
            {ROLE_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <button type="button" disabled={Boolean(busy) || draftRole === user.role} onClick={() => requestAction("role", draftRole)}>
            {busy === "role" ? "Saving…" : "Change Role"}
          </button>
        </label>
        <label>
          Status
          <select value={draftStatus} onChange={(e) => setDraftStatus(e.target.value)}>
            {STATUS_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <button type="button" disabled={Boolean(busy) || draftStatus === user.status} onClick={() => requestAction("status", draftStatus)}>
            {busy === "status" ? "Saving…" : "Change Status"}
          </button>
        </label>
        <label>
          Breeder Verification
          <select value={draftVerification} onChange={(e) => setDraftVerification(e.target.value)}>
            {VERIFICATION_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <button type="button" disabled={Boolean(busy) || draftVerification === user.verificationStatus} onClick={() => requestAction("verification", draftVerification)}>
            {busy === "verification" ? "Saving…" : "Change Verification"}
          </button>
        </label>
      </div>
    </div>
  );
}

function MarketplacePermissionPanel({ userId }) {
  const toast = useToast();
  const [permission, setPermission] = useState(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    fetchAdminMarketplacePermission(userId)
      .then((data) => mounted && setPermission(data.permission || {}))
      .catch((err) => mounted && setError(err instanceof Error ? err.message : "Unable to load marketplace permissions."));
    return () => { mounted = false; };
  }, [userId]);

  const updateField = (key, value) => setPermission((prev) => ({ ...(prev || {}), [key]: value }));
  const save = async () => {
    if (!reason.trim()) { setError("Reason is required."); return; }
    setBusy(true);
    setError("");
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
      const msg = err instanceof Error ? err.message : "Marketplace permission update failed.";
      setError(msg);
      toast(msg, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-panel">
      <h3>Marketplace Permissions</h3>
      {error && <div className="admin-error">{error}</div>}
      {!permission ? <Spinner label="Loading marketplace permissions…" /> : (
        <div className="admin-action-grid">
          <label><input type="checkbox" checked={permission.canAccess !== false} onChange={(e) => updateField("canAccess", e.target.checked)} /> Allow marketplace access</label>
          <label><input type="checkbox" checked={Boolean(permission.requireApproval)} onChange={(e) => updateField("requireApproval", e.target.checked)} /> Require listing approval</label>
          <label><input type="checkbox" checked={Boolean(permission.featuredBreeder)} onChange={(e) => updateField("featuredBreeder", e.target.checked)} /> Feature breeder</label>
          <label>Active listing limit<input type="number" value={permission.activeListingLimit || 0} onChange={(e) => updateField("activeListingLimit", e.target.value)} /></label>
          <label>Disabled reason<input value={permission.disabledReason || ""} onChange={(e) => updateField("disabledReason", e.target.value)} /></label>
          <label>
            <span className="admin-field-label">Reason <Req /></span>
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Required" className={!reason ? "admin-action-reason-required" : ""} />
          </label>
          <button type="button" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save marketplace controls"}</button>
        </div>
      )}
    </div>
  );
}

const dateInputValue = (value) => {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
};

function SubscriptionPanel({ user, onUpdated }) {
  const subscription = user?.subscription || {};
  const [draft, setDraft] = useState(() => ({
    plan: subscription.plan || "free",
    status: subscription.status || "inactive",
    paymentStatus: subscription.paymentStatus || "none",
    startDate: dateInputValue(subscription.startDate),
    renewalDate: dateInputValue(subscription.renewalDate),
    trialEndsAt: dateInputValue(subscription.trialEndsAt),
    reason: "",
    internalNote: "",
  }));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDraft((prev) => ({
      ...prev,
      plan: subscription.plan || "free",
      status: subscription.status || "inactive",
      paymentStatus: subscription.paymentStatus || "none",
      startDate: dateInputValue(subscription.startDate),
      renewalDate: dateInputValue(subscription.renewalDate),
      trialEndsAt: dateInputValue(subscription.trialEndsAt),
    }));
  }, [subscription.plan, subscription.status, subscription.paymentStatus, subscription.startDate, subscription.renewalDate, subscription.trialEndsAt]);

  const update = (key, value) => setDraft((prev) => ({ ...prev, [key]: value }));

  const toast = useToast();
  const save = async () => {
    if (!draft.reason.trim()) {
      setError("Reason is required for subscription changes.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await updateAdminUserSubscription(user.id, draft);
      onUpdated(result.user);
      setDraft((prev) => ({ ...prev, reason: "", internalNote: "" }));
      toast("Subscription updated.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Subscription update failed.";
      setError(msg);
      toast(msg, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-panel">
      <h3>Subscription</h3>
      {error && <div className="admin-error">{error}</div>}
      <div className="admin-action-grid">
        <label>Plan<select value={draft.plan} onChange={(e) => update("plan", e.target.value)}>
          {SUBSCRIPTION_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
        </select></label>
        <label>Status<select value={draft.status} onChange={(e) => update("status", e.target.value)}>
          {SUBSCRIPTION_STATUS_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
        </select></label>
        <label>Payment<select value={draft.paymentStatus} onChange={(e) => update("paymentStatus", e.target.value)}>
          {PAYMENT_STATUS_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
        </select></label>
        <label>Start date<input type="date" value={draft.startDate} onChange={(e) => update("startDate", e.target.value)} /></label>
        <label>Renewal date<input type="date" value={draft.renewalDate} onChange={(e) => update("renewalDate", e.target.value)} /></label>
        <label>Trial ends<input type="date" value={draft.trialEndsAt} onChange={(e) => update("trialEndsAt", e.target.value)} /></label>
        <label>
          <span className="admin-field-label">Reason <Req /></span>
          <input value={draft.reason} onChange={(e) => update("reason", e.target.value)} placeholder="Required" className={!draft.reason ? "admin-action-reason-required" : ""} />
        </label>
        <label>Internal note<input value={draft.internalNote} onChange={(e) => update("internalNote", e.target.value)} /></label>
        <button type="button" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save subscription"}</button>
      </div>
    </div>
  );
}

const emptyTierDraft = () => ({
  name: "New Tier",
  key: "new_tier",
  shortDescription: "",
  longDescription: "",
  badgeText: "",
  monthlyPrice: 0,
  yearlyPrice: 0,
  currency: "EUR",
  trialDays: 0,
  setupFee: "",
  discountLabel: "",
  customPrice: false,
  isActive: true,
  isPublic: true,
  isRecommended: false,
  sortOrder: 0,
  reason: "tier_updated",
  features: [],
});

const mergeTierFeatures = (catalog, tier) => {
  const byKey = new Map((tier?.features || []).map((entry) => [entry.featureKey, entry]));
  return (catalog || []).map((feature) => {
    const existing = byKey.get(feature.featureKey) || {};
    return {
      featureKey: feature.featureKey,
      featureName: feature.featureName,
      featureGroup: feature.featureGroup,
      defaultLimitType: feature.defaultLimitType,
      enabled: Boolean(existing.enabled),
      limitValue: existing.limitValue ?? "",
    };
  });
};

function FeatureCheckboxMatrix({ features, onChange }) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? (features || []).filter((f) => f.featureName?.toLowerCase().includes(q) || f.featureKey?.toLowerCase().includes(q) || f.featureGroup?.toLowerCase().includes(q)) : features || [];
  }, [features, search]);

  const grouped = useMemo(() => {
    const groups = new Map();
    filtered.forEach((feature) => {
      const group = feature.featureGroup || "Other";
      groups.set(group, [...(groups.get(group) || []), feature]);
    });
    return Array.from(groups.entries());
  }, [filtered]);

  const updateFeature = (featureKey, patch) => {
    onChange((features || []).map((feature) => feature.featureKey === featureKey ? { ...feature, ...patch } : feature));
  };

  const toggleGroup = (group, enabled) => {
    onChange((features || []).map((feature) => feature.featureGroup === group ? { ...feature, enabled } : feature));
  };

  return (
    <div className="tier-feature-matrix">
      <div className="admin-feature-search">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search features…"
        />
      </div>
      {grouped.map(([group, items]) => (
        <div key={group} className="admin-panel">
          <div className="tier-group-header">
            <h3>{group}</h3>
            <div className="admin-report-actions">
              <button type="button" onClick={() => toggleGroup(group, true)}>Enable group</button>
              <button type="button" onClick={() => toggleGroup(group, false)}>Disable group</button>
            </div>
          </div>
          <div className="tier-feature-grid">
            {items.map((feature) => (
              <label key={feature.featureKey} className="tier-feature-row">
                <span>
                  <input
                    type="checkbox"
                    checked={Boolean(feature.enabled)}
                    onChange={(event) => updateFeature(feature.featureKey, { enabled: event.target.checked })}
                  />
                  {feature.featureName}
                </span>
                {feature.defaultLimitType ? (
                  <input
                    type="number"
                    min="0"
                    placeholder="Limit"
                    value={feature.limitValue ?? ""}
                    onChange={(event) => updateFeature(feature.featureKey, { limitValue: event.target.value })}
                  />
                ) : null}
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function TierOverviewPage() {
  const toast = useToast();
  const [tiers, setTiers] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [archiveTarget, setArchiveTarget] = useState(null);

  const load = () => {
    setLoading(true);
    return fetchSubscriptionTiers()
      .then((data) => setTiers(Array.isArray(data.tiers) ? data.tiers : []))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load().catch((err) => setError(err instanceof Error ? err.message : "Unable to load tiers.")); }, []);

  const createTier = async () => {
    setError("");
    try {
      const result = await createSubscriptionTier({ ...emptyTierDraft(), key: `tier_${Date.now()}`, name: "New Tier" });
      go(`/admin/tiers/${result.tier.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create tier.");
    }
  };

  const duplicate = async (tier) => {
    setError("");
    try {
      const result = await duplicateSubscriptionTier(tier.id);
      setTiers((prev) => [...prev, result.tier]);
      toast(`"${tier.name}" duplicated.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to duplicate tier.";
      setError(msg); toast(msg, "error");
    }
  };

  const doArchive = async (reason) => {
    const tier = archiveTarget;
    setArchiveTarget(null);
    setError("");
    try {
      await archiveSubscriptionTier(tier.id, { reason });
      await load();
      toast(`"${tier.name}" archived.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to archive tier.";
      setError(msg); toast(msg, "error");
    }
  };

  return (
    <section className="admin-section">
      {archiveTarget && (
        <PromptModal
          title={`Archive "${archiveTarget.name}"`}
          message="Provide a reason for archiving this tier. This will make it unavailable for new sign-ups."
          label="Archive reason"
          danger
          confirmLabel="Archive tier"
          onConfirm={doArchive}
          onCancel={() => setArchiveTarget(null)}
        />
      )}
      <div className="admin-section-header">
        <div>
          <h2>Tier Overview</h2>
          <p>Create, edit, price, activate, hide, duplicate, or archive subscription tiers.</p>
        </div>
        <button type="button" onClick={createTier}>Create new tier</button>
      </div>
      {error && <div className="admin-error">{error}</div>}
      {loading ? <Spinner label="Loading tiers…" /> : (
        <div className="admin-card-grid">
          {tiers.map((tier) => {
            const limits = (tier.features || []).filter((f) => f.limitValue !== null && f.limitValue !== undefined).slice(0, 4);
            return (
              <div key={tier.id} className="admin-panel tier-card">
                <div className="tier-card-title">
                  <h3>{tier.name}</h3>
                  {tier.isRecommended ? <span>Recommended</span> : null}
                </div>
                <p>{tier.shortDescription || "-"}</p>
                <dl className="admin-definition-list">
                  <dt>Monthly</dt><dd>{tier.customPrice ? "Custom" : `${tier.currency} ${tier.monthlyPrice}`}</dd>
                  <dt>Yearly</dt><dd>{tier.customPrice ? "Custom" : `${tier.currency} ${tier.yearlyPrice}`}</dd>
                  <dt>Active users</dt><dd>{tier.activeUsers || 0}</dd>
                  <dt>Status</dt><dd><StatusBadge value={tier.isActive ? "active" : "inactive"} /></dd>
                  <dt>Visibility</dt><dd>{tier.isPublic ? "public" : "hidden"}</dd>
                  <dt>Main limits</dt><dd>{limits.map((f) => `${f.featureKey}: ${f.limitValue}`).join(", ") || "Unlimited / unset"}</dd>
                </dl>
                <div className="admin-report-actions">
                  <button type="button" onClick={() => go(`/admin/tiers/${tier.id}`)}>Edit</button>
                  <button type="button" onClick={() => duplicate(tier)}>Duplicate</button>
                  <button type="button" onClick={() => setArchiveTarget(tier)}>Archive</button>
                </div>
              </div>
            );
          })}
          {!tiers.length && <p className="admin-muted">No tiers found.</p>}
        </div>
      )}
    </section>
  );
}

function TierEditorPage({ id }) {
  const toast = useToast();
  const isNew = id === "new";
  const [catalog, setCatalog] = useState([]);
  const [draft, setDraft] = useState(emptyTierDraft);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const update = (key, value) => setDraft((prev) => ({ ...prev, [key]: value }));

  useEffect(() => {
    let mounted = true;
    Promise.all([
      fetchFeatureCatalog(),
      isNew ? Promise.resolve({ tier: emptyTierDraft() }) : fetchSubscriptionTier(id),
    ])
      .then(([featureData, tierData]) => {
        if (!mounted) return;
        const features = Array.isArray(featureData.features) ? featureData.features : [];
        setCatalog(features);
        const tier = tierData.tier || emptyTierDraft();
        setDraft({
          ...emptyTierDraft(),
          ...tier,
          setupFee: tier.setupFee ?? "",
          reason: "tier_updated",
          features: mergeTierFeatures(features, tier),
        });
      })
      .catch((err) => mounted && setError(err instanceof Error ? err.message : "Unable to load tier editor."));
    return () => { mounted = false; };
  }, [id, isNew]);

  const save = async () => {
    setError("");
    setSaved("");
    try {
      const payload = {
        ...draft,
        monthlyPrice: Number(draft.monthlyPrice || 0),
        yearlyPrice: Number(draft.yearlyPrice || 0),
        trialDays: Number(draft.trialDays || 0),
        sortOrder: Number(draft.sortOrder || 0),
        features: draft.features.map((feature) => ({
          featureKey: feature.featureKey,
          enabled: Boolean(feature.enabled),
          limitValue: feature.limitValue === "" ? null : Number(feature.limitValue),
        })),
      };
      const result = isNew ? await createSubscriptionTier(payload) : await updateSubscriptionTier(id, payload);
      setSaved("Tier saved.");
      toast("Tier saved successfully.");
      if (isNew) go(`/admin/tiers/${result.tier.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save tier.");
    }
  };

  return (
    <section className="admin-section">
      <button type="button" className="admin-back" onClick={() => go("/admin/tiers")}>Back to tiers</button>
      <div className="admin-section-header">
        <div>
          <h2>Tier Editor</h2>
          <p>Edit basic info, pricing, limits, and feature access. The internal key stays stable after creation.</p>
        </div>
        <button type="button" onClick={save}>Save tier</button>
      </div>
      {error && <div className="admin-error">{error}</div>}
      {saved && <div className="admin-success">{saved}</div>}
      <div className="admin-detail-grid">
        <div className="admin-panel">
          <h3>Basic Info</h3>
          <div className="admin-form-grid">
            <label>Tier name<input value={draft.name} onChange={(e) => update("name", e.target.value)} /></label>
            <label>Internal tier key<input value={draft.key} disabled={!isNew} onChange={(e) => update("key", e.target.value)} /></label>
            <label>Short public description<input value={draft.shortDescription} onChange={(e) => update("shortDescription", e.target.value)} /></label>
            <label>Tier badge text<input value={draft.badgeText} onChange={(e) => update("badgeText", e.target.value)} /></label>
            <label>Long public description<textarea rows={4} value={draft.longDescription} onChange={(e) => update("longDescription", e.target.value)} /></label>
            <label><input type="checkbox" checked={draft.isRecommended} onChange={(e) => update("isRecommended", e.target.checked)} /> Recommended</label>
            <label><input type="checkbox" checked={draft.isActive} onChange={(e) => update("isActive", e.target.checked)} /> Active</label>
            <label><input type="checkbox" checked={draft.isPublic} onChange={(e) => update("isPublic", e.target.checked)} /> Publicly visible</label>
          </div>
        </div>
        <div className="admin-panel">
          <h3>Pricing</h3>
          <div className="admin-form-grid">
            <label>Monthly price<input type="number" value={draft.monthlyPrice} onChange={(e) => update("monthlyPrice", e.target.value)} /></label>
            <label>Yearly price<input type="number" value={draft.yearlyPrice} onChange={(e) => update("yearlyPrice", e.target.value)} /></label>
            <label>Currency<input value={draft.currency} onChange={(e) => update("currency", e.target.value)} /></label>
            <label>Trial days<input type="number" value={draft.trialDays} onChange={(e) => update("trialDays", e.target.value)} /></label>
            <label>Setup fee<input type="number" value={draft.setupFee} onChange={(e) => update("setupFee", e.target.value)} /></label>
            <label>Discount label<input value={draft.discountLabel} onChange={(e) => update("discountLabel", e.target.value)} /></label>
            <label><input type="checkbox" checked={draft.customPrice} onChange={(e) => update("customPrice", e.target.checked)} /> Custom price</label>
          </div>
        </div>
      </div>
      <div className="admin-panel">
        <h3>Limits & Feature Access</h3>
        <p className="admin-muted">Use group buttons for fast enable/disable, then set individual limits where applicable. Blank limit means unlimited.</p>
      </div>
      <FeatureCheckboxMatrix features={draft.features.length ? draft.features : mergeTierFeatures(catalog, {})} onChange={(features) => update("features", features)} />
    </section>
  );
}

function UserTierSubscriptionPanel({ userId }) {
  const toast = useToast();
  const [tiers, setTiers] = useState([]);
  const [features, setFeatures] = useState([]);
  const [panel, setPanel] = useState(null);
  const [form, setForm] = useState({ tierId: "", status: "active", paymentStatus: "none", trialEndsAt: "", renewsAt: "", reason: "manual_assignment", internalNote: "" });
  const [override, setOverride] = useState({ featureKey: "", enabled: true, limitOverride: "", reason: "", expiresAt: "" });
  const [removeTarget, setRemoveTarget] = useState(null);
  const [error, setError] = useState("");
  const load = () => Promise.all([fetchSubscriptionTiers(), fetchFeatureCatalog(), fetchUserSubscriptionPanel(userId)])
    .then(([tierData, featureData, panelData]) => {
      setTiers(Array.isArray(tierData.tiers) ? tierData.tiers : []);
      setFeatures(Array.isArray(featureData.features) ? featureData.features : []);
      setPanel(panelData);
      const currentTierId = panelData.subscription?.tier?.id || "";
      setForm((prev) => ({ ...prev, tierId: currentTierId, status: panelData.subscription?.status || "active", paymentStatus: panelData.subscription?.paymentStatus || "none" }));
    });
  useEffect(() => { load().catch((err) => setError(err instanceof Error ? err.message : "Unable to load user subscription.")); }, [userId]);
  const updateForm = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const updateOverride = (key, value) => setOverride((prev) => ({ ...prev, [key]: value }));
  const assign = async () => {
    setError("");
    try {
      await assignUserSubscriptionTier(userId, form);
      await load();
      toast("Subscription tier assigned.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to assign tier.";
      setError(msg); toast(msg, "error");
    }
  };
  const addOverride = async () => {
    setError("");
    try {
      await addUserFeatureOverride(userId, {
        ...override,
        limitOverride: override.limitOverride === "" ? null : Number(override.limitOverride),
      });
      setOverride({ featureKey: "", enabled: true, limitOverride: "", reason: "", expiresAt: "" });
      await load();
      toast("Feature override added.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to add override.";
      setError(msg); toast(msg, "error");
    }
  };
  const doRemoveOverride = async (reason) => {
    const entry = removeTarget;
    setRemoveTarget(null);
    try {
      await removeUserFeatureOverride(userId, entry.id, { reason: reason || "override_removed" });
      await load();
      toast("Override removed.");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Unable to remove override.", "error");
    }
  };
  const resetUsage = async () => {
    setError("");
    try {
      await resetUserUsage(userId, { featureKey: "", reason: "manual_usage_reset" });
      await load();
      toast("Usage reset.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to reset usage.";
      setError(msg); toast(msg, "error");
    }
  };
  return (
    <div className="admin-panel wide">
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
      <h3>User Subscription Page</h3>
      {error && <div className="admin-error">{error}</div>}
      <div className="admin-detail-grid">
        <div>
          <dl className="admin-definition-list">
            <dt>Current tier</dt><dd>{panel?.subscription?.tier?.name || "No active tier"}</dd>
            <dt>Status</dt><dd>{panel?.subscription?.status || "-"}</dd>
            <dt>Payment</dt><dd>{panel?.subscription?.paymentStatus || "-"}</dd>
            <dt>Trial ends</dt><dd>{formatDate(panel?.subscription?.trialEndsAt)}</dd>
            <dt>Renewal date</dt><dd>{formatDate(panel?.subscription?.renewsAt)}</dd>
          </dl>
          <div className="admin-action-grid">
            <label>Change tier<select value={form.tierId} onChange={(e) => updateForm("tierId", e.target.value)}>
              <option value="">Select tier</option>
              {tiers.map((tier) => <option key={tier.id} value={tier.id}>{tier.name}</option>)}
            </select></label>
            <label>Status<select value={form.status} onChange={(e) => updateForm("status", e.target.value)}>
              {["active", "trialing", "paused", "cancelled", "past_due", "lifetime"].map((item) => <option key={item} value={item}>{item}</option>)}
            </select></label>
            <label>Payment<select value={form.paymentStatus} onChange={(e) => updateForm("paymentStatus", e.target.value)}>
              {PAYMENT_STATUS_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
            </select></label>
            <label>Trial ends<input type="date" value={form.trialEndsAt} onChange={(e) => updateForm("trialEndsAt", e.target.value)} /></label>
            <label>Renews at<input type="date" value={form.renewsAt} onChange={(e) => updateForm("renewsAt", e.target.value)} /></label>
            <label>Reason<input value={form.reason} onChange={(e) => updateForm("reason", e.target.value)} /></label>
            <label>Internal admin note<input value={form.internalNote} onChange={(e) => updateForm("internalNote", e.target.value)} /></label>
            <button type="button" onClick={assign}>Assign / update subscription</button>
            <button type="button" onClick={resetUsage}>Reset monthly usage</button>
          </div>
        </div>
        <div>
          <h3>Manual Overrides</h3>
          <div className="admin-action-grid">
            <label>Feature<select value={override.featureKey} onChange={(e) => updateOverride("featureKey", e.target.value)}>
              <option value="">Select feature</option>
              {features.map((feature) => <option key={feature.featureKey} value={feature.featureKey}>{feature.featureGroup} - {feature.featureName}</option>)}
            </select></label>
            <label><input type="checkbox" checked={override.enabled} onChange={(e) => updateOverride("enabled", e.target.checked)} /> Enabled</label>
            <label>Limit override<input type="number" value={override.limitOverride} onChange={(e) => updateOverride("limitOverride", e.target.value)} /></label>
            <label>Expires at<input type="date" value={override.expiresAt} onChange={(e) => updateOverride("expiresAt", e.target.value)} /></label>
            <label>Reason<input value={override.reason} onChange={(e) => updateOverride("reason", e.target.value)} /></label>
            <button type="button" onClick={addOverride}>Add feature override</button>
          </div>
          {(panel?.overrides || []).map((entry) => (
            <div key={entry.id} className="admin-log-row">
              <strong>{entry.featureKey}</strong>
              <span>{entry.enabled ? "enabled" : "disabled"} {entry.limitOverride !== null ? `limit ${entry.limitOverride}` : ""}</span>
              <button type="button" onClick={() => setRemoveTarget(entry)}>Remove</button>
            </div>
          ))}
        </div>
      </div>
      <div className="admin-detail-grid">
        <div className="admin-panel">
          <h3>Enabled Features</h3>
          <p className="admin-muted">{(panel?.enabledFeatures || []).join(", ") || "None"}</p>
        </div>
        <div className="admin-panel">
          <h3>Current Usage</h3>
          {(panel?.usage || []).length ? panel.usage.map((entry) => (
            <div key={entry.id} className="admin-log-row"><strong>{entry.featureKey}</strong><span>{entry.usedAmount} / {entry.limitAmount ?? "unlimited"}</span></div>
          )) : <p className="admin-muted">No usage tracked yet.</p>}
        </div>
      </div>
    </div>
  );
}

function UserDetailPage({ id }) {
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("overview");

  useEffect(() => {
    let mounted = true;
    setDetail(null);
    setError("");
    fetchAdminUserDetail(id)
      .then((data) => mounted && setDetail(data))
      .catch((err) => mounted && setError(err instanceof Error ? err.message : "Unable to load user."));
    return () => { mounted = false; };
  }, [id]);

  if (error) return <div className="admin-section"><div className="admin-error">{error}</div></div>;
  if (!detail) return <div className="admin-section"><Spinner label="Loading user…" /></div>;
  const user = detail.user || {};
  const permissions = rolePermissions(user.role);
  const socialLinks = user.socialLinks || {};
  const onUpdated = (nextUser) => setDetail((prev) => ({ ...prev, user: nextUser }));

  const TABS = [
    { key: "overview", label: "Overview" },
    { key: "subscriptions", label: "Subscriptions" },
    { key: "actions", label: "Reports & Actions" },
    { key: "audit", label: "Audit Log" },
  ];

  return (
    <section className="admin-section">
      <button type="button" className="admin-back" onClick={() => go("/admin/users")}>← Back to users</button>
      <div style={{ marginTop: 16, marginBottom: 16 }}>
        <h2 style={{ margin: "0 0 4px" }}>{user.name || user.email}</h2>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <StatusBadge value={user.status} />
          <StatusBadge value={user.role} />
          <StatusBadge value={user.verificationStatus} />
          <span className="admin-muted">ID: {user.id} <CopyButton value={user.id} /></span>
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
            {user.profileImageUrl ? <img className="admin-profile-photo" src={user.profileImageUrl} alt="" /> : null}
            <dl className="admin-definition-list">
              <dt>Name</dt><dd>{user.name || "-"}</dd>
              <dt>Email</dt><dd>{user.email}</dd>
              <dt>Phone</dt><dd>{user.phone || "-"}</dd>
              <dt>Country</dt><dd>{user.country || "-"}</dd>
              <dt>City</dt><dd>{user.city || "-"}</dd>
              <dt>Language</dt><dd>{user.language || "-"}</dd>
              <dt>Breeder name</dt><dd>{user.breederName || "-"}</dd>
              <dt>Website</dt><dd>{user.websiteUrl || "-"}</dd>
              <dt>Social links</dt><dd>{[socialLinks.instagram, socialLinks.facebook, socialLinks.telegram].filter(Boolean).join(", ") || "-"}</dd>
              <dt>Joined</dt><dd>{formatDate(user.joinedDate)}</dd>
              <dt>Last login</dt><dd>{formatDate(user.lastLoginAt)}</dd>
              <dt>Email verified</dt><dd>{user.emailVerified ? "Yes" : "No"}</dd>
            </dl>
          </div>
          <div className="admin-panel">
            <h3>Role & Permissions</h3>
            <dl className="admin-definition-list">
              <dt>Current role</dt><dd><StatusBadge value={user.role} /></dd>
              {PERMISSION_LABELS.map((p) => (
                <React.Fragment key={p}>
                  <dt>{p}</dt>
                  <dd style={{ color: permissions[p] ? "#166534" : "#9f1239" }}>{permissions[p] ? "allowed" : "blocked"}</dd>
                </React.Fragment>
              ))}
            </dl>
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
          <div className="admin-panel wide">
            <h3>Reports Connected to User</h3>
            {(detail.reports || []).length ? (
              <div className="admin-mini-table">
                {(detail.reports || []).map((report) => (
                  <div key={report.id} className="admin-mini-row">
                    <div className="admin-id-cell"><span className="mono">{String(report.id).slice(0, 8)}…</span><CopyButton value={report.id} /></div>
                    <span><StatusBadge value={report.type} /></span>
                    <span><StatusBadge value={report.status} /></span>
                    <span>{report.reporter?.email || "-"}</span>
                    <span>{formatDate(report.createdAt)}</span>
                    <span>{report.assignedAdmin?.email || "Unassigned"}</span>
                    <span>{report.resolutionNote || "-"}</span>
                  </div>
                ))}
              </div>
            ) : <p className="admin-muted">No reports connected to this user.</p>}
          </div>
          <div className="admin-panel wide">
            <h3>Activity Timeline</h3>
            {(detail.activity || []).length ? detail.activity.map((entry) => (
              <div key={entry.id} className="admin-log-row">{entry.action} — {formatDate(entry.createdAt)}</div>
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
          )) : <p className="admin-muted">No admin actions recorded for this user.</p>}
        </div>
      )}
    </section>
  );
}

function ReportActionModal({ report, onDone, onClose }) {
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const runStatus = async (status) => {
    if (!reason.trim()) { setError("Reason is required."); return; }
    setBusy(`status:${status}`);
    setError("");
    try {
      const result = await updateAdminReportStatus(report.id, { status, reason, resolutionNote: note });
      toast(`Report status set to "${status}".`);
      onDone(result.report);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Status update failed.";
      setError(msg); toast(msg, "error");
    } finally { setBusy(""); }
  };

  const runAction = async (action) => {
    if (!reason.trim()) { setError("Reason is required."); return; }
    const isDestructive = ["ban_account", "suspend_account", "remove_listing"].includes(action);
    const doRun = async () => {
      setBusy(`action:${action}`);
      setError("");
      try {
        const result = await applyAdminReportAction(report.id, { action, reason, internalNote: note });
        toast(`Action "${action}" applied.`);
        onDone(result.report);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Action failed.";
        setError(msg); toast(msg, "error");
      } finally { setBusy(""); }
    };
    if (isDestructive) {
      if (!window.confirm(`Apply "${action}" to ${report.reportedUser?.email || "this user"}? This cannot be undone.`)) return;
    }
    doRun();
  };

  return (
    <div className="admin-modal-backdrop" onClick={onClose}>
      <div className="admin-modal" style={{ width: "min(560px, 100%)" }} onClick={(e) => e.stopPropagation()}>
        <h3>Report: {report.type}</h3>
        <div className="admin-report-modal-meta">
          <strong>{report.description || "No description provided."}</strong>
          Reporter: {report.reporter?.email || "-"} &nbsp;|&nbsp;
          Reported: {report.reportedUser?.email || "-"} &nbsp;|&nbsp;
          Status: <StatusBadge value={report.status} /> &nbsp;|&nbsp;
          Created: {formatDate(report.createdAt)}
        </div>
        <div className="admin-action-modal-body">
          <label>
            <span className="admin-field-label">Reason <Req /></span>
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Required" />
          </label>
          <label>
            <span className="admin-field-label">Resolution / internal note</span>
            <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
          </label>
        </div>
        {error && <div className="admin-error" style={{ marginTop: 10 }}>{error}</div>}
        <div style={{ marginTop: 16 }}>
          <div className="admin-field-label" style={{ marginBottom: 8 }}>Set status</div>
          <div className="admin-report-actions">
            {REPORT_STATUS_OPTIONS.map((s) => (
              <button key={s} type="button" disabled={Boolean(busy)} onClick={() => runStatus(s)}
                style={{ fontSize: 12, padding: "6px 10px" }}>
                {busy === `status:${s}` ? "…" : s}
              </button>
            ))}
          </div>
          <div className="admin-field-label" style={{ margin: "14px 0 8px" }}>Apply action</div>
          <div className="admin-report-actions">
            {REPORT_ACTION_OPTIONS.map((a) => (
              <button key={a} type="button" disabled={Boolean(busy)} onClick={() => runAction(a)}
                style={{ fontSize: 12, padding: "6px 10px", background: ["ban_account","suspend_account"].includes(a) ? "#dc2626" : undefined, color: ["ban_account","suspend_account"].includes(a) ? "white" : undefined, borderColor: ["ban_account","suspend_account"].includes(a) ? "#dc2626" : undefined }}>
                {busy === `action:${a}` ? "…" : a}
              </button>
            ))}
          </div>
        </div>
        <div className="admin-modal-actions" style={{ marginTop: 16 }}>
          <button type="button" className="admin-modal-cancel" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

function ReportsPage({ path }) {
  const initial = useAdminQuery(path);
  const [filters, setFilters] = useState({
    search: initial.search || "",
    status: initial.status || "",
    type: initial.type || "",
    page: Number(initial.page || 1),
    pageSize: 25,
  });
  const [reports, setReports] = useState([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeReport, setActiveReport] = useState(null);

  const load = (nextFilters = filters) => {
    setLoading(true);
    setError("");
    fetchAdminReports(nextFilters)
      .then((data) => {
        setReports(Array.isArray(data.reports) ? data.reports : []);
        setTotal(Number(data.total || 0));
        setFilters((prev) => ({ ...prev, page: Number(data.page || nextFilters.page || 1), pageSize: Number(data.pageSize || nextFilters.pageSize || 25) }));
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load reports."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    const nextFilters = { search: initial.search || "", status: initial.status || "", type: initial.type || "", page: Number(initial.page || 1), pageSize: 25 };
    setFilters(nextFilters);
    load(nextFilters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  const updateFilter = (key, value) => setFilters((prev) => ({ ...prev, [key]: value, page: 1 }));
  const changePage = (page) => { const nf = { ...filters, page }; setFilters(nf); load(nf); };

  const handleDone = (nextReport) => {
    if (!nextReport?.id) return;
    setReports((prev) => prev.map((r) => r.id === nextReport.id ? nextReport : r));
    setActiveReport(nextReport);
  };

  return (
    <section className="admin-section">
      {activeReport && (
        <ReportActionModal
          report={activeReport}
          onDone={handleDone}
          onClose={() => setActiveReport(null)}
        />
      )}
      <div className="admin-section-header">
        <h2>Reports & Safety</h2>
        <p>Review user reports, marketplace disputes, and apply moderation actions.</p>
      </div>
      <div className="admin-filters">
        <input value={filters.search} onChange={(e) => updateFilter("search", e.target.value)} placeholder="Search reporter, user, listing, description" />
        <select value={filters.status} onChange={(e) => updateFilter("status", e.target.value)}>
          <option value="">All statuses</option>
          {REPORT_STATUS_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select value={filters.type} onChange={(e) => updateFilter("type", e.target.value)}>
          <option value="">All report types</option>
          {REPORT_TYPE_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
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
              <th>Status</th>
              <th>Reporter</th>
              <th>Reported User</th>
              <th>Listing</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((report) => (
              <tr key={report.id}>
                <td>
                  <div className="admin-id-cell">
                    <span className="mono" title={report.id}>{String(report.id).slice(0, 8)}…</span>
                    <CopyButton value={report.id} />
                  </div>
                </td>
                <td>{report.type}</td>
                <td><StatusBadge value={report.status} /></td>
                <td>{report.reporter?.email || "-"}</td>
                <td>
                  {report.reportedUser ? (
                    <button type="button" onClick={() => go(`/admin/users/${report.reportedUser.id}`)}>
                      {report.reportedUser.email}
                    </button>
                  ) : "-"}
                </td>
                <td>{report.listing?.title || report.listing?.id || "-"}</td>
                <td>{formatDate(report.createdAt)}</td>
                <td>
                  <button type="button" onClick={() => setActiveReport(report)}>Review →</button>
                </td>
              </tr>
            ))}
            {!reports.length && (
              <tr><td colSpan={8}>{loading ? <Spinner /> : "No reports found."}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <PaginationControls page={filters.page} pageSize={filters.pageSize} total={total} onPage={changePage} />
    </section>
  );
}

function BreederVerificationQueue({ path }) {
  const toast = useToast();
  const initial = useAdminQuery(path);
  const [filters, setFilters] = useState({
    search: initial.search || "",
    status: initial.status || "pending_review",
    page: Number(initial.page || 1),
    pageSize: 25,
  });
  const [requests, setRequests] = useState([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [reasonById, setReasonById] = useState({});
  const [noteById, setNoteById] = useState({});
  const [busy, setBusy] = useState("");
  const [revokeTarget, setRevokeTarget] = useState(null);

  const load = (nextFilters = filters) => {
    setLoading(true);
    setError("");
    fetchAdminVerificationRequests(nextFilters)
      .then((data) => {
        setRequests(Array.isArray(data.requests) ? data.requests : []);
        setTotal(Number(data.total || 0));
        setFilters((prev) => ({ ...prev, page: Number(data.page || nextFilters.page || 1), pageSize: Number(data.pageSize || nextFilters.pageSize || 25) }));
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load breeder applications."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    const nextFilters = {
      search: initial.search || "",
      status: initial.status || "pending_review",
      page: Number(initial.page || 1),
      pageSize: 25,
    };
    setFilters(nextFilters);
    load(nextFilters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);
  const updateFilter = (key, value) => setFilters((prev) => ({ ...prev, [key]: value, page: 1 }));
  const changePage = (page) => {
    const nextFilters = { ...filters, page };
    setFilters(nextFilters);
    load(nextFilters);
  };

  const updateRequestInList = (nextRequest) => {
    if (!nextRequest?.id) return;
    setRequests((prev) => prev.map((request) => request.id === nextRequest.id ? nextRequest : request));
  };

  const runVerification = async (request, status) => {
    const reason = String(reasonById[request.id] || "").trim();
    const adminNote = String(noteById[request.id] || "").trim();
    if (!reason && !adminNote) {
      setError("Reason or admin note is required for breeder verification actions.");
      return;
    }
    if (status === "revoked") {
      setRevokeTarget({ request, reason, adminNote });
      return;
    }
    await doVerification(request, status, reason, adminNote);
  };

  const doVerification = async (request, status, reason, adminNote) => {
    setBusy(`${request.id}:${status}`);
    setError("");
    setRevokeTarget(null);
    try {
      const result = await updateAdminVerificationRequest(request.id, { status, reason: reason || adminNote, adminNote });
      updateRequestInList(result.request);
      toast(`Verification ${status} for ${request.user?.email || "breeder"}.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Breeder verification action failed.";
      setError(msg); toast(msg, "error");
    } finally {
      setBusy("");
    }
  };

  return (
    <section className="admin-section">
      {revokeTarget && (
        <ConfirmModal
          title={`Revoke verification for ${revokeTarget.request.user?.email || "this breeder"}?`}
          message="Revoking verification will remove their verified seller status. This action requires manual re-application."
          confirmLabel="Yes, revoke"
          danger
          onConfirm={() => doVerification(revokeTarget.request, "revoked", revokeTarget.reason, revokeTarget.adminNote)}
          onCancel={() => setRevokeTarget(null)}
        />
      )}
      <div className="admin-section-header">
        <h2>Breeder Verification Queue</h2>
        <p>Review breeder applications, approve verified sellers, reject incomplete applications, request more information, or revoke verification.</p>
      </div>
      <div className="admin-filters">
        <input value={filters.search} onChange={(e) => updateFilter("search", e.target.value)} placeholder="Search breeder, name, email" />
        <select value={filters.status} onChange={(e) => updateFilter("status", e.target.value)}>
          <option value="">All statuses</option>
          {VERIFICATION_REQUEST_STATUS_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <button type="button" onClick={() => load(filters)}>Apply</button>
      </div>
      {error && <div className="admin-error">{error}</div>}
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Application ID</th>
              <th>Breeder</th>
              <th>Status</th>
              <th>Submitted</th>
              <th>Application Fields</th>
              <th>Admin Controls</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((request) => {
              const data = request.submittedData || {};
              return (
                <tr key={request.id}>
                  <td className="mono">{request.id}</td>
                  <td>
                    <div>{data.breederName || request.user?.breederName || request.user?.name || "-"}</div>
                    <button type="button" onClick={() => request.user?.id && go(`/admin/users/${request.user.id}`)}>
                      {request.user?.email || "Open user"}
                    </button>
                  </td>
                  <td>{request.status}</td>
                  <td>{formatDate(request.createdAt)}</td>
                  <td>
                    <dl className="admin-compact-list">
                      <dt>Real name</dt><dd>{data.realName || request.user?.name || "-"}</dd>
                      <dt>Country</dt><dd>{data.country || request.user?.country || "-"}</dd>
                      <dt>Website</dt><dd>{data.website || request.user?.websiteUrl || "-"}</dd>
                      <dt>Social</dt><dd>{data.socialMedia || "-"}</dd>
                      <dt>Years breeding</dt><dd>{data.yearsBreeding || "-"}</dd>
                      <dt>Main species</dt><dd>{data.mainSpecies || "-"}</dd>
                      <dt>Testing history</dt><dd>{data.labTestingHistory || "-"}</dd>
                    </dl>
                  </td>
                  <td>
                    <div className="admin-report-controls">
                      <div className="admin-field-label">Reason <Req /></div>
                      <input
                        value={reasonById[request.id] || ""}
                        onChange={(e) => setReasonById((prev) => ({ ...prev, [request.id]: e.target.value }))}
                        placeholder="Required"
                        className={!reasonById[request.id] ? "admin-action-reason-required" : ""}
                      />
                      <div className="admin-field-label">Admin note</div>
                      <input
                        value={noteById[request.id] || ""}
                        onChange={(e) => setNoteById((prev) => ({ ...prev, [request.id]: e.target.value }))}
                        placeholder="Optional"
                      />
                      <div className="admin-report-actions">
                        <button type="button" disabled={Boolean(busy)} onClick={() => runVerification(request, "approved")}>Approve</button>
                        <button type="button" disabled={Boolean(busy)} onClick={() => runVerification(request, "rejected")}>Reject</button>
                        <button type="button" disabled={Boolean(busy)} onClick={() => runVerification(request, "more_info_requested")}>Request Info</button>
                        <button type="button" disabled={Boolean(busy)} style={{ background: "#dc2626", color: "white", borderColor: "#dc2626" }} onClick={() => runVerification(request, "revoked")}>Revoke</button>
                      </div>
                      {request.adminNote ? <p className="admin-muted" style={{ margin: "6px 0 0", fontSize: 12 }}>Note: {request.adminNote}</p> : null}
                    </div>
                  </td>
                </tr>
              );
            })}
            {!requests.length && (
              <tr><td colSpan={6}>{loading ? "Loading breeder applications..." : "No breeder applications found."}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="admin-table-footer">
        <div className="admin-muted">{total.toLocaleString()} breeder application records</div>
        <PaginationControls page={filters.page} pageSize={filters.pageSize} total={total} onPage={changePage} />
      </div>
    </section>
  );
}

function LabAccountsPage() {
  const toast = useToast();
  const [labs, setLabs] = useState([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [reasonById, setReasonById] = useState({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState(null);

  const load = () => {
    setLoading(true);
    setError("");
    fetchAdminLabAccounts({ status: statusFilter })
      .then((data) => setLabs(Array.isArray(data.labs) ? data.labs : []))
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load lab accounts."))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const requestUpdate = (lab, nextStatus) => {
    const reason = String(reasonById[lab.id] || "").trim();
    if (!reason) { setError(`Enter a reason for "${lab.labName}" before changing status.`); return; }
    if (nextStatus === "rejected" || nextStatus === "suspended") {
      setConfirm({ lab, nextStatus, reason });
    } else {
      doUpdate(lab, nextStatus, reason);
    }
  };

  const doUpdate = async (lab, nextStatus, reason) => {
    setConfirm(null);
    setError("");
    try {
      const result = await updateAdminLabAccount(lab.id, { status: nextStatus, reason });
      setLabs((prev) => prev.map((item) => item.id === lab.id ? result.lab : item));
      toast(`${lab.labName} set to "${nextStatus}".`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Lab account update failed.";
      setError(msg); toast(msg, "error");
    }
  };

  return (
    <section className="admin-section">
      {confirm && (
        <ConfirmModal
          title={`${confirm.nextStatus === "rejected" ? "Reject" : "Suspend"} "${confirm.lab.labName}"?`}
          message={`This will set the lab's status to "${confirm.nextStatus}". They will lose access to the lab system.`}
          confirmLabel={`Yes, ${confirm.nextStatus}`}
          danger
          onConfirm={() => doUpdate(confirm.lab, confirm.nextStatus, confirm.reason)}
          onCancel={() => setConfirm(null)}
        />
      )}
      <div className="admin-section-header">
        <h2>Lab Account Management</h2>
        <p>Approve, suspend, or reject lab accounts and review available tests.</p>
      </div>
      <div className="admin-filters">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          {["pending", "approved", "suspended", "rejected"].map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <button type="button" onClick={load}>Apply</button>
      </div>
      {error && <div className="admin-error">{error}</div>}
      {loading ? <Spinner label="Loading lab accounts…" /> : (
        <div className="admin-card-grid">
          {labs.map((lab) => (
            <div key={lab.id} className="admin-panel">
              <h3>{lab.labName}</h3>
              <p className="admin-muted">{lab.user?.email || "-"}</p>
              <p>Status: <StatusBadge value={lab.status} /></p>
              <p>Location: {lab.location || "-"}</p>
              <p style={{ fontSize: 13 }}>Tests: {Array.isArray(lab.availableTests) ? lab.availableTests.join(", ") : "-"}</p>
              <div className="admin-field-label" style={{ marginTop: 8 }}>Reason <Req /></div>
              <input
                value={reasonById[lab.id] || ""}
                onChange={(e) => setReasonById((prev) => ({ ...prev, [lab.id]: e.target.value }))}
                placeholder="Required before changing status"
                className={!reasonById[lab.id] ? "admin-action-reason-required" : ""}
                style={{ border: "1px solid #cdd5df", borderRadius: 8, padding: "8px 10px", width: "100%", boxSizing: "border-box", marginBottom: 8 }}
              />
              <div className="admin-report-actions">
                {["approved", "suspended", "rejected"].map((item) => (
                  <button key={item} type="button"
                    style={ item === "rejected" || item === "suspended" ? { background: "#dc2626", color: "white", borderColor: "#dc2626" } : {} }
                    onClick={() => requestUpdate(lab, item)}
                  >{item}</button>
                ))}
              </div>
            </div>
          ))}
          {!labs.length && <p className="admin-muted">No lab accounts found.</p>}
        </div>
      )}
    </section>
  );
}

function NotificationsPage() {
  const toast = useToast();
  const [form, setForm] = useState({ audience: "all", recipientId: "", title: "", message: "", type: "announcement", reason: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const send = async (event) => {
    event.preventDefault();
    if (!form.title.trim() || !form.message.trim()) { setError("Title and message are required."); return; }
    setBusy(true);
    setError("");
    try {
      const response = await sendAdminNotification(form);
      toast(`Sent ${response.sent} notification(s).`);
      setForm({ audience: "all", recipientId: "", title: "", message: "", type: "announcement", reason: "" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Notification failed.";
      setError(msg); toast(msg, "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="admin-section">
      <div className="admin-section-header">
        <h2>Messages & Announcements</h2>
        <p>Send individual messages, group announcements, breeder-only or lab-only platform updates.</p>
      </div>
      {error && <div className="admin-error">{error}</div>}
      <form className="admin-form-grid" onSubmit={send}>
        <label>
          <span className="admin-field-label">Audience</span>
          <select value={form.audience} onChange={(e) => update("audience", e.target.value)}>
            <option value="all">All users</option>
            <option value="breeders">Breeders only</option>
            <option value="labs">Labs only</option>
            <option value="individual">Individual (enter User ID below)</option>
          </select>
        </label>
        {form.audience === "individual" && (
          <label>
            <span className="admin-field-label">User ID <Req /></span>
            <input value={form.recipientId} onChange={(e) => update("recipientId", e.target.value)} placeholder="Paste user ID" />
          </label>
        )}
        <label>
          <span className="admin-field-label">Type</span>
          <select value={form.type} onChange={(e) => update("type", e.target.value)}>
            <option value="announcement">Announcement</option>
            <option value="maintenance">Maintenance</option>
            <option value="warning">Warning</option>
          </select>
        </label>
        <label>
          <span className="admin-field-label">Title <Req /></span>
          <input value={form.title} onChange={(e) => update("title", e.target.value)} placeholder="Notification title" />
        </label>
        <label style={{ gridColumn: "1 / -1" }}>
          <span className="admin-field-label">Message <Req /></span>
          <textarea rows={4} value={form.message} onChange={(e) => update("message", e.target.value)} placeholder="Message body" />
        </label>
        <label>
          <span className="admin-field-label">Reason</span>
          <input value={form.reason} onChange={(e) => update("reason", e.target.value)} placeholder="Internal reason (optional)" />
        </label>
        <div style={{ display: "flex", alignItems: "flex-end" }}>
          <button type="submit" disabled={busy}>{busy ? "Sending…" : "Send notification"}</button>
        </div>
      </form>
    </section>
  );
}

const GDPR_WORKFLOW = {
  data_export_requested: ["data_exported", "rejected"],
  anonymize_requested: ["account_anonymized", "rejected"],
  deletion_requested: ["fully_deleted", "rejected"],
  data_exported: ["completed"],
  account_anonymized: ["completed"],
  fully_deleted: ["completed"],
  rejected: [],
  completed: [],
};

function GdprToolsPage() {
  const toast = useToast();
  const [requests, setRequests] = useState([]);
  const [form, setForm] = useState({ userId: "", type: "data_export_requested", reason: "", adminNote: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const load = () => fetchAdminGdprRequests()
    .then((data) => setRequests(Array.isArray(data.requests) ? data.requests : []))
    .catch((err) => setError(err instanceof Error ? err.message : "Unable to load GDPR requests."));

  useEffect(() => { load(); }, []);

  const create = async (event) => {
    event.preventDefault();
    if (!form.userId.trim()) { setError("User ID is required."); return; }
    setBusy(true);
    setError("");
    try {
      const response = await createAdminGdprRequest(form.userId, form);
      setRequests((prev) => [response.request, ...prev]);
      toast("GDPR request created.");
      setForm((prev) => ({ ...prev, userId: "", reason: "", adminNote: "" }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to create GDPR request.";
      setError(msg); toast(msg, "error");
    } finally { setBusy(false); }
  };

  const doUpdateStatus = async (request, status) => {
    setDeleteConfirm(null);
    try {
      const response = await updateAdminGdprRequest(request.id, { status, reason: status, adminNote: "" });
      setRequests((prev) => prev.map((item) => item.id === request.id ? response.request : item));
      toast(`GDPR request status set to "${status}".`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to update GDPR request.";
      setError(msg); toast(msg, "error");
    }
  };

  const requestStatus = (request, status) => {
    if (status === "fully_deleted") {
      setDeleteConfirm({ request, status });
    } else {
      doUpdateStatus(request, status);
    }
  };

  return (
    <section className="admin-section">
      {deleteConfirm && (
        <ConfirmModal
          title="Permanently delete account data?"
          message={`This will permanently delete all data for "${deleteConfirm.request.user?.email || deleteConfirm.request.user?.id}". This action is irreversible.`}
          confirmLabel="Yes, delete permanently"
          danger
          onConfirm={() => doUpdateStatus(deleteConfirm.request, deleteConfirm.status)}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
      <div className="admin-section-header">
        <h2>GDPR Tools</h2>
        <p>Create and process data export, anonymization, and account deletion requests. Status changes follow the workflow sequence.</p>
      </div>
      {error && <div className="admin-error">{error}</div>}
      <div className="admin-panel" style={{ marginBottom: 18 }}>
        <h3>Create new GDPR request</h3>
        <form className="admin-form-grid" onSubmit={create} style={{ marginTop: 12 }}>
          <label>
            <span className="admin-field-label">User ID <Req /></span>
            <input value={form.userId} onChange={(e) => setForm((prev) => ({ ...prev, userId: e.target.value }))} placeholder="Paste user ID or email" />
          </label>
          <label>
            <span className="admin-field-label">Request type</span>
            <select value={form.type} onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value }))}>
              <option value="data_export_requested">Data export</option>
              <option value="anonymize_requested">Anonymize account</option>
              <option value="deletion_requested">Delete account</option>
            </select>
          </label>
          <label>
            <span className="admin-field-label">Reason</span>
            <input value={form.reason} onChange={(e) => setForm((prev) => ({ ...prev, reason: e.target.value }))} placeholder="Optional" />
          </label>
          <label>
            <span className="admin-field-label">Admin note</span>
            <input value={form.adminNote} onChange={(e) => setForm((prev) => ({ ...prev, adminNote: e.target.value }))} placeholder="Optional" />
          </label>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button type="submit" disabled={busy}>{busy ? "Creating…" : "Create GDPR request"}</button>
          </div>
        </form>
      </div>
      <div className="admin-card-grid">
        {requests.map((request) => {
          const allowedNext = GDPR_WORKFLOW[request.status] || [];
          return (
            <div key={request.id} className="admin-panel">
              <h3 style={{ fontSize: 14 }}>{request.type?.replace(/_/g, " ")}</h3>
              <p className="admin-muted">{request.user?.email || request.user?.id || "-"}</p>
              <p>Status: <StatusBadge value={request.status} /></p>
              <div className="admin-gdpr-workflow">
                {allowedNext.length === 0 && <span className="admin-muted" style={{ fontSize: 12 }}>No further actions.</span>}
                {allowedNext.map((nextStatus) => (
                  <button
                    key={nextStatus}
                    type="button"
                    style={nextStatus === "fully_deleted" ? { background: "#dc2626", color: "white", borderColor: "#dc2626" } : {}}
                    onClick={() => requestStatus(request, nextStatus)}
                  >
                    {nextStatus.replace(/_/g, " ")}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
        {!requests.length && <p className="admin-muted">No GDPR requests found.</p>}
      </div>
    </section>
  );
}

function Placeholder({ title }) {
  return (
    <section className="admin-section">
      <div className="admin-section-header">
        <h2>{title}</h2>
        <p>This module is part of the later admin stages. User management MVP is active now.</p>
      </div>
    </section>
  );
}

export default function AdminApp() {
  const [path, setPath] = useState(() => adminPath());
  const role = useMemo(readRole, []);

  useEffect(() => {
    const onHashChange = () => setPath(adminPath());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  if (role !== "admin") {
    return (
      <div className="admin-access-denied">
        <h1>Admin access required</h1>
        <p>Only users with the admin role can access this panel.</p>
        <button type="button" onClick={() => go("/")}>Back to start</button>
      </div>
    );
  }

  const pathOnly = path.split("?")[0];
  const userMatch = pathOnly.match(/^\/admin\/users\/([^/]+)$/);
  const tierMatch = pathOnly.match(/^\/admin\/tiers\/([^/]+)$/);

  if (pathOnly === "/admin/marketplace") {
    return <MarketplacePage portalMode="admin" />;
  }

  const pageTitle = (() => {
    if (pathOnly === "/admin") return "Dashboard";
    if (userMatch) return "User Detail";
    if (tierMatch) return "Tier Editor";
    if (pathOnly === "/admin/users") return "All Users";
    if (pathOnly === "/admin/tiers") return "Tier Overview";
    if (pathOnly === "/admin/verification") return "Breeder Verification Queue";
    if (pathOnly === "/admin/reports") return "Reports & Safety";
    if (pathOnly === "/admin/labs") return "Lab Accounts";
    if (pathOnly === "/admin/notifications") return "Messages & Announcements";
    if (pathOnly === "/admin/gdpr") return "GDPR Tools";
    return "Admin Panel";
  })();

  return (
    <ToastProvider>
      <AdminLayout path={pathOnly} title={pageTitle}>
        {pathOnly === "/admin" && <AdminDashboard />}
        {pathOnly === "/admin/users" && <UsersPage path={path} />}
        {userMatch && <UserDetailPage id={decodeURIComponent(userMatch[1])} />}
        {pathOnly === "/admin/tiers" && <TierOverviewPage />}
        {tierMatch && <TierEditorPage id={decodeURIComponent(tierMatch[1])} />}
        {pathOnly === "/admin/verification" && <BreederVerificationQueue path={path} />}
        {pathOnly === "/admin/reports" && <ReportsPage path={path} />}
        {pathOnly === "/admin/labs" && <LabAccountsPage />}
        {pathOnly === "/admin/notifications" && <NotificationsPage />}
        {pathOnly === "/admin/gdpr" && <GdprToolsPage />}
        {pathOnly === "/admin/settings" && <Placeholder title="Roles & Permissions" />}
      </AdminLayout>
    </ToastProvider>
  );
}
