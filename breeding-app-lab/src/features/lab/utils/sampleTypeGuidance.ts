import type { SampleType } from "../../../types/lab";

export const DEFAULT_SAMPLE_TYPE: SampleType = "shed";

export type SampleTypeOption = {
  value: SampleType;
  labelKey: string;
  defaultLabel: string;
};

export type SampleTypeGuidance = {
  messageKey: string;
  defaultMessage: string;
  durationMs?: number;
};

export const SAMPLE_TYPE_OPTIONS: SampleTypeOption[] = [
  { value: "shed", labelKey: "lab.orders.sampleTypeShed", defaultLabel: "Shed" },
  { value: "bellyScaleClip", labelKey: "lab.orders.sampleTypeBellyScaleClip", defaultLabel: "Belly Scale Clip" },
];

const SAMPLE_TYPE_GUIDANCE_MAP: Partial<Record<SampleType, SampleTypeGuidance>> = {
  bellyScaleClip: {
    messageKey: "lab.orders.guidance.bellyScaleClip",
    defaultMessage: "Please send 3-4 scale clips to ensure successful testing.",
    durationMs: 4000,
  },
};

export const getSampleTypeGuidance = (sampleType: SampleType): SampleTypeGuidance | null => {
  return SAMPLE_TYPE_GUIDANCE_MAP[sampleType] || null;
};
