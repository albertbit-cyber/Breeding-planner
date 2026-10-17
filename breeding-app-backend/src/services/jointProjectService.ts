import { prisma } from "../lib/prisma";
import type { AuthenticatedUser } from "../types/auth";
import { HttpError } from "../utils/errors";
import { isArchivedAnimalStatus, isRemovedAnimalPayload, PARTNER_ANIMAL_STATUS } from "./animalArchive";
import { createTransfer, registerSplitPedigreeResolver, type SplitPedigree } from "./animalTransferService";
import { buildTransferredRecord, freeAppAnimalId, photosOf } from "./marketplaceSaleService";
import { animalCard, asArray, asRecord, cleanText, sexOf, ymd } from "./networkCards";
import { loadPerson, personLabel, requireOwnHandle, resolveCounterparty, type NetworkPerson } from "./networkIdentityService";
import { appendMessage, assertCanReach, createProjectThread, PARTICIPANT_STATUS, toTransferSummary } from "./networkThreadService";
import { createNotification } from "./notificationService";
import { lockBreederAccount, stampServerEdit } from "./syncMerge";

/**
 * A joint project: two breeders, one pairing.
 *
 * One brings the male, the other the female. Whoever keeps the female through her cycle
 * incubates the eggs (owner's rule, 2026-10-17), so the female's owner is the keeper. When the
 * invited breeder accepts and names their animal, the keeper's account receives a read-only
 * partner record of the male. The keeper pairs the two on an ordinary breeding card -- nothing
 * about the card changes -- and both breeders follow it from the project.
 *
 * The split is agreed in the project thread: either side proposes terms, the other accepts or
 * answers with their own. Once the eggs hatch the keeper sends the partner their share; each
 * hatchling is an ordinary transfer of kind "split", so the partner accepts it like any other.
 * Closing the project writes both parents onto every hatchling in both accounts and archives the
 * partner record, which stays behind as a lineage card.
 */

const db = prisma as any;

export const SPLIT_METHODS = ["alternate_picks", "percentage", "fixed_count", "custom"] as const;
type SplitMethod = (typeof SPLIT_METHODS)[number];

const OPEN_STATUSES = ["proposed", "active"];

const isParticipant = (project: any, userId: string) =>
  project && (project.proposedById === userId || project.invitedUserId === userId);

const loadProjectFor = async (actor: AuthenticatedUser, projectId: string) => {
  const project = await db.jointProject.findUnique({ where: { id: projectId } });
  if (!project || !isParticipant(project, actor.id)) throw new HttpError(404, "Project not found.");
  return project;
};

const otherSideOf = (project: any, userId: string) =>
  project.proposedById === userId ? project.invitedUserId : project.proposedById;

/** An animal of the actor's that can join a project: in the collection, theirs, sexed. */
const ownBreedingAnimal = async (ownerId: string, appAnimalIdRaw: unknown) => {
  const appAnimalId = cleanText(appAnimalIdRaw, 160);
  if (!appAnimalId) throw new HttpError(400, "Choose the animal you bring.");
  const row = await db.animal.findUnique({ where: { ownerId_appAnimalId: { ownerId, appAnimalId } } });
  const payload = asRecord(row?.payload);
  if (!row || row.deletedAt) throw new HttpError(404, "That animal is not in your collection.");
  if (isRemovedAnimalPayload(payload) || isArchivedAnimalStatus(payload.status ?? row.status)) {
    throw new HttpError(409, "That animal is in your archive.");
  }
  if (payload.partnerRecord || asRecord(payload.loan).role === "borrowed") {
    throw new HttpError(409, "That animal belongs to another breeder.");
  }
  const sex = sexOf(payload.sex ?? row.sex);
  if (sex === "U") throw new HttpError(409, "Set the animal's sex first: a project needs a male and a female.");
  return { row, sex };
};

// ── Terms ───────────────────────────────────────────────────────────────────

export type SplitTerms = {
  method: SplitMethod;
  /** Who picks first, for alternate picks. */
  firstPick: "male_owner" | "female_owner" | null;
  /** The male owner's share: a percentage, or a number of hatchlings. */
  maleOwnerShare: number | null;
  note: string | null;
};

