import { prisma } from "../lib/prisma";
import { HttpError } from "../utils/errors";
import { logAdminAction } from "./adminService";
import { recordSecurityEvent } from "./securityEventService";
import { isKnownSpecies, speciesName } from "./speciesCatalogService";
import type { AuthenticatedUser } from "../types/auth";

const db = prisma as any;

/**
 * Genes contributed by laboratories.
 *
 * The generated Morphpedia tables are never hand-edited, so a laboratory that
 * tests for something the platform does not know cannot simply add it. These
 * submissions live in the database and are merged over the generated tables at
 * read time, which means a rebuild from Morphpedia can never discard one.
 *
 * Shared, after review. The laboratory that submitted a gene can use it
 * immediately — it is their own catalogue and their own results — but it reaches
 * other breeders only once an administrator approves it. A wrong inheritance
 * type would otherwise silently corrupt breeding predictions for everyone
 * keeping that species, including people who never deal with that laboratory.
 */

/**
 * The generated tables' vocabulary. `co-dominant` is what laboratories and
 * keepers say; `incomplete_dominant` is what the gene tables call the same
 * thing, and there are 207 of them, so the translation happens here rather than
 * asking a laboratory to learn our word for it.
 */
const GENE_TYPE_ALIASES: Record<string, string> = {
  recessive: "recessive",
  dominant: "dominant",
  "co-dominant": "incomplete_dominant",
  "co-dom": "incomplete_dominant",
  codominant: "incomplete_dominant",
  incomplete_dominant: "incomplete_dominant",
};

export const GENE_TYPES = ["recessive", "incomplete_dominant", "dominant"] as const;

const SUBMISSION_STATUSES = new Set(["pending", "approved", "rejected"]);

const text = (value: unknown, max: number): string | null => {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized.slice(0, max) : null;
};

const requiredText = (value: unknown, field: string, max: number): string => {
  const normalized = text(value, max);
  if (!normalized) throw new HttpError(400, `${field} is required.`);
  return normalized;
};

export const normalizeGeneType = (value: unknown): string => {
  const key = String(value || "").trim().toLowerCase().replace(/\s+/g, "-");
  const resolved = GENE_TYPE_ALIASES[key];
  if (!resolved) {
    throw new HttpError(400, "Inheritance must be recessive, co-dominant, or dominant.");
  }
  return resolved;
};

export const normalizeSubmission = (row: any) => ({
  id: row.id,
  organizationId: row.organizationId,
  labName: row.organization?.labAccount?.labName || row.organization?.name || null,
  speciesId: row.speciesId,
  speciesName: speciesName(row.speciesId),
  geneName: row.geneName,
  geneType: row.geneType,
  aliases: row.aliases || [],
  complex: row.complex || null,
  hasSuperForm: Boolean(row.hasSuperForm),
  superGeneName: row.superGeneName || null,
  notes: row.notes || null,
  status: row.status,
  reviewedAt: row.reviewedAt || null,
  reviewNote: row.reviewNote || null,
  reviewer: row.reviewer ? { id: row.reviewer.id, name: row.reviewer.fullName } : null,
  createdAt: row.createdAt,
});

const SUBMISSION_INCLUDE = {
  reviewer: { select: { id: true, fullName: true } },
  organization: { select: { name: true, labAccount: { select: { labName: true } } } },
};

/**
 * A laboratory proposes a gene. Never creates anything a breeder can see —
 * approval does that.
 */
export const submitGene = async (
  organizationId: string,
  payload: Record<string, unknown>
) => {
  const speciesId = requiredText(payload.speciesId, "Species", 80);
  if (!isKnownSpecies(speciesId)) throw new HttpError(400, `Unknown species: ${speciesId}.`);

  const geneName = requiredText(payload.geneName, "Gene name", 120);
  const geneType = normalizeGeneType(payload.geneType);

  const data = {
    organizationId,
    speciesId,
    geneName,
    geneType,
    aliases: Array.isArray(payload.aliases)
      ? payload.aliases.map((a: unknown) => String(a || "").trim()).filter(Boolean).slice(0, 20)
      : [],
    complex: text(payload.complex, 120),
    hasSuperForm: Boolean(payload.hasSuperForm),
    superGeneName: text(payload.superGeneName, 120),
    notes: text(payload.notes, 2000),
  };

  const existing = await db.labGeneSubmission.findUnique({
    where: { speciesId_geneName: { speciesId, geneName } },
  });

  if (existing) {
    if (existing.status === "approved") {
      throw new HttpError(409, `${geneName} is already part of the ${speciesName(speciesId)} database.`);
    }
    if (existing.organizationId !== organizationId) {
      // Another laboratory already proposed it. Say so rather than creating a
      // second row that would review the same fact twice.
      throw new HttpError(409, `${geneName} has already been proposed and is awaiting review.`);
    }
    const updated = await db.labGeneSubmission.update({
      where: { id: existing.id },
      // A rejected submission edited and resubmitted goes back into the queue.
      data: { ...data, status: "pending", reviewNote: null, reviewedAt: null, reviewedBy: null },
      include: SUBMISSION_INCLUDE,
    });
    return { submission: normalizeSubmission(updated) };
  }

  const created = await db.labGeneSubmission.create({ data, include: SUBMISSION_INCLUDE });

  await recordSecurityEvent({
    type: "genetics.gene_submitted",
    outcome: "success",
    metadata: { submissionId: created.id, organizationId, speciesId, geneName },
  });

  return { submission: normalizeSubmission(created) };
};

