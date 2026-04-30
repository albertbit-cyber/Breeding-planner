const ORDER_NUMBER_PATTERN = /^(\d{2})([A-Z]{2})(\d{5})$/;
const LETTER_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const NUMERIC_BLOCK_SIZE = 9999;
const LETTER_BLOCK_COUNT = LETTER_ALPHABET.length * LETTER_ALPHABET.length;

const safeDate = (value?: string | Date): Date => {
  const parsed = value instanceof Date ? value : new Date(String(value || "").trim() || Date.now());
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

export const getOrderMonthToken = (value?: string | Date): string =>
  String(safeDate(value).getMonth() + 1).padStart(2, "0");

const encodeLetterIndex = (index: number): string => {
  if (!Number.isFinite(index) || index < 0 || index >= LETTER_BLOCK_COUNT) {
    throw new Error("Order number letter sequence exceeded supported range.");
  }
  const normalized = Math.floor(index);
  const first = Math.floor(normalized / LETTER_ALPHABET.length);
  const second = normalized % LETTER_ALPHABET.length;
  return `${LETTER_ALPHABET[first]}${LETTER_ALPHABET[second]}`;
};

const decodeLetterIndex = (pair: string): number | null => {
  const normalized = String(pair || "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) return null;
  const first = LETTER_ALPHABET.indexOf(normalized[0]);
  const second = LETTER_ALPHABET.indexOf(normalized[1]);
  if (first < 0 || second < 0) return null;
  return (first * LETTER_ALPHABET.length) + second;
};

export const parseOrderNumber = (
  value: unknown
): { monthToken: string; letterIndex: number; numeric: number; sequence: number } | null => {
  const normalized = String(value || "").trim().toUpperCase();
  const match = normalized.match(ORDER_NUMBER_PATTERN);
  if (!match) return null;

  const [, monthToken, letterPair, numericText] = match;
  const letterIndex = decodeLetterIndex(letterPair);
  const numeric = Number(numericText);
  if (letterIndex === null || !Number.isFinite(numeric) || numeric < 1 || numeric > NUMERIC_BLOCK_SIZE) {
    return null;
  }

  return {
    monthToken,
    letterIndex,
    numeric,
    sequence: (letterIndex * NUMERIC_BLOCK_SIZE) + numeric,
  };
};

export const formatOrderNumber = (monthToken: string, sequence: number): string => {
  const normalizedMonth = String(monthToken || "").trim().padStart(2, "0").slice(-2);
  const safeSequence = Math.max(1, Math.floor(Number(sequence) || 1));
  const zeroBased = safeSequence - 1;
  const letterIndex = Math.floor(zeroBased / NUMERIC_BLOCK_SIZE);
  const numeric = (zeroBased % NUMERIC_BLOCK_SIZE) + 1;
  return `${normalizedMonth}${encodeLetterIndex(letterIndex)}${String(numeric).padStart(5, "0")}`;
};

export const buildNextOrderNumber = (
  existingOrderNumbers: Array<unknown>,
  createdAt?: string | Date
): string => {
  const monthToken = getOrderMonthToken(createdAt);
  let maxSequence = 0;

  existingOrderNumbers.forEach((value) => {
    const parsed = parseOrderNumber(value);
    if (!parsed || parsed.monthToken !== monthToken) return;
    if (parsed.sequence > maxSequence) {
      maxSequence = parsed.sequence;
    }
  });

  return formatOrderNumber(monthToken, maxSequence + 1);
};

export const isFormattedOrderNumber = (value: unknown): boolean =>
  ORDER_NUMBER_PATTERN.test(String(value || "").trim().toUpperCase());
