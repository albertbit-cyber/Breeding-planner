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

export const recoverPasswordSchema = z.object({
  email: z
    .string()
    .email("A valid email is required.")
    .toLowerCase()
    .trim(),
  fullName: z
    .string()
    .trim()
    .min(1, "fullName is required."),
  newPassword: z
    .string()
    .min(8, "Password must be at least 8 characters."),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RecoverPasswordInput = z.infer<typeof recoverPasswordSchema>;