export const normalizeSplitTerms = (raw: unknown): SplitTerms => {
  const input = asRecord(raw);
  const method = String(input.method || "") as SplitMethod;
  if (!(SPLIT_METHODS as readonly string[]).includes(method)) {
    throw new HttpError(400, "Choose how the clutch is split: alternate picks, a percentage, a number of hatchlings, or your own terms.");
  }
  const note = cleanText(input.note, 2000);
  const share = input.maleOwnerShare === undefined || input.maleOwnerShare === null || input.maleOwnerShare === ""
    ? null
    : Number(input.maleOwnerShare);
  if (method === "percentage" && (share === null || !Number.isFinite(share) || share < 0 || share > 100)) {
    throw new HttpError(400, "The male owner's share is a percentage from 0 to 100.");
  }
  if (method === "fixed_count" && (share === null || !Number.isInteger(share) || share < 0 || share > 200)) {
    throw new HttpError(400, "The male owner's share is a whole number of hatchlings.");
  }
  if (method === "custom" && !note) throw new HttpError(400, "Write the terms out.");
  const firstPick = input.firstPick === "male_owner" || input.firstPick === "female_owner" ? input.firstPick : null;
  if (method === "alternate_picks" && !firstPick) throw new HttpError(400, "Say who picks first.");
  return {
    method,
    firstPick: method === "alternate_picks" ? firstPick : null,
    maleOwnerShare: method === "percentage" || method === "fixed_count" ? share : null,
    note,
  };
};

/** The terms in one sentence, for messages and the hatchlings' records. */
export const describeTerms = (terms: SplitTerms, maleOwner: string, femaleOwner: string): string => {
  const extra = terms.note ? ` ${terms.note}` : "";
  switch (terms.method) {
    case "alternate_picks":
      return `Alternate picks, ${terms.firstPick === "male_owner" ? maleOwner : femaleOwner} first.${extra}`;
    case "percentage":
      return `${maleOwner} ${terms.maleOwnerShare}%, ${femaleOwner} ${100 - Number(terms.maleOwnerShare)}%.${extra}`;
    case "fixed_count":
      return `${maleOwner} receives ${terms.maleOwnerShare} hatchling${terms.maleOwnerShare === 1 ? "" : "s"}, ${femaleOwner} keeps the rest.${extra}`;
    default:
      return terms.note || "Own terms.";
  }
};

// ── The keeper's breeding card, read for both sides ─────────────────────────

const recordedEventDate = (cycle: any, type: string): string | null => {
  const event = asArray(cycle?.events).find((e: any) => e?.type === type && e?.certainty !== "suspected" && e?.date);
  return event ? String(event.date).slice(0, 10) : null;
};

const stageOf = (cycle: any, status: string): string => {
  const clutch = asRecord(cycle?.clutch);
  const outcome = asRecord(cycle?.closure).outcome;
  if (status === "closed" && outcome && outcome !== "hatching_complete") return "closed_without_offspring";
  if (outcome === "hatching_complete" || clutch.outcomeComplete || recordedEventDate(cycle, "hatching_complete")) return "complete";
  if (recordedEventDate(cycle, "first_hatch") || Number(clutch.hatchlingsRecorded || 0) > 0) return "hatching";
  if (recordedEventDate(cycle, "egg_laying")) return "incubating";
  if (recordedEventDate(cycle, "pre_lay_shed")) return "pre_lay_shed";
  if (recordedEventDate(cycle, "ovulation")) return "ovulated";
  const locks = asArray(cycle?.sessions).flatMap((s: any) => asArray(s?.locks)).filter((l: any) => l?.status === "observed");
  if (locks.length) return "locks_observed";
  if (asArray(cycle?.sessions).length) return "pairing";
  return "pre_pairing";
};

const femaleAppIdOf = async (project: any): Promise<string | null> => {
  if (!project.femaleAnimalId) return null;
  const row = await db.animal.findUnique({ where: { id: project.femaleAnimalId }, select: { appAnimalId: true } });
  return row?.appAnimalId || asRecord(project.femaleSnapshot).appAnimalId || null;
};

/** The keeper's breeding card for this pairing: the newest card of the female with the partner male on it. */
const findProjectCycle = async (project: any) => {
  if (!project.femaleOwnerId || !project.partnerMaleAppId) return null;
  const femaleAppId = await femaleAppIdOf(project);
  if (!femaleAppId) return null;
  const cycles = await db.breedingCycle.findMany({
    where: { ownerId: project.femaleOwnerId, femaleAnimalAppId: femaleAppId, deletedAt: null },
    orderBy: { createdAt: "desc" },
  });
  return (
    cycles.find((row: any) => asArray(asRecord(row.payload).males).some((m: any) => m?.maleId === project.partnerMaleAppId)) || null
  );
};

