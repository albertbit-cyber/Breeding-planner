import base from "@playwright/test";
import { collectConsoleErrors, expect } from "./helpers.js";

const test = base;

test("breeder frontend loads without blocking console errors", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto("/#/breeder");
  await expect(page.getByText("Breeding Planner").first()).toBeVisible();
  await expect(page.getByRole("button", { name: /^Animals$/i })).toBeVisible();
  expect(errors.filter((entry) => !/favicon|ResizeObserver/i.test(entry))).toEqual([]);
});
