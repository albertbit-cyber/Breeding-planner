import type { ResultFinding, TestOrder, TestResult } from "../../types/lab";
import type { CertificatePartyInfo, LabCertificateTemplateData } from "../../types/labCertificate";
import { resolveLabTestNumber } from "./testNumber";

type StoredSnakeLike = {
  id?: string;
  name?: string;
  code?: string;
  displayId?: string;
  externalId?: string;
  morph?: string;
  genetics?: string;
  morphs?: unknown;
  hets?: unknown;
  possibleHets?: unknown;
};

type CertificateTemplateInput = {
  order: TestOrder;
  result: Pick<TestResult, "id" | "testCode" | "reportedAt" | "reviewedAt" | "releasedAt" | "summary" | "findings">;
  certificateId: string;
  certificateNumber: string;
  verificationCode: string;
  issueDateIso?: string;
  breeder?: CertificatePartyInfo | null;
  snake?: StoredSnakeLike | null;
};

const CERTIFICATE_DATE_LOCALE = "en-US";

export const PROHERPER_CERTIFICATE_ISSUER = {
  brandName: "PRO HERPER",
  ownerName: "Jurgen Wuyts",
  addressLine1: "Wijngaardstraat 27",
  cityLine: "2390 Diest, Belgium",
  phone: "+32 95 32 07 98",
  email: "Info@proherper.com",
  iban: "BE62 0636 4963 1061",
  bic: "GKCCBEBB",
} as const;

export const PROHERPER_CERTIFICATE_DISCLAIMERS = [
  "Every line represents a separate test for a given snake.",
  "A heterozygous result confirms the snake carries one copy of the tested mutation and is shown as Het <gene>.",
  "A visual result confirms the tested mutation is present in visual form and is shown as the gene name itself.",
  "A negative result means the tested mutation was not detected in this sample and is shown as Negative.",
  "Negative results are highly informative, but rare line variation can still cause a false negative in uncommon cases.",
];

const normalizeStringList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.map((entry) => String(entry || "").trim()).filter(Boolean)
    : [];

const firstNonEmpty = (...values: Array<unknown>): string | undefined => {
  for (const value of values) {
    const normalized = String(value || "").trim();
    if (normalized) {
      return normalized;
    }
  }
  return undefined;
};

const normalizeGeneLabel = (value: unknown): string =>
  String(value || "").replace(/\s+/g, " ").trim();

const formatCertificateDate = (value: string | undefined): string => {
  const normalized = String(value || "").trim();
  if (!normalized) return "-";
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return normalized;
  return parsed.toLocaleDateString(CERTIFICATE_DATE_LOCALE);
};

const formatCertificateHetToken = (rawHet: unknown): string => {
  let working = String(rawHet || "").replace(/\s+/g, " ").trim();
  if (!working) return "";

  const parts: string[] = [];
  const percentMatch = working.match(/^(\d{1,3}%)(?:\s+)(.*)$/i);
  if (percentMatch) {
    parts.push(percentMatch[1].trim());
    working = percentMatch[2].trim();
  }

  const qualifierMatch = working.match(/^(pos(?:s?i?a?ble)?|probable|maybe|ph)\b\s*(.*)$/i);
  if (qualifierMatch) {
    const qualifierLookup: Record<string, string> = {
      pos: "Possible",
      possible: "Possible",
      possiable: "Possible",
      posible: "Possible",
      probable: "Probable",
      maybe: "Maybe",
      ph: "Possible",
    };
    parts.push(qualifierLookup[qualifierMatch[1].toLowerCase()] || qualifierMatch[1]);
    working = qualifierMatch[2].trim();
  }

  working = working.replace(/\bhet\b/gi, " ").replace(/\s+/g, " ").trim();
  const gene = normalizeGeneLabel(working);
  if (!gene) return "";

  return [...parts, "Het", gene].join(" ").replace(/\s+/g, " ").trim();
};

const buildMorphSummary = (snake: StoredSnakeLike | null | undefined): string | undefined => {
  if (!snake || typeof snake !== "object") return undefined;

  const direct = firstNonEmpty(snake.genetics);
  if (direct) {
    return direct;
  }

  const summary = [
    ...normalizeStringList(snake.morphs).map((entry) => normalizeGeneLabel(entry)),
    ...normalizeStringList(snake.hets).map((entry) => formatCertificateHetToken(entry)),
    ...normalizeStringList(snake.possibleHets).map((entry) => formatCertificateHetToken(`Possible ${entry}`)),
  ];

  const normalizedSummary = summary.filter(Boolean);
  if (normalizedSummary.length) {
    return normalizedSummary.join(", ");
  }

  return firstNonEmpty(snake.morph);
};

const normalizeBreeder = (breeder: CertificatePartyInfo | null | undefined): CertificatePartyInfo => ({
  name: firstNonEmpty(breeder?.name),
  businessName: firstNonEmpty(breeder?.businessName),
  email: firstNonEmpty(breeder?.email),
  phone: firstNonEmpty(breeder?.phone),
  street: firstNonEmpty(breeder?.street, breeder?.addressLine1),
  addressLine1: firstNonEmpty(breeder?.addressLine1, breeder?.street),
  addressLine2: firstNonEmpty(breeder?.addressLine2),
  city: firstNonEmpty(breeder?.city),
  stateOrRegion: firstNonEmpty(breeder?.stateOrRegion),
  postalCode: firstNonEmpty(breeder?.postalCode),
  country: firstNonEmpty(breeder?.country),
});

