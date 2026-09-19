import type { OrgRole, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { HttpError } from "../utils/errors";
import type { AuthenticatedUser } from "../types/auth";
import { normalizeSpeciesIds, speciesName } from "./speciesCatalogService";

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

/**
 * A per-test tier override, `{ t1, t2, t3 }` in cents.
 *
 * All three or nothing: a partial override would silently fall back to the
 * laboratory's own tier table for the missing sizes, which reads as a price the
 * lab never set. `null` clears the override and returns the test to that table.
 */
const tierPrices = (value: unknown): Prisma.JsonValue | null => {
  if (value === null || value === "") return null;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, "Tier prices must be given as t1, t2 and t3 in cents.");
  }
  const source = value as Record<string, unknown>;
  const parsed: Record<string, number> = {};
  for (const key of ["t1", "t2", "t3"] as const) {
    const cents = optionalInt(source[key], `Tier price ${key}`, 0, 10_000_000);
    if (cents === null) {
      throw new HttpError(400, "A tier price is needed for all three order sizes, or for none.");
    }
    parsed[key] = cents;
  }
  return parsed as Prisma.JsonValue;
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
  servedSpeciesIds: row.servedSpeciesIds || [],
  servedSpecies: (row.servedSpeciesIds || []).map((id: string) => ({ id, name: speciesName(id) })),
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
  if (payload.servedSpeciesIds !== undefined) {
    data.servedSpeciesIds = normalizeSpeciesIds(payload.servedSpeciesIds, "Served species");
  }
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
  testKind: row.testKind || "morph",
  priceModel: row.priceModel || "tier",
  priceCents: row.priceCents ?? null,
  tierPrices: row.tierPricesJson ?? null,
  addonPriceCents: row.addonPriceCents ?? null,
  speciesIds: row.speciesIds || [],
  species: (row.speciesIds || []).map((id: string) => ({ id, name: speciesName(id) })),
  aliases: row.aliases || [],
  availability: row.availability || "available",
  panelScope: row.panelScope || null,
  panelMemberIds: row.panelMemberIds || [],
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
  if (payload.addonPriceCents !== undefined) {
    data.addonPriceCents = optionalInt(payload.addonPriceCents, "Add-on price", 0, 10_000_000);
  }
  // The column and the pricing engine have honoured a per-test tier override
  // since the tier work landed; until now nothing could write one, so every
  // laboratory priced on one scale whether that was true of its price list or
  // not.
  if (payload.tierPrices !== undefined) data.tierPricesJson = tierPrices(payload.tierPrices);
  if (payload.speciesIds !== undefined) {
    data.speciesIds = normalizeSpeciesIds(payload.speciesIds, "Species");
  }
  if (payload.panelScope !== undefined) data.panelScope = text(payload.panelScope, 2000);
  if (payload.aliases !== undefined) {
    data.aliases = Array.isArray(payload.aliases)
      ? payload.aliases.map((a: unknown) => String(a || "").trim()).filter(Boolean).slice(0, 20)
      : [];
  }
  if (payload.testKind !== undefined) {
    const kind = String(payload.testKind || "morph").trim().toLowerCase();
    if (!["morph", "sex", "panel"].includes(kind)) throw new HttpError(400, "Unsupported test kind.");
    data.testKind = kind;
  }
  if (payload.priceModel !== undefined) {
    const model = String(payload.priceModel || "tier").trim().toLowerCase();
    if (!["tier", "flat"].includes(model)) throw new HttpError(400, "Price model must be tier or flat.");
    data.priceModel = model;
  }
  if (payload.availability !== undefined) {
    const availability = String(payload.availability || "available").trim().toLowerCase();
    if (!["available", "coming_soon"].includes(availability)) {
      throw new HttpError(400, "Availability must be available or coming soon.");
    }
    data.availability = availability;
  }
  if (payload.turnaroundDays !== undefined) data.turnaroundDays = optionalInt(payload.turnaroundDays, "Turnaround", 0, 365);
  if (payload.sortOrder !== undefined) data.sortOrder = optionalInt(payload.sortOrder, "Sort order", 0, 10_000) ?? 0;
  if (payload.currency !== undefined) data.currency = (text(payload.currency, 3) || "EUR").toUpperCase();
  if (payload.active !== undefined) data.active = Boolean(payload.active);
  if (payload.visibleInBreederApp !== undefined) data.visibleInBreederApp = Boolean(payload.visibleInBreederApp);
  const priorities = normalizePriorities(payload.allowedPriorities);
  if (priorities !== undefined) data.allowedPriorities = priorities;

  return data;
};

