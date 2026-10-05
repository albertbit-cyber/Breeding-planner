import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * markSold, end to end through an in-memory store.
 *
 * The store implements only the queries the service makes, but it implements
 * them for real (filters, JSON-path lookups, the transaction), so a test sees
 * what a buyer's account would actually hold afterwards rather than which
 * mocks were called.
 */
const store = vi.hoisted(() => {
  type Row = Record<string, any>;
  const tables: Record<string, Row[]> = {};
  let seq = 0;
  const id = () => `id_${++seq}`;

  const valueAt = (row: Row, path: string[]) => path.reduce((value: any, key) => (value == null ? undefined : value[key]), row);

  const matches = (row: Row, where: Row = {}): boolean =>
    Object.entries(where).every(([key, condition]) => {
      if (key === "OR") return (condition as Row[]).some((sub) => matches(row, sub));
      if (key === "AND") return (condition as Row[]).every((sub) => matches(row, sub));
      const value = row[key];
      if (condition && typeof condition === "object" && !(condition instanceof Date)) {
        if ("path" in condition) return valueAt(value || {}, condition.path) === condition.equals;
        if ("in" in condition) return condition.in.includes(value);
        if ("not" in condition) return value !== condition.not;
        if ("equals" in condition) return value === condition.equals;
      }
      return value === condition;
    });

  const model = (name: string) => {
    tables[name] = tables[name] || [];
    const rows = () => tables[name];
    const orderRows = (list: Row[], orderBy?: Row) => {
      if (!orderBy) return list;
      const [[key, dir]] = Object.entries(orderBy);
      return [...list].sort((a, b) => (a[key] > b[key] ? 1 : -1) * (dir === "desc" ? -1 : 1));
    };
    return {
      findMany: async ({ where, orderBy }: Row = {}) => orderRows(rows().filter((row) => matches(row, where)), orderBy),
      findFirst: async ({ where, orderBy }: Row = {}) => orderRows(rows().filter((row) => matches(row, where)), orderBy)[0] || null,
      findUnique: async ({ where }: Row) => {
        const compound = Object.values(where).find((value) => value && typeof value === "object") as Row | undefined;
        return rows().find((row) => matches(row, compound || where)) || null;
      },
      create: async ({ data }: Row) => {
        const row = { id: id(), createdAt: new Date(), updatedAt: new Date(), deletedAt: null, toDate: null, ...data };
        rows().push(row);
        return row;
      },
      update: async ({ where, data }: Row) => {
        const row = rows().find((candidate) => matches(candidate, where));
        if (!row) throw new Error(`${name} not found`);
        Object.assign(row, data, { updatedAt: new Date() });
        return row;
      },
    };
  };

  const names = [
    "user",
    "animal",
    "ownershipHistory",
    "marketplaceListing",
    "marketplaceSale",
    "marketplaceConversation",
    "marketplaceMessage",
    "shedTestCertificate",
    "parentRelationship",
  ];
  const db: Row = {};
  const reset = () => {
    Object.keys(tables).forEach((key) => delete tables[key]);
    seq = 0;
    names.forEach((name) => (db[name] = model(name)));
  };
  reset();
  db.$transaction = async (fn: any) => fn(db);
  return { db, tables, reset };
});

vi.mock("../lib/prisma", () => ({ prisma: store.db }));
vi.mock("../services/notificationService", () => ({ createNotification: vi.fn() }));
vi.mock("../services/speciesCatalogService", () => ({ speciesName: (value: string) => value }));

import { createNotification } from "../services/notificationService";
import { listAcquiredAnimals, markSold } from "../services/marketplaceSaleService";

const seller = { id: "seller-1", role: "breeder" } as any;
const buyer = { id: "buyer-1", role: "buyer" } as any;

