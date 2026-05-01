import type { Request, Response } from "express";
import { HttpError } from "../utils/errors";
import { createListingInquiry, listMyInquiries, updateInquiryFollowUp } from "../services/inquiryService";

export const postListingInquiry = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  const inquiry = await createListingInquiry(req.user, req.body || {});
  res.status(201).json({ inquiry });
};

export const getMyInquiries = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  const inquiries = await listMyInquiries(req.user);
  res.status(200).json({ inquiries });
};

export const patchInquiry = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  const inquiry = await updateInquiryFollowUp(req.user, req.params.id, req.body || {});
  res.status(200).json({ inquiry });
};
