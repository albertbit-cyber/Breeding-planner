import base from "@playwright/test";
import {
  expect,
  backendUrl,
  authHeaders,
  loginBreederViaApi,
  loginLabViaApi,
  createBreederOrderForSnake,
  openAuthenticatedBreeder,
  patchOrderStatus,
} from "./helpers.js";

const test = base;

test("breeder can cancel a submitted shed test order from the Shed Test Terminal", async ({ page, request }) => {
  const { token } = await loginBreederViaApi(request);
  const order = await createBreederOrderForSnake(request, token);

  await openAuthenticatedBreeder(page);
  await page.getByRole("button", { name: /Shed Test Terminal/i }).first().click();

  const orderCard = page.locator("div.rounded-lg.border.bg-white", { hasText: order.orderNumber });
  await expect(orderCard).toBeVisible();

  await orderCard.getByRole("button", { name: /^Cancel Order$/i }).click();
  await expect(orderCard.getByText(/delete all its data/i)).toBeVisible();
  await orderCard.getByRole("button", { name: /Yes, delete/i }).click();

  await expect(page.getByText(order.orderNumber)).not.toBeVisible();

  const res = await request.get(`${backendUrl}/api/lab/orders/${order.id}`, {
    headers: authHeaders(token),
  });
  expect(res.status()).toBe(404);
});

test("cancel order is not offered once the lab has received the sample", async ({ page, request }) => {
  const { token: breederToken } = await loginBreederViaApi(request);
  const { token: labToken } = await loginLabViaApi(request);
  const order = await createBreederOrderForSnake(request, breederToken);
  await patchOrderStatus(request, labToken, order.id, "received");

  await openAuthenticatedBreeder(page);
  await page.getByRole("button", { name: /Shed Test Terminal/i }).first().click();
  const orderCard = page.locator("div.rounded-lg.border.bg-white", { hasText: order.orderNumber });
  await expect(orderCard).toBeVisible();
  await expect(orderCard.getByRole("button", { name: /^Cancel Order$/i })).toHaveCount(0);

  const res = await request.delete(`${backendUrl}/api/lab/orders/${order.id}/cancel`, {
    headers: authHeaders(breederToken),
  });
  expect(res.status()).toBe(409);
});
