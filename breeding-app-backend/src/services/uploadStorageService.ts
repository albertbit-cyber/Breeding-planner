import { createHash, createHmac, randomUUID, timingSafeEqual } from "crypto";
import { mkdir, open, readFile, rm, stat, writeFile, copyFile } from "fs/promises";
import { dirname, join, resolve, sep } from "path";

/**
 * Where uploaded bytes live.
 *
 * Two drivers sit behind one interface. `supabase` keeps objects in a private Supabase Storage
 * bucket and hands clients short-lived signed URLs, so photo bytes never pass through this
 * process on their way in or out. `local` writes to UPLOAD_STORAGE_DIR for development and tests;
 * on a container host that directory is wiped by every deploy (the warning in app.ts), so it is
 * never the right choice for production.
 *
 * Every object a user owns lives under that user's own folder, `users/{userId}/...`. That folder
 * is the breeder's section of the bucket: the breeder app and the marketplace both reach it, and
 * only ever through this backend. The service-role key that can read the whole bucket stays here.
 */

export type StorageDriverName = "local" | "supabase";

export type StoredUpload = {
  storageKey: string;
  checksum: string;
  sizeBytes: number;
};

export type ObjectInfo = {
  sizeBytes: number;
  contentType: string | null;
};

export type SignedUpload = {
  method: "PUT";
  url: string;
  headers: Record<string, string>;
};

export interface UploadStorage {
  readonly driver: StorageDriverName;
  putObject(input: { key: string; buffer: Buffer; contentType: string }): Promise<StoredUpload>;
  getObject(key: string): Promise<Buffer>;
  /** The first `length` bytes, for checking an upload's magic bytes without downloading all of it. */
  readObjectHead(key: string, length: number): Promise<Buffer | null>;
  headObject(key: string): Promise<ObjectInfo | null>;
  copyObject(fromKey: string, toKey: string): Promise<void>;
  deleteObjects(keys: string[]): Promise<void>;
  /** Removes everything under a prefix. Used when an account is purged. */
  deletePrefix(prefix: string): Promise<number>;
  /** A URL the client uploads to directly, or null when uploads go through this backend. */
  createSignedUploadUrl(key: string, contentType: string): Promise<SignedUpload | null>;
  /** A URL the client reads from directly, or null when reads go through this backend. */
  createSignedReadUrl(key: string, ttlSeconds: number): Promise<string | null>;
}

export const SIGNED_READ_TTL_SECONDS = 10 * 60;

// --- Keys -----------------------------------------------------------------------------------------

/** One path segment: no separators, no dot-dot, nothing a URL or a filesystem would read twice. */
export const safeSegment = (value: unknown, fallback = "x"): string => {
  const cleaned = String(value ?? "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/^\.+/, "_")
    .slice(0, 120);
  return cleaned || fallback;
};

export const userFolder = (userId: string) => `users/${safeSegment(userId)}`;

export const animalPhotoKey = (userId: string, animalId: string | null | undefined, photoId: string, ext: string) =>
  `${userFolder(userId)}/animals/${safeSegment(animalId || "unassigned")}/${safeSegment(photoId)}.${safeSegment(ext, "bin")}`;

export const animalThumbKey = (userId: string, animalId: string | null | undefined, photoId: string) =>
  `${userFolder(userId)}/animals/${safeSegment(animalId || "unassigned")}/${safeSegment(photoId)}.thumb.webp`;

export const marketplaceMediaKey = (userId: string, mediaId: string, ext: string) =>
  `${userFolder(userId)}/marketplace/${safeSegment(mediaId)}.${safeSegment(ext, "bin")}`;

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/gif": "gif",
};

export const extensionForMime = (mimeType: string): string => EXTENSIONS[String(mimeType || "").toLowerCase()] || "bin";

// --- Local driver ---------------------------------------------------------------------------------

const uploadRoot = () => resolve(process.env.UPLOAD_STORAGE_DIR || join(process.cwd(), "storage", "uploads"));

/** Resolves a key under the upload root, refusing anything that would land outside it. */
const localPath = (key: string): string => {
  const root = uploadRoot();
  const full = resolve(root, key);
  if (full !== root && !full.startsWith(root + sep)) throw new Error("Storage key escapes the upload root.");
  return full;
};

