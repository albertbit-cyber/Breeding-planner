import type { Request, Response } from "express";
import { loginUser, registerUser, getMe, refreshAuthToken, recoverPassword as recoverPasswordForUser } from "../services/authService";
import { loginSchema, recoverPasswordSchema, registerSchema } from "../validators/authValidators";

export const register = async (req: Request, res: Response): Promise<void> => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Validation failed.", errors: parsed.error.flatten().fieldErrors });
    return;
  }
  const { email, password, fullName } = parsed.data;

  // Public registration creates breeder users by default.
  const user = await registerUser({ email, password, fullName, role: "breeder" });
  res.status(201).json({ user });
};

export const login = async (req: Request, res: Response): Promise<void> => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Validation failed.", errors: parsed.error.flatten().fieldErrors });
    return;
  }
  const { email, password } = parsed.data;
  const result = await loginUser(email, password);
  res.status(200).json(result);
};

export const me = async (req: Request, res: Response): Promise<void> => {
  const user = await getMe(String(req.user?.id || ""));
  res.status(200).json({ user });
};

export const refresh = async (req: Request, res: Response): Promise<void> => {
  const token = String(req.body?.refreshToken || "");
  if (!token) {
    res.status(400).json({ message: "refreshToken is required." });
    return;
  }
  const result = await refreshAuthToken(token);
  res.status(200).json(result);
};

export const recoverPassword = async (req: Request, res: Response): Promise<void> => {
  const parsed = recoverPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Validation failed.", errors: parsed.error.flatten().fieldErrors });
    return;
  }

  const result = await recoverPasswordForUser(parsed.data);
  res.status(200).json(result);
};
