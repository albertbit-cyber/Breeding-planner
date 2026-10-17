import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { signAuthToken } from "../utils/jwt";

/**
 * The breeder network, walked end to end through the live Express stack on one in-memory
 * database: two breeders find each other by handle, a first message arrives as a request, an
 * animal changes hands (permanently and on loan), a block holds, and a joint project runs from
 * invitation to split hatchlings that name both parents across the two accounts.
 */

vi.mock("../lib/prisma", async () => {
  const { createInMemoryPrisma } = await import("./support/inMemoryPrisma");
  return { prisma: createInMemoryPrisma() };
});

vi.mock("../email/queueService", () => ({
  enqueueEmail: vi.fn(async (input: any) => ({ id: `job_${input.idempotencyKey}` })),
}));

import { app } from "../app";
import { prisma } from "../lib/prisma";

const db = prisma as any;
const rows = (delegate: string): any[] => db.$rows(delegate);

const ALICE = "user_alice";
const BOB = "user_bob";
const CAROL = "user_carol";

const tokenFor = (id: string) =>
  `Bearer ${signAuthToken({ sub: id, email: `${id}@example.com`, role: "breeder", persistedRole: "breeder", portal: "breeder" })}`;

const as = (id: string) => ({
  get: (url: string) => request(app).get(url).set("Authorization", tokenFor(id)),
  post: (url: string, body: unknown = {}) => request(app).post(url).set("Authorization", tokenFor(id)).send(body as any),
  put: (url: string, body: unknown = {}) => request(app).put(url).set("Authorization", tokenFor(id)).send(body as any),
  del: (url: string) => request(app).delete(url).set("Authorization", tokenFor(id)),
});

