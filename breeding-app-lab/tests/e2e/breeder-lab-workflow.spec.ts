import { expect, test } from "@playwright/test";
import { backendUrl, expectedOrderNumber, loginBreederViaApi, loginViaApi } from "./helpers";
import {
  authHeaders,
  findSeededOrder,
  getOrderDetails,
  resetSeededOrderForResultEntry,
  submitCompleteNegativeResult,
} from "./order-test-helpers";

test.describe("breeder lab workflow API contract", () => {
  test("breeder can list and open only breeder-visible lab order details", async ({ request }) => {
    const labToken = await loginViaApi(request);
    const seededOrder = await findSeededOrder(request, labToken);
    const breederToken = await loginBreederViaApi(request);

    const listResponse = await request.get(`${backendUrl}/api/lab/orders`, {
      headers: authHeaders(breederToken),
    });
    expect(listResponse.status()).toBe(200);
    const listBody = await listResponse.json();
    const orders = Array.isArray(listBody?.orders) ? listBody.orders : [];
    expect(orders.length).toBeGreaterThan(0);
    expect(orders.some((order) => order?.orderNumber === expectedOrderNumber)).toBeTruthy();

    const detailResponse = await request.get(`${backendUrl}/api/lab/orders/${encodeURIComponent(seededOrder.id)}`, {
      headers: authHeaders(breederToken),
    });
    expect(detailResponse.status()).toBe(200);
    const detailBody = await detailResponse.json();
    expect(detailBody?.order?.id).toBe(seededOrder.id);
    expect(detailBody?.order?.orderNumber).toBe(expectedOrderNumber);
    expect(Array.isArray(detailBody?.order?.animals)).toBeTruthy();
  });

  test("breeder can see completed result data needed for certificate access", async ({ request }) => {
    const labToken = await loginViaApi(request);
    const order = await resetSeededOrderForResultEntry(request, labToken, "in_progress");
    const testCode = `BREEDER-E2E-${Date.now()}`;
    await submitCompleteNegativeResult(request, labToken, order.id, testCode);

    const breederToken = await loginBreederViaApi(request);
    const breederOrder = await getOrderDetails(request, breederToken, order.id);
    const completedResults = Array.isArray(breederOrder.results)
      ? breederOrder.results.filter((result) => result?.status === "completed")
      : [];

    expect(breederOrder.status).toBe("completed");
    expect(completedResults.some((result) => result?.testCode === testCode)).toBeTruthy();
  });

  test("breeder can create a lab order and see it in their own order list", async ({ request }) => {
    const breederToken = await loginBreederViaApi(request);
    const catalogResponse = await request.get(`${backendUrl}/api/lab/tests/catalog?breederView=true`, {
      headers: authHeaders(breederToken),
    });
    expect(catalogResponse.status()).toBe(200);
    const catalogBody = await catalogResponse.json();
    const tests = Array.isArray(catalogBody?.tests) ? catalogBody.tests : [];
    const firstTest = tests.find((entry) => entry?.id);
    expect(firstTest?.id).toBeTruthy();

    const animalId = `breeder-e2e-${Date.now()}`;
    const createResponse = await request.post(`${backendUrl}/api/lab/orders`, {
      headers: authHeaders(breederToken),
      data: {
        animals: [
          {
            animalId,
            animalName: "Breeder E2E Animal",
            selectedTestIds: [firstTest.id],
          },
        ],
      },
    });
    expect(createResponse.status()).toBe(201);
    const createBody = await createResponse.json();
    const createdOrderId = String(createBody?.order?.id || "");
    expect(createdOrderId.length).toBeGreaterThan(0);
    expect(createBody?.order?.status).toBe("submitted");

    const listResponse = await request.get(`${backendUrl}/api/lab/orders`, {
      headers: authHeaders(breederToken),
    });
    expect(listResponse.status()).toBe(200);
    const listBody = await listResponse.json();
    const orders = Array.isArray(listBody?.orders) ? listBody.orders : [];
    expect(orders.some((order) => order?.id === createdOrderId)).toBeTruthy();
  });
});
