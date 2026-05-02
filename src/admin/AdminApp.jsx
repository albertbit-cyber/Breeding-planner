import React, { useEffect, useMemo, useState } from "react";
import MarketplacePage from "../features/marketplace/MarketplacePage.jsx";
import {
  fetchAdminDashboard,
  fetchAdminReports,
  fetchAdminVerificationRequests,
  fetchAdminUserDetail,
  fetchAdminUsers,
  applyAdminReportAction,
  createAdminGdprRequest,
  fetchAdminGdprRequests,
  fetchAdminLabAccounts,
  fetchAdminMarketplacePermission,
  sendAdminNotification,
  updateAdminGdprRequest,
  updateAdminLabAccount,
  updateAdminMarketplacePermission,
  updateAdminReportStatus,
  updateAdminVerificationRequest,
  updateAdminUserRole,
  updateAdminUserStatus,
  updateAdminUserVerification,
} from "../shared/apiClient";

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

const ROLE_OPTIONS = ["buyer", "breeder", "lab", "admin"];
const STATUS_OPTIONS = ["active", "pending", "restricted", "suspended", "banned", "deleted"];
const VERIFICATION_OPTIONS = ["not_applied", "pending", "approved", "rejected", "revoked", "more_info_requested"];
const SUBSCRIPTION_OPTIONS = ["free", "hobby", "breeder", "professional", "lab", "enterprise"];
const REPORT_TYPE_OPTIONS = ["fake_listing", "incorrect_genetics", "scam_suspicion", "abusive_message", "non_payment", "animal_welfare_concern", "spam", "other"];
const REPORT_STATUS_OPTIONS = ["open", "under_review", "waiting_for_response", "resolved", "dismissed", "escalated"];
const REPORT_ACTION_OPTIONS = ["warn_user", "restrict_messaging", "remove_listing", "suspend_account", "ban_account", "escalate_report"];
const VERIFICATION_REQUEST_STATUS_OPTIONS = ["pending_review", "approved", "rejected", "more_info_requested", "revoked"];

function AdminLayout({ path, children }) {
  const nav = [
    ["/admin", "Dashboard"],
    ["/admin/users", "Users"],
    ["/admin/verification", "Breeders"],
    ["/admin/reports", "Reports"],
    ["/admin/marketplace", "Marketplace"],
    ["/admin/labs", "Labs"],
    ["/admin/notifications", "Messages"],
    ["/admin/gdpr", "GDPR"],
    ["/admin/settings", "Settings"],
  ];
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand">Admin Panel</div>
        <nav>
          {nav.map(([href, label]) => (
            <button
              key={href}
              type="button"
              className={path === href || (href !== "/admin" && path.startsWith(href)) ? "active" : ""}
              onClick={() => go(href)}
            >
              {label}
            </button>
          ))}
        </nav>
      </aside>
      <main className="admin-main">
        <div className="admin-topbar">
          <div>
            <div className="admin-eyebrow">Protected admin workspace</div>
            <h1>User Administration</h1>
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

  useEffect(() => {
    let mounted = true;
    fetchAdminDashboard()
      .then((data) => mounted && setCards(data.cards || {}))
      .catch((err) => mounted && setError(err instanceof Error ? err.message : "Unable to load dashboard."));
    return () => { mounted = false; };
  }, []);

  return (
    <section className="admin-section">
      <div className="admin-section-header">
        <h2>Dashboard</h2>
        <p>Summary of platform users, breeder verification, reports, and subscriptions.</p>
      </div>
      {error && <div className="admin-error">{error}</div>}
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
    </section>
  );
}

function useAdminQuery(path) {
  return useMemo(() => {
    const query = path.includes("?") ? path.slice(path.indexOf("?") + 1) : "";
    return Object.fromEntries(new URLSearchParams(query).entries());
  }, [path]);
}

