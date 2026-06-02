import { expect, type Page, test } from "@playwright/test";
import { backendUrl, collectConsoleErrors, expectedOrderNumber, loginViaApi, openAuthenticatedLab } from "./helpers";
import { resetSeededOrderForResultEntry } from "./order-test-helpers";

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

const resultEntrySection = (page: Page) => page.locator("section").filter({ hasText: "Enter Results" });

test("lab result draft can be saved and loaded again", async ({ page, request }) => {
  const consoleErrors = collectConsoleErrors(page);
  const token = await loginViaApi(request);
  const order = await resetSeededOrderForResultEntry(request, token, "received");
  const testCode = `PW-DRAFT-${Date.now()}`;

  await openSeededOrderDetail(page, order.id);
  const section = resultEntrySection(page);
  await expect(section.getByRole("heading", { name: /enter results/i })).toBeVisible();
  await section.locator('input[placeholder="260424PH1061"]').fill(testCode);
  await section.locator('input[placeholder="PCR"]').fill("PCR");
  await section.locator("select").first().selectOption("heterozygous");
  await section.getByPlaceholder(/per-gene notes/i).first().fill("Playwright draft note");
  await section.getByPlaceholder(/short technical summary/i).fill("Playwright draft result");

  const draftResponsePromise = page.waitForResponse((response) =>
    response.url().startsWith(`${backendUrl}/api/lab/orders/${encodeURIComponent(order.id)}/results/draft`) &&
    response.request().method() === "POST" &&
    response.status() === 200
  );
  await section.getByRole("button", { name: /^save draft$/i }).click();
  const draftResponse = await draftResponsePromise;
  const draftBody = await draftResponse.json();
  expect(draftBody?.mode).toBe("draft");
  expect(draftBody?.order?.status).toBe("in_progress");
  expect(String(draftBody?.result?.testCode || "")).toBe(testCode);

  await page.reload();
  const reloadedSection = resultEntrySection(page);
  await expect(reloadedSection.getByRole("heading", { name: /enter results/i })).toBeVisible();
  await expect(reloadedSection.locator('input[placeholder="260424PH1061"]')).toHaveValue(testCode);
  await expect(reloadedSection.locator("select").first()).toHaveValue("heterozygous");
  await expect(reloadedSection.getByPlaceholder(/short technical summary/i)).toHaveValue("Playwright draft result");
  expect(consoleErrors).toEqual([]);
});

test("lab result submission completes the seeded order", async ({ page, request }) => {
  const consoleErrors = collectConsoleErrors(page);
  const token = await loginViaApi(request);
  const order = await resetSeededOrderForResultEntry(request, token, "in_progress");
  const testCode = `PW-SUBMIT-${Date.now()}`;

  await openSeededOrderDetail(page, order.id);
  const section = resultEntrySection(page);
  await expect(section.getByRole("heading", { name: /enter results/i })).toBeVisible();
  await section.locator('input[placeholder="260424PH1061"]').fill(testCode);
  await section.locator('input[placeholder="PCR"]').fill("PCR");

  const selects = section.locator("select");
  const selectCount = await selects.count();
  expect(selectCount).toBeGreaterThan(0);
  for (let index = 0; index < selectCount; index += 1) {
    await selects.nth(index).selectOption("not_detected");
  }
  await section.getByPlaceholder(/short technical summary/i).fill("Playwright submitted result");

  const submitResponsePromise = page.waitForResponse((response) =>
    response.url().startsWith(`${backendUrl}/api/lab/orders/${encodeURIComponent(order.id)}/results/submit`) &&
    response.request().method() === "POST" &&
    response.status() === 200
  );
  await section.getByRole("button", { name: /^submit result$/i }).click();
  const submitResponse = await submitResponsePromise;
  const submitBody = await submitResponse.json();
  expect(submitBody?.mode).toBe("submit");
  expect(submitBody?.order?.status).toBe("completed");
  expect(String(submitBody?.result?.testCode || "")).toBe(testCode);

  await expect(page.getByText("Download Certificate PDF")).toBeVisible();
  await expect(page.getByText("Playwright submitted result")).toBeVisible();
  expect(consoleErrors).toEqual([]);
});
