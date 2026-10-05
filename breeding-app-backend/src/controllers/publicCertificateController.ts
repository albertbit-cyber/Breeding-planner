import type { Request, Response } from "express";
import { verifyCertificateByCode } from "../services/publicCertificateService";

/**
 * Every answer, found or not, is held until this much time has passed since the
 * request arrived. A real certificate costs an extra lookup (its species) that
 * an unknown code does not, and without a floor that difference is a timing
 * oracle for which codes exist. The floor sits comfortably above both paths.
 */
const minResponseMs = (): number => {
  const configured = Number(process.env.CERTIFICATE_VERIFY_MIN_RESPONSE_MS);
  return Number.isFinite(configured) && configured >= 0 ? configured : 250;
};

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Public: confirms a certificate by the code printed on it. */
export const getCertificateVerification = async (req: Request, res: Response): Promise<void> => {
  const startedAt = Date.now();
  const verification = await verifyCertificateByCode(req.params.code);

  const remaining = minResponseMs() - (Date.now() - startedAt);
  if (remaining > 0) await wait(remaining);

  // Same status for both answers: a 404 would make "not found" cheaper to scan
  // for and is not an error from the visitor's point of view.
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json(verification);
};