function UsersPage({ path }) {
  const initial = useAdminQuery(path);
  const [filters, setFilters] = useState({
    search: initial.search || "",
    role: initial.role || "",
    status: initial.status || "",
    verification: initial.verification || "",
    subscription: initial.subscription || "",
  });
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    setError("");
    fetchAdminUsers(filters)
      .then((data) => {
        setUsers(Array.isArray(data.users) ? data.users : []);
        setTotal(Number(data.total || 0));
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load users."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  const updateFilter = (key, value) => setFilters((prev) => ({ ...prev, [key]: value }));

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
        <button type="button" onClick={load}>Apply</button>
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
                <td className="mono">{user.id}</td>
                <td>{user.name || "-"}</td>
                <td>{user.email}</td>
                <td>{user.role}</td>
                <td>{user.status}</td>
                <td>{user.subscription?.plan || "free"}</td>
                <td>{user.verificationStatus}</td>
                <td>{user.country || "-"}</td>
                <td>{formatDate(user.joinedDate)}</td>
                <td>{formatDate(user.lastLoginAt)}</td>
                <td><button type="button" onClick={() => go(`/admin/users/${user.id}`)}>View Profile</button></td>
              </tr>
            ))}
            {!users.length && (
              <tr><td colSpan={11}>{loading ? "Loading users..." : "No users found."}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="admin-muted">{total.toLocaleString()} user records</div>
    </section>
  );
}

