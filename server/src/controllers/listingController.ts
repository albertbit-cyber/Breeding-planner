import type { Request, Response } from "express";
import { HttpError } from "../utils/errors";
import {
  listModerationListings,
  listMyListings,
  listPublicMarketplaceListings,
  replaceMyListings,
  updateListingModerationStatus,
} from "../services/listingService";

export const getMyListings = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  const listings = await listMyListings(req.user.id);
  res.status(200).json({ listings });
};

export const putMyListings = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  const listings = await replaceMyListings(req.user.id, req.body || {});
  res.status(200).json({ listings });
};

export const getMarketplaceListings = async (_req: Request, res: Response): Promise<void> => {
  const listings = await listPublicMarketplaceListings();
  res.status(200).json({ listings });
};

export const getModerationListings = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  const listings = await listModerationListings(req.user);
  res.status(200).json({ listings });
};

export const patchListingStatus = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  const listing = await updateListingModerationStatus(req.user, req.params.id, req.body?.status);
  res.status(200).json({ listing });
};
