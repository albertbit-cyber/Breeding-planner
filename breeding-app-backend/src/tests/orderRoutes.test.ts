import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { signAuthToken } from "../utils/jwt";
import { HttpError } from "../utils/errors";

vi.mock("../services/orderService", () => ({
  calculatePrice: vi.fn(),
  createOrder: vi.fn(),
  deleteAllOrders: vi.fn(),
  deleteOrderById: vi.fn(),
  getOrderByIdForUser: vi.fn(),
  listOrdersForUser: vi.fn(),
  updateOrderPayment: vi.fn(),
  updateOrderStatus: vi.fn(),
}));

vi.mock("../services/orderResultService", () => ({
  saveOrderResult: vi.fn(),
}));

import { app } from "../app";
import {
  createOrder,
  getOrderByIdForUser,
  listOrdersForUser,
  updateOrderPayment,
  updateOrderStatus,
} from "../services/orderService";
import { saveOrderResult } from "../services/orderResultService";

const tokenFor = (
  role: "admin" | "breeder" | "buyer" | "lab_staff" = "breeder",
  persistedRole?: "lab"
) =>
  signAuthToken({
    sub: `${role}-1`,
    email: `${role}@example.com`,
    role,
    persistedRole,
  });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("lab order routes", () => {
  it("lists orders for an authenticated breeder", async () => {
    vi.mocked(listOrdersForUser).mockResolvedValue([{ id: "order-1" }] as any);

    const res = await request(app)
      .get("/api/lab/orders")
      .set("Authorization", `Bearer ${tokenFor("breeder")}`);

    expect(res.status).toBe(200);
    expect(res.body.orders).toEqual([{ id: "order-1" }]);
    expect(listOrdersForUser).toHaveBeenCalledWith(
      expect.objectContaining({ id: "breeder-1", role: "breeder" })
    );
  });

  it("supports legacy persisted lab role tokens for lab order reads", async () => {
    vi.mocked(getOrderByIdForUser).mockResolvedValue({ id: "order-1" } as any);

    const res = await request(app)
      .get("/api/lab/orders/order-1")
      .set("Authorization", `Bearer ${tokenFor("lab_staff", "lab")}`);

    expect(res.status).toBe(200);
    expect(res.body.order).toEqual({ id: "order-1" });
    expect(getOrderByIdForUser).toHaveBeenCalledWith(
      "order-1",
      expect.objectContaining({ role: "lab_staff", persistedRole: "lab" })
    );
  });

  it("rejects buyers from lab order reads", async () => {
    const res = await request(app)
      .get("/api/lab/orders")
      .set("Authorization", `Bearer ${tokenFor("buyer")}`);

    expect(res.status).toBe(403);
    expect(listOrdersForUser).not.toHaveBeenCalled();
  });

  it("creates a lab order for an authenticated breeder", async () => {
    const payload = {
      animals: [
        {
          animalId: "animal-1",
          animalName: "Athena",
          selectedTestIds: ["test-1"],
        },
      ],
    };
    vi.mocked(createOrder).mockResolvedValue({ id: "order-1", status: "submitted" } as any);

    const res = await request(app)
      .post("/api/lab/orders")
      .set("Authorization", `Bearer ${tokenFor("breeder")}`)
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body.order).toEqual({ id: "order-1", status: "submitted" });
    expect(createOrder).toHaveBeenCalledWith("breeder-1", payload.animals);
  });

  it("rejects lab staff from breeder order creation", async () => {
    const res = await request(app)
      .post("/api/lab/orders")
      .set("Authorization", `Bearer ${tokenFor("lab_staff")}`)
      .send({ animals: [{ animalId: "animal-1", selectedTestIds: ["test-1"] }] });

    expect(res.status).toBe(403);
    expect(createOrder).not.toHaveBeenCalled();
  });

  it("validates breeder order creation payload before calling the service", async () => {
    const res = await request(app)
      .post("/api/lab/orders")
      .set("Authorization", `Bearer ${tokenFor("breeder")}`)
      .send({ animals: [] });

    expect(res.status).toBe(400);
    expect(createOrder).not.toHaveBeenCalled();
  });

  it("validates status updates before calling the service", async () => {
    const res = await request(app)
      .patch("/api/lab/orders/order-1/status")
      .set("Authorization", `Bearer ${tokenFor("lab_staff")}`)
      .send({ status: "not-a-status" });

    expect(res.status).toBe(400);
    expect(updateOrderStatus).not.toHaveBeenCalled();
  });

  it("updates order status for lab staff", async () => {
    vi.mocked(updateOrderStatus).mockResolvedValue({ id: "order-1", status: "received" } as any);

    const res = await request(app)
      .patch("/api/lab/orders/order-1/status")
      .set("Authorization", `Bearer ${tokenFor("lab_staff")}`)
      .send({ status: "received" });

    expect(res.status).toBe(200);
    expect(res.body.order).toEqual({ id: "order-1", status: "received" });
    expect(updateOrderStatus).toHaveBeenCalledWith(
      "order-1",
      "received",
      expect.objectContaining({ role: "lab_staff" })
    );
  });

  it("requires paymentStatus before calling payment update service", async () => {
    const res = await request(app)
      .patch("/api/lab/orders/order-1/payment")
      .set("Authorization", `Bearer ${tokenFor("lab_staff")}`)
      .send({});

    expect(res.status).toBe(400);
    expect(updateOrderPayment).not.toHaveBeenCalled();
  });

  it("saves a result draft for lab staff", async () => {
    const payload = {
      orderId: "order-1",
      testCode: "E2E-DRAFT-1",
      animalResults: [
        {
          animalId: "animal-1",
          items: [{ orderedTestKey: "order-1:animal-1:1", resultStatus: "heterozygous" }],
        },
      ],
    };
    vi.mocked(saveOrderResult).mockResolvedValue({
      result: { id: "result-1", status: "running" },
      results: [{ id: "result-1", status: "running" }],
      order: { id: "order-1", status: "in_progress" },
      mode: "draft",
    } as any);

    const res = await request(app)
      .post("/api/lab/orders/order-1/results/draft")
      .set("Authorization", `Bearer ${tokenFor("lab_staff")}`)
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.mode).toBe("draft");
    expect(res.body.order.status).toBe("in_progress");
    expect(saveOrderResult).toHaveBeenCalledWith(
      "order-1",
      payload,
      expect.objectContaining({ id: "lab_staff-1", role: "lab_staff" }),
      "draft"
    );
  });

  it("submits a completed result for lab staff", async () => {
    const payload = {
      orderId: "order-1",
      testCode: "E2E-SUBMIT-1",
      animalResults: [
        {
          animalId: "animal-1",
          items: [{ orderedTestKey: "order-1:animal-1:1", resultStatus: "visual" }],
        },
      ],
    };
    vi.mocked(saveOrderResult).mockResolvedValue({
      result: { id: "result-2", status: "completed" },
      results: [{ id: "result-2", status: "completed" }],
      order: { id: "order-1", status: "completed" },
      mode: "submit",
    } as any);

    const res = await request(app)
      .post("/api/lab/orders/order-1/results/submit")
      .set("Authorization", `Bearer ${tokenFor("lab_staff")}`)
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.mode).toBe("submit");
    expect(res.body.result.status).toBe("completed");
    expect(saveOrderResult).toHaveBeenCalledWith(
      "order-1",
      payload,
      expect.objectContaining({ id: "lab_staff-1", role: "lab_staff" }),
      "submit"
    );
  });

  it("requires authentication before saving a result draft", async () => {
    const res = await request(app)
      .post("/api/lab/orders/order-1/results/draft")
      .send({ testCode: "E2E-DRAFT-2" });

    expect(res.status).toBe(401);
    expect(saveOrderResult).not.toHaveBeenCalled();
  });

  it("rejects breeders from result submission routes", async () => {
    const res = await request(app)
      .post("/api/lab/orders/order-1/results/submit")
      .set("Authorization", `Bearer ${tokenFor("breeder")}`)
      .send({ testCode: "E2E-SUBMIT-2" });

    expect(res.status).toBe(403);
    expect(saveOrderResult).not.toHaveBeenCalled();
  });

  it("returns service validation errors for invalid result input", async () => {
    vi.mocked(saveOrderResult).mockRejectedValue(new HttpError(400, "Either animalResults or items is required."));

    const res = await request(app)
      .post("/api/lab/orders/order-1/results/draft")
      .set("Authorization", `Bearer ${tokenFor("lab_staff")}`)
      .send({ testCode: "E2E-DRAFT-3" });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Either animalResults or items is required.");
  });

  it("returns missing order errors from result submission", async () => {
    vi.mocked(saveOrderResult).mockRejectedValue(new HttpError(404, "Order not found."));

    const res = await request(app)
      .post("/api/lab/orders/missing-order/results/submit")
      .set("Authorization", `Bearer ${tokenFor("lab_staff")}`)
      .send({ testCode: "E2E-SUBMIT-3", animalResults: [{ animalId: "animal-1", items: [] }] });

    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Order not found.");
  });
});
