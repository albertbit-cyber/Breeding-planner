/**
 * Gives every already-completed order the certificate row it never had.
 *
 * Certificates only started being stored when a result was submitted, so orders
 * completed before that change have none — and would lose their certificate the
 * moment a laboratory removed the order, which is the exact failure the stored
 * certificate exists to prevent. Run this once after deploying the migration.
 *
 *   npx tsx scripts/backfillCertificates.ts            # report only
 *   npx tsx scripts/backfillCertificates.ts --apply    # write
 *
 * Idempotent: an order that already has a certificate for an animal is updated
 * in place rather than duplicated, so re-running is safe.
 */

import { prisma } from "../src/lib/prisma";
import { LAB_IDENTITY_SELECT } from "../src/services/orderService";
import { recordCertificatesForSubmittedResults } from "../src/services/labCertificateService";

const APPLY = process.argv.includes("--apply");

const main = async () => {
  const orders = await prisma.shedTestOrder.findMany({
    where: { results: { some: { status: "completed" } } },
    include: {
      breeder: { select: { id: true, email: true, fullName: true, role: true } },
      labOrganization: { select: LAB_IDENTITY_SELECT },
      animals: { include: { tests: true } },
      results: { orderBy: { updatedAt: "desc" } },
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(`[backfill] ${orders.length} order(s) carry a completed result.`);

  let alreadyStored = 0;
  let written = 0;
  let failed = 0;

  for (const order of orders) {
    const completed = order.results.filter((result) => result.status === "completed");
    const existing = await prisma.shedTestCertificate.count({ where: { orderId: order.id } });

    if (existing >= completed.length) {
      alreadyStored += 1;
      continue;
    }

    if (!APPLY) {
      console.log(
        `[backfill] would write ${completed.length - existing} certificate(s) for order ` +
          `${order.orderNumber || order.id}`
      );
      written += completed.length - existing;
      continue;
    }

    try {
      const count = await recordCertificatesForSubmittedResults({
        order: order as any,
        results: completed as any,
      });
      written += count;
      console.log(`[backfill] stored ${count} certificate(s) for order ${order.orderNumber || order.id}`);
    } catch (error) {
      failed += 1;
      console.error(`[backfill] FAILED for order ${order.orderNumber || order.id}:`, error);
    }
  }

  console.log(
    `[backfill] ${APPLY ? "wrote" : "would write"} ${written} certificate(s); ` +
      `${alreadyStored} order(s) already complete; ${failed} failure(s).`
  );
  if (!APPLY) console.log("[backfill] dry run — re-run with --apply to write.");
};

main()
  .catch((error) => {
    console.error("[backfill] aborted:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
