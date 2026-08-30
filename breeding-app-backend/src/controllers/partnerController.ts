import type { Request, Response } from "express";
import {
  listApplications,
  reviewApplication,
  submitApplication,
} from "../services/partnerApplicationService";

/** Public: a laboratory asking to be considered. Creates no account or access. */
export const postPartnerApplication = async (req: Request, res: Response): Promise<void> => {
  res.status(202).json(await submitApplication(req.body || {}));
};

export const adminPartnerApplications = async (req: Request, res: Response): Promise<void> => {
  res.status(200).json(await listApplications(req.query));
};

export const adminReviewPartnerApplication = async (req: Request, res: Response): Promise<void> => {
  res.status(200).json(await reviewApplication(req.user!, req.params.id, req.body || {}));
};
