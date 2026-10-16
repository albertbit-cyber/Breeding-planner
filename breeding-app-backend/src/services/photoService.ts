import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import type { AuthenticatedUser } from "../types/auth";
import { HttpError } from "../utils/errors";
import { canAccessFeature } from "./subscriptionService";
import { PHOTOS_PER_ANIMAL_FEATURE } from "./subscriptionCatalog";
import {
  SIGNED_READ_TTL_SECONDS,
  animalPhotoKey,
  animalThumbKey,
  extensionForMime,
  getUploadStorage,
  newObjectId,
  signLocalReadUrl,
  verifyLocalReadSignature,
} from "./uploadStorageService";

/**
 * Animal photos in object storage.
 *
 * A photo used to exist only as a base64 `data:` URL inside the animal record on the device that
 * took it; cloud sync stripped it before upload, so losing the device's storage lost the photo
 * (72 of them on 13 Oct). Now the bytes go to the owner's folder in the bucket and the record holds
 * `photo:{id}`, which syncs like any other short string.
 *
 * The flow is three calls so the bytes never pass through this process on the Supabase driver:
 * ask for an upload URL (deduplicated by checksum), PUT the bytes straight to storage, then
 * complete, which checks what actually arrived before the photo counts as ready.
 */

const db = prisma as any;

export const PHOTO_KINDS = ["cover", "gallery", "hatchling", "document", "marketplace"] as const;
export const PHOTO_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"] as const;
export const PHOTO_RETENTION_DAYS = 30;
const PENDING_ABANDONED_HOURS = 24;
const THUMB_MAX_BYTES = 512 * 1024;
const SHA256_HEX = /^[a-f0-9]{64}$/;

const DEFAULT_MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const DEFAULT_MAX_PHOTOS_PER_USER = 20000;

const positiveIntEnv = (name: string, fallback: number) => {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

export const maxPhotoBytes = () => positiveIntEnv("PHOTO_MAX_BYTES", DEFAULT_MAX_PHOTO_BYTES);
export const maxPhotosPerUser = () => positiveIntEnv("PHOTO_MAX_PER_USER", DEFAULT_MAX_PHOTOS_PER_USER);

const text = (value: unknown, max = 200): string | null => {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized ? normalized.slice(0, max) : null;
};

const optionalInt = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 && parsed < 100000 ? Math.round(parsed) : null;
};

// --- Format detection -------------------------------------------------------------------------

/** What the bytes say they are. The declared type is a claim; this is the check. */
export const detectPhotoMimeType = (head: Buffer | null): string => {
  if (!head || head.length < 4) return "";
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "image/jpeg";
  if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) return "image/png";
  if (head.length >= 12 && head.toString("ascii", 0, 4) === "RIFF" && head.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  // HEIC/HEIF: an ISO-BMFF box, "ftyp" at offset 4 and a HEIF brand after it.
  if (head.length >= 12 && head.toString("ascii", 4, 8) === "ftyp") {
    const brand = head.toString("ascii", 8, 12);
    if (["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"].includes(brand)) return "image/heic";
  }
  return "";
};

// --- Shapes -----------------------------------------------------------------------------------

export const toPhotoDto = (photo: any) => ({
  id: photo.id,
  ref: `photo:${photo.id}`,
  animalId: photo.animalAppId ?? null,
  kind: photo.kind,
  mimeType: photo.mimeType,
  sizeBytes: photo.sizeBytes,
  width: photo.width ?? null,
  height: photo.height ?? null,
  checksum: photo.checksum,
  status: photo.status,
  hasThumb: Boolean(photo.thumbKey),
  deletedAt: photo.deletedAt ?? null,
  createdAt: photo.createdAt,
  updatedAt: photo.updatedAt,
});

const isAdmin = (actor: AuthenticatedUser) => actor.role === "admin";

