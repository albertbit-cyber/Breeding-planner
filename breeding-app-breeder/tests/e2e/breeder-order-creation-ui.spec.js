import base from "@playwright/test";
import { expect, openSeedSnakeEditor } from "./helpers.js";

const test = base;

test("breeder can create a lab order from the snake editor UI", async ({ page }) => {
  await openSeedSnakeEditor(page);

  await page.getByRole("button", { name: /Order Genetic Test/i }).click();
  await expect(page.getByText(/Add to Batch Order/i)).toBeVisible();
  const firstTest = page.getByRole("checkbox", { name: /Clown/i }).first();
  await expect(firstTest).toBeVisible();
  if (!(await firstTest.isChecked())) {
    await firstTest.evaluate((checkbox) => checkbox.click());
  }
  await page.getByRole("button", { name: /Add to Batch|Update in Batch/i }).click();
  await expect(page.getByText(/Add to Batch Order/i)).not.toBeVisible();

  await expect(page.getByRole("button", { name: /Batch Order/i })).toBeVisible();
  await page.getByRole("button", { name: /Batch Order/i }).click();
  await expect(page.getByRole("button", { name: /Submit Order/i })).toBeEnabled();
  const downloadPromise = page.waitForEvent("download").catch(() => null);
  await page.getByRole("button", { name: /Submit Order/i }).click();
  await expect(page.getByText(/Batch Order Submitted/i)).toBeVisible();
  await downloadPromise;
});
