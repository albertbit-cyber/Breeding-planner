import { z } from "zod";

export const registerSchema = z.object({
  email: z
    .string()
    .email("A valid email is required.")
    .toLowerCase()
    .trim(),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters."),
  fullName: z
    .string()
    .trim()
    .min(1, "fullName is required."),
  role: z.enum(["breeder", "buyer"]).optional(),
});

export const loginSchema = z.object({
  email: z
    .string()
    .email("A valid email is required.")
    .toLowerCase()
    .trim(),
  password: z
    .string()
    .min(1, "password is required."),
});

export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .email("A valid email is required.")
    .toLowerCase()
    .trim(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "token is required."),
  newPassword: z
    .string()
    .min(8, "Password must be at least 8 characters."),
});

export const changeEmailSchema = z.object({
  email: z
    .string()
    .email("A valid email is required.")
    .toLowerCase()
    .trim(),
  currentPassword: z
    .string()
    .min(1, "currentPassword is required."),
});

export const changePasswordSchema = z.object({
  currentPassword: z
    .string()
    .min(1, "currentPassword is required."),
  newPassword: z
    .string()
    .min(8, "Password must be at least 8 characters."),
});

export const resendVerificationSchema = z.object({
  email: z
    .string()
    .email("A valid email is required.")
    .toLowerCase()
    .trim(),
});

export const confirmEmailChangeSchema = z.object({
  token: z.string().min(1, "token is required."),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangeEmailInput = z.infer<typeof changeEmailSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;
export type ConfirmEmailChangeInput = z.infer<typeof confirmEmailChangeSchema>;
