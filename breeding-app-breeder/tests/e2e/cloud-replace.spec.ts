import { test } from "@playwright/test";
import { authHeaders, backendUrl, breederFrontendUrl, expect, installBreederAuthInPage, readDeviceKey } from "./helpers.js";

/**
 * A backup file replaces the cloud, and every device follows: the keeper restores a file on one
 * device, a second device that was open the whole time drops its old data instead of merging it
 * back, and Undo puts the previous data back on both.
 *
 * Runs on its own fresh account: a replace raises the account's data generation, after which saves
 * that do not name it are refused, and the other specs save to the shared seed account that way.
 */

const SNAKES_KEY = "breedingPlannerSnakes";
const GENERATION_KEY = "breedingPlannerDataGeneration";
const VAULT_KEY = "breedingPlannerBackupVault";
const run = Date.now().toString(36);
const id = (label: string) => `e2e-replace-${label}-${run}`;

const KEEPER = { email: `replace-e2e-${run}@proherper.dev`, password: "replace-e2e-1234" };

const registerKeeper = async (request: any) => {
  const registered = await request.post(`${backendUrl}/api/auth/register`, {
    data: { ...KEEPER, fullName: "Replace Keeper", role: "breeder" },
  });
  expect(registered.ok(), await registered.text()).toBe(true);
};

// One login per device, as on real devices: refresh tokens rotate, so two devices sharing one
// would sign each other out.
const loginKeeper = async (request: any) => {
  const login = await request.post(`${backendUrl}/api/auth/login`, { data: KEEPER });
  expect(login.status(), await login.text()).toBe(200);
  const body = await login.json();
  return { token: body.token, refreshToken: body.refreshToken, user: { email: KEEPER.email, fullName: "Replace Keeper" } };
};

const cloudAnimals = async (request: any, token: string) => {
  const response = await request.get(`${backendUrl}/api/breeder/snapshot`, { headers: authHeaders(token) });
  expect(response.status()).toBe(200);
  const body = await response.json();
  return { ids: (body.animals as any[]).map((animal) => animal.id).sort(), body };
};

const storedIds = async (page: any) => {
  try {
    return (JSON.parse((await readDeviceKey(page, SNAKES_KEY)) || "[]") as any[])
      .filter((animal) => animal && !animal.isDemo)
      .map((animal) => animal.id)
      .sort();
  } catch {
    return [];
  }
};

const storedValue = (page: any, key: string) => readDeviceKey(page, key);

