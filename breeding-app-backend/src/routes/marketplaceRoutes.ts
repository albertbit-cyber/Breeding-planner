import { Router } from "express";
import {
  acceptOffer,
  addMessage,
  adminMarketplace,
  adminStore,
  blockUser,
  browseListings,
  conversationDetail,
  conversationRead,
  conversations,
  createConversation,
  createListing,
  createReview,
  createSale,
  editListing,
  favoriteListing,
  listingComparables,
  listingDetail,
  listingStatus,
  mediaObject,
  myFavorites,
  myBlocks,
  myMedia,
  reportMessage,
  reviewableSales,
  saveStore,
  sellerAnimals,
  sellerDashboard,
  storeDetail,
  storeReviews,
  unblockUser,
  uploadMedia,
} from "../controllers/marketplaceController";
import { asyncHandler } from "../middleware/asyncHandler";
import { optionalAuth, requireAuth } from "../middleware/auth";
import { marketplaceMessageLimiter, marketplaceMutationLimiter, marketplaceUploadLimiter } from "../middleware/rateLimiters";
import { requireRole } from "../middleware/roles";

export const marketplaceRoutes = Router();

// Both reads are public, and both widen for a signed-in viewer: the cards need
// to know which animals this account has already saved.
marketplaceRoutes.get("/listings", optionalAuth, asyncHandler(browseListings));
marketplaceRoutes.get("/favorites", requireAuth, asyncHandler(myFavorites));
marketplaceRoutes.get("/listings/:id", optionalAuth, asyncHandler(listingDetail));
marketplaceRoutes.get("/listings/:id/comparables", asyncHandler(listingComparables));
marketplaceRoutes.post("/listings", marketplaceMutationLimiter, requireAuth, requireRole("admin", "breeder"), asyncHandler(createListing));
marketplaceRoutes.patch("/listings/:id", marketplaceMutationLimiter, requireAuth, asyncHandler(editListing));
marketplaceRoutes.patch("/listings/:id/status", marketplaceMutationLimiter, requireAuth, asyncHandler(listingStatus));
marketplaceRoutes.post("/listings/:id/favorite", marketplaceMutationLimiter, requireAuth, asyncHandler(favoriteListing));

marketplaceRoutes.get("/stores/:userId", asyncHandler(storeDetail));
marketplaceRoutes.get("/stores/:userId/reviews", asyncHandler(storeReviews));
marketplaceRoutes.put("/seller/store", marketplaceMutationLimiter, requireAuth, requireRole("admin", "breeder"), asyncHandler(saveStore));
marketplaceRoutes.get("/seller/dashboard", requireAuth, requireRole("admin", "breeder"), asyncHandler(sellerDashboard));
marketplaceRoutes.get("/seller/animals", requireAuth, requireRole("admin", "breeder"), asyncHandler(sellerAnimals));

marketplaceRoutes.post("/conversations", marketplaceMessageLimiter, requireAuth, asyncHandler(createConversation));
marketplaceRoutes.get("/conversations", requireAuth, asyncHandler(conversations));
marketplaceRoutes.get("/conversations/:id", requireAuth, asyncHandler(conversationDetail));
marketplaceRoutes.post("/conversations/:id/read", requireAuth, asyncHandler(conversationRead));
marketplaceRoutes.post("/conversations/:id/accept-offer", marketplaceMutationLimiter, requireAuth, asyncHandler(acceptOffer));
marketplaceRoutes.post("/conversations/:id/messages", marketplaceMessageLimiter, requireAuth, asyncHandler(addMessage));
marketplaceRoutes.post("/messages/:id/report", marketplaceMessageLimiter, requireAuth, asyncHandler(reportMessage));

marketplaceRoutes.post("/uploads", marketplaceUploadLimiter, requireAuth, requireRole("admin", "breeder"), asyncHandler(uploadMedia));
marketplaceRoutes.get("/uploads/me", requireAuth, requireRole("admin", "breeder"), asyncHandler(myMedia));
// Photos on a published listing have to render for signed-out visitors, so this
// one is optionally authenticated -- the service decides what is public.
marketplaceRoutes.get("/media/:id", optionalAuth, asyncHandler(mediaObject));
marketplaceRoutes.post("/blocks", marketplaceMessageLimiter, requireAuth, asyncHandler(blockUser));
marketplaceRoutes.get("/blocks", requireAuth, asyncHandler(myBlocks));
marketplaceRoutes.delete("/blocks/:blockedUserId", marketplaceMessageLimiter, requireAuth, asyncHandler(unblockUser));

marketplaceRoutes.post("/sales", marketplaceMutationLimiter, requireAuth, requireRole("admin", "breeder"), asyncHandler(createSale));
marketplaceRoutes.post("/reviews", marketplaceMutationLimiter, requireAuth, asyncHandler(createReview));
marketplaceRoutes.get("/reviews/pending", requireAuth, asyncHandler(reviewableSales));

marketplaceRoutes.get("/admin", requireAuth, requireRole("admin"), asyncHandler(adminMarketplace));
marketplaceRoutes.patch("/admin/stores/:userId", marketplaceMutationLimiter, requireAuth, requireRole("admin"), asyncHandler(adminStore));
