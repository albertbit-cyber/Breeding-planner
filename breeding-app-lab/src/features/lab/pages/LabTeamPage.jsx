import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  changeLabTeamMemberRole,
  fetchMyLabTeam,
  fetchMyLabTeamInvites,
  inviteLabTeammate,
  removeLabTeamMember,
  revokeLabTeamInvite,
  transferLabOwnership,
} from "../../../shared/apiClient";

/**
 * A laboratory's own staff.
 *
 * This is what makes a vendor lab with more than one employee possible at all —
 * access to lab work is granted by membership of the laboratory's organization,
 * not by being the one person the admin originally invited.
 *
 * Every call here acts on the caller's own organization, resolved server-side
 * from their membership; none of them take an organization id.
 */

const roleLabel = (t, role) => {
  switch (role) {
    case "owner":
      return t("lab.team.roleOwner", { defaultValue: "Owner" });
    case "admin":
      return t("lab.team.roleAdmin", { defaultValue: "Administrator" });
    case "billing_manager":
      return t("lab.team.roleBillingManager", { defaultValue: "Billing manager" });
    case "member":
      return t("lab.team.roleMember", { defaultValue: "Member" });
    default:
      return undefined;
  }
};

const ASSIGNABLE_ROLES = ["admin", "billing_manager", "member"];

