import { expect, test } from "@playwright/test";
import { backendUrl, openAuthenticatedLab } from "./helpers";

/**
 * The Test Catalog and Pricing screens read the *laboratory's own* data.
 *
 * Both used to read platform-wide endpoints — one shared catalogue and one
 * shared price list that every laboratory saw and could edit. They now read
 * `/lab/my/*`, which the backend resolves from the caller's membership, so
 * there is no identifier in the request that could name another laboratory.
 */
test("catalog and pricing screens read the laboratory's own data", async ({ page }) => {
  await openAuthenticatedLab(page);

  const offeringsResponsePromise = page.waitForResponse((response) =>
    response.url().startsWith(`${backendUrl}/api/lab/my/tests`) && response.status() === 200
  );
  await page.getByRole("button", { name: "Test Catalog" }).click();
  const offeringsResponse = await offeringsResponsePromise;
  const offeringsBody = await offeringsResponse.json();
  expect(Array.isArray(offeringsBody.offerings)).toBeTruthy();
  expect(offeringsBody.offerings.length).toBeGreaterThan(0);
  await expect(page.getByRole("heading", { name: /test catalog/i })).toBeVisible();

  // Every offering returned belongs to one organization — the caller's.
  const organizationIds = new Set(
    offeringsBody.offerings.map((offering: { organizationId: string }) => offering.organizationId)
  );
  expect(organizationIds.size).toBe(1);

  const pricingCatalogResponsePromise = page.waitForResponse((response) =>
    response.url().startsWith(`${backendUrl}/api/lab/my/tests`) && response.status() === 200
  );
  await page.getByRole("button", { name: "Pricing & Logic" }).click();
  const pricingCatalogResponse = await pricingCatalogResponsePromise;
  const pricingCatalogBody = await pricingCatalogResponse.json();
  expect(Array.isArray(pricingCatalogBody.offerings)).toBeTruthy();
  await expect(page.getByRole("heading", { name: "Pricing & Logic" })).toBeVisible();

  const pricingResponsePromise = page.waitForResponse((response) =>
    response.url().startsWith(`${backendUrl}/api/lab/my/pricing`) && response.status() === 200
  );
  await page.evaluate(async (apiBase) => {
    const token = window.localStorage.getItem("breedingPlannerLabAuthToken") || "";
    await window.fetch(`${apiBase}/api/lab/my/pricing`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }, backendUrl);
  const pricingResponse = await pricingResponsePromise;
  const pricingBody = await pricingResponse.json();
  expect(pricingBody.pricing).toBeTruthy();
  // Tier pricing belongs to a laboratory now; a row with no organization is the
  // platform template and must never be what a laboratory is served.
  expect(pricingBody.pricing.organizationId).toBeTruthy();
});

test("a laboratory cannot write to the shared seed library", async ({ page }) => {
  await openAuthenticatedLab(page);

  const status = await page.evaluate(async (apiBase) => {
    const token = window.localStorage.getItem("breedingPlannerLabAuthToken") || "";
    const response = await window.fetch(`${apiBase}/api/lab/tests/catalog/clown`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Renamed by a vendor" }),
    });
    return response.status;
  }, backendUrl);

  // The library is the platform's. A vendor editing it would change the
  // definitions every other laboratory sells against.
  expect(status).toBe(403);
});
