import { test, expect, type Page } from "@playwright/test";

/**
 * The help system at phone width.
 *
 * 1. A genuinely fresh account meets the tour invitation, starts the essentials tour and
 *    finishes it by doing each real thing: every do step must advance on its own, so no
 *    step can be stuck. The only real action the tour itself takes is the plainly labelled
 *    offer to add one example animal, pressed here instead of typing a real one.
 * 2. With Help Mode on, pressing controls on every screen explains them and changes no
 *    stored data: browser storage stays byte-identical and nothing is written to the server.
 */

const backendUrl = process.env.E2E_BACKEND_URL || "http://127.0.0.1:4000";
const adminEmail = process.env.E2E_ADMIN_EMAIL || "admin@breedingplanner.dev";
const adminPassword = process.env.E2E_ADMIN_PASSWORD || "admin1234";

test.use({ viewport: { width: 390, height: 844 } });

const verifyAsAdmin = async (page: Page, email: string) => {
  const login = await page.request.post(`${backendUrl}/api/auth/login`, {
    data: { email: adminEmail, password: adminPassword, portal: "admin" },
  });
  expect(login.status()).toBe(200);
  const { token } = await login.json();
  const headers = { Authorization: `Bearer ${token}` };
  const search = await page.request.get(`${backendUrl}/api/admin/users`, { headers, params: { search: email } });
  expect(search.status()).toBe(200);
  const { users } = await search.json();
  const user = users.find((entry: { email: string }) => entry.email === email);
  expect(user, `registered user ${email}`).toBeTruthy();
  const verify = await page.request.patch(`${backendUrl}/api/admin/users/${user.id}/email-verification`, {
    headers,
    data: { verified: true, reason: "help e2e: no inbox in tests" },
  });
  expect(verify.status()).toBe(200);
};

const panel = (page: Page) => page.locator(".help-tour-panel");
const stepTitle = (page: Page) => panel(page).locator(".help-tour-panel__title");

/** The step on screen is `title`; do `act`, then the tour must move on to `next` by itself. */
const doStep = async (page: Page, title: string, next: string, act: () => Promise<void>) => {
  await expect(stepTitle(page), `tour is not at "${title}"`).toHaveText(title);
  await act();
  await expect(stepTitle(page), `"${title}" is stuck`).toHaveText(next, { timeout: 8_000 });
};

/** An info step: press Next. */
const readStep = async (page: Page, title: string, next: string) => {
  await expect(stepTitle(page), `tour is not at "${title}"`).toHaveText(title);
  await panel(page).getByRole("button", { name: "Next", exact: true }).click();
  await expect(stepTitle(page)).toHaveText(next);
};

test.describe("help", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("a fresh phone account completes the essentials tour with no step stuck", async ({ page }) => {
    test.setTimeout(180_000);
    const email = `help-tour-${Date.now()}@e2e.test`;
    const password = "helptour1234";

    await page.goto("/#/breeder");
    await page.getByRole("button", { name: "Register", exact: true }).click();
    const form = page.locator(".registration-card");
    await form.getByLabel("Full name").fill("Help Tour Keeper");
    await form.getByLabel("Email address").fill(email);
    await form.getByLabel(/^Password/).fill(password);
    await form.locator('input[type="checkbox"]').nth(0).check();
    await form.locator('input[type="checkbox"]').nth(1).check();
    await form.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText("Check your inbox")).toBeVisible();
    await verifyAsAdmin(page, email);
    await page.getByRole("button", { name: "Back to login" }).click();
    await page.locator(".auth-login-form input[type='password']").fill(password);
    await page.getByRole("button", { name: "Continue" }).click();

    // A new keeper is invited once, inline, never by a modal.
    const invite = page.locator(".help-invite");
    await expect(invite).toBeVisible();
    await invite.getByRole("button", { name: "Start guide" }).click();

    await readStep(page, "Welcome to Serpentora", "The main places");
    await readStep(page, "The main places", "Open a species");
    await doStep(page, "Open a species", "The example animals", () =>
      page.locator('[data-help="dashboard-species-card"]:visible').first().click());
    await readStep(page, "The example animals", "Press Add animal");
    await doStep(page, "Press Add animal", "Add one real animal", async () => {
      await page.locator(".bp-fab").click();
      await page.locator('[data-dialog="animal-actions"] [data-tour="add-animal"]').click();
    });
    await doStep(page, "Add one real animal", "Open its record", () =>
      panel(page).getByRole("button", { name: "Add an example animal instead" }).click());
    await expect(page.getByText("Example animal").first()).toBeVisible();
    await doStep(page, "Open its record", "Genetics", () =>
      page.locator('[data-help="animals-edit"]:visible').first().click());
    await readStep(page, "Genetics", "Log a feed");
    await expect(stepTitle(page)).toHaveText("Log a feed");
    await page.locator('[data-tour="animal-feed-add"]').scrollIntoViewIfNeeded();
    await page.locator('[data-tour="animal-feed-add"]').click();
    await page.locator('[data-help="record-save"]').click();
    // Saving closes the record, so "Close the record" is done the moment it appears.
    await expect(stepTitle(page)).toHaveText("Open Breeding", { timeout: 8_000 });
    await doStep(page, "Open Breeding", "Press Record a pairing", () =>
      page.locator('[data-help="nav-pairings"]:visible').first().click());
    await doStep(page, "Press Record a pairing", "A male and a female", () =>
      page.locator('[data-help="pairing-new"]:visible').first().click());
    await readStep(page, "A male and a female", "Close the window");
    await doStep(page, "Close the window", "From pairing to hatchling", async () => {
      const window = page.locator('[data-dialog="breeding-entry"]').first();
      await window.getByRole("button", { name: /^(Close|Cancel)$/ }).first().click();
    });
    await readStep(page, "From pairing to hatchling", "Bringing a collection in");
    await readStep(page, "Bringing a collection in", "Saved as you go");
    await readStep(page, "Saved as you go", "Help is always here");
    await expect(stepTitle(page)).toHaveText("Help is always here");
    await panel(page).getByRole("button", { name: "Finish" }).click();
    await expect(panel(page)).toHaveCount(0);

    const flags = await page.evaluate(() => JSON.parse(localStorage.getItem("serpentora.help.v1") || "{}"));
    expect(flags.completed).toContain("essentials");
    expect(flags.invited).toBe(true);
  });
});

