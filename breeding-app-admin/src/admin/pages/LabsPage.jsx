import React, { useEffect, useState } from "react";
import AdminLayout from "../components/AdminLayout.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import CopyButton from "../components/CopyButton.jsx";
import Spinner from "../components/Spinner.jsx";
import { useToast } from "../hooks/useToast.jsx";
import { formatDate } from "../constants.js";
import {
  fetchAdminPartnerApplications,
  reviewAdminPartnerApplication,
  fetchAdminLabAccounts,
  fetchAdminVendorInvites,
  fetchAdminVendorLab,
  inviteAdminVendorLab,
  revokeAdminVendorInvite,
  setAdminVendorLabStatus,
} from "../../shared/apiClient";

/**
 * Vendor laboratory oversight.
 *
 * The admin's posture here is deliberately lopsided: full visibility, and a
 * single write — switching a tenant on or off. Nothing on this page edits a
 * laboratory's name, staff, tests, prices or results, because the endpoints to
 * do so do not exist. That is the point: "admins can look but not touch" is
 * structural, not a rule someone has to remember.
 *
 * This replaces a page whose "Create Lab" button called the internal-staff
 * user-creation endpoint. That produced a bare user account with a temporary
 * password the admin could see, created no organization and no lab record, and
 * silently discarded the lab name and country it collected.
 */