export const formatCertificateOutcomeLabel = (value: unknown): string => {
  const normalized = String(value || "").trim();
  if (normalized === "carrierDetected") return "Heterozygous";
  if (normalized === "positive") return "Visual";
  if (normalized === "negative") return "Negative";
  if (normalized === "notDetected") return "Negative";
  if (normalized === "inconclusive") return "Inconclusive";
  return normalized || "-";
};

const formatCertificateGeneCall = (geneName: string, outcome: unknown): string => {
  const canonicalGene = normalizeGeneLabel(geneName) || geneName || "Ordered Test";
  const normalizedOutcome = String(outcome || "").trim();
  if (normalizedOutcome === "carrierDetected") return `Het ${canonicalGene}`;
  if (normalizedOutcome === "positive") return canonicalGene;
  if (normalizedOutcome === "negative" || normalizedOutcome === "notDetected") return "Negative";
  return formatCertificateOutcomeLabel(normalizedOutcome);
};

export const resolveCertificateSnakeDisplayId = (
  order: TestOrder,
  snake: StoredSnakeLike | null | undefined
): string =>
  firstNonEmpty(snake?.code, snake?.displayId, snake?.externalId, order.animalId) || order.animalId;

const toCertificateRows = (
  order: TestOrder,
  result: Pick<TestResult, "id" | "testCode" | "reportedAt" | "reviewedAt" | "releasedAt" | "summary" | "findings">,
  issueDateIso: string,
  snake: StoredSnakeLike | null | undefined
) => {
  const resultDateSource = firstNonEmpty(result.reportedAt, result.releasedAt, result.reviewedAt, issueDateIso);
  const testNumber = resolveLabTestNumber(
    firstNonEmpty(result.testCode, order.orderNumber, order.id),
    `${order.id}:${result.id}`,
    resultDateSource
  );
  const testDate = formatCertificateDate(
    resultDateSource
  );
  const testCode = testNumber;
  const snakeId = resolveCertificateSnakeDisplayId(order, snake);
  const morph = buildMorphSummary(snake);
  const findings = Array.isArray(result.findings) ? result.findings : [];

  if (!findings.length) {
    const fallbackGene = normalizeGeneLabel(firstNonEmpty(order.requestedTests?.[0], result.summary, "Ordered Test")) || "Ordered Test";
    const fallbackResult = formatCertificateGeneCall(fallbackGene, result.summary || "inconclusive");
    return [
      {
        test: fallbackGene,
        phenotype: fallbackGene,
        testNumber,
        testDate,
        testCode,
        snakeId,
        morph,
        result: fallbackResult,
        genotype: fallbackResult,
      },
    ];
  }

  const multiTest = findings.length > 1;

  return findings.map((finding: ResultFinding, index: number) => {
    const subLabel = multiTest ? String.fromCharCode(65 + index) : ""; // A, B, C, ...
    const rowTestNumber = `${testNumber}${subLabel}`;
    const rowTestCode = `${testCode}${subLabel}`;
    const geneName = normalizeGeneLabel(firstNonEmpty(finding.sourceOrderedName, finding.marker, "Ordered Test")) || "Ordered Test";
    const outcomeLabel = formatCertificateGeneCall(geneName, finding.outcome);
    return {
      test: geneName,
      phenotype: geneName,
      testNumber: rowTestNumber,
      testDate,
      testCode: rowTestCode,
      snakeId,
      morph,
      result: outcomeLabel,
      genotype: outcomeLabel,
    };
  });
};

export const buildLabCertificateTemplateData = ({
  order,
  result,
  certificateId,
  certificateNumber,
  verificationCode,
  issueDateIso,
  breeder,
  snake,
}: CertificateTemplateInput): LabCertificateTemplateData => {
  const resolvedIssueDateIso = firstNonEmpty(
    issueDateIso,
    result.reportedAt,
    result.releasedAt,
    result.reviewedAt,
    order.updatedAt,
    order.submittedAt,
    new Date().toISOString()
  ) || new Date().toISOString();
  const normalizedBreeder = normalizeBreeder(breeder);
  const snakeDisplayId = resolveCertificateSnakeDisplayId(order, snake);
  const snakeMorph = buildMorphSummary(snake);

  return {
    templateVersion: "v2",
    certificateId,
    certificateNumber,
    verificationCode,
    issueDateIso: resolvedIssueDateIso,
    verificationUrl: `https://proherper.example/verify/${encodeURIComponent(verificationCode)}`,
    orderId: order.id,
    labId: order.labId,
    issuer: PROHERPER_CERTIFICATE_ISSUER,
    snake: {
      id: order.animalId,
      displayId: snakeDisplayId,
      name: firstNonEmpty(snake?.name),
      morph: snakeMorph,
    },
    breeder: normalizedBreeder,
    resultRows: toCertificateRows(order, result, resolvedIssueDateIso, snake),
    disclaimers: [...PROHERPER_CERTIFICATE_DISCLAIMERS],
  };
};
