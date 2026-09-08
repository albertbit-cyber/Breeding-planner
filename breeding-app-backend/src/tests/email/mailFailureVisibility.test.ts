/**
 * Regression cover for the "verification email never arrives, server says 200"
 * class of failure. Each test here pins one of the things that made that
 * failure invisible: an unconfigured transport that looked like a successful
 * send, a mailer error that never reached a log, and an address that failed
 * lookup before it was ever normalized.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

vi.mock("../../lib/prisma", () => {
  const accountToken = {
    updateMany: vi.fn(),
    create: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
  };
  return {
    prisma: {
      user: { findUnique: vi.fn(), update: vi.fn() },
      securityEvent: { create: vi.fn() },
      accountToken,
      $transaction: vi.fn((callback: (tx: unknown) => unknown) => callback({ accountToken })),
    },
  };
});

vi.mock("../../email/queueService", () => ({
  enqueueEmail: vi.fn(),
  markCancelledBySystem: vi.fn(),
  markSuppressed: vi.fn(),
  markSent: vi.fn(),
  scheduleRetry: vi.fn(),
  markPermanentFailure: vi.fn(),
  claimNextBatch: vi.fn(),
  recoverStuckJobs: vi.fn(),
}));

vi.mock("../../email/preferencesService", () => ({
  isCategoryEnabled: vi.fn().mockResolvedValue(true),
  REQUIRED_CATEGORIES: new Set(["account_and_security"]),
}));

vi.mock("../../email/suppressionService", () => ({
  isRecipientSuppressed: vi.fn().mockResolvedValue(false),
}));

import { app } from "../../app";
import { prisma } from "../../lib/prisma";
import { enqueueEmail } from "../../email/queueService";
import { processEmailJob } from "../../email/worker";
import { MockEmailProvider } from "../../email/providers/mockProvider";

const db = prisma as any;

const GENERIC_MESSAGE = "If that email is registered and unverified, a new verification link has been sent.";

const mockUser = {
  id: "user-1",
  email: "test@example.com",
  fullName: "Test User",
  role: "breeder",
  isActive: true,
  emailVerified: false,
  emailVerifiedAt: null,
  pendingEmail: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

let errorSpy: ReturnType<typeof vi.spyOn>;
let warnSpy: ReturnType<typeof vi.spyOn>;
let infoSpy: ReturnType<typeof vi.spyOn>;

/** All arguments of every call to a console spy, flattened into one string. */
const loggedText = (spy: ReturnType<typeof vi.spyOn>): string =>
  spy.mock.calls.map((call) => call.map((part) => JSON.stringify(part)).join(" ")).join("\n");

beforeEach(() => {
  vi.clearAllMocks();
  (enqueueEmail as any).mockResolvedValue({ id: "job-1" });
  db.accountToken.updateMany.mockResolvedValue({ count: 0 });
  db.accountToken.create.mockResolvedValue({ id: "token-1" });
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("resend-verification when the mailer fails", () => {
  it("still answers 200 with the generic message, and logs the failure in full", async () => {
    db.user.findUnique.mockResolvedValue(mockUser);
    (enqueueEmail as any).mockRejectedValue(
      Object.assign(new Error("could not connect to database"), { code: "P1001" })
    );

    const res = await request(app).post("/api/auth/resend-verification").send({ email: "test@example.com" });

    // The anti-enumeration contract is unchanged by the failure.
    expect(res.status).toBe(200);
    expect(res.body.message).toBe(GENERIC_MESSAGE);

    // ...but the server must not be silent about it.
    expect(errorSpy).toHaveBeenCalled();
    const logged = loggedText(errorSpy);
    expect(logged).toContain("[mail] send failed");
    expect(logged).toContain("test@example.com");
    expect(logged).toContain("account_email_verification");
    expect(logged).toContain("could not connect to database");
    expect(logged).toContain("P1001");
  });

  it("does not leak the account's existence through the status code", async () => {
    // An unknown address and a known-but-failing one must be indistinguishable.
    db.user.findUnique.mockResolvedValue(null);
    const unknown = await request(app).post("/api/auth/resend-verification").send({ email: "nobody@example.com" });

    db.user.findUnique.mockResolvedValue(mockUser);
    (enqueueEmail as any).mockRejectedValue(new Error("queue is down"));
    const known = await request(app).post("/api/auth/resend-verification").send({ email: "test@example.com" });

    expect(known.status).toBe(unknown.status);
    expect(known.body).toEqual(unknown.body);
  });
});

describe("registration when the mailer fails", () => {
  it("still reports the created account instead of a 500", async () => {
    // No existing account, so registration proceeds and commits the user.
    db.user.findUnique.mockResolvedValue(null);
    db.user.create = vi.fn().mockResolvedValue(mockUser);
    db.$transaction.mockImplementation((callback: (tx: unknown) => unknown) =>
      callback({ user: { create: db.user.create }, accountToken: db.accountToken })
    );
    (enqueueEmail as any).mockRejectedValue(new Error("queue is down"));

    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "test@example.com", password: "SuperSecret123!", fullName: "Test User", role: "buyer" });

    // The account exists. Answering 500 would send the caller back through
    // registration, where they would be told the address is already taken.
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe("test@example.com");
    // The response says the mail did not go out, so the UI can point at resend.
    expect(res.body.user.verificationEmailQueued).toBe(false);
    expect(loggedText(errorSpy)).toContain("[mail] send failed");
  });
});

