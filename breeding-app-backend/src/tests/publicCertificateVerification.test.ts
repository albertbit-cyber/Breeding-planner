import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

vi.mock("../lib/prisma", () => ({
  prisma: {
    shedTestCertificate: { findUnique: vi.fn() },
    labTestOffering: { findMany: vi.fn() },
  },
}));

import { app } from "../app";
import { prisma } from "../lib/prisma";

const db = prisma as any;

const CODE = "A1B2C3D4E5F60718293A4B5C";
const BREEDER_ID = "breeder-user-7f3k";
const BREEDER_EMAIL = "keeper@private-breeder.test";
const ANIMAL_ID = "snake-26-F-186";
const OTHER_ANIMAL_ID = "snake-other-99";

/**
 * Deliberately stuffed with everything that must never reach a stranger: the
 * breeder's identity, the laboratory's bank details, a second animal on the
 * same order, sample ids and analyst notes. It mirrors what
 * recordCertificatesForSubmittedResults actually stores.
 */
const snapshot = {
  id: "clxorder000001",
  orderNumber: "09AA00001",
  breederId: BREEDER_ID,
  breeder: { id: BREEDER_ID, email: BREEDER_EMAIL, fullName: "Private Keeper", role: "breeder" },
  totalPrice: "120.00",
  labOrganization: {
    id: "org_lab_a",
    name: "Helix Org",
    labAccount: {
      labName: "Helix Genetics",
      contactEmail: "lab-owner@helix.test",
      iban: "DE89370400440532013000",
      phone: "+49 30 1234567",
    },
  },
  animals: [
    { animalId: ANIMAL_ID, animalName: "Nyx", tests: [{ offeringId: "off-albino", testNameSnapshot: "Albino" }] },
    { animalId: OTHER_ANIMAL_ID, animalName: "Other", tests: [{ offeringId: "off-clown", testNameSnapshot: "Clown" }] },
  ],
  results: [
    {
      id: "result-1",
      animalId: ANIMAL_ID,
      sampleId: "SMP-PRIVATE-1",
      status: "completed",
      testCode: "PW-A",
      analystUserId: "analyst-user-1",
      notes: "Analyst note: resampled once",
      findingsJson: [{ marker: "Albino", outcome: "carrierDetected" }],
    },
    {
      id: "result-2",
      animalId: OTHER_ANIMAL_ID,
      sampleId: "SMP-PRIVATE-2",
      status: "completed",
      testCode: "PW-B",
      findingsJson: [{ marker: "Clown", outcome: "positive" }],
    },
  ],
};

const certificateRow = {
  animalAppId: ANIMAL_ID,
  resultId: "result-1",
  certificateNumber: "PH-GC-20260105-000001",
  issuedAt: new Date("2026-01-05T10:30:00.000Z"),
  snapshotJson: snapshot,
};

const verify = (code: string) => request(app).get(`/api/public/certificates/verify/${encodeURIComponent(code)}`);

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CERTIFICATE_VERIFY_MIN_RESPONSE_MS = "0";
  db.shedTestCertificate.findUnique.mockImplementation(async ({ where }: any) =>
    where.verificationCode === CODE ? certificateRow : null
  );
  db.labTestOffering.findMany.mockResolvedValue([{ speciesIds: ["ball-python"] }]);
});

afterEach(() => {
  delete process.env.CERTIFICATE_VERIFY_MIN_RESPONSE_MS;
});

