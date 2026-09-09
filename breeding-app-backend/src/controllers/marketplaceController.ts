import type { Request, Response } from "express";
import { HttpError } from "../utils/errors";
import {
  acceptMarketplaceOffer,
  addMarketplaceMessage,
  adminUpdateStore,
  createMarketplaceConversation,
  createMarketplaceListing,
  createMarketplaceReview,
  getMarketplaceComparables,
  getMarketplaceConversation,
  getMarketplaceListing,
  getMarketplaceStore,
  listAdminMarketplace,
  listMarketplaceConversations,
  listMarketplaceListings,
  listMarketplaceFavorites,
  listMarketplaceReviews,
  listReviewableSales,
  listSellableAnimals,
  listSellerDashboard,
  markMarketplaceConversationRead,
  toggleMarketplaceFavorite,
  updateMarketplaceListing,
  updateMarketplaceListingStatus,
  upsertMarketplaceSale,
  upsertMarketplaceStore,
} from "../services/marketplaceService";
import {
  blockMarketplaceUser,
  createMarketplaceMediaUpload,
  listMyMarketplaceBlocks,
  listMyMarketplaceMedia,
  readMarketplaceMediaObject,
  reportMarketplaceMessage,
  unblockMarketplaceUser,
} from "../services/marketplaceRuntimeService";

export const browseListings = async (req: Request, res: Response): Promise<void> => {
  res.status(200).json(await listMarketplaceListings(req.query, req.user || null));
};

export const listingDetail = async (req: Request, res: Response): Promise<void> => {
  res.status(200).json(await getMarketplaceListing(req.params.id, req.user || null));
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

export const uploadMedia = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  res.status(201).json(await createMarketplaceMediaUpload(req.user, req.body || {}));
};

export const myMedia = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  res.status(200).json(await listMyMarketplaceMedia(req.user));
};

export const reportMessage = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  res.status(201).json(await reportMarketplaceMessage(req.user, req.params.id, req.body || {}));
};

export const blockUser = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  res.status(201).json(await blockMarketplaceUser(req.user, req.body || {}));
};

export const unblockUser = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  res.status(200).json(await unblockMarketplaceUser(req.user, req.params.blockedUserId));
};

export const myBlocks = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  res.status(200).json(await listMyMarketplaceBlocks(req.user));
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

export const listingComparables = async (req: Request, res: Response): Promise<void> => {
  res.status(200).json(await getMarketplaceComparables(req.params.id));
};

export const conversationDetail = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  res.status(200).json(await getMarketplaceConversation(req.user, req.params.id));
};

export const conversationRead = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  res.status(200).json(await markMarketplaceConversationRead(req.user, req.params.id));
};

export const acceptOffer = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  res.status(200).json(await acceptMarketplaceOffer(req.user, req.params.id, req.body || {}));
};

export const storeReviews = async (req: Request, res: Response): Promise<void> => {
  res.status(200).json(await listMarketplaceReviews(req.params.userId));
};

export const reviewableSales = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  res.status(200).json(await listReviewableSales(req.user));
};

export const mediaObject = async (req: Request, res: Response): Promise<void> => {
  const { buffer, mimeType } = await readMarketplaceMediaObject(req.params.id, req.user || null);
  res.setHeader("Content-Type", mimeType);
  res.setHeader("Cache-Control", "public, max-age=86400, immutable");
  res.setHeader("Content-Length", String(buffer.length));
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.status(200).end(buffer);
};

export const sellerAnimals = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  res.status(200).json(await listSellableAnimals(req.user));
};

export const myFavorites = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  res.status(200).json(await listMarketplaceFavorites(req.user));
};
