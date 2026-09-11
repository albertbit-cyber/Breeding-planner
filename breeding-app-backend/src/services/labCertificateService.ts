import { prisma } from "../lib/prisma";
import { HttpError } from "../utils/errors";
import { isAdminRole } from "../auth/identity";
import type { AppRole } from "../types/auth";

/**
 * Issuing a certificate, and keeping it.
 *
 * A certificate had no row anywhere. It was re-derived in the breeder's browser
 * from the live order every single time someone opened it, which made it a view
 * of the laboratory's records rather than a document the breeder owned. Delete
 * the order and the certificate went with it: the confirmed genetics survived on
 * the animal, but the proof of it did not.
 *
 * Issuing is the point of no return. From the moment a result is submitted the
 * certificate belongs to the breeder, so it is written here, in the same request
 * that completes the result, and the order row it came from is only a nullable
 * reference back.
 *
 * What is stored is the order-with-results as the breeder app already reads it
 * from `/orders/:id`. That is deliberate: the app renders the same PDF from a
 * snapshot as it does from a live order, and there is no second copy of the
 * certificate layout on this side to drift out of step with the first.
 */

const CERTIFICATE_SNAPSHOT_SELECT = {
  id: true,
  orderNumber: true,
  status: true,
  paymentStatus: true,
  totalAnimals: true,
  pricingTier: true,
  totalPrice: true,
  currency: true,
  createdAt: true,
  updatedAt: true,
  labOrganizationId: true,
} as const;

type IssuingOrder = {
  id: string;
  breederId: string;
  labOrganizationId?: string | null;
  orderNumber?: string | null;
  [key: string]: unknown;
};

type IssuingResult = {
  id: string;
  animalId: string;
  status?: string | null;
  reportedAt?: Date | string | null;
  updatedAt?: Date | string | null;
  [key: string]: unknown;
};

/**
 * Certificate numbers and verification codes are derived, not random, and the
 * breeder app derives them the same way from the same inputs. Recomputing them
 * here keeps a stored certificate addressable by the number already shown to
 * whoever downloaded it before it was stored.
 */
const buildCertificateNumber = (orderId: string, issuedAt: Date): string => {
  // UTC, not local time. The same number is derived in three places -- this
  // server, the breeder app and the lab portal -- and a local-time stamp made it
  // depend on whose clock asked: a result reported at 23:30 UTC produced one
  // number for a browser in Amsterdam and another for the server.
  const stamp = [
    issuedAt.getUTCFullYear(),
    String(issuedAt.getUTCMonth() + 1).padStart(2, "0"),
    String(issuedAt.getUTCDate()).padStart(2, "0"),
  ].join("");
  const suffix = String(orderId || "").replace(/[^A-Za-z0-9]/g, "").slice(-6).toUpperCase() || "GEN";
  return `PH-GC-${stamp}-${suffix}`;
};

/**
 * The same SHA-256-over-a-seed the breeder app uses for its verification code,
 * so a code quoted from a live order still resolves once the order is gone.
 */
const buildStableToken = async (seed: string): Promise<string> => {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(String(seed || ""), "utf8").digest("hex").toUpperCase();
};

const toIsoString = (value: unknown): string => {
  if (value instanceof Date) return value.toISOString();
  const normalized = String(value || "").trim();
  if (!normalized) return new Date().toISOString();
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
};

/**
 * Normalises a Prisma row into exactly the JSON the breeder app receives over
 * the wire, so the snapshot deserialises into the object the app already knows
 * how to render.
 *
 * This is `JSON.stringify` rather than a hand-written walk of the object,
 * because the hand-written one was wrong in a way worth remembering. Prisma's
 * `Decimal` carries `constructor` as an *own enumerable* property, so
 * `Object.entries` handed it back and the walk recursed into a Function, which
 * Prisma then refused to store. The class name is no defence either: it is
 * minified in the published client, so a `constructor.name === "Decimal"` guard
 * matches nothing. `JSON.stringify` sidesteps both -- Decimal and Date each
 * carry their own `toJSON`, and it only ever visits enumerable data.
 */
const toJsonSafe = (value: unknown): unknown =>
  JSON.parse(
    JSON.stringify(value, (_key, entry) =>
      // JSON.stringify throws outright on a BigInt rather than skipping it, and
      // an order carrying one must not cost the breeder their certificate.
      (typeof entry === "bigint" ? entry.toString() : entry)
    ) ?? "null"
  );

/**
 * Records one certificate per animal tested on the order.
 *
 * Per *animal*, not per result. One animal routinely carries several completed
 * results on a single order -- one per test code -- and the breeder app renders
 * a single certificate covering the animal, so writing one row per result meant
 * four upserts fighting over the same row and a count that claimed four
 * certificates where one existed.
 *
 * Where an animal has several completed results, the first in the given order is
 * the one recorded against the certificate. Callers hand these over sorted by
 * `updatedAt` descending, which is the same result the breeder app picks to
 * render from, so the stored `resultId` names the result the document actually
 * shows.
 *
 * Runs *after* the result transaction rather than inside it, on purpose: a
 * laboratory's completed work must not roll back because the certificate row hit
 * a constraint. A failure here is logged and the result stands — the certificate
 * is recreated on the next submit, and the breeder can still open the live order
 * in the meantime.
 */
