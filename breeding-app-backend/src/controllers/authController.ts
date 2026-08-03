import type { Request, Response } from "express";
import {
  loginUser,
  registerUser,
  getMe,
  refreshAuthToken,
  requestPasswordReset,
  resetPassword as resetPasswordForUser,
  logoutUser,
  changeEmailForUser,
  changePasswordForUser,
  verifyEmailForUser,
  resendVerificationEmail,
  confirmEmailChange as confirmEmailChangeForUser,
} from "../services/authService";
import { buildAccountExport, accountExportFilename } from "../services/accountDataExportService";
import {
  requestAccountDeletion,
  cancelAccountDeletion,
  getDeletionStatus,
} from "../services/accountDeletionService";
import {
  changeEmailSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  resendVerificationSchema,
  confirmEmailChangeSchema,
  requestAccountDeletionSchema,
} from "../validators/authValidators";
import {
  AUTH_REFRESH_COOKIE,
  clearAuthCookies,
  createCsrfToken,
  getCookieValue,
  setAuthCookies,
  setCsrfCookie,
} from "../utils/authCookies";

export const register = async (req: Request, res: Response): Promise<void> => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Validation failed.", errors: parsed.error.flatten().fieldErrors });
    return;
  }
  const { email, password, fullName, role } = parsed.data;

  // Public registration is limited to non-staff roles.
  const user = await registerUser({ email, password, fullName, role: role || "breeder" });
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
  setAuthCookies(res, result);
  const csrfToken = createCsrfToken();
  setCsrfCookie(res, csrfToken);
  res.status(200).json({ ...result, csrfToken });
};

export const me = async (req: Request, res: Response): Promise<void> => {
  const user = await getMe(String(req.user?.id || ""));
  res.status(200).json({ user });
};

export const refresh = async (req: Request, res: Response): Promise<void> => {
  const token = String(req.body?.refreshToken || getCookieValue(req, AUTH_REFRESH_COOKIE) || "");
  if (!token) {
    res.status(400).json({ message: "refreshToken is required." });
    return;
  }
  const result = await refreshAuthToken(token);
  setAuthCookies(res, result);
  const csrfToken = createCsrfToken();
  setCsrfCookie(res, csrfToken);
  res.status(200).json({ ...result, csrfToken });
};

export const csrfToken = async (_req: Request, res: Response): Promise<void> => {
  const token = createCsrfToken();
  setCsrfCookie(res, token);
  res.status(200).json({ csrfToken: token });
};

export const logout = async (req: Request, res: Response): Promise<void> => {
  await logoutUser(String(req.user?.id || ""));
  clearAuthCookies(res);
  res.status(200).json({ message: "Signed out." });
};

export const changeEmail = async (req: Request, res: Response): Promise<void> => {
  const parsed = changeEmailSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Validation failed.", errors: parsed.error.flatten().fieldErrors });
    return;
  }

  const result = await changeEmailForUser(String(req.user?.id || ""), parsed.data);
  clearAuthCookies(res);
  res.status(200).json(result);
};

export const changePassword = async (req: Request, res: Response): Promise<void> => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Validation failed.", errors: parsed.error.flatten().fieldErrors });
    return;
  }

  const result = await changePasswordForUser(String(req.user?.id || ""), parsed.data);
  clearAuthCookies(res);
  res.status(200).json(result);
};

export const forgotPassword = async (req: Request, res: Response): Promise<void> => {
  const parsed = forgotPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Validation failed.", errors: parsed.error.flatten().fieldErrors });
    return;
  }
  const result = await requestPasswordReset(parsed.data.email);
  res.status(200).json(result);
};

export const resetPassword = async (req: Request, res: Response): Promise<void> => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Validation failed.", errors: parsed.error.flatten().fieldErrors });
    return;
  }
  const result = await resetPasswordForUser(parsed.data);
  res.status(200).json(result);
};

export const verifyEmail = async (req: Request, res: Response): Promise<void> => {
  const token = String(req.query.token || req.body?.token || "").trim();
  if (!token) {
    res.status(400).json({ message: "token is required." });
    return;
  }
  res.status(200).json(await verifyEmailForUser(token));
};

export const resendVerification = async (req: Request, res: Response): Promise<void> => {
  const parsed = resendVerificationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Validation failed.", errors: parsed.error.flatten().fieldErrors });
    return;
  }
  const result = await resendVerificationEmail(parsed.data.email);
  res.status(200).json(result);
};

export const confirmEmailChange = async (req: Request, res: Response): Promise<void> => {
  const token = String(req.query.token || req.body?.token || "").trim();
  const parsed = confirmEmailChangeSchema.safeParse({ token });
  if (!parsed.success) {
    res.status(400).json({ message: "Validation failed.", errors: parsed.error.flatten().fieldErrors });
    return;
  }
  res.status(200).json(await confirmEmailChangeForUser(parsed.data.token));
};

export const exportMyData = async (req: Request, res: Response): Promise<void> => {
  const userId = String(req.user?.id || "");
  const payload = await buildAccountExport(userId);

  // Served as a download rather than a JSON body: the whole point is that the
  // user ends up with a file they keep.
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${accountExportFilename(userId)}"`);
  res.setHeader("Cache-Control", "no-store");
  res.status(200).send(JSON.stringify(payload, null, 2));
};

export const deletionStatus = async (req: Request, res: Response): Promise<void> => {
  res.status(200).json(await getDeletionStatus(String(req.user?.id || "")));
};

export const requestDeletion = async (req: Request, res: Response): Promise<void> => {
  const parsed = requestAccountDeletionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Validation failed.", errors: parsed.error.flatten().fieldErrors });
    return;
  }

  const result = await requestAccountDeletion(String(req.user?.id || ""), parsed.data.password);
  // Every session was just revoked server-side; drop the cookies too so the
  // browser reflects it instead of holding a token that no longer resolves.
  clearAuthCookies(res);
  res.status(200).json(result);
};

export const cancelDeletion = async (req: Request, res: Response): Promise<void> => {
  res.status(200).json(await cancelAccountDeletion(String(req.user?.id || "")));
};
