import { expect, type APIRequestContext, type Page, test } from "@playwright/test";
import { backendUrl, expectedOrderNumber, loginViaApi, openAuthenticatedLab } from "./helpers";

type BackendOrder = {
  id: string;
  orderNumber?: string;
  status?: string;
  paymentStatus?: string;
};

const authHeaders = (token: string) => ({
  Authorization: `Bearer ${token}`,
});

const findSeededOrder = async (request: APIRequestContext, token: string): Promise<BackendOrder> => {
  const response = await request.get(`${backendUrl}/api/lab/orders`, {
    headers: authHeaders(token),
  });
  expect(response.status()).toBe(200);
  const body = await response.json();
  const orders = Array.isArray(body?.orders) ? body.orders : [];
  const order = orders.find((item: BackendOrder) => item?.orderNumber === expectedOrderNumber);
  expect(order, `Expected seeded order ${expectedOrderNumber} to exist`).toBeTruthy();
  expect(String(order.id || "").length).toBeGreaterThan(0);
  return order;
};

const patchOrderStatus = async (
  request: APIRequestContext,
  token: string,
  orderId: string,
  status: "submitted" | "received" | "in_progress" | "completed" | "cancelled"
) => {
  const response = await request.patch(`${backendUrl}/api/lab/orders/${encodeURIComponent(orderId)}/status`, {
    headers: authHeaders(token),
    data: { status },
  });
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body?.order?.status).toBe(status);
};

const patchOrderPayment = async (
  request: APIRequestContext,
  token: string,
  orderId: string,
  paymentStatus: "pending" | "paid"
) => {
  const response = await request.patch(`${backendUrl}/api/lab/orders/${encodeURIComponent(orderId)}/payment`, {
    headers: authHeaders(token),
    data: { paymentStatus },
  });
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body?.order?.paymentStatus).toBe(paymentStatus);
};

const openSeededOrderFromList = async (page: Page, orderId: string) => {
  await openAuthenticatedLab(page, "/lab/incoming-orders");
  await page.getByRole("button", { name: "All Shed Orders" }).click();
  await expect(page.getByRole("heading", { name: /all shed test orders/i })).toBeVisible();
  await page.getByPlaceholder(/order number, snake, breeder/i).fill(expectedOrderNumber);
  await expect(page.getByText(expectedOrderNumber)).toBeVisible();

  const detailResponsePromise = page.waitForResponse((response) =>
    response.url().startsWith(`${backendUrl}/api/lab/orders/${encodeURIComponent(orderId)}`) &&
    response.request().method() === "GET" &&
    response.status() === 200
  );

  await page.locator("main").getByRole("button", { name: /^open/i }).first().click();
  const detailResponse = await detailResponsePromise;
  const body = await detailResponse.json();
  expect(body?.order?.id).toBe(orderId);

  await expect(page.getByRole("heading", { name: /shed test order details/i })).toBeVisible();
  await expect(page.getByText(expectedOrderNumber)).toBeVisible();
};

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

test("lab order detail opens seeded backend order from order list", async ({ page, request }) => {
  const token = await loginViaApi(request);
  const order = await findSeededOrder(request, token);

  await openSeededOrderFromList(page, order.id);

  await expect(page.getByText("Order Overview")).toBeVisible();
  await expect(page.getByText("Workflow Status").first()).toBeVisible();
  await expect(page.getByText("Payment Status").first()).toBeVisible();
  await expect(page.getByText("Requested Tests").first()).toBeVisible();
  await expect(page.getByText("Status History Timeline")).toBeVisible();
});

test("lab order workflow status can be updated from detail page", async ({ page, request }) => {
  const token = await loginViaApi(request);
  const order = await findSeededOrder(request, token);
  await patchOrderStatus(request, token, order.id, "submitted");

  await openSeededOrderDetail(page, order.id);
  await expect(
    page.locator("section").filter({ hasText: "Order Overview" }).getByText("Submitted").first()
  ).toBeVisible();
  await page.getByPlaceholder(/optional transition note/i).fill("Playwright local E2E status check");

  const statusResponsePromise = page.waitForResponse((response) =>
    response.url().startsWith(`${backendUrl}/api/lab/orders/${encodeURIComponent(order.id)}/status`) &&
    response.request().method() === "PATCH" &&
    response.status() === 200
  );
  await page.getByRole("button", { name: /set sample received/i }).click();
  const statusResponse = await statusResponsePromise;
  const statusBody = await statusResponse.json();
  expect(statusBody?.order?.status).toBe("received");

  await expect(page.getByText("Sample Received").first()).toBeVisible();
});

test("lab order payment can be marked paid from detail page", async ({ page, request }) => {
  const token = await loginViaApi(request);
  const order = await findSeededOrder(request, token);
  await patchOrderPayment(request, token, order.id, "pending");

  await openSeededOrderDetail(page, order.id);
  await expect(page.getByText("Pending").first()).toBeVisible();

  const paymentResponsePromise = page.waitForResponse((response) =>
    response.url().startsWith(`${backendUrl}/api/lab/orders/${encodeURIComponent(order.id)}/payment`) &&
    response.request().method() === "PATCH" &&
    response.status() === 200
  );
  await page.getByRole("button", { name: /mark as paid/i }).click();
  const paymentResponse = await paymentResponsePromise;
  const paymentBody = await paymentResponse.json();
  expect(paymentBody?.order?.paymentStatus).toBe("paid");

  await expect(page.getByText("Paid").first()).toBeVisible();
  await expect(page.getByRole("button", { name: /revert to pending/i })).toBeVisible();
});
