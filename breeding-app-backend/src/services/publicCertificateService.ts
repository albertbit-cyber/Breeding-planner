import { prisma } from "../lib/prisma";
import { speciesName } from "./speciesCatalogService";

/**
 * Public certificate verification.
 *
 * A certificate's verification code is printed on the PDF so that someone who
 * is *not* on the platform -- a buyer, typically -- can check it. This is the
 * only door through which a stranger reaches certificate data, so the rule is
 * strict: confirm the certificate, and say nothing about the breeder's wider
 * records.
 *
 * The stored snapshot is the whole order as the breeder app reads it, which
 * carries the breeder's email and name, the laboratory's bank details, every
 * other animal on the order and every analyst note. None of that may leave
 * here. The response is therefore built field by field from an allowlist, never
 * by spreading or filtering the snapshot: a field added to the snapshot later
 * stays private until someone decides, here, that it is public.
 */

export type CertifiedTestLine = {
  test: string;
  result: string;
};

export type PublicCertificateVerification =
  | {
      valid: true;
      certificateNumber: string;
      labName: string | null;
      species: string | null;
      testsSummary: CertifiedTestLine[];
      issuedAt: string;
    }
  | { valid: false };

const NOT_FOUND: PublicCertificateVerification = Object.freeze({ valid: false }) as PublicCertificateVerification;

/**
 * Codes are 24 uppercase hex characters (a SHA-256 prefix, see
 * labCertificateService). People retype them from paper, so spaces, dashes and
 * case are forgiven; anything else is simply not a code.
 */
export const normalizeVerificationCode = (raw: unknown): string =>
  String(raw ?? "")
    .slice(0, 64)
    .replace(/[\s-]+/g, "")
    .toUpperCase();

const CODE_PATTERN = /^[0-9A-F]{24}$/;

// A code that cannot exist is still looked up -- against a value that never
// matches -- so a malformed code and an unknown one cost the same database
// round trip and cannot be told apart by timing.
const UNMATCHABLE_CODE = "-";

const text = (value: unknown): string => String(value ?? "").replace(/\s+/g, " ").trim();

/**
 * Same wording the certificate PDF uses, so the page and the paper agree. A
 * finding stores the genotype label ("het Clown", "Super Fire", "Negative");
 * the outcome words are only for findings recorded before it existed.
 */
const geneCall = (gene: string, outcome: unknown, label?: unknown): string => {
  const stored = text(label);
  if (stored) return stored;
  const normalized = text(outcome);
  if (normalized === "carrierDetected") return `het ${gene}`;
  if (normalized === "positive") return gene;
  if (normalized === "negative" || normalized === "notDetected") return "Negative";
  if (normalized === "inconclusive") return "Inconclusive";
  return normalized || "Inconclusive";
};

const asArray = (value: unknown): any[] => (Array.isArray(value) ? value : []);

/**
 * The certified result lines for the one result this certificate records,
 * reduced to test name and call. Sample ids, analyst ids, notes and every
 * other animal's results are left behind.
 */
export const summarizeTests = (snapshot: any, resultId: string | null, animalAppId: string): CertifiedTestLine[] => {
  const results = asArray(snapshot?.results);
  const result =
    (resultId && results.find((entry) => text(entry?.id) === resultId)) ||
    results.find((entry) => text(entry?.animalId) === animalAppId && text(entry?.status) === "completed");
  if (!result) return [];

  const findings = asArray(result.findingsJson ?? result.findings);
  if (findings.length) {
    return findings
      .map((finding) => {
        const gene = text(finding?.sourceOrderedName) || text(finding?.marker);
        return gene ? { test: gene, result: geneCall(gene, finding?.outcome, finding?.label) } : null;
      })
      .filter((line): line is CertifiedTestLine => Boolean(line));
  }

  // No structured findings: fall back the way the PDF does, to the ordered test
  // name and the result's own summary.
  const animal = asArray(snapshot?.animals).find((entry) => text(entry?.animalId) === animalAppId);
  const ordered = text(asArray(animal?.tests)[0]?.testNameSnapshot) || text(result.testCode) || "Ordered test";
  return [{ test: ordered, result: geneCall(ordered, result.summary) }];
};

const labNameFrom = (snapshot: any): string | null =>
  text(snapshot?.labOrganization?.labAccount?.labName) || text(snapshot?.labOrganization?.name) || null;

/**
 * The species the certified tests were for, read from the laboratory's test
 * offerings. Named only when they agree on exactly one species: a multi-species
 * test (a colubrid sexing panel, say) cannot tell us which animal was tested,
 * and a guess would be a claim the record does not support.
 */
const speciesFrom = async (snapshot: any, animalAppId: string): Promise<string | null> => {
  const animal = asArray(snapshot?.animals).find((entry) => text(entry?.animalId) === animalAppId);
  const offeringIds = Array.from(
    new Set(asArray(animal?.tests).map((test) => text(test?.offeringId)).filter(Boolean))
  );
  if (!offeringIds.length) return null;

  const offerings: Array<{ speciesIds: string[] }> = await (prisma as any).labTestOffering.findMany({
    where: { id: { in: offeringIds } },
    select: { speciesIds: true },
  });

  const candidates = offerings.map((offering) => new Set(asArray(offering?.speciesIds).map(text)));
  if (!candidates.length) return null;
  const shared = Array.from(candidates[0]).filter((id) => id && candidates.every((set) => set.has(id)));
  return shared.length === 1 ? speciesName(shared[0]) : null;
};

export const verifyCertificateByCode = async (rawCode: unknown): Promise<PublicCertificateVerification> => {
  const code = normalizeVerificationCode(rawCode);
  const lookup = CODE_PATTERN.test(code) ? code : UNMATCHABLE_CODE;

  const row = await prisma.shedTestCertificate.findUnique({
    where: { verificationCode: lookup },
    select: {
      animalAppId: true,
      resultId: true,
      certificateNumber: true,
      issuedAt: true,
      snapshotJson: true,
    },
  });
  if (!row) return NOT_FOUND;

  const snapshot = row.snapshotJson as any;
  return {
    valid: true,
    certificateNumber: row.certificateNumber,
    labName: labNameFrom(snapshot),
    species: await speciesFrom(snapshot, row.animalAppId),
    testsSummary: summarizeTests(snapshot, row.resultId, row.animalAppId),
    issuedAt: row.issuedAt.toISOString(),
  };
};
