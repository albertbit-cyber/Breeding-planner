import type { EmailMessage, EmailSendResult } from "./types";

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<EmailSendResult>;
}