/** Owner only, for anything that changes a photo. A stranger gets the same 404 as a missing id. */
const loadOwnPhoto = async (actor: AuthenticatedUser, id: string) => {
  const photo = await db.photo.findUnique({ where: { id: String(id || "") } });
  if (!photo || photo.ownerUserId !== actor.id) throw new HttpError(404, "Photo not found.");
  return photo;
};

/** Owner, or an admin, for reads. */
const loadReadablePhoto = async (actor: AuthenticatedUser, id: string) => {
  const photo = await db.photo.findUnique({ where: { id: String(id || "") } });
  if (!photo || (photo.ownerUserId !== actor.id && !isAdmin(actor))) throw new HttpError(404, "Photo not found.");
  return photo;
};

// --- Upload ------------------------------------------------------------------------------------

const uploadTargets = async (photo: any) => {
  const storage = getUploadStorage();
  const signed = await storage.createSignedUploadUrl(photo.storageKey, photo.mimeType);
  const signedThumb = photo.thumbKey ? await storage.createSignedUploadUrl(photo.thumbKey, "image/webp") : null;
  if (signed) {
    return { upload: { ...signed, viaBackend: false }, thumbUpload: signedThumb ? { ...signedThumb, viaBackend: false } : null };
  }
  // Local driver: the bytes come through this backend, authenticated like any other API call.
  const base = `/api/photos/${encodeURIComponent(photo.id)}/object`;
  return {
    upload: { method: "PUT" as const, url: base, headers: { "Content-Type": photo.mimeType }, viaBackend: true },
    thumbUpload: photo.thumbKey
      ? { method: "PUT" as const, url: `${base}?variant=thumb`, headers: { "Content-Type": "image/webp" }, viaBackend: true }
      : null,
  };
};

/**
 * Photos are limited per animal: the tier's "animals.photos" value is how many photos one animal
 * may hold (Free 3, Hobby 5, ...), blank meaning no tier limit. On top of that:
 *
 * - PHOTO_MAX_PER_ANIMAL is the technical cap for every tier, "unlimited" included, because the
 *   app carries an animal's photos in its record, its backups and its PDFs.
 * - PHOTO_MAX_PER_USER is a hard ceiling for the whole account, so an unconfigured tier catalogue
 *   cannot mean unlimited storage.
 *
 * Photos taken before the per-animal limits came in (PHOTO_LIMITS_FROM) are exempt from the tier
 * limit, though not from the technical cap. Every photo still on a device goes through this upload
 * once, and refusing an older one would leave it on that device only, which is how 72 photos were
 * lost on 13 Oct. A lower limit never takes a photo away; it only stops new ones.
 */
const DEFAULT_MAX_PHOTOS_PER_ANIMAL = 60;
const DEFAULT_PHOTO_LIMITS_FROM = "2026-10-17T00:00:00.000Z";

// What counts against an animal's limit: pictures of the animal. A listing's own photos and
// scanned papers are not pictures of it, and a removed photo frees its place at once.
const KINDS_COUNTED_PER_ANIMAL = ["cover", "gallery", "hatchling"];

export const maxPhotosPerAnimal = () => positiveIntEnv("PHOTO_MAX_PER_ANIMAL", DEFAULT_MAX_PHOTOS_PER_ANIMAL);

export const photoLimitsFrom = (): Date => {
  const parsed = new Date(process.env.PHOTO_LIMITS_FROM || DEFAULT_PHOTO_LIMITS_FROM);
  return Number.isNaN(parsed.getTime()) ? new Date(DEFAULT_PHOTO_LIMITS_FROM) : parsed;
};

/** Taken before the limits came in, by the date the device recorded when the photo was added. */
const takenBeforeLimits = (addedAt: unknown): boolean => {
  if (!addedAt) return false;
  const parsed = new Date(String(addedAt));
  return !Number.isNaN(parsed.getTime()) && parsed < photoLimitsFrom();
};

