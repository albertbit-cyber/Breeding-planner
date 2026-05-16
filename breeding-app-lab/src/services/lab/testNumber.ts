const LAB_TEST_NUMBER_PATTERN = /^\d{6}[A-Z]{2}\d{4}$/;
const LAB_TEST_NUMBER_LETTERS = "PH";

const hashString = (value: string): number => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
};

const toTestNumberDateDigits = (value?: string | Date): string => {
  const parsed = value instanceof Date ? value : new Date(String(value || "").trim() || Date.now());
  const safe = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  return [
    String(safe.getFullYear()).slice(-2),
    String(safe.getMonth() + 1).padStart(2, "0"),
    String(safe.getDate()).padStart(2, "0"),
  ].join("");
};

export const isLabTestNumber = (value: unknown): boolean =>
  LAB_TEST_NUMBER_PATTERN.test(String(value || "").trim().toUpperCase());

export const buildLabTestNumber = (seed: unknown, dateLike?: string | Date): string => {
  const digits = toTestNumberDateDigits(dateLike);
  const normalizedSeed = String(seed || "").trim() || digits;
  const suffix = String(hashString(`${digits}|${normalizedSeed}`) % 10000).padStart(4, "0");
  return `${digits}${LAB_TEST_NUMBER_LETTERS}${suffix}`;
};

export const resolveLabTestNumber = (value: unknown, seed: unknown, dateLike?: string | Date): string => {
  const normalized = String(value || "").trim().toUpperCase();
  if (LAB_TEST_NUMBER_PATTERN.test(normalized)) {
    return normalized;
  }
  return buildLabTestNumber(`${String(seed || "").trim()}|${normalized}`, dateLike);
};

export { LAB_TEST_NUMBER_PATTERN };
