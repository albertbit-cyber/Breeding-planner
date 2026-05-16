import type { Request, Response } from "express";
import { HttpError } from "../utils/errors";
import {
  deleteMarketplaceSearch,
  listMySavedSearches,
  saveMarketplaceSearch,
} from "../services/savedSearchService";

export const getMySavedSearches = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  const searches = await listMySavedSearches(req.user);
  res.status(200).json({ searches });
};

export const postSavedSearch = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  const search = await saveMarketplaceSearch(req.user, req.body || {});
  res.status(201).json({ search });
};

export const deleteSavedSearch = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  const result = await deleteMarketplaceSearch(req.user, req.params.id);
  res.status(200).json({ deleted: result.id });
};
