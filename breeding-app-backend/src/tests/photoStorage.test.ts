import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

/**
 * Cloud photo storage: ownership, dedupe by checksum, soft delete and restore, the purge, signed
 * URL issuance against a stubbed Supabase bucket, and the local driver end to end through the API.
 */

vi.mock("../lib/prisma", async () => {
  const { createInMemoryPrisma } = await import("./support/inMemoryPrisma");
  return { prisma: createInMemoryPrisma() };
});

vi.mock("../services/subscriptionService", () => ({
  canAccessFeature: vi.fn(async () => ({ allowed: true, featureKey: "animals.photos", source: "unconfigured", tier: "Unconfigured" })),
}));

vi.mock("../services/securityEventService", () => ({ recordSecurityEvent: vi.fn(async () => undefined) }));

import { prisma } from "../lib/prisma";
import { app } from "../app";
import { canAccessFeature } from "../services/subscriptionService";
import {
  completePhotoUpload,
  createPhotoUploadUrl,
  deletePhoto,
  detectPhotoMimeType,
  getPhotoUrls,
  getPhotoUrlsBatch,
  listPhotos,
  purgeDeletedPhotos,
  restorePhoto,
} from "../services/photoService";
import { createMarketplaceMediaFromPhoto, readMarketplaceMediaObject } from "../services/marketplaceRuntimeService";
import {
  LocalUploadStorage,
  SupabaseUploadStorage,
  describeStorageConfig,
  resolveStorageDriver,
  setUploadStorageForTests,
  type SupabaseBucketApi,
  type UploadStorage,
} from "../services/uploadStorageService";
import { signAuthToken } from "../utils/jwt";

const db = prisma as any;
const OWNER = { id: "user_owner", role: "breeder" } as any;
const OTHER = { id: "user_other", role: "breeder" } as any;
const ADMIN = { id: "user_admin", role: "admin" } as any;

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(60, 7)]);
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0, 0, 0, 0]), Buffer.from("WEBP"), Buffer.alloc(20, 1)]);
const CHECKSUM_A = "a".repeat(64);
const CHECKSUM_B = "b".repeat(64);

const uploadRequest = (overrides: Record<string, unknown> = {}) => ({
  animalId: "26-F-186",
  kind: "gallery",
  mimeType: "image/jpeg",
  sizeBytes: JPEG.length,
  checksum: CHECKSUM_A,
  ...overrides,
});

/** An in-memory object store with the driver interface, signing like Supabase does. */
const memoryStorage = (): UploadStorage & { objects: Map<string, Buffer> } => {
  const objects = new Map<string, Buffer>();
  return {
    driver: "supabase",
    objects,
    putObject: vi.fn(async ({ key, buffer }) => {
      objects.set(key, buffer);
      return { storageKey: key, checksum: "x", sizeBytes: buffer.length };
    }),
    getObject: vi.fn(async (key: string) => {
      const value = objects.get(key);
      if (!value) throw new Error("missing");
      return value;
    }),
    readObjectHead: vi.fn(async (key: string, length: number) => objects.get(key)?.subarray(0, length) ?? null),
    headObject: vi.fn(async (key: string) => (objects.has(key) ? { sizeBytes: objects.get(key)!.length, contentType: null } : null)),
    copyObject: vi.fn(async (from: string, to: string) => {
      objects.set(to, objects.get(from)!);
    }),
    deleteObjects: vi.fn(async (keys: string[]) => {
      keys.forEach((key) => objects.delete(key));
    }),
    deletePrefix: vi.fn(async () => 0),
    createSignedUploadUrl: vi.fn(async (key: string, contentType: string) => ({
      method: "PUT" as const,
      url: `https://project.supabase.co/storage/v1/object/upload/sign/user-media/${key}?token=t`,
      headers: { "Content-Type": contentType, "x-upsert": "true" },
    })),
    createSignedReadUrl: vi.fn(async (key: string, ttl: number) => `https://project.supabase.co/storage/v1/object/sign/user-media/${key}?token=r&ttl=${ttl}`),
  };
};

let storage: ReturnType<typeof memoryStorage>;

