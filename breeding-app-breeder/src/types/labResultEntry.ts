import type { ResultFinding } from "./lab";

export type LabResultStatus = "not_detected" | "heterozygous" | "visual";

export interface OrderedTestTemplateItem {
  orderedTestKey: string;
  geneName: string;
  sourceOrderedName: string;
  catalogTestId?: string;
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

export const LAB_RESULT_STATUS_OPTIONS: Array<{ value: LabResultStatus; label: string }> = [
  { value: "not_detected", label: "Negative" },
  { value: "heterozygous", label: "Heterozygous" },
  { value: "visual", label: "Visual" },
];

export const LAB_RESULT_STATUS_TO_OUTCOME: Record<LabResultStatus, ResultFinding["outcome"]> = {
  not_detected: "notDetected",
  heterozygous: "carrierDetected",
  visual: "positive",
};
