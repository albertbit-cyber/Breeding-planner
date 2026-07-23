import { createHmac } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../email/queueService", () => ({
  findJobByProviderMessageId: vi.fn(),
  applyWebhookStatus: vi.fn(),
  recordEvent: vi.fn(),
}));

vi.mock("../../email/suppressionService", () => ({
  suppressRecipient: vi.fn(),
}));

import { findJobByProviderMessageId, applyWebhookStatus, recordEvent } from "../../email/queueService";
import { suppressRecipient } from "../../email/suppressionService";
import { processResendWebhookEvent, verifyResendWebhookSignature } from "../../email/webhookService";

const SECRET = `whsec_${Buffer.from("test-signing-secret-32-bytes!!").toString("base64")}`;

const sign = (svixId: string, svixTimestamp: string, body: string, secret: string): string => {
  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const signedContent = `${svixId}.${svixTimestamp}.${body}`;
  const signature = createHmac("sha256", secretBytes).update(signedContent).digest("base64");
  return `v1,${signature}`;
};

describe("verifyResendWebhookSignature", () => {
  it("accepts a correctly signed payload", () => {
    const body = JSON.stringify({ type: "email.delivered" });
    const svixId = "msg_1";
    const svixTimestamp = String(Math.floor(Date.now() / 1000));
    const svixSignature = sign(svixId, svixTimestamp, body, SECRET);
    expect(verifyResendWebhookSignature(body, { svixId, svixTimestamp, svixSignature }, SECRET)).toBe(true);
  });

  it("rejects a tampered body", () => {
    const body = JSON.stringify({ type: "email.delivered" });
    const svixId = "msg_1";
    const svixTimestamp = String(Math.floor(Date.now() / 1000));
    const svixSignature = sign(svixId, svixTimestamp, body, SECRET);
    const tamperedBody = JSON.stringify({ type: "email.bounced" });
    expect(verifyResendWebhookSignature(tamperedBody, { svixId, svixTimestamp, svixSignature }, SECRET)).toBe(false);
  });

  it("rejects a signature signed with the wrong secret", () => {
    const body = JSON.stringify({ type: "email.delivered" });
    const svixId = "msg_1";
    const svixTimestamp = String(Math.floor(Date.now() / 1000));
    const wrongSecret = `whsec_${Buffer.from("a-completely-different-secret!!").toString("base64")}`;
    const svixSignature = sign(svixId, svixTimestamp, body, wrongSecret);
    expect(verifyResendWebhookSignature(body, { svixId, svixTimestamp, svixSignature }, SECRET)).toBe(false);
  });

  it("rejects a missing signature header", () => {
    expect(verifyResendWebhookSignature("{}", { svixId: "msg_1", svixTimestamp: "123", svixSignature: "" }, SECRET)).toBe(false);
  });

  it("rejects a replayed (too old) timestamp", () => {
    const body = JSON.stringify({ type: "email.delivered" });
    const svixId = "msg_1";
    const oldTimestamp = String(Math.floor(Date.now() / 1000) - 3600);
    const svixSignature = sign(svixId, oldTimestamp, body, SECRET);
    expect(verifyResendWebhookSignature(body, { svixId, svixTimestamp: oldTimestamp, svixSignature }, SECRET)).toBe(false);
  });
});

describe("processResendWebhookEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ignores unknown event types", async () => {
    const result = await processResendWebhookEvent("svix-1", { type: "email.unknown_event", data: { email_id: "msg_1" } });
    expect(result).toEqual({ outcome: "ignored_unknown_event_type" });
    expect(findJobByProviderMessageId).not.toHaveBeenCalled();
  });

  it("ignores events with no matching stored job (never trusts the provider's own identity claims)", async () => {
    vi.mocked(findJobByProviderMessageId).mockResolvedValue(null);
    const result = await processResendWebhookEvent("svix-1", { type: "email.delivered", data: { email_id: "msg_unknown" } });
    expect(result).toEqual({ outcome: "ignored_unknown_message_id" });
    expect(applyWebhookStatus).not.toHaveBeenCalled();
  });

  it("applies a delivered event to the matched job", async () => {
    vi.mocked(findJobByProviderMessageId).mockResolvedValue({ id: "job-1", recipientEmail: "user@example.com" });
    vi.mocked(recordEvent).mockResolvedValue({ created: true, event: { id: "event-1" } } as any);
    const result = await processResendWebhookEvent("svix-1", { type: "email.delivered", data: { email_id: "msg_1" } });
    expect(result).toEqual({ outcome: "applied", status: "delivered" });
    expect(applyWebhookStatus).toHaveBeenCalledWith("job-1", "delivered", "deliveredAt");
  });

  it("does not reapply side effects for a duplicate webhook delivery", async () => {
    vi.mocked(findJobByProviderMessageId).mockResolvedValue({ id: "job-1", recipientEmail: "user@example.com" });
    vi.mocked(recordEvent).mockResolvedValue({ created: false, event: { id: "event-1" } } as any);
    const result = await processResendWebhookEvent("svix-1", { type: "email.bounced", data: { email_id: "msg_1" } });
    expect(result).toEqual({ outcome: "duplicate" });
    expect(applyWebhookStatus).not.toHaveBeenCalled();
    expect(suppressRecipient).not.toHaveBeenCalled();
  });

  it("suppresses the recipient on a bounce", async () => {
    vi.mocked(findJobByProviderMessageId).mockResolvedValue({ id: "job-1", recipientEmail: "user@example.com" });
    vi.mocked(recordEvent).mockResolvedValue({ created: true, event: {} } as any);
    await processResendWebhookEvent("svix-1", { type: "email.bounced", data: { email_id: "msg_1" } });
    expect(suppressRecipient).toHaveBeenCalledWith("user@example.com", "hard_bounce", "webhook");
  });

  it("suppresses the recipient on a complaint", async () => {
    vi.mocked(findJobByProviderMessageId).mockResolvedValue({ id: "job-1", recipientEmail: "user@example.com" });
    vi.mocked(recordEvent).mockResolvedValue({ created: true, event: {} } as any);
    await processResendWebhookEvent("svix-1", { type: "email.complained", data: { email_id: "msg_1" } });
    expect(suppressRecipient).toHaveBeenCalledWith("user@example.com", "complaint", "webhook");
  });

  it("does not suppress on a plain failed event", async () => {
    vi.mocked(findJobByProviderMessageId).mockResolvedValue({ id: "job-1", recipientEmail: "user@example.com" });
    vi.mocked(recordEvent).mockResolvedValue({ created: true, event: {} } as any);
    await processResendWebhookEvent("svix-1", { type: "email.failed", data: { email_id: "msg_1" } });
    expect(suppressRecipient).not.toHaveBeenCalled();
  });
});