const sha256 = (buffer: Buffer) => createHash("sha256").update(buffer).digest("hex");

export class LocalUploadStorage implements UploadStorage {
  readonly driver = "local" as const;

  async putObject(input: { key: string; buffer: Buffer; contentType: string }): Promise<StoredUpload> {
    const fullPath = localPath(input.key);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, input.buffer);
    return { storageKey: input.key, checksum: sha256(input.buffer), sizeBytes: input.buffer.length };
  }

  async getObject(key: string): Promise<Buffer> {
    return readFile(localPath(key));
  }

  async readObjectHead(key: string, length: number): Promise<Buffer | null> {
    try {
      const handle = await open(localPath(key), "r");
      try {
        const buffer = Buffer.alloc(length);
        const { bytesRead } = await handle.read(buffer, 0, length, 0);
        return buffer.subarray(0, bytesRead);
      } finally {
        await handle.close();
      }
    } catch {
      return null;
    }
  }

  async headObject(key: string): Promise<ObjectInfo | null> {
    try {
      const info = await stat(localPath(key));
      return info.isFile() ? { sizeBytes: info.size, contentType: null } : null;
    } catch {
      return null;
    }
  }

  async copyObject(fromKey: string, toKey: string): Promise<void> {
    const target = localPath(toKey);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(localPath(fromKey), target);
  }

  async deleteObjects(keys: string[]): Promise<void> {
    await Promise.all(keys.filter(Boolean).map((key) => rm(localPath(key), { force: true })));
  }

  async deletePrefix(prefix: string): Promise<number> {
    const target = localPath(prefix);
    const existed = await stat(target).then(() => 1, () => 0);
    await rm(target, { recursive: true, force: true });
    return existed;
  }

  // The local driver has no storage service of its own to sign for, so uploads go through
  // PUT /api/photos/:id/object and reads through a URL this backend signs (signLocalReadUrl).
  async createSignedUploadUrl(): Promise<SignedUpload | null> {
    return null;
  }

  async createSignedReadUrl(): Promise<string | null> {
    return null;
  }
}

// --- Supabase driver ------------------------------------------------------------------------------

/**
 * The slice of `@supabase/supabase-js`'s storage bucket API this driver uses. Typed here rather
 * than imported so tests can hand in a stub, and so the shape this code depends on is visible.
 */
export type SupabaseBucketApi = {
  upload(path: string, body: Buffer, options?: { contentType?: string; upsert?: boolean }): Promise<{ data: unknown; error: { message: string } | null }>;
  download(path: string): Promise<{ data: Blob | null; error: { message: string } | null }>;
  info?(path: string): Promise<{ data: { size?: number; contentType?: string; metadata?: Record<string, unknown> } | null; error: { message: string } | null }>;
  list(prefix: string, options?: { limit?: number; offset?: number; search?: string }): Promise<{ data: Array<{ name: string; id?: string | null; metadata?: Record<string, unknown> | null }> | null; error: { message: string } | null }>;
  copy(fromPath: string, toPath: string): Promise<{ data: unknown; error: { message: string } | null }>;
  remove(paths: string[]): Promise<{ data: unknown; error: { message: string } | null }>;
  createSignedUploadUrl(path: string, options?: { upsert?: boolean }): Promise<{ data: { signedUrl: string; token: string; path: string } | null; error: { message: string } | null }>;
  createSignedUrl(path: string, expiresIn: number): Promise<{ data: { signedUrl: string } | null; error: { message: string } | null }>;
};

const fail = (action: string, error: { message: string } | null) => {
  if (error) throw new Error(`[storage] ${action} failed: ${error.message}`);
};

export class SupabaseUploadStorage implements UploadStorage {
  readonly driver = "supabase" as const;

  constructor(private readonly bucket: SupabaseBucketApi, private readonly fetchImpl: typeof fetch = fetch) {}