export const countPhotosForAnimal = (ownerUserId: string, animalAppId: string): Promise<number> =>
  db.photo.count({
    where: { ownerUserId, animalAppId, kind: { in: KINDS_COUNTED_PER_ANIMAL }, status: { in: ["pending", "ready"] } },
  });

const assertQuota = async (actor: AuthenticatedUser, input: { animalAppId: string | null; kind: string; addedAt: unknown }) => {
  const access: any = await canAccessFeature(actor, PHOTOS_PER_ANIMAL_FEATURE);
  if (!access.allowed) {
    throw new HttpError(403, access.reason || "Photos are not included in your plan.", {
      code: "PHOTO_QUOTA",
      scope: "plan",
      requiredTier: access.requiredTier,
    });
  }

  if (input.animalAppId && KINDS_COUNTED_PER_ANIMAL.includes(input.kind)) {
    const tierLimit = access.limit === null || access.limit === undefined ? null : Number(access.limit);
    const exempt = takenBeforeLimits(input.addedAt);
    const limit = tierLimit === null || exempt ? maxPhotosPerAnimal() : Math.min(tierLimit, maxPhotosPerAnimal());
    const onAnimal = await countPhotosForAnimal(actor.id, input.animalAppId);
    if (onAnimal >= limit) {
      throw new HttpError(403, `This animal already has ${onAnimal} photos, and ${access.tier || "your plan"} keeps ${limit} per animal.`, {
        code: "PHOTO_QUOTA",
        scope: "animal",
        animalId: input.animalAppId,
        currentUsage: onAnimal,
        limit,
        tier: access.tier || "",
      });
    }
  }

  const used = await countStoredPhotos(actor.id);
  if (used >= maxPhotosPerUser()) {
    throw new HttpError(403, "Photo storage limit reached.", { code: "PHOTO_QUOTA", scope: "account", currentUsage: used, limit: maxPhotosPerUser() });
  }
};

/** What counts against the account's hard ceiling: everything not yet purged. */
export const countStoredPhotos = (ownerUserId: string): Promise<number> =>
  db.photo.count({ where: { ownerUserId, status: { in: ["pending", "ready", "deleted"] } } });

const answerForExisting = async (existing: any) => {
  if (existing.status === "ready") return { photo: toPhotoDto(existing), alreadyUploaded: true };
  if (existing.status === "deleted") {
    // Deleted but not purged: the bytes are still there, so taking the photo again brings it back.
    const restored = await db.photo.update({ where: { id: existing.id }, data: { status: "ready", deletedAt: null } });
    return { photo: toPhotoDto(restored), alreadyUploaded: true };
  }
  // Still pending: an earlier attempt never finished. Same keys, fresh URLs.
  return { photo: toPhotoDto(existing), alreadyUploaded: false, ...(await uploadTargets(existing)) };
};

