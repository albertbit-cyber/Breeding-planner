import type { Request, Response } from "express";
import { createCatalogItem, listCatalog, updateCatalogItem } from "../services/labConfigService";
import {
  changeMemberRole,
  createOffering,
  getLabProfile,
  getPricingConfig,
  getPublicLab,
  listOfferings,
  listPublicLabs,
  listSeedLibrary,
  listTeam,
  removeMember,
  retireOffering,
  transferOwnership,
  updateLabProfile,
  updateOffering,
  updatePricingConfig,
} from "../services/labVendorService";
import {
  inviteTeammate,
  listInvitesForOrganization,
  revokeInvite,
} from "../services/organizationInviteService";
import { listSpecies } from "../services/speciesCatalogService";
import {
  getSpeciesGeneOverlay,
  listSubmissionsForOrganization,
  submitGene,
} from "../services/geneSubmissionService";
import { HttpError } from "../utils/errors";

/**
 * Resolves the caller's own organization id.
 *
 * Every vendor-facing handler below routes through this and never reads an
 * organization id from the request. That is the whole tenancy guarantee at the
 * HTTP layer: there is no parameter a vendor could set to reach another
 * vendor's tests, prices, staff or orders, because none of these handlers
 * accept one.
 */
const ownOrganizationId = (req: Request): string => {
  const organizationId = req.membership?.organizationId;
  if (!organizationId) {
    throw new HttpError(403, "This account does not belong to a laboratory.");
  }
  return organizationId;
};

// ── Shared seed library (global, admin-owned, read-only to vendors) ──────────

export const getCatalog = async (req: Request, res: Response): Promise<void> => {
  const breederView = String(req.query.breederView || "").toLowerCase() === "true";
  const tests = await listCatalog(breederView);
  res.status(200).json({ tests });
};

export const postCatalogItem = async (req: Request, res: Response): Promise<void> => {
  const item = await createCatalogItem(req.body || {});
  res.status(201).json({ test: item });
};

export const patchCatalogItem = async (req: Request, res: Response): Promise<void> => {
  const item = await updateCatalogItem(req.params.id, req.body || {});
  res.status(200).json({ test: item });
};

export const getSeedLibrary = async (req: Request, res: Response): Promise<void> => {
  res.status(200).json(await listSeedLibrary(ownOrganizationId(req)));
};

// ── The vendor's own tests ───────────────────────────────────────────────────

export const getMyOfferings = async (req: Request, res: Response): Promise<void> => {
  res.status(200).json(await listOfferings(ownOrganizationId(req), false));
};

export const postMyOffering = async (req: Request, res: Response): Promise<void> => {
  res.status(201).json(await createOffering(ownOrganizationId(req), req.body || {}));
};

export const patchMyOffering = async (req: Request, res: Response): Promise<void> => {
  res.status(200).json(await updateOffering(ownOrganizationId(req), req.params.id, req.body || {}));
};

export const deleteMyOffering = async (req: Request, res: Response): Promise<void> => {
  res.status(200).json(await retireOffering(ownOrganizationId(req), req.params.id));
};

// ── The vendor's own pricing ─────────────────────────────────────────────────

export const getMyPricing = async (req: Request, res: Response): Promise<void> => {
  res.status(200).json(await getPricingConfig(ownOrganizationId(req)));
};

export const patchMyPricing = async (req: Request, res: Response): Promise<void> => {
  res.status(200).json(await updatePricingConfig(ownOrganizationId(req), req.body || {}));
};

// ── The vendor's own profile ─────────────────────────────────────────────────

export const getMyLab = async (req: Request, res: Response): Promise<void> => {
  res.status(200).json(await getLabProfile(ownOrganizationId(req)));
};

export const patchMyLab = async (req: Request, res: Response): Promise<void> => {
  res.status(200).json(await updateLabProfile(ownOrganizationId(req), req.body || {}));
};

// ── The vendor's own team ────────────────────────────────────────────────────

export const getMyTeam = async (req: Request, res: Response): Promise<void> => {
  res.status(200).json(await listTeam(ownOrganizationId(req)));
};

export const postTeamInvite = async (req: Request, res: Response): Promise<void> => {
  if (!req.user || !req.membership) throw new HttpError(403, "This account does not belong to a laboratory.");
  res.status(201).json(await inviteTeammate(req.user, req.membership, req.body || {}));
};

export const getTeamInvites = async (req: Request, res: Response): Promise<void> => {
  res.status(200).json(await listInvitesForOrganization(ownOrganizationId(req)));
};

export const deleteTeamInvite = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  // Passing the caller's own organization id scopes the lookup, so revoking
  // another org's invitation returns 404 rather than succeeding.
  res.status(200).json(
    await revokeInvite(req.user, req.params.id, { organizationId: ownOrganizationId(req), reason: req.body?.reason })
  );
};

export const patchTeamMemberRole = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  res.status(200).json(await changeMemberRole(req.user, ownOrganizationId(req), req.params.id, req.body?.role));
};

export const deleteTeamMember = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  res.status(200).json(await removeMember(req.user, ownOrganizationId(req), req.params.id));
};

export const postOwnershipTransfer = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  res.status(200).json(await transferOwnership(req.user, ownOrganizationId(req), req.params.id));
};

// ── Public lab directory (breeder-facing) ────────────────────────────────────

export const getLabDirectory = async (req: Request, res: Response): Promise<void> => {
  // `?species=` narrows the directory to laboratories serving the animal the
  // breeder is ordering for.
  const speciesId = String(req.query.species || "").trim() || undefined;
  res.status(200).json(await listPublicLabs(speciesId));
};

export const getLabDirectoryEntry = async (req: Request, res: Response): Promise<void> => {
  const speciesId = String(req.query.species || "").trim() || undefined;
  res.status(200).json(await getPublicLab(req.params.id, speciesId));
};

// ── Gene contributions ───────────────────────────────────────────────────────

export const postGeneSubmission = async (req: Request, res: Response): Promise<void> => {
  res.status(201).json(await submitGene(ownOrganizationId(req), req.body || {}));
};

export const getMyGeneSubmissions = async (req: Request, res: Response): Promise<void> => {
  res.status(200).json(await listSubmissionsForOrganization(ownOrganizationId(req)));
};

/**
 * Approved lab-contributed genes for a species, merged over the generated table
 * by the client. A laboratory also sees its own pending submissions here, so it
 * can work with a gene it proposed before review.
 */
export const getGeneOverlay = async (req: Request, res: Response): Promise<void> => {
  res.status(200).json(
    await getSpeciesGeneOverlay(req.params.speciesId, req.membership?.organizationId)
  );
};

/** The platform taxonomy a laboratory picks its served species from. */
export const getSpeciesCatalog = async (_req: Request, res: Response): Promise<void> => {
  res.status(200).json(listSpecies());
};
