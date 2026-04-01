import { HttpError } from "./errors";
import type { AnimalOrderInput } from "../types/api";

export const ensureEmail = (value: unknown): string => {
  const email = String(value || "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    throw new HttpError(400, "A valid email is required.");
  }
  return email;
};

export const ensurePassword = (value: unknown): string => {
  const password = String(value || "");
  if (password.length < 8) {
    throw new HttpError(400, "Password must be at least 8 characters.");
  }
  return password;
};

export const ensureFullName = (value: unknown): string => {
  const fullName = String(value || "").trim();
  if (!fullName) {
    throw new HttpError(400, "fullName is required.");
  }
  return fullName;
};

export const ensureAnimalsPayload = (payload: unknown): AnimalOrderInput[] => {
  const animals = (payload as { animals?: unknown })?.animals;
  if (!Array.isArray(animals) || animals.length === 0) {
    throw new HttpError(400, "animals must be a non-empty array.");
  }

  return animals.map((entry, index) => {
    const row = entry as Record<string, unknown>;
    const animalId = String(row.animalId || "").trim();
    const animalName = row.animalName ? String(row.animalName).trim() : undefined;
    const selectedTestIds = Array.isArray(row.selectedTestIds)
      ? row.selectedTestIds.map((id) => String(id || "").trim()).filter(Boolean)
      : [];

    if (!animalId) {
      throw new HttpError(400, `animals[${index}].animalId is required.`);
    }
    if (!selectedTestIds.length) {
      throw new HttpError(400, `animals[${index}].selectedTestIds must have at least 1 value.`);
    }

    return { animalId, animalName, selectedTestIds };
  });
};
