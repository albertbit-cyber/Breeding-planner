import { prisma } from "../lib/prisma";
import type { AuthenticatedUser } from "../types/auth";
import { HttpError } from "../utils/errors";
import { createNotification } from "./notificationService";
import { asRecord, cleanText } from "./networkCards";
import {
  loadPerson,
  personSelect,
  requireOwnHandle,
  resolveCounterparty,
  toPerson,
  type NetworkPerson,
} from "./networkIdentityService";

/**
 * Conversations between breeders.
 *
 * Anyone with a handle can write to anyone else with one. The first message from someone you
 * have never talked to arrives as a message request: you can read it, then accept it (it moves
 * to your inbox), ignore it (it disappears and nothing notifies you again) or block the sender.
 * Replying accepts it. Until the request is accepted the sender can add only a few more
 * messages, so a request cannot become a flood.
 *
 * Blocks are the marketplace's block list, so one block covers both places.
 */

const db = prisma as any;

export const PARTICIPANT_STATUS = { ACCEPTED: "accepted", REQUEST: "request", IGNORED: "ignored" } as const;
export const MESSAGE_KINDS = ["text", "animal", "listing", "transfer", "project", "split", "system"] as const;
type MessageKind = (typeof MESSAGE_KINDS)[number];

/** Messages a sender may add to a request the other side has not accepted yet, the first included. */
export const REQUEST_MESSAGE_CAP = 5;
const MAX_BODY = 4000;
const PAGE_SIZE = 50;

export const directPairKey = (a: string, b: string) => [a, b].sort().join(":");

// ── Blocks ──────────────────────────────────────────────────────────────────

export const blockStateBetween = async (actorId: string, otherId: string): Promise<"by_me" | "by_them" | null> => {
  const rows = await db.marketplaceUserBlock.findMany({
    where: {
      OR: [
        { blockerUserId: actorId, blockedUserId: otherId },
        { blockerUserId: otherId, blockedUserId: actorId },
      ],
    },
    select: { blockerUserId: true },
  });
  if (!rows?.length) return null;
  return rows.some((row: any) => row.blockerUserId === actorId) ? "by_me" : "by_them";
};

/**
 * Refuses contact across a block. Someone who was blocked is told only that the other breeder is
 * not accepting messages from them, which is also what an ignored request looks like from outside.
 */
export const assertCanReach = async (actorId: string, otherId: string) => {
  const state = await blockStateBetween(actorId, otherId);
  if (state === "by_me") throw new HttpError(403, "You blocked this breeder. Unblock them first.", { code: "blocked_by_me" });
  if (state === "by_them") throw new HttpError(403, "This breeder is not accepting messages from you.", { code: "not_accepting" });
};

export const blockUser = async (actor: AuthenticatedUser, input: { userId?: unknown; reason?: unknown }) => {
  const blockedUserId = cleanText(input.userId, 160);
  if (!blockedUserId) throw new HttpError(400, "userId is required.");
  if (blockedUserId === actor.id) throw new HttpError(400, "You cannot block yourself.");
  const other = await db.user.findUnique({ where: { id: blockedUserId }, select: { id: true } });
  if (!other) throw new HttpError(404, "Breeder not found.");
  await db.marketplaceUserBlock.upsert({
    where: { blockerUserId_blockedUserId: { blockerUserId: actor.id, blockedUserId } },
    create: { blockerUserId: actor.id, blockedUserId, reason: cleanText(input.reason, 1000) },
    update: { reason: cleanText(input.reason, 1000) },
  });
  // Their conversations leave the inbox and the requests at once.
  const threads = await db.networkThreadParticipant.findMany({
    where: { userId: blockedUserId, thread: { participants: { some: { userId: actor.id } } } },
    select: { threadId: true },
  });
  if (threads.length) {
    await db.networkThreadParticipant.updateMany({
      where: { userId: actor.id, threadId: { in: threads.map((row: any) => row.threadId) } },
      data: { status: PARTICIPANT_STATUS.IGNORED },
    });
  }
  return { blocked: true, userId: blockedUserId };
};

