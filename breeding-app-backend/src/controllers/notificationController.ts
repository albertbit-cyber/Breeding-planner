import type { Request, Response } from "express";
import { HttpError } from "../utils/errors";
import { listMyNotifications, markNotificationRead } from "../services/notificationService";

export const getMyNotifications = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  const notifications = await listMyNotifications(req.user);
  res.status(200).json({ notifications });
};

export const patchNotificationRead = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  const notification = await markNotificationRead(req.user, req.params.id);
  res.status(200).json({ notification });
};