export const createPhotoUploadUrl = async (actor: AuthenticatedUser, payload: Record<string, unknown>) => {
  const mimeType = String(payload.mimeType || "").trim().toLowerCase();
  if (!(PHOTO_MIME_TYPES as readonly string[]).includes(mimeType)) {
    throw new HttpError(400, "Photos must be JPEG, PNG, WebP or HEIC.");
  }
  const sizeBytes = Number(payload.sizeBytes);
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) throw new HttpError(400, "sizeBytes is required.");
  if (sizeBytes > maxPhotoBytes()) throw new HttpError(413, "Photo is too large.");
  const checksum = String(payload.checksum || "").trim().toLowerCase();
  if (!SHA256_HEX.test(checksum)) throw new HttpError(400, "checksum must be a sha256 hex digest.");
  const kind = String(payload.kind || "gallery").trim().toLowerCase();
  if (!(PHOTO_KINDS as readonly string[]).includes(kind)) throw new HttpError(400, "Unknown photo kind.");
  const animalAppId = text(payload.animalId, 160);
  const withThumb = payload.thumb !== false;

  // The same picture from the same owner is one photo, whichever device or animal sends it. This is
  // what makes the one-time migration of on-device photos safe to run on every device.
  const existing = await db.photo.findFirst({ where: { ownerUserId: actor.id, checksum } });
  if (existing) return answerForExisting(existing);

  await assertQuota(actor, { animalAppId, kind, addedAt: payload.addedAt });

  const id = newObjectId();
  let photo;
  try {
    photo = await db.photo.create({
      data: {
        id,
        ownerUserId: actor.id,
        animalAppId,
        kind,
        storageKey: animalPhotoKey(actor.id, animalAppId, id, extensionForMime(mimeType)),
        thumbKey: withThumb ? animalThumbKey(actor.id, animalAppId, id) : null,
        mimeType,
        sizeBytes: Math.round(sizeBytes),
        width: optionalInt(payload.width),
        height: optionalInt(payload.height),
        checksum,
        status: "pending",
      },
    });
  } catch (error) {
    // Two devices migrating the same photo at once: the second insert loses the unique race, and
    // the winner's row is the answer for both.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const winner = await db.photo.findFirst({ where: { ownerUserId: actor.id, checksum } });
      if (winner) return answerForExisting(winner);
    }
    throw error;
  }
  return { photo: toPhotoDto(photo), alreadyUploaded: false, ...(await uploadTargets(photo)) };
};

/** Local driver only: the bytes of a pending photo, PUT through this backend. */
export const putLocalPhotoObject = async (
  actor: AuthenticatedUser,
  id: string,
  variant: "full" | "thumb",
  buffer: Buffer
) => {
  const storage = getUploadStorage();
  if (storage.driver !== "local") throw new HttpError(409, "Upload to the signed URL instead.");
  const photo = await loadOwnPhoto(actor, id);
  if (photo.status !== "pending") throw new HttpError(409, "This photo is already uploaded.");
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new HttpError(400, "Upload is empty.");
  const key = variant === "thumb" ? photo.thumbKey : photo.storageKey;
  if (!key) throw new HttpError(400, "This photo has no thumbnail slot.");
  const limit = variant === "thumb" ? THUMB_MAX_BYTES : maxPhotoBytes();
  if (buffer.length > limit) throw new HttpError(413, "Upload is too large.");
  await storage.putObject({ key, buffer, contentType: variant === "thumb" ? "image/webp" : photo.mimeType });
  return { ok: true };
};

/**
 * Checks what arrived and marks the photo ready. A pending photo is not served: the record that
 * points at it keeps showing the device's own copy until this succeeds.
 */
export const completePhotoUpload = async (actor: AuthenticatedUser, id: string, payload: Record<string, unknown> = {}) => {
  const photo = await loadOwnPhoto(actor, id);
  if (photo.status === "ready") return { photo: toPhotoDto(photo) };
  if (photo.status === "deleted") throw new HttpError(409, "This photo was deleted.");

  const storage = getUploadStorage();
  const info = await storage.headObject(photo.storageKey);
  if (!info) throw new HttpError(409, "The photo has not been uploaded yet.");
  if (info.sizeBytes > maxPhotoBytes()) {
    await storage.deleteObjects([photo.storageKey, photo.thumbKey].filter(Boolean));
    await db.photo.delete({ where: { id: photo.id } });
    throw new HttpError(413, "Photo is too large.");
  }

  // The magic bytes decide the type. Something that is not an image is removed outright rather
  // than left in the owner's folder.
  const detected = detectPhotoMimeType(await storage.readObjectHead(photo.storageKey, 16));
  if (!detected || !(PHOTO_MIME_TYPES as readonly string[]).includes(detected)) {
    await storage.deleteObjects([photo.storageKey, photo.thumbKey].filter(Boolean));
    await db.photo.delete({ where: { id: photo.id } });
    throw new HttpError(400, "Upload is not a supported image.");
  }

  // A thumbnail is optional: a device that could not make one still gets its photo stored.
  let thumbKey = photo.thumbKey;
  if (thumbKey) {
    const thumbInfo = await storage.headObject(thumbKey);
    if (!thumbInfo || thumbInfo.sizeBytes > THUMB_MAX_BYTES) {
      if (thumbInfo) await storage.deleteObjects([thumbKey]);
      thumbKey = null;
    }
  }

  const updated = await db.photo.update({
    where: { id: photo.id },
    data: {
      status: "ready",
      mimeType: detected,
      sizeBytes: info.sizeBytes || photo.sizeBytes,
      thumbKey,
      width: optionalInt(payload.width) ?? photo.width,
      height: optionalInt(payload.height) ?? photo.height,
    },
  });
  return { photo: toPhotoDto(updated) };
};