function ActionControls({ user, onUpdated }) {
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const run = async (kind, value) => {
    if (!reason.trim()) {
      setError("Reason is required for admin actions.");
      return;
    }
    setBusy(kind);
    setError("");
    try {
      let result;
      if (kind === "role") result = await updateAdminUserRole(user.id, { role: value, reason, internalNote: note });
      if (kind === "status") result = await updateAdminUserStatus(user.id, { status: value, reason, internalNote: note });
      if (kind === "verification") result = await updateAdminUserVerification(user.id, { verificationStatus: value, reason, internalNote: note });
      setReason("");
      setNote("");
      onUpdated(result?.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Admin action failed.");
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="admin-panel">
      <h3>Admin Actions</h3>
      <div className="admin-action-reason">
        <select value={reason} onChange={(e) => setReason(e.target.value)}>
          <option value="">Select reason</option>
          <option value="spam">spam</option>
          <option value="fake_profile">fake_profile</option>
          <option value="payment_issue">payment_issue</option>
          <option value="fraud_suspicion">fraud_suspicion</option>
          <option value="policy_violation">policy_violation</option>
          <option value="user_request">user_request</option>
          <option value="other">other</option>
        </select>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Internal note optional" />
      </div>
      {error && <div className="admin-error">{error}</div>}
      <div className="admin-action-grid">
        <label>Role<select defaultValue={user.role} onChange={(e) => run("role", e.target.value)} disabled={Boolean(busy)}>
          {ROLE_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
        </select></label>
        <label>Status<select defaultValue={user.status} onChange={(e) => run("status", e.target.value)} disabled={Boolean(busy)}>
          {STATUS_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
        </select></label>
        <label>Breeder Verification<select defaultValue={user.verificationStatus} onChange={(e) => run("verification", e.target.value)} disabled={Boolean(busy)}>
          {VERIFICATION_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
        </select></label>
      </div>
    </div>
  );
}

function MarketplacePermissionPanel({ userId }) {
  const [permission, setPermission] = useState(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    fetchAdminMarketplacePermission(userId)
      .then((data) => mounted && setPermission(data.permission || {}))
      .catch((err) => mounted && setError(err instanceof Error ? err.message : "Unable to load marketplace permissions."));
    return () => { mounted = false; };
  }, [userId]);

  const updateField = (key, value) => setPermission((prev) => ({ ...(prev || {}), [key]: value }));
  const save = async () => {
    if (!reason.trim()) {
      setError("Reason is required for marketplace permission changes.");
      return;
    }
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Marketplace permission update failed.");
    }
  };

  return (
    <div className="admin-panel">
      <h3>Marketplace Permissions</h3>
      {error && <div className="admin-error">{error}</div>}
      {!permission ? <p className="admin-muted">Loading marketplace permissions...</p> : (
        <div className="admin-action-grid">
          <label><input type="checkbox" checked={permission.canAccess !== false} onChange={(e) => updateField("canAccess", e.target.checked)} /> Allow marketplace access</label>
          <label><input type="checkbox" checked={Boolean(permission.requireApproval)} onChange={(e) => updateField("requireApproval", e.target.checked)} /> Require listing approval</label>
          <label><input type="checkbox" checked={Boolean(permission.featuredBreeder)} onChange={(e) => updateField("featuredBreeder", e.target.checked)} /> Feature breeder</label>
          <label>Active listing limit<input type="number" value={permission.activeListingLimit || 0} onChange={(e) => updateField("activeListingLimit", e.target.value)} /></label>
          <label>Disabled reason<input value={permission.disabledReason || ""} onChange={(e) => updateField("disabledReason", e.target.value)} /></label>
          <label>Reason<input value={reason} onChange={(e) => setReason(e.target.value)} /></label>
          <button type="button" onClick={save}>Save marketplace controls</button>
        </div>
      )}
    </div>
  );
}

function UserDetailPage({ id }) {
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    fetchAdminUserDetail(id)
      .then((data) => mounted && setDetail(data))
      .catch((err) => mounted && setError(err instanceof Error ? err.message : "Unable to load user."));
    return () => { mounted = false; };
  }, [id]);

  if (error) return <div className="admin-error">{error}</div>;
  if (!detail) return <div className="admin-section">Loading user...</div>;
  const user = detail.user || {};

  return (
    <section className="admin-section">
      <button type="button" className="admin-back" onClick={() => go("/admin/users")}>Back to users</button>
      <div className="admin-detail-grid">
        <div className="admin-panel">
          <h2>{user.name || user.email}</h2>
          <dl className="admin-definition-list">
            <dt>User ID</dt><dd>{user.id}</dd>
            <dt>Email</dt><dd>{user.email}</dd>
            <dt>Phone number</dt><dd>{user.phone || "-"}</dd>
            <dt>Country</dt><dd>{user.country || "-"}</dd>
            <dt>City</dt><dd>{user.city || "-"}</dd>
            <dt>Language</dt><dd>{user.language || "-"}</dd>
            <dt>Breeder/business name</dt><dd>{user.breederName || "-"}</dd>
            <dt>Website</dt><dd>{user.websiteUrl || "-"}</dd>
            <dt>Joined date</dt><dd>{formatDate(user.joinedDate)}</dd>
            <dt>Last login</dt><dd>{formatDate(user.lastLoginAt)}</dd>
            <dt>Account status</dt><dd>{user.status}</dd>
            <dt>Email verified</dt><dd>Not tracked yet</dd>
          </dl>
        </div>
        <ActionControls user={user} onUpdated={(nextUser) => setDetail((prev) => ({ ...prev, user: nextUser }))} />
        <MarketplacePermissionPanel userId={user.id} />
        <div className="admin-panel">
          <h3>Subscription</h3>
          <p>Current plan: <strong>{user.subscription?.plan || "free"}</strong></p>
          <p>Status: <strong>{user.subscription?.status || "inactive"}</strong></p>
        </div>
        <div className="admin-panel">
          <h3>Reports Connected to User</h3>
          {(detail.reports || []).length ? detail.reports.map((report) => (
            <div key={report.id} className="admin-log-row">{report.action} - {formatDate(report.createdAt)}</div>
          )) : <p className="admin-muted">No reports connected to this user.</p>}
        </div>
        <div className="admin-panel wide">
          <h3>Activity Timeline</h3>
          {(detail.activity || []).length ? detail.activity.map((entry) => (
            <div key={entry.id} className="admin-log-row">{entry.action} - {formatDate(entry.createdAt)}</div>
          )) : <p className="admin-muted">No activity timeline entries yet.</p>}
        </div>
        <div className="admin-panel wide">
          <h3>Audit Log</h3>
          {(detail.auditLogs || []).length ? detail.auditLogs.map((entry) => (
            <div key={entry.id} className="admin-log-row">
              <strong>{entry.action}</strong>
              <span>{entry.reason}</span>
              <span>{formatDate(entry.createdAt)}</span>
            </div>
          )) : <p className="admin-muted">No admin actions recorded for this user.</p>}
        </div>
      </div>
    </section>
  );
}

function ReportsPage({ path }) {
  const initial = useAdminQuery(path);
  const [filters, setFilters] = useState({
    search: initial.search || "",
    status: initial.status || "",
    type: initial.type || "",
  });
  const [reports, setReports] = useState([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [reasonById, setReasonById] = useState({});
  const [noteById, setNoteById] = useState({});
  const [busy, setBusy] = useState("");

  const load = () => {
    setLoading(true);
    setError("");
    fetchAdminReports(filters)
      .then((data) => {
        setReports(Array.isArray(data.reports) ? data.reports : []);
        setTotal(Number(data.total || 0));
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load reports."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  const updateReportInList = (nextReport) => {
    if (!nextReport?.id) return;
    setReports((prev) => prev.map((report) => report.id === nextReport.id ? nextReport : report));
  };

  const runStatus = async (report, status) => {
    const reason = String(reasonById[report.id] || "").trim();
    if (!reason) {
      setError("Reason is required for report status changes.");
      return;
    }
    setBusy(`${report.id}:status`);
    setError("");
    try {
      const result = await updateAdminReportStatus(report.id, {
        status,
        reason,
        resolutionNote: noteById[report.id] || "",
      });
      updateReportInList(result.report);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Report status update failed.");
    } finally {
      setBusy("");
    }
  };

  const runAction = async (report, action) => {
    const reason = String(reasonById[report.id] || "").trim();
    if (!reason) {
      setError("Reason is required for report actions.");
      return;
    }
    setBusy(`${report.id}:action`);
    setError("");
    try {
      const result = await applyAdminReportAction(report.id, {
        action,
        reason,
        internalNote: noteById[report.id] || "",
      });
      updateReportInList(result.report);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Report action failed.");
    } finally {
      setBusy("");
    }
  };

  return (
    <section className="admin-section">
      <div className="admin-section-header">
        <h2>Reports & Safety</h2>
        <p>Review user reports, marketplace disputes, message reports, and apply controlled moderation actions.</p>
      </div>
      <div className="admin-filters">
        <input value={filters.search} onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))} placeholder="Search reporter, user, listing, description" />
        <select value={filters.status} onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}>
          <option value="">All statuses</option>
          {REPORT_STATUS_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select value={filters.type} onChange={(e) => setFilters((prev) => ({ ...prev, type: e.target.value }))}>
          <option value="">All report types</option>
          {REPORT_TYPE_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <button type="button" onClick={load}>Apply</button>
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
              <th>Admin Controls</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((report) => (
              <tr key={report.id}>
                <td className="mono">{report.id}</td>
                <td>{report.type}</td>
                <td>{report.status}</td>
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
                  <div className="admin-report-controls">
                    <p>{report.description}</p>
                    <input
                      value={reasonById[report.id] || ""}
                      onChange={(e) => setReasonById((prev) => ({ ...prev, [report.id]: e.target.value }))}
                      placeholder="Required reason"
                    />
                    <input
                      value={noteById[report.id] || ""}
                      onChange={(e) => setNoteById((prev) => ({ ...prev, [report.id]: e.target.value }))}
                      placeholder="Resolution note / internal note"
                    />
                    <div className="admin-report-actions">
                      <select
                        value=""
                        disabled={Boolean(busy)}
                        onChange={(e) => e.target.value && runStatus(report, e.target.value)}
                      >
                        <option value="">Set status</option>
                        {REPORT_STATUS_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
                      </select>
                      <select
                        value=""
                        disabled={Boolean(busy)}
                        onChange={(e) => e.target.value && runAction(report, e.target.value)}
                      >
                        <option value="">Apply action</option>
                        {REPORT_ACTION_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
                      </select>
                    </div>
                  </div>
                </td>
              </tr>
            ))}
            {!reports.length && (
              <tr><td colSpan={8}>{loading ? "Loading reports..." : "No reports found."}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="admin-muted">{total.toLocaleString()} report records</div>
    </section>
  );
}

function BreederVerificationQueue({ path }) {
  const initial = useAdminQuery(path);
  const [filters, setFilters] = useState({
    search: initial.search || "",
    status: initial.status || "pending_review",
  });
  const [requests, setRequests] = useState([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [reasonById, setReasonById] = useState({});
  const [noteById, setNoteById] = useState({});
  const [busy, setBusy] = useState("");

  const load = () => {
    setLoading(true);
    setError("");
    fetchAdminVerificationRequests(filters)
      .then((data) => {
        setRequests(Array.isArray(data.requests) ? data.requests : []);
        setTotal(Number(data.total || 0));
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load breeder applications."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

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
    setBusy(`${request.id}:${status}`);
    setError("");
    try {
      const result = await updateAdminVerificationRequest(request.id, {
        status,
        reason: reason || adminNote,
        adminNote,
      });
      updateRequestInList(result.request);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Breeder verification action failed.");
    } finally {
      setBusy("");
    }
  };

  return (
    <section className="admin-section">
      <div className="admin-section-header">
        <h2>Breeder Verification Queue</h2>
        <p>Review breeder applications, approve verified sellers, reject incomplete applications, request more information, or revoke verification.</p>
      </div>
      <div className="admin-filters">
        <input value={filters.search} onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))} placeholder="Search breeder, name, email" />
        <select value={filters.status} onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}>
          <option value="">All statuses</option>
          {VERIFICATION_REQUEST_STATUS_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <button type="button" onClick={load}>Apply</button>
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
                      <input
                        value={reasonById[request.id] || ""}
                        onChange={(e) => setReasonById((prev) => ({ ...prev, [request.id]: e.target.value }))}
                        placeholder="Required reason"
                      />
                      <input
                        value={noteById[request.id] || ""}
                        onChange={(e) => setNoteById((prev) => ({ ...prev, [request.id]: e.target.value }))}
                        placeholder="Admin note"
                      />
                      <div className="admin-report-actions">
                        <button type="button" disabled={Boolean(busy)} onClick={() => runVerification(request, "approved")}>Approve</button>
                        <button type="button" disabled={Boolean(busy)} onClick={() => runVerification(request, "rejected")}>Reject</button>
                        <button type="button" disabled={Boolean(busy)} onClick={() => runVerification(request, "more_info_requested")}>Request Info</button>
                        <button type="button" disabled={Boolean(busy)} onClick={() => runVerification(request, "revoked")}>Revoke</button>
                      </div>
                      {request.adminNote ? <p>{request.adminNote}</p> : null}
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
      <div className="admin-muted">{total.toLocaleString()} breeder application records</div>
    </section>
  );
}

function LabAccountsPage() {
  const [labs, setLabs] = useState([]);
  const [status, setStatus] = useState("");
  const [reasonById, setReasonById] = useState({});
  const [error, setError] = useState("");

  const load = () => {
    setError("");
    fetchAdminLabAccounts({ status })
      .then((data) => setLabs(Array.isArray(data.labs) ? data.labs : []))
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load lab accounts."));
  };

  useEffect(load, []);

  const updateStatus = async (lab, nextStatus) => {
    const reason = String(reasonById[lab.id] || "").trim();
    if (!reason) {
      setError("Reason is required for lab account changes.");
      return;
    }
    try {
      const result = await updateAdminLabAccount(lab.id, { status: nextStatus, reason });
      setLabs((prev) => prev.map((item) => item.id === lab.id ? result.lab : item));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lab account update failed.");
    }
  };

  return (
    <section className="admin-section">
      <div className="admin-section-header">
        <h2>Lab Account Management</h2>
        <p>Approve, suspend, or reject lab accounts and review available tests, pricing, and permissions.</p>
      </div>
      <div className="admin-filters">
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {["pending", "approved", "suspended", "rejected"].map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <button type="button" onClick={load}>Apply</button>
      </div>
      {error && <div className="admin-error">{error}</div>}
      <div className="admin-card-grid">
        {labs.map((lab) => (
          <div key={lab.id} className="admin-panel">
            <h3>{lab.labName}</h3>
            <p>{lab.user?.email || "-"}</p>
            <p>Status: <strong>{lab.status}</strong></p>
            <p>Location: {lab.location || "-"}</p>
            <p>Tests: {Array.isArray(lab.availableTests) ? lab.availableTests.join(", ") : "-"}</p>
            <input value={reasonById[lab.id] || ""} onChange={(e) => setReasonById((prev) => ({ ...prev, [lab.id]: e.target.value }))} placeholder="Required reason" />
            <div className="admin-report-actions">
              {["approved", "suspended", "rejected"].map((item) => (
                <button key={item} type="button" onClick={() => updateStatus(lab, item)}>{item}</button>
              ))}
            </div>
          </div>
        ))}
        {!labs.length && <p className="admin-muted">No lab accounts found.</p>}
      </div>
    </section>
  );
}

function NotificationsPage() {
  const [form, setForm] = useState({ audience: "all", recipientId: "", title: "", message: "", type: "announcement", reason: "" });
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const send = async (event) => {
    event.preventDefault();
    setError("");
    setResult("");
    try {
      const response = await sendAdminNotification(form);
      setResult(`Sent ${response.sent} notification(s).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Notification failed.");
    }
  };
  return (
    <section className="admin-section">
      <div className="admin-section-header">
        <h2>Messages & Announcements</h2>
        <p>Send individual messages, group messages, breeder-only announcements, lab-only messages, and platform updates.</p>
      </div>
      {error && <div className="admin-error">{error}</div>}
      {result && <div className="admin-success">{result}</div>}
      <form className="admin-form-grid" onSubmit={send}>
        <label>Audience<select value={form.audience} onChange={(e) => update("audience", e.target.value)}>
          <option value="all">All users</option>
          <option value="breeders">Breeders</option>
          <option value="labs">Labs</option>
          <option value="individual">Individual user ID</option>
        </select></label>
        <label>User ID<input value={form.recipientId} onChange={(e) => update("recipientId", e.target.value)} /></label>
        <label>Type<input value={form.type} onChange={(e) => update("type", e.target.value)} /></label>
        <label>Title<input value={form.title} onChange={(e) => update("title", e.target.value)} /></label>
        <label>Message<textarea value={form.message} onChange={(e) => update("message", e.target.value)} /></label>
        <label>Reason<input value={form.reason} onChange={(e) => update("reason", e.target.value)} /></label>
        <button type="submit">Send notification</button>
      </form>
    </section>
  );
}

function GdprToolsPage() {
  const [requests, setRequests] = useState([]);
  const [form, setForm] = useState({ userId: "", type: "data_export_requested", reason: "", adminNote: "" });
  const [error, setError] = useState("");
  const load = () => fetchAdminGdprRequests().then((data) => setRequests(Array.isArray(data.requests) ? data.requests : []));
  useEffect(() => { load().catch((err) => setError(err instanceof Error ? err.message : "Unable to load GDPR requests.")); }, []);
  const create = async (event) => {
    event.preventDefault();
    setError("");
    try {
      const response = await createAdminGdprRequest(form.userId, form);
      setRequests((prev) => [response.request, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create GDPR request.");
    }
  };
  const updateStatus = async (request, status) => {
    try {
      const response = await updateAdminGdprRequest(request.id, { status, reason: form.reason || status, adminNote: form.adminNote });
      setRequests((prev) => prev.map((item) => item.id === request.id ? response.request : item));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update GDPR request.");
    }
  };
  return (
    <section className="admin-section">
      <div className="admin-section-header">
        <h2>GDPR Tools</h2>
        <p>Create and process data export, anonymization, and account deletion requests.</p>
      </div>
      {error && <div className="admin-error">{error}</div>}
      <form className="admin-form-grid" onSubmit={create}>
        <label>User ID<input value={form.userId} onChange={(e) => setForm((prev) => ({ ...prev, userId: e.target.value }))} /></label>
        <label>Request type<select value={form.type} onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value }))}>
          <option value="data_export_requested">data_export_requested</option>
          <option value="anonymize_requested">anonymize_requested</option>
          <option value="deletion_requested">deletion_requested</option>
        </select></label>
        <label>Reason<input value={form.reason} onChange={(e) => setForm((prev) => ({ ...prev, reason: e.target.value }))} /></label>
        <label>Admin note<input value={form.adminNote} onChange={(e) => setForm((prev) => ({ ...prev, adminNote: e.target.value }))} /></label>
        <button type="submit">Create GDPR request</button>
      </form>
      <div className="admin-card-grid">
        {requests.map((request) => (
          <div key={request.id} className="admin-panel">
            <h3>{request.type}</h3>
            <p>{request.user?.email || request.user?.id || "-"}</p>
            <p>Status: <strong>{request.status}</strong></p>
            <div className="admin-report-actions">
              {["data_exported", "account_anonymized", "fully_deleted", "rejected", "completed"].map((status) => (
                <button key={status} type="button" onClick={() => updateStatus(request, status)}>{status}</button>
              ))}
            </div>
          </div>
        ))}
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

  if (pathOnly === "/admin/marketplace") {
    return <MarketplacePage portalMode="admin" />;
  }

  return (
    <AdminLayout path={pathOnly}>
      {pathOnly === "/admin" && <AdminDashboard />}
      {pathOnly === "/admin/users" && <UsersPage path={path} />}
      {userMatch && <UserDetailPage id={decodeURIComponent(userMatch[1])} />}
      {pathOnly === "/admin/verification" && <BreederVerificationQueue path={path} />}
      {pathOnly === "/admin/reports" && <ReportsPage path={path} />}
      {pathOnly === "/admin/labs" && <LabAccountsPage />}
      {pathOnly === "/admin/notifications" && <NotificationsPage />}
      {pathOnly === "/admin/gdpr" && <GdprToolsPage />}
      {pathOnly === "/admin/settings" && <Placeholder title="Roles & Permissions" />}
    </AdminLayout>
  );
}
