import type { Request, Response } from "express";
import { HttpError } from "../utils/errors";
import {
  getMobileAnimal,
  getMobileCommunication,
  getMobilePermissions,
  getRackMode,
  getTodayMobileTasks,
  logMobileAction,
  scanMobileQr,
  syncMobileQueue,
} from "../services/mobileService";

const actor = (req: Request) => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  return req.user;
};

export const permissions = async (req: Request, res: Response): Promise<void> => {
  res.status(200).json(await getMobilePermissions(actor(req), req.body || req.query || {}));
};

export const scan = async (req: Request, res: Response): Promise<void> => {
  const qrCode = String(req.body?.qrCode || req.params.qrCode || "").trim();
  res.status(200).json(await scanMobileQr(actor(req), qrCode, req.body?.metadata || {}));
};

export const animalByQr = async (req: Request, res: Response): Promise<void> => {
  res.status(200).json(await getMobileAnimal(actor(req), req.params.qrCode));
};

export const feedLog = async (req: Request, res: Response): Promise<void> => {
  res.status(200).json(await logMobileAction(actor(req), "feed", req.body || {}));
};

export const weightLog = async (req: Request, res: Response): Promise<void> => {
  res.status(200).json(await logMobileAction(actor(req), "weight", req.body || {}));
};

export const shedLog = async (req: Request, res: Response): Promise<void> => {
  res.status(200).json(await logMobileAction(actor(req), "shed", req.body || {}));
};

export const noteLog = async (req: Request, res: Response): Promise<void> => {
  res.status(200).json(await logMobileAction(actor(req), "note", req.body || {}));
};

export const cleanLog = async (req: Request, res: Response): Promise<void> => {
  res.status(200).json(await logMobileAction(actor(req), "clean", req.body || {}));
};

export const waterLog = async (req: Request, res: Response): Promise<void> => {
  res.status(200).json(await logMobileAction(actor(req), "water", req.body || {}));
};

export const todayTasks = async (req: Request, res: Response): Promise<void> => {
  res.status(200).json(await getTodayMobileTasks(actor(req)));
};

export const rackMode = async (req: Request, res: Response): Promise<void> => {
  res.status(200).json(await getRackMode(actor(req)));
};

export const communication = async (req: Request, res: Response): Promise<void> => {
  res.status(200).json(await getMobileCommunication(actor(req)));
};

export const sync = async (req: Request, res: Response): Promise<void> => {
  res.status(200).json(await syncMobileQueue(actor(req), req.body || {}));
};
