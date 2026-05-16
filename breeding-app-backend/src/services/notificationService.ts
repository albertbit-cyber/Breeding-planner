import { prisma } from "../lib/prisma";
import { HttpError } from "../utils/errors";
import type { AppRole } from "../types/auth";

type NotificationInput = {
  recipientId: string;
  actorId?: string | null;
  type: string;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
};

const db = prisma as any;

const textValue = (value: unknown, maxLength = 1000): string => {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.slice(0, maxLength);
};

const toPublicNotification = (row: any) => ({
  id: row.id,
  type: row.type,
  title: row.title,
  message: row.message,
  metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
  readAt: row.readAt,
  createdAt: row.createdAt,
  actor: row.actor
    ? {
        id: row.actor.id,
        fullName: row.actor.fullName,
        email: row.actor.email,
        role: row.actor.role,
      }
    : undefined,
});

export const createNotification = async (input: NotificationInput) => {
  const recipientId = textValue(input.recipientId, 160);
  const type = textValue(input.type, 80);
  const title = textValue(input.title, 160);
  const message = textValue(input.message, 2000);
  if (!recipientId || !type || !title || !message) return null;

  const row = await db.notification.create({
    data: {
      recipientId,
      actorId: input.actorId || null,
      type,
      title,
      message,
      metadata: input.metadata || {},
    },
    include: {
      actor: { select: { id: true, fullName: true, email: true, role: true } },
    },
  });

  return toPublicNotification(row);
};

export const listMyNotifications = async (actor: { id: string; role: AppRole }) => {
  const rows = await db.notification.findMany({
    where: { recipientId: actor.id },
    include: {
      actor: { select: { id: true, fullName: true, email: true, role: true } },
    },
    orderBy: [{ createdAt: "desc" }],
    take: 50,
  });
  return rows.map(toPublicNotification);
};

export const markNotificationRead = async (
  actor: { id: string; role: AppRole },
  notificationId: string
) => {
  const id = textValue(notificationId, 160);
  if (!id) throw new HttpError(400, "Notification id is required.");

  const existing = await db.notification.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, "Notification not found.");
  if (existing.recipientId !== actor.id && actor.role !== "admin") {
    throw new HttpError(403, "You can only update your own notifications.");
  }

  const row = await db.notification.update({
    where: { id },
    data: { readAt: existing.readAt || new Date() },
    include: {
      actor: { select: { id: true, fullName: true, email: true, role: true } },
    },
  });

  return toPublicNotification(row);
};
