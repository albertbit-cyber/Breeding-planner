/**
 * Progress-tracking types for the Breeding Advisor pipeline.
 * This file contains type definitions only — no runtime logic.
 */

export type AdvisorStepStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface AdvisorProgressStep {
  id: string;
  label: string;
  details?: string;
  status: AdvisorStepStatus;
  startedAt?: number;
  completedAt?: number;
  meta?: Record<string, unknown>;
}

export interface AdvisorProgressSummary {
  totalSnakesScanned?: number;
  relevantCandidates?: number;
  validMales?: number;
  validFemales?: number;
  pairingsGenerated?: number;
  strongPairings?: number;
  targetGenes?: string[];
}

export interface AdvisorProgressEvent {
  type:
    | 'stage-start'
    | 'stage-update'
    | 'stage-complete'
    | 'stage-failed'
    | 'summary';

  stepId: string;
  label: string;
  details?: string;
  meta?: Record<string, unknown>;
}

export type AdvisorProgressReporter = (event: AdvisorProgressEvent) => void;
