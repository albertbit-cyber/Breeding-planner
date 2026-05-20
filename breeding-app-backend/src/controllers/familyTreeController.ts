import type { Request, Response } from "express";
import {
  listMyAnimals,
  getSnakePedigree,
  getMoreAncestors,
  getMoreDescendants,
  getTreeStats,
} from "../services/familyTreeService";

export const getMyAnimals = async (req: Request, res: Response): Promise<void> => {
  const userId = String(req.user?.id || "");
  const animals = await listMyAnimals(userId);
  res.status(200).json({ animals });
};

export const getSnakePedigreeHandler = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const userId = String(req.user?.id || "");
  if (!id) {
    res.status(400).json({ message: "Animal id is required." });
    return;
  }
  const pedigree = await getSnakePedigree(id, userId);
  res.status(200).json(pedigree);
};

export const getAncestorsHandler = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const depth   = Math.max(1, Math.min(Number(req.query.depth) || 1, 4));
  const userId  = String(req.user?.id || "");
  if (!id) {
    res.status(400).json({ message: "Animal id is required." });
    return;
  }
  const result = await getMoreAncestors(id, depth, userId);
  res.status(200).json(result);
};

export const getDescendantsHandler = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const depth   = Math.max(1, Math.min(Number(req.query.depth) || 1, 4));
  const userId  = String(req.user?.id || "");
  if (!id) {
    res.status(400).json({ message: "Animal id is required." });
    return;
  }
  const result = await getMoreDescendants(id, depth, userId);
  res.status(200).json(result);
};

export const getStatsHandler = async (_req: Request, res: Response): Promise<void> => {
  const stats = await getTreeStats();
  res.status(200).json(stats);
};
