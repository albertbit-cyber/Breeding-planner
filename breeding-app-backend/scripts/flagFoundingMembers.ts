/**
 * Flags waitlist addresses as founding members, so their checkout carries the
 * founding-member price (see src/services/billingService.ts).
 *
 *   npm run billing:founding -- waitlist.txt
 *   npm run billing:founding -- someone@example.com other@example.com
 *
 * A file argument is read as one address per line (CSV is fine: the first
 * thing on each line that looks like an email is taken). Re-running is safe;
 * an address already flagged is left as it is. Nothing is ever removed here:
 * un-flagging someone takes back a promise, so it is done by hand.
 *
 * The waitlist has no backend -- joining it is an email to info@serpentora.com
 * -- so this list is built from that inbox. Flagging an address that has no
 * account yet is the normal case: the row waits until that person signs up.
 */
import { existsSync, readFileSync } from "node:fs";
import { prisma } from "../src/lib/prisma";

const db = prisma as any;
const EMAIL = /[^\s,;"'<>]+@[^\s,;"'<>]+\.[^\s,;"'<>]+/;

const collectEmails = (args: string[]): string[] => {
  const found: string[] = [];
  for (const arg of args) {
    const lines = existsSync(arg) ? readFileSync(arg, "utf8").split(/\r?\n/) : [arg];
    for (const line of lines) {
      const match = line.match(EMAIL);
      if (match) found.push(match[0].trim().toLowerCase());
    }
  }
  return Array.from(new Set(found));
};

const main = async (): Promise<void> => {
  const emails = collectEmails(process.argv.slice(2).filter((argument) => !argument.startsWith("--")));
  if (!emails.length) {
    console.error("[billing:founding] no email addresses given. Pass a file or addresses.");
    process.exitCode = 1;
    return;
  }
  let added = 0;
  for (const email of emails) {
    const existing = await db.foundingMember.findUnique({ where: { email } });
    if (existing) continue;
    await db.foundingMember.create({ data: { email, source: "waitlist" } });
    added += 1;
  }
  console.log(`[billing:founding] ${added} added, ${emails.length - added} already flagged.`);
};

main()
  .catch((error) => {
    console.error("[billing:founding] failed:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
