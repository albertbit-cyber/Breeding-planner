import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { signAuthToken, verifyAuthToken } from "../utils/jwt";

/**
 * One partner laboratory, onboarded end to end through the live Express stack:
 *
 *   admin invites → the invited address accepts and the lab's organization
 *   comes into existence → the lab sets its species, catalogue, pricing and
 *   team → a breeder finds it, orders from it → the lab receives the order
 *   and enters a result → the breeder reads it.
 *
 * Every step runs against one in-memory database, so each sees exactly what the
 * previous one wrote. That is the point of this suite: the per-route suites
 * prove each door locks, this one proves a real laboratory can walk through
 * them in order without an engineer touching the database in between.
 *
 * Mocked, because they are not onboarding: the email transport (the test reads
 * invitation links out of what would have been sent), the write-back of a
 * result into the breeder's own animal records, and the results-ready mail.
 */

vi.mock("../lib/prisma", async () => {
  const { createInMemoryPrisma } = await import("./support/inMemoryPrisma");
  return { prisma: createInMemoryPrisma() };
});

vi.mock("../email/queueService", () => ({
  enqueueEmail: vi.fn(async (input: any) => ({ id: `job_${input.idempotencyKey}` })),
}));

vi.mock("../services/labGeneticsService", () => ({
  applyConfirmedResultGenetics: vi.fn(async () => []),
}));

vi.mock("../services/labOrderNotificationService", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, notifyResultsReady: vi.fn(async () => undefined) };
});

import { app } from "../app";
import { prisma } from "../lib/prisma";
import { enqueueEmail } from "../email/queueService";
import { notifyResultsReady } from "../services/labOrderNotificationService";

const db = prisma as any;
const rows = (delegate: string): any[] => db.$rows(delegate);

const ADMIN_ID = "user_owner";
const BREEDER_ID = "user_breeder";
const PARTNER_EMAIL = "director@partner-lab.example";
const TECHNICIAN_EMAIL = "tech@partner-lab.example";

const adminToken = () =>
  signAuthToken({ sub: ADMIN_ID, email: "owner@example.com", role: "admin", persistedRole: "admin", portal: "admin" });

const breederToken = () =>
  signAuthToken({ sub: BREEDER_ID, email: "keeper@example.com", role: "breeder", persistedRole: "breeder", portal: "breeder" });

/** The raw token exists only in the email, so that is where the test reads it from. */
const tokenFromLastInvitationEmail = (recipient: string): string => {
  const call = vi
    .mocked(enqueueEmail)
    .mock.calls.map(([input]) => input as any)
    .filter((input) => input.recipientEmail === recipient)
    .pop();
  if (!call) throw new Error(`No invitation email was queued for ${recipient}`);
  const url = new URL(String(call.templatePayload.actionUrl).replace("/#/", "/"));
  const token = url.searchParams.get("token");
  if (!token) throw new Error(`Invitation email for ${recipient} carried no token`);
  return token;
};

const inviteLab = (overrides: Record<string, unknown> = {}) =>
  request(app)
    .post("/api/admin/vendor-labs/invites")
    .set("Authorization", `Bearer ${adminToken()}`)
    .send({
      email: PARTNER_EMAIL,
      labName: "Partner Reptile Diagnostics",
      contactPerson: "Dr. Imke Vogt",
      location: "Leipzig, Germany",
      reason: "Signed partner agreement",
      ...overrides,
    });

const seedPlatform = () => {
  db.$reset();
  rows("user").push(
    {
      id: ADMIN_ID,
      email: "owner@example.com",
      fullName: "Platform Owner",
      role: "admin",
      status: "active",
      isActive: true,
      emailVerified: true,
      passwordHash: "x",
    },
    {
      id: BREEDER_ID,
      email: "keeper@example.com",
      fullName: "Keen Keeper",
      role: "breeder",
      status: "active",
      isActive: true,
      emailVerified: true,
      passwordHash: "x",
    }
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  seedPlatform();
});

// Two real accounts are created and signed in, each a cost-12 bcrypt hash and
// compare (about a second apiece), so the default 5s is too tight when the full
// suite is competing for the CPU.
const WHOLE_PATH_TIMEOUT_MS = 30_000;

