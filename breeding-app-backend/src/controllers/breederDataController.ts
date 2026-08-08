import type { Request, Response } from "express";
import { HttpError } from "../utils/errors";
import { listBreederSnapshot, upsertBreederSnapshot } from "../services/breederDataService";

// Cloud sync carries an account's whole dataset, so it grows quietly until it breaks something --
// first as 413s, later as a transaction timeout. Logging the shape of every upload means the next
// wall shows up in the logs while it is still just a big number.
const SNAPSHOT_WARN_BYTES = 5 * 1024 * 1024;

const logUploadSize = (req: Request, body: Record<string, unknown>): void => {
  const bytes = Number(req.headers["content-length"] || 0);
  const count = (value: unknown): number => (Array.isArray(value) ? value.length : 0);
  const summary =
    `[cloud-sync] upload user=${req.user?.id || "unknown"} bytes=${bytes} ` +
    `animals=${count(body.animals)} pairings=${count(body.pairings)} clutches=${count(body.clutches)}`;

  if (bytes >= SNAPSHOT_WARN_BYTES) {
    console.warn(`${summary} OVER-THRESHOLD (>=${Math.round(SNAPSHOT_WARN_BYTES / 1024 / 1024)}MB)`);
  } else {
    console.log(summary);
  }
};

const parseSince = (raw: unknown): Date | null => {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const parsed = new Date(raw);
  if (!Number.isFinite(parsed.getTime())) {
    throw new HttpError(400, "since must be an ISO-8601 timestamp.");
  }
  return parsed;
};

export const getBreederSnapshot = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  // No ?since means the full snapshot, exactly as before, which is what a first load or a new
  // device needs and what every already-installed build asks for.
  const since = parseSince(req.query.since);
  const snapshot = await listBreederSnapshot(req.user.id, { since });
  res.status(200).json(snapshot);
};

export const putBreederSnapshot = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  const body = (req.body || {}) as Record<string, unknown>;
  logUploadSize(req, body);

  const { snapshot, changed } = await upsertBreederSnapshot(req.user.id, body);

  // Opt-in: returning only what changed saves re-sending the entire account on every write, but
  // installed builds parse the full snapshot from this response, so the default cannot change
  // until those have aged out.
  const wantsChangedOnly = req.query.ack === "changed";
  res.status(200).json(wantsChangedOnly ? changed : snapshot);
};
