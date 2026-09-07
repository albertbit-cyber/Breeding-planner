import { PrismaClient } from "@prisma/client";

/**
 * Gives a vendor organization the laboratory profile it should always have had.
 *
 * Why this exists
 * ---------------
 * A laboratory is two rows: an Organization of kind `lab_vendor`, and the
 * LabAccount that carries its name, address, status and directory listing.
 * Accepting a vendor invitation creates both together, so anything onboarded
 * that way is fine.
 *
 * Organizations that predate the invitation flow are not. The tenancy migration
 * added columns to LabAccount but never inserted rows, so a lab_vendor
 * organization created before it -- by an older seed, or by hand -- comes out
 * the other side with no laboratory profile at all. Nothing reports this, and
 * the symptoms point elsewhere:
 *
 *   - `/lab/my/profile` answers 404 "This organization does not have a
 *     laboratory profile", and so does every other /lab/my/* route, so the
 *     laboratory cannot open its own portal.
 *   - The breeder directory reads LabAccount, so the laboratory does not exist
 *     as far as any breeder is concerned: "no laboratories are receiving
 *     orders", with a laboratory sitting right there.
 *
 * What it writes matches what acceptInvite writes, field for field, so a
 * repaired laboratory is indistinguishable from an invited one. Everything else
 * -- real name, address, catalogue, prices -- is the laboratory's own to fill in
 * afterwards, or a provisioning script's.
 *
 * Idempotent: an organization that already has a profile is left alone.
 *
 * Usage:
 *   cd breeding-app-backend
 *   npx tsx prisma/provisioning/repairMissingLabAccounts.ts                    # dry run, all
 *   npx tsx prisma/provisioning/repairMissingLabAccounts.ts --org <id>         # dry run, one
 *   npx tsx prisma/provisioning/repairMissingLabAccounts.ts --org <id> --apply
 */

const prisma = new PrismaClient();

const main = async () => {
  const apply = process.argv.includes("--apply");
  const orgFlag = process.argv.indexOf("--org");
  const onlyOrganizationId = orgFlag >= 0 ? String(process.argv[orgFlag + 1] || "").trim() : "";

  const organizations = await prisma.organization.findMany({
    where: {
      kind: "lab_vendor",
      ...(onlyOrganizationId ? { id: onlyOrganizationId } : {}),
    },
    include: {
      labAccount: true,
      memberships: {
        include: { user: { select: { id: true, email: true, fullName: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!organizations.length) {
    console.error(
      onlyOrganizationId
        ? `No lab_vendor organization with id ${onlyOrganizationId}.`
        : "No lab_vendor organizations found."
    );
    process.exitCode = 1;
    return;
  }

  const missing = organizations.filter((org) => !org.labAccount);
  const healthy = organizations.length - missing.length;

  console.log(`Vendor organizations examined: ${organizations.length}`);
  console.log(`  already have a laboratory profile: ${healthy}`);
  console.log(`  missing one: ${missing.length}`);

  if (!missing.length) {
    console.log("\nNothing to repair.");
    return;
  }

  const plans = missing.map((org) => {
    // The owner is the laboratory's account holder. Falling back to the first
    // member covers an organization whose owner role was never set.
    const owner =
      org.memberships.find((membership) => membership.role === "owner") || org.memberships[0];
    return { org, owner };
  });

  console.log("");
  for (const { org, owner } of plans) {
    console.log(`  ${org.name}  (${org.id})`);
    console.log(`    owner: ${owner?.user?.email || "— none, cannot repair"}`);
    console.log(`    would create: labName "${org.name}", status approved, listed in directory`);
  }

  const unowned = plans.filter((plan) => !plan.owner?.user?.id);
  if (unowned.length) {
    console.log(
      `\n  ${unowned.length} organization(s) have no member to own the profile and are skipped.` +
        "\n  A laboratory profile belongs to a person; inventing one would create an account nobody can sign into."
    );
  }

  const repairable = plans.filter((plan) => plan.owner?.user?.id);
  if (!repairable.length) {
    console.log("\nNothing repairable.");
    return;
  }

  if (!apply) {
    console.log("\nDry run. Re-run with --apply to create these profiles.");
    return;
  }

  for (const { org, owner } of repairable) {
    await prisma.labAccount.create({
      data: {
        userId: owner!.user.id,
        organizationId: org.id,
        labName: org.name,
        contactPerson: owner!.user.fullName || owner!.user.email,
        // Matches acceptInvite: an organization that already exists as a vendor
        // was vetted when it was created, so a second approval gates nothing.
        status: "approved",
        permissionsJson: {},
        availableTestsJson: [],
        pricingJson: {},
      },
    });
    console.log(`Created laboratory profile for ${org.name} (owner ${owner!.user.email}).`);
  }

  console.log(
    `\nApplied. ${repairable.length} laboratory profile(s) created.` +
      "\nThey are listed in the directory but have no tests yet, so no breeder can order" +
      "\nfrom them until a catalogue is published."
  );
};

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