export default function LabTeamPage() {
  const { t } = useTranslation();
  const [members, setMembers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [inviteForm, setInviteForm] = useState({ email: "", role: "member" });
  const [busy, setBusy] = useState(false);

  const load = () => {
    setLoading(true);
    setError("");
    Promise.all([fetchMyLabTeam(), fetchMyLabTeamInvites()])
      .then(([teamData, inviteData]) => {
        setMembers(Array.isArray(teamData?.members) ? teamData.members : []);
        setInvites(Array.isArray(inviteData?.invites) ? inviteData.invites : []);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : t("lab.team.loadFailed", { defaultValue: "Unable to load your team." }))
      )
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const run = async (action, successMessage) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
      setMessage(successMessage);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("lab.team.actionFailed", { defaultValue: "That did not work." }));
    } finally {
      setBusy(false);
    }
  };

  const sendInvite = (event) => {
    event.preventDefault();
    run(
      () => inviteLabTeammate({ email: inviteForm.email.trim(), role: inviteForm.role }),
      t("lab.team.inviteSent", { defaultValue: "Invitation sent to {{email}}.", email: inviteForm.email.trim() })
    ).then(() => setInviteForm({ email: "", role: "member" }));
  };

  if (loading) return <div className="p-6 text-sm text-neutral-500">{t("lab.common.loading", { defaultValue: "Loading…" })}</div>;

  const pendingInvites = invites.filter((invite) => invite.status === "pending" && !invite.isExpired);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">{t("lab.team.title", { defaultValue: "Your team" })}</h1>
        <p className="mt-1 text-sm text-neutral-600">
          {t("lab.team.subtitle", {
            defaultValue: "Colleagues you invite here work on your laboratory's orders alongside you.",
          })}
        </p>
      </div>

      {error ? <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}
      {message ? <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</div> : null}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-neutral-900">{t("lab.team.members", { defaultValue: "Members" })}</h2>
        <div className="overflow-x-auto rounded border border-neutral-200">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-start text-xs uppercase text-neutral-500">
              <tr>
                <th className="px-3 py-2">{t("lab.catalog.colName", { defaultValue: "Name" })}</th>
                <th className="px-3 py-2">{t("lab.team.colEmail", { defaultValue: "Email" })}</th>
                <th className="px-3 py-2">{t("lab.team.colRole", { defaultValue: "Role" })}</th>
                <th className="px-3 py-2">{t("lab.team.colJoined", { defaultValue: "Joined" })}</th>
                <th className="px-3 py-2">{t("lab.catalog.colActions", { defaultValue: "Actions" })}</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.id} className="border-t border-neutral-100">
                  <td className="px-3 py-2">{member.fullName || "—"}</td>
                  <td className="px-3 py-2 text-neutral-600">{member.email}</td>
                  <td className="px-3 py-2">
                    {member.role === "owner" ? (
                      <span className="rounded bg-neutral-900 px-2 py-0.5 text-xs text-white">
                        {t("lab.team.roleOwner", { defaultValue: "Owner" })}
                      </span>
                    ) : (
                      <select
                        className="rounded border border-neutral-300 px-2 py-1 text-xs"
                        value={member.role}
                        disabled={busy}
                        onChange={(e) =>
                          run(
                            () => changeLabTeamMemberRole(member.id, e.target.value),
                            t("lab.team.roleChanged", {
                              defaultValue: "{{name}} is now {{role}}.",
                              name: member.fullName || member.email,
                              role: roleLabel(t, e.target.value),
                            })
                          )
                        }
                      >
                        {ASSIGNABLE_ROLES.map((role) => (
                          <option key={role} value={role}>
                            {roleLabel(t, role)}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="px-3 py-2 text-neutral-500">
                    {member.joinedAt ? new Date(member.joinedAt).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-3 py-2">
                    {member.role === "owner" ? (
                      <span className="text-xs text-neutral-400">—</span>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="text-xs underline"
                          disabled={busy}
                          onClick={() => {
                            if (
                              !window.confirm(
                                t("lab.team.transferConfirm", {
                                  defaultValue:
                                    "Hand ownership of this laboratory to {{name}}? You will become an administrator.",
                                  name: member.fullName || member.email,
                                })
                              )
                            )
                              return;
                            run(
                              () => transferLabOwnership(member.id),
                              t("lab.team.ownershipTransferred", { defaultValue: "Ownership transferred." })
                            );
                          }}
                        >
                          {t("lab.team.makeOwner", { defaultValue: "Make owner" })}
                        </button>
                        <button
                          type="button"
                          className="text-xs text-rose-600 underline"
                          disabled={busy}
                          onClick={() => {
                            if (
                              !window.confirm(
                                t("lab.team.removeConfirm", {
                                  defaultValue: "Remove {{name}} from this laboratory?",
                                  name: member.fullName || member.email,
                                })
                              )
                            )
                              return;
                            run(
                              () => removeLabTeamMember(member.id),
                              t("lab.team.memberRemoved", { defaultValue: "Team member removed." })
                            );
                          }}
                        >
                          {t("lab.team.remove", { defaultValue: "Remove" })}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-neutral-500">
          {t("lab.team.removeHelp", {
            defaultValue:
              "Removing someone ends their access to this laboratory. Their account and the results they signed off remain intact.",
          })}
        </p>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-neutral-900">
          {t("lab.team.inviteTitle", { defaultValue: "Invite a colleague" })}
        </h2>
        <form onSubmit={sendInvite} className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="text-neutral-700">{t("lab.team.colEmail", { defaultValue: "Email" })}</span>
            <input
              type="email"
              className="mt-1 block w-64 rounded border border-neutral-300 px-3 py-2"
              value={inviteForm.email}
              onChange={(e) => setInviteForm((p) => ({ ...p, email: e.target.value }))}
              required
            />
          </label>
          <label className="text-sm">
            <span className="text-neutral-700">{t("lab.team.colRole", { defaultValue: "Role" })}</span>
            <select
              className="mt-1 block rounded border border-neutral-300 px-3 py-2"
              value={inviteForm.role}
              onChange={(e) => setInviteForm((p) => ({ ...p, role: e.target.value }))}
            >
              {ASSIGNABLE_ROLES.map((role) => (
                <option key={role} value={role}>
                  {roleLabel(t, role)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={busy}
            className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {t("lab.team.sendInvite", { defaultValue: "Send invitation" })}
          </button>
        </form>
      </section>

      {pendingInvites.length ? (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-neutral-900">
            {t("lab.team.pendingInvites", { defaultValue: "Pending invitations" })}
          </h2>
          <ul className="space-y-2">
            {pendingInvites.map((invite) => (
              <li
                key={invite.id}
                className="flex items-center justify-between rounded border border-neutral-200 px-3 py-2 text-sm"
              >
                <span>
                  {invite.email}{" "}
                  <span className="text-neutral-500">
                    {t("lab.team.inviteMeta", {
                      defaultValue: "— {{role}}, expires {{date}}",
                      role: roleLabel(t, invite.role) || invite.role,
                      date: new Date(invite.expiresAt).toLocaleDateString(),
                    })}
                  </span>
                </span>
                <button
                  type="button"
                  className="text-xs text-rose-600 underline"
                  disabled={busy}
                  onClick={() =>
                    run(
                      () => revokeLabTeamInvite(invite.id),
                      t("lab.team.inviteWithdrawn", { defaultValue: "Invitation withdrawn." })
                    )
                  }
                >
                  {t("lab.team.withdraw", { defaultValue: "Withdraw" })}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