beforeEach(async () => {
  db.$reset();
  vi.mocked(canAccessFeature).mockResolvedValue({ allowed: true, featureKey: "animals.photos", source: "unconfigured", tier: "Unconfigured" } as any);
  storage = memoryStorage();
  setUploadStorageForTests(storage);
  for (const user of [OWNER, OTHER, ADMIN]) {
    await db.user.create({ data: { id: user.id, email: `${user.id}@example.com`, passwordHash: "x", fullName: user.id, role: user.role } });
  }
});

afterEach(() => {
  setUploadStorageForTests(null);
  delete process.env.STORAGE_DRIVER;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

/** Upload-url, put the bytes where it says, complete. */
const storePhoto = async (actor = OWNER, overrides: Record<string, unknown> = {}, bytes = JPEG) => {
  const started = await createPhotoUploadUrl(actor, uploadRequest(overrides));
  if (started.alreadyUploaded) return started.photo;
  storage.objects.set((await db.photo.findUnique({ where: { id: started.photo.id } })).storageKey, bytes);
  return (await completePhotoUpload(actor, started.photo.id)).photo;
};

describe("upload", () => {
  it("issues a signed upload URL into the owner's own folder", async () => {
    const result: any = await createPhotoUploadUrl(OWNER, uploadRequest());
    expect(result.alreadyUploaded).toBe(false);
    expect(result.photo.status).toBe("pending");
    expect(result.photo.ref).toBe(`photo:${result.photo.id}`);
    const row = await db.photo.findUnique({ where: { id: result.photo.id } });
    expect(row.storageKey).toBe(`users/user_owner/animals/26-F-186/${result.photo.id}.jpg`);
    expect(row.thumbKey).toBe(`users/user_owner/animals/26-F-186/${result.photo.id}.thumb.webp`);
    expect(result.upload).toMatchObject({ method: "PUT", viaBackend: false });
    expect(result.upload.url).toContain(row.storageKey);
    expect(result.thumbUpload.url).toContain(row.thumbKey);
  });

  it("returns the existing photo for a checksum this owner already stored", async () => {
    const first = await storePhoto();
    const again: any = await createPhotoUploadUrl(OWNER, uploadRequest({ animalId: "another-animal" }));
    expect(again.alreadyUploaded).toBe(true);
    expect(again.photo.id).toBe(first.id);
    expect(again.upload).toBeUndefined();
    expect(await db.photo.count()).toBe(1);
  });

  it("does not share a checksum across owners", async () => {
    const mine = await storePhoto();
    const theirs: any = await createPhotoUploadUrl(OTHER, uploadRequest());
    expect(theirs.alreadyUploaded).toBe(false);
    expect(theirs.photo.id).not.toBe(mine.id);
  });

  it("rejects a declared type outside the allow-list and an oversized photo", async () => {
    await expect(createPhotoUploadUrl(OWNER, uploadRequest({ mimeType: "image/gif" }))).rejects.toMatchObject({ statusCode: 400 });
    await expect(createPhotoUploadUrl(OWNER, uploadRequest({ sizeBytes: 50 * 1024 * 1024 }))).rejects.toMatchObject({ statusCode: 413 });
    await expect(createPhotoUploadUrl(OWNER, uploadRequest({ checksum: "nope" }))).rejects.toMatchObject({ statusCode: 400 });
  });

  it("refuses when the tier gate says the quota is used up", async () => {
    vi.mocked(canAccessFeature).mockResolvedValueOnce({ allowed: false, reason: "Usage limit reached", currentUsage: 50, limit: 50 } as any);
    await expect(createPhotoUploadUrl(OWNER, uploadRequest())).rejects.toMatchObject({ statusCode: 403, details: { code: "PHOTO_QUOTA" } });
  });

  it("enforces the hard per-user cap on top of the tier", async () => {
    process.env.PHOTO_MAX_PER_USER = "1";
    try {
      await storePhoto();
      await expect(createPhotoUploadUrl(OWNER, uploadRequest({ checksum: CHECKSUM_B }))).rejects.toMatchObject({ statusCode: 403 });
    } finally {
      delete process.env.PHOTO_MAX_PER_USER;
    }
  });

  describe("photos per animal", () => {
    const FREE = { allowed: true, featureKey: "animals.photos", source: "tier", tier: "Free", currentUsage: 0, limit: 3 };
    const checksum = (n: number) => n.toString(16).padStart(64, "0");
    const AFTER_LIMITS = "2026-11-01T10:00:00.000Z";

    afterEach(() => {
      delete process.env.PHOTO_MAX_PER_ANIMAL;
      delete process.env.PHOTO_LIMITS_FROM;
    });

    it("stops a fourth photo on one animal under a three-per-animal tier, and says why", async () => {
      vi.mocked(canAccessFeature).mockResolvedValue(FREE as any);
      for (let n = 1; n <= 3; n += 1) await storePhoto(OWNER, { checksum: checksum(n), addedAt: AFTER_LIMITS });
      await expect(createPhotoUploadUrl(OWNER, uploadRequest({ checksum: checksum(4), addedAt: AFTER_LIMITS }))).rejects.toMatchObject({
        statusCode: 403,
        details: { code: "PHOTO_QUOTA", scope: "animal", animalId: "26-F-186", currentUsage: 3, limit: 3, tier: "Free" },
      });
    });

    it("counts each animal on its own", async () => {
      vi.mocked(canAccessFeature).mockResolvedValue(FREE as any);
      for (let n = 1; n <= 3; n += 1) await storePhoto(OWNER, { checksum: checksum(n), addedAt: AFTER_LIMITS });
      const other: any = await createPhotoUploadUrl(OWNER, uploadRequest({ animalId: "26-M-001", checksum: checksum(9), addedAt: AFTER_LIMITS }));
      expect(other.alreadyUploaded).toBe(false);
    });

    it("frees a place as soon as a photo is removed", async () => {
      vi.mocked(canAccessFeature).mockResolvedValue(FREE as any);
      const stored = [];
      for (let n = 1; n <= 3; n += 1) stored.push(await storePhoto(OWNER, { checksum: checksum(n), addedAt: AFTER_LIMITS }));
      await deletePhoto(OWNER, stored[0].id);
      const next: any = await createPhotoUploadUrl(OWNER, uploadRequest({ checksum: checksum(4), addedAt: AFTER_LIMITS }));
      expect(next.alreadyUploaded).toBe(false);
    });

    it("still hands back a photo it already holds, full or not", async () => {
      vi.mocked(canAccessFeature).mockResolvedValue(FREE as any);
      const stored = [];
      for (let n = 1; n <= 3; n += 1) stored.push(await storePhoto(OWNER, { checksum: checksum(n), addedAt: AFTER_LIMITS }));
      const again: any = await createPhotoUploadUrl(OWNER, uploadRequest({ checksum: checksum(2), addedAt: AFTER_LIMITS }));
      expect(again).toMatchObject({ alreadyUploaded: true, photo: { id: stored[1].id } });
    });

    it("does not count a listing's own photos or scanned papers against the animal", async () => {
      vi.mocked(canAccessFeature).mockResolvedValue(FREE as any);
      for (let n = 1; n <= 3; n += 1) await storePhoto(OWNER, { checksum: checksum(n), addedAt: AFTER_LIMITS });
      const paper: any = await createPhotoUploadUrl(OWNER, uploadRequest({ kind: "document", checksum: checksum(7), addedAt: AFTER_LIMITS }));
      expect(paper.alreadyUploaded).toBe(false);
    });

    it("lets a photo taken before the limits came in reach storage, so it never stays on one device", async () => {
      vi.mocked(canAccessFeature).mockResolvedValue(FREE as any);
      for (let n = 1; n <= 3; n += 1) await storePhoto(OWNER, { checksum: checksum(n), addedAt: AFTER_LIMITS });
      const older: any = await createPhotoUploadUrl(OWNER, uploadRequest({ checksum: checksum(5), addedAt: "2026-09-01T08:00:00.000Z" }));
      expect(older.alreadyUploaded).toBe(false);
      // A photo with no date is treated as new.
      await expect(createPhotoUploadUrl(OWNER, uploadRequest({ checksum: checksum(6) }))).rejects.toMatchObject({ details: { scope: "animal" } });
    });

    it("holds even the older photos and the unlimited tiers to the technical cap", async () => {
      process.env.PHOTO_MAX_PER_ANIMAL = "2";
      vi.mocked(canAccessFeature).mockResolvedValue({ ...FREE, tier: "Enterprise", limit: null } as any);
      await storePhoto(OWNER, { checksum: checksum(1), addedAt: AFTER_LIMITS });
      await storePhoto(OWNER, { checksum: checksum(2), addedAt: "2026-09-01T08:00:00.000Z" });
      await expect(createPhotoUploadUrl(OWNER, uploadRequest({ checksum: checksum(3), addedAt: "2026-09-01T08:00:00.000Z" }))).rejects.toMatchObject({
        details: { code: "PHOTO_QUOTA", scope: "animal", limit: 2 },
      });
    });

    it("refuses a tier without photos (a lab) for every animal", async () => {
      vi.mocked(canAccessFeature).mockResolvedValue({ allowed: false, featureKey: "animals.photos", reason: "Feature is not included in the current tier" } as any);
      await expect(createPhotoUploadUrl(OWNER, uploadRequest())).rejects.toMatchObject({ details: { code: "PHOTO_QUOTA", scope: "plan" } });
    });
  });

  it("complete marks the photo ready after checking the bytes", async () => {
    const photo = await storePhoto();
    expect(photo.status).toBe("ready");
    expect(photo.mimeType).toBe("image/jpeg");
    expect(photo.sizeBytes).toBe(JPEG.length);
    // No thumbnail was put, so the photo stands on its own.
    expect(photo.hasThumb).toBe(false);
  });

  it("complete refuses a photo whose bytes never arrived", async () => {
    const started: any = await createPhotoUploadUrl(OWNER, uploadRequest());
    await expect(completePhotoUpload(OWNER, started.photo.id)).rejects.toMatchObject({ statusCode: 409 });
  });

  it("complete removes an upload that is not an image", async () => {
    const started: any = await createPhotoUploadUrl(OWNER, uploadRequest());
    const row = await db.photo.findUnique({ where: { id: started.photo.id } });
    storage.objects.set(row.storageKey, Buffer.from("<html>not a photo</html>"));
    await expect(completePhotoUpload(OWNER, started.photo.id)).rejects.toMatchObject({ statusCode: 400 });
    expect(storage.objects.has(row.storageKey)).toBe(false);
    expect(await db.photo.findUnique({ where: { id: started.photo.id } })).toBeNull();
  });

  it("only the owner can complete", async () => {
    const started: any = await createPhotoUploadUrl(OWNER, uploadRequest());
    await expect(completePhotoUpload(OTHER, started.photo.id)).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("reading", () => {
  it("signs a short-lived read URL for the photo and its thumbnail", async () => {
    const started: any = await createPhotoUploadUrl(OWNER, uploadRequest());
    const row = await db.photo.findUnique({ where: { id: started.photo.id } });
    storage.objects.set(row.storageKey, JPEG);
    storage.objects.set(row.thumbKey, WEBP);
    await completePhotoUpload(OWNER, started.photo.id);

    const urls = await getPhotoUrls(OWNER, started.photo.id);
    expect(urls.url).toContain(row.storageKey);
    expect(urls.url).toContain("ttl=600");
    expect(urls.thumbUrl).toContain(row.thumbKey);
    expect(new Date(urls.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("is owner-only, with admins allowed to read", async () => {
    const photo = await storePhoto();
    await expect(getPhotoUrls(OTHER, photo.id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(getPhotoUrls(ADMIN, photo.id)).resolves.toMatchObject({ id: photo.id });
  });

  it("does not sign a photo that has not finished uploading", async () => {
    const started: any = await createPhotoUploadUrl(OWNER, uploadRequest());
    await expect(getPhotoUrls(OWNER, started.photo.id)).rejects.toMatchObject({ statusCode: 409 });
  });

  it("batches, leaving out what the caller cannot read", async () => {
    const mine = await storePhoto();
    const theirs = await storePhoto(OTHER, { checksum: CHECKSUM_B });
    const result = await getPhotoUrlsBatch(OWNER, [mine.id, theirs.id, "missing"]);
    expect(result.photos.map((photo) => photo.id)).toEqual([mine.id]);
  });

  it("lists an animal's photos", async () => {
    await storePhoto();
    await storePhoto(OWNER, { checksum: CHECKSUM_B, animalId: "other" });
    expect((await listPhotos(OWNER, { animalId: "26-F-186" })).photos).toHaveLength(1);
    expect((await listPhotos(OWNER)).photos).toHaveLength(2);
    expect((await listPhotos(OTHER)).photos).toHaveLength(0);
  });
});

describe("delete, restore and purge", () => {
  it("soft-deletes, still resolves for the owner, and restores within 30 days", async () => {
    const photo = await storePhoto();
    const deleted = await deletePhoto(OWNER, photo.id);
    expect(deleted.photo.status).toBe("deleted");
    expect((await listPhotos(OWNER)).photos).toHaveLength(0);
    await expect(getPhotoUrls(OWNER, photo.id)).resolves.toMatchObject({ status: "deleted" });
    expect((await restorePhoto(OWNER, photo.id)).photo.status).toBe("ready");
  });

  it("refuses a restore after 30 days", async () => {
    const photo = await storePhoto();
    await deletePhoto(OWNER, photo.id);
    const later = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000);
    await expect(restorePhoto(OWNER, photo.id, later)).rejects.toMatchObject({ statusCode: 410 });
  });

  it("only the owner can delete", async () => {
    const photo = await storePhoto();
    await expect(deletePhoto(OTHER, photo.id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(deletePhoto(ADMIN, photo.id)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("uploading the same bytes again brings a deleted photo back", async () => {
    const photo = await storePhoto();
    await deletePhoto(OWNER, photo.id);
    const again: any = await createPhotoUploadUrl(OWNER, uploadRequest());
    expect(again.alreadyUploaded).toBe(true);
    expect(again.photo).toMatchObject({ id: photo.id, status: "ready" });
  });

  it("purges only what is past retention and no longer on any animal", async () => {
    const gone = await storePhoto();
    const stillUsed = await storePhoto(OWNER, { checksum: CHECKSUM_B });
    const recent = await storePhoto(OWNER, { checksum: "c".repeat(64) });
    await deletePhoto(OWNER, gone.id);
    await deletePhoto(OWNER, stillUsed.id);
    await deletePhoto(OWNER, recent.id);
    const goneKey = (await db.photo.findUnique({ where: { id: gone.id } })).storageKey;
    const now = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000);
    // `recent` was deleted "now" in this frame, so move only the first two back in time.
    await db.photo.update({ where: { id: recent.id }, data: { deletedAt: now } });

    const isReferenced = vi.fn(async (_owner: string, id: string) => id === stillUsed.id);
    const dry = await purgeDeletedPhotos({ now, dryRun: true, isReferenced });
    expect(dry).toMatchObject({ purged: 1, kept: 1, dryRun: true });
    expect(storage.objects.has(goneKey)).toBe(true);

    const applied = await purgeDeletedPhotos({ now, isReferenced });
    expect(applied).toMatchObject({ purged: 1, kept: 1 });
    expect(await db.photo.findUnique({ where: { id: gone.id } })).toBeNull();
    expect(storage.objects.has(goneKey)).toBe(false);
    expect((await db.photo.findUnique({ where: { id: stillUsed.id } })).status).toBe("ready");
    expect((await db.photo.findUnique({ where: { id: recent.id } })).status).toBe("deleted");
  });

  it("clears uploads abandoned before they completed", async () => {
    const started: any = await createPhotoUploadUrl(OWNER, uploadRequest());
    const later = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    const result = await purgeDeletedPhotos({ now: later, isReferenced: async () => false });
    expect(result.abandoned).toBe(1);
    expect(await db.photo.findUnique({ where: { id: started.photo.id } })).toBeNull();
  });
});

describe("marketplace from an existing photo", () => {
  it("copies the photo into the seller's marketplace folder without a re-upload", async () => {
    const photo = await storePhoto();
    const { media } = await createMarketplaceMediaFromPhoto(OWNER, { photoId: `photo:${photo.id}` });
    const row = await db.marketplaceMedia.findUnique({ where: { id: media.id } });
    expect(row.storageKey).toBe(`users/user_owner/marketplace/${media.id}.jpg`);
    expect(storage.copyObject).toHaveBeenCalledWith(expect.stringContaining("/animals/"), row.storageKey);
    expect(storage.putObject).not.toHaveBeenCalled();
    // A second pick of the same photo reuses the copy.
    const again = await createMarketplaceMediaFromPhoto(OWNER, { photoId: photo.id });
    expect(again.media.id).toBe(media.id);
  });

  it("refuses another breeder's photo", async () => {
    const photo = await storePhoto();
    await expect(createMarketplaceMediaFromPhoto(OTHER, { photoId: photo.id })).rejects.toMatchObject({ statusCode: 404 });
  });

  it("serves a published listing's photo to anyone, through a signed redirect", async () => {
    const photo = await storePhoto();
    const { media } = await createMarketplaceMediaFromPhoto(OWNER, { photoId: photo.id });
    const listing = await db.marketplaceListing.create({ data: { sellerUserId: OWNER.id, title: "Runa", status: "draft" } });
    await db.marketplaceMedia.update({ where: { id: media.id }, data: { listingId: listing.id } });
    // A draft's photo is the seller's alone.
    await expect(readMarketplaceMediaObject(media.id, null)).rejects.toMatchObject({ statusCode: 404 });
    expect((await readMarketplaceMediaObject(media.id, OWNER)).redirectUrl).toBeTruthy();

    await db.marketplaceListing.update({ where: { id: listing.id }, data: { status: "available" } });
    const read = await readMarketplaceMediaObject(media.id, null);
    expect(read.redirectUrl).toContain(`users/user_owner/marketplace/${media.id}.jpg`);
    expect(read.buffer).toBeUndefined();
  });
});

describe("format detection", () => {
  it("knows the allowed formats by their magic bytes", () => {
    expect(detectPhotoMimeType(JPEG)).toBe("image/jpeg");
    expect(detectPhotoMimeType(WEBP)).toBe("image/webp");
    expect(detectPhotoMimeType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]))).toBe("image/png");
    expect(detectPhotoMimeType(Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypheic"), Buffer.alloc(4)]))).toBe("image/heic");
    expect(detectPhotoMimeType(Buffer.from("GIF89a......"))).toBe("");
  });
});

describe("driver selection", () => {
  it("defaults to local without Supabase keys, and to supabase with them", () => {
    expect(resolveStorageDriver()).toBe("local");
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
    expect(resolveStorageDriver()).toBe("supabase");
    process.env.STORAGE_DRIVER = "local";
    expect(resolveStorageDriver()).toBe("local");
  });

  it("refuses supabase without its keys rather than writing to local disk", () => {
    process.env.STORAGE_DRIVER = "supabase";
    expect(() => resolveStorageDriver()).toThrow(/SUPABASE_URL/);
    expect(describeStorageConfig()).toContain("MISCONFIGURED");
  });

  it("never prints the service-role key", () => {
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "super-secret-service-role";
    const line = describeStorageConfig();
    expect(line).toContain("driver=supabase");
    expect(line).toContain("project.supabase.co");
    expect(line).not.toContain("super-secret");
  });
});

describe("Supabase driver against a stubbed bucket", () => {
  const bucket = (): SupabaseBucketApi & Record<string, any> => ({
    upload: vi.fn(async () => ({ data: {}, error: null })),
    download: vi.fn(async () => ({ data: new Blob([JPEG]), error: null })),
    info: vi.fn(async () => ({ data: { size: 64, contentType: "image/jpeg" }, error: null })),
    list: vi.fn(async () => ({ data: [], error: null })),
    copy: vi.fn(async () => ({ data: {}, error: null })),
    remove: vi.fn(async () => ({ data: {}, error: null })),
    createSignedUploadUrl: vi.fn(async (path: string) => ({ data: { signedUrl: `https://s/upload/${path}?token=u`, token: "u", path }, error: null })),
    createSignedUrl: vi.fn(async (path: string, ttl: number) => ({ data: { signedUrl: `https://s/read/${path}?ttl=${ttl}` }, error: null })),
  });

  it("signs uploads and reads, and checks the format with a ranged read", async () => {
    const api = bucket();
    const fetchImpl = vi.fn(async () => new Response(JPEG.subarray(0, 16), { status: 206 }));
    const driver = new SupabaseUploadStorage(api, fetchImpl as any);
    expect(await driver.createSignedUploadUrl("users/u/a/p.jpg", "image/jpeg")).toEqual({
      method: "PUT",
      url: "https://s/upload/users/u/a/p.jpg?token=u",
      headers: { "Content-Type": "image/jpeg", "x-upsert": "true" },
    });
    expect(await driver.createSignedReadUrl("users/u/a/p.jpg", 600)).toBe("https://s/read/users/u/a/p.jpg?ttl=600");
    expect(await driver.headObject("users/u/a/p.jpg")).toEqual({ sizeBytes: 64, contentType: "image/jpeg" });
    const head = await driver.readObjectHead("users/u/a/p.jpg", 16);
    expect(detectPhotoMimeType(head)).toBe("image/jpeg");
    expect(fetchImpl).toHaveBeenCalledWith(expect.any(String), { headers: { Range: "bytes=0-15" } });
  });

  it("walks a user's folder when an account is purged", async () => {
    const api = bucket();
    api.list = vi.fn(async (folder: string) => ({
      data: folder === "users/u"
        ? [{ name: "animals", id: null, metadata: null }]
        : folder === "users/u/animals"
          ? [{ name: "a1", id: null, metadata: null }]
          : [{ name: "p.jpg", id: "1", metadata: { size: 3 } }, { name: "p.thumb.webp", id: "2", metadata: { size: 1 } }],
      error: null,
    }));
    const driver = new SupabaseUploadStorage(api);
    expect(await driver.deletePrefix("users/u")).toBe(2);
    expect(api.remove).toHaveBeenCalledWith(["users/u/animals/a1/p.jpg", "users/u/animals/a1/p.thumb.webp"]);
  });

  it("surfaces a storage error instead of pretending it worked", async () => {
    const api = bucket();
    api.copy = vi.fn(async () => ({ data: null, error: { message: "Object not found" } }));
    await expect(new SupabaseUploadStorage(api).copyObject("a", "b")).rejects.toThrow(/Object not found/);
  });
});

describe("local driver through the API", () => {
  let dir: string;
  const token = (user: any) => signAuthToken({ sub: user.id, email: `${user.id}@example.com`, role: user.role, persistedRole: user.role, portal: "breeder" } as any);

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "photos-"));
    process.env.UPLOAD_STORAGE_DIR = dir;
    setUploadStorageForTests(new LocalUploadStorage());
  });

  afterEach(() => {
    delete process.env.UPLOAD_STORAGE_DIR;
    rmSync(dir, { recursive: true, force: true });
  });

  it("uploads through the backend, completes, and serves a signed link an <img> can load", async () => {
    const auth = `Bearer ${token(OWNER)}`;
    const started = await request(app).post("/api/photos/upload-url").set("Authorization", auth).send(uploadRequest());
    expect(started.status).toBe(201);
    expect(started.body.upload).toMatchObject({ viaBackend: true, url: `/api/photos/${started.body.photo.id}/object` });

    const put = await request(app).put(started.body.upload.url).set("Authorization", auth).set("Content-Type", "image/jpeg").send(JPEG);
    expect(put.status).toBe(200);

    const complete = await request(app).post(`/api/photos/${started.body.photo.id}/complete`).set("Authorization", auth).send({ width: 800, height: 600 });
    expect(complete.status).toBe(200);
    expect(complete.body.photo).toMatchObject({ status: "ready", width: 800, height: 600 });

    const urls = await request(app).get(`/api/photos/${started.body.photo.id}/url`).set("Authorization", auth);
    expect(urls.status).toBe(200);
    // No Authorization header: the signature is the permission.
    const image = await request(app).get(urls.body.url);
    expect(image.status).toBe(200);
    expect(image.headers["content-type"]).toBe("image/jpeg");
    expect(image.headers["cross-origin-resource-policy"]).toBe("cross-origin");
    expect(Buffer.compare(image.body, JPEG)).toBe(0);

    const tampered = await request(app).get(urls.body.url.replace(/sig=[^&]+/, "sig=forged"));
    expect(tampered.status).toBe(403);
  });

  it("keeps other breeders out", async () => {
    const started = await request(app).post("/api/photos/upload-url").set("Authorization", `Bearer ${token(OWNER)}`).send(uploadRequest());
    const put = await request(app)
      .put(started.body.upload.url)
      .set("Authorization", `Bearer ${token(OTHER)}`)
      .set("Content-Type", "image/jpeg")
      .send(JPEG);
    expect(put.status).toBe(404);
    const anonymous = await request(app).post("/api/photos/upload-url").send(uploadRequest());
    expect(anonymous.status).toBe(401);
  });
});
