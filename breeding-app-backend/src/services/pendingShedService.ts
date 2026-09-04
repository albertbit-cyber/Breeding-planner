import { prisma } from "../lib/prisma";
import { HttpError } from "../utils/errors";
import { calculateOrderBreakdown, splitAnimalTestPrices } from "./pricingService";
import {
  createOrder,
  requireLabOrganizationId,
  resolveLabPricingContext,
} from "./orderService";

/**
 * The queue of shed tests a breeder has saved but not yet ordered.
 *
 * Sheds arrive one animal at a time across a season, so this is the thing a keeper builds up
 * between orders: save a test now, add to it over weeks, submit the lot when the box is ready.
 * It is server-side because it is accumulated over months -- in the browser a cleared cache
 * would silently discard a season's collecting, and it would never follow the keeper from
 * their phone to their desk.
 */

const db = prisma as any;

const PRIORITIES = new Set(["routine", "priority", "urgent"]);
const SAMPLE_TYPES = new Set(["shed", "bellyScaleClip"]);

const text = (value: unknown): string => String(value ?? "").trim();

const optionalText = (value: unknown): string | null => text(value) || null;

const uniqueIds = (value: unknown): string[] => {
  const list = Array.isArray(value) ? value : [];
  return Array.from(new Set(list.map((entry) => text(entry)).filter(Boolean)));
};

const toCents = (units: number): number => Math.round(units * 100);

export type PendingShedTestRow = {
  id: string;
  breederId: string;
  labOrganizationId: string;
  animalId: string;
  animalDisplayId: string | null;
  animalName: string | null;
  selectedTestIds: string[];
  priority: string;
  sampleType: string;
  notes: string | null;
  selected: boolean;
  createdAt: Date;
  updatedAt: Date;
};