const seed = async () => {
  store.reset();
  store.tables.user = [
    { id: "seller-1", fullName: "Seed Breeder" },
    { id: "buyer-1", fullName: "Ada Buyer" },
  ];
  store.tables.marketplaceListing = [
    {
      id: "listing-1",
      sellerUserId: "seller-1",
      animalId: "25Ath-1",
      title: "Athena",
      genetics: "Clown het Pied",
      species: "Ball python",
      sex: "female",
      price: 450,
      currency: "EUR",
      status: "available",
      availability: "available",
      createdAt: new Date("2026-01-01"),
      seller: { id: "seller-1", fullName: "Seed Breeder", marketplaceStores: [{ storeName: "Seed Breeder Reptiles" }] },
    },
  ];
  store.tables.animal = [
    {
      id: "animal-sold",
      ownerId: "seller-1",
      appAnimalId: "25Ath-1",
      name: "Athena",
      sex: "F",
      species: "ball-python",
      status: "For sell",
      deletedAt: null,
      createdAt: new Date("2025-06-15"),
      payload: {
        id: "25Ath-1",
        name: "Athena",
        sex: "F",
        species: "ball-python",
        morphs: ["Clown", "Pastel"],
        hets: ["Pied"],
        possibleHets: ["66% Hypo", "Ghost"],
        notes: "Seller's private note: bought cheap, flip for profit",
        groups: ["Breeders"],
        tags: ["proven"],
        clutchId: "C-2025-07",
        pairingIds: ["pair-9"],
        photos: [{ id: "p1", url: "https://cdn.test/athena.jpg" }, { id: "p2", url: "data:image/png;base64,AAAA" }],
        labGeneticsConfirmation: {
          source: "genetic-test",
          note: "Confirmed by shed test",
          confirmedAt: "2026-03-01T00:00:00.000Z",
          markers: [{ marker: "Pied", outcome: "carrierDetected", confirmedAt: "2026-03-01T00:00:00.000Z" }],
          decisions: [{ key: "pied", gene: "Pied", outcome: "carrierDetected" }],
        },
        logs: {
          weights: [{ date: "2026-01-01", grams: 600 }, { date: "2026-02-01", grams: 640 }],
          feeds: [{ date: "2026-02-03", result: "ate" }],
          sheds: [{ date: "2026-02-10" }],
          meds: [{ date: "2026-01-20", note: "Mite treatment" }],
          cleanings: [{ date: "2026-02-11", note: "Rack 3 deep clean" }],
        },
      },
    },
    {
      id: "animal-other",
      ownerId: "seller-1",
      appAnimalId: "24Zeu-1",
      name: "Zeus",
      deletedAt: null,
      payload: { name: "Zeus", morphs: ["Banana"], notes: "Seller's other animal" },
    },
  ];
  store.tables.parentRelationship = [
    { childId: "animal-sold", role: "sire", parent: { appAnimalId: "24Zeu-1", name: "Zeus" } },
  ];
  store.tables.shedTestCertificate = [
    {
      breederId: "seller-1",
      animalAppId: "25Ath-1",
      resultId: "r1",
      certificateNumber: "CERT-001",
      verificationCode: "A1B2C3D4E5F6A1B2C3D4E5F6",
      issuedAt: new Date("2026-03-01"),
      labOrganization: { name: "Seed Genetics Lab" },
      snapshotJson: {
        results: [
          {
            id: "r1",
            animalId: "25Ath-1",
            status: "completed",
            findingsJson: [
              { marker: "Pied", outcome: "carrierDetected" },
              { marker: "Hypo", outcome: "notDetected" },
            ],
          },
        ],
        breederEmail: "seller@private.test",
      },
    },
    {
      breederId: "seller-1",
      animalAppId: "24Zeu-1",
      certificateNumber: "CERT-OTHER",
      verificationCode: "FFFFFFFFFFFFFFFFFFFFFFFF",
      issuedAt: new Date("2026-02-01"),
      snapshotJson: {},
    },
  ];
  store.tables.marketplaceConversation = [{ id: "c1", listingId: "listing-1", buyerUserId: "buyer-1", sellerUserId: "seller-1" }];
  store.tables.marketplaceSale = [];
  store.tables.ownershipHistory = [];
  store.tables.marketplaceMessage = [];
};

beforeEach(async () => {
  vi.clearAllMocks();
  await seed();
});

const buyerAnimal = () => store.tables.animal.find((row) => row.ownerId === "buyer-1");

