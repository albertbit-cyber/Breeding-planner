import { prisma } from "../lib/prisma";
import type { AuthenticatedUser } from "../types/auth";
import { HttpError } from "../utils/errors";
import { countedAnimalWhere, isArchivedAnimalStatus, isRemovedAnimalPayload } from "./animalArchive";
import { buildTransferredRecord, freeAppAnimalId, photosOf } from "./marketplaceSaleService";
import { animalCard, asArray, asRecord, cleanText, ymd } from "./networkCards";
import { loadPerson, personLabel, requireOwnHandle, resolveCounterparty, type NetworkPerson } from "./networkIdentityService";
import { appendMessage, assertCanReach, findOrCreateDirectThread, prepareToSend, toTransferSummary } from "./networkThreadService";
import { createNotification } from "./notificationService";
import { canAccessFeature } from "./subscriptionService";
import { lockBreederAccount, mergeEntryList, stampServerEdit } from "./syncMerge";

/**
 * Handing an animal to another breeder.
 *
 * The receiver gets a copy of the record; the sender keeps theirs (owner's decision 2026-10-17).
 * Every transfer carries the reason it happened, and that reason is written onto both animals'
 * cards. The kind decides what happens to the sender's animal:
 *
 *   sale, gift, trade, split  permanent: it moves to the sender's archive, with the receiver as
 *                             the counterparty and the reason as the note.
 *   loan                      temporary: it stays in the collection as "On loan" until the loan
 *                             ends; then the borrower's copy moves to their archive and the
 *                             owner's record takes back the care logs the borrower kept.
 *
 * Nothing happens until the receiver accepts, and the copy is built from an allowlist exactly as
 * a marketplace sale builds it (marketplaceSaleService): notes, prices, groups and pairing links
 * stay behind. Server edits are stamped so a device that has not synced yet cannot set them back.
 */

const db = prisma as any;

export const TRANSFER_KINDS = ["sale", "gift", "trade", "loan"] as const;
export type TransferKind = (typeof TRANSFER_KINDS)[number] | "split";
export const TRANSFER_SOURCE = "serpentora_transfer";

const KIND_LABEL: Record<TransferKind, string> = {
  sale: "Sale",
  gift: "Gift",
  trade: "Trade",
  loan: "Loan",
  split: "Clutch split",
};

/** The archive reason the breeder app knows (features/animals/archive.js), per permanent kind. */
const ARCHIVE_REASON: Record<Exclude<TransferKind, "loan">, string> = {
  sale: "sold",
  gift: "given_away",
  trade: "traded",
  split: "given_away",
};
/** The status that reason writes there (ARCHIVE_STATUS_BY_REASON). */
const ARCHIVE_STATUS: Record<string, string> = { sold: "Sold", given_away: "Archived", traded: "Archived", other: "Archived" };

const OWNERSHIP_TYPE: Record<TransferKind, string> = {
  sale: "sale",
  gift: "gift",
  trade: "trade",
  loan: "loan",
  split: "split",
};

const TRANSFERRED_LOG_KINDS = ["weights", "feeds", "sheds", "meds"];

const LOANED_STATUS = "On loan";

const isTransferKind = (value: unknown): value is (typeof TRANSFER_KINDS)[number] =>
  (TRANSFER_KINDS as readonly string[]).includes(String(value));

const parseDate = (value: unknown): Date | null => {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
};

/** Why an animal cannot be offered right now, or null. */
const unavailableReason = (row: any): string | null => {
  const payload = asRecord(row?.payload);
  if (!row || row.deletedAt) return "That animal is not in your collection.";
  if (isRemovedAnimalPayload(payload) || isArchivedAnimalStatus(payload.status ?? row.status)) {
    return "That animal is in your archive. Only animals in your collection can be transferred.";
  }
  if (String(payload.status ?? row.status ?? "").trim().toLowerCase() === LOANED_STATUS.toLowerCase() && payload.loanedTo) {
    return "That animal is on loan. End the loan before transferring it.";
  }
  if (payload.partnerRecord) return "That is a partner record from a joint project; it belongs to the other breeder.";
  if (asRecord(payload.loan).role === "borrowed") return "You borrowed that animal; it belongs to the breeder who lent it.";
  return null;
};