const progressOf = (row: any) => {
  if (!row) return null;
  const cycle = asRecord(row.payload);
  const status = String(row.status || cycle.status || "active");
  const sessions = asArray(cycle.sessions);
  const locks = sessions.flatMap((s: any) => asArray(s?.locks)).filter((l: any) => l?.status === "observed");
  const lockDates = locks.map((l: any) => String(l?.observationDate || l?.date || "").slice(0, 10)).filter(Boolean).sort();
  const clutch = asRecord(cycle.clutch);
  return {
    cardId: row.appCycleId,
    status,
    stage: stageOf(cycle, status),
    seasonLabel: row.seasonLabel || cycle.seasonLabel || null,
    startDate: row.startDate || cycle.startDate || null,
    sessions: sessions.length,
    locks: locks.length,
    lastLockDate: lockDates.length ? lockDates[lockDates.length - 1] : null,
    ovulationDate: recordedEventDate(cycle, "ovulation"),
    preLayShedDate: recordedEventDate(cycle, "pre_lay_shed"),
    eggLayingDate: recordedEventDate(cycle, "egg_laying"),
    eggsTotal: clutch.eggsTotal ?? null,
    fertileEggs: clutch.fertileEggs ?? null,
    slugs: clutch.slugs ?? null,
    hatchlingsRecorded: clutch.hatchlingsRecorded ?? null,
    firstHatchDate: clutch.firstHatchDate || recordedEventDate(cycle, "first_hatch"),
    finalHatchDate: clutch.finalHatchDate || null,
    offspringAppIds: asArray(cycle.offspring).map((o: any) => cleanText(o?.animalId, 160)).filter(Boolean) as string[],
  };
};

// ── DTO ─────────────────────────────────────────────────────────────────────

const toProjectDto = async (project: any, viewerId: string) => {
  const people = new Map<string, NetworkPerson | null>();
  const person = async (id: string | null) => {
    if (!id) return null;
    if (!people.has(id)) people.set(id, await loadPerson(id));
    return people.get(id) || null;
  };
  const cycle = project.status === "proposed" ? null : await findProjectCycle(project);
  const progress = progressOf(cycle);
  const transfers = await db.animalTransfer.findMany({ where: { projectId: project.id }, orderBy: { createdAt: "asc" } });
  const shareByApp = new Map<string, any>();
  transfers.forEach((row: any) => {
    if (["pending", "accepted"].includes(row.status)) shareByApp.set(row.senderAppAnimalId, row);
  });
  const hatchlingRows = progress?.offspringAppIds.length
    ? await db.animal.findMany({ where: { ownerId: project.femaleOwnerId, appAnimalId: { in: progress.offspringAppIds } } })
    : [];
  const proposals = await db.jointProjectSplitProposal.findMany({ where: { projectId: project.id }, orderBy: { createdAt: "desc" } });
  return {
    id: project.id,
    threadId: project.threadId,
    title: project.title,
    note: project.note,
    status: project.status,
    proposedBy: await person(project.proposedById),
    invited: await person(project.invitedUserId),
    viewerRole:
      project.femaleOwnerId === viewerId ? "keeper" : project.maleOwnerId === viewerId ? "male_owner" : project.proposedById === viewerId ? "proposer" : "invited",
    male: { owner: await person(project.maleOwnerId), animal: project.maleSnapshot || null },
    female: { owner: await person(project.femaleOwnerId), animal: project.femaleSnapshot || null },
    keeper: await person(project.femaleOwnerId),
    partnerMaleAppId: project.femaleOwnerId === viewerId ? project.partnerMaleAppId : null,
    splitTerms: project.splitTerms || null,
    splitAgreedAt: project.splitAgreedAt,
    proposals: proposals.map((row: any) => ({
      id: row.id,
      status: row.status,
      terms: row.terms,
      proposedById: row.proposedById,
      mine: row.proposedById === viewerId,
      createdAt: row.createdAt,
    })),
    progress: progress ? { ...progress, offspringAppIds: undefined } : null,
    hatchlings: hatchlingRows.map((row: any) => {
      const share = shareByApp.get(row.appAnimalId);
      return { ...animalCard(row), share: share ? toTransferSummary(share) : null };
    }),
    transfers: transfers.map(toTransferSummary),
    activatedAt: project.activatedAt,
    completedAt: project.completedAt,
    createdAt: project.createdAt,
  };
};