  async putObject(input: { key: string; buffer: Buffer; contentType: string }): Promise<StoredUpload> {
    const { error } = await this.bucket.upload(input.key, input.buffer, { contentType: input.contentType, upsert: true });
    fail("upload", error);
    return { storageKey: input.key, checksum: sha256(input.buffer), sizeBytes: input.buffer.length };
  }

  async getObject(key: string): Promise<Buffer> {
    const { data, error } = await this.bucket.download(key);
    fail("download", error);
    if (!data) throw new Error("[storage] download returned no data");
    return Buffer.from(await data.arrayBuffer());
  }

  async readObjectHead(key: string, length: number): Promise<Buffer | null> {
    // A ranged read through a signed URL: checking an upload's format costs a few bytes of egress
    // rather than the whole photo.
    const url = await this.createSignedReadUrl(key, 60);
    if (!url) return null;
    const response = await this.fetchImpl(url, { headers: { Range: `bytes=0-${Math.max(0, length - 1)}` } });
    if (!response.ok) return null;
    return Buffer.from(await response.arrayBuffer()).subarray(0, length);
  }

  async headObject(key: string): Promise<ObjectInfo | null> {
    if (typeof this.bucket.info === "function") {
      const { data, error } = await this.bucket.info(key);
      if (error || !data) return null;
      const size = Number(data.size ?? data.metadata?.size);
      return {
        sizeBytes: Number.isFinite(size) ? size : 0,
        contentType: (data.contentType as string) || (data.metadata?.mimetype as string) || null,
      };
    }
    // Older clients have no info(); list the folder and find the object in it.
    const slash = key.lastIndexOf("/");
    const folder = slash >= 0 ? key.slice(0, slash) : "";
    const name = slash >= 0 ? key.slice(slash + 1) : key;
    const { data, error } = await this.bucket.list(folder, { limit: 10, search: name });
    if (error || !data) return null;
    const entry = data.find((item) => item.name === name);
    if (!entry) return null;
    const size = Number(entry.metadata?.size);
    return { sizeBytes: Number.isFinite(size) ? size : 0, contentType: (entry.metadata?.mimetype as string) || null };
  }

  async copyObject(fromKey: string, toKey: string): Promise<void> {
    const { error } = await this.bucket.copy(fromKey, toKey);
    fail("copy", error);
  }

  async deleteObjects(keys: string[]): Promise<void> {
    const list = keys.filter(Boolean);
    // Supabase caps a remove call at 1000 paths.
    for (let index = 0; index < list.length; index += 1000) {
      const { error } = await this.bucket.remove(list.slice(index, index + 1000));
      fail("remove", error);
    }
  }

  async deletePrefix(prefix: string): Promise<number> {
    // Storage has folders only as a naming convention, so this walks them.
    const files: string[] = [];
    const walk = async (folder: string) => {
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await this.bucket.list(folder, { limit: 1000, offset });
        fail("list", error);
        const rows = data || [];
        for (const row of rows) {
          const path = `${folder}/${row.name}`;
          // A folder entry has no id and no metadata.
          if (!row.id && !row.metadata) await walk(path);
          else files.push(path);
        }
        if (rows.length < 1000) break;
      }
    };
    await walk(prefix.replace(/\/+$/, ""));
    await this.deleteObjects(files);
    return files.length;
  }

  async createSignedUploadUrl(key: string, contentType: string): Promise<SignedUpload | null> {
    const { data, error } = await this.bucket.createSignedUploadUrl(key, { upsert: true });
    fail("createSignedUploadUrl", error);
    if (!data?.signedUrl) throw new Error("[storage] createSignedUploadUrl returned no URL");
    return { method: "PUT", url: data.signedUrl, headers: { "Content-Type": contentType, "x-upsert": "true" } };
  }

  async createSignedReadUrl(key: string, ttlSeconds: number): Promise<string | null> {
    const { data, error } = await this.bucket.createSignedUrl(key, ttlSeconds);
    fail("createSignedUrl", error);
    return data?.signedUrl || null;
  }
}

// --- Local signed reads ---------------------------------------------------------------------------
// An <img> cannot send a bearer token, so even the local driver needs a URL that carries its own
// permission. This mirrors what a Supabase signed URL does: the key and an expiry, signed.

