import type { Request, Response } from "express";
import { HttpError } from "../utils/errors";
import { listBreedingCycles, listFollicleExaminations, buildBreedingOverview } from "../services/breedingReadService";

const ownerOf = (req: Request): string => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  return req.user.id;
};

const optionalText = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
};

/** GET /api/breeding/cycles?femaleAppId=&status= — the signed-in owner's cycles only. */
export const getBreedingCycles = async (req: Request, res: Response): Promise<void> => {
  const ownerId = ownerOf(req);
  const cycles = await listBreedingCycles(ownerId, {
    femaleAppId: optionalText(req.query.femaleAppId),
    status: optionalText(req.query.status),
  });
  res.status(200).json({ cycles });
};

/** GET /api/breeding/follicle-exams?femaleAppId=&cycleAppId= */
export const getFollicleExaminations = async (req: Request, res: Response): Promise<void> => {
  const ownerId = ownerOf(req);
  const exams = await listFollicleExaminations(ownerId, {
    femaleAppId: optionalText(req.query.femaleAppId),
    cycleAppId: optionalText(req.query.cycleAppId),
  });
  res.status(200).json({ exams });
};

/** GET /api/breeding/overview — one row per live cycle, computed from the indexed columns and payload. */
export const getBreedingOverview = async (req: Request, res: Response): Promise<void> => {
  const ownerId = ownerOf(req);
  const overview = await buildBreedingOverview(ownerId);
  res.status(200).json(overview);
};
