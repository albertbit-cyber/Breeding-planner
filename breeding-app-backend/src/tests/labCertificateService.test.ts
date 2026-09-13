import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/prisma", () => ({
  prisma: {
    shedTestCertificate: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { prisma } from "../lib/prisma";
import {
  getCertificateSnapshotForUser,
  listCertificatesForBreeder,
  recordCertificatesForSubmittedResults,
} from "../services/labCertificateService";

const db = prisma as any;

const order = {
  id: "clxorder000001",
  breederId: "breeder-1",
  labOrganizationId: "org_lab_a",
  orderNumber: "09AA00001",
  status: "completed",
  createdAt: new Date("2026-01-02T09:00:00.000Z"),
  updatedAt: new Date("2026-01-06T09:00:00.000Z"),
  animals: [{ animalId: "snake-1", tests: [{ testNameSnapshot: "Albino" }] }],
  results: [],
};

const completedResult = {
  id: "result-1",
  animalId: "snake-1",
  status: "completed",
  reportedAt: new Date("2026-01-05T10:30:00.000Z"),
  updatedAt: new Date("2026-01-05T10:30:00.000Z"),
  findingsJson: [{ marker: "Albino", outcome: "positive" }],
};

beforeEach(() => {
  vi.clearAllMocks();
  db.shedTestCertificate.findFirst.mockResolvedValue(null);
  db.shedTestCertificate.create.mockImplementation(async ({ data }: any) => data);
  db.shedTestCertificate.update.mockImplementation(async ({ data }: any) => data);
});

describe("recording a certificate when a result is submitted", () => {
  it("stores one certificate per completed result", async () => {
    const written = await recordCertificatesForSubmittedResults({
      order,
      results: [completedResult],
    });

    expect(written).toBe(1);
    expect(db.shedTestCertificate.create).toHaveBeenCalledTimes(1);

    const { data } = db.shedTestCertificate.create.mock.calls[0][0];
    expect(data.orderId).toBe(order.id);
    expect(data.breederId).toBe("breeder-1");
    expect(data.animalAppId).toBe("snake-1");
    expect(data.labOrganizationId).toBe("org_lab_a");
  });

  it("writes one certificate per animal, not one per test code", async () => {
    // A single animal routinely carries several completed results on one order,
    // one per test code. The breeder gets one certificate covering the animal;
    // writing one per result had four upserts fighting over the same row.
    const written = await recordCertificatesForSubmittedResults({
      order,
      results: [
        { ...completedResult, id: "result-newest", testCode: "PW-A" },
        { ...completedResult, id: "result-older", testCode: "PW-B" },
        { ...completedResult, id: "result-oldest", testCode: "PW-C" },
      ],
    });

    expect(written).toBe(1);
    expect(db.shedTestCertificate.create).toHaveBeenCalledTimes(1);
    // Callers pass results newest-first, and that is the one the breeder app
    // renders from, so it is the one named on the certificate.
    expect(db.shedTestCertificate.create.mock.calls[0][0].data.resultId).toBe("result-newest");
  });

  it("writes a separate certificate for each animal on the order", async () => {
    const written = await recordCertificatesForSubmittedResults({
      order,
      results: [
        { ...completedResult, id: "r1", animalId: "snake-1" },
        { ...completedResult, id: "r2", animalId: "snake-2" },
      ],
    });

    expect(written).toBe(2);
    expect(db.shedTestCertificate.create.mock.calls.map((c: any) => c[0].data.animalAppId)).toEqual([
      "snake-1",
      "snake-2",
    ]);
  });

  it("ignores drafts, which say nothing final", async () => {
    const written = await recordCertificatesForSubmittedResults({
      order,
      results: [{ ...completedResult, status: "running" }],
    });

    expect(written).toBe(0);
    expect(db.shedTestCertificate.create).not.toHaveBeenCalled();
  });

  it("dates and numbers the certificate in UTC", async () => {
    // Local time made the number depend on whose clock asked: a result reported
    // at 23:30 UTC produced one number in Amsterdam and another on the server.
    await recordCertificatesForSubmittedResults({
      order,
      results: [{ ...completedResult, reportedAt: new Date("2026-01-05T23:30:00.000Z") }],
    });

    const { data } = db.shedTestCertificate.create.mock.calls[0][0];
    expect(data.certificateNumber).toBe("PH-GC-20260105-000001");
  });

  it("re-issues in place rather than leaving two documents that disagree", async () => {
    db.shedTestCertificate.findFirst.mockResolvedValue({ id: "cert-1" });

    await recordCertificatesForSubmittedResults({ order, results: [completedResult] });

    expect(db.shedTestCertificate.create).not.toHaveBeenCalled();
    expect(db.shedTestCertificate.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "cert-1" } })
    );
  });

  it("serialises a Prisma Decimal instead of choking on it", async () => {
    // The shape that actually broke the backfill: Prisma's Decimal carries
    // `constructor` as an own *enumerable* property, and its class name is
    // minified in the published client, so neither Object.entries nor a
    // constructor.name check can be trusted. It does carry a real toJSON.
    const decimal: any = Object.create({});
    Object.assign(decimal, { constructor: function Minified() {}, s: 1, e: 1, d: [35] });
    decimal.toJSON = () => "35.00";

    await recordCertificatesForSubmittedResults({
      order: { ...order, totalPrice: decimal },
      results: [completedResult],
    });

    const { data } = db.shedTestCertificate.create.mock.calls[0][0];
    expect(data.snapshotJson.totalPrice).toBe("35.00");
    expect(data.snapshotJson).not.toHaveProperty("constructor.name");
    // Nothing anywhere in the snapshot may still be a function.
    const walk = (node: any): void => {
      if (!node || typeof node !== "object") {
        expect(typeof node).not.toBe("function");
        return;
      }
      Object.values(node).forEach(walk);
    };
    walk(data.snapshotJson);
  });

  it("keeps a BigInt rather than throwing on it", async () => {
    await recordCertificatesForSubmittedResults({
      order: { ...order, someCount: BigInt(9007199254740993n) } as any,
      results: [completedResult],
    });

    const { data } = db.shedTestCertificate.create.mock.calls[0][0];
    expect(data.snapshotJson.someCount).toBe("9007199254740993");
  });

  it("stores a snapshot the breeder app can render without the order", async () => {
    await recordCertificatesForSubmittedResults({
      order: { ...order, results: [completedResult] },
      results: [completedResult],
    });

    const { data } = db.shedTestCertificate.create.mock.calls[0][0];
    // Dates come back as ISO strings and the snapshot survives a JSON
    // round-trip, because that is exactly what it has to do to be read back.
    const roundTripped = JSON.parse(JSON.stringify(data.snapshotJson));
    expect(roundTripped.id).toBe(order.id);
    expect(roundTripped.createdAt).toBe("2026-01-02T09:00:00.000Z");
    expect(roundTripped.results[0].status).toBe("completed");
    expect(roundTripped.animals[0].animalId).toBe("snake-1");
  });
});

