import { expect, test } from "@playwright/test";
import { backendUrl, expectedOrderNumber, openAuthenticatedLab } from "./helpers";

test("lab order list shows seeded backend order", async ({ page }) => {
  await openAuthenticatedLab(page);
  await page.evaluate(() => {
    window.location.hash = "/lab/dashboard";
  });
  await expect(page.getByText("/lab/dashboard")).toBeVisible();

  const ordersResponsePromise = page.waitForResponse((response) =>
    response.url().startsWith(`${backendUrl}/api/lab/orders`) &&
    response.request().method() === "GET" &&
    response.status() === 200
  );
  await page.getByRole("button", { name: "All Shed Orders" }).click();
  const ordersResponse = await ordersResponsePromise;
  const ordersBody = await ordersResponse.json();
  expect(Array.isArray(ordersBody.orders)).toBeTruthy();
  expect(ordersBody.orders.length).toBeGreaterThan(0);
  await expect(page.getByRole("heading", { name: /all shed test orders/i })).toBeVisible();
  await expect(page.getByText(expectedOrderNumber)).toBeVisible();
});
