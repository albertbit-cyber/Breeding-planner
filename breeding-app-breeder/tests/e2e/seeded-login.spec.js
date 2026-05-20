import base from "@playwright/test";
import { breederEmail, expect, requireBreederPassword } from "./helpers.js";

const test = base;

test.use({ storageState: { cookies: [], origins: [] } });

test("seeded breeder can log in through the browser", async ({ page }) => {
  await page.goto("/#/breeder");
  await page.evaluate(() => {
    localStorage.removeItem("breedingPlannerBreederAuthToken");
    localStorage.removeItem("breedingPlannerBreederRefreshToken");
    localStorage.removeItem("breedingPlannerBreederAuthSession");
    localStorage.removeItem("breedingPlannerAuthToken");
    localStorage.removeItem("breedingPlannerRefreshToken");
    localStorage.removeItem("breedingPlannerAuthSession");
  });
  await page.reload();
  await expect(page.getByRole("button", { name: /^Log in$/i })).toBeVisible();
  await page.getByRole("button", { name: /^Log in$/i }).click();
  await page.locator('input[type="email"]').fill(breederEmail);
  await page.locator('input[type="password"]').fill(requireBreederPassword());
  await page.getByRole("button", { name: /continue/i }).click();
  await expect(page.getByText(/signed in as/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /^Animals$/i })).toBeVisible();
});
