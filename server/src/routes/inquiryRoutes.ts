import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { requireAuth } from "../middleware/auth";
import { getMyInquiries, patchInquiry, postListingInquiry } from "../controllers/inquiryController";

export const inquiryRoutes = Router();

inquiryRoutes.post("/", requireAuth, asyncHandler(postListingInquiry));
inquiryRoutes.get("/me", requireAuth, asyncHandler(getMyInquiries));
inquiryRoutes.patch("/:id", requireAuth, asyncHandler(patchInquiry));
