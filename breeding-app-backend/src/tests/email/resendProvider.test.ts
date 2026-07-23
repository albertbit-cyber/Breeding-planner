import { beforeEach, describe, expect, it, vi } from "vitest";

const sendMock = vi.fn();

vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(function ResendMock(this: any) {
    this.emails = { send: sendMock };
  }),
}));

import { ResendEmailProvider } from "../../email/providers/resendProvider";
import { EmailConfigurationError, PermanentProviderError, RetryableProviderError } from "../../email/types";

describe("ResendEmailProvider", () => {
  beforeEach(() => {
    sendMock.mockReset();
  });

  it("throws EmailConfigurationError when constructed without an API key", () => {
    expect(() => new ResendEmailProvider("", "Breeding Planner <notifications@example.com>")).toThrow(EmailConfigurationError);
  });

  it("throws EmailConfigurationError when constructed without a from address", () => {
    expect(() => new ResendEmailProvider("re_test_key", "")).toThrow(EmailConfigurationError);
  });

  it("returns the provider message id on success", async () => {
    sendMock.mockResolvedValue({ data: { id: "msg_123" }, error: null });
    const provider = new ResendEmailProvider("re_test_key", "Breeding Planner <notifications@example.com>");
    const result = await provider.send({ to: "user@example.com", subject: "Hi", html: "<p>hi</p>", text: "hi" });
    expect(result).toEqual({ provider: "resend", providerMessageId: "msg_123" });
  });

  it("maps rate_limit_exceeded to a retryable error", async () => {
    sendMock.mockResolvedValue({ data: null, error: { name: "rate_limit_exceeded", message: "slow down" } });
    const provider = new ResendEmailProvider("re_test_key", "Breeding Planner <notifications@example.com>");
    await expect(provider.send({ to: "user@example.com", subject: "Hi", html: "<p>hi</p>", text: "hi" }))
      .rejects.toThrow(RetryableProviderError);
  });

  it("maps validation_error to a permanent error", async () => {
    sendMock.mockResolvedValue({ data: null, error: { name: "validation_error", message: "bad payload" } });
    const provider = new ResendEmailProvider("re_test_key", "Breeding Planner <notifications@example.com>");
    await expect(provider.send({ to: "user@example.com", subject: "Hi", html: "<p>hi</p>", text: "hi" }))
      .rejects.toThrow(PermanentProviderError);
  });

  it("maps a thrown network error to a retryable error", async () => {
    sendMock.mockRejectedValue(new Error("ECONNRESET"));
    const provider = new ResendEmailProvider("re_test_key", "Breeding Planner <notifications@example.com>");
    await expect(provider.send({ to: "user@example.com", subject: "Hi", html: "<p>hi</p>", text: "hi" }))
      .rejects.toThrow(RetryableProviderError);
  });

  it("treats a missing message id in a success response as retryable", async () => {
    sendMock.mockResolvedValue({ data: {}, error: null });
    const provider = new ResendEmailProvider("re_test_key", "Breeding Planner <notifications@example.com>");
    await expect(provider.send({ to: "user@example.com", subject: "Hi", html: "<p>hi</p>", text: "hi" }))
      .rejects.toThrow(RetryableProviderError);
  });

  it("passes the idempotency key through to the SDK call", async () => {
    sendMock.mockResolvedValue({ data: { id: "msg_1" }, error: null });
    const provider = new ResendEmailProvider("re_test_key", "Breeding Planner <notifications@example.com>");
    await provider.send({ to: "user@example.com", subject: "Hi", html: "<p>hi</p>", text: "hi", idempotencyKey: "key-1" });
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: "user@example.com" }),
      { idempotencyKey: "key-1" }
    );
  });
});
