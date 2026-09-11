import type { Request, Response } from "express";
import { calculatePrice, cancelOwnOrderById, createOrder, deleteAllOrders, deleteOrderById, getOrderByIdForUser, listOrdersForUser, setOrderArchived, updateOrderStatus, updateOrderPayment, type OrderArchiveScope } from "../services/orderService";
import { getCertificateSnapshotForUser, listCertificatesForBreeder } from "../services/labCertificateService";
import { saveOrderResult } from "../services/orderResultService";
import { ensureAnimalsPayload } from "../utils/validators";
import { HttpError } from "../utils/errors";

const ORDER_STATUSES = ["submitted", "received", "in_progress", "completed", "cancelled"] as const;
type OrderStatusValue = (typeof ORDER_STATUSES)[number];

export const calculateOrderPrice = async (req: Request, res: Response): Promise<void> => {
  const animals = ensureAnimalsPayload(req.body);
  // The lab is part of the question, not a detail: prices are per-laboratory,
  // so "what does this cost" is unanswerable without knowing which lab.
  const breakdown = await calculatePrice(animals, req.body?.labOrganizationId);
  res.status(200).json(breakdown);
};

export const createLabOrder = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");

  const animals = ensureAnimalsPayload(req.body);
  const order = await createOrder(req.user.id, animals, req.body?.labOrganizationId);
  res.status(201).json({ order });
};

const ARCHIVE_SCOPES = ["active", "archived", "all"] as const;

/**
 * `?archive=` selects which side of the archive to list, defaulting to the work
 * in hand. An unrecognised value is rejected rather than quietly treated as the
 * default, so a typo cannot silently show a laboratory its active queue while it
 * believes it is looking at the archive.
 */
const readArchiveScope = (raw: unknown): OrderArchiveScope => {
  const normalized = String(raw ?? "").trim();
  if (!normalized) return "active";
  if (!(ARCHIVE_SCOPES as readonly string[]).includes(normalized)) {
    throw new HttpError(400, `Invalid archive scope. Allowed: ${ARCHIVE_SCOPES.join(", ")}`);
  }
  return normalized as OrderArchiveScope;
};

export const listOrders = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  const archiveScope = readArchiveScope(req.query["archive"]);
  const orders = await listOrdersForUser(req.user, req.membership, { archiveScope });
  res.status(200).json({ orders });
};

export const archiveOrder = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  const order = await setOrderArchived(req.params.id, true, req.user, req.membership);
  res.status(200).json({ order });
};

export const unarchiveOrder = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  const order = await setOrderArchived(req.params.id, false, req.user, req.membership);
  res.status(200).json({ order });
};

/**
 * The breeder's certificates, listed independently of the orders they came
 * from — which is the point, since a laboratory may since have removed its copy
 * of the order.
 */
export const listMyCertificates = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  const certificates = await listCertificatesForBreeder(req.user);
  res.status(200).json({ certificates });
};

export const getCertificateById = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  const payload = await getCertificateSnapshotForUser(req.params.id, req.user, req.membership);
  res.status(200).json(payload);
};

export const getOrderById = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  const order = await getOrderByIdForUser(req.params.id, req.user, req.membership);
  res.status(200).json({ order });
};

export const patchOrderStatus = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");

  const status = String(req.body?.status || "").trim() as OrderStatusValue;
  if (!ORDER_STATUSES.includes(status)) {
    throw new HttpError(400, `Invalid status. Allowed: ${ORDER_STATUSES.join(", ")}`);
  }

  const order = await updateOrderStatus(req.params.id, status, req.user, req.membership);
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
  const result = await deleteOrderById(req.params.id, req.user, req.membership);
  res.status(200).json(result);
};

export const cancelMyOrder = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  const result = await cancelOwnOrderById(req.params.id, req.user);
  res.status(200).json(result);
};

export const saveOrderResultDraft = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  const saved = await saveOrderResult(req.params.id, req.body, req.user, "draft", req.membership);
  res.status(200).json(saved);
};

export const submitOrderResult = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  const saved = await saveOrderResult(req.params.id, req.body, req.user, "submit", req.membership);
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
    req.user,
    req.membership
  );
  res.status(200).json({ order });
};