// --- Reads -------------------------------------------------------------------------------------

const signRead = async (key: string | null, ttlSeconds: number): Promise<string | null> => {
  if (!key) return null;
  const signed = await getUploadStorage().createSignedReadUrl(key, ttlSeconds);
  return signed || signLocalReadUrl(key, ttlSeconds);
};

const urlsFor = async (photo: any) => {
  if (photo.status === "pending") throw new HttpError(409, "This photo has not finished uploading.");
  const ttl = SIGNED_READ_TTL_SECONDS;
  const [url, thumbUrl] = await Promise.all([signRead(photo.storageKey, ttl), signRead(photo.thumbKey, ttl)]);
  return {
    id: photo.id,
    status: photo.status,
    mimeType: photo.mimeType,
    url,
    thumbUrl: thumbUrl || url,
    expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
  };
};

/**
 * A short-lived URL for the photo and its thumbnail. A soft-deleted photo still resolves for its
 * owner until it is purged: a record that still points at it (an undo, a restored backup) should
 * show it, and the app restores it when it does.
 */
export const getPhotoUrls = async (actor: AuthenticatedUser, id: string) => urlsFor(await loadReadablePhoto(actor, id));

/** The same for many photos at once, for a gallery. Ids the caller cannot read are left out. */
export const getPhotoUrlsBatch = async (actor: AuthenticatedUser, ids: unknown) => {
  const list = Array.from(new Set((Array.isArray(ids) ? ids : []).map((value) => String(value || "").trim()).filter(Boolean))).slice(0, 100);
  if (!list.length) return { photos: [] };
  const where: Record<string, unknown> = { id: { in: list }, status: { in: ["ready", "deleted"] } };
  if (!isAdmin(actor)) where.ownerUserId = actor.id;
  const rows = await db.photo.findMany({ where });
  return { photos: await Promise.all(rows.map(urlsFor)) };
};

export const listPhotos = async (actor: AuthenticatedUser, query: Record<string, unknown> = {}) => {
  const where: Record<string, unknown> = { ownerUserId: actor.id };
  const animalId = text(query.animalId, 160);
  if (animalId) where.animalAppId = animalId;
  where.status = String(query.includeDeleted || "") === "1" ? { in: ["ready", "deleted"] } : "ready";
  const rows = await db.photo.findMany({ where, orderBy: { createdAt: "desc" }, take: 500 });
  return { photos: rows.map(toPhotoDto) };
};

/** Local driver reads: the signature is the permission, as with a Supabase signed URL. */
export const readLocalSignedObject = async (query: Record<string, unknown>) => {
  const key = String(query.key || "");
  if (!verifyLocalReadSignature(key, String(query.exp || ""), String(query.sig || ""))) {
    throw new HttpError(403, "This photo link has expired.");
  }
  const buffer = await getUploadStorage().getObject(key).catch(() => null);
  if (!buffer) throw new HttpError(404, "Photo not found.");
  const mimeType = key.endsWith(".webp") ? "image/webp" : detectPhotoMimeType(buffer.subarray(0, 16)) || "application/octet-stream";
  return { buffer, mimeType };
};

// --- Delete and restore ---------------------------------------------------------------------------

