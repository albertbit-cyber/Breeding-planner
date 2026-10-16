# Runbook: photo storage (Supabase Storage)

Animal photos and marketplace listing photos live in object storage. Each
breeder has their own folder, records hold only a reference, and both the
breeder app and the marketplace reach the folder through the backend. This
replaces on-device-only photos (72 lost on 13 Oct 2026) and marketplace
uploads written to a container disk that every Railway deploy wiped.

---

## 1. How it fits together

```
user-media (private bucket)
└── users/{userId}/
    ├── animals/{animalId}/{photoId}.jpg          the photo
    ├── animals/{animalId}/{photoId}.thumb.webp   320 px thumbnail (optional)
    └── marketplace/{mediaId}.jpg                 listing photos
```

- **`photos` table** (`Photo` model): one row per stored photo. `checksum` is a
  sha256 hex of the picture as the device held it, unique per owner, so the
  same photo uploaded from two devices, or onto two animals, is stored once.
  Status `pending` → `ready` → (`deleted`, purged after 30 days).
- **Animal records** keep `photos: [{ id, url, photoId, ... }]` and `imageUrl`,
  but the value becomes `photo:{photoId}` once uploaded. It syncs like any short
  string, so every signed-in device sees the photo.
- **Marketplace** keeps its own `MarketplaceMedia` rows (least risky: listings,
  the publish transaction and `/api/marketplace/media/:id` are unchanged). New
  uploads go under `users/{userId}/marketplace/`. Picking an existing animal
  photo for a listing (`POST /api/marketplace/uploads/from-photo`) copies the
  object server-side into the marketplace folder: no re-upload, and a listing
  photo survives the animal photo being deleted. A published listing's photos
  are public; `/api/marketplace/media/:id` checks that rule and then redirects
  to a 10-minute signed URL.
- **The service-role key never leaves the backend.** Clients only ever get
  signed URLs: upload URLs from `createSignedUploadUrl`, read URLs from
  `createSignedUrl` (10 minutes).

### API (all `/api/photos`, breeder or admin session)

| Call | Does |
| --- | --- |
| `POST /upload-url` | `{ animalId, kind, mimeType, sizeBytes, checksum }`. Same checksum already stored for this owner: returns it (`alreadyUploaded: true`, a soft-deleted one is restored). Otherwise creates a `pending` row and returns signed upload URLs for the photo and its thumbnail. Quota: tier feature `animals.photos` plus the hard cap `PHOTO_MAX_PER_USER`. |
| `PUT <signed upload URL>` | The client sends the bytes straight to Supabase. |
| `POST /:id/complete` | Checks the object exists, its size, and its magic bytes (JPEG, PNG, WebP, HEIC). Anything else is deleted. Marks `ready`. |
| `GET /:id/url`, `POST /urls` | Signed read URLs (photo + thumbnail), one or up to 100 at a time. Owner or admin. |
| `GET /?animalId=` | List. |
| `DELETE /:id`, `POST /:id/restore` | Soft delete; restore within 30 days. |

### In the breeder app (web and APK, same code path)

1. A photo is shrunk on capture and stored inline as before, so it shows
   immediately and works offline.
2. After each successful cloud sync, signed in and online, the upload queue
   (`services/cloudPhotos.js`) sends inline photos up, 20 per pass, one at a
   time, and swaps the record value to `photo:{id}`. The next sync carries that
   to every device. The first pass is the one-time migration of every photo
   already on the device; checksum dedupe makes it safe on all devices at once.
3. The device keeps its own copy (`serpentoraPhotoCache` in the device store), so
   photos it took still show offline. Other devices use signed URLs, refreshed
   90 seconds before they expire.
4. **Backup files** (`.bpbackup`) embed the bytes of `photo:` photos, keeping
   `photoId` beside them, so an offline backup is complete. Restore accepts both
   inline photos and `photo:` references; restored inline photos go through the
   queue again and dedupe to the same stored photo.
5. Removing a photo soft-deletes it in storage unless another card shows the same
   stored photo. The purge checks again before deleting anything.

---

## 2. Owner to-do (in order)

Nothing below has been done. Do not skip step 4 before step 5: the backend
refuses to start uploads into a bucket that does not exist, but it will boot.

1. **Create a Supabase project** (supabase.com → New project). Region:
   **Central EU (Frankfurt), `eu-central-1`**; the controller (Qinti UG) is
   German, keep personal data in the EU. Organisation: Qinti UG. Any plan; the
   free plan includes 1 GB of storage.
2. **Copy two values** from Project Settings → API: the **Project URL** and the
   **`service_role` secret key**. Never put the service-role key in a frontend
   env var, a commit, or a chat. The `anon` key is not needed.
