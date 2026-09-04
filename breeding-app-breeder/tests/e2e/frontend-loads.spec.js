import base from "@playwright/test";
import { collectConsoleErrors, expect } from "./helpers.js";

const test = base;

test("breeder frontend loads without blocking console errors", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto("/#/breeder");
  await expect(page.getByText("Serpentora").first()).toBeVisible();
  // The Animals tab appears once a species is chosen; what proves a signed-in
  // breeder landed is the dashboard nav itself.
  await expect(page.getByRole("button", { name: /^Shed Test Terminal$/i })).toBeVisible();
  expect(errors.filter((entry) => !/favicon|ResizeObserver/i.test(entry))).toEqual([]);
});
