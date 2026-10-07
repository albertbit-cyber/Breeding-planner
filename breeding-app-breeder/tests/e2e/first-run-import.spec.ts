import { resolve } from "node:path";
import { test, expect, type Locator, type Page } from "@playwright/test";

/**
 * The first hour, on a phone.
 *
 * A keeper with a MorphMarket export signs up, signs in, and must reach a confirmed import in
 * at most three clicks from the first screen, then be able to pair straight away. Before this
 * the import button lived inside a species workspace on a toolbar hidden under 768px, and the
 * imported animals joined no group, so pairing had nobody to offer.
 *
 * The account is genuinely fresh: registered through the one-step form, then marked verified by
 * the seeded admin, because a test has no inbox to click the emailed link from.
 */

const backendUrl = process.env.E2E_BACKEND_URL || "http://127.0.0.1:4000";
const adminEmail = process.env.E2E_ADMIN_EMAIL || "admin@breedingplanner.dev";
const adminPassword = process.env.E2E_ADMIN_PASSWORD || "admin1234";
const fixture = resolve("src/features/animals/import/__fixtures__/morphmarketAnimals.csv");

test.use({
  viewport: { width: 390, height: 844 },
  // Not the seeded breeder: this test is about an account that has never been opened.
  storageState: { cookies: [], origins: [] },
});

const verifyAsAdmin = async (page: Page, email: string) => {
  const login = await page.request.post(`${backendUrl}/api/auth/login`, {
    data: { email: adminEmail, password: adminPassword, portal: "admin" },
  });
  expect(login.status()).toBe(200);
  const { token } = await login.json();
  const headers = { Authorization: `Bearer ${token}` };

  const search = await page.request.get(`${backendUrl}/api/admin/users`, {
    headers,
    params: { search: email },
  });
  expect(search.status()).toBe(200);
  const { users } = await search.json();
  const user = users.find((entry: { email: string }) => entry.email === email);
  expect(user, `registered user ${email}`).toBeTruthy();

  const verify = await page.request.patch(`${backendUrl}/api/admin/users/${user.id}/email-verification`, {
    headers,
    data: { verified: true, reason: "first-run e2e: no inbox in tests" },
  });
  expect(verify.status()).toBe(200);
};

test("a fresh phone account imports a MorphMarket file in three clicks and pairs right after", async ({ page }) => {
  const email = `first-run-${Date.now()}@e2e.test`;
  const password = "firstrun1234";

  // Register: one screen, four fields and the two consents.
  await page.goto("/#/breeder");
  await page.getByRole("button", { name: "Register", exact: true }).click();
  await expect(page.getByText(/Step \d of \d/)).toHaveCount(0);
  const form = page.locator(".registration-card");
  await form.getByLabel("Full name").fill("First Run Keeper");
  await form.getByLabel("Email address").fill(email);
  await form.getByLabel(/^Password/).fill(password);
  await form.locator('input[type="checkbox"]').nth(0).check();
  await form.locator('input[type="checkbox"]').nth(1).check();
  await form.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Check your inbox")).toBeVisible();

  await verifyAsAdmin(page, email);

  // First login.
  await page.getByRole("button", { name: "Back to login" }).click();
  await page.locator(".auth-login-form input[type='password']").fill(password);
  await page.getByRole("button", { name: "Continue" }).click();

  const importCard = page.getByRole("button", { name: /Import your collection/ });
  await expect(importCard).toBeInViewport();
  await expect(page.getByRole("button", { name: /New animal & species/ })).toBeInViewport();

  // From here every click counts.
  let clicks = 0;
  const tap = async (target: Locator) => {
    clicks += 1;
    await target.click();
  };

  await tap(importCard);
  const chooser = page.waitForEvent("filechooser");
  await tap(page.getByRole("button", { name: "Import from MorphMarket" }));
  await (await chooser).setFiles(fixture);
  await tap(page.getByRole("button", { name: /^Import \d+ animals$/ }));

  await expect(page.getByText("Import complete")).toBeVisible();
  expect(clicks, "clicks from first login to a confirmed import").toBeLessThanOrEqual(3);

  // The Breeders step is offered, with nothing pre-ticked.
  const breedersStep = page.locator("section", { hasText: "Add breeding adults to the Breeders group now?" });
  await expect(breedersStep).toBeVisible();
  await expect(breedersStep.locator('input[type="checkbox"]:checked')).toHaveCount(0);
  await breedersStep.getByRole("button", { name: /Select all males/ }).click();
  await breedersStep.getByRole("button", { name: /Select all females/ }).click();
  await breedersStep.getByRole("button", { name: /^Add \d+ to Breeders$/ }).click();
  await expect(page.getByText(/added to Breeders/)).toBeVisible();
  await page.getByRole("button", { name: "View imported animals" }).click();

  // Pair right away, from the phone's own navigation.
  await page.locator("nav").getByRole("button", { name: "Breeding", exact: true }).click();
  await page.getByRole("button", { name: "New pairing" }).click();
  const pairingModal = page.locator("div.fixed", { hasText: "Create pairing" }).last();
  await expect(pairingModal.getByText(/Breeders group, and/)).toHaveCount(0);
  await pairingModal.getByText("Confusion Firefly Lesser Clown #2").click();
  await pairingModal.getByText("Pastel Yellow Belly Female").click();
  await pairingModal.getByRole("button", { name: "New pairing" }).click();

  await expect(page.getByRole("button", { name: "Active pairings (1)" })).toBeVisible();
});