test("with Help Mode on, pressing controls on each screen changes no stored data", async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto("/#/breeder");
  await expect(page.locator("nav.bp-mobile-bottom-nav")).toBeVisible();

  // Writes to the server while Help Mode is on would mean a press did something.
  const writes: string[] = [];
  let watching = false;
  page.on("request", (request) => {
    if (!watching || request.method() === "GET" || request.method() === "OPTIONS") return;
    if (!request.url().startsWith(backendUrl)) return;
    if (/\/api\/auth\/(refresh|session)/.test(request.url())) return;
    writes.push(`${request.method()} ${request.url()}`);
  });

  const storage = () => page.evaluate(() => JSON.stringify(
    Object.keys(localStorage).filter(key => key !== "serpentora.help.v1").sort().map(key => [key, localStorage.getItem(key)]),
  ));

  const helpMode = async (on: boolean) => {
    const pressed = await page.locator('button[data-help="help-button"][data-active]:visible').count();
    if (!!pressed === on) return;
    if (on) {
      await page.locator('button[aria-label="Help & Manual"]:visible').first().click();
      await page.getByRole("button", { name: "Explore the app" }).click();
      await expect(page.locator(".help-pill")).toBeVisible();
    } else {
      await page.locator(".help-pill__exit").click();
    }
  };

  const go = async (helpId: string) => {
    await helpMode(false);
    if (["nav-advisor", "nav-quarantine", "nav-family-tree", "nav-spaces", "nav-lab-tests"].includes(helpId)) {
      await page.locator('[data-help="nav-more"]:visible').click();
    }
    await page.locator(`[data-help="${helpId}"]:visible`).first().click();
    if (["nav-animals", "nav-pairings", "nav-advisor", "nav-family-tree"].includes(helpId)) {
      const gate = page.locator(".bp-species-gate");
      if (await gate.count()) await gate.getByRole("listitem").first().getByRole("button").first().click();
    }
  };

  const pressAround = async (screen: string) => {
    await helpMode(true);
    const before = await storage();
    watching = true;
    const controls = page.locator("[data-help]:visible:not([data-help-ui]):not([data-help-ui] *)");
    const count = Math.min(await controls.count(), 18);
    expect(count, `${screen} has controls to press`).toBeGreaterThan(3);
    for (let i = 0; i < count; i += 1) {
      const control = controls.nth(i);
      if (!(await control.isVisible())) continue;
      await control.click({ force: true, timeout: 2_000 }).catch(() => {});
      await page.keyboard.press("Escape");
    }
    watching = false;
    expect(await storage(), `${screen}: stored data changed in Help Mode`).toBe(before);
    expect(writes, `${screen}: Help Mode wrote to the server`).toEqual([]);
  };

  await pressAround("dashboard");
  for (const screen of ["nav-animals", "nav-pairings", "nav-advisor", "nav-family-tree", "nav-calendar", "nav-spaces", "nav-quarantine", "nav-lab-tests", "nav-setup"]) {
    await go(screen);
    await pressAround(screen);
  }
});
