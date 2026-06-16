import type { Request, Response } from "express";
import { HttpError } from "../utils/errors";
import {
  getFemaleReproductiveProfile,
  addManualLock,
  upsertCycleManual,
} from "../services/reproductiveCycleService";

export const getReproductiveProfile = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  const { femaleAppId } = req.params;
  if (!femaleAppId) throw new HttpError(400, "femaleAppId is required");
  const profile = await getFemaleReproductiveProfile(femaleAppId, req.user.id);
  res.status(200).json(profile);
};

export const postManualLock = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  const { femaleAppId } = req.params;
  const { lockDate, cycleId, notes } = req.body ?? {};
  if (!femaleAppId) throw new HttpError(400, "femaleAppId is required");
  if (!lockDate || !/^\d{4}-\d{2}-\d{2}$/.test(lockDate)) throw new HttpError(400, "lockDate must be YYYY-MM-DD");
  const lock = await addManualLock(femaleAppId, req.user.id, lockDate, cycleId, notes);
  res.status(201).json(lock);
};

export const putCycleManual = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  const { femaleAppId } = req.params;
  if (!femaleAppId) throw new HttpError(400, "femaleAppId is required");
  const body = req.body ?? {};
  if (!body.season || typeof body.season !== "number") throw new HttpError(400, "season (number) is required");
  const cycle = await upsertCycleManual(femaleAppId, req.user.id, body);
  res.status(200).json(cycle);
};
