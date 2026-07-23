import { describe, expect, it } from "vitest";
import { MockEmailProvider } from "../../email/providers/mockProvider";
import { EmailValidationError } from "../../email/types";

describe("MockEmailProvider", () => {
  it("records sent messages without any network I/O", async () => {
    const provider = new MockEmailProvider();
    const result = await provider.send({
      to: "test@example.com",
      subject: "Hello",
      html: "<p>Hi</p>",
      text: "Hi",
    });

    expect(result.provider).toBe("mock");
    expect(result.providerMessageId).toMatch(/^mock_/);
    expect(provider.sent).toHaveLength(1);
    expect(provider.sent[0]).toMatchObject({ to: "test@example.com", subject: "Hello" });
  });

  it("assigns unique message ids across multiple sends", async () => {
    const provider = new MockEmailProvider();
    const first = await provider.send({ to: "a@example.com", subject: "A", html: "a", text: "a" });
    const second = await provider.send({ to: "b@example.com", subject: "B", html: "b", text: "b" });
    expect(first.providerMessageId).not.toBe(second.providerMessageId);
    expect(provider.sent).toHaveLength(2);
  });

  it("rejects invalid recipient addresses", async () => {
    const provider = new MockEmailProvider();
    await expect(provider.send({ to: "not-an-email", subject: "A", html: "a", text: "a" }))
      .rejects.toThrow(EmailValidationError);
  });

  it("reset() clears sent history", async () => {
    const provider = new MockEmailProvider();
    await provider.send({ to: "a@example.com", subject: "A", html: "a", text: "a" });
    provider.reset();
    expect(provider.sent).toHaveLength(0);
  });
});
