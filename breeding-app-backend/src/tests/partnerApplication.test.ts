import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/prisma", () => {
  const model = () => ({
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  });
  return { prisma: { partnerApplication: model(), adminAuditLog: model() } };
});
vi.mock("../services/securityEventService", () => ({ recordSecurityEvent: vi.fn() }));
vi.mock("../services/adminService", () => ({ logAdminAction: vi.fn() }));

import { prisma } from "../lib/prisma";
import { logAdminAction } from "../services/adminService";
import {
  listApplications,
  reviewApplication,
  submitApplication,
} from "../services/partnerApplicationService";

const db = prisma as any;
const ADMIN = { id: "admin-1", email: "admin@example.com", role: "admin" as const };

const valid = {
  labName: "Helix Genetics",
  contactName: "Sam Rivers",
  email: "Sam@Helix.test",
};

beforeEach(() => {
  vi.clearAllMocks();
  db.partnerApplication.findFirst.mockResolvedValue(null);
  db.partnerApplication.create.mockResolvedValue({ id: "app-1", ...valid, status: "pending" });
});

/**
 * The property that matters most here is a negative one: applying must not be a
 * back door into the platform. Invitation-only onboarding is the product rule,
 * and this endpoint exists only so a laboratory can make contact.
 */
describe("submitApplication", () => {
  it("creates a lead and nothing else", async () => {
    const result = await submitApplication(valid);

    expect(result).toEqual({ received: true });
    expect(db.partnerApplication.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "pending" }) })
    );
  });

  it("tells the applicant nothing beyond the fact that it arrived", async () => {
    const result = await submitApplication(valid);

    // No id, no status, no timestamps: otherwise this becomes a way to probe
    // which laboratories have already applied.
    expect(Object.keys(result)).toEqual(["received"]);
  });

  it("normalizes the email so duplicates collapse", async () => {
    await submitApplication(valid);

    const data = db.partnerApplication.create.mock.calls[0][0].data;
    expect(data.email).toBe("sam@helix.test");
  });

  it("updates an existing pending application rather than queueing a duplicate", async () => {
    db.partnerApplication.findFirst.mockResolvedValue({ id: "app-existing" });
    db.partnerApplication.update.mockResolvedValue({ id: "app-existing" });

    await submitApplication(valid);

    expect(db.partnerApplication.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "app-existing" } })
    );
    expect(db.partnerApplication.create).not.toHaveBeenCalled();
  });

  it("requires a laboratory name, a contact and a valid email", async () => {
    await expect(submitApplication({ ...valid, labName: "" })).rejects.toMatchObject({ statusCode: 400 });
    await expect(submitApplication({ ...valid, contactName: " " })).rejects.toMatchObject({ statusCode: 400 });
    await expect(submitApplication({ ...valid, email: "not-an-email" })).rejects.toMatchObject({ statusCode: 400 });
  });

  it("rejects a website that is not a URL", async () => {
    await expect(
      submitApplication({ ...valid, website: "javascript:alert(1)" })
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("reviewApplication", () => {
  beforeEach(() => {
    db.partnerApplication.findUnique.mockResolvedValue({ id: "app-1", status: "pending" });
    db.partnerApplication.update.mockResolvedValue({
      id: "app-1",
      ...valid,
      status: "invited",
      reviewer: { id: ADMIN.id, fullName: "Admin" },
    });
  });

  it("records the decision in the audit log", async () => {
    await reviewApplication(ADMIN, "app-1", { status: "invited", note: "Good fit" });

    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "partner_application_invited", reason: "Good fit" })
    );
  });

  it("never issues an invitation as a side effect of reviewing", async () => {
    await reviewApplication(ADMIN, "app-1", { status: "invited" });

    // Marking an application "invited" is bookkeeping. Actually granting access
    // is a separate, deliberate action through the invitation flow, so it can
    // never happen by tidying a queue.
    const updated = db.partnerApplication.update.mock.calls[0][0].data;
    expect(updated).not.toHaveProperty("tokenHash");
    expect(updated.status).toBe("invited");
  });

  it("refuses to move an application back to pending", async () => {
    await expect(reviewApplication(ADMIN, "app-1", { status: "pending" })).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("404s an application that does not exist", async () => {
    db.partnerApplication.findUnique.mockResolvedValue(null);

    await expect(reviewApplication(ADMIN, "nope", { status: "declined" })).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

describe("listApplications", () => {
  it("rejects an unsupported status filter", async () => {
    await expect(listApplications({ status: "nonsense" })).rejects.toMatchObject({ statusCode: 400 });
  });

  it("returns applications with their reviewer", async () => {
    db.partnerApplication.findMany.mockResolvedValue([
      { id: "app-1", ...valid, status: "pending", reviewer: null },
    ]);

    const result = await listApplications({});

    expect(result.applications).toHaveLength(1);
    expect(result.statuses).toContain("declined");
  });
});
