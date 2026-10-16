import express, { Router } from "express";
import {
  photoComplete,
  photoDelete,
  photoList,
  photoPutObject,
  photoRestore,
  photoSignedObject,
  photoUploadUrl,
  photoUrl,
  photoUrlsBatch,
} from "../controllers/photoController";
import { asyncHandler } from "../middleware/asyncHandler";
import { requireAuth } from "../middleware/auth";
import { photoReadLimiter, photoUploadLimiter } from "../middleware/rateLimiters";
import { requireRole } from "../middleware/roles";
import { maxPhotoBytes } from "../services/photoService";

export const photoRoutes = Router();

const breeder = [requireAuth, requireRole("admin", "breeder")] as const;

// Unauthenticated on purpose: an <img> cannot send a bearer token. The signature in the query is
// the permission, exactly as with a Supabase signed URL. Local driver only; Supabase serves its own.
photoRoutes.get("/object", photoReadLimiter, asyncHandler(photoSignedObject));

photoRoutes.post("/upload-url", photoUploadLimiter, ...breeder, asyncHandler(photoUploadUrl));
photoRoutes.post("/urls", photoReadLimiter, ...breeder, asyncHandler(photoUrlsBatch));
photoRoutes.get("/", ...breeder, asyncHandler(photoList));
photoRoutes.get("/:id/url", photoReadLimiter, ...breeder, asyncHandler(photoUrl));
photoRoutes.post("/:id/complete", photoUploadLimiter, ...breeder, asyncHandler(photoComplete));
photoRoutes.delete("/:id", photoUploadLimiter, ...breeder, asyncHandler(photoDelete));
photoRoutes.post("/:id/restore", photoUploadLimiter, ...breeder, asyncHandler(photoRestore));
// The local driver's stand-in for a signed upload URL. Raw bytes, not JSON.
photoRoutes.put(
  "/:id/object",
  photoUploadLimiter,
  ...breeder,
  express.raw({ type: () => true, limit: maxPhotoBytes() }),
  asyncHandler(photoPutObject)
);