describe("markSold", () => {
  it("records the sale, takes the listing out of Browse and gives the buyer the animal", async () => {
    const result = await markSold(seller, { listingId: "listing-1", buyerUserId: "buyer-1", price: 420 });

    expect(result.alreadyTransferred).toBe(false);
    expect(store.tables.marketplaceSale).toHaveLength(1);
    expect(store.tables.marketplaceSale[0]).toMatchObject({
      buyerUserId: "buyer-1",
      sellerUserId: "seller-1",
      saleStatus: "completed",
      salePrice: 420,
    });
    expect(store.tables.marketplaceListing[0]).toMatchObject({ status: "sold", availability: "sold" });

    const copy = buyerAnimal();
    expect(copy).toMatchObject({ appAnimalId: "25Ath-1", name: "Athena", status: "Active" });
    expect(copy.payload.acquiredFrom).toMatchObject({
      source: "serpentora_marketplace",
      sellerName: "Seed Breeder Reptiles",
      sellerAnimalId: "25Ath-1",
      price: 420,
      advertisedGenetics: "Clown het Pied",
    });
    expect(result.animal.acquiredFrom.sellerName).toBe("Seed Breeder Reptiles");
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({ recipientId: "buyer-1" }));
    expect(store.tables.marketplaceMessage[0].messageText).toMatch(/record is now in your account/);
  });

  it("keeps every claim's provenance, and upgrades nothing the lab did not confirm", async () => {
    await markSold(seller, { listingId: "listing-1", buyerUserId: "buyer-1", price: 420 });
    const { payload } = buyerAnimal();

    // The genetic arrays travel exactly as the seller had them.
    expect(payload.morphs).toEqual(["Clown", "Pastel"]);
    expect(payload.hets).toEqual(["Pied"]);
    expect(payload.possibleHets).toEqual(["66% Hypo", "Ghost"]);

    const claim = (gene: string) => payload.geneticClaims.find((entry: any) => entry.gene === gene);
    expect(claim("Clown")).toMatchObject({ zygosity: "visual", provenance: "observed" });
    expect(claim("Pastel")).toMatchObject({ zygosity: "visual", provenance: "observed" });
    // Het Pied: the lab found it, and the claim names the certificate.
    expect(claim("Pied")).toMatchObject({
      zygosity: "het",
      provenance: "lab_confirmed",
      lab: { call: "het", certificateNumber: "CERT-001" },
    });
    // 66% het Hypo: the lab says otherwise. It stays a prediction, marked disputed.
    expect(claim("Hypo")).toMatchObject({
      zygosity: "possible_het",
      percent: 66,
      provenance: "predicted",
      labDisagrees: true,
    });
    // A bare possible het stays possible, never a het.
    expect(claim("Ghost")).toMatchObject({ zygosity: "possible_het", provenance: "predicted" });

    // The lab's decisions travel too, so the buyer's sync keeps honouring them.
    expect(payload.labGeneticsConfirmation.decisions).toEqual([{ key: "pied", gene: "Pied", outcome: "carrierDetected" }]);
  });

  it("gives the buyer each certificate's number and verification code", async () => {
    await markSold(seller, { listingId: "listing-1", buyerUserId: "buyer-1" });
    const [certificate] = buyerAnimal().payload.certificates;
    expect(certificate).toMatchObject({
      certificateNumber: "CERT-001",
      verificationCode: "A1B2C3D4E5F6A1B2C3D4E5F6",
      labName: "Seed Genetics Lab",
      verifyUrl: "https://serpentora.com/verify/A1B2C3D4E5F6A1B2C3D4E5F6",
    });
    expect(certificate.results).toEqual(
      expect.arrayContaining([
        { test: "Pied", result: "Het Pied" },
        { test: "Hypo", result: "Negative" },
      ])
    );
  });

  it("carries the record: weights, feeds, sheds, health and a lineage summary", async () => {
    await markSold(seller, { listingId: "listing-1", buyerUserId: "buyer-1" });
    const { payload } = buyerAnimal();
    expect(payload.logs.weights).toHaveLength(2);
    expect(payload.logs.feeds).toHaveLength(1);
    expect(payload.logs.sheds).toHaveLength(1);
    expect(payload.logs.meds).toEqual([{ date: "2026-01-20", note: "Mite treatment" }]);
    expect(payload.lineage).toEqual({ clutchId: "C-2025-07", parents: [{ role: "sire", label: "Zeus" }] });
    expect(payload.photos).toEqual([{ id: "p1", url: "https://cdn.test/athena.jpg", takenAt: undefined, caption: undefined }]);
  });

  it("leaks nothing else of the seller's", async () => {
    await markSold(seller, { listingId: "listing-1", buyerUserId: "buyer-1" });
    const { payload } = buyerAnimal();
    const serialized = JSON.stringify(payload);

    expect(payload.notes).toBe("");
    expect(payload.groups).toEqual([]);
    expect(payload.tags).toEqual(["Acquired"]);
    expect(payload.logs.cleanings).toEqual([]);
    expect(payload).not.toHaveProperty("pairingIds");
    expect(serialized).not.toMatch(/flip for profit|Rack 3|seller@private\.test|CERT-OTHER|Banana|Seller's other animal|data:image/);
    // Exactly one new animal, and it is the buyer's.
    expect(store.tables.animal.filter((row) => row.ownerId === "buyer-1")).toHaveLength(1);
    expect(store.tables.animal).toHaveLength(3);
  });

  it("leaves the seller their animal, marked Sold, with its ownership closed", async () => {
    await markSold(seller, { listingId: "listing-1", buyerUserId: "buyer-1" });
    const sellers = store.tables.animal.find((row) => row.id === "animal-sold");
    expect(sellers).toMatchObject({ ownerId: "seller-1", status: "Sold", deletedAt: null });
    expect(sellers.payload.notes).toMatch(/private note/);
    expect(sellers.payload.logs.cleanings).toHaveLength(1);

    const history = (animalId: string) => store.tables.ownershipHistory.filter((row) => row.animalId === animalId);
    expect(history("animal-sold").map((row) => [row.ownerId, row.transferType, Boolean(row.toDate)])).toEqual([
      ["seller-1", "owned", true],
      ["buyer-1", "marketplace_sale", false],
    ]);
    expect(history(buyerAnimal().id).map((row) => [row.ownerId, row.transferType, Boolean(row.toDate)])).toEqual([
      ["seller-1", "owned", true],
      ["buyer-1", "marketplace_purchase", false],
    ]);
  });

  it("is idempotent: marking the same sale twice does not make a second animal", async () => {
    await markSold(seller, { listingId: "listing-1", buyerUserId: "buyer-1" });
    const again = await markSold(seller, { listingId: "listing-1", buyerUserId: "buyer-1" });
    expect(again.alreadyTransferred).toBe(true);
    expect(store.tables.animal.filter((row) => row.ownerId === "buyer-1")).toHaveLength(1);
    expect(store.tables.marketplaceSale).toHaveLength(1);
  });

  it("completes the reserved sale from an accepted offer rather than writing a second one", async () => {
    store.tables.marketplaceSale.push({
      id: "sale-reserved",
      listingId: "listing-1",
      sellerUserId: "seller-1",
      buyerUserId: "buyer-1",
      saleStatus: "reserved",
      paymentStatus: "deposit_paid",
      salePrice: 400,
      currency: "EUR",
      createdAt: new Date(),
    });
    await markSold(seller, { listingId: "listing-1", buyerUserId: "buyer-1" });
    expect(store.tables.marketplaceSale).toHaveLength(1);
    expect(store.tables.marketplaceSale[0]).toMatchObject({ id: "sale-reserved", saleStatus: "completed", salePrice: 400, paymentStatus: "paid" });
    expect(buyerAnimal().payload.acquiredFrom.saleId).toBe("sale-reserved");
  });

  it("does not overwrite an animal id the buyer already uses", async () => {
    store.tables.animal.push({ id: "mine", ownerId: "buyer-1", appAnimalId: "25Ath-1", deletedAt: null, payload: {} });
    await markSold(seller, { listingId: "listing-1", buyerUserId: "buyer-1" });
    const acquired = store.tables.animal.filter((row) => row.ownerId === "buyer-1" && row.payload.acquiredFrom);
    expect(acquired[0].appAnimalId).toBe("25Ath-1-2");
  });

  it("works for a listing with no linked animal, from the listing's genetics", async () => {
    store.tables.marketplaceListing[0].animalId = null;
    await markSold(seller, { listingId: "listing-1", buyerUserId: "buyer-1" });
    const { payload } = buyerAnimal();
    expect(payload.geneticClaims.map((claim: any) => [claim.gene, claim.provenance])).toEqual([
      ["Clown", "observed"],
      ["Pied", "predicted"],
    ]);
    expect(payload.certificates).toEqual([]);
    expect(payload.logs.weights).toEqual([]);
  });

  it("refuses anyone but the seller, and a second buyer once sold", async () => {
    await expect(markSold(buyer, { listingId: "listing-1", buyerUserId: "buyer-1" })).rejects.toMatchObject({ statusCode: 403 });
    await expect(markSold(seller, { listingId: "listing-1", buyerUserId: "seller-1" })).rejects.toMatchObject({ statusCode: 400 });
    await expect(markSold(seller, { listingId: "listing-1", buyerUserId: "ghost" })).rejects.toMatchObject({ statusCode: 404 });

    store.tables.user.push({ id: "buyer-2", fullName: "Second" });
    await markSold(seller, { listingId: "listing-1", buyerUserId: "buyer-1" });
    await expect(markSold(seller, { listingId: "listing-1", buyerUserId: "buyer-2" })).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe("listAcquiredAnimals", () => {
  it("lists only the buyer's acquired animals, with certificates to verify", async () => {
    await markSold(seller, { listingId: "listing-1", buyerUserId: "buyer-1" });
    store.tables.animal.push({ id: "own", ownerId: "buyer-1", appAnimalId: "own-1", deletedAt: null, payload: { name: "Bred myself" } });

    const { animals } = await listAcquiredAnimals(buyer);
    expect(animals).toHaveLength(1);
    expect(animals[0]).toMatchObject({
      name: "Athena",
      acquiredFrom: { sellerName: "Seed Breeder Reptiles" },
      certificates: [{ certificateNumber: "CERT-001", verificationCode: "A1B2C3D4E5F6A1B2C3D4E5F6" }],
      counts: { weights: 2, feeds: 1, sheds: 1, meds: 1 },
    });

    const { animals: sellers } = await listAcquiredAnimals(seller);
    expect(sellers).toEqual([]);
  });
});
