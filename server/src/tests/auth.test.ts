import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

// Mock Prisma before importing app (which imports services that import prisma).
vi.mock("../lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { app } from "../app";
import { prisma } from "../lib/prisma";
import bcrypt from "bcryptjs";

const mockUser = {
  id: "user-1",
  email: "test@example.com",
  passwordHash: bcrypt.hashSync("password123", 1),
  fullName: "Test User",
  role: "breeder" as const,
  isActive: true,
  refreshToken: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/auth/register", () => {
  it("returns 201 and user on valid input", async () => {
    const newUser = { ...mockUser, email: "new@example.com" };
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.user.create).mockResolvedValue(newUser);

    const res = await request(app).post("/api/auth/register").send({
      email: "new@example.com",
      password: "password123",
      fullName: "New User",
    });

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ email: "new@example.com" });
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  it("allows public buyer registration", async () => {
    const newUser = { ...mockUser, email: "buyer@example.com", role: "buyer" as const };
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
});

describe("POST /api/auth/recover-password", () => {
  it("returns 200 when account details match and password is updated", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);
    vi.mocked(prisma.user.update).mockResolvedValue({ ...mockUser, refreshToken: null });

    const res = await request(app).post("/api/auth/recover-password").send({
      email: "test@example.com",
      fullName: "Test User",
      newPassword: "newpassword123",
    });

    expect(res.status).toBe(200);
    expect(res.body.message).toContain("Password updated");
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          refreshToken: null,
        }),
      })
    );
  });

  it("returns 400 on invalid payload", async () => {
    const res = await request(app).post("/api/auth/recover-password").send({
      email: "test@example.com",
      fullName: "",
      newPassword: "short",
    });

    expect(res.status).toBe(400);
    expect(res.body.errors?.fullName).toBeDefined();
    expect(res.body.errors?.newPassword).toBeDefined();
  });

  it("returns 404 when the account cannot be verified", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);

    const res = await request(app).post("/api/auth/recover-password").send({
      email: "test@example.com",
      fullName: "Wrong Name",
      newPassword: "newpassword123",
    });

    expect(res.status).toBe(404);
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
});
