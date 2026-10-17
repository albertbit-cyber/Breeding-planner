import { prisma } from "../lib/prisma";
import { extensionForMime, marketplaceMediaKey, newObjectId, uploadStorage } from "./uploadStorageService";

/**
 * A listing shows its animal's photos.
 *
 * The breeder app used to put one picture on a card: the cover, uploaded from the device that took
 * it. The rest of the animal's photos never reached the listing, and publishing from another device
 * had nothing to upload. Now an animal's photos are in cloud storage and its synced record points
 * at them (`photo:{id}`), so the server can do this itself: every ready photo of the animal, cover
 * first, copied into the seller's marketplace folder and set as the listing's images.
 *
 * Copied rather than shared, as with /uploads/from-photo: a listing photo is public while the
 * animal photo is private, and the listing keeps its picture if the animal photo is later deleted.
 * The same picture is copied once per seller (matched by checksum), not on every save.
 *
 * The animal is the source: when it has stored photos they replace the listing's images. When it
 * has none (photos still only on a phone, or a listing with no animal) the listing is left as it is.
 */

const db = prisma as any;

export const MAX_LISTING_PHOTOS = 12;
const PHOTO_REF = /^photo:(.+)$/;

const asObject = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};

const refId = (value: unknown): string => {
  const match = typeof value === "string" ? PHOTO_REF.exec(value.trim()) : null;
  return match ? match[1].trim() : "";
};

/** Stored photo ids in the record, cover first, then the gallery in the order the keeper sees it. */
export const photoIdsFromAnimalPayload = (payload: unknown): string[] => {
  const record = asObject(payload);
  const ids: string[] = [];
  const add = (value: unknown) => {
    const id = refId(value);
    if (id && !ids.includes(id)) ids.push(id);
  };
  add(record.imageUrl);
  (Array.isArray(record.photos) ? record.photos : []).forEach((photo: any) => {
    if (typeof photo === "string") add(photo);
    else add(photo?.url || (photo?.photoId ? `photo:${photo.photoId}` : ""));
  });
  return ids.slice(0, MAX_LISTING_PHOTOS);
};

export const listingMediaUrl = (mediaId: string) => `/marketplace/media/${mediaId}`;

/** The listing's own copy of a stored photo: reused when this seller already has one free or on this listing. */
const mediaForPhoto = async (photo: any, listingId: string) => {
  const existing = await db.marketplaceMedia.findFirst({
    where: {
      ownerUserId: photo.ownerUserId,
      checksum: photo.checksum,
      status: "ready",
      OR: [{ listingId }, { listingId: null }],
    },
    orderBy: { createdAt: "asc" },
  });
  if (existing) {
    if (existing.listingId !== listingId) {
      return db.marketplaceMedia.update({ where: { id: existing.id }, data: { listingId } });
    }
    return existing;
  }
  const mediaId = newObjectId();
  const storageKey = marketplaceMediaKey(photo.ownerUserId, mediaId, extensionForMime(photo.mimeType));
  await uploadStorage.copyObject(photo.storageKey, storageKey);
  return db.marketplaceMedia.create({
    data: {
      id: mediaId,
      ownerUserId: photo.ownerUserId,
      listingId,
      storageKey,
      originalName: `${photo.animalAppId || "photo"}.${extensionForMime(photo.mimeType)}`,
      mimeType: photo.mimeType,
      sizeBytes: photo.sizeBytes,
      checksum: photo.checksum,
      status: "ready",
      // Its format was checked by magic bytes when the animal photo was completed.
      scanStatus: "passed",
      publicUrl: null,
    },
  });
};

export type ListingPhotoSync = { listingId: string; photos: number; changed: boolean; skipped?: string };

/**
 * Sets the listing's images to its animal's stored photos. Never throws for a photo problem: a
 * listing save must not fail because one copy did, so failures are reported in the result.
 */
export const syncListingPhotosFromAnimal = async (listing: { id: string; sellerUserId: string; animalId?: string | null }): Promise<ListingPhotoSync> => {
  const base = { listingId: listing.id, photos: 0, changed: false };
  if (!listing.animalId) return { ...base, skipped: "no animal" };

  const animal = await db.animal.findFirst({
    where: { ownerId: listing.sellerUserId, appAnimalId: listing.animalId, deletedAt: null },
    select: { payload: true },
  });
  if (!animal) return { ...base, skipped: "animal not synced" };

  const ids = photoIdsFromAnimalPayload(animal.payload);
  if (!ids.length) return { ...base, skipped: "no stored photos" };

  const rows = await db.photo.findMany({ where: { id: { in: ids }, ownerUserId: listing.sellerUserId, status: "ready" } });
  const byId = new Map(rows.map((row: any) => [row.id, row]));
  const ordered = ids.map((id) => byId.get(id)).filter(Boolean);
  if (!ordered.length) return { ...base, skipped: "photos not uploaded yet" };

  const urls: string[] = [];
  for (const photo of ordered) {
    try {
      const media = await mediaForPhoto(photo, listing.id);
      const url = listingMediaUrl(media.id);
      if (!urls.includes(url)) urls.push(url);
    } catch (error) {
      console.warn(`[marketplace] could not copy photo ${(photo as any).id} onto listing ${listing.id}:`, (error as Error)?.message || error);
    }
  }
  if (!urls.length) return { ...base, skipped: "copy failed" };

  const current = await db.marketplaceListingImage.findMany({
    where: { listingId: listing.id },
    orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
    select: { imageUrl: true },
  });
  const same = current.length === urls.length && current.every((image: any, index: number) => image.imageUrl === urls[index]);
  if (same) return { ...base, photos: urls.length };

  await db.$transaction([
    db.marketplaceListingImage.deleteMany({ where: { listingId: listing.id } }),
    db.marketplaceListingImage.createMany({
      data: urls.map((imageUrl, index) => ({ listingId: listing.id, imageUrl, isPrimary: index === 0, sortOrder: index })),
    }),
  ]);
  return { ...base, photos: urls.length, changed: true };
};
