import { test } from "@playwright/test";
import {
  authHeaders,
  backendUrl,
  breederFrontendUrl,
  expect,
  installBreederAuthInPage,
  loginBreederViaApi,
} from "./helpers.js";

/**
 * Two devices on one account, each a browser context with its own storage, against the real
 * backend. The API stands in for a third device (a phone) where that is simpler than driving a
 * second UI. Each case is a mismatch keepers reported: an animal deleted on one device still on
 * another, a desktop left open never showing the phone's changes, a deleted feed log back the next
 * day, and the app uploading an unchanged account over and over.
 */

const SNAKES_KEY = "breedingPlannerSnakes";

const uniqueId = (label: string) => `e2e-sync-${label}-${Date.now().toString(36)}`;
const soon = (ms = 1_000) => new Date(Date.now() + ms).toISOString();

const putSnapshot = async (request: any, token: string, body: Record<string, unknown>) => {
  const response = await request.put(`${backendUrl}/api/breeder/snapshot`, { headers: authHeaders(token), data: body });
  expect(response.status(), await response.text()).toBe(200);
  return response.json();
};

const getSnapshot = async (request: any, token: string) => {
  const response = await request.get(`${backendUrl}/api/breeder/snapshot`, { headers: authHeaders(token) });
  expect(response.status()).toBe(200);
  return response.json();
};

const storedAnimal = (page: any, id: string) => page.evaluate(
  ({ key, id }: { key: string; id: string }) => {
    try {
      return (JSON.parse(localStorage.getItem(key) || "[]") as any[]).find((animal) => animal?.id === id) || null;
    } catch {
      return null;
    }
  },
  { key: SNAKES_KEY, id },
);

const openDevice = async (browser: any, auth: any, storageState?: any) => {
  const context = await browser.newContext({ baseURL: breederFrontendUrl, ...(storageState ? { storageState } : {}) });
  const page = await context.newPage();
  if (!storageState) await installBreederAuthInPage(page, auth);
  await page.goto("/");
  return { context, page };
};

// What a device does when its keeper comes back to the window.
const focus = (page: any) => page.evaluate(() => window.dispatchEvent(new Event("focus")));

