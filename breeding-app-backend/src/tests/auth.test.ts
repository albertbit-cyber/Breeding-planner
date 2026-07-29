import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

// Mock Prisma before importing app (which imports services that import prisma).
vi.mock("../lib/prisma", () => {
  const accountToken = {
    updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    create: vi.fn().mockResolvedValue({ id: "token-1" }),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
  };
  const user = {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  };
  // Registration provisions a breeder's organization in the same transaction as
  // the account (see authService.registerUser / organizationService), so the
  // transaction client has to expose these too, not just accountToken.
  const membership = {
    findUnique: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({ id: "mbr_user-1", role: "owner" }),
  };
  const organization = {
    create: vi.fn().mockResolvedValue({ id: "org_user-1", kind: "breeder" }),
  };
  return {
    prisma: {
      user,
      refreshSession: {
        create: vi.fn(),
        findFirst: vi.fn(),
        updateMany: vi.fn(),
      },
      securityEvent: {
        create: vi.fn(),
      },
      accountToken,
      membership,
      organization,
      $transaction: vi.fn((callback: (tx: unknown) => unknown) =>
        callback({ accountToken, user, membership, organization })
      ),
    },
  };
});

vi.mock("../email/queueService", () => ({
  enqueueEmail: vi.fn().mockResolvedValue({ id: "job-1" }),
}));

import { app } from "../app";
import { prisma } from "../lib/prisma";
import { enqueueEmail } from "../email/queueService";
import bcrypt from "bcryptjs";

const mockUser = {
  id: "user-1",
  email: "test@example.com",
  passwordHash: bcrypt.hashSync("password123", 1),
  fullName: "Test User",
  role: "breeder" as const,
  isActive: true,
  emailVerified: true,
  emailVerifiedAt: new Date(),
  pendingEmail: null,
  pendingEmailRequestedAt: null,
  passwordChangedAt: null,
  status: "active",
  verificationStatus: "not_applied",
  subscriptionPlan: "free",
  subscriptionStatus: "inactive",
  subscriptionStartedAt: null,
  subscriptionRenewalAt: null,
  subscriptionTrialEndsAt: null,
  subscriptionPaymentStatus: "none",
  lastLoginAt: null,
  refreshToken: null,
  passwordResetToken: null,
  passwordResetExpiry: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const cookieHeaders = (res: request.Response): string[] => {
  const value = res.headers["set-cookie"];
  return Array.isArray(value) ? value : value ? [String(value)] : [];
};

const cookieHeaderValue = (res: request.Response, name: string): string => {
  const header = cookieHeaders(res).find((entry) => entry.startsWith(`${name}=`));
  if (!header) throw new Error(`Missing ${name} cookie`);
  return header.split(";")[0];
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/auth/register", () => {
  it("returns 201 and user on valid input, and queues a verification email", async () => {
    const newUser = { ...mockUser, email: "new@example.com", emailVerified: false, emailVerifiedAt: null };
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.user.create).mockResolvedValue(newUser);

    const res = await request(app).post("/api/auth/register").send({
      email: "new@example.com",
      password: "password123",
      fullName: "New User",
    });

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ email: "new@example.com", emailVerified: false });
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(enqueueEmail).toHaveBeenCalledWith(expect.objectContaining({
      recipientEmail: "new@example.com",
      templateKey: "account_email_verification",
      category: "account_and_security",
    }));
  });

  it("allows public buyer registration", async () => {
    const newUser = { ...mockUser, email: "buyer@example.com", role: "buyer" as const, emailVerified: false, emailVerifiedAt: null };
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.user.create).mockResolvedValue(newUser);

    const res = await request(app).post("/api/auth/register").send({
      email: "buyer@example.com",
      password: "password123",
      fullName: "Buyer User",
      role: "buyer",
    });

    expect(res.status).toBe(201);
    expect(prisma.user.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ role: "buyer" }),
    }));
    expect(res.body.user).toMatchObject({ email: "buyer@example.com", role: "buyer" });
  });

  it("returns 400 on missing email", async () => {
    const res = await request(app).post("/api/auth/register").send({
      password: "password123",
      fullName: "New User",
    });
    expect(res.status).toBe(400);
    expect(res.body.errors?.email).toBeDefined();
  });

  it("returns 400 on short password", async () => {
    const res = await request(app).post("/api/auth/register").send({
      email: "test@example.com",
      password: "short",
      fullName: "Test",
    });
    expect(res.status).toBe(400);
    expect(res.body.errors?.password).toBeDefined();
  });

  it("returns 409 when email already exists", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);

    const res = await request(app).post("/api/auth/register").send({
      email: "test@example.com",
      password: "password123",
      fullName: "Test User",
    });
    expect(res.status).toBe(409);
  });
});

