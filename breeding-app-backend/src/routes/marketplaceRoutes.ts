import { Router } from "express";
import {
  addMessage,
  adminMarketplace,
  adminStore,
  blockUser,
  browseListings,
  conversations,
  createConversation,
  createListing,
  createReview,
  createSale,
  editListing,
  favoriteListing,
  listingDetail,
  listingStatus,
  myBlocks,
  myMedia,
  reportMessage,
  saveStore,
  sellerDashboard,
  storeDetail,
  unblockUser,
  uploadMedia,
} from "../controllers/marketplaceController";
import { asyncHandler } from "../middleware/asyncHandler";
import { requireAuth } from "../middleware/auth";
import { marketplaceMessageLimiter, marketplaceMutationLimiter, marketplaceUploadLimiter } from "../middleware/rateLimiters";
import { requireRole } from "../middleware/roles";

export const marketplaceRoutes = Router();

marketplaceRoutes.get("/listings", asyncHandler(browseListings));
marketplaceRoutes.get("/listings/:id", asyncHandler(listingDetail));
marketplaceRoutes.post("/listings", marketplaceMutationLimiter, requireAuth, requireRole("admin", "breeder"), asyncHandler(createListing));
marketplaceRoutes.patch("/listings/:id", marketplaceMutationLimiter, requireAuth, asyncHandler(editListing));
marketplaceRoutes.patch("/listings/:id/status", marketplaceMutationLimiter, requireAuth, asyncHandler(listingStatus));
marketplaceRoutes.post("/listings/:id/favorite", marketplaceMutationLimiter, requireAuth, asyncHandler(favoriteListing));

marketplaceRoutes.get("/stores/:userId", asyncHandler(storeDetail));
marketplaceRoutes.put("/seller/store", marketplaceMutationLimiter, requireAuth, requireRole("admin", "breeder"), asyncHandler(saveStore));
marketplaceRoutes.get("/seller/dashboard", requireAuth, requireRole("admin", "breeder"), asyncHandler(sellerDashboard));

marketplaceRoutes.post("/conversations", marketplaceMessageLimiter, requireAuth, asyncHandler(createConversation));
marketplaceRoutes.get("/conversations", requireAuth, asyncHandler(conversations));
marketplaceRoutes.post("/conversations/:id/messages", marketplaceMessageLimiter, requireAuth, asyncHandler(addMessage));
marketplaceRoutes.post("/messages/:id/report", marketplaceMessageLimiter, requireAuth, asyncHandler(reportMessage));

marketplaceRoutes.post("/uploads", marketplaceUploadLimiter, requireAuth, requireRole("admin", "breeder"), asyncHandler(uploadMedia));
marketplaceRoutes.get("/uploads/me", requireAuth, requireRole("admin", "breeder"), asyncHandler(myMedia));
marketplaceRoutes.post("/blocks", marketplaceMessageLimiter, requireAuth, asyncHandler(blockUser));
marketplaceRoutes.get("/blocks", requireAuth, asyncHandler(myBlocks));
marketplaceRoutes.delete("/blocks/:blockedUserId", marketplaceMessageLimiter, requireAuth, asyncHandler(unblockUser));

marketplaceRoutes.post("/sales", marketplaceMutationLimiter, requireAuth, requireRole("admin", "breeder"), asyncHandler(createSale));
marketplaceRoutes.post("/reviews", marketplaceMutationLimiter, requireAuth, asyncHandler(createReview));

marketplaceRoutes.get("/admin", requireAuth, requireRole("admin"), asyncHandler(adminMarketplace));
marketplaceRoutes.patch("/admin/stores/:userId", marketplaceMutationLimiter, requireAuth, requireRole("admin"), asyncHandler(adminStore));
