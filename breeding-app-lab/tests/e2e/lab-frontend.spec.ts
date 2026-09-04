import { expect, test } from "@playwright/test";
import { collectConsoleErrors } from "./helpers";

test("lab frontend loads without console errors", async ({ page }) => {
  const consoleErrors = collectConsoleErrors(page);
  await page.goto("/#/lab/dashboard");
  await expect(page.getByText("Lab Workflow")).toBeVisible();
  await expect(page.getByRole("button", { name: "All Shed Orders" })).toBeVisible();
  expect(consoleErrors).toEqual([]);
});