const localSigningSecret = () => `photo-read:${process.env.JWT_SECRET || "dev-secret"}`;

const localSignature = (key: string, expiresAt: number) =>
  createHmac("sha256", localSigningSecret()).update(`${key}\n${expiresAt}`).digest("base64url");

export const signLocalReadUrl = (key: string, ttlSeconds: number, now = Date.now()): string => {
  const expiresAt = Math.floor(now / 1000) + ttlSeconds;
  const query = new URLSearchParams({ key, exp: String(expiresAt), sig: localSignature(key, expiresAt) });
  return `/api/photos/object?${query.toString()}`;
};

export const verifyLocalReadSignature = (key: string, exp: string, sig: string, now = Date.now()): boolean => {
  const expiresAt = Number(exp);
  if (!key || !Number.isFinite(expiresAt) || expiresAt * 1000 < now) return false;
  const expected = Buffer.from(localSignature(key, expiresAt));
  const given = Buffer.from(String(sig || ""));
  return expected.length === given.length && timingSafeEqual(expected, given);
};

// --- Selection ------------------------------------------------------------------------------------

export const mediaBucketName = () => (process.env.SUPABASE_MEDIA_BUCKET || "user-media").trim() || "user-media";

const supabaseConfigured = () => Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

/**
 * STORAGE_DRIVER picks the driver. Left unset, Supabase is used when its URL and service-role key
 * are both present and local disk otherwise, so a developer without a Supabase project still has
 * working uploads. Asking for supabase without the keys is a configuration error, not a reason to
 * write production photos to a disk that the next deploy wipes.
 */
export const resolveStorageDriver = (): StorageDriverName => {
  const requested = String(process.env.STORAGE_DRIVER || "").trim().toLowerCase();
  if (requested === "local") return "local";
  if (requested === "supabase") {
    if (!supabaseConfigured()) {
      throw new Error("STORAGE_DRIVER=supabase but SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing.");
    }
    return "supabase";
  }
  if (requested) throw new Error(`Unknown STORAGE_DRIVER "${requested}". Use "supabase" or "local".`);
  return supabaseConfigured() ? "supabase" : "local";
};

const createSupabaseStorage = (): SupabaseUploadStorage => {
  // Required lazily: the local driver (every test, every dev machine without Supabase) never
  // loads the client at all.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createClient } = require("@supabase/supabase-js");
  const client = createClient(process.env.SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return new SupabaseUploadStorage(client.storage.from(mediaBucketName()));
};

let active: UploadStorage | null = null;

export const getUploadStorage = (): UploadStorage => {
  if (!active) active = resolveStorageDriver() === "supabase" ? createSupabaseStorage() : new LocalUploadStorage();
  return active;
};

/** Tests swap the driver; null goes back to choosing from the environment. */
export const setUploadStorageForTests = (storage: UploadStorage | null) => {
  active = storage;
};

/** The one `[storage]` line the server prints at boot, like the `[mail]` line. Never prints a key. */
export const describeStorageConfig = (): string => {
  try {
    const driver = resolveStorageDriver();
    if (driver === "supabase") {
      let host = "";
      try {
        host = new URL(process.env.SUPABASE_URL as string).host;
      } catch {
        host = "invalid-url";
      }
      return `[storage] driver=supabase bucket=${mediaBucketName()} project=${host}`;
    }
    const warning = process.env.NODE_ENV === "production"
      ? " WARNING: local disk in production, uploads are lost on the next deploy unless UPLOAD_STORAGE_DIR is a mounted volume"
      : "";
    return `[storage] driver=local dir=${uploadRoot()}${warning}`;
  } catch (error) {
    return `[storage] MISCONFIGURED: ${(error as Error).message}`;
  }
};

/**
 * Kept for the marketplace code that predates the driver split: a proxy that resolves the driver
 * on first use, so importing this module never reads the environment at load time.
 */
export const uploadStorage: UploadStorage = new Proxy({} as UploadStorage, {
  get(_target, property) {
    const storage = getUploadStorage() as any;
    const value = storage[property];
    return typeof value === "function" ? value.bind(storage) : value;
  },
});

export const newObjectId = () => randomUUID().replace(/-/g, "");
