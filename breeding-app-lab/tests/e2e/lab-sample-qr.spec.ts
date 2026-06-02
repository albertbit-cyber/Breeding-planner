import { expect, type Page, test } from "@playwright/test";
import { backendUrl, collectConsoleErrors, expectedOrderNumber, loginViaApi, openAuthenticatedLab } from "./helpers";
import { getFirstSyntheticSample, resetSeededOrderForResultEntry } from "./order-test-helpers";

const openSampleIntake = async (page: Page) => {
  await openAuthenticatedLab(page, "/lab/sample-intake");
  await expect(page.getByRole("heading", { name: /^sample intake$/i })).toBeVisible();
};

const resolveInput = async (page: Page, value: string) => {
  const ordersResponsePromise = page.waitForResponse((response) =>
    response.url().startsWith(`${backendUrl}/api/lab/orders`) &&
    response.request().method() === "GET" &&
    response.status() === 200
  );
  await page.getByPlaceholder(/paste 64-char qr token/i).fill(value);
  await page.getByRole("button", { name: /^resolve token$/i }).click();
  await ordersResponsePromise;
};

test("sample intake resolves a seeded sample ID and submits intake", async ({ page, request }) => {
  const consoleErrors = collectConsoleErrors(page);
  const token = await loginViaApi(request);
  const seededOrder = await resetSeededOrderForResultEntry(request, token, "submitted");
  const sample = await getFirstSyntheticSample(request, token, seededOrder.id);

  await openSampleIntake(page);
  await resolveInput(page, sample.sampleId);

  await expect(page.getByText("Linked Order Context", { exact: true })).toBeVisible();
  await expect(page.getByText(expectedOrderNumber)).toBeVisible();
  await expect(page.getByText(sample.sampleId)).toBeVisible();
  await expect(page.getByText(sample.animalId).first()).toBeVisible();

  const statusResponsePromise = page.waitForResponse((response) =>
    response.url().startsWith(`${backendUrl}/api/lab/orders/${encodeURIComponent(seededOrder.id)}/status`) &&
    response.request().method() === "PATCH" &&
    response.status() === 200
  );
  await page.getByPlaceholder(/tube label verified/i).fill("Playwright sample lookup intake");
  await page.getByRole("button", { name: /^submit intake decision$/i }).click();
  const statusResponse = await statusResponsePromise;
  const body = await statusResponse.json();
  expect(body?.order?.status).toBe("in_progress");
  await expect(page.getByText("Sample received and moved into testing.")).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test("sample intake resolves a seeded QR payload", async ({ page, request }) => {
  const consoleErrors = collectConsoleErrors(page);
  const token = await loginViaApi(request);
  const seededOrder = await resetSeededOrderForResultEntry(request, token, "submitted");
  const sample = await getFirstSyntheticSample(request, token, seededOrder.id);

  await openSampleIntake(page);
  await resolveInput(page, sample.rawQrPayload);

  await expect(page.getByText("Linked Order Context", { exact: true })).toBeVisible();
  await expect(page.getByText(expectedOrderNumber)).toBeVisible();
  await expect(page.getByText(sample.sampleId)).toBeVisible();
  await expect(page.getByText(/Expected|Sample Received|In Progress/i).first()).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test("sample intake rejects malformed QR input before backend lookup", async ({ page }) => {
  const consoleErrors = collectConsoleErrors(page);

  await openSampleIntake(page);
  await page.getByPlaceholder(/paste 64-char qr token/i).fill("not-a-valid-qr-or-sample");
  await expect(page.getByRole("button", { name: /^resolve token$/i })).toBeDisabled();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Linked Order Context", { exact: true })).toBeHidden();
  expect(consoleErrors).toEqual([]);
});
