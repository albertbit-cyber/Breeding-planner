/**
 * Read-only. Lists every account that holds staff authority, so the owner can
 * see who that actually is before or after the separation migration runs.
 *
 * This exists because the code can guarantee that no *new* owner account can be
 * created, but it cannot know how many already exist in a database it has never
 * seen. Run it, look at the list, and demote anything that should not be there
 * from the console's user list.
 *
 *   npm run audit:staff
 *
 * Against a deployed environment, run it through the Railway CLI so it reads
 * that environment's DATABASE_URL and no credential is copied to this machine:
 *
 *   railway run npm run audit:staff
 *
 * Laboratory accounts are listed too. `lab_owner` and `lab_staff` are code-level
 * names (src/auth/identity.ts) and are never persisted: the row holds `lab`, and
 * which of the two it is depends on the membership role in its lab_vendor
 * organization. So the persisted role alone cannot answer "who may act for a
 * laboratory" -- the membership has to be read with it.
 *
 * Every address a seed script in this repository creates is flagged, because the
 * password that goes with it is published in the repository and is therefore
 * usable by anyone who has read it.
 */
import { prisma } from "../src/lib/prisma";
import { SEEDED_ACCOUNTS, isSeededAddress } from "./seededAccounts";

const STAFF_ROLES = ["admin", "moderator", "support"] as const;

const day = (value: unknown): string =>
  value ? new Date(value as string).toISOString().slice(0, 10) : "never";

const line = (row: any, label: string): string =>
  `  ${label.padEnd(10)} ${String(row.email).padEnd(34)} created ${day(row.createdAt)}  ` +
  `last login ${day(row.lastLoginAt)}  status ${String(row.status || "-").padEnd(9)} active ${row.isActive}` +
  `${isSeededAddress(row.email) ? "   <-- SEEDED, PUBLISHED PASSWORD" : ""}`;

const main = async () => {
  const db = prisma as any;

  const staffRows = await db.user.findMany({
    where: { role: { in: STAFF_ROLES } },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      status: true,
      isActive: true,
      createdAt: true,
      lastLoginAt: true,
    },
    orderBy: [{ role: "asc" }, { email: "asc" }],
  });

  // Laboratory accounts: the persisted role is `lab` for both lab_owner and
  // lab_staff, so the membership and its organization come along to tell them
  // apart and to show what a deletion would be standing next to.
  const labRows = await db.user.findMany({
    where: { role: "lab" },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      status: true,
      isActive: true,
      createdAt: true,
      lastLoginAt: true,
      membership: {
        select: {
          role: true,
          organization: { select: { id: true, name: true, kind: true, status: true } },
        },
      },
    },
    orderBy: [{ email: "asc" }],
  });

  // Any remaining row on a seeded address, whatever role it holds, so that
  // breeder@ and buyer@ are not silently left out of a staff-shaped audit.
  const otherSeededRows = await db.user.findMany({
    where: {
      email: { in: Object.keys(SEEDED_ACCOUNTS) },
      role: { notIn: [...STAFF_ROLES, "lab"] },
    },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      status: true,
      isActive: true,
      createdAt: true,
      lastLoginAt: true,
    },
    orderBy: [{ email: "asc" }],
  });

  console.log("\n=== Staff accounts (persisted role admin / moderator / support) ===\n");
  if (!staffRows.length) {
    console.log("  None.");
  }
  for (const row of staffRows) {
    console.log(line(row, String(row.role)));
  }

  console.log("\n=== Laboratory accounts (persisted role lab) ===\n");
  if (!labRows.length) {
    console.log("  None.");
  }
  for (const row of labRows) {
    const membership = row.membership;
    const derived = membership?.role === "owner" ? "lab_owner" : "lab_staff";
    const org = membership?.organization;

    // Orders a laboratory has *received* hang off its organization, not off this
    // user row (ShedTestOrder.labOrganizationId, onDelete: Restrict). Orders it
    // *placed* hang off the user (breederId, onDelete: Cascade) and would go with
    // it. Those two counts are what decides whether a row can simply be deleted.
    const ordersReceived = org
      ? await db.shedTestOrder.count({ where: { labOrganizationId: org.id } })
      : 0;
    const ordersPlaced = await db.shedTestOrder.count({ where: { breederId: row.id } });
    const orgMembers = org ? await db.membership.count({ where: { organizationId: org.id } }) : 0;

    console.log(line(row, derived));
    console.log(
      `             org: ${
        org
          ? `${org.name} (${org.id}, kind ${org.kind}, status ${org.status}, ${orgMembers} member(s))`
          : "none"
      }`
    );
    console.log(
      `             orders received by that org: ${ordersReceived}   orders placed by this user: ${ordersPlaced}`
    );
  }

  if (otherSeededRows.length) {
    console.log("\n=== Other seeded accounts (not staff, still a published password) ===\n");
    for (const row of otherSeededRows) {
      console.log(line(row, String(row.role)));
    }
  }

  const owners = staffRows.filter((row: any) => row.role === "admin");
  const supports = staffRows.filter((row: any) => row.role === "support");
  const seededPresent = [...staffRows, ...labRows, ...otherSeededRows].filter((row: any) =>
    isSeededAddress(row.email)
  );

  console.log("");
  if (owners.length > 1) {
    console.log(
      `  ! ${owners.length} accounts hold the owner role (\`admin\`). Only one is intended.\n` +
        "    No API can create another, but existing ones are untouched by the migration --\n" +
        "    demote the extras from the console's user list."
    );
  }
  if (supports.length) {
    console.log(
      `  ! ${supports.length} account(s) still hold the retired \`support\` role.\n` +
        "    The separation migration folds these into \`moderator\`; this run predates it."
    );
  }
  if (seededPresent.length) {
    console.log(`  ! ${seededPresent.length} account(s) exist on an address a seed script creates.`);
    console.log(
      "    The password for each is printed in this repository, so anyone who has read it can sign in:"
    );
    for (const row of seededPresent) {
      const seed = SEEDED_ACCOUNTS[String(row.email).toLowerCase()];
      console.log(
        `      ${String(row.email).padEnd(34)} password "${seed.password}"  from ${seed.sources}`
      );
    }
    console.log("    See docs/runbooks/staff-accounts.md for what to do about each one.");
  } else {
    console.log("  No seeded address exists on this database.");
  }
  if (owners.length === 1 && !supports.length && !seededPresent.length) {
    console.log("  Looks right: one owner, no retired roles, no seeded accounts.");
  }
  console.log("");
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
