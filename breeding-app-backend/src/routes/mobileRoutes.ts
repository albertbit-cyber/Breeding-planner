import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/roles";
import { asyncHandler } from "../middleware/asyncHandler";
import {
  animalByQr,
  cleanLog,
  communication,
  feedLog,
  noteLog,
  permissions,
  rackMode,
  scan,
  shedLog,
  sync,
  todayTasks,
  waterLog,
  weightLog,
} from "../controllers/mobileController";

export const mobileRoutes = Router();

mobileRoutes.use(requireAuth, requireRole("admin", "breeder", "lab"));

mobileRoutes.get("/permissions", asyncHandler(permissions));
mobileRoutes.post("/permissions", asyncHandler(permissions));
mobileRoutes.get("/animal/:qrCode", asyncHandler(animalByQr));
mobileRoutes.post("/scan", asyncHandler(scan));
mobileRoutes.post("/log/feed", asyncHandler(feedLog));
mobileRoutes.post("/log/weight", asyncHandler(weightLog));
mobileRoutes.post("/log/shed", asyncHandler(shedLog));
mobileRoutes.post("/log/note", asyncHandler(noteLog));
mobileRoutes.post("/log/clean", asyncHandler(cleanLog));
mobileRoutes.post("/log/water", asyncHandler(waterLog));
mobileRoutes.get("/tasks/today", asyncHandler(todayTasks));
mobileRoutes.get("/rack-mode", asyncHandler(rackMode));
mobileRoutes.get("/communication", asyncHandler(communication));
mobileRoutes.post("/sync", asyncHandler(sync));
