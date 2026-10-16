import { expect, type Page, test } from "@playwright/test";
import { backendUrl, collectConsoleErrors, expectedOrderNumber, loginViaApi, openAuthenticatedLab } from "./helpers";
import { getFirstSyntheticSample, resetSeededOrderForResultEntry } from "./order-test-helpers";

/**
 * The Scan button's two outcomes, driven through its typed-input fallback
 * (what a handheld barcode scanner does): a tube that just arrived goes
 * straight into testing, a tube already in testing opens the result sheet on
 * that snake.
 */

const openScanOverlay = async (page: Page) => {
  await openAuthenticatedLab(page, "/lab/dashboard");
  await page.getByRole("button", { name: /^scan$/i }).first().click();
  await expect(page.getByText("Scan Sample QR Code", { exact: true })).toBeVisible();
};

const typeIntoScanner = async (page: Page, value: string) => {
  await page.getByPlaceholder(/paste 64-char qr token/i).fill(value);
  await page.getByRole("button", { name: /^resolve token$/i }).click();
};

test("scanning a submitted sample receives it and starts testing in one step", async ({ page, request }) => {
  const consoleErrors = collectConsoleErrors(page);
  const token = await loginViaApi(request);
  const seededOrder = await resetSeededOrderForResultEntry(request, token, "submitted");
  const sample = await getFirstSyntheticSample(request, token, seededOrder.id);

  await openScanOverlay(page);

  const statusResponsePromise = page.waitForResponse((response) =>
    response.url().startsWith(`${backendUrl}/api/lab/orders/${encodeURIComponent(seededOrder.id)}/status`) &&
    response.request().method() === "PATCH" &&
    response.status() === 200
  );
  await typeIntoScanner(page, sample.sampleId);
  const body = await (await statusResponsePromise).json();
  expect(body?.order?.status).toBe("in_progress");

  await expect(page.getByText("Sample received. Testing started.")).toBeVisible();
  await expect(page.getByText(sample.sampleId)).toBeVisible();
  await expect(page.getByText(expectedOrderNumber).first()).toBeVisible();

  // Ready for the next tube without closing anything.
  await page.getByRole("button", { name: /^scan next sample$/i }).click();
  await expect(page.getByPlaceholder(/paste 64-char qr token/i)).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test("scanning a sample in testing opens the result sheet on that snake", async ({ page, request }) => {
  const consoleErrors = collectConsoleErrors(page);
  const token = await loginViaApi(request);
  const seededOrder = await resetSeededOrderForResultEntry(request, token, "in_progress");
  const sample = await getFirstSyntheticSample(request, token, seededOrder.id);

  await openScanOverlay(page);
  await typeIntoScanner(page, sample.sampleId);

  await expect(page).toHaveURL(new RegExp(`#/lab/result-entry\\?orderId=${encodeURIComponent(seededOrder.id)}`));
  await expect(page.getByText("Scanned", { exact: true })).toBeVisible();
  await expect(page.getByText(/breeder sees:|select result/i).first()).toBeAttached();
  expect(consoleErrors).toEqual([]);
});

test("problem with sample holds the order at received", async ({ page, request }) => {
  const consoleErrors = collectConsoleErrors(page);
  const token = await loginViaApi(request);
  const seededOrder = await resetSeededOrderForResultEntry(request, token, "submitted");
  const sample = await getFirstSyntheticSample(request, token, seededOrder.id);

  await openScanOverlay(page);
  await typeIntoScanner(page, sample.sampleId);
  await expect(page.getByText("Sample received. Testing started.")).toBeVisible();

  const holdResponsePromise = page.waitForResponse((response) =>
    response.url().startsWith(`${backendUrl}/api/lab/orders/${encodeURIComponent(seededOrder.id)}/status`) &&
    response.request().method() === "PATCH" &&
    response.status() === 200
  );
  await page.getByRole("button", { name: /^problem with sample$/i }).click();
  const body = await (await holdResponsePromise).json();
  expect(body?.order?.status).toBe("received");
  await expect(page).toHaveURL(new RegExp(`#/lab/orders/${encodeURIComponent(seededOrder.id)}`));
  expect(consoleErrors).toEqual([]);
});
