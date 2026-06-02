import base from "@playwright/test";
import { createBreederOrderForSnake, expect, loginBreederViaApi, openSeedSnakeEditor } from "./helpers.js";

const test = base;

test("breeder can preview and download labels for an owned order", async ({ page, request }) => {
  const { token } = await loginBreederViaApi(request);
  await createBreederOrderForSnake(request, token);

  await openSeedSnakeEditor(page);
  await expect(page.getByRole("button", { name: /Preview Labels PDF/i }).first()).toBeVisible();

  const popupPromise = page.waitForEvent("popup").catch(() => null);
  await page.getByRole("button", { name: /Preview Labels PDF/i }).first().click();
  await popupPromise;

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /Download Labels PDF/i }).first().click();
  const download = await downloadPromise;
  expect(download.suggestedFilename().toLowerCase()).toContain(".pdf");
});
