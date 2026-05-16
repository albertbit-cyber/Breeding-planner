import { prisma } from "./prisma";

export interface DatabaseCheckResult {
  ok: boolean;
  database: "ok" | "unavailable";
  checkedAt: string;
  error?: string;
}

export const checkDatabaseConnection = async (): Promise<DatabaseCheckResult> => {
  const checkedAt = new Date().toISOString();

  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true, database: "ok", checkedAt };
  } catch (error) {
    return {
      ok: false,
      database: "unavailable",
      checkedAt,
      error: error instanceof Error ? error.message : "Unknown database error",
    };
  }
};
