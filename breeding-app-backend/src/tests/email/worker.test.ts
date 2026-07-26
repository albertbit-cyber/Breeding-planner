import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../email/preferencesService", () => ({
  isCategoryEnabled: vi.fn(),
  REQUIRED_CATEGORIES: new Set(["account_and_security"]),
}));

vi.mock("../../email/suppressionService", () => ({
  isRecipientSuppressed: vi.fn(),
}));

vi.mock("../../email/queueService", () => ({
  markCancelledBySystem: vi.fn(),
  markSuppressed: vi.fn(),
  markSent: vi.fn(),
  scheduleRetry: vi.fn(),
  markPermanentFailure: vi.fn(),
  claimNextBatch: vi.fn(),
  recoverStuckJobs: vi.fn(),
}));

import { isCategoryEnabled } from "../../email/preferencesService";
import { isRecipientSuppressed } from "../../email/suppressionService";
import {
  markCancelledBySystem,
  markSuppressed,
  markSent,
  scheduleRetry,
  markPermanentFailure,
  claimNextBatch,
  recoverStuckJobs,
} from "../../email/queueService";
import { processEmailJob, runWorkerTick } from "../../email/worker";
import { MockEmailProvider } from "../../email/providers/mockProvider";
import { PermanentProviderError, RetryableProviderError } from "../../email/types";

const baseJob = {
  id: "job-1",
  ownerId: "user-1",
  category: "breeding_reminders",
  recipientEmail: "user@example.com",
  templateKey: "breeding_reminder",
  templateVersion: 1,
  templatePayload: {
    animalDisplayName: "Banana",
    projectDisplayName: "Pairing 1",
    reminderType: "expected_egg_laying_window",
    reminderDateDisplay: "March 1, 2027",
    explanation: "Expected soon.",
    actionUrl: "https://app.example.com/p/1",
  },
  idempotencyKey: "key-1",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("processEmailJob", () => {
  it("cancels the job when the recipient has disabled the category", async () => {
    vi.mocked(isCategoryEnabled).mockResolvedValue(false);
    const provider = new MockEmailProvider();
    await processEmailJob(baseJob, provider);
    expect(markCancelledBySystem).toHaveBeenCalledWith("job-1", expect.any(String));
    expect(provider.sent).toHaveLength(0);
  });

  it("marks the job suppressed instead of sending to a suppressed recipient", async () => {
    vi.mocked(isCategoryEnabled).mockResolvedValue(true);
    vi.mocked(isRecipientSuppressed).mockResolvedValue(true);
    const provider = new MockEmailProvider();
    await processEmailJob(baseJob, provider);
    expect(markSuppressed).toHaveBeenCalledWith("job-1");
    expect(provider.sent).toHaveLength(0);
  });

  it("sends and marks the job sent on success", async () => {
    vi.mocked(isCategoryEnabled).mockResolvedValue(true);
    vi.mocked(isRecipientSuppressed).mockResolvedValue(false);
    const provider = new MockEmailProvider();
    await processEmailJob(baseJob, provider);
    expect(provider.sent).toHaveLength(1);
    expect(markSent).toHaveBeenCalledWith("job-1", "mock", expect.any(String));
  });

  it("bypasses preference and suppression checks for required categories", async () => {
    const requiredJob = { ...baseJob, category: "account_and_security" };
    const provider = new MockEmailProvider();
    await processEmailJob(requiredJob, provider);
    expect(isCategoryEnabled).not.toHaveBeenCalled();
    expect(isRecipientSuppressed).not.toHaveBeenCalled();
    expect(provider.sent).toHaveLength(1);
  });

  it("schedules a retry on a retryable provider failure", async () => {
    vi.mocked(isCategoryEnabled).mockResolvedValue(true);
    vi.mocked(isRecipientSuppressed).mockResolvedValue(false);
    const provider = { name: "fake", send: vi.fn().mockRejectedValue(new RetryableProviderError("temporary")) };
    await processEmailJob(baseJob, provider as any);
    expect(scheduleRetry).toHaveBeenCalledWith("job-1", "retryable_provider_error", "temporary");
    expect(markPermanentFailure).not.toHaveBeenCalled();
  });

  it("marks a permanent provider failure as failed without retrying", async () => {
    vi.mocked(isCategoryEnabled).mockResolvedValue(true);
    vi.mocked(isRecipientSuppressed).mockResolvedValue(false);
    const provider = { name: "fake", send: vi.fn().mockRejectedValue(new PermanentProviderError("invalid recipient")) };
    await processEmailJob(baseJob, provider as any);
    expect(markPermanentFailure).toHaveBeenCalledWith("job-1", "permanent_provider_error", "invalid recipient");
    expect(scheduleRetry).not.toHaveBeenCalled();
  });

  it("treats an unexpected thrown error as retryable rather than crashing the worker", async () => {
    vi.mocked(isCategoryEnabled).mockResolvedValue(true);
    vi.mocked(isRecipientSuppressed).mockResolvedValue(false);
    const provider = { name: "fake", send: vi.fn().mockRejectedValue(new Error("boom")) };
    await expect(processEmailJob(baseJob, provider as any)).resolves.toBeUndefined();
    expect(scheduleRetry).toHaveBeenCalledWith("job-1", "unknown_error", "boom");
  });
});

describe("runWorkerTick", () => {
  it("processes every claimed job even if one of them is malformed", async () => {
    vi.mocked(isCategoryEnabled).mockResolvedValue(true);
    vi.mocked(isRecipientSuppressed).mockResolvedValue(false);
    vi.mocked(recoverStuckJobs).mockResolvedValue(0);
    vi.mocked(claimNextBatch).mockResolvedValue([
      { ...baseJob, id: "job-good" },
      { ...baseJob, id: "job-bad", templateKey: "unknown_template" },
    ] as any);

    const provider = new MockEmailProvider();
    const count = await runWorkerTick(provider, 10, 10);

    expect(count).toBe(2);
    expect(provider.sent).toHaveLength(1);
    // The malformed job's rendering failure must still resolve to a queue update, not a thrown error.
    expect(markPermanentFailure).toHaveBeenCalledWith("job-bad", "rendering_error", expect.any(String));
  });
});