/** The shape the shed terminal already expects, so the panel needs no reshaping of its own. */
const toPublicItem = (row: PendingShedTestRow) => ({
  id: row.id,
  breederUserId: row.breederId,
  labId: row.labOrganizationId,
  snakeId: row.animalId,
  snakeDisplayId: row.animalDisplayId ?? undefined,
  snakeName: row.animalName ?? undefined,
  selectedTestIds: row.selectedTestIds,
  priority: row.priority,
  sampleType: row.sampleType,
  notes: row.notes ?? undefined,
  selected: row.selected,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

export const listPendingShedTests = async (breederId: string) => {
  const rows: PendingShedTestRow[] = await db.pendingShedTest.findMany({
    where: { breederId },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(toPublicItem);
};

export const addPendingShedTest = async (
  breederId: string,
  input: Record<string, unknown>
) => {
  const labOrganizationId = requireLabOrganizationId(input.labId ?? input.labOrganizationId);
  const animalId = text(input.snakeId ?? input.animalId);
  if (!animalId) throw new HttpError(400, "An animal is required to save a shed test.");

  const selectedTestIds = uniqueIds(input.selectedTestIds);
  if (!selectedTestIds.length) {
    throw new HttpError(400, "Select at least one test before saving.");
  }

  const priority = text(input.priority) || "routine";
  if (!PRIORITIES.has(priority)) throw new HttpError(400, "Unknown priority.");
  const sampleType = text(input.sampleType) || "shed";
  if (!SAMPLE_TYPES.has(sampleType)) throw new HttpError(400, "Unknown sample type.");

  // Saving is the point at which the lab is still reachable and the tests still exist, so it is
  // the honest place to say so -- rather than letting a keeper bank a draft for a season and
  // discover at submit time that the lab never offered the test.
  const { offerings } = await resolveLabPricingContext(labOrganizationId);
  assertOfferingsExist(selectedTestIds, offerings);

  const row: PendingShedTestRow = await db.pendingShedTest.create({
    data: {
      breederId,
      labOrganizationId,
      animalId,
      animalDisplayId: optionalText(input.snakeDisplayId ?? input.animalDisplayId),
      animalName: optionalText(input.snakeName ?? input.animalName),
      selectedTestIds,
      priority,
      sampleType,
      notes: optionalText(input.notes),
      selected: input.selected === undefined ? true : Boolean(input.selected),
    },
  });
  return toPublicItem(row);
};

/** Scoped by breederId on every read, so one keeper can never reach another's queue by id. */
const requireOwnedItem = async (breederId: string, id: string): Promise<PendingShedTestRow> => {
  const row: PendingShedTestRow | null = await db.pendingShedTest.findFirst({
    where: { id: text(id), breederId },
  });
  if (!row) throw new HttpError(404, "That saved shed test no longer exists.");
  return row;
};

export const updatePendingShedTest = async (
  breederId: string,
  id: string,
  patch: Record<string, unknown>
) => {
  const existing = await requireOwnedItem(breederId, id);
  const data: Record<string, unknown> = {};

  if (patch.selectedTestIds !== undefined) {
    const selectedTestIds = uniqueIds(patch.selectedTestIds);
    if (!selectedTestIds.length) {
      throw new HttpError(400, "Select at least one test before saving.");
    }
    const { offerings } = await resolveLabPricingContext(existing.labOrganizationId);
    assertOfferingsExist(selectedTestIds, offerings);
    data.selectedTestIds = selectedTestIds;
  }
  if (patch.priority !== undefined) {
    const priority = text(patch.priority);
    if (!PRIORITIES.has(priority)) throw new HttpError(400, "Unknown priority.");
    data.priority = priority;
  }
  if (patch.sampleType !== undefined) {
    const sampleType = text(patch.sampleType);
    if (!SAMPLE_TYPES.has(sampleType)) throw new HttpError(400, "Unknown sample type.");
    data.sampleType = sampleType;
  }
  if (patch.notes !== undefined) data.notes = optionalText(patch.notes);
  if (patch.selected !== undefined) data.selected = Boolean(patch.selected);
  if (patch.snakeName !== undefined) data.animalName = optionalText(patch.snakeName);

  if (!Object.keys(data).length) return toPublicItem(existing);

  const row: PendingShedTestRow = await db.pendingShedTest.update({ where: { id: existing.id }, data });
  return toPublicItem(row);
};

export const removePendingShedTest = async (breederId: string, id: string): Promise<void> => {
  const existing = await requireOwnedItem(breederId, id);
  await db.pendingShedTest.delete({ where: { id: existing.id } });
};

const assertOfferingsExist = (
  selectedTestIds: string[],
  offerings: Array<{ id: string; name?: string }>
): void => {
  const available = new Set(offerings.map((entry) => entry.id));
  const missing = selectedTestIds.filter((id) => !available.has(id));
  if (missing.length) {
    throw new HttpError(
      409,
      `That laboratory no longer offers ${missing.length === 1 ? "one of the saved tests" : `${missing.length} of the saved tests`}. Edit the saved test and choose again.`
    );
  }
};

/**
 * The rows a submission or quote will act on: those the keeper ticked, or an explicit subset.
 *
 * A batch goes to one laboratory. A queue holding drafts for two labs is legitimate -- the
 * keeper may use both -- so this refuses the ambiguous case rather than silently sending one
 * lab's samples to the other.
 */
const selectQueueRows = async (
  breederId: string,
  pendingItemIds?: string[]
): Promise<PendingShedTestRow[]> => {
  const requested = uniqueIds(pendingItemIds);
  const rows: PendingShedTestRow[] = await db.pendingShedTest.findMany({
    where: requested.length ? { breederId, id: { in: requested } } : { breederId, selected: true },
    orderBy: { createdAt: "asc" },
  });

  if (requested.length && rows.length !== requested.length) {
    throw new HttpError(404, "Some of those saved shed tests no longer exist.");
  }
  if (!rows.length) {
    throw new HttpError(400, "Select at least one saved shed test.");
  }

  const labIds = new Set(rows.map((row) => row.labOrganizationId));
  if (labIds.size > 1) {
    throw new HttpError(
      400,
      "Those saved tests are for different laboratories. Submit one laboratory's tests at a time."
    );
  }
  return rows;
};

const toAnimalInputs = (rows: PendingShedTestRow[]) =>
  rows.map((row) => ({
    animalId: row.animalId,
    animalName: row.animalName ?? undefined,
    selectedTestIds: row.selectedTestIds,
  }));

export const quotePendingShedTests = async (breederId: string, pendingItemIds?: string[]) => {
  // An empty queue is a normal state for a keeper between seasons, not an error to show them.
  const rows: PendingShedTestRow[] = await db.pendingShedTest.findMany({
    where: uniqueIds(pendingItemIds).length
      ? { breederId, id: { in: uniqueIds(pendingItemIds) } }
      : { breederId, selected: true },
    orderBy: { createdAt: "asc" },
  });
  if (!rows.length) {
    return { items: [], subtotalCents: 0, totalCents: 0, currency: "EUR" };
  }

  const labIds = new Set(rows.map((row) => row.labOrganizationId));
  if (labIds.size > 1) {
    throw new HttpError(
      400,
      "Those saved tests are for different laboratories. Submit one laboratory's tests at a time."
    );
  }

  const { offerings, pricing } = await resolveLabPricingContext(rows[0].labOrganizationId);
  const breakdown = calculateOrderBreakdown(toAnimalInputs(rows), offerings, pricing);

  // Priced as one order, because that is what it will be: the tier a keeper reaches depends on
  // how many animals go in the box, so quoting each row alone would overstate the price.
  const items = breakdown.perAnimal.map((row, index) => {
    const source = rows[index];
    const tests = splitAnimalTestPrices(row).map(({ test, priceApplied }) => ({
      id: test.id,
      name: test.name,
      priceCents: toCents(priceApplied),
      currency: breakdown.currency,
    }));
    return {
      pendingItemId: source?.id ?? "",
      snakeId: source?.animalId ?? row.animalId,
      tests,
      itemTotalCents: toCents(row.total),
      currency: breakdown.currency,
      priority: source?.priority ?? "routine",
    };
  });

  const totalCents = toCents(breakdown.total);
  return {
    items,
    subtotalCents: totalCents,
    totalCents,
    currency: breakdown.currency,
  };
};

/**
 * Turns the saved queue into a real order, then clears the rows it consumed.
 *
 * The order is the durable record. Keeping the drafts afterwards would leave two answers to
 * "what did I send?", and the next submission would offer to send them again.
 */
export const submitPendingShedBatch = async (breederId: string, pendingItemIds?: string[]) => {
  const rows = await selectQueueRows(breederId, pendingItemIds);
  const labOrganizationId = rows[0].labOrganizationId;

  const order = await createOrder(breederId, toAnimalInputs(rows), labOrganizationId);

  // After the order, never inside it. createOrder owns its own transaction, and a draft deleted
  // in a transaction that later rolled back would take the keeper's saved work with it.
  await db.pendingShedTest.deleteMany({
    where: { breederId, id: { in: rows.map((row) => row.id) } },
  });

  const submittedAt = new Date().toISOString();
  return {
    batch: {
      id: (order as any)?.id ?? "",
      breederUserId: breederId,
      labId: labOrganizationId,
      pendingItemIds: rows.map((row) => row.id),
      orderIds: [(order as any)?.id ?? ""],
      itemCount: rows.length,
      totalCents: toCents(Number((order as any)?.totalPrice ?? 0)),
      currency: String((order as any)?.currency || "EUR"),
      submittedAt,
      createdAt: submittedAt,
      updatedAt: submittedAt,
    },
    order,
  };
};
