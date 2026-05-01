import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { requireAuth } from "../middleware/auth";
import { getMyInquiries, postListingInquiry } from "../controllers/inquiryController";

export const inquiryRoutes = Router();

inquiryRoutes.post("/", requireAuth, asyncHandler(postListingInquiry));
inquiryRoutes.get("/me", requireAuth, asyncHandler(getMyInquiries));
