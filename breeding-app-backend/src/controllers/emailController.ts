import type { Request, Response } from "express";
import { HttpError } from "../utils/errors";
import { getMyEmailHistory } from "../email/emailHistoryService";
import { listPreferences, setPreference } from "../email/preferencesService";

export const getMyEmailHistoryHandler = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  const history = await getMyEmailHistory(req.user.id);
  res.status(200).json({ history });
};

export const getMyEmailPreferences = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  const preferences = await listPreferences(req.user.id);
  res.status(200).json({ preferences });
};

export const putMyEmailPreference = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  const { category } = req.params;
  const { enabled, timezone, leadTimeMinutes, digest } = req.body ?? {};
  const preference = await setPreference(req.user.id, category, { enabled, timezone, leadTimeMinutes, digest });
  res.status(200).json({ preference });
};
