import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/prisma", () => {
  const accountToken = {
    updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    create: vi.fn().mockResolvedValue({ id: "token-1" }),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
  };
  return {
    prisma: {
      user: {
        findUnique: vi.fn(),
        create: vi.fn(),
      },
      adminAuditLog: {
        create: vi.fn(),
      },
      accountToken,
      $transaction: vi.fn((callback: (tx: unknown) => unknown) => callback({ accountToken })),
    },
  };
});

vi.mock("../../email/queueService", () => ({
  enqueueEmail: vi.fn().mockResolvedValue({ id: "job-1" }),
}));

vi.mock("../../services/emailService", () => ({
  sendEmail: vi.fn(),
}));

import { prisma } from "../../lib/prisma";
import { enqueueEmail } from "../../email/queueService";
import { sendEmail } from "../../services/emailService";
import { createAdminUser } from "../../services/adminService";
import { invitationIdempotencyKey } from "../../email/idempotency";
import { INVITATION_TEMPLATE_KEY } from "../../email/templates";

const db = prisma as any;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createAdminUser invitation integration", () => {
  const actor = { id: "actor-1", email: "actor@example.com", role: "admin" as const };

  it("queues an invitation email instead of sending it inline, with an idempotency key tied to the new user", async () => {
    db.user.findUnique
      .mockResolvedValueOnce(null) // uniqueness check for the new email
      .mockResolvedValueOnce({ fullName: "Inviting Admin" }); // inviter lookup
    db.user.create.mockResolvedValue({
      id: "invited-1",
      email: "invited@example.com",
      fullName: "Invited Person",
      role: "lab",
      status: "active",
    });

    const result = await createAdminUser(actor, {
      email: "invited@example.com",
      fullName: "Invited Person",
      role: "lab",
      reason: "Onboarding new lab partner",
    });

    expect(sendEmail).not.toHaveBeenCalled();
    expect(enqueueEmail).toHaveBeenCalledTimes(1);
    expect(enqueueEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: "invited-1",
        recipientEmail: "invited@example.com",
        category: "organization_invitations",
        templateKey: INVITATION_TEMPLATE_KEY,
        idempotencyKey: invitationIdempotencyKey("invited-1"),
      })
    );
    expect(result.email).toEqual({ queued: true, jobId: "job-1" });
  });

  it("always returns the temporary password to the creating admin, even though the email itself never carries it", async () => {
    db.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ fullName: "Inviting Admin" });
    db.user.create.mockResolvedValue({
      id: "invited-2",
      email: "invited2@example.com",
      fullName: "Invited Person",
      role: "support",
      status: "active",
    });

    const result = await createAdminUser(actor, {
      email: "invited2@example.com",
      fullName: "Invited Person",
      role: "support",
      reason: "Support hire",
    });

    expect(result.temporaryPassword).toBeTruthy();
    const [[payload]] = vi.mocked(enqueueEmail).mock.calls;
    expect(JSON.stringify(payload.templatePayload)).not.toContain(result.temporaryPassword);
  });

  it("does not enqueue an invitation email when sendInvite is false", async () => {
    db.user.findUnique.mockResolvedValueOnce(null);
    db.user.create.mockResolvedValue({
      id: "invited-3",
      email: "invited3@example.com",
      fullName: "Invited Person",
      role: "moderator",
      status: "active",
    });

    await createAdminUser(actor, {
      email: "invited3@example.com",
      fullName: "Invited Person",
      role: "moderator",
      reason: "No invite needed",
      sendInvite: false,
    });

    expect(enqueueEmail).not.toHaveBeenCalled();
  });
});