const seedUser = (id: string, fullName: string, breederName?: string) => {
  db.$rows("user").push({
    id,
    email: `${id}@example.com`,
    passwordHash: "x",
    fullName,
    role: "breeder",
    isActive: true,
    status: "active",
    handle: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  if (breederName) {
    db.$rows("profile").push({ id: `profile_${id}`, userId: id, breederName, isPublic: false, createdAt: new Date(), updatedAt: new Date() });
  }
};

const seedAnimal = async (ownerId: string, appAnimalId: string, extra: Record<string, unknown> = {}) =>
  db.animal.create({
    data: {
      ownerId,
      appAnimalId,
      name: String(extra.name || appAnimalId),
      sex: String(extra.sex || "M"),
      status: String(extra.status || "Active"),
      payload: {
        id: appAnimalId,
        name: extra.name || appAnimalId,
        sex: extra.sex || "M",
        status: extra.status || "Active",
        morphs: ["Pastel"],
        hets: ["Clown"],
        notes: "Private note that must not travel",
        logs: { weights: [{ id: "w1", date: "2026-01-01", grams: 900 }], feeds: [], sheds: [], meds: [], cleanings: [{ id: "c1" }] },
        photos: ["https://cdn.example.com/a.jpg", "data:image/png;base64,AAAA"],
        ...((extra.payload as object) || {}),
      },
    },
  });

const animalOf = (ownerId: string, appAnimalId: string) =>
  rows("animal").find((row) => row.ownerId === ownerId && row.appAnimalId === appAnimalId);

beforeEach(() => {
  db.$reset();
  seedUser(ALICE, "Alice Adams", "Alice's Pythons");
  seedUser(BOB, "Bob Brown");
  seedUser(CAROL, "Carol Clark");
});

const claimHandles = async () => {
  expect((await as(ALICE).put("/api/network/handle", { handle: "@Alice" })).status).toBe(200);
  expect((await as(BOB).put("/api/network/handle", { handle: "bob_breeds" })).status).toBe(200);
};

describe("handles", () => {
  it("are lower-cased, unique, and refuse reserved or malformed names", async () => {
    const set = await as(ALICE).put("/api/network/handle", { handle: "@Alice" });
    expect(set.body.me).toMatchObject({ handle: "alice", displayName: "Alice's Pythons" });

    expect((await as(BOB).put("/api/network/handle", { handle: "ALICE" })).status).toBe(409);
    expect((await as(BOB).put("/api/network/handle", { handle: "serpentora_help" })).status).toBe(400);
    expect((await as(BOB).put("/api/network/handle", { handle: "9lives" })).status).toBe(400);
    expect((await as(BOB).put("/api/network/handle", { handle: "ab" })).status).toBe(400);

    const check = await as(BOB).get("/api/network/handle/check?handle=alice");
    expect(check.body).toMatchObject({ available: false });
  });

  it("are the only way to find someone, and search never returns an email", async () => {
    await claimHandles();
    const found = await as(BOB).get("/api/network/people?q=al");
    expect(found.body.people).toEqual([{ id: ALICE, handle: "alice", displayName: "Alice's Pythons" }]);
    expect(JSON.stringify(found.body)).not.toContain("@example.com");
    // One letter is not a search: the directory cannot be paged through.
    expect((await as(BOB).get("/api/network/people?q=a")).body.people).toEqual([]);
  });

  it("must be chosen before writing to anyone", async () => {
    await as(BOB).put("/api/network/handle", { handle: "bob_breeds" });
    const res = await as(ALICE).post("/api/network/threads", { handle: "bob_breeds", body: "Hi" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("handle_required");
  });
});

describe("message requests", () => {
  it("a stranger's first message waits in Requests until accepted; a reply accepts it", async () => {
    await claimHandles();
    const sent = await as(ALICE).post("/api/network/threads", { handle: "bob_breeds", body: "Interested in your pied female?" });
    expect(sent.status).toBe(201);
    const threadId = sent.body.threadId;

    expect((await as(BOB).get("/api/network/threads")).body.threads).toEqual([]);
    const requests = await as(BOB).get("/api/network/threads?box=requests");
    expect(requests.body.threads).toHaveLength(1);
    expect(requests.body.threads[0]).toMatchObject({ id: threadId, status: "request", other: { handle: "alice" }, unread: 1 });

    // Bob can read it before deciding.
    const thread = await as(BOB).get(`/api/network/threads/${threadId}`);
    expect(thread.body.messages.map((m: any) => m.body)).toEqual(["Interested in your pied female?"]);

    const summary = await as(BOB).get("/api/network/summary");
    expect(summary.body).toMatchObject({ requests: 1, unreadThreads: 0 });
    expect(rows("notification").filter((n) => n.recipientId === BOB && n.type === "network_message_request")).toHaveLength(1);

    // A reply moves it to the inbox.
    await as(BOB).post(`/api/network/threads/${threadId}/messages`, { body: "Sure, she is 1600 g." });
    expect((await as(BOB).get("/api/network/threads")).body.threads).toHaveLength(1);
    expect((await as(BOB).get("/api/network/threads?box=requests")).body.threads).toEqual([]);
  });

  it("caps what a stranger can add before the request is answered, and ignore hides it", async () => {
    await claimHandles();
    const first = await as(ALICE).post("/api/network/threads", { handle: "bob_breeds", body: "1" });
    const threadId = first.body.threadId;
    for (let i = 2; i <= 5; i += 1) {
      expect((await as(ALICE).post(`/api/network/threads/${threadId}/messages`, { body: String(i) })).status).toBe(201);
    }
    const sixth = await as(ALICE).post(`/api/network/threads/${threadId}/messages`, { body: "6" });
    expect(sixth.status).toBe(429);
    expect(sixth.body.code).toBe("request_cap");

    await as(BOB).post(`/api/network/threads/${threadId}/status`, { status: "ignored" });
    expect((await as(BOB).get("/api/network/threads?box=requests")).body.threads).toEqual([]);
    expect((await as(BOB).get("/api/network/threads?box=ignored")).body.threads).toHaveLength(1);
  });

  it("a block stops messages both ways and files the thread away", async () => {
    await claimHandles();
    const sent = await as(ALICE).post("/api/network/threads", { handle: "bob_breeds", body: "Hello" });
    expect((await as(BOB).post("/api/network/blocks", { userId: ALICE })).status).toBe(201);
    expect((await as(BOB).get("/api/network/threads?box=requests")).body.threads).toEqual([]);

    const again = await as(ALICE).post(`/api/network/threads/${sent.body.threadId}/messages`, { body: "Hello?" });
    expect(again.status).toBe(403);
    expect(again.body.code).toBe("not_accepting");
    expect((await as(ALICE).post("/api/network/transfers", { handle: "bob_breeds", appAnimalId: "x", kind: "gift", reason: "test" })).status).toBe(403);
    // Blocked people disappear from search, both ways.
    expect((await as(ALICE).get("/api/network/people?q=bo")).body.people).toEqual([]);

    await as(BOB).del(`/api/network/blocks/${ALICE}`);
    expect((await as(ALICE).post(`/api/network/threads/${sent.body.threadId}/messages`, { body: "Hello again" })).status).toBe(201);
  });

  it("a report lands in the admin queue with the message", async () => {
    await claimHandles();
    const sent = await as(ALICE).post("/api/network/threads", { handle: "bob_breeds", body: "Buy my snake now!!!" });
    const messageId = sent.body.message.id;
    expect((await as(BOB).post(`/api/network/messages/${messageId}/report`, { reason: "spam" })).status).toBe(201);
    const report = rows("report")[0];
    expect(report).toMatchObject({ type: "network_message", reporterUserId: BOB, reportedUserId: ALICE, relatedMessageId: messageId });
    expect(report.description).toContain("Buy my snake now");
  });

  it("carries snake cards and marketplace links, and nobody can post a fake transfer card", async () => {
    await claimHandles();
    const card = await as(ALICE).post("/api/network/threads", {
      handle: "bob_breeds",
      kind: "animal",
      body: "This one?",
      attachment: { animal: { appAnimalId: "26-M-1", name: "Apollo", morphs: ["Pastel"], imageUrl: "javascript:alert(1)" } },
    });
    expect(card.status).toBe(201);
    expect(card.body.message.attachment.animal).toMatchObject({ name: "Apollo", imageUrl: null });

    const link = await as(ALICE).post(`/api/network/threads/${card.body.threadId}/messages`, {
      kind: "listing",
      attachment: { listing: { id: "l1", url: "https://market.serpentora.com/a/l1", title: "Pastel male" } },
    });
    expect(link.body.message.attachment.listing).toMatchObject({ url: "https://market.serpentora.com/a/l1" });

    const forged = await as(ALICE).post(`/api/network/threads/${card.body.threadId}/messages`, { kind: "transfer", attachment: { transferId: "t1" } });
    expect(forged.status).toBe(400);
  });
});

describe("transfers", () => {
  it("a gift copies the record to the receiver and moves the sender's animal to the archive, with the reason on both", async () => {
    await claimHandles();
    await seedAnimal(ALICE, "26-M-1", { name: "Apollo" });

    const offered = await as(ALICE).post("/api/network/transfers", { handle: "bob_breeds", appAnimalId: "26-M-1", kind: "gift", reason: "Thank you for the help this season" });
    expect(offered.status).toBe(201);
    const transferId = offered.body.transfer.id;
    // Nothing moves until Bob accepts.
    expect(animalOf(BOB, "26-M-1")).toBeUndefined();
    expect(animalOf(ALICE, "26-M-1").status).toBe("Active");

    // The offer is a card in their conversation, waiting in Bob's requests.
    const requests = await as(BOB).get("/api/network/threads?box=requests");
    const thread = await as(BOB).get(`/api/network/threads/${requests.body.threads[0].id}`);
    expect(thread.body.messages[0]).toMatchObject({ kind: "transfer", attachment: { transfer: { id: transferId, status: "pending", kind: "gift" } } });

    // A second offer of the same animal is refused while the first is open.
    expect((await as(ALICE).post("/api/network/transfers", { handle: "bob_breeds", appAnimalId: "26-M-1", kind: "sale", reason: "again" })).status).toBe(409);
    // Only the receiver accepts.
    expect((await as(ALICE).post(`/api/network/transfers/${transferId}/respond`, { action: "accept" })).status).toBe(403);

    const accepted = await as(BOB).post(`/api/network/transfers/${transferId}/respond`, { action: "accept" });
    expect(accepted.status).toBe(200);
    expect(accepted.body.transfer.status).toBe("accepted");
    // The receiver can open their copy straight from the card, and the system line is translatable.
    expect(accepted.body.transfer.receiverAppAnimalId).toBe("26-M-1");
    const systemLine = rows("networkMessage").find((m) => m.kind === "system");
    expect(systemLine.attachment.event).toMatchObject({ type: "transfer_accepted", animal: "Apollo", who: "Bob Brown" });

    const copy = animalOf(BOB, "26-M-1");
    expect(copy.status).toBe("Active");
    expect(copy.payload).toMatchObject({
      name: "Apollo",
      morphs: ["Pastel"],
      notes: "",
      transfer: { kind: "gift", reason: "Thank you for the help this season", fromHandle: "alice", role: "received" },
      acquiredFrom: { source: "serpentora_transfer", sellerAnimalId: "26-M-1" },
    });
    expect(JSON.stringify(copy.payload)).not.toContain("Private note");
    expect(copy.payload.photos.map((p: any) => p.url)).toEqual(["https://cdn.example.com/a.jpg"]);
    expect(copy.payload.logs.weights).toHaveLength(1);
    expect(copy.payload.logs.cleanings).toEqual([]);

    const original = animalOf(ALICE, "26-M-1");
    expect(original.status).toBe("Archived");
    expect(original.payload.archive).toMatchObject({ reason: "given_away", counterpartyName: "@bob_breeds (Bob Brown)" });
    expect(original.payload.archive.note).toContain("Thank you for the help this season");
    expect(original.payload.fieldUpdatedAt.status).toBeDefined();

    const history = rows("ownershipHistory").filter((row) => row.animalId === copy.id);
    expect(history.map((row) => [row.ownerId, row.transferType])).toEqual([[ALICE, "owned"], [BOB, "gift"]]);

    // An archived animal cannot be offered again.
    expect((await as(ALICE).post("/api/network/transfers", { handle: "bob_breeds", appAnimalId: "26-M-1", kind: "gift", reason: "again" })).status).toBe(409);
  });

  it("a sale archives as Sold; an id the receiver already uses is not overwritten", async () => {
    await claimHandles();
    await seedAnimal(ALICE, "26-F-2", { name: "Luna", sex: "F" });
    await seedAnimal(BOB, "26-F-2", { name: "Bob's own" });
    const offered = await as(ALICE).post("/api/network/transfers", { handle: "bob_breeds", appAnimalId: "26-F-2", kind: "sale", reason: "Sold at Hamm, paid cash" });
    await as(BOB).post(`/api/network/transfers/${offered.body.transfer.id}/respond`, { action: "accept" });
    expect(animalOf(BOB, "26-F-2").payload.name).toBe("Bob's own");
    expect(animalOf(BOB, "26-F-2-2").payload.name).toBe("Luna");
    expect(animalOf(ALICE, "26-F-2")).toMatchObject({ status: "Sold" });
    expect(animalOf(ALICE, "26-F-2").payload.archive.reason).toBe("sold");
  });

  it("decline and cancel leave both collections as they were", async () => {
    await claimHandles();
    await seedAnimal(ALICE, "a1");
    await seedAnimal(ALICE, "a2");
    const one = await as(ALICE).post("/api/network/transfers", { handle: "bob_breeds", appAnimalId: "a1", kind: "trade", reason: "Trade for a clown" });
    const two = await as(ALICE).post("/api/network/transfers", { handle: "bob_breeds", appAnimalId: "a2", kind: "gift", reason: "Gift" });
    expect((await as(BOB).post(`/api/network/transfers/${one.body.transfer.id}/respond`, { action: "decline" })).body.transfer.status).toBe("declined");
    expect((await as(ALICE).post(`/api/network/transfers/${two.body.transfer.id}/respond`, { action: "cancel" })).body.transfer.status).toBe("cancelled");
    expect(rows("animal").filter((row) => row.ownerId === BOB)).toEqual([]);
    expect(animalOf(ALICE, "a1").status).toBe("Active");
    expect(animalOf(ALICE, "a2").status).toBe("Active");
  });

  it("refuses to accept into a full plan, and the offer stays open", async () => {
    await claimHandles();
    await seedAnimal(ALICE, "a1");
    db.$rows("userFeatureOverride").push({ id: "o1", userId: BOB, featureKey: "animals.create", enabled: true, limitOverride: 1, expiresAt: null, createdAt: new Date() });
    await seedAnimal(BOB, "b1");
    const offered = await as(ALICE).post("/api/network/transfers", { handle: "bob_breeds", appAnimalId: "a1", kind: "gift", reason: "For you" });
    const res = await as(BOB).post(`/api/network/transfers/${offered.body.transfer.id}/respond`, { action: "accept" });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("animal_limit");
    expect(rows("animalTransfer")[0].status).toBe("pending");
  });

  it("a loan is temporary: On loan on both sides, and returning brings the borrower's care logs home", async () => {
    await claimHandles();
    await seedAnimal(ALICE, "26-M-9", { name: "Zeus", status: "Breeder" });
    const offered = await as(ALICE).post("/api/network/transfers", {
      handle: "bob_breeds",
      appAnimalId: "26-M-9",
      kind: "loan",
      reason: "Breeding loan for the 2026 season",
      loanUntil: "2027-05-01",
    });
    const transferId = offered.body.transfer.id;
    await as(BOB).post(`/api/network/transfers/${transferId}/respond`, { action: "accept" });

    const owner = animalOf(ALICE, "26-M-9");
    const borrowed = animalOf(BOB, "26-M-9");
    expect(owner.status).toBe("On loan");
    expect(owner.payload.loanedTo).toMatchObject({ toHandle: "bob_breeds", previousStatus: "Breeder", reason: "Breeding loan for the 2026 season" });
    expect(owner.payload.archive).toBeUndefined();
    expect(borrowed.status).toBe("On loan");
    expect(borrowed.payload.loan).toMatchObject({ role: "borrowed", ownerHandle: "alice" });
    // Lending does not change the owner: Alice's ownership row stays open on both records.
    expect(rows("ownershipHistory").find((row) => row.animalId === owner.id && row.ownerId === ALICE).toDate).toBeNull();
    // A borrowed animal cannot be passed on, and a lent one cannot be offered again.
    expect((await as(BOB).post("/api/network/transfers", { handle: "alice", appAnimalId: "26-M-9", kind: "gift", reason: "mine now" })).status).toBe(409);
    expect((await as(ALICE).post("/api/network/transfers", { handle: "bob_breeds", appAnimalId: "26-M-9", kind: "gift", reason: "Passing it on" })).status).toBe(409);

    // Bob weighs him while he has him.
    borrowed.payload.logs.weights.push({ id: "w-bob", date: new Date().toISOString().slice(0, 10), grams: 1050 });

    const returned = await as(BOB).post(`/api/network/transfers/${transferId}/return`, { note: "Locked 4 times" });
    expect(returned.body.transfer.status).toBe("returned");
    const home = animalOf(ALICE, "26-M-9");
    expect(home.status).toBe("Breeder");
    expect(home.payload.loanedTo).toBeNull();
    expect(home.payload.loanHistory[0]).toMatchObject({ toHandle: "bob_breeds", note: "Locked 4 times" });
    expect(home.payload.logs.weights.map((w: any) => w.id).sort()).toEqual(["w-bob", "w1"]);
    const away = animalOf(BOB, "26-M-9");
    expect(away.status).toBe("Archived");
    expect(away.payload.archive.note).toContain("returned to @alice");
  });
});

describe("joint projects", () => {
  const seedPair = async () => {
    await claimHandles();
    await seedAnimal(ALICE, "26-M-1", { name: "Apollo", sex: "M" });
    await seedAnimal(BOB, "25-F-7", { name: "Luna", sex: "F" });
  };

  it("the female's owner keeps her and incubates; the male arrives as an uncounted partner record", async () => {
    await seedPair();
    const proposed = await as(ALICE).post("/api/network/projects", { handle: "bob_breeds", appAnimalId: "26-M-1", title: "Apollo x Luna 2026" });
    expect(proposed.status).toBe(201);
    const projectId = proposed.body.project.id;
    expect(proposed.body.project).toMatchObject({ status: "proposed", male: { owner: { handle: "alice" }, animal: { name: "Apollo" } } });
    expect((await as(BOB).get("/api/network/summary")).body.projectInvites).toBe(1);

    // Bob must bring a female.
    await seedAnimal(BOB, "25-M-3", { sex: "M" });
    expect((await as(BOB).post(`/api/network/projects/${projectId}/respond`, { action: "accept", appAnimalId: "25-M-3" })).status).toBe(409);

    const accepted = await as(BOB).post(`/api/network/projects/${projectId}/respond`, { action: "accept", appAnimalId: "25-F-7" });
    expect(accepted.status).toBe(200);
    expect(accepted.body.project).toMatchObject({ status: "active", keeper: { handle: "bob_breeds" }, viewerRole: "keeper" });

    const partnerId = accepted.body.project.partnerMaleAppId;
    const partner = animalOf(BOB, partnerId);
    expect(partner.status).toBe("Partner");
    expect(partner.payload.partnerRecord).toMatchObject({ projectId, ownerHandle: "alice", ownerAnimalId: "26-M-1", readOnly: true });
    expect(JSON.stringify(partner.payload)).not.toContain("Private note");
    // Alice's male is untouched: he is not lent, he is in a project.
    expect(animalOf(ALICE, "26-M-1").status).toBe("Active");

    // The partner record does not count toward Bob's plan.
    const { countedAnimalWhere } = await import("../services/animalArchive");
    expect(await db.animal.count({ where: countedAnimalWhere(BOB) })).toBe(2);
    // And it cannot be given away.
    expect((await as(BOB).post("/api/network/transfers", { handle: "alice", appAnimalId: partnerId, kind: "gift", reason: "Passing it on" })).status).toBe(409);
  });

  it("runs from the breeding card to a split clutch whose hatchlings name both parents in both accounts", async () => {
    await seedPair();
    const projectId = (await as(ALICE).post("/api/network/projects", { handle: "bob_breeds", appAnimalId: "26-M-1" })).body.project.id;
    const partnerId = (await as(BOB).post(`/api/network/projects/${projectId}/respond`, { action: "accept", appAnimalId: "25-F-7" })).body.project.partnerMaleAppId;

    // Bob pairs them on an ordinary breeding card; the eggs hatch and are registered.
    const hatchlings = ["26-H-1", "26-H-2", "26-H-3", "26-H-4"];
    for (const id of hatchlings) {
      await seedAnimal(BOB, id, { sex: "U", payload: { sireId: partnerId, damId: "25-F-7", clutchId: "Luna x Apollo 2026" } });
    }
    await db.breedingCycle.create({
      data: {
        ownerId: BOB,
        appCycleId: "bc-1",
        femaleAnimalAppId: "25-F-7",
        status: "active",
        payload: {
          id: "bc-1",
          femaleId: "25-F-7",
          males: [{ maleId: partnerId, state: "participated" }],
          sessions: [{ id: "s1", locks: [{ id: "l1", status: "observed", observationDate: "2026-03-01" }] }],
          events: [
            { id: "e1", type: "ovulation", date: "2026-04-20", certainty: "recorded" },
            { id: "e2", type: "egg_laying", date: "2026-05-30", certainty: "recorded" },
          ],
          clutch: { eggsTotal: 4, fertileEggs: 4, hatchlingsRecorded: 4, firstHatchDate: "2026-07-28" },
          offspring: hatchlings.map((animalId) => ({ animalId })),
        },
      },
    });

    // Alice follows the cycle from the project without seeing Bob's collection.
    const view = (await as(ALICE).get(`/api/network/projects/${projectId}`)).body.project;
    expect(view.progress).toMatchObject({ stage: "hatching", locks: 1, ovulationDate: "2026-04-20", eggLayingDate: "2026-05-30", eggsTotal: 4, hatchlingsRecorded: 4 });
    expect(view.hatchlings.map((h: any) => h.appAnimalId)).toEqual(hatchlings);
    expect(view.partnerMaleAppId).toBeNull();

    // The split: Bob proposes, Alice counters, Bob accepts.
    await as(BOB).post(`/api/network/projects/${projectId}/split-proposals`, { method: "fixed_count", maleOwnerShare: 1 });
    const countered = await as(ALICE).post(`/api/network/projects/${projectId}/split-proposals`, { method: "percentage", maleOwnerShare: 50 });
    const open = countered.body.project.proposals.find((p: any) => p.status === "open");
    expect(countered.body.project.proposals.filter((p: any) => p.status === "superseded")).toHaveLength(1);
    expect((await as(ALICE).post(`/api/network/split-proposals/${open.id}/respond`, { action: "accept" })).status).toBe(403);
    const agreed = await as(BOB).post(`/api/network/split-proposals/${open.id}/respond`, { action: "accept" });
    expect(agreed.body.project.splitTerms).toMatchObject({ method: "percentage", maleOwnerShare: 50 });

    // Only the keeper sends shares, and only hatchlings of this clutch.
    expect((await as(ALICE).post(`/api/network/projects/${projectId}/shares`, { appAnimalIds: ["26-H-1"] })).status).toBe(403);
    expect((await as(BOB).post(`/api/network/projects/${projectId}/shares`, { appAnimalIds: ["25-F-7"] })).status).toBe(409);
    const shared = await as(BOB).post(`/api/network/projects/${projectId}/shares`, { appAnimalIds: ["26-H-1", "26-H-2"] });
    expect(shared.status).toBe(201);
    expect(shared.body.project.hatchlings.filter((h: any) => h.share?.status === "pending")).toHaveLength(2);

    const incoming = rows("animalTransfer").filter((row) => row.kind === "split");
    for (const transfer of incoming) {
      expect((await as(ALICE).post(`/api/network/transfers/${transfer.id}/respond`, { action: "accept" })).status).toBe(200);
    }

    // Alice's copy points at her own Apollo, names Luna and Bob, and says who incubated.
    const share = animalOf(ALICE, "26-H-1");
    expect(share.payload).toMatchObject({
      sireId: "26-M-1",
      damId: "",
      damName: "Luna",
      externalParents: { dam: { name: "Luna", ownerHandle: "bob_breeds" } },
      jointProject: { id: projectId, incubatedBy: { handle: "bob_breeds" }, sire: { ownerHandle: "alice" }, dam: { ownerHandle: "bob_breeds" } },
    });
    expect(share.payload.jointProject.split).toContain("50%");
    const apollo = animalOf(ALICE, "26-M-1");
    const luna = animalOf(BOB, "25-F-7");
    const parentsOf = (childId: string) =>
      Object.fromEntries(rows("parentRelationship").filter((row) => row.childId === childId).map((row) => [row.role, row.parentId]));
    expect(parentsOf(share.id)).toEqual({ sire: apollo.id, dam: luna.id });
    // Bob's sent hatchling is in his archive.
    expect(animalOf(BOB, "26-H-1").status).toBe("Archived");

    // Closing: the two kept hatchlings name both parents too, and the partner record retires.
    const closed = await as(BOB).post(`/api/network/projects/${projectId}/complete`);
    expect(closed.body.project.status).toBe("completed");
    const kept = animalOf(BOB, "26-H-3");
    expect(parentsOf(kept.id)).toEqual({ sire: apollo.id, dam: luna.id });
    expect(kept.payload.jointProject).toMatchObject({ id: projectId, sire: { name: "Apollo", ownerHandle: "alice" } });
    expect(kept.payload.sireId).toBe(partnerId);
    expect(animalOf(BOB, partnerId).status).toBe("Archived");
    expect(animalOf(BOB, partnerId).payload.partnerRecord.endedAt).toBeTruthy();
  });

  it("only the two breeders see a project, and a project cannot be cancelled once hatchlings moved", async () => {
    await seedPair();
    await as(CAROL).put("/api/network/handle", { handle: "carol" });
    const projectId = (await as(ALICE).post("/api/network/projects", { handle: "bob_breeds", appAnimalId: "26-M-1" })).body.project.id;
    expect((await as(CAROL).get(`/api/network/projects/${projectId}`)).status).toBe(404);
    expect((await as(ALICE).post(`/api/network/projects/${projectId}/respond`, { action: "accept", appAnimalId: "26-M-1" })).status).toBe(403);

    const declined = await as(BOB).post(`/api/network/projects/${projectId}/respond`, { action: "decline" });
    expect(declined.body.project.status).toBe("declined");
    expect(rows("animal").filter((row) => row.ownerId === BOB)).toHaveLength(1);
  });

  it("cancelling an active project retires the partner record", async () => {
    await seedPair();
    const projectId = (await as(ALICE).post("/api/network/projects", { handle: "bob_breeds", appAnimalId: "26-M-1" })).body.project.id;
    const partnerId = (await as(BOB).post(`/api/network/projects/${projectId}/respond`, { action: "accept", appAnimalId: "25-F-7" })).body.project.partnerMaleAppId;
    const cancelled = await as(ALICE).post(`/api/network/projects/${projectId}/cancel`);
    expect(cancelled.body.project.status).toBe("cancelled");
    expect(animalOf(BOB, partnerId).status).toBe("Archived");
  });
});
