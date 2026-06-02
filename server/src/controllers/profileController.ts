import type { Request, Response } from "express";
import { HttpError } from "../utils/errors";
import { getMyProfile, listPublicBreederProfiles, upsertMyProfile } from "../services/profileService";

export const getCurrentProfile = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  const profile = await getMyProfile(req.user.id);
  res.status(200).json({ profile });
};

export const putCurrentProfile = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  const profile = await upsertMyProfile(req.user.id, req.body || {});
  res.status(200).json({ profile });
};

export const getMarketplaceProfiles = async (_req: Request, res: Response): Promise<void> => {
  const profiles = await listPublicBreederProfiles();
  res.status(200).json({ profiles });
};
