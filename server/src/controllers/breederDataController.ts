import type { Request, Response } from "express";
import { HttpError } from "../utils/errors";
import { listBreederSnapshot, upsertBreederSnapshot } from "../services/breederDataService";

export const getBreederSnapshot = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  const snapshot = await listBreederSnapshot(req.user.id);
  res.status(200).json(snapshot);
};

export const putBreederSnapshot = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  const snapshot = await upsertBreederSnapshot(req.user.id, req.body || {});
  res.status(200).json(snapshot);
};
