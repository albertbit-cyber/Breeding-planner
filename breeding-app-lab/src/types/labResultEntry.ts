import type { ResultFinding } from "./lab";

/**
 * The answers a laboratory may record for one ordered test. Which ones apply
 * depends on the gene's inheritance, which the backend resolves per ordered
 * test and sends as `inheritance` (see RESULT_OPTIONS_BY_INHERITANCE).
 *
 * `visual` is the old catch-all positive; still readable from stored drafts,
 * never offered any more.
 */
export type LabResultStatus =
  | "not_detected"
  | "not_present"
  | "heterozygous"
  | "homozygous"
  | "single_gene"
  | "super_form"
  | "present"
  | "visual"
  | "male"
  | "female";

export type InheritanceKind = "recessive" | "incomplete_dominant" | "dominant" | "sex" | "unknown";

export interface TestInheritance {
  kind: InheritanceKind;
  /** The gene as the species table spells it; the ordered name when unknown. */
  gene: string;
  /** Trade name of the super form when the table knows one. */
  superGeneName?: string | null;
  speciesId?: string | null;
}

export interface OrderedTestTemplateItem {
  orderedTestKey: string;
  geneName: string;
  sourceOrderedName: string;
  catalogTestId?: string;
  inheritance?: TestInheritance;
}

export interface ResultEntryItemInput {
  orderedTestKey: string;
  geneName?: string;
  resultStatus: LabResultStatus;
  notes?: string;
  confidence?: number;
}

export interface AnimalResultGroup {
  animalId: string;
  animalName?: string;
  items: OrderedTestTemplateItem[];
  existingResult?: {
    id: string;
    status: string;
    testCode: string;
    method?: string;
    summary?: string;
    notes?: string;
    items: ResultEntryItemInput[];
  };
}

export interface LabResultEntryTemplate {
  orderId: string;
  requestedTests: string[];
  /** Grouped by animal — use this for multi-animal batch orders */
  animals?: AnimalResultGroup[];
  /** Flat list of all items across all animals (backward compat for single-animal orders) */
  items: OrderedTestTemplateItem[];
  existingResult?: {
    id: string;
    status: string;
    testCode: string;
    method?: string;
    summary?: string;
    notes?: string;
    items: ResultEntryItemInput[];
  };
}

/**
 * The dropdown per inheritance. An unknown gene gets the recessive set, and
 * the form says so next to it rather than guessing silently.
 */
export const RESULT_OPTIONS_BY_INHERITANCE: Record<InheritanceKind, LabResultStatus[]> = {
  recessive: ["not_detected", "heterozygous", "homozygous"],
  incomplete_dominant: ["not_detected", "single_gene", "super_form"],
  dominant: ["not_present", "present"],
  sex: ["male", "female"],
  unknown: ["not_detected", "heterozygous", "homozygous"],
};

export const resultOptionsFor = (inheritance?: TestInheritance | null): LabResultStatus[] =>
  RESULT_OPTIONS_BY_INHERITANCE[inheritance?.kind || "unknown"] || RESULT_OPTIONS_BY_INHERITANCE.unknown;

/**
 * What the breeder will read for an answer: the genotype itself. Mirrors the
 * backend's RESULT_STATUS_RULES; the stored finding carries the authoritative
 * label, this is only for previewing it in the dropdown.
 */
export const genotypeLabelFor = (status: LabResultStatus | "", gene: string): string => {
  switch (status) {
    case "not_detected":
      return "Negative";
    case "not_present":
      return "Not present";
    case "heterozygous":
      return `het ${gene}`;
    case "super_form":
      return `Super ${gene}`;
    case "homozygous":
    case "single_gene":
    case "present":
    case "visual":
      return gene;
    case "male":
      return "Male";
    case "female":
      return "Female";
    default:
      return "";
  }
};

/** Kept for the legacy single-dropdown callers; new code uses resultOptionsFor. */
export const LAB_RESULT_STATUS_OPTIONS: Array<{ value: LabResultStatus; label: string }> = [
  { value: "not_detected", label: "Negative" },
  { value: "heterozygous", label: "Heterozygous" },
  { value: "homozygous", label: "Homozygous" },
];

export const LAB_RESULT_STATUS_TO_OUTCOME: Record<LabResultStatus, ResultFinding["outcome"] | "reported"> = {
  not_detected: "notDetected",
  not_present: "notDetected",
  heterozygous: "carrierDetected",
  homozygous: "positive",
  single_gene: "positive",
  super_form: "positive",
  present: "positive",
  visual: "positive",
  male: "reported",
  female: "reported",
};
