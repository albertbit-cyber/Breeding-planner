import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    notificationPreference: { findUnique: vi.fn() },
  },
}));

vi.mock("../../email/queueService", () => ({
  enqueueEmail: vi.fn().mockResolvedValue({ id: "job-1" }),
  cancelByIdempotencyKey: vi.fn(),
}));

import { prisma } from "../../lib/prisma";
import { enqueueEmail, cancelByIdempotencyKey } from "../../email/queueService";
import { syncExpectedEggLayingReminder } from "../../services/reproductiveCycleService";
import { breedingReminderIdempotencyKey } from "../../email/idempotency";
import { BREEDING_REMINDER_TEMPLATE_KEY } from "../../email/templates";

const db = prisma as any;

beforeEach(() => {
  vi.clearAllMocks();
  db.user.findUnique.mockResolvedValue({ email: "breeder@example.com" });
  db.notificationPreference.findUnique.mockResolvedValue(null);
});

describe("syncExpectedEggLayingReminder", () => {
  const idempotencyKey = breedingReminderIdempotencyKey("cycle-1", "expected_egg_laying_window");

  it("queues a reminder when ovulation is newly recorded", async () => {
    await syncExpectedEggLayingReminder({
      ownerId: "owner-1",
      cycleId: "cycle-1",
      femaleDisplayName: "Banana",
      pairingAppId: "pairing-1",
      ovulationDate: "2027-03-01",
      priorOvulationDate: null,
    });

    expect(enqueueEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: "owner-1",
        recipientEmail: "breeder@example.com",
        category: "breeding_reminders",
        templateKey: BREEDING_REMINDER_TEMPLATE_KEY,
        idempotencyKey,
        relatedEntityType: "reproductive_cycle",
        relatedEntityId: "cycle-1",
      })
    );
  });

  it("does nothing when the ovulation date is unchanged", async () => {
    await syncExpectedEggLayingReminder({
      ownerId: "owner-1",
      cycleId: "cycle-1",
      femaleDisplayName: "Banana",
      pairingAppId: "pairing-1",
      ovulationDate: "2027-03-01",
      priorOvulationDate: "2027-03-01",
    });

    expect(cancelByIdempotencyKey).not.toHaveBeenCalled();
    expect(enqueueEmail).not.toHaveBeenCalled();
  });

  it("cancels the obsolete reminder and queues a replacement when the ovulation date changes", async () => {
    await syncExpectedEggLayingReminder({
      ownerId: "owner-1",
      cycleId: "cycle-1",
      femaleDisplayName: "Banana",
      pairingAppId: "pairing-1",
      ovulationDate: "2027-03-05",
      priorOvulationDate: "2027-03-01",
    });

    expect(cancelByIdempotencyKey).toHaveBeenCalledWith(idempotencyKey);
    expect(enqueueEmail).toHaveBeenCalledTimes(1);
  });

  it("only cancels, without queuing, when ovulation is cleared", async () => {
    await syncExpectedEggLayingReminder({
      ownerId: "owner-1",
      cycleId: "cycle-1",
      femaleDisplayName: "Banana",
      pairingAppId: "pairing-1",
      ovulationDate: null,
      priorOvulationDate: "2027-03-01",
    });

    expect(cancelByIdempotencyKey).toHaveBeenCalledWith(idempotencyKey);
    expect(enqueueEmail).not.toHaveBeenCalled();
  });

  it("does not queue a reminder if the owner has no email on file", async () => {
    db.user.findUnique.mockResolvedValue(null);
    await syncExpectedEggLayingReminder({
      ownerId: "owner-1",
      cycleId: "cycle-1",
      femaleDisplayName: "Banana",
      pairingAppId: "pairing-1",
      ovulationDate: "2027-03-01",
      priorOvulationDate: null,
    });
    expect(enqueueEmail).not.toHaveBeenCalled();
  });
});
