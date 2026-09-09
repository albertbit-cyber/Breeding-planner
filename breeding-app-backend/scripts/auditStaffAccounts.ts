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
 */
import { prisma } from "../src/lib/prisma";

const STAFF_ROLES = ["admin", "moderator", "support"] as const;

const main = async () => {
  const rows = await (prisma as any).user.findMany({
    where: { role: { in: STAFF_ROLES } },
    select: { id: true, email: true, fullName: true, role: true, status: true, isActive: true, lastLoginAt: true },
    orderBy: [{ role: "asc" }, { email: "asc" }],
  });

  if (!rows.length) {
    console.log("No staff accounts found.");
    return;
  }

  const owners = rows.filter((row: any) => row.role === "admin");
  const supports = rows.filter((row: any) => row.role === "support");

  console.log(`\n${rows.length} staff account(s):\n`);
  for (const row of rows) {
    const lastLogin = row.lastLoginAt ? new Date(row.lastLoginAt).toISOString().slice(0, 10) : "never";
    console.log(
      `  ${row.role.padEnd(10)} ${row.email.padEnd(36)} ${String(row.status || "").padEnd(10)} last login: ${lastLogin}`
    );
  }

  console.log("");
  if (owners.length > 1) {
    console.log(
      `  ! ${owners.length} accounts hold the owner role (\`admin\`). Only one is intended.\n` +
        "    No API can create another, but existing ones are untouched by the migration —\n" +
        "    demote the extras from the console's user list."
    );
  }
  if (supports.length) {
    console.log(
      `  ! ${supports.length} account(s) still hold the retired \`support\` role.\n` +
        "    The separation migration folds these into \`moderator\`; this run predates it."
    );
  }
  if (owners.length === 1 && !supports.length) {
    console.log("  Looks right: one owner, no retired roles.");
  }
  console.log("");
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
