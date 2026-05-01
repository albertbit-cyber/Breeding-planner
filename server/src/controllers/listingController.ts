import type { Request, Response } from "express";
import { HttpError } from "../utils/errors";
import { listMyListings, listPublicMarketplaceListings, replaceMyListings } from "../services/listingService";

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
