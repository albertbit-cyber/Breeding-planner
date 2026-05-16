import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { signAuthToken } from "../utils/jwt";

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
  getOrderByIdForUser,
  listOrdersForUser,
  updateOrderPayment,
  updateOrderStatus,
} from "../services/orderService";

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
});

