import { purgeDueAccounts } from "./accountDeletionService";

/**
 * Background sweep that carries out deletions whose grace period has expired.
 *
 * Deliberately slow: erasure is not time-critical to the hour, and a long
 * interval keeps a bug in the purge path from chewing through many accounts
 * before anyone notices. Hourly comfortably meets the one-month obligation.
 */
const DEFAULT_INTERVAL_MS = 60 * 60 * 1000;

let timer: ReturnType<typeof setInterval> | null = null;
let inFlightTick: Promise<number> = Promise.resolve(0);

export const runPurgeTick = async (): Promise<number> => {
  const purged = await purgeDueAccounts();
  if (purged > 0) {
    console.info("[account-purge] completed scheduled deletions", { purged });
  }
  return purged;
};

export const startAccountPurgeWorker = (intervalMs = DEFAULT_INTERVAL_MS): void => {
  if (timer) return;

  timer = setInterval(() => {
    // Chained rather than fired-and-forgotten so two ticks can never run
    // concurrently and try to delete the same account twice.
    inFlightTick = inFlightTick.then(() =>
      runPurgeTick().catch((error) => {
        console.error("[account-purge] tick failed", error instanceof Error ? error.message : error);
        return 0;
      })
    );
  }, intervalMs);
  timer.unref?.();

  console.info("[account-purge] started", { intervalMs });
};

export const stopAccountPurgeWorker = async (): Promise<void> => {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  await inFlightTick;
};