const findOwnAnimal = async (ownerId: string, appAnimalId: string) =>
  db.animal.findUnique({ where: { ownerId_appAnimalId: { ownerId, appAnimalId } } });

/** The receiver's plan must have room for one more animal, counted the way sync counts. */
const assertRoomForOne = async (tx: any, receiverId: string) => {
  let access: any = null;
  try {
    access = await canAccessFeature({ id: receiverId }, "animals.create");
  } catch (error) {
    if (error instanceof HttpError) throw error;
    return;
  }
  const limit = access?.limit;
  if (limit === undefined || limit === null || !Number.isFinite(Number(limit))) return;
  const live = await tx.animal.count({ where: countedAnimalWhere(receiverId) });
  if (live + 1 > Number(limit)) {
    throw new HttpError(
      403,
      `Your plan keeps ${limit} animals and is full. Archive an animal or upgrade, then accept again.`,
      { code: "animal_limit" },
    );
  }
};

// ── DTOs ────────────────────────────────────────────────────────────────────

const toTransferDto = async (row: any, viewerId: string, people: Map<string, NetworkPerson> = new Map()) => {
  const person = async (id: string) => {
    if (!people.has(id)) {
      const loaded = await loadPerson(id);
      if (loaded) people.set(id, loaded);
    }
    return people.get(id) || null;
  };
  return {
    ...toTransferSummary(row),
    direction: row.senderUserId === viewerId ? "outgoing" : "incoming",
    sender: await person(row.senderUserId),
    receiver: await person(row.receiverUserId),
    threadId: row.threadId,
    senderAppAnimalId: row.senderUserId === viewerId ? row.senderAppAnimalId : null,
  };
};