const openDevice = async (browser: any, auth: any) => {
  // An empty storage state: the project's default one signs in as the shared seed breeder.
  const context = await browser.newContext({ baseURL: breederFrontendUrl, storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await installBreederAuthInPage(page, auth);
  await page.goto("/");
  return { context, page };
};

const focus = (page: any) => page.evaluate(() => window.dispatchEvent(new Event("focus")));

const openBackups = async (page: any) => {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Backups", exact: true }).click();
};

test("a backup file replaces the cloud on every device, and Undo puts the old data back", async ({ browser, request }) => {
  test.setTimeout(150_000);
  await registerKeeper(request);
  const auth = await loginKeeper(request);
  const kept = id("kept");
  const dropped = id("dropped");
  const added = id("added");

  // The cloud before: two animals, synced the ordinary way.
  const seeded = await request.put(`${backendUrl}/api/breeder/snapshot`, {
    headers: authHeaders(auth.token),
    data: {
      animals: [
        { id: kept, name: "Kept, old name", sex: "F", species: "Ball Python", updatedAt: new Date().toISOString() },
        { id: dropped, name: "Not in the file", sex: "M", species: "Ball Python", updatedAt: new Date().toISOString() },
      ],
    },
  });
  expect(seeded.status(), await seeded.text()).toBe(200);

  // Two devices, both holding the old data.
  const phone = await openDevice(browser, await loginKeeper(request));
  const desktop = await openDevice(browser, await loginKeeper(request));
  await expect.poll(() => storedIds(phone.page), { timeout: 40_000 }).toEqual([dropped, kept].sort());
  await expect.poll(() => storedIds(desktop.page), { timeout: 40_000 }).toEqual([dropped, kept].sort());

  // The file: one animal renamed, one new one carrying 300 copies of one reading (the
  // duplicated-log era), and the dropped animal absent.
  const backup = {
    version: 1,
    generatedAt: new Date(Date.now() - 86_400_000).toISOString(),
    snakes: [
      { id: kept, name: "Kept, name from the file", sex: "F", species: "Ball Python", updatedAt: "2026-08-01T10:00:00.000Z" },
      {
        id: added,
        name: "Added by the file",
        sex: "F",
        species: "Ball Python",
        updatedAt: "2026-08-01T10:00:00.000Z",
        logs: { weights: Array.from({ length: 300 }, (_, index) => ({ id: `w-${String(index).padStart(3, "0")}`, date: "2025-11-29", grams: 812 })) },
      },
    ],
    pairings: [],
    groups: ["From the file"],
  };

  await openBackups(desktop.page);
  await desktop.page.locator('input[type="file"][accept*="bpbackup"]').setInputFiles({
    name: "keeper.bpbackup",
    mimeType: "application/x-breeding-planner-backup+json",
    buffer: Buffer.from(JSON.stringify(backup)),
  });

  // The keeper sees what the replace changes before anything is written.
  await expect(desktop.page.getByText("In the cloud now: 2 animals, 0 pairings.")).toBeVisible({ timeout: 20_000 });
  await expect(desktop.page.getByText("After the replace: 2 animals, 0 pairings.")).toBeVisible();
  await expect(desktop.page.getByText("Not in the file, so removed from the cloud: 1 animals, 0 pairings.")).toBeVisible();
  await expect(desktop.page.getByText("Duplicated log entries cleaned up: 299.")).toBeVisible();
  expect((await cloudAnimals(request, auth.token)).ids).toEqual([dropped, kept].sort());

  await desktop.page.getByRole("button", { name: "Replace cloud data" }).click();
  await expect(desktop.page.getByText(/Cloud data replaced from keeper\.bpbackup: 2 animals/)).toBeVisible({ timeout: 30_000 });

  // The cloud is the file: the dropped animal is gone, the rename stands, the copies are one entry.
  const afterReplace = await cloudAnimals(request, auth.token);
  expect(afterReplace.ids).toEqual([added, kept].sort());
  expect(afterReplace.body.dataGeneration).toBe(1);
  expect(afterReplace.body.animals.find((animal: any) => animal.id === kept).name).toBe("Kept, name from the file");
  expect(afterReplace.body.animals.find((animal: any) => animal.id === added).logs.weights).toHaveLength(1);
  await expect.poll(() => storedIds(desktop.page), { timeout: 20_000 }).toEqual([added, kept].sort());

  // The phone was open the whole time with the old data. It loads the replace rather than merging
  // the dropped animal back, and keeps its own copy in the backup vault.
  await focus(phone.page);
  await expect.poll(() => storedIds(phone.page), { timeout: 40_000 }).toEqual([added, kept].sort());
  expect(await storedValue(phone.page, GENERATION_KEY)).toBe("1");
  expect(await storedValue(phone.page, VAULT_KEY)).toContain("Before the cloud data was replaced");
  await phone.page.waitForTimeout(3_000);
  expect((await cloudAnimals(request, auth.token)).ids).toEqual([added, kept].sort());

  // A device that has not loaded the replace cannot save over it.
  const stale = await request.put(`${backendUrl}/api/breeder/snapshot`, {
    headers: authHeaders(auth.token),
    data: { animals: [{ id: dropped, name: "Back from a stale device", updatedAt: new Date().toISOString() }] },
  });
  expect(stale.status()).toBe(409);
  expect((await stale.json()).code).toBe("DATA_REPLACED");

  // Undo from the history puts the old data back, on both devices.
  await expect(desktop.page.getByText("Replaced from a backup file")).toBeVisible({ timeout: 20_000 });
  await desktop.page.getByRole("button", { name: "Undo", exact: true }).click();
  await desktop.page.getByRole("button", { name: "Undo", exact: true }).last().click();
  await expect(desktop.page.getByText("Cloud data put back: 2 animals.")).toBeVisible({ timeout: 30_000 });
  const afterUndo = await cloudAnimals(request, auth.token);
  expect(afterUndo.ids).toEqual([dropped, kept].sort());
  expect(afterUndo.body.dataGeneration).toBe(2);
  expect(afterUndo.body.animals.find((animal: any) => animal.id === kept).name).toBe("Kept, old name");

  await focus(phone.page);
  await expect.poll(() => storedIds(phone.page), { timeout: 40_000 }).toEqual([dropped, kept].sort());
  await expect.poll(() => storedIds(desktop.page), { timeout: 40_000 }).toEqual([dropped, kept].sort());

  await phone.context.close();
  await desktop.context.close();
});