describe("POST /api/auth/login", () => {
  it("returns 200 with token and refreshToken on valid credentials", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);
    vi.mocked(prisma.user.update).mockResolvedValue(mockUser);

    const res = await request(app).post("/api/auth/login").send({
      email: "test@example.com",
      password: "password123",
    });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    expect(res.body.user.email).toBe("test@example.com");
    expect(cookieHeaders(res).join(";")).toContain("bp_access_token=");
    expect(cookieHeaders(res).join(";")).toContain("bp_refresh_token=");
    expect(cookieHeaders(res).join(";")).toContain("bp_csrf_token=");
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        refreshToken: expect.stringMatching(/^sha256:/),
      }),
    }));
    const storedRefreshToken = vi.mocked(prisma.user.update).mock.calls[0]?.[0]?.data?.refreshToken;
    expect(storedRefreshToken).not.toBe(res.body.refreshToken);
    expect((prisma as any).refreshSession.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        userId: "user-1",
        tokenHash: expect.stringMatching(/^sha256:/),
      }),
    }));
  });

  it("returns 401 on wrong password", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);

    const res = await request(app).post("/api/auth/login").send({
      email: "test@example.com",
      password: "wrongpassword",
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 on non-existent user", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    const res = await request(app).post("/api/auth/login").send({
      email: "nobody@example.com",
      password: "password123",
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 on inactive user", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...mockUser, isActive: false });

    const res = await request(app).post("/api/auth/login").send({
      email: "test@example.com",
      password: "password123",
    });
    expect(res.status).toBe(401);
  });

  it("still allows an unverified account to log in (verification is a frontend gate, not a login gate) and reports emailVerified: false", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...mockUser, emailVerified: false });
    vi.mocked(prisma.user.update).mockResolvedValue({ ...mockUser, emailVerified: false });

    const res = await request(app).post("/api/auth/login").send({
      email: "test@example.com",
      password: "password123",
    });
    expect(res.status).toBe(200);
    expect(res.body.user.emailVerified).toBe(false);
  });
});

describe("POST /api/auth/refresh", () => {
  it("refreshes using the httpOnly refresh cookie while keeping JSON token support", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);
    vi.mocked(prisma.user.update).mockResolvedValue(mockUser);

    const loginRes = await request(app).post("/api/auth/login").send({
      email: "test@example.com",
      password: "password123",
    });
    const refreshToken = loginRes.body.refreshToken;
    const refreshCookie = cookieHeaderValue(loginRes, "bp_refresh_token");

    vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...mockUser, refreshToken });
    vi.mocked(prisma.user.update).mockResolvedValue({ ...mockUser, refreshToken });
    vi.mocked((prisma as any).refreshSession.findFirst).mockResolvedValue({ id: "session-1" });
    vi.mocked((prisma as any).refreshSession.create).mockResolvedValue({ id: "session-2" });
    vi.mocked((prisma as any).refreshSession.updateMany).mockResolvedValue({ count: 1 });

    const res = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", refreshCookie)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    expect(cookieHeaders(res).join(";")).toContain("bp_access_token=");
    expect(prisma.user.update).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        refreshToken: expect.stringMatching(/^sha256:/),
      }),
    }));
    expect((prisma as any).refreshSession.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        revokedAt: expect.any(Date),
        replacedBySessionId: "session-2",
      }),
    }));
  });
});

describe("GET /api/auth/me", () => {
  it("returns 401 with no token", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("returns 401 with invalid token", async () => {
    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", "Bearer invalid.token.here");
    expect(res.status).toBe(401);
  });

  it("returns 200 with valid token", async () => {
    // Login first to get a real token.
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);
    vi.mocked(prisma.user.update).mockResolvedValue(mockUser);

    const loginRes = await request(app).post("/api/auth/login").send({
      email: "test@example.com",
      password: "password123",
    });
    const { token } = loginRes.body;

    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);

    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe("test@example.com");
  });

  it("returns 200 with valid access cookie", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);
    vi.mocked(prisma.user.update).mockResolvedValue(mockUser);

    const loginRes = await request(app).post("/api/auth/login").send({
      email: "test@example.com",
      password: "password123",
    });
    const accessCookie = cookieHeaderValue(loginRes, "bp_access_token");

    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);

    const res = await request(app)
      .get("/api/auth/me")
      .set("Cookie", accessCookie);

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe("test@example.com");
  });
});

describe("POST /api/auth/logout", () => {
  it("requires CSRF for cookie-authenticated write requests", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);
    vi.mocked(prisma.user.update).mockResolvedValue(mockUser);

    const loginRes = await request(app).post("/api/auth/login").send({
      email: "test@example.com",
      password: "password123",
    });
    const accessCookie = cookieHeaderValue(loginRes, "bp_access_token");

    const res = await request(app)
      .post("/api/auth/logout")
      .set("Cookie", accessCookie)
      .send({});

    expect(res.status).toBe(403);
  });

  it("logs out with matching CSRF cookie and header", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);
    vi.mocked(prisma.user.update).mockResolvedValue(mockUser);

    const loginRes = await request(app).post("/api/auth/login").send({
      email: "test@example.com",
      password: "password123",
    });
    const accessCookie = cookieHeaderValue(loginRes, "bp_access_token");
    const csrfCookie = cookieHeaderValue(loginRes, "bp_csrf_token");
    const csrfValue = csrfCookie.split("=")[1];

    const res = await request(app)
      .post("/api/auth/logout")
      .set("Cookie", [accessCookie, csrfCookie])
      .set("x-csrf-token", csrfValue)
      .send({});

    expect(res.status).toBe(200);
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "user-1" },
      data: { refreshToken: null },
    }));
    expect((prisma as any).refreshSession.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: "user-1", revokedAt: null }),
      data: expect.objectContaining({ revokedAt: expect.any(Date) }),
    }));
  });
});