describe("GET /api/public/certificates/verify/:code", () => {
  it("confirms a real certificate without any credentials", async () => {
    const res = await verify(CODE);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      valid: true,
      certificateNumber: "PH-GC-20260105-000001",
      labName: "Helix Genetics",
      species: "Ball Pythons",
      testsSummary: [{ test: "Albino", result: "het Albino" }],
      issuedAt: "2026-01-05T10:30:00.000Z",
    });
  });

  it("forgives the way people retype a code from paper", async () => {
    const res = await verify("a1b2 c3d4-e5f6 0718 293a 4b5c");

    expect(res.body.valid).toBe(true);
    expect(db.shedTestCertificate.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { verificationCode: CODE } })
    );
  });

  it("answers an unknown code with valid: false and nothing else", async () => {
    const res = await verify("FFFFFFFFFFFFFFFFFFFFFFFF");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ valid: false });
  });

  it("answers a malformed code exactly as it answers an unknown one", async () => {
    const malformed = await verify("not-a-code");
    const unknown = await verify("FFFFFFFFFFFFFFFFFFFFFFFF");

    expect(malformed.status).toBe(unknown.status);
    expect(malformed.body).toEqual(unknown.body);
    // A malformed code still costs a lookup, so it cannot be told apart by
    // skipping the database.
    expect(db.shedTestCertificate.findUnique).toHaveBeenCalledTimes(2);
  });

  it("names no species when the certified tests do not agree on one", async () => {
    db.labTestOffering.findMany.mockResolvedValue([{ speciesIds: ["corn-snake", "hognose"] }]);

    const res = await verify(CODE);

    expect(res.body.valid).toBe(true);
    expect(res.body.species).toBeNull();
  });

  it("holds found and not-found answers to the same response floor", async () => {
    process.env.CERTIFICATE_VERIFY_MIN_RESPONSE_MS = "80";

    const timed = async (code: string) => {
      const started = Date.now();
      await verify(code);
      return Date.now() - started;
    };

    expect(await timed(CODE)).toBeGreaterThanOrEqual(75);
    expect(await timed("FFFFFFFFFFFFFFFFFFFFFFFF")).toBeGreaterThanOrEqual(75);
    expect(await timed("not-a-code")).toBeGreaterThanOrEqual(75);
  });

  it("is not cached by browsers or proxies", async () => {
    const res = await verify(CODE);
    expect(res.headers["cache-control"]).toBe("no-store");
  });
});

describe("what a stranger can learn", () => {
  it("returns only the allowlisted fields", async () => {
    const res = await verify(CODE);

    expect(Object.keys(res.body).sort()).toEqual(
      ["certificateNumber", "issuedAt", "labName", "species", "testsSummary", "valid"].sort()
    );
    res.body.testsSummary.forEach((line: object) => expect(Object.keys(line).sort()).toEqual(["result", "test"]));
  });

  it("never contains a user id, an email or an animal id", async () => {
    const res = await verify(CODE);
    const raw = res.text;

    for (const secret of [
      BREEDER_ID,
      BREEDER_EMAIL,
      "lab-owner@helix.test",
      "analyst-user-1",
      ANIMAL_ID,
      OTHER_ANIMAL_ID,
    ]) {
      expect(raw).not.toContain(secret);
    }
    expect(raw).not.toMatch(/@/);
    expect(raw).not.toMatch(/"(breederId|userId|animalId|animalAppId|email|id)"\s*:/);
  });

  it("leaves the rest of the order behind", async () => {
    const raw = (await verify(CODE)).text;

    // Another animal's result, sample ids, notes, bank details, the order itself.
    for (const leaked of ["Clown", "SMP-PRIVATE", "Analyst note", "DE89370400440532013000", "09AA00001", "Nyx", "120.00"]) {
      expect(raw).not.toContain(leaked);
    }
  });
});

// Last on purpose: the limiter's in-memory count lives for the whole file.
describe("rate limiting", () => {
  const previousEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = previousEnv;
  });

  it("refuses a caller who keeps guessing", async () => {
    // The shared limiters only run in production.
    process.env.NODE_ENV = "production";

    const statuses: number[] = [];
    for (let attempt = 0; attempt < 31; attempt += 1) {
      statuses.push((await verify(`${String(attempt).padStart(24, "0")}`)).status);
    }

    expect(statuses.slice(0, 30).every((status) => status === 200)).toBe(true);
    expect(statuses[30]).toBe(429);
  });
});
