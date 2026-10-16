/**
 * Creates (or brings into line) the private Supabase Storage bucket photos live in.
 *
 * Idempotent: an existing bucket is updated to these settings rather than recreated, so it is safe
 * to run again after changing the size limit. Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in
 * the environment; reads SUPABASE_MEDIA_BUCKET (default "user-media") and PHOTO_MAX_BYTES.
 *
 *   npx tsx scripts/createPhotoBucket.ts
 *
 * The bucket is private: nothing in it is reachable without a signed URL this backend issues. The
 * same settings can be made by hand in the Supabase console (docs/runbooks/photo-storage.md).
 */
import { createClient } from "@supabase/supabase-js";
import { mediaBucketName } from "../src/services/uploadStorageService";
import { PHOTO_MIME_TYPES, maxPhotoBytes } from "../src/services/photoService";

const main = async () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");

  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const bucket = mediaBucketName();
  const settings = {
    public: false,
    fileSizeLimit: maxPhotoBytes(),
    allowedMimeTypes: [...PHOTO_MIME_TYPES],
  };

  const existing = await client.storage.getBucket(bucket);
  if (existing.data) {
    const { error } = await client.storage.updateBucket(bucket, settings);
    if (error) throw error;
    console.log(`[photos:bucket] updated "${bucket}": private, limit ${settings.fileSizeLimit} bytes, ${settings.allowedMimeTypes.join(", ")}`);
    return;
  }
  const { error } = await client.storage.createBucket(bucket, settings);
  if (error) throw error;
  console.log(`[photos:bucket] created "${bucket}": private, limit ${settings.fileSizeLimit} bytes, ${settings.allowedMimeTypes.join(", ")}`);
};

main().catch((error) => {
  console.error("[photos:bucket] failed", error?.message || error);
  process.exitCode = 1;
});
