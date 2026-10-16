import type { Request, Response } from "express";
import { HttpError } from "../utils/errors";
import {
  completePhotoUpload,
  createPhotoUploadUrl,
  deletePhoto,
  getPhotoUrls,
  getPhotoUrlsBatch,
  listPhotos,
  putLocalPhotoObject,
  readLocalSignedObject,
  restorePhoto,
} from "../services/photoService";

const actorOf = (req: Request) => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  return req.user;
};

export const photoUploadUrl = async (req: Request, res: Response): Promise<void> => {
  const result = await createPhotoUploadUrl(actorOf(req), req.body || {});
  res.status(result.alreadyUploaded ? 200 : 201).json(result);
};

export const photoComplete = async (req: Request, res: Response): Promise<void> => {
  res.status(200).json(await completePhotoUpload(actorOf(req), req.params.id, req.body || {}));
};

export const photoUrl = async (req: Request, res: Response): Promise<void> => {
  res.setHeader("Cache-Control", "private, no-store");
  res.status(200).json(await getPhotoUrls(actorOf(req), req.params.id));
};

export const photoUrlsBatch = async (req: Request, res: Response): Promise<void> => {
  res.setHeader("Cache-Control", "private, no-store");
  res.status(200).json(await getPhotoUrlsBatch(actorOf(req), (req.body || {}).ids));
};

export const photoList = async (req: Request, res: Response): Promise<void> => {
  res.status(200).json(await listPhotos(actorOf(req), req.query as Record<string, unknown>));
};

export const photoDelete = async (req: Request, res: Response): Promise<void> => {
  res.status(200).json(await deletePhoto(actorOf(req), req.params.id));
};

export const photoRestore = async (req: Request, res: Response): Promise<void> => {
  res.status(200).json(await restorePhoto(actorOf(req), req.params.id));
};

export const photoPutObject = async (req: Request, res: Response): Promise<void> => {
  const variant = req.query.variant === "thumb" ? "thumb" : "full";
  const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  res.status(200).json(await putLocalPhotoObject(actorOf(req), req.params.id, variant, body));
};

export const photoSignedObject = async (req: Request, res: Response): Promise<void> => {
  const { buffer, mimeType } = await readLocalSignedObject(req.query as Record<string, unknown>);
  res.setHeader("Content-Type", mimeType);
  res.setHeader("Content-Length", String(buffer.length));
  // The link expires in minutes; a browser may keep the bytes for as long as it holds the link.
  res.setHeader("Cache-Control", "private, max-age=600");
  res.setHeader("X-Content-Type-Options", "nosniff");
  // helmet's default same-origin policy would stop the breeder app, served from another origin,
  // from showing the image at all.
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.status(200).end(buffer);
};