describe("a partner laboratory goes from invitation to first result", () => {
  it("walks the whole path without anyone touching the database", async () => {
    // ── 1. The admin invites the laboratory ───────────────────────────────
    const invited = await inviteLab();
    expect(invited.status).toBe(201);
    expect(invited.body.invite).toMatchObject({ kind: "vendor_lab", status: "pending", email: PARTNER_EMAIL });
    expect(invited.body.email.queued).toBe(true);
    // Nothing exists yet but the invitation: an unaccepted invite leaves no half-built tenant.
    expect(rows("organization")).toHaveLength(0);

    const rawToken = tokenFromLastInvitationEmail(PARTNER_EMAIL);
    expect(rows("organizationInvite")[0].tokenHash).not.toContain(rawToken);

    // ── 2. The invited address opens the link ─────────────────────────────
    const preview = await request(app).get(`/api/invites/${rawToken}`);
    expect(preview.status).toBe(200);
    expect(preview.body.invite).toMatchObject({
      email: PARTNER_EMAIL,
      organizationName: "Partner Reptile Diagnostics",
      kind: "vendor_lab",
      requiresPassword: true,
    });

    // ── 3. …and accepts, which creates the account and the organization ───
    const accepted = await request(app)
      .post(`/api/invites/${rawToken}/accept`)
      .send({ fullName: "Imke Vogt", password: "a-strong-passphrase" });
    expect(accepted.status).toBe(201);
    expect(accepted.body.token).toBeTruthy();
    expect(accepted.body.organizationRole).toBe("owner");
    const labOrgId: string = accepted.body.organizationId;

    // The session is for the Laboratory portal. It used to fall back to the
    // breeder app, which refuses a lab account — after the invite was spent.
    expect(verifyAuthToken(accepted.body.token)).toMatchObject({ portal: "lab" });

    const organization = rows("organization").find((org) => org.id === labOrgId);
    expect(organization).toMatchObject({ kind: "lab_vendor", status: "active", name: "Partner Reptile Diagnostics" });
    expect(rows("labAccount").find((lab) => lab.organizationId === labOrgId)).toMatchObject({
      status: "approved",
      contactPerson: "Dr. Imke Vogt",
      location: "Leipzig, Germany",
    });
    expect(rows("pricingConfig").find((row) => row.organizationId === labOrgId)).toBeTruthy();
    expect(rows("user").find((user) => user.email === PARTNER_EMAIL)).toMatchObject({ role: "lab", emailVerified: true });

    const labAuth = `Bearer ${accepted.body.token}`;

    // ── 4. The lab sets itself up in the portal ───────────────────────────
    const profile = await request(app)
      .patch("/api/lab/my/profile")
      .set("Authorization", labAuth)
      .send({ servedSpeciesIds: ["ball-python"], turnaroundDays: 10, city: "Leipzig", country: "DE" });
    expect(profile.status).toBe(200);

    const offering = await request(app)
      .post("/api/lab/my/tests")
      .set("Authorization", labAuth)
      .send({
        name: "Clown",
        category: "morph",
        pricingType: "morph",
        speciesIds: ["ball-python"],
        geneTarget: "Clown",
        active: true,
        visibleInBreederApp: true,
      });
    expect(offering.status).toBe(201);
    const offeringId: string = offering.body.offering.id;
    expect(offering.body.offering).toMatchObject({ organizationId: labOrgId, active: true, visibleInBreederApp: true });

    const pricing = await request(app)
      .patch("/api/lab/my/pricing")
      .set("Authorization", labAuth)
      .send({ morphTier1to9FirstTest: 39, morphTier1to9AdditionalTest: 25, currency: "eur" });
    expect(pricing.status).toBe(200);
    expect(pricing.body.pricing).toMatchObject({ currency: "EUR" });

    const teamInvite = await request(app)
      .post("/api/lab/my/team/invites")
      .set("Authorization", labAuth)
      .send({ email: TECHNICIAN_EMAIL, role: "member" });
    expect(teamInvite.status).toBe(201);
    const technicianToken = tokenFromLastInvitationEmail(TECHNICIAN_EMAIL);
    const technician = await request(app)
      .post(`/api/invites/${technicianToken}/accept`)
      .send({ fullName: "Lab Technician", password: "another-passphrase" });
    expect(technician.status).toBe(201);
    // Joins the same laboratory, never a new one.
    expect(technician.body).toMatchObject({ organizationId: labOrgId, organizationRole: "member" });
    expect(rows("organization")).toHaveLength(1);

    const team = await request(app).get("/api/lab/my/team").set("Authorization", labAuth);
    expect(team.status).toBe(200);
    expect(team.body.members.map((member: any) => member.email).sort()).toEqual([PARTNER_EMAIL, TECHNICIAN_EMAIL].sort());

    // ── 5. A breeder finds the laboratory and orders from it ──────────────
    const directory = await request(app)
      .get("/api/lab/directory")
      .set("Authorization", `Bearer ${breederToken()}`);
    expect(directory.status).toBe(200);
    expect(directory.body.labs).toEqual([
      expect.objectContaining({ organizationId: labOrgId, labName: "Partner Reptile Diagnostics", testCount: 1 }),
    ]);

    const order = await request(app)
      .post("/api/lab/orders")
      .set("Authorization", `Bearer ${breederToken()}`)
      .send({
        labOrganizationId: labOrgId,
        animals: [{ animalId: "snake-1", animalName: "Jasmine", selectedTestIds: [offeringId] }],
      });
    expect(order.status).toBe(201);
    const orderId: string = order.body.order.id;
    expect(order.body.order).toMatchObject({ labOrganizationId: labOrgId, status: "submitted" });
    // Priced from this lab's own table, not the platform template.
    expect(Number(order.body.order.totalPrice)).toBe(39);

    // ── 6. The lab sees it, receives it, and enters the result ────────────
    const queue = await request(app).get("/api/lab/orders").set("Authorization", labAuth);
    expect(queue.status).toBe(200);
    expect(queue.body.orders.map((entry: any) => entry.id)).toEqual([orderId]);

    const received = await request(app)
      .patch(`/api/lab/orders/${orderId}/status`)
      .set("Authorization", `Bearer ${technician.body.token}`)
      .send({ status: "received" });
    expect(received.status).toBe(200);

    const result = await request(app)
      .post(`/api/lab/orders/${orderId}/results/submit`)
      .set("Authorization", `Bearer ${technician.body.token}`)
      .send({
        testCode: "PRD-0001",
        animalResults: [{ animalId: "snake-1", items: [{ orderedTestKey: `${orderId}:snake-1:1`, resultStatus: "visual" }] }],
      });
    expect(result.status).toBe(200);
    expect(notifyResultsReady).toHaveBeenCalledTimes(1);

    // ── 7. The breeder reads the finished order ───────────────────────────
    const finished = await request(app)
      .get(`/api/lab/orders/${orderId}`)
      .set("Authorization", `Bearer ${breederToken()}`);
    expect(finished.status).toBe(200);
    expect(finished.body.order.status).toBe("completed");
    expect(rows("shedTestOrderResult")).toEqual([
      expect.objectContaining({ orderId, animalId: "snake-1", status: "completed", analystUserId: technician.body.user.id }),
    ]);
  }, WHOLE_PATH_TIMEOUT_MS);
});