export const listProjects = async (actor: AuthenticatedUser) => {
  const rows = await db.jointProject.findMany({
    where: { OR: [{ proposedById: actor.id }, { invitedUserId: actor.id }] },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
  const projects = [];
  for (const row of rows) {
    const other = await loadPerson(otherSideOf(row, actor.id));
    projects.push({
      id: row.id,
      threadId: row.threadId,
      title: row.title,
      status: row.status,
      other,
      male: row.maleSnapshot || null,
      female: row.femaleSnapshot || null,
      keeperId: row.femaleOwnerId,
      waitingOnMe: row.status === "proposed" && row.invitedUserId === actor.id,
      updatedAt: row.updatedAt,
    });
  }
  return { projects };
};

export const getProject = async (actor: AuthenticatedUser, projectId: string) => {
  const project = await loadProjectFor(actor, projectId);
  return { project: await toProjectDto(project, actor.id) };
};

// ── Proposing and accepting ─────────────────────────────────────────────────

export const proposeProject = async (
  actor: AuthenticatedUser,
  input: { handle?: unknown; userId?: unknown; appAnimalId?: unknown; title?: unknown; note?: unknown },
) => {
  const me = await requireOwnHandle(actor);
  const other = await resolveCounterparty(actor, { handle: input.handle, userId: input.userId });
  if (!other.handle) throw new HttpError(409, "That breeder has not chosen a handle yet.");
  await assertCanReach(actor.id, other.id);
  const { row, sex } = await ownBreedingAnimal(actor.id, input.appAnimalId);
  const card = animalCard(row);
  const title = cleanText(input.title, 120) || `${card.name} project`;
  const note = cleanText(input.note, 2000);

  const project = await db.$transaction(async (tx: any) => {
    const thread = await createProjectThread(tx, actor.id, other.id);
    const created = await tx.jointProject.create({
      data: {
        threadId: thread.id,
        title,
        note,
        proposedById: actor.id,
        invitedUserId: other.id,
        ...(sex === "M"
          ? { maleOwnerId: actor.id, maleAnimalId: row.id, maleSnapshot: card }
          : { femaleOwnerId: actor.id, femaleAnimalId: row.id, femaleSnapshot: card }),
      },
    });
    await appendMessage(tx, {
      threadId: thread.id,
      senderUserId: actor.id,
      kind: "project",
      body:
        note ||
        (sex === "M"
          ? `I'd like to pair my male ${card.name} with one of your females. You would keep her and incubate.`
          : `I'd like to pair my female ${card.name} with one of your males. I would keep her and incubate.`),
      attachment: { projectId: created.id },
    });
    return created;
  });

  await createNotification({
    recipientId: other.id,
    actorId: actor.id,
    type: "network_project_invite",
    title: `@${me.handle} invites you to a joint project`,
    message: `${title}: they bring ${sex === "M" ? "the male" : "the female"}, ${card.name}.`,
    metadata: { projectId: project.id, threadId: project.threadId },
  });
  return { project: await toProjectDto(project, actor.id) };
};

/**
 * The partner record: a read-only copy of the male in the keeper's account, so the keeper can
 * put him on a breeding card and the hatchlings name their sire. Genetics, lab results and
 * photos travel; care logs and notes do not. It does not count toward the keeper's limit.
 */
const createPartnerRecord = async (tx: any, project: any, male: any, maleOwner: NetworkPerson, keeperId: string, now: Date) => {
  const payload = asRecord(male.payload);
  const record = await buildTransferredRecord({ sellerUserId: male.ownerId, genetics: "" }, male);
  const appAnimalId = await freeAppAnimalId(tx, keeperId, `${male.appAnimalId}-partner`);
  const nowIso = now.toISOString();
  const partnerPayload: Record<string, any> = {
    id: appAnimalId,
    name: cleanText(payload.name, 160) || male.name || male.appAnimalId,
    sex: payload.sex || male.sex || "M",
    species: payload.species || male.species || "",
    morphs: asArray(payload.morphs),
    hets: asArray(payload.hets),
    possibleHets: asArray(payload.possibleHets),
    weight: payload.weight,
    year: payload.year,
    birthDate: payload.birthDate || payload.hatchDate,
    status: PARTNER_ANIMAL_STATUS,
    tags: ["Partner"],
    groups: [],
    notes: "",
    photos: photosOf(payload),
    logs: { weights: [], feeds: [], sheds: [], meds: [], cleanings: [] },
    ...(payload.labGeneticsConfirmation ? { labGeneticsConfirmation: payload.labGeneticsConfirmation } : {}),
    geneticClaims: record.geneticClaims,
    certificates: record.certificates,
    lineage: record.lineage,
    partnerRecord: {
      projectId: project.id,
      projectTitle: project.title,
      ownerUserId: maleOwner.id,
      ownerHandle: maleOwner.handle,
      ownerName: maleOwner.displayName,
      ownerAnimalId: male.appAnimalId,
      readOnly: true,
      since: nowIso,
    },
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  const primary = partnerPayload.photos.length ? partnerPayload.photos[partnerPayload.photos.length - 1].url : undefined;
  if (primary) partnerPayload.imageUrl = primary;
  await tx.animal.create({
    data: {
      ownerId: keeperId,
      appAnimalId,
      name: partnerPayload.name,
      sex: cleanText(partnerPayload.sex, 40),
      species: cleanText(partnerPayload.species, 120),
      status: PARTNER_ANIMAL_STATUS,
      payload: partnerPayload,
    },
  });
  return appAnimalId;
};

export const respondToProject = async (
  actor: AuthenticatedUser,
  projectId: string,
  input: { action?: unknown; appAnimalId?: unknown },
) => {
  const project = await loadProjectFor(actor, projectId);
  const action = String(input.action || "");
  if (project.status !== "proposed") throw new HttpError(409, "This project was already answered.");
  if (project.invitedUserId !== actor.id) throw new HttpError(403, "Only the invited breeder can answer.");
  const me = await requireOwnHandle(actor);
  const proposer = await loadPerson(project.proposedById);
  if (!proposer) throw new HttpError(404, "Breeder not found.");

  if (action === "decline") {
    const updated = await db.$transaction(async (tx: any) => {
      const row = await tx.jointProject.update({ where: { id: project.id }, data: { status: "declined" } });
      await appendMessage(tx, { threadId: project.threadId, senderUserId: null, kind: "system", body: `${me.displayName} declined the project.`, attachment: { projectId: project.id } });
      return row;
    });
    await createNotification({
      recipientId: proposer.id,
      actorId: actor.id,
      type: "network_project_declined",
      title: "Joint project declined",
      message: `@${me.handle} declined ${project.title}.`,
      metadata: { projectId: project.id, threadId: project.threadId },
    });
    return { project: await toProjectDto(updated, actor.id) };
  }
  if (action !== "accept") throw new HttpError(400, "action must be accept or decline.");

  await assertCanReach(actor.id, proposer.id);
  const { row, sex } = await ownBreedingAnimal(actor.id, input.appAnimalId);
  const needed = project.maleOwnerId ? "F" : "M";
  if (sex !== needed) {
    throw new HttpError(409, needed === "F" ? "This project needs your female: they bring the male." : "This project needs your male: they bring the female.");
  }
  const card = animalCard(row);
  const now = new Date();

  const updated = await db.$transaction(async (tx: any) => {
    const fresh = await tx.jointProject.findUnique({ where: { id: project.id } });
    if (!fresh || fresh.status !== "proposed") throw new HttpError(409, "This project was already answered.");
    const sides =
      needed === "F"
        ? { femaleOwnerId: actor.id, femaleAnimalId: row.id, femaleSnapshot: card }
        : { maleOwnerId: actor.id, maleAnimalId: row.id, maleSnapshot: card };
    const keeperId = needed === "F" ? actor.id : fresh.femaleOwnerId;
    const maleRow = needed === "M" ? row : await tx.animal.findUnique({ where: { id: fresh.maleAnimalId } });
    if (!maleRow || maleRow.deletedAt) throw new HttpError(409, "The male is no longer in his owner's collection.");
    await lockBreederAccount(tx, keeperId);
    const maleOwner = needed === "M" ? me : proposer;
    const partnerMaleAppId = await createPartnerRecord(tx, { ...fresh, ...sides }, maleRow, maleOwner, keeperId, now);
    const activated = await tx.jointProject.update({
      where: { id: project.id },
      data: { ...sides, status: "active", activatedAt: now, partnerMaleAppId },
    });
    await tx.networkThreadParticipant.updateMany({
      where: { threadId: project.threadId, userId: actor.id },
      data: { status: PARTICIPANT_STATUS.ACCEPTED },
    });
    const keeper = keeperId === actor.id ? me : proposer;
    const femaleName = needed === "F" ? card.name : asRecord(fresh.femaleSnapshot).name;
    await appendMessage(tx, {
      threadId: project.threadId,
      senderUserId: null,
      kind: "system",
      body:
        `Project started. ${keeper.displayName} keeps ${femaleName} through her cycle and incubates the eggs. ` +
        `A partner record of ${maleRow.name || asRecord(maleRow.payload).name || "the male"} (from ${personLabel(maleOwner)}) is now in ${keeper.displayName}'s collection: ` +
        `put him on her breeding card and both of you can follow the cycle here. Agree the split of the clutch below.`,
      attachment: { projectId: project.id },
    });
    return activated;
  });

  await createNotification({
    recipientId: proposer.id,
    actorId: actor.id,
    type: "network_project_accepted",
    title: `@${me.handle} joined ${project.title}`,
    message: `They bring ${needed === "F" ? "the female" : "the male"}, ${card.name}.`,
    metadata: { projectId: project.id, threadId: project.threadId },
  });
  return { project: await toProjectDto(updated, actor.id) };
};

// ── Ending ──────────────────────────────────────────────────────────────────

/** Moves the partner record to the keeper's archive; it stays as the hatchlings' sire card. */
const archivePartnerRecord = async (tx: any, project: any, note: string, now: Date) => {
  if (!project.femaleOwnerId || !project.partnerMaleAppId) return;
  const row = await tx.animal.findUnique({
    where: { ownerId_appAnimalId: { ownerId: project.femaleOwnerId, appAnimalId: project.partnerMaleAppId } },
  });
  if (!row || row.deletedAt) return;
  const payload = asRecord(row.payload);
  if (isArchivedAnimalStatus(payload.status ?? row.status)) return;
  const nowIso = now.toISOString();
  const partner = asRecord(payload.partnerRecord);
  await tx.animal.update({
    where: { id: row.id },
    data: {
      status: "Archived",
      payload: stampServerEdit(
        {
          ...payload,
          status: "Archived",
          partnerRecord: { ...partner, endedAt: nowIso },
          archive: {
            reason: "other",
            date: ymd(now),
            archivedAt: nowIso,
            updatedAt: nowIso,
            counterpartyName: partner.ownerHandle ? `@${partner.ownerHandle}` : "",
            counterpartyContact: "",
            note,
            notes: [],
            closedPairingIds: [],
            closedCycleIds: [],
          },
        },
        ["status", "partnerRecord", "archive"],
        nowIso,
        row.updatedAt,
      ),
    },
  });
};

export const cancelProject = async (actor: AuthenticatedUser, projectId: string) => {
  const project = await loadProjectFor(actor, projectId);
  if (!OPEN_STATUSES.includes(project.status)) throw new HttpError(409, "This project is already closed.");
  const shared = await db.animalTransfer.count({ where: { projectId: project.id, status: "accepted" } });
  if (shared) throw new HttpError(409, "Hatchlings have already changed hands. Close the project instead.");
  const me = await loadPerson(actor.id);
  const now = new Date();
  const updated = await db.$transaction(async (tx: any) => {
    await tx.animalTransfer.updateMany({ where: { projectId: project.id, status: "pending" }, data: { status: "cancelled", respondedAt: now } });
    await archivePartnerRecord(tx, project, `Joint project "${project.title}" was cancelled.`, now);
    const row = await tx.jointProject.update({ where: { id: project.id }, data: { status: "cancelled", completedAt: now } });
    await appendMessage(tx, { threadId: project.threadId, senderUserId: null, kind: "system", body: `${me?.displayName || "They"} cancelled the project.`, attachment: { projectId: project.id } });
    return row;
  });
  await createNotification({
    recipientId: otherSideOf(project, actor.id),
    actorId: actor.id,
    type: "network_project_cancelled",
    title: "Joint project cancelled",
    message: `${project.title} was cancelled.`,
    metadata: { projectId: project.id, threadId: project.threadId },
  });
  return { project: await toProjectDto(updated, actor.id) };
};

/** Who each parent is and who incubated, as written onto the project's hatchlings. */
const projectBlock = async (project: any) => {
  const [maleOwner, keeper] = await Promise.all([loadPerson(project.maleOwnerId), loadPerson(project.femaleOwnerId)]);
  const male = asRecord(project.maleSnapshot);
  const female = asRecord(project.femaleSnapshot);
  const terms = project.splitTerms ? describeTerms(project.splitTerms, maleOwner?.displayName || "Male owner", keeper?.displayName || "Keeper") : null;
  return {
    maleOwner,
    keeper,
    block: {
      id: project.id,
      title: project.title,
      sire: { name: male.name || null, appAnimalId: male.appAnimalId || null, ownerUserId: maleOwner?.id || null, ownerHandle: maleOwner?.handle || null, ownerName: maleOwner?.displayName || null },
      dam: { name: female.name || null, appAnimalId: female.appAnimalId || null, ownerUserId: keeper?.id || null, ownerHandle: keeper?.handle || null, ownerName: keeper?.displayName || null },
      incubatedBy: { userId: keeper?.id || null, handle: keeper?.handle || null, name: keeper?.displayName || null },
      split: terms,
    },
  };
};

/**
 * Closes an active project. The keeper's hatchlings that stay with them get both parents written
 * across the two accounts; the partner record moves to the archive as the sire's lineage card.
 */
export const completeProject = async (actor: AuthenticatedUser, projectId: string) => {
  const project = await loadProjectFor(actor, projectId);
  if (project.status !== "active") throw new HttpError(409, "Only an active project can be closed.");
  const me = await loadPerson(actor.id);
  const cycle = await findProjectCycle(project);
  const offspring = progressOf(cycle)?.offspringAppIds || [];
  const given = await db.animalTransfer.findMany({ where: { projectId: project.id, status: "accepted" }, select: { senderAppAnimalId: true } });
  const givenIds = new Set(given.map((row: any) => row.senderAppAnimalId));
  const keptIds = offspring.filter((id) => !givenIds.has(id));
  const { block } = await projectBlock(project);
  const now = new Date();
  const nowIso = now.toISOString();

  const updated = await db.$transaction(async (tx: any) => {
    await lockBreederAccount(tx, project.femaleOwnerId);
    const kept = keptIds.length
      ? await tx.animal.findMany({ where: { ownerId: project.femaleOwnerId, appAnimalId: { in: keptIds }, deletedAt: null } })
      : [];
    for (const row of kept) {
      const payload = asRecord(row.payload);
      await tx.animal.update({
        where: { id: row.id },
        data: {
          payload: stampServerEdit(
            {
              ...payload,
              jointProject: block,
              externalParents: { ...asRecord(payload.externalParents), sire: block.sire },
            },
            ["jointProject", "externalParents"],
            nowIso,
            row.updatedAt,
          ),
        },
      });
      const parents: Array<["sire" | "dam", string | null]> = [["sire", project.maleAnimalId], ["dam", project.femaleAnimalId]];
      for (const [role, parentId] of parents) {
        if (!parentId) continue;
        await tx.parentRelationship.upsert({
          where: { childId_role: { childId: row.id, role } },
          create: { childId: row.id, parentId, role, createdById: actor.id },
          update: { parentId },
        });
      }
    }
    await archivePartnerRecord(tx, project, `Joint project "${project.title}" closed. Kept as the sire's card for the hatchlings' pedigree.`, now);
    const row = await tx.jointProject.update({ where: { id: project.id }, data: { status: "completed", completedAt: now } });
    await appendMessage(tx, {
      threadId: project.threadId,
      senderUserId: null,
      kind: "system",
      body: `${me?.displayName || "They"} closed the project. ${kept.length} hatchling${kept.length === 1 ? "" : "s"} stay${kept.length === 1 ? "s" : ""} with the keeper, ${givenIds.size} went to the partner. Every hatchling now names both parents and both breeders.`,
      attachment: { projectId: project.id },
    });
    return row;
  });

  await createNotification({
    recipientId: otherSideOf(project, actor.id),
    actorId: actor.id,
    type: "network_project_completed",
    title: "Joint project closed",
    message: `${project.title} is complete.`,
    metadata: { projectId: project.id, threadId: project.threadId },
  });
  return { project: await toProjectDto(updated, actor.id) };
};

// ── The split ───────────────────────────────────────────────────────────────

export const proposeSplit = async (actor: AuthenticatedUser, projectId: string, input: unknown) => {
  const project = await loadProjectFor(actor, projectId);
  if (project.status !== "active") throw new HttpError(409, "The split is agreed while the project is active.");
  const terms = normalizeSplitTerms(input);
  const me = await requireOwnHandle(actor);
  const [maleOwner, keeper] = await Promise.all([loadPerson(project.maleOwnerId), loadPerson(project.femaleOwnerId)]);
  const sentence = describeTerms(terms, maleOwner?.displayName || "Male owner", keeper?.displayName || "Keeper");
  const proposal = await db.$transaction(async (tx: any) => {
    await tx.jointProjectSplitProposal.updateMany({ where: { projectId: project.id, status: "open" }, data: { status: "superseded", respondedAt: new Date() } });
    const created = await tx.jointProjectSplitProposal.create({ data: { projectId: project.id, proposedById: actor.id, terms } });
    const message = await appendMessage(tx, {
      threadId: project.threadId,
      senderUserId: actor.id,
      kind: "split",
      body: sentence,
      attachment: { proposalId: created.id, projectId: project.id },
    });
    return tx.jointProjectSplitProposal.update({ where: { id: created.id }, data: { messageId: message.id } });
  });
  await createNotification({
    recipientId: otherSideOf(project, actor.id),
    actorId: actor.id,
    type: "network_split_proposed",
    title: `@${me.handle} proposed a split`,
    message: `${project.title}: ${sentence}`.slice(0, 400),
    metadata: { projectId: project.id, threadId: project.threadId, proposalId: proposal.id },
  });
  return { project: await toProjectDto(await db.jointProject.findUnique({ where: { id: project.id } }), actor.id) };
};

export const respondToSplit = async (actor: AuthenticatedUser, proposalId: string, actionRaw: unknown) => {
  const proposal = await db.jointProjectSplitProposal.findUnique({ where: { id: proposalId } });
  if (!proposal) throw new HttpError(404, "Proposal not found.");
  const project = await loadProjectFor(actor, proposal.projectId);
  if (proposal.status !== "open") throw new HttpError(409, "This proposal was already answered or replaced.");
  if (proposal.proposedById === actor.id) throw new HttpError(403, "The other breeder answers your proposal.");
  const action = String(actionRaw || "");
  if (action !== "accept" && action !== "reject") throw new HttpError(400, "action must be accept or reject.");
  const me = await loadPerson(actor.id);
  const now = new Date();
  await db.$transaction(async (tx: any) => {
    await tx.jointProjectSplitProposal.update({ where: { id: proposal.id }, data: { status: action === "accept" ? "accepted" : "rejected", respondedAt: now } });
    if (action === "accept") {
      await tx.jointProject.update({ where: { id: project.id }, data: { splitTerms: proposal.terms, splitAgreedAt: now } });
    }
    await appendMessage(tx, {
      threadId: project.threadId,
      senderUserId: null,
      kind: "system",
      body: action === "accept" ? `${me?.displayName || "They"} accepted the split. It is now the agreed split of this project.` : `${me?.displayName || "They"} turned the proposed split down.`,
      attachment: { proposalId: proposal.id, projectId: project.id },
    });
  });
  await createNotification({
    recipientId: proposal.proposedById,
    actorId: actor.id,
    type: action === "accept" ? "network_split_accepted" : "network_split_rejected",
    title: action === "accept" ? "Split agreed" : "Split turned down",
    message: project.title,
    metadata: { projectId: project.id, threadId: project.threadId, proposalId: proposal.id },
  });
  return { project: await toProjectDto(await db.jointProject.findUnique({ where: { id: project.id } }), actor.id) };
};

/**
 * The keeper offers the partner their share: one split transfer per hatchling, posted into the
 * project thread. The partner accepts each like any transfer.
 */
export const offerShares = async (actor: AuthenticatedUser, projectId: string, input: { appAnimalIds?: unknown; note?: unknown }) => {
  const project = await loadProjectFor(actor, projectId);
  if (project.status !== "active") throw new HttpError(409, "Shares are sent while the project is active.");
  if (project.femaleOwnerId !== actor.id) throw new HttpError(403, "The keeper sends the shares; the hatchlings are in their collection.");
  const ids = Array.from(new Set(asArray(input.appAnimalIds).map((id) => cleanText(id, 160)).filter(Boolean))) as string[];
  if (!ids.length) throw new HttpError(400, "Choose the hatchlings for the partner.");
  const offspring = new Set(progressOf(await findProjectCycle(project))?.offspringAppIds || []);
  const outside = ids.filter((id) => !offspring.has(id));
  if (outside.length) throw new HttpError(409, `Not hatchlings of this project's clutch: ${outside.join(", ")}.`);
  const taken = await db.animalTransfer.findMany({
    where: { projectId: project.id, status: { in: ["pending", "accepted"] }, senderAppAnimalId: { in: ids } },
    select: { senderAppAnimalId: true },
  });
  if (taken.length) throw new HttpError(409, `Already offered: ${taken.map((row: any) => row.senderAppAnimalId).join(", ")}.`);
  const maleOwner = await loadPerson(project.maleOwnerId);
  const note = cleanText(input.note, 500);
  const reason = `${project.title}: share of the clutch for ${maleOwner?.displayName || "the partner"}.${note ? ` ${note}` : ""}`;
  for (const appAnimalId of ids) {
    await createTransfer(actor, { appAnimalId, reason }, { kind: "split", projectId: project.id, threadId: project.threadId, receiverId: project.maleOwnerId });
  }
  return { project: await toProjectDto(await db.jointProject.findUnique({ where: { id: project.id } }), actor.id) };
};

/**
 * A split hatchling arriving at the male owner: the sire is their own male, so the copy points
 * at him by their own id; the dam stays with the keeper and is named, with her breeder.
 */
registerSplitPedigreeResolver(async (transfer: any, receiverId: string): Promise<SplitPedigree | null> => {
  if (!transfer.projectId) return null;
  const project = await db.jointProject.findUnique({ where: { id: transfer.projectId } });
  if (!project) return null;
  const { block } = await projectBlock(project);
  const hatchling = await db.animal.findUnique({ where: { id: transfer.senderAnimalId } });
  const clutchId = cleanText(asRecord(hatchling?.payload).clutchId, 160);
  const maleRow = project.maleAnimalId ? await db.animal.findUnique({ where: { id: project.maleAnimalId } }) : null;
  const receiverOwnsSire = Boolean(maleRow && maleRow.ownerId === receiverId && !maleRow.deletedAt);
  const sireLabel = `${block.sire.name || "Sire"}${block.sire.ownerHandle ? ` (@${block.sire.ownerHandle})` : ""}`;
  const damLabel = `${block.dam.name || "Dam"}${block.dam.ownerHandle ? ` (@${block.dam.ownerHandle})` : ""}`;
  return {
    sireAppId: receiverOwnsSire ? maleRow.appAnimalId : null,
    damAppId: null,
    sireName: block.sire.name,
    damName: block.dam.name,
    externalParents: { dam: block.dam, ...(receiverOwnsSire ? {} : { sire: block.sire }) },
    jointProject: block,
    lineage: { clutchId, parents: [{ role: "sire", label: sireLabel }, { role: "dam", label: damLabel }] },
    parentRows: [
      ...(project.maleAnimalId ? [{ role: "sire" as const, parentId: project.maleAnimalId }] : []),
      ...(project.femaleAnimalId ? [{ role: "dam" as const, parentId: project.femaleAnimalId }] : []),
    ],
  };
});
