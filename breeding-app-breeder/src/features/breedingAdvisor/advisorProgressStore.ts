/**
 * Breeding Advisor – progress state manager.
 *
 * A lightweight external store built on the React 18
 * `useSyncExternalStore` contract.  All helper functions produce a
 * brand-new state snapshot so React can detect changes with a
 * referential equality check.
 */

import { useSyncExternalStore } from "react";
import type {
  AdvisorProgressEvent,
  AdvisorProgressStep,
  AdvisorProgressSummary,
  AdvisorStepStatus,
} from "./advisorProgressTypes";

// ─── State shape ─────────────────────────────────────────────────────────────

export interface AdvisorRunState {
  isOpen: boolean;
  isRunning: boolean;
  steps: AdvisorProgressStep[];
  summary: AdvisorProgressSummary | null;
  error: string | null;
}

const INITIAL_STATE: AdvisorRunState = {
  isOpen: false,
  isRunning: false,
  steps: [],
  summary: null,
  error: null,
};

// ─── Minimal external store ───────────────────────────────────────────────────

type Listener = () => void;

let _state: AdvisorRunState = { ...INITIAL_STATE };
const _listeners = new Set<Listener>();

const getSnapshot = (): AdvisorRunState => _state;

const subscribe = (listener: Listener): (() => void) => {
  _listeners.add(listener);
  return () => _listeners.delete(listener);
};

const setState = (next: Partial<AdvisorRunState>): void => {
  _state = { ..._state, ...next };
  _listeners.forEach((fn) => fn());
};

// ─── Helper functions ─────────────────────────────────────────────────────────

/** Mark the progress panel as visible. */
export const openAdvisorProgress = (): void =>
  setState({ isOpen: true });

/** Mark the progress panel as hidden (does NOT reset progress data). */
export const closeAdvisorProgress = (): void =>
  setState({ isOpen: false });

/**
 * Fully reset all progress state.
 * Call before starting a new advisor run.
 */
export const resetAdvisorProgress = (): void =>
  setState({ ...INITIAL_STATE });

// ─── Step management ─────────────────────────────────────────────────────────

/** Append a new step to the steps list. */
export const addAdvisorStep = (step: AdvisorProgressStep): void =>
  setState({ steps: [..._state.steps, step] });

/** Merge `patch` into the step identified by `id`. */
export const updateAdvisorStep = (
  id: string,
  patch: Partial<AdvisorProgressStep>
): void =>
  setState({
    steps: _state.steps.map((s) =>
      s.id === id ? { ...s, ...patch } : s
    ),
  });

/**
 * Mark a step as completed.
 * Automatically sets `status` and `completedAt` unless overridden by `patch`.
 */
export const completeAdvisorStep = (
  id: string,
  patch?: Partial<AdvisorProgressStep>
): void =>
  updateAdvisorStep(id, {
    status: "completed" as AdvisorStepStatus,
    completedAt: Date.now(),
    ...patch,
  });

/**
 * Mark a step as failed.
 * Stores the error message in the step's `details` field and sets the
 * top-level `error` for callers that display a single error banner.
 */
export const failAdvisorStep = (id: string, error?: string): void => {
  updateAdvisorStep(id, {
    status: "failed" as AdvisorStepStatus,
    completedAt: Date.now(),
    details: error,
  });
  if (error) {
    setState({ error, isRunning: false });
  }
};

// ─── Run lifecycle helpers ────────────────────────────────────────────────────

/** Signal that the advisor run has started. */
export const startAdvisorRun = (): void =>
  setState({ isRunning: true, error: null, summary: null });

/** Signal that the advisor run has finished (success). */
export const finishAdvisorRun = (): void =>
  setState({ isRunning: false });

// ─── Summary ─────────────────────────────────────────────────────────────────

/** Store the final statistics summary produced at the end of a run. */
export const setAdvisorSummary = (summary: AdvisorProgressSummary): void =>
  setState({ summary });

// ─── Progress event adapter ──────────────────────────────────────────────────

const getStepById = (id: string): AdvisorProgressStep | undefined =>
  _state.steps.find((step) => step.id === id);

/**
 * Convert engine progress events into UI store updates.
 *
 * - stage-start    -> append new running step (or refresh existing)
 * - stage-update   -> patch step details/meta progressively
 * - stage-complete -> mark step completed
 * - stage-failed   -> mark step failed + set top-level error
 * - summary        -> update run summary
 */
export const handleAdvisorProgress = (event: AdvisorProgressEvent): void => {
  const now = Date.now();
  const existing = getStepById(event.stepId);

  if (event.type === "summary") {
    if (event.meta) {
      setAdvisorSummary(event.meta as AdvisorProgressSummary);
    }
    return;
  }

  if (event.type === "stage-start") {
    if (existing) {
      updateAdvisorStep(event.stepId, {
        label: event.label,
        status: "running",
        startedAt: existing.startedAt ?? now,
        completedAt: undefined,
        ...(event.details ? { details: event.details } : {}),
        ...(event.meta ? { meta: event.meta } : {}),
      });
      return;
    }

    addAdvisorStep({
      id: event.stepId,
      label: event.label,
      status: "running",
      startedAt: now,
      ...(event.details ? { details: event.details } : {}),
      ...(event.meta ? { meta: event.meta } : {}),
    });
    return;
  }

  if (event.type === "stage-update") {
    if (!existing) {
      addAdvisorStep({
        id: event.stepId,
        label: event.label,
        status: "running",
        startedAt: now,
        ...(event.details ? { details: event.details } : {}),
        ...(event.meta ? { meta: event.meta } : {}),
      });
      return;
    }

    updateAdvisorStep(event.stepId, {
      label: event.label || existing.label,
      ...(event.details ? { details: event.details } : {}),
      ...(event.meta ? { meta: event.meta } : {}),
    });
    return;
  }

  if (event.type === "stage-complete") {
    if (!existing) {
      addAdvisorStep({
        id: event.stepId,
        label: event.label,
        status: "running",
        startedAt: now,
      });
    }

    completeAdvisorStep(event.stepId, {
      label: event.label,
      ...(event.details ? { details: event.details } : {}),
      ...(event.meta ? { meta: event.meta } : {}),
    });
    return;
  }

  if (!existing) {
    addAdvisorStep({
      id: event.stepId,
      label: event.label,
      status: "running",
      startedAt: now,
    });
  }

  failAdvisorStep(event.stepId, event.details || event.label);
};

// ─── React hook ──────────────────────────────────────────────────────────────

/**
 * Subscribe a React component to the advisor progress store.
 *
 * ```tsx
 * const { isRunning, steps, summary, error } = useAdvisorProgress();
 * ```
 */
export const useAdvisorProgress = (): AdvisorRunState =>
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
