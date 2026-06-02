import { expect, test } from "@playwright/test";
import { loginAsLabUser } from "./helpers";

test.use({ storageState: { cookies: [], origins: [] } });

test("seeded lab user can log in through the browser", async ({ page }) => {
  await loginAsLabUser(page);
  await expect(page.getByRole("button", { name: "All Shed Orders" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Test Catalog" })).toBeVisible();
});
