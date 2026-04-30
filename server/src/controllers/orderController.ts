import type { Request, Response } from "express";
import { calculatePrice, createOrder, deleteAllOrders, deleteOrderById, getOrderByIdForUser, listOrdersForUser, updateOrderStatus, updateOrderPayment } from "../services/orderService";
import { saveOrderResult } from "../services/orderResultService";
import { ensureAnimalsPayload } from "../utils/validators";
import { HttpError } from "../utils/errors";

const ORDER_STATUSES = ["submitted", "received", "in_progress", "completed", "cancelled"] as const;
type OrderStatusValue = (typeof ORDER_STATUSES)[number];

export const calculateOrderPrice = async (req: Request, res: Response): Promise<void> => {
  const animals = ensureAnimalsPayload(req.body);
  const breakdown = await calculatePrice(animals);
  res.status(200).json(breakdown);
};

export const createLabOrder = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");

  const animals = ensureAnimalsPayload(req.body);
  const order = await createOrder(req.user.id, animals);
  res.status(201).json({ order });
};

export const listOrders = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  const orders = await listOrdersForUser(req.user);
  res.status(200).json({ orders });
};

export const getOrderById = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  const order = await getOrderByIdForUser(req.params.id, req.user);
  res.status(200).json({ order });
};

export const patchOrderStatus = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");

  const status = String(req.body?.status || "").trim() as OrderStatusValue;
  if (!ORDER_STATUSES.includes(status)) {
    throw new HttpError(400, `Invalid status. Allowed: ${ORDER_STATUSES.join(", ")}`);
  }

  const order = await updateOrderStatus(req.params.id, status, req.user);
  res.status(200).json({ order });
};

export const removeAllOrders = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  if (req.query["confirm"] !== "true") {
    throw new HttpError(400, "Add ?confirm=true to confirm bulk deletion.");
  }
  const result = await deleteAllOrders(req.user);
  res.status(200).json(result);
};

export const removeOrder = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  const result = await deleteOrderById(req.params.id, req.user);
  res.status(200).json(result);
};

export const saveOrderResultDraft = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  const saved = await saveOrderResult(req.params.id, req.body, req.user, "draft");
  res.status(200).json(saved);
};

export const submitOrderResult = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  const saved = await saveOrderResult(req.params.id, req.body, req.user, "submit");
  res.status(200).json(saved);
};

export const patchOrderPayment = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");

  const paymentStatus = String(req.body?.paymentStatus || "").trim();
  const paymentRef = req.body?.paymentRef !== undefined ? String(req.body.paymentRef).trim() : undefined;

  if (!paymentStatus) {
    throw new HttpError(400, "paymentStatus is required.");
  }

  const order = await updateOrderPayment(
    req.params.id,
    { paymentStatus: paymentStatus as any, paymentRef },
    req.user
  );
  res.status(200).json({ order });
};
