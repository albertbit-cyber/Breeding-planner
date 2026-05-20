import { expect, type APIRequestContext } from "@playwright/test";
import { createHash } from "node:crypto";
import { backendUrl, expectedOrderNumber } from "./helpers";

export type BackendOrder = {
  id: string;
  orderNumber?: string;
  status?: string;
  paymentStatus?: string;
  animals?: Array<{
    animalId?: string;
    tests?: Array<{ testId?: string; testNameSnapshot?: string }>;
  }>;
  results?: Array<{ id?: string; testCode?: string; status?: string }>;
};

export const authHeaders = (token: string) => ({
  Authorization: `Bearer ${token}`,
});

export const findSeededOrder = async (request: APIRequestContext, token: string): Promise<BackendOrder> => {
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

export const patchOrderStatus = async (
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

export const patchOrderPayment = async (
  request: APIRequestContext,
  token: string,
  orderId: string,
  paymentStatus: "pending" | "invoiced" | "paid" | "waived"
) => {
  const response = await request.patch(`${backendUrl}/api/lab/orders/${encodeURIComponent(orderId)}/payment`, {
    headers: authHeaders(token),
    data: { paymentStatus },
  });
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body?.order?.paymentStatus).toBe(paymentStatus);
};

export const resetSeededOrderForResultEntry = async (
  request: APIRequestContext,
  token: string,
  status: "received" | "in_progress" = "received"
): Promise<BackendOrder> => {
  const order = await findSeededOrder(request, token);
  await patchOrderStatus(request, token, order.id, status);
  await patchOrderPayment(request, token, order.id, "paid");
  return { ...order, status, paymentStatus: "paid" };
};

const sanitizeKeyPart = (value: string): string =>
  String(value || "")
    .trim()
    .replace(/[^A-Za-z0-9-]/g, "_") || "order";

const stableQrToken = (seed: string): string =>
  createHash("sha256").update(String(seed || "").trim() || "shared-order-label").digest("hex");

export const getOrderDetails = async (
  request: APIRequestContext,
  token: string,
  orderId: string
): Promise<BackendOrder> => {
  const response = await request.get(`${backendUrl}/api/lab/orders/${encodeURIComponent(orderId)}`, {
    headers: authHeaders(token),
  });
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body?.order?.id).toBe(orderId);
  return body.order;
};

export const submitCompleteNegativeResult = async (
  request: APIRequestContext,
  token: string,
  orderId: string,
  testCode: string
) => {
  const order = await getOrderDetails(request, token, orderId);
  const animals = Array.isArray(order.animals) ? order.animals : [];
  expect(animals.length).toBeGreaterThan(0);

  const animalResults = animals.map((animal) => {
    const animalId = String(animal?.animalId || "").trim();
    const tests = Array.isArray(animal?.tests) ? animal.tests : [];
    expect(animalId.length).toBeGreaterThan(0);
    expect(tests.length).toBeGreaterThan(0);
    return {
      animalId,
      items: tests.map((test, index) => ({
        orderedTestKey: `${orderId}:${sanitizeKeyPart(animalId)}:${index + 1}`,
        geneName: String(test?.testNameSnapshot || test?.testId || "").trim() || `Test ${index + 1}`,
        resultStatus: "not_detected",
      })),
    };
  });

  const response = await request.post(`${backendUrl}/api/lab/orders/${encodeURIComponent(orderId)}/results/submit`, {
    headers: authHeaders(token),
    data: {
      orderId,
      testCode,
      method: "PCR",
      animalResults,
      summary: "Playwright certificate-ready result",
    },
  });
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body?.mode).toBe("submit");
  expect(body?.order?.status).toBe("completed");
  expect(String(body?.result?.testCode || "")).toBe(testCode);
  return body;
};

export const getFirstSyntheticSample = async (
  request: APIRequestContext,
  token: string,
  orderId: string
) => {
  const order = await getOrderDetails(request, token, orderId);
  const animal = Array.isArray(order.animals) ? order.animals[0] : null;
  const animalId = String(animal?.animalId || "").trim();
  expect(animalId.length).toBeGreaterThan(0);

  const sampleId = `${sanitizeKeyPart(orderId)}-sample-1`;
  const qrToken = stableQrToken(`${orderId}:${animalId}:${sampleId}`);
  const rawQrPayload = JSON.stringify({ v: 1, t: qrToken });

  return {
    order,
    animalId,
    sampleId,
    qrToken,
    rawQrPayload,
  };
};
