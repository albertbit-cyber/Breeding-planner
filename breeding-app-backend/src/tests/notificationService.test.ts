import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/prisma", () => ({
  prisma: {
    notification: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { prisma } from "../lib/prisma";
import { createNotification, listMyNotifications, markNotificationRead } from "../services/notificationService";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked((prisma as any).notification.create).mockResolvedValue({
    id: "notification-1",
    recipientId: "breeder-1",
    actorId: "buyer-1",
    type: "listing_inquiry",
    title: "New listing inquiry",
    message: "Buyer asked about Banana Clown.",
    metadata: { inquiryId: "inquiry-1" },
    readAt: null,
    createdAt: new Date("2026-05-01T10:00:00.000Z"),
    actor: { id: "buyer-1", fullName: "Buyer User", email: "buyer@example.com", role: "buyer" },
  });
  vi.mocked((prisma as any).notification.findMany).mockResolvedValue([]);
  vi.mocked((prisma as any).notification.findUnique).mockResolvedValue({
    id: "notification-1",
    recipientId: "breeder-1",
    readAt: null,
  });
  vi.mocked((prisma as any).notification.update).mockResolvedValue({
    id: "notification-1",
    recipientId: "breeder-1",
    actorId: "buyer-1",
    type: "listing_inquiry",
    title: "New listing inquiry",
    message: "Buyer asked about Banana Clown.",
    metadata: { inquiryId: "inquiry-1" },
    readAt: new Date("2026-05-01T11:00:00.000Z"),
    createdAt: new Date("2026-05-01T10:00:00.000Z"),
    actor: { id: "buyer-1", fullName: "Buyer User", email: "buyer@example.com", role: "buyer" },
  });
});

describe("notificationService", () => {
  it("creates a notification with actor summary", async () => {
    await expect(createNotification({
      recipientId: "breeder-1",
      actorId: "buyer-1",
      type: "listing_inquiry",
      title: "New listing inquiry",
      message: "Buyer asked about Banana Clown.",
      metadata: { inquiryId: "inquiry-1" },
    })).resolves.toMatchObject({
      id: "notification-1",
      type: "listing_inquiry",
      actor: { id: "buyer-1" },
    });
  });

  it("lists notifications for the actor", async () => {
    vi.mocked((prisma as any).notification.findMany).mockResolvedValue([
      {
        id: "notification-1",
        recipientId: "breeder-1",
        type: "listing_inquiry",
        title: "New listing inquiry",
        message: "Buyer asked about Banana Clown.",
        metadata: {},
        readAt: null,
        createdAt: new Date("2026-05-01T10:00:00.000Z"),
        actor: null,
      },
    ]);

    await expect(listMyNotifications({ id: "breeder-1", role: "breeder" })).resolves.toEqual([
      expect.objectContaining({ id: "notification-1", title: "New listing inquiry" }),
    ]);
  });

  it("marks own notifications read and blocks other users", async () => {
    await expect(markNotificationRead({ id: "breeder-1", role: "breeder" }, "notification-1"))
      .resolves.toMatchObject({ id: "notification-1" });

    vi.mocked((prisma as any).notification.findUnique).mockResolvedValue({
      id: "notification-2",
      recipientId: "breeder-2",
      readAt: null,
    });

    await expect(markNotificationRead({ id: "breeder-1", role: "breeder" }, "notification-2"))
      .rejects.toThrow("You can only update your own notifications.");
  });
});
