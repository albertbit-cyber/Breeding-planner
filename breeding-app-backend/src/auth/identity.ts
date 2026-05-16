import type { AppRole, PersistedAppRole } from "../types/auth";

export const normalizePersistedRole = (role: PersistedAppRole): AppRole => {
  if (role === "lab") {
    return "lab_staff";
  }

  if (role === "moderator" || role === "support") {
    return "admin";
  }

  return role;
};

export const isAdminRole = (role: AppRole): boolean => role === "super_admin" || role === "admin";
export const isBreederRole = (role: AppRole): boolean => role === "super_admin" || role === "admin" || role === "breeder";
export const isLabRole = (role: AppRole): boolean =>
  role === "super_admin" || role === "admin" || role === "lab_owner" || role === "lab_staff";
