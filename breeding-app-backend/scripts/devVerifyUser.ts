/**
 * Marks a local account's email as verified, without sending or clicking anything.
 *
 * This exists so a misconfigured mailer can never again block local development:
 * if no transport is set up, the queued verification email goes to the mock
 * provider and nothing is delivered. Rather than reach into psql by hand, run:
 *
 *   npm run dev:verify-user -- someone@example.com
 *
 * Deliberately a CLI script and not an HTTP route — an endpoint that flips
 * emailVerified is an account-takeover primitive if it ever escapes dev, whereas
 * this requires shell access to the machine holding DATABASE_URL. It also
 * refuses to run under NODE_ENV=production unless explicitly forced, so an
 * absent-minded `railway run` cannot quietly verify a real user.
 */
import { prisma } from "../src/lib/prisma";

const db = prisma as any;

const FORCE = process.argv.includes("--force");
const rawEmail = process.argv.slice(2).find((argument) => !argument.startsWith("--")) || "";

const main = async (): Promise<void> => {
  if (process.env.NODE_ENV === "production" && !FORCE) {
    console.error(
      "[dev:verify-user] refusing to run with NODE_ENV=production. " +
        "This bypasses email verification; pass --force only if you truly mean it."
    );
    process.exitCode = 1;
    return;
  }

  const email = rawEmail.trim().toLowerCase();
  if (!email) {
    console.error("[dev:verify-user] usage: npm run dev:verify-user -- <email>");
    process.exitCode = 1;
    return;
  }

  const user = await db.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`[dev:verify-user] no user found with email "${email}".`);
    process.exitCode = 1;
    return;
  }

  if (user.emailVerified) {
    console.log(`[dev:verify-user] ${email} is already verified — nothing to do.`);
    return;
  }

  await db.user.update({
    where: { id: user.id },
    data: { emailVerified: true, emailVerifiedAt: new Date() },
  });

  // Leave no usable verification token behind: the account is verified now, so
  // any outstanding link should stop working, exactly as a real click would.
  const revoked = await db.accountToken.updateMany({
    where: { userId: user.id, purpose: "verify_email", consumedAt: null, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  console.log(`[dev:verify-user] verified ${email} (userId=${user.id}, revoked ${revoked.count} pending token(s)).`);
};

main()
  .catch((error) => {
    console.error("[dev:verify-user] failed:", error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect?.());
