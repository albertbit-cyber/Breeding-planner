import type { Request, Response } from "express";
import { HttpError } from "../utils/errors";
import {
  archiveSubscriptionTier,
  assignUserSubscription,
  canAccessFeature,
  createFeatureOverride,
  createSubscriptionTier,
  duplicateSubscriptionTier,
  getSubscriptionTier,
  getUserSubscriptionPanel,
  listFeatureCatalog,
  listPublicSubscriptionTiers,
  listSubscriptionTiers,
  removeFeatureOverride,
  resetUsageTracking,
  updateSubscriptionTier,
} from "../services/subscriptionService";

export const adminFeatures = async (_req: Request, res: Response): Promise<void> => {
  res.status(200).json(await listFeatureCatalog());
};

export const adminTiers = async (req: Request, res: Response): Promise<void> => {
  res.status(200).json(await listSubscriptionTiers(req.query));
};

export const publicTiers = async (_req: Request, res: Response): Promise<void> => {
  res.status(200).json(await listPublicSubscriptionTiers());
};

export const tierDetail = async (req: Request, res: Response): Promise<void> => {
  res.status(200).json(await getSubscriptionTier(req.params.id));
};

export const createTier = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  res.status(201).json(await createSubscriptionTier(req.user, req.body || {}));
};

export const updateTier = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  res.status(200).json(await updateSubscriptionTier(req.user, req.params.id, req.body || {}));
};

export const duplicateTier = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  res.status(201).json(await duplicateSubscriptionTier(req.user, req.params.id));
};

export const archiveTier = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  res.status(200).json(await archiveSubscriptionTier(req.user, req.params.id, req.body || {}));
};

export const userSubscription = async (req: Request, res: Response): Promise<void> => {
  res.status(200).json(await getUserSubscriptionPanel(req.params.id));
};

export const assignSubscription = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  res.status(200).json(await assignUserSubscription(req.user, req.params.id, req.body || {}));
};

export const addOverride = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  res.status(201).json(await createFeatureOverride(req.user, req.params.id, req.body || {}));
};

export const deleteOverride = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  res.status(200).json(await removeFeatureOverride(req.user, req.params.id, req.params.overrideId, req.body || {}));
};

export const resetUsage = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  res.status(200).json(await resetUsageTracking(req.user, req.params.id, req.body || {}));
};

export const accessCheck = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  const featureKey = String(req.query.featureKey || req.params.featureKey || "").trim();
  if (!featureKey) throw new HttpError(400, "featureKey is required.");
  res.status(200).json(await canAccessFeature(req.user, featureKey));
};