3. **Create the bucket**, either way:
   - Script (from `breeding-app-backend`, with the two values in your shell env):
     `npx tsx scripts/createPhotoBucket.ts`. Idempotent.
   - Or by hand: Storage → New bucket → name `user-media`, **Public bucket: off**,
     file size limit `10 MB`, allowed MIME types
     `image/jpeg, image/png, image/webp, image/heic`.
   - Or SQL editor:
     ```sql
     insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
     values ('user-media', 'user-media', false, 10485760,
             array['image/jpeg','image/png','image/webp','image/heic'])
     on conflict (id) do update set public = false,
       file_size_limit = excluded.file_size_limit,
       allowed_mime_types = excluded.allowed_mime_types;
     ```
   No storage RLS policies are needed: the bucket is private and only the
   service-role key (backend) and signed URLs touch it.
4. **Set env vars on Railway, staging first** (names only here):
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `STORAGE_DRIVER=supabase` (explicit, so missing keys fail loudly instead of
     falling back to local disk)
   - optional: `SUPABASE_MEDIA_BUCKET` (default `user-media`), `PHOTO_MAX_BYTES`
     (default 10 MB), `PHOTO_MAX_PER_USER` (default 20000)
5. **Deploy the branch to staging.** `start:migrate` applies migration
   `20261016120000_photos` (one new table, additive, nothing else touched).
   Check the boot log for exactly one line:
   `[storage] driver=supabase bucket=user-media project=<ref>.supabase.co`.
   `[storage] MISCONFIGURED: ...` means step 4 is incomplete.
6. **Check the tier gate.** Uploads go through feature `animals.photos`
   (a count feature). If the tier catalogue is seeded, make sure the free tier
   has `animals.photos` enabled with a sensible limit (or none), or every upload
   is refused with `PHOTO_QUOTA` and photos simply stay on devices.
7. **Smoke test on staging**: sign in on the web app, take a photo, wait for a
   sync, reload on a second browser: the photo shows there. Supabase → Storage
   should show `users/<id>/animals/...`.
8. Production: repeat 4–7 against the production service when ready. Photos
   uploaded to staging stay in the staging project; use a separate bucket or
   project per environment.
9. Optional, later: run `npx tsx scripts/purgeDeletedPhotos.ts` (dry run), then
   with `--apply`, monthly or from a Railway cron.

---

## 3. Switching driver, rollback

- `STORAGE_DRIVER=local` (or unset with no Supabase keys) writes to
  `UPLOAD_STORAGE_DIR`. Development only: a container deploy wipes it, and the
  boot line says so in production.
- **Rollback of the code**: redeploy the previous build. The `photos` table is
  ignored by old code. Records already holding `photo:` refs then show no image
  on devices without their own copy (the device that took the photo still has
  it in `serpentoraPhotoCache`, but the old build does not read it). Prefer
  rolling forward.
- **Rollback of the driver** (Supabase down): set `STORAGE_DRIVER=local`. New
  uploads go to local disk; existing `photo:` refs stop resolving until the
  driver is switched back. No data is deleted either way.
- **Rollback of the migration**: `DROP TABLE photos;` (nothing references it).
  Only after the code is rolled back.
- Old marketplace media rows from before this change point at keys on the old
  container disk; those files were already lost at the previous deploys.

## 4. Cost notes (Supabase pricing as of 2026, check before relying on it)

- Free plan: 1 GB storage, 2 GB egress/month. Pro (25 USD/month): 100 GB
  storage, then about 0.021 USD/GB-month; 250 GB egress, then about 0.09 USD/GB.
- Photos are shrunk to ~1600 px / ≤400 KB on capture, thumbnails ~20 KB.
  1,000 photos ≈ 0.4 GB. A breeder with 300 animals × 5 photos ≈ 0.6 GB.
- Egress: lists use thumbnails; full photos load only in the gallery and edit
  view. Signed URLs change every 10 minutes, so browser caching helps less than
  with public URLs; the capturing device reads its own copy.
- Account deletion removes the user's whole folder after the database purge
  (best effort, logged as `[account-deletion] stored files NOT removed` on
  failure).

## 5. Known limits

- A photo's checksum is what the client reports; the server checks format and
  size, not the hash. A lying client only harms its own dedupe.
- Photos of an animal that is deleted outright are not soft-deleted; they stay
  until a future cleanup (the purge only removes soft-deleted photos).
- An animal transferred through a marketplace sale does not carry the seller's
  `photo:` photos to the buyer (they are owner-only); same as inline photos before.
