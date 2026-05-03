import type { Request, Response } from "express";
import { HttpError } from "../utils/errors";
import {
  addMarketplaceMessage,
  adminUpdateStore,
  createMarketplaceConversation,
  createMarketplaceListing,
  createMarketplaceReview,
  getMarketplaceListing,
  getMarketplaceStore,
  listAdminMarketplace,
  listMarketplaceConversations,
  listMarketplaceListings,
  listSellerDashboard,
  toggleMarketplaceFavorite,
  updateMarketplaceListing,
  updateMarketplaceListingStatus,
  upsertMarketplaceSale,
  upsertMarketplaceStore,
} from "../services/marketplaceService";

export const browseListings = async (req: Request, res: Response): Promise<void> => {
  res.status(200).json(await listMarketplaceListings(req.query));
};

export const listingDetail = async (req: Request, res: Response): Promise<void> => {
  res.status(200).json(await getMarketplaceListing(req.params.id));
};

export const sellerDashboard = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  res.status(200).json(await listSellerDashboard(req.user));
};

export const saveStore = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  res.status(200).json(await upsertMarketplaceStore(req.user, req.body || {}));
};

export const storeDetail = async (req: Request, res: Response): Promise<void> => {
  res.status(200).json(await getMarketplaceStore(req.params.userId));
};

export const createListing = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  res.status(201).json(await createMarketplaceListing(req.user, req.body || {}));
};

export const editListing = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  res.status(200).json(await updateMarketplaceListing(req.user, req.params.id, req.body || {}));
};

export const listingStatus = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  res.status(200).json(await updateMarketplaceListingStatus(req.user, req.params.id, req.body || {}));
};

export const favoriteListing = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  res.status(200).json(await toggleMarketplaceFavorite(req.user, req.params.id));
};

export const createConversation = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  res.status(201).json(await createMarketplaceConversation(req.user, req.body || {}));
};

export const conversations = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  res.status(200).json(await listMarketplaceConversations(req.user));
};

export const addMessage = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  res.status(201).json(await addMarketplaceMessage(req.user, req.params.id, req.body || {}));
};

export const createSale = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  res.status(201).json(await upsertMarketplaceSale(req.user, req.body || {}));
};

export const createReview = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  res.status(201).json(await createMarketplaceReview(req.user, req.body || {}));
};

export const adminMarketplace = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  res.status(200).json(await listAdminMarketplace(req.user));
};

export const adminStore = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  res.status(200).json(await adminUpdateStore(req.user, req.params.userId, req.body || {}));
};
