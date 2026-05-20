import base from "@playwright/test";
import {
  completeBreederOrderForCertificate,
  expect,
  loginLabViaApi,
  loadBreederAuthFromStorageState,
  openSeedSnakeEditor,
} from "./helpers.js";

const test = base;

test("breeder can download a certificate for a completed owned order", async ({ page, request }) => {
  const breederAuth = loadBreederAuthFromStorageState();
  const labAuth = await loginLabViaApi(request);

  await openSeedSnakeEditor(page);
  await page.getByRole("button", { name: /Order Genetic Test/i }).click();
  await expect(page.getByText(/Add to Batch Order/i)).toBeVisible();
  const snakeId = (await page.locator("div.font-mono.text-xs.text-neutral-500").last().innerText()).trim();
  await page.getByRole("button", { name: /^Close$/i }).click();
  await completeBreederOrderForCertificate(request, breederAuth.token, labAuth.token, snakeId);
  await page.evaluate(() => window.dispatchEvent(new Event("lab:test-order-created")));
  await expect(page.getByText("Shed Testing Orders")).toBeVisible();
  await expect(page.getByRole("button", { name: /Download Certificate PDF/i }).first()).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /Download Certificate PDF/i }).first().click();
  const download = await downloadPromise;
  expect(download.suggestedFilename().toLowerCase()).toContain(".pdf");
});