/** A laboratory's own submissions, so it can see what is still awaiting review. */
export const listSubmissionsForOrganization = async (organizationId: string) => {
  const rows = await db.labGeneSubmission.findMany({
    where: { organizationId },
    include: SUBMISSION_INCLUDE,
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 200,
  });
  return { submissions: rows.map(normalizeSubmission) };
};

export const listSubmissionsForAdmin = async (query: Record<string, unknown>) => {
  const status = String(query.status || "").trim();
  if (status && !SUBMISSION_STATUSES.has(status)) {
    throw new HttpError(400, "Unsupported submission status.");
  }
  const rows = await db.labGeneSubmission.findMany({
    where: status ? { status } : {},
    include: SUBMISSION_INCLUDE,
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 200,
  });
  return { submissions: rows.map(normalizeSubmission), statuses: Array.from(SUBMISSION_STATUSES) };
};

/**
 * An administrator decides. Approval is the moment the gene becomes visible to
 * every breeder keeping that species, which is why it takes a deliberate action
 * and is written to the audit log either way.
 */
export const reviewSubmission = async (
  actor: AuthenticatedUser,
  submissionId: string,
  payload: Record<string, unknown>
) => {
  const status = String(payload.status || "").trim().toLowerCase();
  if (status !== "approved" && status !== "rejected") {
    throw new HttpError(400, "Approve or reject the submission.");
  }
  const note = text(payload.note, 2000);
  if (status === "rejected" && !note) {
    // A laboratory that is told only "no" cannot fix and resubmit.
    throw new HttpError(400, "Give a reason when rejecting, so the laboratory can correct it.");
  }

  const before = await db.labGeneSubmission.findUnique({ where: { id: submissionId } });
  if (!before) throw new HttpError(404, "Submission not found.");

  // An administrator may correct the inheritance type while approving — that is
  // the point of review, and it is recorded in the audit entry below.
  const correctedType = payload.geneType !== undefined ? normalizeGeneType(payload.geneType) : undefined;

  const updated = await db.labGeneSubmission.update({
    where: { id: submissionId },
    data: {
      status,
      reviewNote: note,
      reviewedBy: actor.id,
      reviewedAt: new Date(),
      ...(correctedType ? { geneType: correctedType } : {}),
    },
    include: SUBMISSION_INCLUDE,
  });

  await logAdminAction({
    adminUserId: actor.id,
    action: status === "approved" ? "gene_submission_approved" : "gene_submission_rejected",
    beforeJson: { status: before.status, geneType: before.geneType },
    afterJson: {
      status: updated.status,
      geneType: updated.geneType,
      speciesId: updated.speciesId,
      geneName: updated.geneName,
    },
    reason: note || `Gene ${updated.geneName} ${status}`,
  });

  return { submission: normalizeSubmission(updated) };
};

/**
 * The approved overlay for one species, in the shape the breeder app's gene
 * tables use, so it can be merged straight over the generated table.
 *
 * @param organizationId when given, also includes that laboratory's own pending
 *   submissions — they can work with a gene they proposed before it is approved,
 *   because it is their own catalogue and their own results.
 */
export const getSpeciesGeneOverlay = async (speciesId: string, organizationId?: string) => {
  if (!isKnownSpecies(speciesId)) throw new HttpError(404, `Unknown species: ${speciesId}.`);

  const rows = await db.labGeneSubmission.findMany({
    where: organizationId
      ? { speciesId, OR: [{ status: "approved" }, { status: "pending", organizationId }] }
      : { speciesId, status: "approved" },
    include: { organization: { select: { labAccount: { select: { labName: true } } } } },
    orderBy: { geneName: "asc" },
  });

  return {
    speciesId,
    genes: rows.map((row: any) => ({
      geneName: row.geneName,
      geneType: row.geneType,
      complex: row.complex,
      hasSuperForm: row.hasSuperForm,
      superGeneName: row.superGeneName,
      aliases: row.aliases || [],
      shorthand: [],
      healthFlags: [],
      notes: row.notes,
      // Provenance, so it is always visible which genes came from a laboratory
      // rather than from Morphpedia, and which are still awaiting review.
      contributedBy: row.organization?.labAccount?.labName || null,
      pendingReview: row.status === "pending",
    })),
  };
};