describe("user lookup normalization", () => {
  it("matches an email that differs only in case and surrounding whitespace", async () => {
    db.user.findUnique.mockResolvedValue(mockUser);

    const res = await request(app)
      .post("/api/auth/resend-verification")
      .send({ email: "  TeSt@ExAmPle.COM  " });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe(GENERIC_MESSAGE);
    // The padded, mixed-case input must reach Prisma already normalized —
    // before this fix it was rejected as invalid at the validator instead.
    expect(db.user.findUnique).toHaveBeenCalledWith({ where: { email: "test@example.com" } });
    expect(enqueueEmail).toHaveBeenCalledWith(
      expect.objectContaining({ templateKey: "account_email_verification" })
    );
  });
});

describe("no transport configured in development", () => {
  const verificationJob = {
    id: "job-1",
    ownerId: "user-1",
    category: "account_and_security",
    recipientEmail: "test@example.com",
    templateKey: "account_email_verification",
    templateVersion: 1,
    templatePayload: {
      fullName: "Test User",
      actionUrl: "http://localhost:5210/verify-email?token=raw-token-value",
      expiresInHoursDisplay: "48 hours",
    },
    subject: "Verify your Breeding Planner email address",
    idempotencyKey: "idem-1",
    attemptCount: 1,
  };

  it("emits the verification URL through the dev logger instead of dropping it", async () => {
    // NODE_ENV is "test" here (src/tests/setup.ts) — i.e. not production.
    const provider = new MockEmailProvider();

    await processEmailJob(verificationJob, provider);

    const logged = loggedText(warnSpy);
    expect(logged).toContain("[mail][dev] verification link for test@example.com");
    expect(logged).toContain("http://localhost:5210/verify-email?token=raw-token-value");
  });

  it("does not let a mock 'send' read as a real delivery", async () => {
    const provider = new MockEmailProvider();

    await processEmailJob(verificationJob, provider);

    // The success line is a warning naming the mock transport, not an info
    // "sent" — that ambiguity is what hid this bug for so long.
    expect(loggedText(warnSpy)).toContain("send NOT delivered (mock transport");
    expect(loggedText(infoSpy)).not.toContain("[mail] sent");
  });

  it("never prints a token when running in production", async () => {
    const provider = new MockEmailProvider();
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    // env is read at module load, so re-import it with the production value.
    vi.resetModules();

    try {
      const { logDevActionLink } = await import("../../email/sendLog");
      logDevActionLink(verificationJob);
      expect(loggedText(warnSpy)).not.toContain("raw-token-value");
    } finally {
      process.env.NODE_ENV = previous;
      vi.resetModules();
    }

    expect(provider.sent).toHaveLength(0);
  });
});
