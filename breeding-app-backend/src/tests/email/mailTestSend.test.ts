/**
 * The admin test-send exists to convert a provider rejection into an action.
 * These tests pin that translation, because the raw provider text ("The domain
 * is not verified") is the one thing an operator most often misreads as a
 * transient problem.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const adminAuditLog = vi.hoisted(() => ({ create: vi.fn() }));

vi.mock("../../lib/prisma", () => ({
  prisma: { adminAuditLog },
}));

const transport = vi.hoisted(() => ({
  current: {
    transport: "resend" as "resend" | "smtp" | "mock",
    configured: true,
    detail: "from=notifications@serpentora.com",
    reason: undefined as string | undefined,
  },
}));

const send = vi.hoisted(() => vi.fn());

vi.mock("../../email/providerFactory", () => ({
  describeMailTransport: () => transport.current,
  createEmailProvider: () => ({ name: transport.current.transport, send }),
}));

vi.mock("../../config/env", () => ({
  env: { nodeEnv: "test" },
}));

import { sendDiagnosticTestEmail } from "../../email/testSendService";
import { PermanentProviderError, RetryableProviderError } from "../../email/types";
import { HttpError } from "../../utils/errors";

describe("sendDiagnosticTestEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transport.current = {
      transport: "resend",
      configured: true,
      detail: "from=notifications@serpentora.com",
      reason: undefined,
    };
    adminAuditLog.create.mockResolvedValue({});
  });

  it("rejects a malformed recipient before touching the provider", async () => {
    await expect(sendDiagnosticTestEmail("not-an-email", "admin-1")).rejects.toBeInstanceOf(HttpError);
    expect(send).not.toHaveBeenCalled();
  });

  it("reports the missing transport instead of pretending to send", async () => {
    transport.current = {
      transport: "mock",
      configured: false,
      detail: 'EMAIL_ENABLED is not "true"',
      reason: 'EMAIL_ENABLED is not set to "true".',
    };

    const result = await sendDiagnosticTestEmail("someone@example.com", "admin-1");

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("transport_unconfigured");
    expect(send).not.toHaveBeenCalled();
    // Nothing was attempted, so nothing is worth auditing.
    expect(adminAuditLog.create).not.toHaveBeenCalled();
  });

  it("records an audit entry with the recipient masked", async () => {
    send.mockResolvedValue({ provider: "resend", providerMessageId: "msg-1" });

    await sendDiagnosticTestEmail("someone@example.com", "admin-1");

    const entry = adminAuditLog.create.mock.calls[0][0].data;
    expect(entry.action).toBe("email_test_send");
    expect(entry.adminUserId).toBe("admin-1");
    expect(JSON.stringify(entry.afterJson)).not.toContain("someone@example.com");
  });

  it("returns the provider message id on success", async () => {
    send.mockResolvedValue({ provider: "resend", providerMessageId: "msg-1" });

    const result = await sendDiagnosticTestEmail("someone@example.com", "admin-1");

    expect(result.ok).toBe(true);
    expect(result.providerMessageId).toBe("msg-1");
    expect(result.recipient).not.toContain("someone@example.com");
  });

  it("calls out that a mock 'success' delivered nothing", async () => {
    send.mockResolvedValue({ provider: "mock", providerMessageId: "mock-1" });

    const result = await sendDiagnosticTestEmail("someone@example.com", "admin-1");

    expect(result.ok).toBe(true);
    expect(result.interpretation).toContain("discards mail");
  });

  it("explains an unverified sending domain as the cause of selective delivery", async () => {
    send.mockRejectedValue(
      new PermanentProviderError("Resend error (validation_error): The domain is not verified.", {})
    );

    const result = await sendDiagnosticTestEmail("someone@example.com", "admin-1");

    expect(result.ok).toBe(false);
    expect(result.errorMessage).toContain("domain is not verified");
    expect(result.interpretation).toContain("provider account owner");
  });

  it("explains a rejected API key", async () => {
    send.mockRejectedValue(new PermanentProviderError("Resend error (validation_error): API key is invalid", {}));

    const result = await sendDiagnosticTestEmail("someone@example.com", "admin-1");

    expect(result.interpretation).toContain("RESEND_API_KEY");
  });

  it("explains an unreachable SMTP host", async () => {
    send.mockRejectedValue(new RetryableProviderError("connect ECONNREFUSED 127.0.0.1:587", {}));

    const result = await sendDiagnosticTestEmail("someone@example.com", "admin-1");

    expect(result.retryable).toBe(true);
    expect(result.interpretation).toContain("SMTP_HOST");
  });

  it("never throws a provider failure at the caller", async () => {
    send.mockRejectedValue(new Error("something entirely unexpected"));

    const result = await sendDiagnosticTestEmail("someone@example.com", "admin-1");

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("unknown_error");
  });
});
