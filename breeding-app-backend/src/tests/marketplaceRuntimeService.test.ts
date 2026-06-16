import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/prisma", () => ({
  prisma: {
    marketplaceListing: { findUnique: vi.fn() },
    marketplaceMedia: { create: vi.fn(), findMany: vi.fn() },
    marketplaceMessage: { findUnique: vi.fn() },
    marketplaceMessageReport: { create: vi.fn() },
    marketplaceUserBlock: { upsert: vi.fn(), deleteMany: vi.fn(), findMany: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));

vi.mock("../services/uploadStorageService", () => ({
  uploadStorage: { putObject: vi.fn() },
}));

vi.mock("../services/securityEventService", () => ({
  recordSecurityEvent: vi.fn(),
}));

import { prisma } from "../lib/prisma";
import {
  blockMarketplaceUser,
  createMarketplaceMediaUpload,
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

    expect(uploadStorage.putObject).toHaveBeenCalledWith(expect.objectContaining({
      ownerUserId: "breeder-1",
      originalName: "upload.png",
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

  it("reports a marketplace message when the actor belongs to the conversation", async () => {
    vi.mocked((prisma as any).marketplaceMessage.findUnique).mockResolvedValue({
      id: "message-1",
      conversationId: "conversation-1",
      conversation: {
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

    await expect(reportMarketplaceMessage(breederActor, "message-1", { reason: "spam" }))
      .resolves.toMatchObject({ report: { id: "report-1", status: "open" } });
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