export const unblockUser = async (actor: AuthenticatedUser, blockedUserId: string) => {
  await db.marketplaceUserBlock.deleteMany({ where: { blockerUserId: actor.id, blockedUserId } });
  return { blocked: false, userId: blockedUserId };
};

export const listBlocks = async (actor: AuthenticatedUser) => {
  const rows = await db.marketplaceUserBlock.findMany({
    where: { blockerUserId: actor.id },
    include: { blocked: { select: personSelect } },
    orderBy: { createdAt: "desc" },
  });
  return { blocks: rows.map((row: any) => ({ person: toPerson(row.blocked), createdAt: row.createdAt })) };
};

// ── Threads ─────────────────────────────────────────────────────────────────

const participantOf = (thread: any, userId: string) =>
  (thread?.participants || []).find((row: any) => row.userId === userId) || null;

const loadThreadFor = async (actor: AuthenticatedUser, threadId: string) => {
  const thread = await db.networkThread.findUnique({
    where: { id: threadId },
    include: { participants: { include: { user: { select: personSelect } } }, project: true },
  });
  const mine = participantOf(thread, actor.id);
  if (!thread || !mine) throw new HttpError(404, "Conversation not found.");
  return { thread, mine };
};

/** The other person in a two-person thread. */
const otherParticipant = (thread: any, userId: string) =>
  (thread?.participants || []).find((row: any) => row.userId !== userId) || null;

/** Whether two people already talk: either one accepted a conversation that has both of them. */
const alreadyConnected = async (a: string, b: string) => {
  const direct = await db.networkThread.findUnique({
    where: { pairKey: directPairKey(a, b) },
    include: { participants: true },
  });
  const mine = participantOf(direct, b);
  return Boolean(mine && mine.status === PARTICIPANT_STATUS.ACCEPTED);
};

/**
 * Creates a thread between the actor and someone else. The actor is in it; the other side gets
 * it as a request unless the two already talk.
 */
const createThread = async (
  tx: any,
  actorId: string,
  otherId: string,
  kind: "direct" | "project",
  otherStatus: string,
) => {
  const thread = await tx.networkThread.create({
    data: {
      kind,
      pairKey: kind === "direct" ? directPairKey(actorId, otherId) : null,
      createdById: actorId,
    },
  });
  await tx.networkThreadParticipant.create({ data: { threadId: thread.id, userId: actorId, status: PARTICIPANT_STATUS.ACCEPTED, lastReadAt: new Date() } });
  await tx.networkThreadParticipant.create({ data: { threadId: thread.id, userId: otherId, status: otherStatus } });
  return thread;
};

/** The one direct conversation between two people, created on first use. */
export const findOrCreateDirectThread = async (actorId: string, otherId: string) => {
  const existing = await db.networkThread.findUnique({ where: { pairKey: directPairKey(actorId, otherId) } });
  if (existing) return { thread: existing, created: false };
  // A breeder who already accepted the actor elsewhere (a project) is not asked again.
  const connected = await db.networkThreadParticipant.findFirst({
    where: { userId: otherId, status: PARTICIPANT_STATUS.ACCEPTED, thread: { participants: { some: { userId: actorId } } } },
    select: { id: true },
  });
  const thread = await createThread(db, actorId, otherId, "direct", connected ? PARTICIPANT_STATUS.ACCEPTED : PARTICIPANT_STATUS.REQUEST);
  return { thread, created: true };
};

/** A project thread: the invitee sees it as a request unless the two already talk. */
export const createProjectThread = async (tx: any, actorId: string, otherId: string) => {
  const connected = await alreadyConnected(actorId, otherId);
  return createThread(tx, actorId, otherId, "project", connected ? PARTICIPANT_STATUS.ACCEPTED : PARTICIPANT_STATUS.REQUEST);
};

const normalizeKind = (value: unknown): MessageKind => {
  const kind = String(value || "text") as MessageKind;
  return (MESSAGE_KINDS as readonly string[]).includes(kind) ? kind : "text";
};

