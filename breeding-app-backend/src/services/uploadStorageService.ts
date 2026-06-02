import { createHash, randomUUID } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import { join } from "path";

export type StoredUpload = {
  storageKey: string;
  checksum: string;
  sizeBytes: number;
};

export type UploadStorage = {
  putObject(input: { ownerUserId: string; buffer: Buffer; originalName?: string }): Promise<StoredUpload>;
  getObject(storageKey: string): Promise<Buffer>;
};

const uploadRoot = () => process.env.UPLOAD_STORAGE_DIR || join(process.cwd(), "storage", "uploads");

const safeName = (value?: string): string =>
  String(value || "upload.bin").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);

export class LocalUploadStorage implements UploadStorage {
  async putObject(input: { ownerUserId: string; buffer: Buffer; originalName?: string }): Promise<StoredUpload> {
    const ownerSegment = safeName(input.ownerUserId || "anonymous");
    const storageKey = `${ownerSegment}/${randomUUID()}-${safeName(input.originalName)}`;
    const fullPath = join(uploadRoot(), storageKey);
    await mkdir(join(uploadRoot(), ownerSegment), { recursive: true });
    await writeFile(fullPath, input.buffer);
    return {
      storageKey,
      checksum: createHash("sha256").update(input.buffer).digest("hex"),
      sizeBytes: input.buffer.length,
    };
  }

  async getObject(storageKey: string): Promise<Buffer> {
    return readFile(join(uploadRoot(), storageKey));
  }
}

export const uploadStorage: UploadStorage = new LocalUploadStorage();

