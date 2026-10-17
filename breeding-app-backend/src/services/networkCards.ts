/**
 * The small, frozen picture of an animal that travels in a message, a transfer offer or a joint
 * project: enough to recognise it, never its notes, prices or logs. Built from the owner's row.
 */

type JsonRecord = Record<string, any>;

export const asRecord = (value: unknown): JsonRecord =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};

export const asArray = (value: unknown): any[] => (Array.isArray(value) ? value : []);

export const cleanText = (value: unknown, max = 500): string | null => {
  if (value === undefined || value === null) return null;
  const normalized = String(value).replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, max) : null;
};

const textList = (value: unknown, max = 30): string[] =>
  asArray(value)
    .map((entry) => cleanText(entry, 120))
    .filter((entry): entry is string => Boolean(entry))
    .slice(0, max);

/** A shareable picture: a stored URL, never a device-local data URI or a private photo reference. */
export const publicImageOf = (payload: JsonRecord): string | null => {
  const candidates = [payload.imageUrl, ...asArray(payload.photos).map((photo) => (typeof photo === "string" ? photo : photo?.url))];
  for (const candidate of candidates.reverse()) {
    const url = typeof candidate === "string" ? candidate.trim() : "";
    if (/^https?:\/\//i.test(url)) return url;
  }
  return null;
};

export type AnimalCard = {
  appAnimalId: string;
  name: string;
  sex: string;
  species: string;
  morphs: string[];
  hets: string[];
  possibleHets: string[];
  year: string | null;
  birthDate: string | null;
  imageUrl: string | null;
  status: string | null;
};

export const animalCard = (row: any): AnimalCard => {
  const payload = asRecord(row?.payload);
  return {
    appAnimalId: String(row?.appAnimalId || payload.id || ""),
    name: cleanText(payload.name, 160) || cleanText(row?.name, 160) || String(row?.appAnimalId || ""),
    sex: cleanText(payload.sex, 20) || cleanText(row?.sex, 20) || "",
    species: cleanText(payload.species, 120) || cleanText(row?.species, 120) || "",
    morphs: textList(payload.morphs),
    hets: textList(payload.hets),
    possibleHets: textList(payload.possibleHets),
    year: cleanText(payload.year, 10),
    birthDate: cleanText(payload.birthDate || payload.hatchDate, 20),
    imageUrl: publicImageOf(payload),
    status: cleanText(payload.status ?? row?.status, 60),
  };
};

/** "M", "F" or "U", read the way the breeder app reads it (features/animals/animalSex.js). */
export const sexOf = (value: unknown): "M" | "F" | "U" => {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "U";
  if (/^1[\s.:/]*0$/.test(raw)) return "M";
  if (/^0[\s.:/]*1$/.test(raw)) return "F";
  if (/^(super)?m/.test(raw)) return "M";
  if (/^(super)?f/.test(raw)) return "F";
  return "U";
};

export const ymd = (date: Date = new Date()): string => date.toISOString().slice(0, 10);