test.describe("two devices, one account", () => {
  let auth: any;

  test.beforeAll(async ({ request }) => {
    auth = await loginBreederViaApi(request);
  });

  test("an animal deleted elsewhere leaves a device that was closed at the time", async ({ browser, request }) => {
    const id = uniqueId("deleted");
    await putSnapshot(request, auth.token, { animals: [{ id, name: "Sync test, deleted", sex: "F", species: "Ball Python", updatedAt: soon(0) }] });

    const first = await openDevice(browser, auth);
    await expect.poll(() => storedAnimal(first.page, id), { timeout: 30_000 }).not.toBeNull();
    const closedState = await first.context.storageState();
    await first.context.close();

    // Another device deletes it while this one is closed.
    await putSnapshot(request, auth.token, { animals: [{ id, deletedAt: soon(2_000) }] });

    const reopened = await openDevice(browser, auth, closedState);
    await expect.poll(() => storedAnimal(reopened.page, id), { timeout: 30_000 }).toBeNull();
    await reopened.page.waitForTimeout(2_000);

    // And the reopened device did not upload its old copy back.
    const snapshot = await getSnapshot(request, auth.token);
    expect(snapshot.animals.some((animal: any) => animal.id === id)).toBe(false);
    expect(Object.keys(snapshot.tombstones?.animals || {})).toContain(id);
    await reopened.context.close();
  });

  test("an animal deleted in the app on one device leaves the other device that is open", async ({ browser, request }) => {
    const id = uniqueId("ui-deleted");
    await putSnapshot(request, auth.token, { animals: [{ id, name: "Sync test, deleted in the app", sex: "F", species: "Ball Python", updatedAt: soon(0) }] });

    const laptop = await openDevice(browser, auth);
    const desktop = await openDevice(browser, auth);
    await expect.poll(() => storedAnimal(laptop.page, id), { timeout: 30_000 }).not.toBeNull();
    await expect.poll(() => storedAnimal(desktop.page, id), { timeout: 30_000 }).not.toBeNull();

    // Deleted through the animal card on the laptop.
    await laptop.page.getByText("Ball Pythons").first().click();
    const card = laptop.page.locator("div")
      .filter({ has: laptop.page.getByText(id, { exact: true }) })
      .filter({ has: laptop.page.getByRole("button", { name: "More actions" }) })
      .last();
    await card.getByRole("button", { name: "More actions" }).click();
    await laptop.page.getByRole("button", { name: /Delete/ }).first().click();
    await expect(laptop.page.getByText("Delete Sync test, deleted in the app?")).toBeVisible();
    await laptop.page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect.poll(() => storedAnimal(laptop.page, id), { timeout: 10_000 }).toBeNull();

    // The server has the deletion, and the desktop drops its copy when the keeper returns to it.
    await expect.poll(async () => Object.keys((await getSnapshot(request, auth.token)).tombstones?.animals || {}), { timeout: 15_000 })
      .toContain(id);
    await focus(desktop.page);
    await expect.poll(() => storedAnimal(desktop.page, id), { timeout: 20_000 }).toBeNull();

    await laptop.context.close();
    await desktop.context.close();
  });

  // What a real keeper's Chrome looked like on 13 Oct: its local storage could not be read (the
  // disk was full), so it started on the demo animals, while it still held a pairing whose male
  // had never reached the server. The card made from that pairing was refused with a 400, the whole
  // save failed, and the device kept showing demo animals although the collection was on the server.
  test("a device that lost its local animals still shows the collection and syncs past a card with an unknown male", async ({ browser, request }) => {
    const femaleId = uniqueId("broken-f");
    const ghostMale = uniqueId("ghost-m");
    const pairingId = uniqueId("broken-p");
    await putSnapshot(request, auth.token, { animals: [{ id: femaleId, name: "Sync test, collection female", sex: "F", species: "Ball Python", updatedAt: soon(0) }] });

    const context = await browser.newContext({ baseURL: breederFrontendUrl });
    const page = await context.newPage();
    await installBreederAuthInPage(page, auth);
    await page.addInitScript(({ pairing }) => {
      if (sessionStorage.getItem("e2e-broken-seeded")) return;
      sessionStorage.setItem("e2e-broken-seeded", "1");
      localStorage.setItem("breedingPlannerSnakes", "[]");
      localStorage.setItem("breedingPlannerPairings", JSON.stringify([pairing]));
    }, {
      pairing: { id: pairingId, label: "Sync test pairing", femaleId, maleId: ghostMale, startDate: "2026-03-01", status: "active", updatedAt: soon(0) },
    });
    await page.goto("/");

    // The collection from the server is on screen, not the demo set.
    await expect.poll(() => storedAnimal(page, femaleId), { timeout: 30_000 }).not.toBeNull();
    // And the save went through: the card is on the server, flagged for the unknown male.
    await expect.poll(async () => {
      const snapshot = await getSnapshot(request, auth.token);
      const card = (snapshot.breedingCycles || []).find((cycle: any) => cycle.femaleId === femaleId);
      return card?.reviewFlags?.find((flag: any) => flag.kind === "unresolved_animal_reference")?.animalIds || null;
    }, { timeout: 30_000 }).toEqual([ghostMale]);
    await expect(page.getByText(/Not synced/i)).toHaveCount(0);

    // The keeper settles it in Settings → Backups: the pairing keeps the male's name without the
    // link, and the card that named him is deleted for good.
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("button", { name: "Backups", exact: true }).click();
    const panel = page.getByRole("region", { name: "Animals named but missing" });
    await expect(panel.getByText(`${ghostMale}: 1 pairing(s), 1 breeding card(s)`)).toBeVisible();
    await panel.getByRole("button", { name: "Keep name on pairings, remove link" }).click();
    await panel.getByRole("button", { name: "Delete cards naming it" }).click();
    await page.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(panel).toHaveCount(0);

    await expect.poll(async () => {
      const snapshot = await getSnapshot(request, auth.token);
      const pairing = (snapshot.pairings || []).find((item: any) => item.id === pairingId);
      const cardGone = !(snapshot.breedingCycles || []).some((cycle: any) => cycle.femaleId === femaleId);
      return { maleId: pairing?.maleId, maleName: pairing?.maleName, cardGone };
    }, { timeout: 30_000 }).toEqual({ maleId: "", maleName: ghostMale, cardGone: true });

    // A reload does not bring the card back from the pairing.
    await page.reload();
    await page.waitForTimeout(8_000);
    const after = await getSnapshot(request, auth.token);
    expect((after.breedingCycles || []).some((cycle: any) => cycle.femaleId === femaleId)).toBe(false);
    await context.close();
  });

  test("a desktop left open shows another device's edit when the keeper returns to it", async ({ browser, request }) => {
    const id = uniqueId("edited");
    await putSnapshot(request, auth.token, { animals: [{ id, name: "Sync test, before", sex: "M", species: "Ball Python", updatedAt: soon(0) }] });

    const desktop = await openDevice(browser, auth);
    await expect.poll(async () => (await storedAnimal(desktop.page, id))?.name, { timeout: 30_000 }).toBe("Sync test, before");

    const at = soon(3_000);
    await putSnapshot(request, auth.token, {
      animals: [{ id, name: "Sync test, renamed on the phone", sex: "M", species: "Ball Python", updatedAt: at, fieldUpdatedAt: { name: at } }],
    });
    await focus(desktop.page);

    await expect.poll(async () => (await storedAnimal(desktop.page, id))?.name, { timeout: 20_000 }).toBe("Sync test, renamed on the phone");
    await desktop.context.close();
  });

  test("a feed log deleted on another device stays deleted", async ({ browser, request }) => {
    const id = uniqueId("feedlog");
    await putSnapshot(request, auth.token, {
      animals: [{
        id,
        name: "Sync test, feed log",
        sex: "F",
        species: "Ball Python",
        logs: { feeds: [{ id: "f1", date: "2026-09-20", feed: "rat" }, { id: "f2", date: "2026-09-27", feed: "rat" }] },
        updatedAt: soon(0),
      }],
    });

    const desktop = await openDevice(browser, auth);
    await expect.poll(async () => (await storedAnimal(desktop.page, id))?.logs?.feeds?.length, { timeout: 30_000 }).toBe(2);

    // The phone deletes the older entry.
    const at = soon(3_000);
    await putSnapshot(request, auth.token, {
      animals: [{
        id,
        name: "Sync test, feed log",
        sex: "F",
        species: "Ball Python",
        logs: { feeds: [{ id: "f2", date: "2026-09-27", feed: "rat" }] },
        removedEntries: { f1: at },
        updatedAt: at,
      }],
    });
    await focus(desktop.page);

    await expect.poll(async () => (await storedAnimal(desktop.page, id))?.logs?.feeds?.map((entry: any) => entry.id), { timeout: 20_000 })
      .toEqual(["f2"]);
    await desktop.page.waitForTimeout(2_000);
    const stored = (await getSnapshot(request, auth.token)).animals.find((animal: any) => animal.id === id);
    expect(stored.logs.feeds.map((entry: any) => entry.id)).toEqual(["f2"]);
    await desktop.context.close();
  });

  test("an idle device stops uploading once it is in step with the server", async ({ browser }) => {
    const desktop = await openDevice(browser, auth);
    await desktop.page.waitForTimeout(8_000);

    const uploads: string[] = [];
    desktop.page.on("request", (request: any) => {
      if (request.method() === "PUT" && request.url().includes("/breeder/snapshot")) uploads.push(request.url());
    });
    await focus(desktop.page);
    await desktop.page.waitForTimeout(3_000);
    await focus(desktop.page);
    await desktop.page.waitForTimeout(3_000);

    // A pull still runs (it is how changes arrive) but finds nothing to send.
    expect(uploads).toEqual([]);
    await desktop.context.close();
  });
});