describe("the invitation is single use", () => {
  it("cannot be redeemed twice, and the second attempt changes nothing", async () => {
    await inviteLab();
    const rawToken = tokenFromLastInvitationEmail(PARTNER_EMAIL);

    const first = await request(app)
      .post(`/api/invites/${rawToken}/accept`)
      .send({ fullName: "Imke Vogt", password: "a-strong-passphrase" });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post(`/api/invites/${rawToken}/accept`)
      .send({ fullName: "Someone Else", password: "another-passphrase" });
    expect(second.status).toBe(409);
    expect(second.body.message).toMatch(/already been used/i);

    const preview = await request(app).get(`/api/invites/${rawToken}`);
    expect(preview.status).toBe(409);

    expect(rows("organization")).toHaveLength(1);
    expect(rows("user").filter((user) => user.email === PARTNER_EMAIL)).toHaveLength(1);
    expect(rows("membership")).toHaveLength(1);
  });

  it("a re-invite supersedes the earlier link", async () => {
    await inviteLab();
    const firstToken = tokenFromLastInvitationEmail(PARTNER_EMAIL);
    await inviteLab({ labName: "Partner Reptile Diagnostics GmbH" });
    const secondToken = tokenFromLastInvitationEmail(PARTNER_EMAIL);
    expect(secondToken).not.toBe(firstToken);

    const stale = await request(app)
      .post(`/api/invites/${firstToken}/accept`)
      .send({ fullName: "Imke Vogt", password: "a-strong-passphrase" });
    expect(stale.status).toBe(409);
    expect(stale.body.message).toMatch(/withdrawn/i);

    const fresh = await request(app)
      .post(`/api/invites/${secondToken}/accept`)
      .send({ fullName: "Imke Vogt", password: "a-strong-passphrase" });
    expect(fresh.status).toBe(201);
    expect(rows("organization")[0].name).toBe("Partner Reptile Diagnostics GmbH");
  });

  it("a revoked invitation opens nothing", async () => {
    const invited = await inviteLab();
    const rawToken = tokenFromLastInvitationEmail(PARTNER_EMAIL);

    const revoked = await request(app)
      .post(`/api/admin/vendor-labs/invites/${invited.body.invite.id}/revoke`)
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ reason: "Sent to the wrong address" });
    expect(revoked.status).toBe(200);

    const attempt = await request(app)
      .post(`/api/invites/${rawToken}/accept`)
      .send({ fullName: "Imke Vogt", password: "a-strong-passphrase" });
    expect(attempt.status).toBe(409);
    expect(rows("organization")).toHaveLength(0);
  });
});

