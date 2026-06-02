import { expect, type Page, test } from "@playwright/test";
import { backendUrl, collectConsoleErrors, expectedOrderNumber, loginViaApi, openAuthenticatedLab } from "./helpers";
import { resetSeededOrderForResultEntry, submitCompleteNegativeResult } from "./order-test-helpers";

const openSeededOrderDetail = async (page: Page, orderId: string) => {
  const detailResponsePromise = page.waitForResponse((response) =>
    response.url().startsWith(`${backendUrl}/api/lab/orders/${encodeURIComponent(orderId)}`) &&
    response.request().method() === "GET" &&
    response.status() === 200
  );

  await openAuthenticatedLab(page, `/lab/orders/${encodeURIComponent(orderId)}`);
  const detailResponse = await detailResponsePromise;
  const body = await detailResponse.json();
  expect(body?.order?.id).toBe(orderId);

  await expect(page.getByRole("heading", { name: /shed test order details/i })).toBeVisible();
  await expect(page.getByText(expectedOrderNumber)).toBeVisible();
};

const prepareCompletedOrder = async (request: any) => {
  const token = await loginViaApi(request);
  const order = await resetSeededOrderForResultEntry(request, token, "in_progress");
  const result = await submitCompleteNegativeResult(request, token, order.id, `PW-CERT-${Date.now()}`);
  return { order, result };
};

test("certificate can be viewed from a completed seeded order", async ({ page, request }) => {
  const consoleErrors = collectConsoleErrors(page);
  const { order } = await prepareCompletedOrder(request);

  await openSeededOrderDetail(page, order.id);
  await expect(page.getByText("Certificate").first()).toBeVisible();
  await expect(page.getByText(/PH-GC-/).first()).toBeVisible();
  await expect(page.getByText(/Verification:/).first()).toBeVisible();

  await page.evaluate(() => {
    (window as any).__certificateOpenUrl = "";
    window.open = (url) => {
      (window as any).__certificateOpenUrl = String(url || "");
      return null;
    };
  });
  await page.getByRole("button", { name: /^view certificate$/i }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).__certificateOpenUrl))
    .toContain("blob:");

  expect(consoleErrors).toEqual([]);
});

test("certificate PDF can be downloaded from a completed seeded order", async ({ page, request }) => {
  const consoleErrors = collectConsoleErrors(page);
  const { order } = await prepareCompletedOrder(request);

  await openSeededOrderDetail(page, order.id);
  await expect(page.getByRole("button", { name: /^download pdf$/i })).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /^download pdf$/i }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/PH-GC-.*\.pdf$/);

  const stream = await download.createReadStream();
  expect(stream).toBeTruthy();
  let byteLength = 0;
  if (stream) {
    for await (const chunk of stream) {
      byteLength += Buffer.byteLength(chunk);
    }
  }
  expect(byteLength).toBeGreaterThan(1000);

  expect(consoleErrors).toEqual([]);
});
