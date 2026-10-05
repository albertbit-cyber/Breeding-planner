import { expect, test, type APIRequestContext } from "@playwright/test";

/**
 * The buyer journey, end to end: search, open a listing, send the first
 * message. Run against a freshly reset local database (see
 * breeding-app-backend/prisma/e2eReset.ts), which seeds three listings from
 * "Seed Breeder" and a buyer account with no history.
 *
 * The search uses the hobby's words on purpose. "clown" means a visual Clown,
 * so the het Clown listed beside it must not come back.
 */

const backendUrl = process.env.E2E_BACKEND_URL || "http://127.0.0.1:4000";
const buyerEmail = process.env.E2E_BUYER_EMAIL || "buyer@proherper.dev";
const buyerPassword = process.env.E2E_BUYER_PASSWORD || "buyer1234";
const sellerEmail = process.env.E2E_BREEDER_EMAIL || "breeder@proherper.dev";
const sellerPassword = process.env.E2E_BREEDER_PASSWORD || "breeder1234";

const VISUAL_CLOWN = "Clown het Pied female";
const HET_CLOWN = "Pastel het Clown male";
const CORN = "Amel corn snake";

// A cold Vite dev server pre-bundles dependencies on the first request, which
// can outlast a test's own timeout. Pay that once, here, not inside a test.
test.beforeAll(async ({ browser }) => {
  test.setTimeout(180_000);
  const page = await browser.newPage();
  await page.goto("/", { timeout: 170_000 });
  await page.getByRole("textbox", { name: "Search animals" }).waitFor({ timeout: 170_000 });
  await page.close();
});

const apiLogin = async (request: APIRequestContext, email: string, password: string, portal: string) => {
  const response = await request.post(`${backendUrl}/api/auth/login`, { data: { email, password, portal } });
  expect(response.status(), `login ${email}`).toBe(200);
  return String((await response.json())?.token || "");
};

test("a signed-out buyer searches, opens a listing, signs in and sends the first message", async ({ page, request }) => {
  const firstMessage = `Is she still available? (e2e ${Date.now()})`;

  // 1. Search in the hobby's words.
  await page.goto("/");
  await expect(page.getByRole("link", { name: new RegExp(CORN, "i") }).first()).toBeVisible();
  const search = page.getByRole("textbox", { name: "Search animals" });
  await search.fill("clown");
  await search.press("Enter");

  await expect(page).toHaveURL(/includeGenes=Clown/);
  await expect(page.getByText("visual Clown").first()).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(VISUAL_CLOWN, "i") }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(HET_CLOWN, "i") })).toHaveCount(0);
  await expect(page.getByRole("link", { name: new RegExp(CORN, "i") })).toHaveCount(0);

  // The URL is the search: a reload (or a shared link) shows the same result.
  await page.reload();
  await expect(page.getByRole("link", { name: new RegExp(VISUAL_CLOWN, "i") }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(HET_CLOWN, "i") })).toHaveCount(0);

  // 2. The listing: genetics claim by claim, each with where it comes from.
  await page.getByRole("link", { name: new RegExp(VISUAL_CLOWN, "i") }).first().click();
  await expect(page).toHaveURL(/\/a\/e2e-listing-clown$/);
  await expect(page.getByRole("heading", { level: 1, name: VISUAL_CLOWN })).toBeVisible();
  const genetics = page.getByRole("region", { name: /Genetics, and where each claim comes from/i });
  await expect(genetics.getByRole("listitem").filter({ hasText: "Observed by the seller" })).toContainText("Clown");
  await expect(genetics.getByRole("listitem").filter({ hasText: "Predicted from the pairing" })).toContainText(
    "het Pied"
  );

  // 3. Asking needs an account; the sheet says so and signing in comes back here.
  await page.getByRole("button", { name: "Message the seller" }).click();
  await expect(page.getByRole("dialog", { name: "Sign in to message the seller" })).toBeVisible();
  await page.getByRole("dialog").getByRole("link", { name: "Sign in" }).click();

  await page.getByRole("button", { name: "Log in" }).click();
  await page.getByLabel("Email address").fill(buyerEmail);
  await page.getByLabel("Password").fill(buyerPassword);
  await page.getByRole("button", { name: "Continue" }).click();

  // 4. Back on the listing with the message ready to send.
  await expect(page).toHaveURL(/\/a\/e2e-listing-clown$/);
  const compose = page.getByRole("dialog", { name: "Message the seller" });
  await expect(compose).toBeVisible();
  await expect(compose.getByRole("textbox", { name: "Message" })).toHaveValue(/still available/i);
  await compose.getByRole("textbox", { name: "Message" }).fill(firstMessage);
  await compose.getByRole("button", { name: "Send message" }).click();

  // 5. The thread opens in the inbox with the message in it.
  await expect(page).toHaveURL(/\/inbox\/[^/]+$/);
  await expect(page.getByText(firstMessage)).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Inbox" })).toContainText(VISUAL_CLOWN);

  // 6. And it reached the seller, which is the point.
  const sellerToken = await apiLogin(request, sellerEmail, sellerPassword, "breeder");
  const threads = await request.get(`${backendUrl}/api/marketplace/conversations`, {
    headers: { Authorization: `Bearer ${sellerToken}` },
  });
  expect(threads.status()).toBe(200);
  const { conversations } = await threads.json();
  const thread = conversations.find((entry: any) => entry.listingId === "e2e-listing-clown");
  expect(thread?.role).toBe("seller");
  expect(thread?.lastMessage?.messageText).toBe(firstMessage);
  expect(thread?.unreadCount).toBeGreaterThan(0);
});

test("a het search returns the het, and the species filter narrows by species", async ({ page }) => {
  await page.goto("/?includeGenes=het%20Clown");
  await expect(page.getByRole("link", { name: new RegExp(HET_CLOWN, "i") }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(VISUAL_CLOWN, "i") })).toHaveCount(0);

  await page.goto("/");
  await page.getByRole("group", { name: "Species" }).getByRole("button", { name: /Corn snake/ }).click();
  await expect(page).toHaveURL(/species=Corn\+snake|species=Corn%20snake/);
  await expect(page.getByRole("link", { name: new RegExp(CORN, "i") }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(VISUAL_CLOWN, "i") })).toHaveCount(0);
});

test("a search with no match says so and offers a way out", async ({ page }) => {
  await page.goto("/?includeGenes=Axanthic");
  await expect(page.getByRole("heading", { name: "No animals match those filters" })).toBeVisible();
  await expect(page.getByText(/A bare gene means a visual/)).toBeVisible();
  await page.getByRole("button", { name: "Clear all" }).last().click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("link", { name: new RegExp(CORN, "i") }).first()).toBeVisible();
});
