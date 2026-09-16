import type { Request, Response } from "express";
import { HttpError } from "../utils/errors";
import {
  createWishlist,
  deleteWishlist,
  listMyWishlistMatches,
  listMyWishlists,
  updateWishlist,
} from "../services/wishlistService";

const actorOf = (req: Request) => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  return req.user;
};

export const getMyWishlists = async (req: Request, res: Response): Promise<void> => {
  res.status(200).json(await listMyWishlists(actorOf(req)));
};

export const postWishlist = async (req: Request, res: Response): Promise<void> => {
  res.status(201).json(await createWishlist(actorOf(req), req.body || {}));
};

export const patchWishlist = async (req: Request, res: Response): Promise<void> => {
  res.status(200).json(await updateWishlist(actorOf(req), req.params.id, req.body || {}));
};

export const removeWishlist = async (req: Request, res: Response): Promise<void> => {
  res.status(200).json(await deleteWishlist(actorOf(req), req.params.id));
};

export const getMyWishlistMatches = async (req: Request, res: Response): Promise<void> => {
  res.status(200).json(await listMyWishlistMatches(actorOf(req)));
};
