import { z } from "zod";
import { ACCOUNT_EXPORT_GROUP_IDS } from "../services/accountDataExportService";

/**
 * Checks run in declaration order, so normalization has to come before
 * validation: with `.email()` first, a pasted " user@example.com " was rejected
 * outright instead of being trimmed and accepted. Every email field below
 * shares this so no one path drifts back to the stricter ordering.
 */
const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.string().email("A valid email is required."));

export const registerSchema = z.object({
  email: emailField,
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
  email: emailField,
  password: z
    .string()
    .min(1, "password is required."),
  // Which app the sign-in came from. Optional so older clients keep working;
  // omitting it means the least privileged portal, never a wildcard.
  portal: z.enum(["breeder", "lab", "admin", "marketplace"]).optional(),
});

export const forgotPasswordSchema = z.object({
  email: emailField,
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "token is required."),
  newPassword: z
    .string()
    .min(8, "Password must be at least 8 characters."),
});

export const changeEmailSchema = z.object({
  email: emailField,
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
  email: emailField,
});

export const confirmEmailChangeSchema = z.object({
  token: z.string().min(1, "token is required."),
});

/**
 * Deleting an account requires the password again even though the request is
 * already authenticated, and requires typing DELETE so it cannot be triggered
 * by a stray click or a CSRF-shaped mistake.
 */
export const requestAccountDeletionSchema = z.object({
  password: z.string().min(1, "Your password is required to delete your account."),
  confirmation: z
    .string()
    .trim()
    .refine((value) => value.toUpperCase() === "DELETE", "Type DELETE to confirm."),
});

/**
 * Optional narrowing of the data export, as a comma-separated list of group
 * ids. Absent means the whole export, which is what the right to portability
 * actually grants — the query string can only ever be a convenience on top.
 *
 * An unrecognised id is rejected rather than ignored: silently dropping it
 * would hand back a file missing a category the user believed they had asked
 * for, and they have no way to tell from the file that they were misheard.
 */
export const accountExportQuerySchema = z.object({
  groups: z
    .string()
    .trim()
    .optional()
    .transform((value) =>
      value
        ? value
            .split(",")
            .map((id) => id.trim())
            .filter((id) => id.length > 0)
        : []
    )
    .refine(
      (ids) => ids.every((id) => (ACCOUNT_EXPORT_GROUP_IDS as string[]).includes(id)),
      `groups must be a comma-separated list of: ${ACCOUNT_EXPORT_GROUP_IDS.join(", ")}.`
    ),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangeEmailInput = z.infer<typeof changeEmailSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;
export type ConfirmEmailChangeInput = z.infer<typeof confirmEmailChangeSchema>;
export type RequestAccountDeletionInput = z.infer<typeof requestAccountDeletionSchema>;
