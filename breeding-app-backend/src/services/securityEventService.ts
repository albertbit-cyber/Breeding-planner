import { prisma } from "../lib/prisma";

type SecurityEventInput = {
  type: string;
  actorUserId?: string | null;
  outcome?: "success" | "failure" | "blocked";
  reason?: string;
  metadata?: Record<string, unknown>;
};

const redactValue = (key: string, value: unknown): unknown => {
  if (/password|token|secret|cookie|authorization/i.test(key)) return "[redacted]";
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([childKey, childValue]) => [
        childKey,
        redactValue(childKey, childValue),
      ])
    );
  }
  return value;
};

const sanitizeMetadata = (metadata?: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(metadata || {}).map(([key, value]) => [key, redactValue(key, value)])
  );

export const recordSecurityEvent = async (input: SecurityEventInput): Promise<void> => {
  const event = {
    type: input.type,
    actorUserId: input.actorUserId || null,
    outcome: input.outcome || "success",
    reason: input.reason || "",
    metadata: sanitizeMetadata(input.metadata),
    createdAt: new Date().toISOString(),
  };

  const db = prisma as any;
  if (db.securityEvent?.create) {
    await Promise.resolve(db.securityEvent.create({
      data: {
        type: event.type,
        actorUserId: event.actorUserId,
        outcome: event.outcome,
        reason: event.reason || null,
        metadata: event.metadata,
      },
    })).catch(() => null);
    return;
  }

  if (db.adminAuditLog?.create && input.actorUserId) {
    await Promise.resolve(db.adminAuditLog.create({
      data: {
        adminUserId: input.actorUserId,
        targetUserId: input.actorUserId,
        action: input.type,
        beforeJson: null,
        afterJson: event.metadata,
        reason: input.reason || input.outcome || "security_event",
        internalNote: "Security event fallback audit sink.",
      },
    })).catch(() => null);
  }
};
