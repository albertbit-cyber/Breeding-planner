import { expect, test } from "@playwright/test";
import { collectConsoleErrors } from "./helpers";

test("lab frontend loads without console errors", async ({ page }) => {
  const consoleErrors = collectConsoleErrors(page);
  await page.goto("/#/lab/dashboard");
  await expect(page.getByText("Laboratory")).toBeVisible();
  await expect(page.getByText("Lab Workflow")).toBeVisible();
  expect(consoleErrors).toEqual([]);
});