export const deletePhoto = async (actor: AuthenticatedUser, id: string) => {
  const photo = await loadOwnPhoto(actor, id);
  if (photo.status === "deleted") return { photo: toPhotoDto(photo) };
  const updated = await db.photo.update({ where: { id: photo.id }, data: { status: "deleted", deletedAt: new Date() } });
  return { photo: toPhotoDto(updated) };
};

export const restorePhoto = async (actor: AuthenticatedUser, id: string, now = new Date()) => {
  const photo = await loadOwnPhoto(actor, id);
  if (photo.status !== "deleted") return { photo: toPhotoDto(photo) };
  const deletedAt = photo.deletedAt ? new Date(photo.deletedAt).getTime() : 0;
  if (now.getTime() - deletedAt > PHOTO_RETENTION_DAYS * 24 * 60 * 60 * 1000) {
    throw new HttpError(410, "This photo was deleted more than 30 days ago.");
  }
  const updated = await db.photo.update({ where: { id: photo.id }, data: { status: "ready", deletedAt: null } });
  return { photo: toPhotoDto(updated) };
};

// --- Purge ------------------------------------------------------------------------------------

/**
 * Whether any live animal of the owner still points at this photo. One picture can sit on several
 * animals (the checksum dedupe makes them one row), so a delete on one card must not take the
 * bytes from the others. Raw SQL because the reference is somewhere inside a JSON payload.
 */
export const photoStillReferenced = async (ownerUserId: string, photoId: string): Promise<boolean> => {
  const rows = await prisma.$queryRaw<Array<{ found: number }>>`
    SELECT 1 AS found FROM "Animal"
    WHERE "ownerId" = ${ownerUserId} AND "deletedAt" IS NULL AND payload::text LIKE ${`%"photo:${photoId}"%`}
    LIMIT 1`;
  return rows.length > 0;
};

export type PurgeResult = { purged: number; kept: number; abandoned: number; dryRun: boolean };

/**
 * Hard-deletes photos soft-deleted more than 30 days ago, and uploads abandoned before completing.
 * Run by hand or from a scheduler (scripts/purgeDeletedPhotos.ts); nothing calls it on its own.
 */
export const purgeDeletedPhotos = async (
  options: { now?: Date; dryRun?: boolean; isReferenced?: typeof photoStillReferenced; batchSize?: number } = {}
): Promise<PurgeResult> => {
  const now = options.now || new Date();
  const dryRun = Boolean(options.dryRun);
  const isReferenced = options.isReferenced || photoStillReferenced;
  const storage = getUploadStorage();
  const result: PurgeResult = { purged: 0, kept: 0, abandoned: 0, dryRun };

  const cutoff = new Date(now.getTime() - PHOTO_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const due = await db.photo.findMany({
    where: { status: "deleted", deletedAt: { lt: cutoff } },
    take: options.batchSize || 500,
  });
  for (const photo of due) {
    if (await isReferenced(photo.ownerUserId, photo.id)) {
      // Still on an animal somewhere: the delete was one card's, not the photo's.
      result.kept += 1;
      if (!dryRun) await db.photo.update({ where: { id: photo.id }, data: { status: "ready", deletedAt: null } });
      continue;
    }
    result.purged += 1;
    if (dryRun) continue;
    await storage.deleteObjects([photo.storageKey, photo.thumbKey].filter(Boolean));
    await db.photo.delete({ where: { id: photo.id } });
  }

  const abandonedBefore = new Date(now.getTime() - PENDING_ABANDONED_HOURS * 60 * 60 * 1000);
  const abandoned = await db.photo.findMany({
    where: { status: "pending", createdAt: { lt: abandonedBefore } },
    take: options.batchSize || 500,
  });
  for (const photo of abandoned) {
    result.abandoned += 1;
    if (dryRun) continue;
    await storage.deleteObjects([photo.storageKey, photo.thumbKey].filter(Boolean));
    await db.photo.delete({ where: { id: photo.id } });
  }
  return result;
};
