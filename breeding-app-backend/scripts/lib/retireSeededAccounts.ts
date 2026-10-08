/**
 * Retires accounts whose passwords are printed in this repository.
 *
 * Two treatments, chosen per account:
 *
 *   neutralise (default)  The password is replaced with a random one nobody is
 *                         told, the account is suspended (so loginUser refuses
 *                         it), every refresh session is revoked, and the row is
 *                         marked for deletion. The row, its organization and its
 *                         history stay exactly where they are. Reversible from
 *                         the admin console, which can set the status back to
 *                         active -- the published password does not come back
 *                         with it, which is the point of rotating first.
 *
 *   delete                The row is removed. Refused unless the account owns
 *                         nothing: no organization membership, no lab orders it
 *                         placed, and no lab orders received by an organization
 *                         it belongs to. Orders a user placed cascade with the
 *                         user (ShedTestOrder.breederId), and a lab organization
 *                         whose only member is deleted cannot act on its queue.
 *
 * Only addresses in `SEEDED_ACCOUNTS` are accepted. A real person's account is
 * handled from the admin console, where the action is attributed to the staff
 * member who took it; this script has no actor, so its audit entries carry none.
 *
 * Nothing is written without `confirm: true`; a dry run reports the plan.
 */
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { SEEDED_ACCOUNTS, normaliseEmail } from "../seededAccounts";

export type RetireMode = "neutralise" | "delete";

export type RetireOptions = {
  emails: string[];
  mode?: RetireMode;
  confirm?: boolean;
  now?: () => Date;
  /** Produces the replacement password. Overridable for tests. */
  randomPassword?: () => string;
  /** Hashes a password the way authService does. Overridable for tests. */
  hashPassword?: (password: string) => Promise<string>;
};

export type RetireOutcome = {
  email: string;
  action: "neutralised" | "deleted" | "would-neutralise" | "would-delete" | "skipped";
  reason: string;
  userId?: string;
  role?: string;
  organization?: { id: string; name: string; members: number } | null;
  ordersPlaced?: number;
  ordersReceivedByOrg?: number;
};

const REFUSAL_NOT_SEEDED =
  "not a seeded address; handle it from the admin console so the action is attributed to a person";

const defaultRandomPassword = (): string => randomBytes(32).toString("base64url");

const defaultHashPassword = (password: string): Promise<string> => bcrypt.hash(password, 12);

export const retireSeededAccounts = async (db: any, options: RetireOptions): Promise<RetireOutcome[]> => {
  const mode: RetireMode = options.mode || "neutralise";
  const confirm = options.confirm === true;
  const now = options.now || (() => new Date());
  const randomPassword = options.randomPassword || defaultRandomPassword;
  const hashPassword = options.hashPassword || defaultHashPassword;

  const outcomes: RetireOutcome[] = [];

  for (const rawEmail of options.emails) {
    const email = normaliseEmail(rawEmail);
    const seed = SEEDED_ACCOUNTS[email];

    if (!seed) {
      outcomes.push({ email, action: "skipped", reason: REFUSAL_NOT_SEEDED });
      continue;
    }

    const user = await db.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        isActive: true,
        membership: {
          select: {
            role: true,
            organization: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!user) {
      outcomes.push({ email, action: "skipped", reason: "no such account on this database" });
      continue;
    }

    const org = user.membership?.organization || null;
    const orgMembers = org ? await db.membership.count({ where: { organizationId: org.id } }) : 0;
    const ordersPlaced = await db.shedTestOrder.count({ where: { breederId: user.id } });
    const ordersReceivedByOrg = org
      ? await db.shedTestOrder.count({ where: { labOrganizationId: org.id } })
      : 0;

    const base = {
      email,
      userId: user.id,
      role: String(user.role),
      organization: org ? { id: org.id, name: org.name, members: orgMembers } : null,
      ordersPlaced,
      ordersReceivedByOrg,
    };

    if (mode === "delete") {
      const owns: string[] = [];
      if (user.membership) owns.push(`member of ${org?.name || "an organization"}`);
      if (ordersPlaced) owns.push(`${ordersPlaced} lab order(s) placed`);
      if (ordersReceivedByOrg) owns.push(`${ordersReceivedByOrg} lab order(s) received by its organization`);
      if (owns.length) {
        outcomes.push({
          ...base,
          action: "skipped",
          reason: `delete refused, the account owns something: ${owns.join("; ")}. Neutralise it instead.`,
        });
        continue;
      }

      if (!confirm) {
        outcomes.push({ ...base, action: "would-delete", reason: "dry run" });
        continue;
      }

      await db.adminAuditLog.create({
        data: {
          adminUserId: null,
          targetUserId: user.id,
          action: "user_deleted",
          beforeJson: { status: user.status, isActive: user.isActive, role: user.role },
          afterJson: null,
          reason: `Seeded account deleted: its password "${seed.password}" is published in the repository.`,
          internalNote: `retire:seeded. Written by ${seed.sources}.`,
        },
      });
      await db.user.delete({ where: { id: user.id } });
      outcomes.push({ ...base, action: "deleted", reason: "owned nothing" });
      continue;
    }

    if (!confirm) {
      outcomes.push({ ...base, action: "would-neutralise", reason: "dry run" });
      continue;
    }

    const at = now();
    const passwordHash = await hashPassword(randomPassword());

    const updated = await db.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        status: "suspended",
        isActive: false,
        refreshToken: null,
        deletionRequestedAt: at,
      },
      select: { status: true, isActive: true },
    });
    await db.refreshSession.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: at },
    });
    await db.adminAuditLog.create({
      data: {
        adminUserId: null,
        targetUserId: user.id,
        action: "user_suspended",
        beforeJson: { status: user.status, isActive: user.isActive },
        afterJson: { status: updated.status, isActive: updated.isActive, passwordRotated: true },
        reason: `Seeded account retired: its password "${seed.password}" is published in the repository.`,
        internalNote: `retire:seeded. Password rotated to a random value, sessions revoked, marked for deletion. Written by ${seed.sources}.`,
      },
    });

    outcomes.push({
      ...base,
      action: "neutralised",
      reason: "password rotated, suspended, sessions revoked, marked for deletion",
    });
  }

  return outcomes;
};

export const describeOutcome = (outcome: RetireOutcome): string => {
  const head = `${outcome.action.padEnd(17)} ${outcome.email}`;
  const facts: string[] = [];
  if (outcome.role) facts.push(`role ${outcome.role}`);
  if (outcome.organization) {
    facts.push(`org ${outcome.organization.name} (${outcome.organization.members} member(s))`);
  }
  if (outcome.ordersPlaced !== undefined) facts.push(`placed ${outcome.ordersPlaced}`);
  if (outcome.ordersReceivedByOrg !== undefined) facts.push(`org received ${outcome.ordersReceivedByOrg}`);
  return `${head}\n    ${facts.join(", ") || "-"}\n    ${outcome.reason}`;
};
