import type { Request, Response } from "express";
import {
  createAdminEscalation,
  listAdminEscalations,
  updateAdminEscalation,
} from "../services/adminEscalationService";

export const listEscalations = async (req: Request, res: Response): Promise<void> => {
  res.status(200).json(await listAdminEscalations(req.user!, req.query as Record<string, unknown>));
};

export const createEscalation = async (req: Request, res: Response): Promise<void> => {
  res.status(201).json(await createAdminEscalation(req.user!, req.body || {}));
};

export const reviewEscalation = async (req: Request, res: Response): Promise<void> => {
  res.status(200).json(await updateAdminEscalation(req.user!, req.params.id, req.body || {}));
};
