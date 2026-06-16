import { Router } from "express";
import {
  addMessage,
  adminMarketplace,
  adminStore,
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
  saveStore,
  sellerDashboard,
  storeDetail,
} from "../controllers/marketplaceController";
import { asyncHandler } from "../middleware/asyncHandler";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/roles";

export const marketplaceRoutes = Router();

marketplaceRoutes.get("/listings", requireAuth, asyncHandler(browseListings));
marketplaceRoutes.get("/listings/:id", requireAuth, asyncHandler(listingDetail));
marketplaceRoutes.post("/listings", requireAuth, requireRole("admin", "breeder"), asyncHandler(createListing));
marketplaceRoutes.patch("/listings/:id", requireAuth, asyncHandler(editListing));
marketplaceRoutes.patch("/listings/:id/status", requireAuth, asyncHandler(listingStatus));
marketplaceRoutes.post("/listings/:id/favorite", requireAuth, asyncHandler(favoriteListing));

marketplaceRoutes.get("/stores/:userId", requireAuth, asyncHandler(storeDetail));
marketplaceRoutes.put("/seller/store", requireAuth, requireRole("admin", "breeder"), asyncHandler(saveStore));
marketplaceRoutes.get("/seller/dashboard", requireAuth, requireRole("admin", "breeder"), asyncHandler(sellerDashboard));

marketplaceRoutes.post("/conversations", requireAuth, asyncHandler(createConversation));
marketplaceRoutes.get("/conversations", requireAuth, asyncHandler(conversations));
marketplaceRoutes.post("/conversations/:id/messages", requireAuth, asyncHandler(addMessage));

marketplaceRoutes.post("/sales", requireAuth, requireRole("admin", "breeder"), asyncHandler(createSale));
marketplaceRoutes.post("/reviews", requireAuth, asyncHandler(createReview));

marketplaceRoutes.get("/admin", requireAuth, requireRole("admin"), asyncHandler(adminMarketplace));
marketplaceRoutes.patch("/admin/stores/:userId", requireAuth, requireRole("admin"), asyncHandler(adminStore));