describe("reading a stored certificate", () => {
  const row = {
    id: "cert-1",
    orderId: null,
    orderNumber: "09AA00001",
    animalAppId: "snake-1",
    certificateNumber: "PH-GC-20260105-000001",
    verificationCode: "ABCDEF0123456789ABCDEF01",
    issuedAt: new Date("2026-01-05T10:30:00.000Z"),
    breederId: "breeder-1",
    labOrganizationId: "org_lab_a",
    snapshotJson: { id: "clxorder000001" },
  };

  it("still resolves after the laboratory deleted the order", async () => {
    db.shedTestCertificate.findUnique.mockResolvedValue(row);

    const result = await getCertificateSnapshotForUser("cert-1", {
      id: "breeder-1",
      role: "breeder",
    });

    // orderId is null because the order is gone. The certificate is not.
    expect(result.certificate.orderAvailable).toBe(false);
    expect(result.certificate.certificateNumber).toBe("PH-GC-20260105-000001");
    expect(result.order).toEqual({ id: "clxorder000001" });
  });

  it("refuses another breeder's certificate", async () => {
    db.shedTestCertificate.findUnique.mockResolvedValue(row);

    await expect(
      getCertificateSnapshotForUser("cert-1", { id: "breeder-2", role: "breeder" })
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("lets the issuing laboratory read what it certified", async () => {
    db.shedTestCertificate.findUnique.mockResolvedValue(row);

    const result = await getCertificateSnapshotForUser(
      "cert-1",
      { id: "lab-1", role: "lab_staff" },
      { organizationId: "org_lab_a" }
    );

    expect(result.certificate.id).toBe("cert-1");
  });

  it("refuses a laboratory that did not issue it", async () => {
    db.shedTestCertificate.findUnique.mockResolvedValue(row);

    await expect(
      getCertificateSnapshotForUser(
        "cert-1",
        { id: "lab-2", role: "lab_staff" },
        { organizationId: "org_lab_b" }
      )
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("scopes the breeder's list to the breeder", async () => {
    db.shedTestCertificate.findMany.mockResolvedValue([row]);

    await listCertificatesForBreeder({ id: "breeder-1", role: "breeder" });

    expect(db.shedTestCertificate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { breederId: "breeder-1" } })
    );
  });
});