/** What a person may attach themselves. Transfers, projects and splits are written by their own services. */
const sanitizeUserAttachment = (kind: MessageKind, raw: unknown) => {
  const value = asRecord(raw);
  if (kind === "animal") {
    const card = asRecord(value.animal);
    if (!cleanText(card.name, 160) && !cleanText(card.appAnimalId, 160)) throw new HttpError(400, "The snake card is empty.");
    return {
      animal: {
        appAnimalId: cleanText(card.appAnimalId, 160),
        name: cleanText(card.name, 160),
        sex: cleanText(card.sex, 20),
        species: cleanText(card.species, 120),
        morphs: (Array.isArray(card.morphs) ? card.morphs : []).map((m: unknown) => cleanText(m, 120)).filter(Boolean).slice(0, 30),
        hets: (Array.isArray(card.hets) ? card.hets : []).map((m: unknown) => cleanText(m, 120)).filter(Boolean).slice(0, 30),
        possibleHets: (Array.isArray(card.possibleHets) ? card.possibleHets : []).map((m: unknown) => cleanText(m, 120)).filter(Boolean).slice(0, 30),
        year: cleanText(card.year, 10),
        imageUrl: /^https?:\/\//i.test(String(card.imageUrl || "")) ? cleanText(card.imageUrl, 1000) : null,
      },
    };
  }
  if (kind === "listing") {
    const listing = asRecord(value.listing);
    const url = cleanText(listing.url, 1000);
    if (!url || !/^https?:\/\//i.test(url)) throw new HttpError(400, "A marketplace link needs an http(s) address.");
    return {
      listing: {
        id: cleanText(listing.id, 160),
        url,
        title: cleanText(listing.title, 200) || url,
        price: listing.price === undefined || listing.price === null || listing.price === "" ? null : Number(listing.price),
        currency: cleanText(listing.currency, 8),
        imageUrl: /^https?:\/\//i.test(String(listing.imageUrl || "")) ? cleanText(listing.imageUrl, 1000) : null,
      },
    };
  }
  return null;
};

/** Writes one message and moves the thread to the top. `tx` lets a service write it inside its transaction. */
export const appendMessage = async (
  tx: any,
  input: { threadId: string; senderUserId: string | null; kind: MessageKind; body: string; attachment?: Record<string, unknown> | null },
) => {
  const now = new Date();
  const message = await tx.networkMessage.create({
    data: {
      threadId: input.threadId,
      senderUserId: input.senderUserId,
      kind: input.kind,
      body: input.body,
      attachment: input.attachment || undefined,
      createdAt: now,
    },
  });
  await tx.networkThread.update({ where: { id: input.threadId }, data: { lastMessageAt: now } });
  if (input.senderUserId) {
    await tx.networkThreadParticipant.updateMany({
      where: { threadId: input.threadId, userId: input.senderUserId },
      data: { lastReadAt: now },
    });
  }
  return message;
};

/**
 * Applies the request rules to a message about to be sent by `actorId` into a thread: a reply
 * accepts a request, a sender cannot flood a request, nobody reaches across a block.
 */
export const prepareToSend = async (tx: any, thread: any, actorId: string) => {
  const mine = participantOf(thread, actorId);
  if (!mine) throw new HttpError(404, "Conversation not found.");
  const other = otherParticipant(thread, actorId);
  if (other) await assertCanReach(actorId, other.userId);
  if (mine.status !== PARTICIPANT_STATUS.ACCEPTED) {
    await tx.networkThreadParticipant.update({ where: { id: mine.id }, data: { status: PARTICIPANT_STATUS.ACCEPTED } });
  }
  if (other && other.status === PARTICIPANT_STATUS.REQUEST) {
    const sent = await tx.networkMessage.count({ where: { threadId: thread.id, senderUserId: actorId } });
    if (sent >= REQUEST_MESSAGE_CAP) {
      throw new HttpError(429, "Wait until they accept your message request before you write more.", { code: "request_cap" });
    }
  }
  return { mine, other };
};

/** Tells the other side about a new conversation, once, and only when they would see it. */
const notifyNewRequest = async (sender: NetworkPerson, recipientId: string, threadId: string, preview: string) => {
  await createNotification({
    recipientId,
    actorId: sender.id,
    type: "network_message_request",
    title: `Message request from @${sender.handle}`,
    message: preview.slice(0, 200) || `${sender.displayName} wants to talk.`,
    metadata: { threadId },
  });
};

/**
 * Sends a message, into an existing thread or to a person (which opens or reuses the direct
 * thread). Returns the message and its thread id.
 */
export const sendMessage = async (
  actor: AuthenticatedUser,
  input: { threadId?: unknown; handle?: unknown; userId?: unknown; kind?: unknown; body?: unknown; attachment?: unknown },
) => {
  const me = await requireOwnHandle(actor);
  const kind = normalizeKind(input.kind);
  if (!["text", "animal", "listing"].includes(kind)) throw new HttpError(400, "That kind of message is sent from its own screen.");
  const attachment = sanitizeUserAttachment(kind, input.attachment);
  const body = String(input.body ?? "").trim().slice(0, MAX_BODY);
  if (!body && !attachment) throw new HttpError(400, "The message is empty.");

  let threadId = cleanText(input.threadId, 160);
  let created = false;
  if (!threadId) {
    const other = await resolveCounterparty(actor, { handle: input.handle, userId: input.userId });
    await assertCanReach(actor.id, other.id);
    const opened = await findOrCreateDirectThread(actor.id, other.id);
    threadId = opened.thread.id;
    created = opened.created;
  }
  const { thread } = await loadThreadFor(actor, threadId as string);

  const result = await db.$transaction(async (tx: any) => {
    const { other } = await prepareToSend(tx, thread, actor.id);
    const message = await appendMessage(tx, { threadId: thread.id, senderUserId: actor.id, kind, body, attachment });
    return { message, other };
  });

  const recipient = result.other;
  if (recipient && recipient.status === PARTICIPANT_STATUS.REQUEST) {
    const earlier = await db.networkMessage.count({ where: { threadId: thread.id, senderUserId: actor.id } });
    if (created || earlier === 1) await notifyNewRequest(me, recipient.userId, thread.id, body || "Sent you a card.");
  }
  return { threadId: thread.id, message: await toMessageDto(result.message, actor.id, new Map([[me.id, me]])) };
};

// ── Reading ─────────────────────────────────────────────────────────────────

type LiveRefs = { transfers: Map<string, any>; projects: Map<string, any>; proposals: Map<string, any> };

/** The live state of what messages point at, so a transfer card shows Accepted, not the Pending it was sent as. */
const loadLiveRefs = async (messages: any[]): Promise<LiveRefs> => {
  const ids = (key: string) =>
    Array.from(new Set(messages.map((m) => cleanText(asRecord(m.attachment)[key], 160)).filter(Boolean))) as string[];
  const transferIds = ids("transferId");
  const projectIds = ids("projectId");
  const proposalIds = ids("proposalId");
  const [transfers, projects, proposals] = await Promise.all([
    transferIds.length ? db.animalTransfer.findMany({ where: { id: { in: transferIds } } }) : [],
    projectIds.length ? db.jointProject.findMany({ where: { id: { in: projectIds } } }) : [],
    proposalIds.length ? db.jointProjectSplitProposal.findMany({ where: { id: { in: proposalIds } } }) : [],
  ]);
  const byId = (rows: any[]) => new Map(rows.map((row) => [row.id, row]));
  return { transfers: byId(transfers), projects: byId(projects), proposals: byId(proposals) };
};

export const toTransferSummary = (row: any) =>
  row
    ? {
        id: row.id,
        kind: row.kind,
        status: row.status,
        reason: row.reason,
        senderUserId: row.senderUserId,
        receiverUserId: row.receiverUserId,
        loanUntil: row.loanUntil,
        projectId: row.projectId || null,
        animal: row.snapshot || null,
        createdAt: row.createdAt,
        respondedAt: row.respondedAt,
        returnedAt: row.returnedAt,
      }
    : null;

const toMessageDto = async (row: any, viewerId: string, people: Map<string, NetworkPerson>, refs?: LiveRefs) => {
  const attachment = asRecord(row.attachment);
  const live: Record<string, unknown> = {};
  if (refs) {
    if (attachment.transferId) live.transfer = toTransferSummary(refs.transfers.get(attachment.transferId));
    if (attachment.projectId) {
      const project = refs.projects.get(attachment.projectId);
      live.project = project ? { id: project.id, title: project.title, status: project.status } : null;
    }
    if (attachment.proposalId) {
      const proposal = refs.proposals.get(attachment.proposalId);
      live.proposal = proposal
        ? { id: proposal.id, status: proposal.status, terms: proposal.terms, proposedById: proposal.proposedById, createdAt: proposal.createdAt }
        : null;
    }
  }
  let sender = row.senderUserId ? people.get(row.senderUserId) || null : null;
  if (row.senderUserId && !sender) {
    sender = await loadPerson(row.senderUserId);
    if (sender) people.set(sender.id, sender);
  }
  return {
    id: row.id,
    threadId: row.threadId,
    kind: row.kind,
    body: row.deletedAt ? "" : row.body,
    deleted: Boolean(row.deletedAt),
    attachment: row.deletedAt ? null : { ...attachment, ...live },
    createdAt: row.createdAt,
    sender,
    mine: row.senderUserId === viewerId,
  };
};

const unreadCount = async (threadId: string, viewerId: string, lastReadAt: Date | null) =>
  db.networkMessage.count({
    where: {
      threadId,
      deletedAt: null,
      senderUserId: { not: viewerId },
      ...(lastReadAt ? { createdAt: { gt: lastReadAt } } : {}),
    },
  });

/**
 * The actor's conversations. box: inbox (accepted), requests (others wrote first), ignored.
 * Requests list only threads that actually hold a message from the other side.
 */
export const listThreads = async (actor: AuthenticatedUser, boxRaw: unknown) => {
  const box = String(boxRaw || "inbox");
  const status =
    box === "requests" ? PARTICIPANT_STATUS.REQUEST : box === "ignored" ? PARTICIPANT_STATUS.IGNORED : PARTICIPANT_STATUS.ACCEPTED;
  const rows = await db.networkThreadParticipant.findMany({
    where: { userId: actor.id, status },
    include: {
      thread: {
        include: {
          participants: { include: { user: { select: personSelect } } },
          project: true,
        },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });
  const threads = [];
  for (const row of rows) {
    const thread = row.thread;
    const last = await db.networkMessage.findFirst({
      where: { threadId: thread.id, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
    if (!last) continue;
    if (box === "requests" && !(await db.networkMessage.count({ where: { threadId: thread.id, senderUserId: { not: actor.id } } }))) continue;
    const other = otherParticipant(thread, actor.id);
    threads.push({
      id: thread.id,
      kind: thread.kind,
      status: row.status,
      other: other ? toPerson(other.user) : null,
      project: thread.project ? { id: thread.project.id, title: thread.project.title, status: thread.project.status } : null,
      lastMessage: {
        kind: last.kind,
        body: String(last.body || "").slice(0, 160),
        createdAt: last.createdAt,
        mine: last.senderUserId === actor.id,
      },
      lastMessageAt: thread.lastMessageAt || last.createdAt,
      unread: await unreadCount(thread.id, actor.id, row.lastReadAt),
    });
  }
  threads.sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
  return { box, threads };
};

/** One conversation with a page of messages, newest last. `before` pages back from a message id. */
export const getThread = async (actor: AuthenticatedUser, threadId: string, options: { before?: unknown } = {}) => {
  const { thread, mine } = await loadThreadFor(actor, threadId);
  const before = cleanText(options.before, 160);
  let cursorDate: Date | null = null;
  if (before) {
    const anchor = await db.networkMessage.findFirst({ where: { id: before, threadId: thread.id } });
    cursorDate = anchor?.createdAt || null;
  }
  const page = await db.networkMessage.findMany({
    where: { threadId: thread.id, ...(cursorDate ? { createdAt: { lt: cursorDate } } : {}) },
    orderBy: { createdAt: "desc" },
    take: PAGE_SIZE + 1,
  });
  const hasMore = page.length > PAGE_SIZE;
  const messages = page.slice(0, PAGE_SIZE).reverse();
  const people = new Map<string, NetworkPerson>();
  thread.participants.forEach((row: any) => people.set(row.userId, toPerson(row.user)));
  const refs = await loadLiveRefs(messages);
  const other = otherParticipant(thread, actor.id);
  return {
    thread: {
      id: thread.id,
      kind: thread.kind,
      status: mine.status,
      other: other ? toPerson(other.user) : null,
      projectId: thread.project?.id || null,
      blocked: other ? await blockStateBetween(actor.id, other.userId) : null,
    },
    messages: await Promise.all(messages.map((row: any) => toMessageDto(row, actor.id, people, refs))),
    hasMore,
  };
};

export const markThreadRead = async (actor: AuthenticatedUser, threadId: string) => {
  const { mine } = await loadThreadFor(actor, threadId);
  await db.networkThreadParticipant.update({ where: { id: mine.id }, data: { lastReadAt: new Date() } });
  return { ok: true };
};

/** accept moves a request (or an ignored thread) to the inbox; ignore hides it. */
export const setThreadStatus = async (actor: AuthenticatedUser, threadId: string, statusRaw: unknown) => {
  const status = String(statusRaw || "");
  if (status !== PARTICIPANT_STATUS.ACCEPTED && status !== PARTICIPANT_STATUS.IGNORED) {
    throw new HttpError(400, "status must be accepted or ignored.");
  }
  const { mine } = await loadThreadFor(actor, threadId);
  await db.networkThreadParticipant.update({ where: { id: mine.id }, data: { status } });
  return { threadId, status };
};

/** Files a report into the admin queue. The message stays readable to moderators. */
export const reportMessage = async (actor: AuthenticatedUser, messageId: string, input: { reason?: unknown; note?: unknown }) => {
  const message = await db.networkMessage.findUnique({ where: { id: messageId } });
  if (!message) throw new HttpError(404, "Message not found.");
  await loadThreadFor(actor, message.threadId);
  if (message.senderUserId === actor.id) throw new HttpError(400, "You cannot report your own message.");
  const reason = cleanText(input.reason, 80) || "other";
  const note = cleanText(input.note, 2000);
  const report = await db.report.create({
    data: {
      reporterUserId: actor.id,
      reportedUserId: message.senderUserId,
      relatedMessageId: message.id,
      type: "network_message",
      description: [`Reason: ${reason}`, note ? `Note: ${note}` : null, `Message: ${String(message.body || "").slice(0, 1500)}`]
        .filter(Boolean)
        .join("\n"),
    },
  });
  return { reportId: report.id };
};

/** The badge: unread conversations, open requests, and what waits on the actor elsewhere. */
export const getNetworkSummary = async (actor: AuthenticatedUser) => {
  const user = await db.user.findUnique({ where: { id: actor.id }, select: personSelect });
  const [inbox, requests, incomingTransfers, projectInvites] = await Promise.all([
    db.networkThreadParticipant.findMany({ where: { userId: actor.id, status: PARTICIPANT_STATUS.ACCEPTED }, select: { threadId: true, lastReadAt: true } }),
    db.networkThreadParticipant.findMany({ where: { userId: actor.id, status: PARTICIPANT_STATUS.REQUEST }, select: { threadId: true } }),
    db.animalTransfer.count({ where: { receiverUserId: actor.id, status: "pending" } }),
    db.jointProject.count({ where: { invitedUserId: actor.id, status: "proposed" } }),
  ]);
  let unreadThreads = 0;
  for (const row of inbox) {
    if ((await unreadCount(row.threadId, actor.id, row.lastReadAt)) > 0) unreadThreads += 1;
  }
  let openRequests = 0;
  for (const row of requests) {
    if (await db.networkMessage.count({ where: { threadId: row.threadId, senderUserId: { not: actor.id } } })) openRequests += 1;
  }
  return {
    me: user ? toPerson(user) : null,
    unreadThreads,
    requests: openRequests,
    incomingTransfers,
    projectInvites,
    total: unreadThreads + openRequests + incomingTransfers + projectInvites,
  };
};
