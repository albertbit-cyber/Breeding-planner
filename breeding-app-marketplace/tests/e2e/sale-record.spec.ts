import { expect, test, type APIRequestContext, type Browser } from "@playwright/test";

/**
 * The sale carries the record. The seller marks the Clown listing sold from
 * the dashboard; the buyer finds the animal under My animals with its genetics,
 * each claim keeping its source, and the certificate code that /verify checks.
 *
 * Seeded by breeding-app-backend/prisma/e2eReset.ts: the listed animal carries
 * "Clown", "het Pied" and "50% het Hypo", and its certificate confirms het Pied
 * and finds no Hypo.
 */

const backendUrl = process.env.E2E_BACKEND_URL || "http://127.0.0.1:4000";
const sellerEmail = process.env.E2E_BREEDER_EMAIL || "breeder@proherper.dev";
const sellerPassword = process.env.E2E_BREEDER_PASSWORD || "breeder1234";
const buyerEmail = process.env.E2E_BUYER_EMAIL || "buyer@proherper.dev";
const buyerPassword = process.env.E2E_BUYER_PASSWORD || "buyer1234";
const CERTIFICATE = "E2E-CERT-0001";
const CODE = "E2E0A1B2C3D4E5F6A7B8C9D0";
const LISTING = "Clown het Pied female";

const login = async (request: APIRequestContext, email: string, password: string) => {
  const response = await request.post(`${backendUrl}/api/auth/login`, {
    data: { email, password, portal: "marketplace" },
  });
  expect(response.status(), `login ${email}`).toBe(200);
  return response.json();
};

/** A page already signed in, the way the marketplace stores a session. */
const signedInPage = async (browser: Browser, auth: any, role: string) => {
  const context = await browser.newContext();
  await context.addInitScript(
    ({ token, refreshToken, session }) => {
      localStorage.setItem("breedingPlannerBreederAuthToken", token);
      localStorage.setItem("breedingPlannerBreederRefreshToken", refreshToken);
      localStorage.setItem("breedingPlannerBreederAuthSession", session);
    },
    {
      token: auth.token,
      refreshToken: auth.refreshToken,
      session: JSON.stringify({
        isAuthenticated: true,
        mode: "login",
        role,
        profile: { fullName: auth.user?.fullName, displayName: auth.user?.fullName, role },
      }),
    }
  );
  return context.newPage();
};

test.beforeAll(async ({ browser }) => {
  // Same cold-start warm-up as the buyer journey.
  test.setTimeout(180_000);
  const page = await browser.newPage();
  await page.goto("/", { timeout: 170_000 });
  await page.close();
});

test("marking an animal sold sends its record, provenance intact, to the buyer", async ({ browser, request }) => {
  const buyerAuth = await login(request, buyerEmail, buyerPassword);
  const sellerAuth = await login(request, sellerEmail, sellerPassword);

  // The buyer has asked about the animal, which is what makes them a buyer the seller can pick.
  const opened = await request.post(`${backendUrl}/api/marketplace/conversations`, {
    headers: { Authorization: `Bearer ${buyerAuth.token}` },
    data: { listingId: "e2e-listing-clown", messageText: "I'll take her at 420.", offerAmount: 420 },
  });
  expect(opened.status()).toBe(201);

  // The seller marks it sold from the dashboard.
  const seller = await signedInPage(browser, sellerAuth, "breeder");
  await seller.goto("/dashboard");
  const row = seller.locator(".mk-table-row", { hasText: LISTING }).first();
  await row.getByRole("button", { name: "Mark sold" }).click();
  const dialog = seller.getByRole("dialog", { name: `Who bought ${LISTING}?` });
  await expect(dialog.getByRole("radio", { name: /Seed Buyer/ })).toBeChecked();
  await expect(dialog.getByRole("spinbutton")).toHaveValue("420");
  await dialog.getByRole("button", { name: "Mark sold and send the record" }).click();
  await expect(seller.getByText(/now has the animal and its record/)).toBeVisible();

  // The listing has left Browse.
  const browse = await request.get(`${backendUrl}/api/marketplace/listings?includeGenes=Clown`);
  expect((await browse.json()).listings.map((listing: any) => listing.id)).not.toContain("e2e-listing-clown");

  // The buyer finds it under My animals.
  const buyer = await signedInPage(browser, buyerAuth, "buyer");
  await buyer.goto("/dashboard");
  await expect(buyer.getByRole("link", { name: "My animals" })).toBeVisible();
  const card = buyer.locator(".mk-acquired", { hasText: LISTING });
  await expect(card).toContainText("Acquired from Seed Breeder Reptiles");

  const claim = (label: string) => card.locator(".mk-claim", { hasText: label });
  await expect(claim("Clown")).toContainText("Observed by the seller, not tested");
  await expect(claim("het Pied")).toContainText(`Lab-confirmed, certificate ${CERTIFICATE}`);
  // The seller's 50% het Hypo stays a prediction, and says the lab disagreed.
  await expect(claim("50% het Hypo")).toContainText("Predicted from the pairing, 50% odds");
  await expect(claim("50% het Hypo")).toContainText("certificate reads “Negative”");

  await expect(card).toContainText(CERTIFICATE);
  await expect(card).toContainText(CODE);
  await expect(card.getByRole("link", { name: "Check this certificate" })).toHaveAttribute("href", new RegExp(`/verify/${CODE}$`));
  await expect(card).toContainText("3 weights");

  // Nothing private came with it.
  await expect(card).not.toContainText("Private seller note");
  await expect(card).not.toContainText("Rack B");

  // And the code really verifies.
  const verified = await request.get(`${backendUrl}/api/public/certificates/verify/${CODE}`);
  expect(await verified.json()).toMatchObject({ valid: true, certificateNumber: CERTIFICATE });
});
