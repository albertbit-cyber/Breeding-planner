import type { Request, Response } from "express";
import { HttpError } from "../utils/errors";
import {
  addPendingShedTest,
  listPendingShedTests,
  quotePendingShedTests,
  removePendingShedTest,
  submitPendingShedBatch,
  updatePendingShedTest,
} from "../services/pendingShedService";

/**
 * The saved shed-test queue. Every handler scopes to `req.user.id`: the queue is personal to a
 * breeder, and the id in a path is never trusted on its own to say whose row it is.
 */

const optionalIdList = (value: unknown): string[] | undefined => {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) throw new HttpError(400, "pendingItemIds must be an array of ids.");
  return value.map((entry) => String(entry ?? "").trim()).filter(Boolean);
};

export const getPendingShedTests = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  const items = await listPendingShedTests(req.user.id);
  res.status(200).json({ items });
};

export const postPendingShedTest = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  const item = await addPendingShedTest(req.user.id, req.body || {});
  res.status(201).json({ item });
};

export const patchPendingShedTest = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  const item = await updatePendingShedTest(req.user.id, req.params.id, req.body || {});
  res.status(200).json({ item });
};

export const deletePendingShedTest = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  await removePendingShedTest(req.user.id, req.params.id);
  res.status(204).send();
};

export const postPendingShedQuote = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  const quote = await quotePendingShedTests(req.user.id, optionalIdList(req.body?.pendingItemIds));
  res.status(200).json({ quote });
};

export const postPendingShedSubmit = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  const result = await submitPendingShedBatch(req.user.id, optionalIdList(req.body?.pendingItemIds));
  res.status(201).json(result);
};
