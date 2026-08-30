import { Router } from "express";
import {
  deleteMyOffering,
  deleteTeamInvite,
  deleteTeamMember,
  getCatalog,
  getLabDirectory,
  getLabDirectoryEntry,
  getMyLab,
  getMyOfferings,
  getMyPricing,
  getMyTeam,
  getSeedLibrary,
  getSpeciesCatalog,
  getGeneOverlay,
  getMyGeneSubmissions,
  postGeneSubmission,
  getTeamInvites,
  patchCatalogItem,
  patchMyLab,
  patchMyOffering,
  patchMyPricing,
  patchTeamMemberRole,
  postCatalogItem,
  postMyOffering,
  postOwnershipTransfer,
  postTeamInvite,
} from "../controllers/labController";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/roles";
import { requireOrgAdmin, requireOrgMember, requireOrgRole, withOrgContext } from "../middleware/orgContext";
import { asyncHandler } from "../middleware/asyncHandler";

export const labRoutes = Router();

// ── Lab directory ────────────────────────────────────────────────────────────
// Breeders choose a laboratory before they can be quoted, so these are readable
// by any signed-in account. They expose only what a lab has chosen to publish.
// The species taxonomy both sides pick from. Readable by any signed-in account:
// a laboratory needs it to declare what it serves, a breeder to say what they
// keep, and it is generated reference data rather than anyone's private list.
labRoutes.get("/species", requireAuth, asyncHandler(getSpeciesCatalog));

// Lab-contributed genes for a species, merged over the generated tables by the
// client. Org context is loaded so a laboratory also sees its own pending
// submissions; everyone else sees only what has been approved.
labRoutes.get(
  "/genetics/:speciesId/overlay",
  requireAuth,
  asyncHandler(withOrgContext),
  asyncHandler(getGeneOverlay)
);

labRoutes.get("/directory", requireAuth, asyncHandler(getLabDirectory));
labRoutes.get("/directory/:id", requireAuth, asyncHandler(getLabDirectoryEntry));

// ── Shared seed library ──────────────────────────────────────────────────────
// Reading it is open; writing it is the platform's alone. Vendors used to be
// able to PATCH these rows, which meant one lab could rewrite the definitions
// every other lab was selling against.
labRoutes.get("/tests/catalog", requireAuth, asyncHandler(getCatalog));
labRoutes.post("/tests/catalog", requireAuth, requireRole("admin"), asyncHandler(postCatalogItem));
labRoutes.patch("/tests/catalog/:id", requireAuth, requireRole("admin"), asyncHandler(patchCatalogItem));

// ── A vendor's own laboratory ────────────────────────────────────────────────
// Everything below acts on the caller's own organization, resolved from their
// membership. No handler here reads an organization id from the request, so
// there is no parameter to point at another vendor.
const vendor = Router();
vendor.use(requireAuth, requireRole("admin", "lab"), asyncHandler(withOrgContext));

vendor.get("/library", requireOrgMember, asyncHandler(getSeedLibrary));

vendor.get("/tests", requireOrgMember, asyncHandler(getMyOfferings));
vendor.post("/tests", requireOrgAdmin, asyncHandler(postMyOffering));
vendor.patch("/tests/:id", requireOrgAdmin, asyncHandler(patchMyOffering));
vendor.delete("/tests/:id", requireOrgAdmin, asyncHandler(deleteMyOffering));

// Proposing a gene is part of publishing a test, so it sits with the roles that
// may edit the catalogue.
vendor.post("/genes", requireOrgAdmin, asyncHandler(postGeneSubmission));
vendor.get("/genes", requireOrgMember, asyncHandler(getMyGeneSubmissions));

vendor.get("/pricing", requireOrgMember, asyncHandler(getMyPricing));
vendor.patch("/pricing", requireOrgAdmin, asyncHandler(patchMyPricing));

vendor.get("/profile", requireOrgMember, asyncHandler(getMyLab));
vendor.patch("/profile", requireOrgAdmin, asyncHandler(patchMyLab));

vendor.get("/team", requireOrgMember, asyncHandler(getMyTeam));
vendor.post("/team/invites", requireOrgAdmin, asyncHandler(postTeamInvite));
vendor.get("/team/invites", requireOrgAdmin, asyncHandler(getTeamInvites));
vendor.delete("/team/invites/:id", requireOrgAdmin, asyncHandler(deleteTeamInvite));
vendor.patch("/team/:id/role", requireOrgAdmin, asyncHandler(patchTeamMemberRole));
vendor.delete("/team/:id", requireOrgAdmin, asyncHandler(deleteTeamMember));
// Handing over the org is the owner's alone — an org admin promoting themselves
// would otherwise be a one-request takeover.
vendor.post("/team/:id/transfer-ownership", requireOrgRole("owner"), asyncHandler(postOwnershipTransfer));

labRoutes.use("/my", vendor);
