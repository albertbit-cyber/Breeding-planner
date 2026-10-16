import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/prisma", () => ({
  prisma: {
    marketplaceListing: { findUnique: vi.fn() },
    report: { create: vi.fn(), findFirst: vi.fn() },
    marketplaceMedia: { create: vi.fn(), findMany: vi.fn() },
    marketplaceMessage: { findUnique: vi.fn() },
    marketplaceMessageReport: { create: vi.fn() },
    marketplaceUserBlock: { upsert: vi.fn(), deleteMany: vi.fn(), findMany: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));

vi.mock("../services/uploadStorageService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/uploadStorageService")>()),
  uploadStorage: { putObject: vi.fn() },
}));

vi.mock("../services/securityEventService", () => ({
  recordSecurityEvent: vi.fn(),
}));

import { prisma } from "../lib/prisma";
import {
  blockMarketplaceUser,
  createMarketplaceMediaUpload,
  reportMarketplaceListing,
  reportMarketplaceMessage,
  unblockMarketplaceUser,
} from "../services/marketplaceRuntimeService";
import { recordSecurityEvent } from "../services/securityEventService";
import { uploadStorage } from "../services/uploadStorageService";

const breederActor = { id: "breeder-1", role: "breeder" } as any;

const pngBase64 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString("base64");

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(uploadStorage.putObject).mockResolvedValue({
    storageKey: "breeder-1/upload.png",
    checksum: "sha256",
    sizeBytes: 8,
  });
  vi.mocked((prisma as any).marketplaceMedia.create).mockResolvedValue({
    id: "media-1",
    ownerUserId: "breeder-1",
    listingId: null,
    storageKey: "breeder-1/upload.png",
    originalName: "upload.png",
    mimeType: "image/png",
    sizeBytes: 8,
    checksum: "sha256",
    status: "ready",
    scanStatus: "passed",
    publicUrl: null,
    createdAt: new Date("2026-05-20T10:00:00.000Z"),
    updatedAt: new Date("2026-05-20T10:00:00.000Z"),
  });
});

describe("marketplaceRuntimeService", () => {
  it("stores validated marketplace media for breeder users", async () => {
    await expect(createMarketplaceMediaUpload(breederActor, {
      dataBase64: pngBase64,
      originalName: "upload.png",
    })).resolves.toMatchObject({
      media: {
        id: "media-1",
        mimeType: "image/png",
        status: "ready",
        scanStatus: "passed",
      },
    });

    // Into the seller's own folder of the bucket, named by the media row's id.
    expect(uploadStorage.putObject).toHaveBeenCalledWith(expect.objectContaining({
      key: expect.stringMatching(/^users\/breeder-1\/marketplace\/[a-f0-9]{32}\.png$/),
      contentType: "image/png",
    }));
    expect((prisma as any).marketplaceMedia.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        ownerUserId: "breeder-1",
        mimeType: "image/png",
        storageKey: "breeder-1/upload.png",
      }),
    }));
    expect(recordSecurityEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: "marketplace_upload_created",
      actorUserId: "breeder-1",
    }));
  });

  it("blocks media upload to a listing owned by another breeder", async () => {
    vi.mocked((prisma as any).marketplaceListing.findUnique).mockResolvedValue({
      id: "listing-1",
      sellerUserId: "other-breeder",
    });

    await expect(createMarketplaceMediaUpload(breederActor, {
      listingId: "listing-1",
      dataBase64: pngBase64,
    })).rejects.toThrow("You cannot upload media to this listing.");
  });

  it("reports a marketplace message into the admin moderation queue", async () => {
    vi.mocked((prisma as any).marketplaceMessage.findUnique).mockResolvedValue({
      id: "message-1",
      conversationId: "conversation-1",
      senderUserId: "buyer-1",
      messageText: "Pay me outside the platform",
      conversation: {
        listingId: "listing-1",
        buyerUserId: "buyer-1",
        sellerUserId: "breeder-1",
      },
    });
    vi.mocked((prisma as any).marketplaceMessageReport.create).mockResolvedValue({
      id: "report-1",
      messageId: "message-1",
      reporterUserId: "breeder-1",
      reason: "spam",
      status: "open",
    });
    vi.mocked((prisma as any).report.create).mockResolvedValue({ id: "case-1" });

    await expect(reportMarketplaceMessage(breederActor, "message-1", { type: "scam_suspicion", reason: "spam" }))
      .resolves.toMatchObject({ report: { id: "report-1", status: "open", moderationReportId: "case-1" } });

    // The case a moderator sees: typed, pointing at the sender and the message.
    expect((prisma as any).report.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        reporterUserId: "breeder-1",
        reportedUserId: "buyer-1",
        relatedMessageId: "message-1",
        type: "scam_suspicion",
        status: "open",
        description: expect.stringContaining("Pay me outside the platform"),
      }),
    });
  });

  it("refuses a report on your own message", async () => {
    vi.mocked((prisma as any).marketplaceMessage.findUnique).mockResolvedValue({
      id: "message-1",
      senderUserId: "breeder-1",
      conversation: { buyerUserId: "buyer-1", sellerUserId: "breeder-1" },
    });
    await expect(reportMarketplaceMessage(breederActor, "message-1", { reason: "spam" })).rejects.toMatchObject({
      statusCode: 400,
    });
    expect((prisma as any).report.create).not.toHaveBeenCalled();
  });

  it("files a listing report against the seller, once per reporter", async () => {
    const buyer = { id: "buyer-1", role: "buyer" } as any;
    vi.mocked((prisma as any).marketplaceListing.findUnique).mockResolvedValue({
      id: "listing-1",
      title: "Clown het Pied",
      sellerUserId: "breeder-1",
      genetics: "Clown, het Pied",
    });
    vi.mocked((prisma as any).report.findFirst).mockResolvedValueOnce(null);
    vi.mocked((prisma as any).report.create).mockResolvedValue({ id: "case-2", status: "open" });

    await expect(reportMarketplaceListing(buyer, "listing-1", { type: "incorrect_genetics", note: "Not a clown" }))
      .resolves.toEqual({ report: { id: "case-2", status: "open" }, duplicate: false });
    expect((prisma as any).report.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reportedUserId: "breeder-1",
          relatedMarketplaceListingId: "listing-1",
          type: "incorrect_genetics",
        }),
      })
    );

    vi.mocked((prisma as any).report.findFirst).mockResolvedValueOnce({ id: "case-2", status: "open" });
    await expect(reportMarketplaceListing(buyer, "listing-1", { type: "incorrect_genetics" }))
      .resolves.toMatchObject({ duplicate: true });
    expect((prisma as any).report.create).toHaveBeenCalledTimes(1);
  });

  it("blocks and unblocks a marketplace user", async () => {
    vi.mocked((prisma as any).user.findUnique).mockResolvedValue({ id: "buyer-1" });
    vi.mocked((prisma as any).marketplaceUserBlock.upsert).mockResolvedValue({
      id: "block-1",
      blockerUserId: "breeder-1",
      blockedUserId: "buyer-1",
      reason: "harassment",
    });
    vi.mocked((prisma as any).marketplaceUserBlock.deleteMany).mockResolvedValue({ count: 1 });

    await expect(blockMarketplaceUser(breederActor, { blockedUserId: "buyer-1", reason: "harassment" }))
      .resolves.toMatchObject({ block: { id: "block-1" } });
    await expect(unblockMarketplaceUser(breederActor, "buyer-1"))
      .resolves.toEqual({ deleted: 1 });
  });
});
