import { prisma } from "../lib/prisma";

const ORDER_NUMBER_PATTERN = /^(\d{2})([A-Z]{2})(\d{5})$/;
const LETTER_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const NUMERIC_BLOCK_SIZE = 9999;
const LETTER_BLOCK_COUNT = LETTER_ALPHABET.length * LETTER_ALPHABET.length;

type OrderNumberStore = {
  shedTestOrder: {
    findMany: (args: Record<string, unknown>) => Promise<Array<{ id: string; createdAt: Date; orderNumber?: string | null }>>;
    update: (args: Record<string, unknown>) => Promise<unknown>;
  };
};

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

export const ensureSharedOrderNumbers = async (db: OrderNumberStore = prisma as unknown as OrderNumberStore): Promise<void> => {
  const orders = await db.shedTestOrder.findMany({
    select: { id: true, createdAt: true, orderNumber: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  const maxByMonth = new Map<string, number>();
  const pendingUpdates: Array<{ id: string; orderNumber: string }> = [];

  orders.forEach((order) => {
    const parsed = parseOrderNumber(order.orderNumber);
    if (parsed) {
      const previous = maxByMonth.get(parsed.monthToken) || 0;
      if (parsed.sequence > previous) {
        maxByMonth.set(parsed.monthToken, parsed.sequence);
      }
      return;
    }

    const monthToken = getOrderMonthToken(order.createdAt);
    const nextSequence = (maxByMonth.get(monthToken) || 0) + 1;
    maxByMonth.set(monthToken, nextSequence);
    pendingUpdates.push({
      id: order.id,
      orderNumber: formatOrderNumber(monthToken, nextSequence),
    });
  });

  for (const entry of pendingUpdates) {
    await db.shedTestOrder.update({
      where: { id: entry.id },
      data: { orderNumber: entry.orderNumber },
    });
  }
};