describe("the invitation expires", () => {
  const expire = () => {
    const invite = rows("organizationInvite")[0];
    invite.expiresAt = new Date(Date.now() - 1000);
  };

  it("is valid for fourteen days", async () => {
    const before = Date.now();
    await inviteLab();
    const expiresAt = new Date(rows("organizationInvite")[0].expiresAt).getTime();
    const days = (expiresAt - before) / (24 * 60 * 60 * 1000);
    expect(days).toBeGreaterThan(13.99);
    expect(days).toBeLessThan(14.01);
  });

  it("an expired link can neither be previewed nor accepted, and creates nothing", async () => {
    await inviteLab();
    const rawToken = tokenFromLastInvitationEmail(PARTNER_EMAIL);
    expire();

    const preview = await request(app).get(`/api/invites/${rawToken}`);
    expect(preview.status).toBe(410);
    expect(preview.body.message).toMatch(/expired/i);

    const attempt = await request(app)
      .post(`/api/invites/${rawToken}/accept`)
      .send({ fullName: "Imke Vogt", password: "a-strong-passphrase" });
    expect(attempt.status).toBe(410);

    expect(rows("organization")).toHaveLength(0);
    expect(rows("user").filter((user) => user.email === PARTNER_EMAIL)).toHaveLength(0);
    expect(rows("organizationInvite")[0].status).toBe("pending");
  });

  it("the admin's list shows it as expired, and a fresh invite to the same address works", async () => {
    await inviteLab();
    expire();

    const list = await request(app)
      .get("/api/admin/vendor-labs/invites")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(list.status).toBe(200);
    expect(list.body.invites[0]).toMatchObject({ status: "pending", isExpired: true });

    await inviteLab();
    const fresh = await request(app)
      .post(`/api/invites/${tokenFromLastInvitationEmail(PARTNER_EMAIL)}/accept`)
      .send({ fullName: "Imke Vogt", password: "a-strong-passphrase" });
    expect(fresh.status).toBe(201);
  });
});

describe("who may issue a laboratory invitation", () => {
  it("only the platform admin, from the admin console", async () => {
    const asBreeder = await request(app)
      .post("/api/admin/vendor-labs/invites")
      .set("Authorization", `Bearer ${breederToken()}`)
      .send({ email: PARTNER_EMAIL, labName: "Self-made Lab" });
    expect(asBreeder.status).toBe(403);
    expect(rows("organizationInvite")).toHaveLength(0);
  });

  it("an address that already belongs to an organization is refused at issue time", async () => {
    await inviteLab();
    await request(app)
      .post(`/api/invites/${tokenFromLastInvitationEmail(PARTNER_EMAIL)}/accept`)
      .send({ fullName: "Imke Vogt", password: "a-strong-passphrase" });

    const again = await inviteLab({ labName: "A Second Lab" });
    expect(again.status).toBe(409);
  });
});