/**
 * A test cannot claim a species the laboratory has not said it serves.
 *
 * Without this a lab could tag a test with any of the 64 species and have it
 * surface to breeders it has no business serving — its directory entry would
 * say one thing and its catalogue another.
 */
const assertServedSpecies = async (organizationId: string, speciesIds: unknown) => {
  if (!Array.isArray(speciesIds) || !speciesIds.length) return;
  const lab = await db.labAccount.findUnique({
    where: { organizationId },
    select: { servedSpeciesIds: true },
  });
  const served = new Set<string>(lab?.servedSpeciesIds || []);
  const notServed = (speciesIds as string[]).filter((id) => !served.has(id));
  if (notServed.length) {
    throw new HttpError(
      400,
      `Add ${notServed.map(speciesName).join(", ")} to the species your laboratory serves before tagging a test with it.`
    );
  }
};

export const createOffering = async (organizationId: string, payload: Record<string, unknown>) => {
  const data = offeringWriteData(payload, true);
  await assertServedSpecies(organizationId, data.speciesIds);

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
  await assertServedSpecies(organizationId, data.speciesIds);

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


// ── Importing a whole catalogue at once ──────────────────────────────────────

/**
 * A laboratory's first act on this platform is publishing what it sells.
 * ProHerper has sixty-eight tests; adding them one at a time through a form is
 * why onboarding one took a day. This takes the whole price list in one request.
 *
 * The rows arrive already parsed — the spreadsheet reader lives in the lab
 * portal, where it can show a laboratory exactly what its file says before
 * anything is written. That makes this endpoint's input untrusted like any
 * other, so every row goes through the same `offeringWriteData` and the same
 * served-species rule as a test typed into the form. Nothing is taken on faith
 * because it arrived in bulk.
 */
const MAX_IMPORT_ROWS = 500;

/**
 * The importable fields, as a complete statement.
 *
 * A row in the file is the whole truth about that test: a laboratory that
 * cleared the Gene column means the test no longer maps to a gene, and an
 * update that quietly kept the old value would leave the catalogue saying
 * something the price list does not. So every optional field absent from a row
 * is written as empty rather than skipped.
 *
 * `active` and `visibleInBreederApp` are deliberately not in this set. They are
 * not columns in the spreadsheet, and a re-import must not put a test a
 * laboratory has taken off sale back on it.
 */
const completeImportEntry = (entry: Record<string, unknown>): Record<string, unknown> => ({
  shortLabel: null,
  description: null,
  geneTarget: null,
  addonPriceCents: null,
  turnaroundDays: null,
  panelScope: null,
  aliases: [],
  availability: "available",
  priceModel: "tier",
  priceCents: null,
  tierPrices: null,
  ...entry,
});

type ImportRejection = { position: number; name: string | null; message: string };

export const importOfferings = async (organizationId: string, payload: Record<string, unknown>) => {
  const incoming = Array.isArray(payload.offerings) ? payload.offerings : null;
  if (!incoming) throw new HttpError(400, "Send the tests to import as a list called `offerings`.");
  if (!incoming.length) throw new HttpError(400, "There is nothing in this file to import.");
  if (incoming.length > MAX_IMPORT_ROWS) {
    throw new HttpError(400, `A catalogue import is limited to ${MAX_IMPORT_ROWS} tests at a time.`);
  }
  // A dry run answers "what would this do" without doing it, so a laboratory
  // can be shown the consequences of its own file before it commits to them.
  const dryRun = payload.dryRun === true;

  const lab = await db.labAccount.findUnique({
    where: { organizationId },
    select: { servedSpeciesIds: true },
  });
  if (!lab) throw new HttpError(404, "This organization does not have a laboratory profile.");
  const served = new Set<string>(lab.servedSpeciesIds || []);

  const existing = await db.labTestOffering.findMany({
    where: { organizationId },
    select: { id: true, name: true, sortOrder: true, active: true },
  });
  const existingByName = new Map<string, any>(
    existing.map((row: any) => [String(row.name).trim().toLowerCase(), row])
  );
  let nextSortOrder = existing.reduce(
    (highest: number, row: any) => Math.max(highest, Number(row.sortOrder) || 0),
    0
  );

  const creates: Array<{ name: string; data: Record<string, unknown> }> = [];
  const updates: Array<{ id: string; name: string; active: boolean; data: Record<string, unknown> }> = [];
  const rejected: ImportRejection[] = [];
  const seen = new Set<string>();

  incoming.forEach((raw: unknown, index: number) => {
    const entry = raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
    const name = String(entry.name ?? "").trim();
    const position = index + 1;

    try {
      if (!name) throw new HttpError(400, "A test needs a name.");
      const key = name.toLowerCase();
      if (seen.has(key)) {
        throw new HttpError(400, `"${name}" is listed more than once in this file.`);
      }
      seen.add(key);

      const match = existingByName.get(key);
      // Always written as a create's worth of fields, so a re-import states the
      // test in full rather than patching whichever columns happened to be filled.
      const data = offeringWriteData(completeImportEntry(entry), true);

      const notServed = ((data.speciesIds as string[]) || []).filter((id) => !served.has(id));
      if (notServed.length) {
        throw new HttpError(
          400,
          `Add ${notServed.map(speciesName).join(", ")} to the species your laboratory serves before offering a test for it.`
        );
      }

      if (match) {
        // Order is left as the laboratory already has it: a supplementary file
        // of ten tests must not renumber itself to the top of a catalogue of
        // sixty-eight.
        delete data.sortOrder;
        updates.push({ id: match.id, name: match.name, active: Boolean(match.active), data });
      } else {
        nextSortOrder += 1;
        creates.push({ name, data: { ...data, organizationId, sortOrder: nextSortOrder } });
      }
    } catch (error) {
      rejected.push({
        position,
        name: name || null,
        message: error instanceof HttpError ? error.message : "This test could not be read.",
      });
    }
  });

  const plan = {
    dryRun,
    willCreate: creates.map((row) => ({ name: row.name })),
    // A laboratory that re-imports a test it has taken off sale gets its details
    // updated and its withdrawal respected; saying so is the only way that is
    // not a mystery later.
    willUpdate: updates.map((row) => ({ id: row.id, name: row.name, active: row.active })),
    rejected,
    created: 0,
    updated: 0,
  };

  if (dryRun) return plan;
  if (!creates.length && !updates.length) {
    throw new HttpError(400, "Not one test in this file could be imported. Fix the rows listed and upload it again.");
  }

  try {
    await db.$transaction(async (tx: any) => {
      for (const row of creates) {
        await tx.labTestOffering.create({ data: row.data });
      }
      for (const row of updates) {
        await tx.labTestOffering.update({ where: { id: row.id }, data: row.data });
      }
    });
  } catch (error) {
    if ((error as { code?: string })?.code === "P2002") {
      throw new HttpError(409, "Two tests in this file resolved to the same name. Nothing was imported.");
    }
    throw error;
  }

  return { ...plan, created: creates.length, updated: updates.length };
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
/**
 * @param speciesId when given, only laboratories serving that species. This is
 *   what makes the breeder's first choice meaningful: ordering for a corn snake
 *   should not offer a laboratory that only handles ball pythons.
 */
export const listPublicLabs = async (speciesId?: string) => {
  const rows = await db.labAccount.findMany({
    where: {
      listedInDirectory: true,
      status: "approved",
      organization: { status: "active", kind: "lab_vendor" },
      ...(speciesId ? { servedSpeciesIds: { has: speciesId } } : {}),
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
      servedSpeciesIds: row.servedSpeciesIds || [],
      servedSpecies: (row.servedSpeciesIds || []).map((id: string) => ({
        id,
        name: speciesName(id),
      })),
    })),
  };
};

/**
 * One lab's public profile plus the tests a breeder may actually order from it.
 * This is the read behind "everything comes from the chosen lab's section".
 */
export const getPublicLab = async (organizationId: string, speciesId?: string) => {
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

  const [{ offerings: allOfferings }, pricing] = await Promise.all([
    listOfferings(organizationId, true),
    db.pricingConfig.findUnique({ where: { organizationId } }),
  ]);

  // A breeder ordering for one animal should see that animal's tests and no
  // others — a ball python keeper has no use for the boa constrictor list.
  const offerings = speciesId
    ? allOfferings.filter((offering: any) => (offering.speciesIds || []).includes(speciesId))
    : allOfferings;

  return {
    lab: {
      organizationId: lab.organizationId,
      labName: lab.labName,
      location: lab.location || [lab.city, lab.country].filter(Boolean).join(", ") || null,
      country: lab.country || null,
      publicDescription: lab.publicDescription || null,
      logoUrl: lab.logoUrl || null,
      turnaroundDays: lab.turnaroundDays ?? null,
      servedSpeciesIds: lab.servedSpeciesIds || [],
      servedSpecies: (lab.servedSpeciesIds || []).map((id: string) => ({
        id,
        name: speciesName(id),
      })),
    },
    offerings,
    pricing: pricing ? normalizePricingConfig(pricing) : null,
  };
};