export default function LabsPage() {
  const toast = useToast();

  const [labs, setLabs] = useState([]);
  const [invites, setInvites] = useState([]);
  const [applications, setApplications] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    email: "",
    labName: "",
    contactPerson: "",
    location: "",
    reason: "",
  });
  const [busy, setBusy] = useState(false);

  const load = () => {
    setLoading(true);
    setError("");
    Promise.all([
      fetchAdminLabAccounts({ search }),
      fetchAdminVendorInvites(),
      fetchAdminPartnerApplications({ status: "pending" }),
    ])
      .then(([labData, inviteData, applicationData]) => {
        setLabs(Array.isArray(labData?.labs) ? labData.labs : []);
        setInvites(Array.isArray(inviteData?.invites) ? inviteData.invites : []);
        setApplications(Array.isArray(applicationData?.applications) ? applicationData.applications : []);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load laboratories."))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const openDetail = (organizationId) => {
    setDetailLoading(true);
    setDetail(null);
    fetchAdminVendorLab(organizationId)
      .then(setDetail)
      .catch((err) => toast(err instanceof Error ? err.message : "Unable to open that laboratory.", "error"))
      .finally(() => setDetailLoading(false));
  };

  const sendInvite = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      await inviteAdminVendorLab({
        email: inviteForm.email.trim(),
        labName: inviteForm.labName.trim(),
        contactPerson: inviteForm.contactPerson.trim() || undefined,
        location: inviteForm.location.trim() || undefined,
        reason: inviteForm.reason.trim() || "Invite vendor laboratory",
      });
      toast(`Invitation sent to ${inviteForm.email.trim()}.`);
      setInviteForm({ email: "", labName: "", contactPerson: "", location: "", reason: "" });
      setShowInvite(false);
      load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not send that invitation.", "error");
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (organizationId, status) => {
    const verb = status === "suspended" ? "Suspend" : "Reactivate";
    const reason = window.prompt(
      `${verb} this laboratory. Give a reason — it is recorded in the audit log and cannot be left blank.`
    );
    if (!reason || !reason.trim()) return;
    setBusy(true);
    try {
      await setAdminVendorLabStatus(organizationId, { status, reason: reason.trim() });
      toast(status === "suspended" ? "Laboratory suspended." : "Laboratory reactivated.");
      load();
      if (detail?.organization?.id === organizationId) openDetail(organizationId);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not change that laboratory's status.", "error");
    } finally {
      setBusy(false);
    }
  };

  const withdrawInvite = async (id) => {
    const reason = window.prompt("Withdraw this invitation. Reason for the audit log:");
    if (!reason || !reason.trim()) return;
    setBusy(true);
    try {
      await revokeAdminVendorInvite(id, reason.trim());
      toast("Invitation withdrawn.");
      load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not withdraw that invitation.", "error");
    } finally {
      setBusy(false);
    }
  };

  const reviewApplication = async (application, status) => {
    const note = window.prompt(
      status === "invited"
        ? "Mark as invited. Note for the audit log (optional):"
        : "Decline this application. Reason for the audit log:"
    );
    if (status === "declined" && (!note || !note.trim())) return;
    setBusy(true);
    try {
      await reviewAdminPartnerApplication(application.id, { status, note: note?.trim() || undefined });
      toast(status === "invited" ? "Marked as invited." : "Application declined.");
      load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not update that application.", "error");
    } finally {
      setBusy(false);
    }
  };

  const startInviteFrom = (application) => {
    setInviteForm({
      email: application.email || "",
      labName: application.labName || "",
      contactPerson: application.contactName || "",
      location: application.country || "",
      reason: `From partner application ${application.id}`,
    });
    setShowInvite(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const pendingInvites = invites.filter((invite) => invite.status === "pending" && !invite.isExpired);

  return (
    <AdminLayout breadcrumbs={[{ label: "Vendor Laboratories" }]}>
      <div className="admin-section">
        <div className="admin-section-header">
          <div>
            <h2>Vendor Laboratories</h2>
            <p>
              You can see everything a laboratory is doing and suspend its access. Its tests,
              prices, staff and results are the laboratory's own to manage.
            </p>
          </div>
          <div className="admin-row-actions">
            <button type="button" onClick={load}>Refresh</button>
            <button type="button" onClick={() => setShowInvite(!showInvite)}>
              {showInvite ? "Cancel" : "Invite a laboratory"}
            </button>
          </div>
        </div>

        {showInvite && (
          <div className="admin-panel" style={{ marginBottom: 16 }}>
            <h3>Invite a vendor laboratory</h3>
            <p className="admin-muted">
              The laboratory sets its own password when it accepts. You never handle their
              credentials, and nothing is created until they accept.
            </p>
            <form className="admin-action-grid" onSubmit={sendInvite}>
              <label>
                Laboratory name
                <input
                  value={inviteForm.labName}
                  onChange={(e) => setInviteForm((p) => ({ ...p, labName: e.target.value }))}
                  required
                />
              </label>
              <label>
                Email
                <input
                  type="email"
                  value={inviteForm.email}
                  onChange={(e) => setInviteForm((p) => ({ ...p, email: e.target.value }))}
                  required
                />
              </label>
              <label>
                Contact person
                <input
                  value={inviteForm.contactPerson}
                  onChange={(e) => setInviteForm((p) => ({ ...p, contactPerson: e.target.value }))}
                />
              </label>
              <label>
                Location
                <input
                  value={inviteForm.location}
                  onChange={(e) => setInviteForm((p) => ({ ...p, location: e.target.value }))}
                />
              </label>
              <label>
                Reason (audit log)
                <input
                  value={inviteForm.reason}
                  onChange={(e) => setInviteForm((p) => ({ ...p, reason: e.target.value }))}
                  placeholder="Why this laboratory is being onboarded"
                />
              </label>
              <button type="submit" disabled={busy}>
                {busy ? "Sending…" : "Send invitation"}
              </button>
            </form>
          </div>
        )}

        <div className="admin-filters">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load()}
            placeholder="Search laboratory, contact, email…"
          />
          <button type="button" onClick={load}>Apply</button>
        </div>

        {error && <div className="admin-error">{error}</div>}

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Laboratory</th>
                <th>Owner</th>
                <th>Location</th>
                <th>Members</th>
                <th>Tests</th>
                <th>Orders</th>
                <th>Status</th>
                <th>Joined</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {labs.map((lab) => {
                const org = lab.organization || {};
                const suspended = org.status === "suspended";
                return (
                  <tr key={lab.id}>
                    <td>
                      <div>{lab.labName}</div>
                      <div className="admin-id-cell">
                        <span className="mono">{String(lab.organizationId || "").slice(0, 12)}…</span>
                        <CopyButton value={lab.organizationId} />
                      </div>
                    </td>
                    <td>{lab.user?.name || lab.contactPerson || "—"}</td>
                    <td>{lab.location || [lab.city, lab.country].filter(Boolean).join(", ") || "—"}</td>
                    <td>{org.memberCount ?? 0}</td>
                    <td>{org.testCount ?? 0}</td>
                    <td>{org.orderCount ?? 0}</td>
                    <td><StatusBadge value={org.status || lab.status} /></td>
                    <td>{formatDate(lab.createdAt)}</td>
                    <td>
                      <div className="admin-row-actions">
                        <button type="button" onClick={() => openDetail(lab.organizationId)}>
                          View
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => changeStatus(lab.organizationId, suspended ? "active" : "suspended")}
                        >
                          {suspended ? "Reactivate" : "Suspend"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!labs.length && (
                <tr>
                  <td colSpan={9} style={{ textAlign: "center", padding: 24 }}>
                    {loading ? <Spinner /> : <span className="admin-muted">No vendor laboratories yet. Invite one above.</span>}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {applications.length ? (
        <div className="admin-section">
          <div className="admin-section-header">
            <div>
              <h2>Applications</h2>
              <p>
                Laboratories that have asked to be considered. Nothing here has an account
                or any access — reviewing records your decision, and inviting is a separate step.
              </p>
            </div>
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Laboratory</th>
                  <th>Contact</th>
                  <th>Country</th>
                  <th>About</th>
                  <th>Received</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {applications.map((application) => (
                  <tr key={application.id}>
                    <td>
                      <div>{application.labName}</div>
                      {application.website ? (
                        <a href={application.website} target="_blank" rel="noreferrer noopener">
                          {application.website}
                        </a>
                      ) : null}
                    </td>
                    <td>
                      <div>{application.contactName}</div>
                      <div className="admin-muted">{application.email}</div>
                    </td>
                    <td>{application.country || "-"}</td>
                    <td style={{ maxWidth: 320 }}>{application.message || "-"}</td>
                    <td>{formatDate(application.createdAt)}</td>
                    <td>
                      <div className="admin-row-actions">
                        <button type="button" disabled={busy} onClick={() => startInviteFrom(application)}>
                          Invite
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => reviewApplication(application, "invited")}
                        >
                          Mark invited
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => reviewApplication(application, "declined")}
                        >
                          Decline
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {pendingInvites.length ? (
        <div className="admin-section">
          <div className="admin-section-header">
            <div>
              <h2>Pending invitations</h2>
              <p>Laboratories that have been invited but have not yet accepted.</p>
            </div>
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Laboratory</th>
                  <th>Email</th>
                  <th>Sent</th>
                  <th>Expires</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pendingInvites.map((invite) => (
                  <tr key={invite.id}>
                    <td>{invite.organizationName || "—"}</td>
                    <td>{invite.email}</td>
                    <td>{formatDate(invite.createdAt)}</td>
                    <td>{formatDate(invite.expiresAt)}</td>
                    <td>
                      <button type="button" disabled={busy} onClick={() => withdrawInvite(invite.id)}>
                        Withdraw
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {detailLoading ? (
        <div className="admin-section"><Spinner /></div>
      ) : detail ? (
        <VendorLabDetail detail={detail} onClose={() => setDetail(null)} />
      ) : null}
    </AdminLayout>
  );
}

/** Read-only. Every control that could change something lives on the page above. */
function VendorLabDetail({ detail, onClose }) {
  const { organization, lab, members, invites, offerings, orders, orderStats, auditLogs } = detail;

  return (
    <div className="admin-section">
      <div className="admin-section-header">
        <div>
          <h2>{organization?.name}</h2>
          <p>
            <StatusBadge value={organization?.status} />{" "}
            {organization?.suspendedReason ? (
              <span className="admin-muted">Suspended: {organization.suspendedReason}</span>
            ) : null}
          </p>
        </div>
        <div className="admin-row-actions">
          <button type="button" onClick={onClose}>Close</button>
        </div>
      </div>

      <div className="admin-panel">
        <h3>Contact</h3>
        <dl>
          <div><dt>Contact</dt><dd>{lab?.contactPerson || "—"}</dd></div>
          <div><dt>Email</dt><dd>{lab?.contactEmail || lab?.user?.email || "—"}</dd></div>
          <div><dt>Phone</dt><dd>{lab?.phone || "—"}</dd></div>
          <div><dt>Location</dt><dd>{lab?.location || "—"}</dd></div>
          <div><dt>Listed to breeders</dt><dd>{lab?.listedInDirectory ? "Yes" : "No"}</dd></div>
        </dl>
      </div>

      <div className="admin-panel">
        <h3>Order activity</h3>
        <p className="admin-muted">
          {Object.entries(orderStats || {}).map(([status, count]) => `${status}: ${count}`).join(" · ") ||
            "No orders yet."}
        </p>
        <table className="admin-table">
          <thead>
            <tr><th>Order</th><th>Breeder</th><th>Status</th><th>Payment</th><th>Total</th><th>Placed</th></tr>
          </thead>
          <tbody>
            {(orders || []).map((order) => (
              <tr key={order.id}>
                <td className="mono">{order.orderNumber || order.id.slice(0, 8)}</td>
                <td>{order.breeder?.fullName || order.breeder?.email || "—"}</td>
                <td><StatusBadge value={order.status} /></td>
                <td>{order.paymentStatus}</td>
                <td>{order.totalPrice} {order.currency}</td>
                <td>{formatDate(order.createdAt)}</td>
              </tr>
            ))}
            {!orders?.length && <tr><td colSpan={6} className="admin-muted">No orders.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="admin-panel">
        <h3>Members</h3>
        <table className="admin-table">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Last seen</th></tr></thead>
          <tbody>
            {(members || []).map((member) => (
              <tr key={member.id}>
                <td>{member.fullName || "—"}</td>
                <td>{member.email}</td>
                <td>{member.role}</td>
                <td>{member.lastLoginAt ? formatDate(member.lastLoginAt) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="admin-panel">
        <h3>Tests offered ({offerings?.length || 0})</h3>
        <table className="admin-table">
          <thead><tr><th>Name</th><th>Category</th><th>Price</th><th>Active</th><th>Visible</th></tr></thead>
          <tbody>
            {(offerings || []).map((offering) => (
              <tr key={offering.id}>
                <td>{offering.name}</td>
                <td>{offering.category}</td>
                <td>
                  {offering.priceCents != null
                    ? `${(offering.priceCents / 100).toFixed(2)} ${offering.currency}`
                    : "tiered"}
                </td>
                <td>{offering.active ? "Yes" : "No"}</td>
                <td>{offering.visibleInBreederApp ? "Yes" : "No"}</td>
              </tr>
            ))}
            {!offerings?.length && <tr><td colSpan={5} className="admin-muted">No tests published yet.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="admin-panel">
        <h3>Invitation history</h3>
        <table className="admin-table">
          <thead><tr><th>Email</th><th>Role</th><th>Status</th><th>Sent</th></tr></thead>
          <tbody>
            {(invites || []).map((invite) => (
              <tr key={invite.id}>
                <td>{invite.email}</td>
                <td>{invite.role}</td>
                <td><StatusBadge value={invite.status} /></td>
                <td>{formatDate(invite.createdAt)}</td>
              </tr>
            ))}
            {!invites?.length && <tr><td colSpan={4} className="admin-muted">None.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="admin-panel">
        <h3>Audit trail</h3>
        <table className="admin-table">
          <thead><tr><th>Action</th><th>Admin</th><th>Reason</th><th>When</th></tr></thead>
          <tbody>
            {(auditLogs || []).map((log) => (
              <tr key={log.id}>
                <td>{log.action}</td>
                <td>{log.adminUser?.fullName || log.adminUser?.email || "—"}</td>
                <td>{log.reason}</td>
                <td>{formatDate(log.createdAt)}</td>
              </tr>
            ))}
            {!auditLogs?.length && <tr><td colSpan={4} className="admin-muted">Nothing recorded.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
