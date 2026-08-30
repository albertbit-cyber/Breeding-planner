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
    expect(orders.some((order: { orderNumber?: string }) => order?.orderNumber === expectedOrderNumber)).toBeTruthy();

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
      ? breederOrder.results.filter((result: { status?: string }) => result?.status === "completed")
      : [];

    expect(breederOrder.status).toBe("completed");
    expect(completedResults.some((result: { testCode?: string }) => result?.testCode === testCode)).toBeTruthy();
  });

  test("breeder chooses a laboratory, then orders from its catalogue", async ({ request }) => {
    const breederToken = await loginBreederViaApi(request);

    // Choosing a laboratory now comes first. There is no platform-wide catalogue
    // to order from — tests and prices belong to whichever laboratory is picked.
    const directoryResponse = await request.get(`${backendUrl}/api/lab/directory`, {
      headers: authHeaders(breederToken),
    });
    expect(directoryResponse.status()).toBe(200);
    const directoryBody = await directoryResponse.json();
    const labs = Array.isArray(directoryBody?.labs) ? directoryBody.labs : [];
    expect(labs.length).toBeGreaterThan(0);
    const labOrganizationId = String(labs[0]?.organizationId || "");
    expect(labOrganizationId.length).toBeGreaterThan(0);

    const labResponse = await request.get(
      `${backendUrl}/api/lab/directory/${encodeURIComponent(labOrganizationId)}`,
      { headers: authHeaders(breederToken) }
    );
    expect(labResponse.status()).toBe(200);
    const labBody = await labResponse.json();
    const offerings = Array.isArray(labBody?.offerings) ? labBody.offerings : [];
    const firstTest = offerings.find((entry: { id?: string }) => entry?.id);
    expect(firstTest?.id).toBeTruthy();
    // Everything offered belongs to the laboratory that was chosen.
    expect(firstTest.organizationId).toBe(labOrganizationId);

    const animalId = `breeder-e2e-${Date.now()}`;
    const createResponse = await request.post(`${backendUrl}/api/lab/orders`, {
      headers: authHeaders(breederToken),
      data: {
        labOrganizationId,
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
    expect(orders.some((order: { id?: string }) => order?.id === createdOrderId)).toBeTruthy();
  });

  test("an order without a laboratory is refused", async ({ request }) => {
    const breederToken = await loginBreederViaApi(request);

    const response = await request.post(`${backendUrl}/api/lab/orders`, {
      headers: authHeaders(breederToken),
      data: {
        animals: [
          { animalId: `no-lab-${Date.now()}`, animalName: "Unrouted", selectedTestIds: ["clown"] },
        ],
      },
    });

    // There is no default laboratory to fall back to, and guessing one would
    // send a breeder's samples to a laboratory they did not choose.
    expect(response.status()).toBe(400);
  });
});
