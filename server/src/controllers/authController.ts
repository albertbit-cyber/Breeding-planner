import type { Request, Response } from "express";
import { loginUser, registerUser, getMe } from "../services/authService";
import { ensureEmail, ensureFullName, ensurePassword } from "../utils/validators";

export const register = async (req: Request, res: Response): Promise<void> => {
  const email = ensureEmail(req.body?.email);
  const password = ensurePassword(req.body?.password);
  const fullName = ensureFullName(req.body?.fullName);

  // Public registration creates breeder users by default.
  const user = await registerUser({ email, password, fullName, role: "breeder" });
  res.status(201).json({ user });
};

export const login = async (req: Request, res: Response): Promise<void> => {
  const email = ensureEmail(req.body?.email);
  const password = ensurePassword(req.body?.password);
  const result = await loginUser(email, password);
  res.status(200).json(result);
};

export const me = async (req: Request, res: Response): Promise<void> => {
  const user = await getMe(String(req.user?.id || ""));
  res.status(200).json({ user });
};