export const recordCertificatesForSubmittedResults = async (params: {
  order: IssuingOrder;
  results: IssuingResult[];
}): Promise<number> => {
  const { order, results } = params;
  const orderId = String(order?.id || "").trim();
  const breederId = String(order?.breederId || "").trim();
  if (!orderId || !breederId) return 0;

  const completed = (Array.isArray(results) ? results : []).filter(
    (result) => String(result?.status || "").trim() === "completed"
  );
  if (!completed.length) return 0;

  // One certificate per animal. A Map keyed on the animal keeps the first
  // result seen for it and drops the rest.
  const byAnimal = new Map<string, IssuingResult>();
  completed.forEach((result) => {
    const animalAppId = String(result?.animalId || "").trim();
    if (!animalAppId || byAnimal.has(animalAppId)) return;
    byAnimal.set(animalAppId, result);
  });

  const snapshotOrder = toJsonSafe(order) as Record<string, unknown>;
  let written = 0;

  for (const result of byAnimal.values()) {
    const resultId = String(result?.id || "").trim();
    const animalAppId = String(result?.animalId || "").trim();
    if (!resultId || !animalAppId) continue;

    // Same precedence the breeder app uses to date a certificate, so a stored
    // certificate carries the date the breeder was already shown.
    const issuedAt = new Date(
      toIsoString(result.reportedAt || result.updatedAt || order.updatedAt || order.createdAt || new Date())
    );
    const certificateNumber = buildCertificateNumber(orderId, issuedAt);
    const verificationCode = (await buildStableToken(`${orderId}:${resultId}:verification`)).slice(0, 24);

    // The certificate is keyed on the order and animal, not on the attempt: a
    // laboratory correcting a result re-issues the same certificate rather than
    // leaving the breeder holding two documents that disagree.
    const existing = await prisma.shedTestCertificate.findFirst({
      where: { orderId, animalAppId },
      select: { id: true },
    });

    const data = {
      breederId,
      labOrganizationId: order.labOrganizationId ? String(order.labOrganizationId) : null,
      animalAppId,
      resultId,
      orderNumber: order.orderNumber ? String(order.orderNumber) : null,
      certificateNumber,
      verificationCode,
      issuedAt,
      snapshotJson: snapshotOrder as any,
    };

    if (existing) {
      await prisma.shedTestCertificate.update({ where: { id: existing.id }, data });
    } else {
      await prisma.shedTestCertificate.create({ data: { ...data, orderId } });
    }
    written += 1;
  }

  return written;
};

export type StoredCertificateSummary = {
  id: string;
  orderId: string | null;
  orderNumber: string | null;
  animalId: string;
  certificateNumber: string;
  verificationCode: string;
  issuedAt: string;
  /** False once the laboratory has removed its copy of the order. */
  orderAvailable: boolean;
};

const toSummary = (row: {
  id: string;
  orderId: string | null;
  orderNumber: string | null;
  animalAppId: string;
  certificateNumber: string;
  verificationCode: string;
  issuedAt: Date;
}): StoredCertificateSummary => ({
  id: row.id,
  orderId: row.orderId,
  orderNumber: row.orderNumber,
  animalId: row.animalAppId,
  certificateNumber: row.certificateNumber,
  verificationCode: row.verificationCode,
  issuedAt: row.issuedAt.toISOString(),
  orderAvailable: Boolean(row.orderId),
});

const SUMMARY_SELECT = {
  id: true,
  orderId: true,
  orderNumber: true,
  animalAppId: true,
  certificateNumber: true,
  verificationCode: true,
  issuedAt: true,
} as const;

/**
 * Every certificate the breeder holds, including those whose order the
 * laboratory has since removed — which is the entire reason this list exists
 * separately from the order list.
 */
export const listCertificatesForBreeder = async (user: {
  id: string;
  role: AppRole;
}): Promise<StoredCertificateSummary[]> => {
  const rows = await prisma.shedTestCertificate.findMany({
    where: isAdminRole(user.role) ? {} : { breederId: user.id },
    select: SUMMARY_SELECT,
    orderBy: { issuedAt: "desc" },
  });
  return rows.map(toSummary);
};

/**
 * The stored snapshot, for rendering. Readable by the breeder who owns it, a
 * platform admin, and the laboratory that issued it — the last so a lab can
 * still answer "what did we certify" about an order it has archived or removed.
 */
export const getCertificateSnapshotForUser = async (
  certificateId: string,
  user: { id: string; role: AppRole },
  org?: { organizationId: string } | null
): Promise<{ certificate: StoredCertificateSummary; order: unknown }> => {
  const normalized = String(certificateId || "").trim();
  if (!normalized) throw new HttpError(400, "Certificate id is required.");

  const row = await prisma.shedTestCertificate.findUnique({
    where: { id: normalized },
    select: { ...SUMMARY_SELECT, breederId: true, labOrganizationId: true, snapshotJson: true },
  });
  if (!row) throw new HttpError(404, "Certificate not found.");

  const isOwner = row.breederId === user.id;
  const isIssuingLab = Boolean(
    org?.organizationId && row.labOrganizationId && org.organizationId === row.labOrganizationId
  );
  if (!isAdminRole(user.role) && !isOwner && !isIssuingLab) {
    throw new HttpError(403, "You do not have access to this certificate.");
  }

  return { certificate: toSummary(row), order: row.snapshotJson };
};

export { CERTIFICATE_SNAPSHOT_SELECT };
