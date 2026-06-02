import { expect, test } from "@playwright/test";
import { backendUrl, openAuthenticatedLab } from "./helpers";

test("catalog and pricing screens call backend APIs", async ({ page }) => {
  await openAuthenticatedLab(page);

  const catalogResponsePromise = page.waitForResponse((response) =>
    response.url().startsWith(`${backendUrl}/api/lab/tests/catalog`) && response.status() === 200
  );
  await page.getByRole("button", { name: "Test Catalog" }).click();
  const catalogResponse = await catalogResponsePromise;
  const catalogBody = await catalogResponse.json();
  expect(Array.isArray(catalogBody.tests)).toBeTruthy();
  expect(catalogBody.tests.length).toBeGreaterThan(0);
  await expect(page.getByRole("heading", { name: /test catalog/i })).toBeVisible();

  const pricingCatalogResponsePromise = page.waitForResponse((response) =>
    response.url().startsWith(`${backendUrl}/api/lab/tests/catalog`) && response.status() === 200
  );
  await page.getByRole("button", { name: "Pricing & Logic" }).click();
  const pricingCatalogResponse = await pricingCatalogResponsePromise;
  const pricingCatalogBody = await pricingCatalogResponse.json();
  expect(Array.isArray(pricingCatalogBody.tests)).toBeTruthy();
  expect(pricingCatalogBody.tests.length).toBeGreaterThan(0);
  await expect(page.getByRole("heading", { name: "Pricing & Logic" })).toBeVisible();

  const pricingResponsePromise = page.waitForResponse((response) =>
    response.url().startsWith(`${backendUrl}/api/lab/tests/pricing`) && response.status() === 200
  );
  await page.evaluate(async (apiBase) => {
    const token = window.localStorage.getItem("breedingPlannerLabAuthToken") || "";
    await window.fetch(`${apiBase}/api/lab/tests/pricing`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }, backendUrl);
  const pricingResponse = await pricingResponsePromise;
  const pricingBody = await pricingResponse.json();
  expect(pricingBody.pricing).toBeTruthy();
});
