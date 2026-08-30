import type { OrgRole, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { HttpError } from "../utils/errors";
import type { AuthenticatedUser } from "../types/auth";

const db = prisma as any;

/**
 * Everything a vendor laboratory owns and manages for itself: its public
 * identity, the tests it sells, its tier pricing, and its staff.
 *
 * The single rule this module exists to enforce is that every read and write
 * takes an `organizationId` that came from the caller's *own membership* —
 * never from a request body, a query string, or a path parameter. A vendor
 * cannot name another vendor's org because nothing here accepts one.
 *
 * The platform admin is not a caller of this module at all. Admin oversight is
 * a separate, read-only surface (adminService), which is what keeps
 * "admins can look but not touch" structural rather than a matter of remembering
 * to check a role.
 */

const TEST_CATEGORIES = new Set(["morph", "sex-determination", "other"]);
const PRICING_TYPES = new Set(["morph", "sex"]);
const PRIORITIES = new Set(["routine", "priority", "urgent"]);

const text = (value: unknown, max = 200): string | null => {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;
  return normalized.slice(0, max);
};

const requiredText = (value: unknown, field: string, max = 200): string => {
  const normalized = text(value, max);
  if (!normalized) throw new HttpError(400, `${field} is required.`);
  return normalized;
};

const optionalInt = (value: unknown, field: string, min = 0, max = 100_000): number | null => {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    throw new HttpError(400, `${field} must be a whole number.`);
  }
  if (parsed < min || parsed > max) {
    throw new HttpError(400, `${field} must be between ${min} and ${max}.`);
  }
  return parsed;
};

const decimal = (value: unknown, field: string): Prisma.Decimal | undefined => {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new HttpError(400, `${field} must be a positive amount.`);
  return parsed as unknown as Prisma.Decimal;
};

// ── Lab profile ──────────────────────────────────────────────────────────────