export const listTransfers = async (actor: AuthenticatedUser) => {
  const rows = await db.animalTransfer.findMany({
    where: { OR: [{ senderUserId: actor.id }, { receiverUserId: actor.id }] },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const people = new Map<string, NetworkPerson>();
  return { transfers: await Promise.all(rows.map((row: any) => toTransferDto(row, actor.id, people))) };
};

export const getTransfer = async (actor: AuthenticatedUser, transferId: string) => {
  const row = await db.animalTransfer.findUnique({ where: { id: transferId } });
  if (!row || (row.senderUserId !== actor.id && row.receiverUserId !== actor.id)) throw new HttpError(404, "Transfer not found.");
  return { transfer: await toTransferDto(row, actor.id) };
};

// ── Offering ────────────────────────────────────────────────────────────────

export type CreateTransferInput = {
  appAnimalId?: unknown;
  handle?: unknown;
  userId?: unknown;
  kind?: unknown;
  reason?: unknown;
  loanUntil?: unknown;
};

/**
 * Offers one of the actor's animals to another breeder. Posted as a card in their direct
 * conversation, so the offer, the answer and the talk around it stay in one place.
 * `options` is how a joint project offers a hatchling of its clutch (kind "split") into its own thread.
 */
export const createTransfer = async (
  actor: AuthenticatedUser,
  input: CreateTransferInput,
  options: { kind?: "split"; projectId?: string; threadId?: string; receiverId?: string } = {},
) => {
  const me = await requireOwnHandle(actor);
  const kind: TransferKind = options.kind || (isTransferKind(input.kind) ? input.kind : (null as any));
  if (!kind) throw new HttpError(400, "Choose sale, gift, trade or loan.");
  const reason = cleanText(input.reason, 1000);
  if (!reason || reason.length < 3) throw new HttpError(400, "Say why the animal is changing hands. The reason goes on its card.");
  const appAnimalId = cleanText(input.appAnimalId, 160);
  if (!appAnimalId) throw new HttpError(400, "Choose the animal.");

  const receiver = options.receiverId
    ? await loadPerson(options.receiverId)
    : await resolveCounterparty(actor, { handle: input.handle, userId: input.userId });
  if (!receiver) throw new HttpError(404, "Breeder not found.");
  if (receiver.id === actor.id) throw new HttpError(400, "That is you.");
  if (!receiver.handle) throw new HttpError(409, "That breeder has not chosen a handle yet, so they cannot receive animals.");
  await assertCanReach(actor.id, receiver.id);

  const animal = await findOwnAnimal(actor.id, appAnimalId);
  const problem = unavailableReason(animal);
  if (problem) throw new HttpError(409, problem);
  const pending = await db.animalTransfer.findFirst({ where: { senderAnimalId: animal.id, status: "pending" } });
  if (pending) throw new HttpError(409, "This animal already has an open transfer offer. Cancel it first.");

  let loanUntil: Date | null = null;
  if (kind === "loan") {
    loanUntil = parseDate(input.loanUntil);
    if (input.loanUntil && !loanUntil) throw new HttpError(400, "The loan end date is not a date.");
    if (loanUntil && loanUntil.getTime() < Date.now() - 86_400_000) throw new HttpError(400, "The loan end date is in the past.");
  }

  const threadId = options.threadId || (await findOrCreateDirectThread(actor.id, receiver.id)).thread.id;
  const thread = await db.networkThread.findUnique({ where: { id: threadId }, include: { participants: true } });
  const card = animalCard(animal);

  const transfer = await db.$transaction(async (tx: any) => {
    await prepareToSend(tx, thread, actor.id);
    const created = await tx.animalTransfer.create({
      data: {
        senderUserId: actor.id,
        receiverUserId: receiver.id,
        senderAnimalId: animal.id,
        senderAppAnimalId: animal.appAnimalId,
        kind,
        reason,
        loanUntil,
        threadId,
        projectId: options.projectId || null,
        snapshot: card,
      },
    });
    const message = await appendMessage(tx, {
      threadId,
      senderUserId: actor.id,
      kind: "transfer",
      body: reason,
      attachment: { transferId: created.id },
    });
    return tx.animalTransfer.update({ where: { id: created.id }, data: { messageId: message.id } });
  });

  await createNotification({
    recipientId: receiver.id,
    actorId: actor.id,
    type: "network_transfer_offer",
    title: kind === "loan" ? `@${me.handle} wants to lend you ${card.name}` : `@${me.handle} wants to transfer ${card.name} to you`,
    message: `${KIND_LABEL[kind]}: ${reason}`.slice(0, 400),
    metadata: { transferId: transfer.id, threadId },
  });
  return { transfer: await toTransferDto(transfer, actor.id) };
};

// ── Accepting ───────────────────────────────────────────────────────────────

/** What a joint project adds to a split hatchling's copy: its parents as the receiver knows them. */
export type SplitPedigree = {
  sireAppId: string | null;
  damAppId: string | null;
  sireName: string | null;
  damName: string | null;
  externalParents: Record<string, unknown>;
  jointProject: Record<string, unknown>;
  lineage: { clutchId: string | null; parents: Array<{ role: string; label: string }> };
  parentRows: Array<{ role: "sire" | "dam"; parentId: string }>;
};

/** Filled in by the joint project service, which knows the project; kept here as a hook to avoid a cycle. */
let splitPedigreeResolver: ((transfer: any, receiverId: string) => Promise<SplitPedigree | null>) | null = null;
export const registerSplitPedigreeResolver = (fn: typeof splitPedigreeResolver) => {
  splitPedigreeResolver = fn;
};

/**
 * The sender's ownership rows before the hand-over. A permanent transfer closes their open row;
 * a loan leaves it open, because lending does not change the owner. An animal that never had a
 * row gets one from its creation, so the chain of custody does not start at the transfer.
 */
const settleSenderHistory = async (
  tx: any,
  animalId: string,
  ownerId: string,
  ownerName: string,
  fromDate: Date,
  now: Date,
  closeOwnership: boolean,
) => {
  const history = await tx.ownershipHistory.findMany({ where: { animalId }, orderBy: { fromDate: "asc" } });
  const open = history.find((row: any) => row.ownerId === ownerId && !row.toDate);
  if (open && closeOwnership) {
    await tx.ownershipHistory.update({ where: { id: open.id }, data: { toDate: now } });
  } else if (!open && !history.some((row: any) => row.ownerId === ownerId)) {
    await tx.ownershipHistory.create({
      data: { animalId, ownerId, ownerName, fromDate, toDate: closeOwnership ? now : null, transferType: "owned" },
    });
  }
  return tx.ownershipHistory.findMany({ where: { animalId }, orderBy: { fromDate: "asc" } });
};

/** The receiver accepts: their copy is created and the sender's animal is archived or put On loan. */
const acceptTransfer = async (actor: AuthenticatedUser, transfer: any) => {
  const sender = await loadPerson(transfer.senderUserId);
  const receiver = await loadPerson(transfer.receiverUserId);
  if (!sender || !receiver) throw new HttpError(404, "Breeder not found.");
  await assertCanReach(actor.id, sender.id);
  const kind = transfer.kind as TransferKind;
  const now = new Date();
  const nowIso = now.toISOString();
  const pedigree = kind === "split" && splitPedigreeResolver ? await splitPedigreeResolver(transfer, receiver.id) : null;

  const result = await db.$transaction(async (tx: any) => {
    await lockBreederAccount(tx, transfer.senderUserId);
    await lockBreederAccount(tx, transfer.receiverUserId);
    const fresh = await tx.animalTransfer.findUnique({ where: { id: transfer.id } });
    if (!fresh || fresh.status !== "pending") throw new HttpError(409, "This transfer was already answered.");
    const animal = await tx.animal.findUnique({ where: { id: transfer.senderAnimalId } });
    const problem = unavailableReason(animal);
    if (problem) throw new HttpError(409, `The animal can no longer be transferred: ${problem}`);
    await assertRoomForOne(tx, receiver.id);

    const senderPayload = asRecord(animal.payload);
    const record = await buildTransferredRecord({ sellerUserId: transfer.senderUserId, genetics: "" }, animal);
    const appAnimalId = await freeAppAnimalId(tx, receiver.id, String(animal.appAnimalId));
    const transferNote = {
      id: transfer.id,
      kind,
      reason: transfer.reason,
      role: "received",
      fromUserId: sender.id,
      fromHandle: sender.handle,
      fromName: sender.displayName,
      fromAnimalId: animal.appAnimalId,
      at: nowIso,
      loanUntil: transfer.loanUntil ? new Date(transfer.loanUntil).toISOString() : null,
    };
    const receiverPayload: Record<string, any> = {
      id: appAnimalId,
      name: cleanText(senderPayload.name, 160) || animal.name || animal.appAnimalId,
      sex: senderPayload.sex || animal.sex || "",
      species: senderPayload.species || animal.species || "",
      morphs: asArray(senderPayload.morphs),
      hets: asArray(senderPayload.hets),
      possibleHets: asArray(senderPayload.possibleHets),
      weight: senderPayload.weight,
      year: senderPayload.year,
      birthDate: senderPayload.birthDate || senderPayload.hatchDate,
      status: kind === "loan" ? LOANED_STATUS : "Active",
      tags: [kind === "loan" ? "Borrowed" : "Acquired"],
      groups: [],
      notes: "",
      photos: photosOf(senderPayload),
      logs: { ...record.logs, cleanings: [] },
      ...(senderPayload.labGeneticsConfirmation ? { labGeneticsConfirmation: senderPayload.labGeneticsConfirmation } : {}),
      transfer: transferNote,
      acquiredFrom: {
        source: TRANSFER_SOURCE,
        transferId: transfer.id,
        kind,
        reason: transfer.reason,
        sellerUserId: sender.id,
        sellerName: personLabel(sender),
        sellerAnimalId: animal.appAnimalId,
        acquiredAt: nowIso,
        recordSnapshotAt: nowIso,
      },
      geneticClaims: record.geneticClaims,
      certificates: record.certificates,
      lineage: pedigree?.lineage || record.lineage,
      ...(kind === "loan"
        ? { loan: { role: "borrowed", transferId: transfer.id, ownerUserId: sender.id, ownerHandle: sender.handle, ownerName: sender.displayName, since: nowIso, until: transferNote.loanUntil, reason: transfer.reason } }
        : {}),
      ...(pedigree
        ? {
            sireId: pedigree.sireAppId || "",
            damId: pedigree.damAppId || "",
            sireName: pedigree.sireName || "",
            damName: pedigree.damName || "",
            externalParents: pedigree.externalParents,
            jointProject: pedigree.jointProject,
          }
        : {}),
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    const primary = receiverPayload.photos.length ? receiverPayload.photos[receiverPayload.photos.length - 1].url : undefined;
    if (primary) receiverPayload.imageUrl = primary;

    const created = await tx.animal.create({
      data: {
        ownerId: receiver.id,
        appAnimalId,
        name: receiverPayload.name,
        sex: cleanText(receiverPayload.sex, 40),
        species: cleanText(receiverPayload.species, 120),
        status: receiverPayload.status,
        payload: receiverPayload,
      },
    });

    // The sender's animal: archived for a permanent transfer, On loan for a loan.
    const senderEdits: Record<string, any> = {};
    let stamped: string[];
    if (kind === "loan") {
      senderEdits.status = LOANED_STATUS;
      senderEdits.loanedTo = {
        transferId: transfer.id,
        toUserId: receiver.id,
        toHandle: receiver.handle,
        toName: receiver.displayName,
        since: nowIso,
        until: transferNote.loanUntil,
        reason: transfer.reason,
        previousStatus: cleanText(senderPayload.status ?? animal.status, 60) || "Active",
      };
      stamped = ["status", "loanedTo"];
    } else {
      const archiveReason = ARCHIVE_REASON[kind];
      senderEdits.status = ARCHIVE_STATUS[archiveReason];
      senderEdits.archive = {
        reason: archiveReason,
        date: ymd(now),
        archivedAt: nowIso,
        updatedAt: nowIso,
        counterpartyName: personLabel(receiver),
        counterpartyContact: "",
        note: `Transferred on Serpentora (${KIND_LABEL[kind]}): ${transfer.reason}`,
        notes: [],
        transferId: transfer.id,
        closedPairingIds: [],
        closedCycleIds: [],
      };
      senderEdits.forSale = false;
      senderEdits.isForSale = false;
      senderEdits.transferredTo = {
        transferId: transfer.id,
        kind,
        toUserId: receiver.id,
        toHandle: receiver.handle,
        toName: receiver.displayName,
        at: nowIso,
        reason: transfer.reason,
        receiverAnimalId: appAnimalId,
      };
      stamped = ["status", "archive", "forSale", "isForSale", "transferredTo"];
    }
    await tx.animal.update({
      where: { id: animal.id },
      data: {
        status: senderEdits.status,
        payload: stampServerEdit({ ...senderPayload, ...senderEdits }, stamped, nowIso, animal.updatedAt),
      },
    });

    // The chain of custody. A loan does not change the owner, so it adds a keeper row instead.
    const history = await settleSenderHistory(tx, animal.id, sender.id, personLabel(sender), animal.createdAt || now, now, kind !== "loan");
    await tx.ownershipHistory.create({
      data: {
        animalId: animal.id,
        ownerId: receiver.id,
        ownerName: personLabel(receiver),
        fromDate: now,
        transferType: OWNERSHIP_TYPE[kind],
        notes: `${KIND_LABEL[kind]} on Serpentora (transfer ${transfer.id}): ${transfer.reason}`,
      },
    });
    for (const row of history) {
      await tx.ownershipHistory.create({
        data: {
          animalId: created.id,
          ownerId: row.ownerId,
          ownerName: row.ownerName,
          fromDate: row.fromDate,
          // On a loan the owner's row stays open on the copy too: they still own it.
          toDate: row.toDate || (kind === "loan" ? null : now),
          transferType: row.transferType,
          notes: row.notes,
        },
      });
    }
    await tx.ownershipHistory.create({
      data: {
        animalId: created.id,
        ownerId: receiver.id,
        ownerName: personLabel(receiver),
        fromDate: now,
        transferType: OWNERSHIP_TYPE[kind],
        notes: `${kind === "loan" ? "Borrowed from" : "Received from"} ${personLabel(sender)}: ${transfer.reason}`,
      },
    });

    // A split hatchling's parents are the two breeders' own animals, in both accounts.
    for (const parent of pedigree?.parentRows || []) {
      await tx.parentRelationship.upsert({
        where: { childId_role: { childId: created.id, role: parent.role } },
        create: { childId: created.id, parentId: parent.parentId, role: parent.role, createdById: actor.id },
        update: { parentId: parent.parentId },
      });
    }

    const updated = await tx.animalTransfer.update({
      where: { id: transfer.id },
      data: { status: "accepted", receiverAnimalId: created.id, respondedAt: now },
    });
    if (transfer.threadId) {
      await appendMessage(tx, {
        threadId: transfer.threadId,
        senderUserId: null,
        kind: "system",
        body:
          kind === "loan"
            ? `${receiver.displayName} accepted the loan of ${receiverPayload.name}. It is On loan in both collections until the loan ends.`
            : `${receiver.displayName} accepted ${receiverPayload.name}. It is now in their collection, and in ${sender.displayName}'s archive.`,
        attachment: { transferId: transfer.id },
      });
    }
    return { updated, created };
  });

  await createNotification({
    recipientId: sender.id,
    actorId: receiver.id,
    type: "network_transfer_accepted",
    title: `@${receiver.handle} accepted ${transfer.snapshot?.name || "the animal"}`,
    message: kind === "loan" ? "The loan has started." : "The animal is in their collection now, and in your archive.",
    metadata: { transferId: transfer.id, threadId: transfer.threadId },
  });
  return { transfer: await toTransferDto(result.updated, actor.id), receivedAppAnimalId: result.created.appAnimalId };
};

/** accept | decline (receiver), cancel (sender, while pending). */
export const respondToTransfer = async (actor: AuthenticatedUser, transferId: string, actionRaw: unknown) => {
  const action = String(actionRaw || "");
  const transfer = await db.animalTransfer.findUnique({ where: { id: transferId } });
  if (!transfer || (transfer.senderUserId !== actor.id && transfer.receiverUserId !== actor.id)) {
    throw new HttpError(404, "Transfer not found.");
  }
  if (transfer.status !== "pending") throw new HttpError(409, "This transfer was already answered.");

  if (action === "accept") {
    if (transfer.receiverUserId !== actor.id) throw new HttpError(403, "Only the receiver can accept.");
    await requireOwnHandle(actor);
    return acceptTransfer(actor, transfer);
  }
  if (action === "decline" || action === "cancel") {
    if (action === "decline" && transfer.receiverUserId !== actor.id) throw new HttpError(403, "Only the receiver can decline.");
    if (action === "cancel" && transfer.senderUserId !== actor.id) throw new HttpError(403, "Only the sender can cancel.");
    const status = action === "decline" ? "declined" : "cancelled";
    const updated = await db.$transaction(async (tx: any) => {
      const row = await tx.animalTransfer.update({ where: { id: transfer.id }, data: { status, respondedAt: new Date() } });
      if (transfer.threadId) {
        const who = await loadPerson(actor.id);
        await appendMessage(tx, {
          threadId: transfer.threadId,
          senderUserId: null,
          kind: "system",
          body: `${who?.displayName || "They"} ${status} the transfer of ${transfer.snapshot?.name || "the animal"}.`,
          attachment: { transferId: transfer.id },
        });
      }
      return row;
    });
    const otherId = actor.id === transfer.senderUserId ? transfer.receiverUserId : transfer.senderUserId;
    await createNotification({
      recipientId: otherId,
      actorId: actor.id,
      type: `network_transfer_${status}`,
      title: `Transfer ${status}`,
      message: `${transfer.snapshot?.name || "The animal"}: the transfer was ${status}.`,
      metadata: { transferId: transfer.id, threadId: transfer.threadId },
    });
    return { transfer: await toTransferDto(updated, actor.id) };
  }
  throw new HttpError(400, "action must be accept, decline or cancel.");
};

// ── Ending a loan ───────────────────────────────────────────────────────────

/**
 * Ends an accepted loan; either side may. The borrower's copy moves to their archive. The owner's
 * animal returns to the status it had and takes back the care logs the borrower kept meanwhile.
 */
export const returnLoan = async (actor: AuthenticatedUser, transferId: string, input: { note?: unknown } = {}) => {
  const transfer = await db.animalTransfer.findUnique({ where: { id: transferId } });
  if (!transfer || (transfer.senderUserId !== actor.id && transfer.receiverUserId !== actor.id)) {
    throw new HttpError(404, "Transfer not found.");
  }
  if (transfer.kind !== "loan") throw new HttpError(400, "Only a loan can be returned.");
  if (transfer.status !== "accepted") throw new HttpError(409, "This loan is not running.");
  const owner = await loadPerson(transfer.senderUserId);
  const borrower = await loadPerson(transfer.receiverUserId);
  if (!owner || !borrower) throw new HttpError(404, "Breeder not found.");
  const note = cleanText(input.note, 1000);
  const now = new Date();
  const nowIso = now.toISOString();

  const updated = await db.$transaction(async (tx: any) => {
    await lockBreederAccount(tx, owner.id);
    await lockBreederAccount(tx, borrower.id);
    const ownerAnimal = await tx.animal.findUnique({ where: { id: transfer.senderAnimalId } });
    const borrowed = transfer.receiverAnimalId ? await tx.animal.findUnique({ where: { id: transfer.receiverAnimalId } }) : null;
    const borrowedPayload = asRecord(borrowed?.payload);
    const since = parseDate(asRecord(borrowedPayload.loan).since) || transfer.respondedAt || transfer.createdAt;

    if (borrowed && !borrowed.deletedAt) {
      await tx.animal.update({
        where: { id: borrowed.id },
        data: {
          status: "Archived",
          payload: stampServerEdit(
            {
              ...borrowedPayload,
              status: "Archived",
              loan: { ...asRecord(borrowedPayload.loan), returnedAt: nowIso },
              archive: {
                reason: "other",
                date: ymd(now),
                archivedAt: nowIso,
                updatedAt: nowIso,
                counterpartyName: personLabel(owner),
                counterpartyContact: "",
                note: `Loan ended: returned to ${personLabel(owner)}.${note ? ` ${note}` : ""}`,
                notes: [],
                transferId: transfer.id,
                closedPairingIds: [],
                closedCycleIds: [],
              },
            },
            ["status", "loan", "archive"],
            nowIso,
            borrowed.updatedAt,
          ),
        },
      });
    }

    if (ownerAnimal && !ownerAnimal.deletedAt) {
      const ownerPayload = asRecord(ownerAnimal.payload);
      const loanedTo = asRecord(ownerPayload.loanedTo);
      const ownerLogs = asRecord(ownerPayload.logs);
      const borrowedLogs = asRecord(borrowedPayload.logs);
      const logs: Record<string, any> = { ...ownerLogs };
      // What the borrower logged while they kept it comes home with it; older entries are the copy's own.
      TRANSFERRED_LOG_KINDS.forEach((kind) => {
        const kept = asArray(borrowedLogs[kind]).filter((entry: any) => {
          const when = parseDate(entry?.date || entry?.createdAt || entry?.at);
          return when ? when.getTime() >= new Date(since).getTime() - 86_400_000 : false;
        });
        if (kept.length) logs[kind] = mergeEntryList(ownerLogs[kind], kept, kind);
      });
      const previousStatus = cleanText(loanedTo.previousStatus, 60) || "Active";
      await tx.animal.update({
        where: { id: ownerAnimal.id },
        data: {
          status: previousStatus,
          payload: stampServerEdit(
            {
              ...ownerPayload,
              status: previousStatus,
              loanedTo: null,
              loanHistory: [...asArray(ownerPayload.loanHistory), { ...loanedTo, transferId: transfer.id, returnedAt: nowIso, note }],
              logs,
            },
            ["status", "loanedTo", "loanHistory"],
            nowIso,
            ownerAnimal.updatedAt,
          ),
        },
      });
      const keeperRow = await tx.ownershipHistory.findFirst({
        where: { animalId: ownerAnimal.id, ownerId: borrower.id, toDate: null },
      });
      if (keeperRow) await tx.ownershipHistory.update({ where: { id: keeperRow.id }, data: { toDate: now } });
    }

    const row = await tx.animalTransfer.update({ where: { id: transfer.id }, data: { status: "returned", returnedAt: now } });
    if (transfer.threadId) {
      const who = actor.id === owner.id ? owner : borrower;
      await appendMessage(tx, {
        threadId: transfer.threadId,
        senderUserId: null,
        kind: "system",
        body: `${who.displayName} ended the loan of ${transfer.snapshot?.name || "the animal"}. It is back with ${owner.displayName}.${note ? ` ${note}` : ""}`,
        attachment: { transferId: transfer.id },
      });
    }
    return row;
  });

  await createNotification({
    recipientId: actor.id === owner.id ? borrower.id : owner.id,
    actorId: actor.id,
    type: "network_loan_returned",
    title: "Loan ended",
    message: `${transfer.snapshot?.name || "The animal"} is back with ${owner.displayName}.`,
    metadata: { transferId: transfer.id, threadId: transfer.threadId },
  });
  return { transfer: await toTransferDto(updated, actor.id) };
};

