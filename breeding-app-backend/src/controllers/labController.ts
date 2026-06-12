import type { Request, Response } from "express";
import { createCatalogItem, getActivePricing, listCatalog, updateCatalogItem, updatePricingConfig } from "../services/labConfigService";

export const getCatalog = async (req: Request, res: Response): Promise<void> => {
  const breederView = String(req.query.breederView || "").toLowerCase() === "true";
  const tests = await listCatalog(breederView);
  res.status(200).json({ tests });
};

export const postCatalogItem = async (req: Request, res: Response): Promise<void> => {
  const item = await createCatalogItem(req.body || {});
  res.status(201).json({ test: item });
};

export const patchCatalogItem = async (req: Request, res: Response): Promise<void> => {
  const item = await updateCatalogItem(req.params.id, req.body || {});
  res.status(200).json({ test: item });
};

export const getPricing = async (_req: Request, res: Response): Promise<void> => {
  const pricing = await getActivePricing();
  res.status(200).json({ pricing });
};

export const patchPricing = async (req: Request, res: Response): Promise<void> => {
  const pricing = await updatePricingConfig(req.params.id, req.body || {});
  res.status(200).json({ pricing });
};