export const normalizeLabProfile = (row: any) => ({
  id: row.id,
  organizationId: row.organizationId,
  labName: row.labName,
  contactPerson: row.contactPerson || null,
  contactEmail: row.contactEmail || null,
  phone: row.phone || null,
  location: row.location || null,
  addressLine1: row.addressLine1 || null,
  addressLine2: row.addressLine2 || null,
  city: row.city || null,
  postalCode: row.postalCode || null,
  country: row.country || null,
  logoUrl: row.logoUrl || null,
  publicDescription: row.publicDescription || null,
  turnaroundDays: row.turnaroundDays ?? null,
  iban: row.iban || null,
  bic: row.bic || null,
  vatNumber: row.vatNumber || null,
  listedInDirectory: Boolean(row.listedInDirectory),
  status: row.status,
  organizationStatus: row.organization?.status || null,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export const getLabAccountForOrganization = async (organizationId: string) => {
  const lab = await db.labAccount.findUnique({
    where: { organizationId },
    include: { organization: true },
  });
  if (!lab) throw new HttpError(404, "This organization does not have a laboratory profile.");
  return lab;
};

export const getLabProfile = async (organizationId: string) =>
  ({ lab: normalizeLabProfile(await getLabAccountForOrganization(organizationId)) });

export const updateLabProfile = async (organizationId: string, payload: Record<string, unknown>) => {
  await getLabAccountForOrganization(organizationId);

  const data: Record<string, unknown> = {};
  if (payload.labName !== undefined) data.labName = requiredText(payload.labName, "Laboratory name");
  if (payload.contactPerson !== undefined) data.contactPerson = text(payload.contactPerson);
  if (payload.contactEmail !== undefined) data.contactEmail = text(payload.contactEmail);
  if (payload.phone !== undefined) data.phone = text(payload.phone, 50);
  if (payload.location !== undefined) data.location = text(payload.location);
  if (payload.addressLine1 !== undefined) data.addressLine1 = text(payload.addressLine1);
  if (payload.addressLine2 !== undefined) data.addressLine2 = text(payload.addressLine2);
  if (payload.city !== undefined) data.city = text(payload.city, 120);
  if (payload.postalCode !== undefined) data.postalCode = text(payload.postalCode, 30);
  if (payload.country !== undefined) data.country = text(payload.country, 120);
  if (payload.publicDescription !== undefined) data.publicDescription = text(payload.publicDescription, 2000);
  if (payload.turnaroundDays !== undefined) data.turnaroundDays = optionalInt(payload.turnaroundDays, "Turnaround", 0, 365);
  // Kept out of the public directory response deliberately: payment details
  // belong on the documents a laboratory issues, not on a browsing page.
  if (payload.iban !== undefined) data.iban = text(payload.iban, 40);
  if (payload.bic !== undefined) data.bic = text(payload.bic, 20);
  if (payload.vatNumber !== undefined) data.vatNumber = text(payload.vatNumber, 40);
  if (payload.listedInDirectory !== undefined) data.listedInDirectory = Boolean(payload.listedInDirectory);
  if (payload.logoUrl !== undefined) {
    const logo = String(payload.logoUrl ?? "").trim();
    if (logo && !/^(https:\/\/|data:image\/)/i.test(logo)) {
      throw new HttpError(400, "A logo must be an https URL or an embedded image.");
    }
    // Roughly 1MB of base64. Certificates embed this inline, so an unbounded
    // value would bloat every PDF the lab issues.
    if (logo.length > 1_400_000) throw new HttpError(400, "That logo image is too large.");
    data.logoUrl = logo || null;
  }

  // The organization's name follows the lab's name: they are the same thing to
  // a vendor, and letting them drift means the directory and the certificate
  // disagree about who ran the test.
  const updated = await db.$transaction(async (tx: any) => {
    const lab = await tx.labAccount.update({
      where: { organizationId },
      data,
      include: { organization: true },
    });
    if (data.labName) {
      await tx.organization.update({ where: { id: organizationId }, data: { name: data.labName as string } });
    }
    return lab;
  });

  return { lab: normalizeLabProfile(updated) };
};

// ── Test offerings ───────────────────────────────────────────────────────────

export const normalizeOffering = (row: any) => ({
  id: row.id,
  organizationId: row.organizationId,
  name: row.name,
  shortLabel: row.shortLabel || null,
  category: row.category,
  pricingType: row.pricingType,
  priceCents: row.priceCents ?? null,
  currency: row.currency,
  geneTarget: row.geneTarget || null,
  catalogRefId: row.catalogRefId || null,
  allowedPriorities: row.allowedPriorities || [],
  turnaroundDays: row.turnaroundDays ?? null,
  active: Boolean(row.active),
  visibleInBreederApp: Boolean(row.visibleInBreederApp),
  description: row.description || null,
  sortOrder: row.sortOrder ?? 0,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

/**
 * @param breederView when true, returns only what a breeder may order: active
 *   and breeder-visible. The lab's own portal passes false and sees everything,
 *   including tests it has taken off sale.
 */
export const listOfferings = async (organizationId: string, breederView = false) => {
  const rows = await db.labTestOffering.findMany({
    where: breederView ? { organizationId, active: true, visibleInBreederApp: true } : { organizationId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return { offerings: rows.map(normalizeOffering) };
};

const normalizePriorities = (value: unknown): string[] | undefined => {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return ["routine", "priority", "urgent"];
  const cleaned = Array.from(
    new Set(value.map((entry) => String(entry || "").trim().toLowerCase()).filter((entry) => PRIORITIES.has(entry)))
  );
  return cleaned.length ? cleaned : ["routine", "priority", "urgent"];
};

const offeringWriteData = (payload: Record<string, unknown>, isCreate: boolean): Record<string, unknown> => {
  const data: Record<string, unknown> = {};

  if (isCreate || payload.name !== undefined) data.name = requiredText(payload.name, "Test name", 160);
  if (isCreate || payload.category !== undefined) {
    const category = String(payload.category || "morph").trim().toLowerCase();
    if (!TEST_CATEGORIES.has(category)) throw new HttpError(400, "Unsupported test category.");
    data.category = category;
  }
  if (isCreate || payload.pricingType !== undefined) {
    const pricingType = String(payload.pricingType || "morph").trim().toLowerCase();
    if (!PRICING_TYPES.has(pricingType)) throw new HttpError(400, "Unsupported pricing type.");
    data.pricingType = pricingType;
  }
  if (payload.shortLabel !== undefined) data.shortLabel = text(payload.shortLabel, 40);
  if (payload.geneTarget !== undefined) data.geneTarget = text(payload.geneTarget, 120);
  if (payload.description !== undefined) data.description = text(payload.description, 2000);
  if (payload.priceCents !== undefined) data.priceCents = optionalInt(payload.priceCents, "Price", 0, 10_000_000);
  if (payload.turnaroundDays !== undefined) data.turnaroundDays = optionalInt(payload.turnaroundDays, "Turnaround", 0, 365);
  if (payload.sortOrder !== undefined) data.sortOrder = optionalInt(payload.sortOrder, "Sort order", 0, 10_000) ?? 0;
  if (payload.currency !== undefined) data.currency = (text(payload.currency, 3) || "EUR").toUpperCase();
  if (payload.active !== undefined) data.active = Boolean(payload.active);
  if (payload.visibleInBreederApp !== undefined) data.visibleInBreederApp = Boolean(payload.visibleInBreederApp);
  const priorities = normalizePriorities(payload.allowedPriorities);
  if (priorities !== undefined) data.allowedPriorities = priorities;

  return data;
};

export const createOffering = async (organizationId: string, payload: Record<string, unknown>) => {
  const data = offeringWriteData(payload, true);

  // A lab may start from the shared library, which prefills the gene mapping so
  // results still drive the genetics engine. It is a copy, not a link that
  // constrains: the lab is free to rename or reprice it immediately.
  const catalogRefId = text(payload.catalogRefId, 100);
  if (catalogRefId) {
    const source = await db.shedTestCatalog.findUnique({ where: { id: catalogRefId } });
    if (!source) throw new HttpError(404, "That test does not exist in the shared library.");
    data.catalogRefId = catalogRefId;
    if (data.geneTarget === undefined) data.geneTarget = source.geneTarget;
    if (data.shortLabel === undefined) data.shortLabel = source.shortLabel;
    if (data.description === undefined) data.description = source.description;
  }

  try {
    const created = await db.labTestOffering.create({ data: { ...data, organizationId } });
    return { offering: normalizeOffering(created) };
  } catch (error) {
    if ((error as { code?: string })?.code === "P2002") {
      throw new HttpError(409, "You already offer a test with that name.");
    }
    throw error;
  }
};

/** Loads an offering and proves it belongs to the caller's org before touching it. */
const requireOwnOffering = async (organizationId: string, offeringId: string) => {
  const offering = await db.labTestOffering.findUnique({ where: { id: offeringId } });
  // A 404 rather than a 403 when it belongs to someone else: confirming that an
  // id exists in another tenant is itself a small leak.
  if (!offering || offering.organizationId !== organizationId) {
    throw new HttpError(404, "Test not found.");
  }
  return offering;
};

export const updateOffering = async (
  organizationId: string,
  offeringId: string,
  payload: Record<string, unknown>
) => {
  await requireOwnOffering(organizationId, offeringId);
  const data = offeringWriteData(payload, false);
  if (!Object.keys(data).length) throw new HttpError(400, "Nothing to update.");

  try {
    const updated = await db.labTestOffering.update({ where: { id: offeringId }, data });
    return { offering: normalizeOffering(updated) };
  } catch (error) {
    if ((error as { code?: string })?.code === "P2002") {
      throw new HttpError(409, "You already offer a test with that name.");
    }
    throw error;
  }
};

/**
 * Retires an offering. Deliberately a deactivation, not a delete: order lines
 * point at it, and historical orders must keep resolving to the test that was
 * actually run.
 */
export const retireOffering = async (organizationId: string, offeringId: string) => {
  await requireOwnOffering(organizationId, offeringId);
  const updated = await db.labTestOffering.update({
    where: { id: offeringId },
    data: { active: false, visibleInBreederApp: false },
  });
  return { offering: normalizeOffering(updated) };
};

/** The shared seed library a lab may copy from. Read-only to vendors. */
export const listSeedLibrary = async (organizationId: string) => {
  const [catalog, mine] = await Promise.all([
    db.shedTestCatalog.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    db.labTestOffering.findMany({ where: { organizationId }, select: { catalogRefId: true, name: true } }),
  ]);
  const takenRefs = new Set(mine.map((row: any) => row.catalogRefId).filter(Boolean));
  const takenNames = new Set(mine.map((row: any) => String(row.name).toLowerCase()));
  return {
    library: catalog.map((row: any) => ({
      id: row.id,
      name: row.name,
      shortLabel: row.shortLabel,
      category: row.category,
      pricingType: row.pricingType,
      geneTarget: row.geneTarget,
      description: row.description,
      // Lets the UI grey out what this lab already sells instead of letting
      // them hit a unique-constraint error.
      alreadyOffered: takenRefs.has(row.id) || takenNames.has(String(row.name).toLowerCase()),
    })),
  };
};

// ── Tier pricing ─────────────────────────────────────────────────────────────

const PRICING_FIELDS = [
  "morphTier1to9FirstTest",
  "morphTier1to9AdditionalTest",
  "morphTier10to49FirstTest",
  "morphTier10to49AdditionalTest",
  "morphTier50PlusFirstTest",
  "morphTier50PlusAdditionalTest",
  "sexTier1to9",
  "sexTier10to49",
  "sexTier50Plus",
] as const;

export const normalizePricingConfig = (row: any) => ({
  id: row.id,
  organizationId: row.organizationId || null,
  currency: row.currency,
  ...Object.fromEntries(PRICING_FIELDS.map((field) => [field, Number(row[field]?.toString?.() ?? row[field] ?? 0)])),
  isActive: Boolean(row.isActive),
  updatedAt: row.updatedAt,
});

/**
 * The platform template — the `organization_id IS NULL` row. Used only to seed a
 * new vendor's own config; never to price an order.
 */
export const getPricingTemplate = async (client: any = db) =>
  client.pricingConfig.findFirst({
    where: { organizationId: null, isActive: true },
    orderBy: { updatedAt: "desc" },
  });

/**
 * Creates a vendor's own pricing row from the platform template. Called at
 * invite acceptance so a new lab is priceable from its first minute rather than
 * silently falling through to somebody else's numbers.
 */
export const seedPricingConfigForOrganization = async (organizationId: string, client: any = db) => {
  const template = await getPricingTemplate(client);
  const base = template
    ? Object.fromEntries(PRICING_FIELDS.map((field) => [field, template[field]]))
    : Object.fromEntries(PRICING_FIELDS.map((field) => [field, 0]));
  return client.pricingConfig.create({
    data: {
      id: `pricing_${organizationId}`,
      organizationId,
      currency: template?.currency || "EUR",
      ...base,
      isActive: true,
    },
  });
};

export const getPricingConfig = async (organizationId: string) => {
  const config = await db.pricingConfig.findUnique({ where: { organizationId } });
  if (!config) throw new HttpError(404, "This laboratory has no pricing configured yet.");
  return { pricing: normalizePricingConfig(config) };
};

export const updatePricingConfig = async (organizationId: string, payload: Record<string, unknown>) => {
  const existing = await db.pricingConfig.findUnique({ where: { organizationId } });
  if (!existing) throw new HttpError(404, "This laboratory has no pricing configured yet.");

  const data: Record<string, unknown> = {};
  for (const field of PRICING_FIELDS) {
    const value = decimal(payload[field], field);
    if (value !== undefined) data[field] = value;
  }
  if (payload.currency !== undefined) data.currency = (text(payload.currency, 3) || "EUR").toUpperCase();
  if (!Object.keys(data).length) throw new HttpError(400, "Nothing to update.");

  const updated = await db.pricingConfig.update({ where: { organizationId }, data });
  return { pricing: normalizePricingConfig(updated) };
};

// ── Team ─────────────────────────────────────────────────────────────────────

const normalizeMember = (row: any) => ({
  id: row.id,
  userId: row.userId,
  role: row.role,
  fullName: row.user?.fullName || null,
  email: row.user?.email || null,
  status: row.user?.status || null,
  lastLoginAt: row.user?.lastLoginAt || null,
  joinedAt: row.createdAt,
});

export const listTeam = async (organizationId: string) => {
  const rows = await db.membership.findMany({
    where: { organizationId },
    include: {
      user: { select: { id: true, fullName: true, email: true, status: true, lastLoginAt: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  return { members: rows.map(normalizeMember) };
};

const requireOwnMember = async (organizationId: string, membershipId: string) => {
  const membership = await db.membership.findUnique({
    where: { id: membershipId },
    include: { user: { select: { id: true, fullName: true, email: true, status: true, lastLoginAt: true } } },
  });
  if (!membership || membership.organizationId !== organizationId) {
    throw new HttpError(404, "Team member not found.");
  }
  return membership;
};

export const changeMemberRole = async (
  actor: AuthenticatedUser,
  organizationId: string,
  membershipId: string,
  role: unknown
) => {
  const requested = String(role || "").trim() as OrgRole;
  if (!["admin", "billing_manager", "member"].includes(requested)) {
    // `owner` is excluded on purpose — there is exactly one owner and moving it
    // is a transfer, not a role edit. See transferOwnership below.
    throw new HttpError(400, "Choose admin, billing manager, or member.");
  }
  const membership = await requireOwnMember(organizationId, membershipId);
  if (membership.role === "owner") {
    throw new HttpError(409, "The owner's role cannot be changed. Transfer ownership instead.");
  }
  if (membership.userId === actor.id) {
    throw new HttpError(409, "You cannot change your own role.");
  }

  const updated = await db.membership.update({
    where: { id: membershipId },
    data: { role: requested },
    include: { user: { select: { id: true, fullName: true, email: true, status: true, lastLoginAt: true } } },
  });
  return { member: normalizeMember(updated) };
};

/**
 * Removes a colleague from the organization.
 *
 * The membership goes; the user account does not. Deleting the account would
 * take their authored results with it, and someone leaving a lab is not a
 * reason to rewrite the record of work they did there.
 */
export const removeMember = async (
  actor: AuthenticatedUser,
  organizationId: string,
  membershipId: string
) => {
  const membership = await requireOwnMember(organizationId, membershipId);
  if (membership.role === "owner") {
    throw new HttpError(409, "The owner cannot be removed. Transfer ownership first.");
  }
  if (membership.userId === actor.id) {
    throw new HttpError(409, "You cannot remove yourself.");
  }
  await db.membership.delete({ where: { id: membershipId } });
  return { removed: true, userId: membership.userId };
};

/**
 * Hands the `owner` role to another member, demoting the current owner to
 * admin. One transaction, because an organization with two owners or none
 * violates the same invariant from opposite directions.
 */
export const transferOwnership = async (
  actor: AuthenticatedUser,
  organizationId: string,
  membershipId: string
) => {
  const target = await requireOwnMember(organizationId, membershipId);
  if (target.role === "owner") throw new HttpError(409, "That member is already the owner.");

  await db.$transaction(async (tx: any) => {
    await tx.membership.updateMany({
      where: { organizationId, role: "owner" },
      data: { role: "admin" },
    });
    await tx.membership.update({ where: { id: membershipId }, data: { role: "owner" } });
    // The LabAccount's `userId` records the designated owning user. Keeping it
    // in step means the admin console's lab search (which joins through it) keeps
    // finding the right person after a handover.
    await tx.labAccount.updateMany({ where: { organizationId }, data: { userId: target.userId } });
  });

  return listTeam(organizationId);
};

// ── Public lab directory ─────────────────────────────────────────────────────

/**
 * What a breeder sees when choosing where to send samples. Filtered on three
 * independent switches: the vendor's own listing toggle, the admin's org
 * suspension, and the lab account's approval status.
 */
export const listPublicLabs = async () => {
  const rows = await db.labAccount.findMany({
    where: {
      listedInDirectory: true,
      status: "approved",
      organization: { status: "active", kind: "lab_vendor" },
    },
    include: {
      organization: {
        select: {
          id: true,
          name: true,
          _count: { select: { testOfferings: true } },
        },
      },
    },
    orderBy: { labName: "asc" },
  });

  return {
    labs: rows.map((row: any) => ({
      organizationId: row.organizationId,
      labName: row.labName,
      location: row.location || [row.city, row.country].filter(Boolean).join(", ") || null,
      country: row.country || null,
      publicDescription: row.publicDescription || null,
      logoUrl: row.logoUrl || null,
      turnaroundDays: row.turnaroundDays ?? null,
      testCount: row.organization?._count?.testOfferings ?? 0,
    })),
  };
};

/**
 * One lab's public profile plus the tests a breeder may actually order from it.
 * This is the read behind "everything comes from the chosen lab's section".
 */
export const getPublicLab = async (organizationId: string) => {
  const lab = await db.labAccount.findFirst({
    where: {
      organizationId,
      listedInDirectory: true,
      status: "approved",
      organization: { status: "active", kind: "lab_vendor" },
    },
    include: { organization: true },
  });
  if (!lab) throw new HttpError(404, "Laboratory not found.");

  const [{ offerings }, pricing] = await Promise.all([
    listOfferings(organizationId, true),
    db.pricingConfig.findUnique({ where: { organizationId } }),
  ]);

  return {
    lab: {
      organizationId: lab.organizationId,
      labName: lab.labName,
      location: lab.location || [lab.city, lab.country].filter(Boolean).join(", ") || null,
      country: lab.country || null,
      publicDescription: lab.publicDescription || null,
      logoUrl: lab.logoUrl || null,
      turnaroundDays: lab.turnaroundDays ?? null,
    },
    offerings,
    pricing: pricing ? normalizePricingConfig(pricing) : null,
  };
};
