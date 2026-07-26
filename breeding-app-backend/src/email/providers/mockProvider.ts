import type { EmailProvider } from "../provider";
import type { EmailMessage, EmailSendResult } from "../types";
import { assertValidEmailAddress } from "../types";

export type MockSentMessage = EmailMessage & { providerMessageId: string };

/**
 * In-memory provider used in development/test. Never performs network I/O.
 * Sent messages are retained on the instance so tests can assert on them.
 */
export class MockEmailProvider implements EmailProvider {
  public readonly name = "mock";
  public readonly sent: MockSentMessage[] = [];
  private counter = 0;

  async send(message: EmailMessage): Promise<EmailSendResult> {
    assertValidEmailAddress(message.to);
    this.counter += 1;
    const providerMessageId = `mock_${this.counter}_${Date.now()}`;
    this.sent.push({ ...message, providerMessageId });
    return { provider: this.name, providerMessageId };
  }

  reset(): void {
    this.sent.length = 0;
    this.counter = 0;
  }
}
