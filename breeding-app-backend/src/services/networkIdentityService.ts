import { prisma } from "../lib/prisma";
import type { AuthenticatedUser } from "../types/auth";
import { HttpError } from "../utils/errors";

/**
 * Who a breeder is to other breeders: a chosen @handle and a display name.
 *
 * The handle is the only way to find someone. There is no browsing of accounts and no lookup by
 * email, so choosing a handle is choosing to be reachable. The display name is the breeder name
 * from the profile, falling back to the account name, which is what the marketplace already
 * shows to the other side of a sale. Email addresses never leave this file.
 */

const db = prisma as any;

export const HANDLE_PATTERN = /^[a-z][a-z0-9_.]{2,23}$/;

/** Names that would let someone pose as the platform or its staff. */
const RESERVED_HANDLES = new Set([
  "admin", "administrator", "api", "app", "help", "info", "lab", "labs", "market", "marketplace",
  "me", "mod", "moderator", "null", "official", "owner", "root", "serpentora", "staff", "support",
  "system", "team", "undefined", "www",
]);

export type NetworkPerson = {
  id: string;
  handle: string | null;
  displayName: string;
};

export const normalizeHandle = (value: unknown): string =>
  String(value ?? "").trim().replace(/^@+/, "").toLowerCase();

/** Why a handle cannot be used, or null when it can (availability aside). */
export const handleProblem = (handle: string): string | null => {
  if (!handle) return "Choose a handle.";
  if (handle.length < 3) return "A handle has at least 3 characters.";
  if (handle.length > 24) return "A handle has at most 24 characters.";
  if (!HANDLE_PATTERN.test(handle)) {
    return "Use lower-case letters, digits, dots and underscores, starting with a letter.";
  }
  if (/\.\.|\.$/.test(handle)) return "A handle cannot end with a dot or have two dots in a row.";
  if (RESERVED_HANDLES.has(handle) || handle.startsWith("serpentora")) return "That handle is reserved.";
  return null;
};

export const personSelect = {
  id: true,
  handle: true,
  fullName: true,
  profile: { select: { breederName: true } },
} as const;

export const toPerson = (user: any): NetworkPerson => ({
  id: String(user?.id || ""),
  handle: user?.handle || null,
  displayName:
    String(user?.profile?.breederName || "").trim() ||
    String(user?.fullName || "").trim() ||
    (user?.handle ? `@${user.handle}` : "Breeder"),
});

/** "@alice (Alice's Pythons)" -- how a counterparty is written into an animal's record. */
export const personLabel = (person: NetworkPerson): string =>
  person.handle && person.displayName !== `@${person.handle}`
    ? `@${person.handle} (${person.displayName})`
    : person.handle
      ? `@${person.handle}`
      : person.displayName;

export const loadPerson = async (userId: string): Promise<NetworkPerson | null> => {
  const user = await db.user.findUnique({ where: { id: userId }, select: personSelect });
  return user ? toPerson(user) : null;
};

export const getNetworkMe = async (actor: AuthenticatedUser) => {
  const user = await db.user.findUnique({ where: { id: actor.id }, select: personSelect });
  if (!user) throw new HttpError(404, "Account not found.");
  return { me: toPerson(user) };
};

export const checkHandle = async (actor: AuthenticatedUser, raw: unknown) => {
  const handle = normalizeHandle(raw);
  const problem = handleProblem(handle);
  if (problem) return { handle, available: false, reason: problem };
  const taken = await db.user.findUnique({ where: { handle }, select: { id: true } });
  if (taken && taken.id !== actor.id) return { handle, available: false, reason: "That handle is taken." };
  return { handle, available: true, reason: null };
};

export const setHandle = async (actor: AuthenticatedUser, raw: unknown) => {
  const check = await checkHandle(actor, raw);
  if (!check.available) throw new HttpError(check.reason === "That handle is taken." ? 409 : 400, check.reason || "Invalid handle.");
  try {
    const user = await db.user.update({ where: { id: actor.id }, data: { handle: check.handle }, select: personSelect });
    return { me: toPerson(user) };
  } catch (error: any) {
    // Two people claiming the same handle at the same moment: the unique index decides.
    if (error?.code === "P2002") throw new HttpError(409, "That handle is taken.");
    throw error;
  }
};

/** The user behind a handle, or a 404 that does not say whether the account exists otherwise. */
export const resolveHandle = async (raw: unknown): Promise<NetworkPerson> => {
  const handle = normalizeHandle(raw);
  if (!handle) throw new HttpError(400, "A handle is required.");
  const user = await db.user.findUnique({ where: { handle }, select: { ...personSelect, isActive: true, status: true } });
  if (!user || user.isActive === false || ["suspended", "banned", "pending_deletion"].includes(String(user.status))) {
    throw new HttpError(404, `No breeder uses @${handle}.`);
  }
  return toPerson(user);
};

/** The other side of a conversation or transfer, by handle or id. Both must be reachable. */
export const resolveCounterparty = async (actor: AuthenticatedUser, input: { handle?: unknown; userId?: unknown }) => {
  let person: NetworkPerson;
  if (input.handle) {
    person = await resolveHandle(input.handle);
  } else if (input.userId) {
    const user = await db.user.findUnique({ where: { id: String(input.userId) }, select: personSelect });
    if (!user) throw new HttpError(404, "Breeder not found.");
    person = toPerson(user);
  } else {
    throw new HttpError(400, "Say who it is for: a handle is required.");
  }
  if (person.id === actor.id) throw new HttpError(400, "That is you.");
  return person;
};

/** The actor's own handle, required before they can reach anyone. */
export const requireOwnHandle = async (actor: AuthenticatedUser): Promise<NetworkPerson> => {
  const user = await db.user.findUnique({ where: { id: actor.id }, select: personSelect });
  if (!user) throw new HttpError(404, "Account not found.");
  if (!user.handle) {
    throw new HttpError(409, "Choose your @handle first, so the other breeder can see who is writing.", { code: "handle_required" });
  }
  return toPerson(user);
};

/**
 * People by handle prefix. Only accounts that chose a handle, never the actor, never anyone
 * either side has blocked. Two characters minimum, so the directory cannot be paged through.
 */
export const searchPeople = async (actor: AuthenticatedUser, raw: unknown) => {
  const query = normalizeHandle(raw).replace(/[^a-z0-9_.]/g, "");
  if (query.length < 2) return { people: [] };
  const blocks = await db.marketplaceUserBlock.findMany({
    where: { OR: [{ blockerUserId: actor.id }, { blockedUserId: actor.id }] },
    select: { blockerUserId: true, blockedUserId: true },
  });
  const hidden = new Set<string>([actor.id]);
  blocks.forEach((row: any) => {
    hidden.add(row.blockerUserId);
    hidden.add(row.blockedUserId);
  });
  const rows = await db.user.findMany({
    where: { handle: { startsWith: query }, isActive: true },
    select: personSelect,
    orderBy: { handle: "asc" },
    take: 20,
  });
  return { people: rows.filter((row: any) => !hidden.has(row.id)).map(toPerson) };
};
