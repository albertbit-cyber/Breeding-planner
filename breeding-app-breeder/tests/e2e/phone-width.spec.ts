import { test, expect, type Page } from "@playwright/test";

/**
 * The web app at phone width (390px), signed in as the seeded breeder.
 *
 * The rule under test: a phone gets the same capabilities as a desktop, reorganized, never
 * removed. Before this the toolbar that holds Import was display:none under 768px, and tapping
 * Animals or Breeding with no species open bounced silently to the dashboard.
 *
 * So every bottom-bar destination (and every entry in More) must either render or explain
 * itself, and the main working pages must not scroll sideways.
 */

test.use({ viewport: { width: 390, height: 844 } });

const GATE_MESSAGE = "Open a species first; everything here lives inside one.";

const bottomBar = (page: Page) => page.locator("nav.bp-mobile-bottom-nav");
const gate = (page: Page) => page.locator(".bp-species-gate");
const body = (page: Page) => page.locator(".max-w-7xl.mx-auto.p-5").last();

const tapBottom = (page: Page, name: string) =>
  bottomBar(page).getByRole("button", { name, exact: true }).click();

const tapMore = async (page: Page, name: string) => {
  await tapBottom(page, "More");
  await page.locator(".bp-more-menu__panel").getByRole("button", { name, exact: true }).click();
};

const expectNoHorizontalScroll = async (page: Page, where: string) => {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, `${where} scrolls sideways at 390px`).toBeLessThanOrEqual(clientWidth);
};

/** A destination that renders: something is drawn, and it is not the species gate. */
const expectRenders = async (page: Page, where: string) => {
  await expect(gate(page), `${where} shows the species gate`).toHaveCount(0);
  await expect.poll(async () => (await body(page).innerText()).trim().length, { message: `${where} is blank` })
    .toBeGreaterThan(0);
};

/** A species-scoped destination with no species open: one sentence and the species list. */
const expectExplains = async (page: Page, where: string) => {
  await expect(gate(page).getByText(GATE_MESSAGE), `${where} does not explain itself`).toBeVisible();
  await expect(gate(page).getByRole("listitem").first(), `${where} offers no species`).toBeVisible();
};

test("every phone destination renders or explains, and nothing scrolls sideways", async ({ page }) => {
  // One walk through eleven destinations on a dev server; the default 45s is sized for one page.
  test.setTimeout(150_000);
  await page.goto("/#/breeder");
  await expect(bottomBar(page)).toBeVisible();

  // Dashboard is in the bottom bar and is where a fresh visit lands.
  await expect(bottomBar(page).getByRole("button", { name: "Dashboard", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { name: "Species" })).toBeVisible();
  await expectNoHorizontalScroll(page, "dashboard");

  // Species-scoped tabs with no species open explain themselves instead of bouncing.
  await tapBottom(page, "Animals");
  await expectExplains(page, "Animals");
  await expect(bottomBar(page).getByRole("button", { name: "Animals", exact: true })).toHaveAttribute("aria-current", "page");
  await tapBottom(page, "Breeding");
  await expectExplains(page, "Breeding");
  await tapMore(page, "Breeding Advisor");
  await expectExplains(page, "Breeding Advisor");
  await tapMore(page, "Family Tree");
  await expectExplains(page, "Family Tree");

  // Global destinations render.
  await tapBottom(page, "Calendar");
  await expectRenders(page, "Calendar");
  for (const name of ["Quarantine", "Spaces", "Lab tests"]) {
    await tapMore(page, name);
    await expectRenders(page, name);
  }
  await tapBottom(page, "Settings");
  await expectRenders(page, "Settings");
  await expectNoHorizontalScroll(page, "settings");

  // Picking a species from the gate opens it on the tab that was asked for.
  await tapBottom(page, "Breeding");
  await gate(page).getByRole("listitem").first().getByRole("button").click();
  await expectRenders(page, "pairing list");
  await expect(bottomBar(page).getByRole("button", { name: "Breeding", exact: true })).toHaveAttribute("aria-current", "page");
  await expectNoHorizontalScroll(page, "pairing list");

  await tapBottom(page, "Animals");
  await expectRenders(page, "animals");
  await expect(page.locator(".bp-toolbar")).toBeVisible();
  await expectNoHorizontalScroll(page, "animals");

  // Import is reachable at 390px: the "+" opens the action sheet with every toolbar action.
  await page.getByRole("button", { name: "Animal actions" }).click();
  const sheet = page.getByRole("dialog", { name: "Animal actions" });
  for (const name of ["Add animal", "Import animals", "Export QR", "Scan QR"]) {
    await expect(sheet.getByRole("button", { name, exact: true })).toBeInViewport();
  }
  await sheet.getByRole("button", { name: "Import animals", exact: true }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Import from MorphMarket" })).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByRole("button", { name: "Import from MorphMarket" })).toHaveCount(0);

  // Dashboard from inside a species leaves it, as the desktop tab does.
  await tapBottom(page, "Dashboard");
  await expect(page.getByRole("heading", { name: "Species" })).toBeVisible();
  await tapBottom(page, "Animals");
  await expectExplains(page, "Animals after leaving a species");
});
