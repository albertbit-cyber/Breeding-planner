import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/prisma", () => ({
  prisma: {
    animal: { findFirst: vi.fn() },
    photo: { findMany: vi.fn() },
    marketplaceMedia: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    marketplaceListingImage: { findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("../services/uploadStorageService", () => ({
  uploadStorage: { copyObject: vi.fn() },
  marketplaceMediaKey: (userId: string, id: string, ext: string) => `users/${userId}/marketplace/${id}.${ext}`,
  extensionForMime: () => "jpg",
  newObjectId: vi.fn(),
}));

import { prisma } from "../lib/prisma";
import { newObjectId, uploadStorage } from "../services/uploadStorageService";
import { photoIdsFromAnimalPayload, syncListingPhotosFromAnimal } from "../services/marketplaceListingPhotos";

const db = prisma as any;
const listing = { id: "listing-1", sellerUserId: "seller-1", animalId: "26-F-001" };

const photo = (id: string) => ({
  id,
  ownerUserId: "seller-1",
  animalAppId: "26-F-001",
  storageKey: `users/seller-1/animals/26-F-001/${id}.jpg`,
  mimeType: "image/jpeg",
  sizeBytes: 1000,
  checksum: `sum-${id}`,
  status: "ready",
});

let nextId = 0;

beforeEach(() => {
  vi.clearAllMocks();
  nextId = 0;
  (newObjectId as any).mockImplementation(() => `media-${++nextId}`);
  db.$transaction.mockResolvedValue([]);
  db.marketplaceMedia.findFirst.mockResolvedValue(null);
  db.marketplaceMedia.create.mockImplementation(async ({ data }: any) => data);
  db.marketplaceListingImage.findMany.mockResolvedValue([]);
});

describe("which photos an animal has", () => {
  it("puts the cover first, then the gallery in order, without repeats", () => {
    const ids = photoIdsFromAnimalPayload({
      imageUrl: "photo:b",
      photos: [{ url: "photo:a" }, { url: "photo:b" }, { url: "data:image/jpeg;base64,xx" }, { photoId: "c" }, "photo:d"],
    });
    expect(ids).toEqual(["b", "a", "c", "d"]);
  });

  it("ignores inline and outside pictures: only stored photos can be copied", () => {
    expect(photoIdsFromAnimalPayload({ imageUrl: "data:image/png;base64,xx", photos: [{ url: "https://x/y.jpg" }] })).toEqual([]);
  });
});

describe("a listing takes its animal's photos", () => {
  it("copies every stored photo, cover first, and makes them the listing's images", async () => {
    db.animal.findFirst.mockResolvedValue({ payload: { imageUrl: "photo:p2", photos: [{ url: "photo:p1" }, { url: "photo:p2" }] } });
    db.photo.findMany.mockResolvedValue([photo("p1"), photo("p2")]);

    const result = await syncListingPhotosFromAnimal(listing);

    expect(result).toMatchObject({ photos: 2, changed: true });
    expect(uploadStorage.copyObject).toHaveBeenCalledTimes(2);
    const images = db.marketplaceListingImage.createMany.mock.calls[0][0].data;
    expect(images).toEqual([
      { listingId: "listing-1", imageUrl: "/marketplace/media/media-1", isPrimary: true, sortOrder: 0 },
      { listingId: "listing-1", imageUrl: "/marketplace/media/media-2", isPrimary: false, sortOrder: 1 },
    ]);
    // The animal photo of p2 (the cover) was copied first.
    expect((uploadStorage.copyObject as any).mock.calls[0][0]).toContain("p2");
  });

  it("reuses a copy it already made instead of copying again", async () => {
    db.animal.findFirst.mockResolvedValue({ payload: { photos: [{ url: "photo:p1" }] } });
    db.photo.findMany.mockResolvedValue([photo("p1")]);
    db.marketplaceMedia.findFirst.mockResolvedValue({ id: "existing", listingId: "listing-1" });
    db.marketplaceListingImage.findMany.mockResolvedValue([{ imageUrl: "/marketplace/media/existing" }]);

    const result = await syncListingPhotosFromAnimal(listing);

    expect(uploadStorage.copyObject).not.toHaveBeenCalled();
    expect(result).toMatchObject({ photos: 1, changed: false });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("leaves the listing alone when the animal has no stored photos yet", async () => {
    db.animal.findFirst.mockResolvedValue({ payload: { imageUrl: "data:image/jpeg;base64,xx" } });
    const result = await syncListingPhotosFromAnimal(listing);
    expect(result.skipped).toBe("no stored photos");
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("only copies the seller's own photos", async () => {
    db.animal.findFirst.mockResolvedValue({ payload: { photos: [{ url: "photo:someone-elses" }] } });
    db.photo.findMany.mockResolvedValue([]);
    const result = await syncListingPhotosFromAnimal(listing);
    expect(db.photo.findMany.mock.calls[0][0].where).toMatchObject({ ownerUserId: "seller-1", status: "ready" });
    expect(result.skipped).toBe("photos not uploaded yet");
  });

  it("keeps going when one copy fails", async () => {
    db.animal.findFirst.mockResolvedValue({ payload: { photos: [{ url: "photo:p1" }, { url: "photo:p2" }] } });
    db.photo.findMany.mockResolvedValue([photo("p1"), photo("p2")]);
    (uploadStorage.copyObject as any).mockRejectedValueOnce(new Error("bucket down"));
    const result = await syncListingPhotosFromAnimal(listing);
    expect(result).toMatchObject({ photos: 1, changed: true });
  });
});
