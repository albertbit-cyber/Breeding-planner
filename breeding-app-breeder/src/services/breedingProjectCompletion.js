export const BREEDING_PROJECT_WORKFLOW_STATUSES = ['active', 'completed', 'archived'];

export const COMPLETION_REASON_GROUPS = [
  {
    key: 'productive',
    label: 'Productive outcome',
    options: [
      { value: 'eggs_laid', label: 'Eggs laid' },
      { value: 'live_birth', label: 'Live birth' },
    ],
  },
  {
    key: 'no_expected_offspring',
    label: 'No expected offspring',
    options: [
      { value: 'no_ovulation_observed', label: 'No ovulation observed' },
      { value: 'follicles_reabsorbed', label: 'Follicles reabsorbed' },
      { value: 'ovulated_no_eggs', label: 'Ovulated but no eggs produced' },
      { value: 'season_skipped', label: 'Female skipped the season' },
      { value: 'season_ended', label: 'Season ended without expected offspring' },
      { value: 'pairing_unsuccessful', label: 'Pairing did not result in a reproductive outcome' },
    ],
  },
  {
    key: 'project_stopped',
    label: 'Project stopped',
    options: [
      { value: 'health_reason', label: 'Stopped for health or welfare reasons' },
      { value: 'breeding_stopped', label: 'Breeding stopped manually' },
    ],
  },
  {
    key: 'uncertain',
    label: 'Uncertain',
    options: [
      { value: 'unknown_outcome', label: 'Outcome unknown' },
      { value: 'other', label: 'Other' },
    ],
  },
];

export const COMPLETION_REASONS = COMPLETION_REASON_GROUPS.flatMap(group => group.options);
export const COMPLETION_REASON_LABELS = Object.fromEntries(COMPLETION_REASONS.map(option => [option.value, option.label]));
export const PRODUCTIVE_COMPLETION_REASONS = new Set(['eggs_laid', 'live_birth']);

export const OUTCOME_CONFIDENCE_OPTIONS = [
  { value: 'confirmed', label: 'Confirmed', description: 'The breeder considers the recorded outcome definitive.' },
  { value: 'likely', label: 'Likely', description: 'The project appears finished, but a later reproductive event remains possible.' },
  { value: 'unknown', label: 'Unknown', description: 'There was insufficient observation to determine the biological outcome confidently.' },
];

export const OUTCOME_CONFIDENCE_LABELS = Object.fromEntries(
  OUTCOME_CONFIDENCE_OPTIONS.map(option => [option.value, option.label])
);

export function normalizeWorkflowStatus(pairing = {}) {
  const raw = String(pairing.workflowStatus || pairing.status || '').trim().toLowerCase();
  return BREEDING_PROJECT_WORKFLOW_STATUSES.includes(raw) ? raw : 'active';
}

export function getCompletionReasonLabel(reason) {
  return COMPLETION_REASON_LABELS[reason] || 'Unknown outcome';
}

export function getOutcomeConfidenceLabel(confidence) {
  return OUTCOME_CONFIDENCE_LABELS[confidence] || 'Unknown';
}

export function needsOutcomeConfidence(reason) {
  return !PRODUCTIVE_COMPLETION_REASONS.has(reason);
}

export function normalizeCompletionMetadata(pairing = {}) {
  const reason = String(pairing.completionReason || '').trim();
  const confidence = String(pairing.outcomeConfidence || '').trim();
  return {
    workflowStatus: normalizeWorkflowStatus(pairing),
    completionReason: COMPLETION_REASON_LABELS[reason] ? reason : '',
    outcomeConfidence: OUTCOME_CONFIDENCE_LABELS[confidence] ? confidence : '',
    completedAt: pairing.completedAt || null,
    completedBy: pairing.completedBy || null,
    completionNote: pairing.completionNote || '',
    reopenedAt: pairing.reopenedAt || null,
    reopenedBy: pairing.reopenedBy || null,
    statusHistory: Array.isArray(pairing.statusHistory) ? pairing.statusHistory : [],
  };
}

export function buildCompletionPatch(pairing = {}, input = {}, actorId = null, nowIso = new Date().toISOString()) {
  const reason = String(input.reason || '').trim();
  if (!COMPLETION_REASON_LABELS[reason]) {
    throw new Error('Completion reason is required.');
  }
  const note = String(input.note || '').trim();
  if (reason === 'other' && !note) {
    throw new Error('Completion note is required when reason is Other.');
  }
  const confidence = needsOutcomeConfidence(reason)
    ? (OUTCOME_CONFIDENCE_LABELS[input.confidence] ? input.confidence : 'unknown')
    : 'confirmed';
  const existing = normalizeCompletionMetadata(pairing);
  const previousStatus = normalizeWorkflowStatus(pairing);
  const completedAt = existing.completedAt || nowIso;
  const completedBy = existing.completedBy || actorId || null;
  const historyEntry = {
    id: `status-${nowIso}`,
    from: previousStatus,
    to: 'completed',
    at: nowIso,
    actorId,
    reason,
    confidence,
  };
  return {
    workflowStatus: 'completed',
    status: 'completed',
    completionReason: reason,
    outcomeConfidence: confidence,
    completedAt,
    completedBy,
    completionNote: note,
    statusHistory: [...existing.statusHistory, historyEntry],
  };
}

export function buildReopenPatch(pairing = {}, actorId = null, nowIso = new Date().toISOString()) {
  const existing = normalizeCompletionMetadata(pairing);
  const previousStatus = normalizeWorkflowStatus(pairing);
  return {
    workflowStatus: 'active',
    status: 'active',
    reopenedAt: nowIso,
    reopenedBy: actorId || null,
    statusHistory: [
      ...existing.statusHistory,
      { id: `status-${nowIso}`, from: previousStatus, to: 'active', at: nowIso, actorId },
    ],
  };
}

export function hasConfirmedProductiveOutcome(pairing = {}) {
  return Boolean(
    pairing?.liveBirth?.recorded ||
    pairing?.clutch?.recorded ||
    pairing?.hatch?.recorded ||
    Number(pairing?.clutch?.eggsTotal || 0) > 0 ||
    Number(pairing?.clutch?.fertileEggs || 0) > 0
  );
}

export function getMajorOutcomeDates(pairing = {}) {
  const dates = [];
  if (pairing?.ovulation?.observed && pairing?.ovulation?.date) dates.push({ type: 'ovulation', date: pairing.ovulation.date });
  if (pairing?.clutch?.recorded && pairing?.clutch?.date) dates.push({ type: 'eggs_laid', date: pairing.clutch.date });
  if (pairing?.liveBirth?.recorded && pairing?.liveBirth?.date) dates.push({ type: 'live_birth', date: pairing.liveBirth.date });
  return dates;
}

export function didLateOutcomeOccur(pairing = {}) {
  const completedAt = pairing?.completedAt ? new Date(pairing.completedAt).getTime() : null;
  if (!completedAt || Number.isNaN(completedAt)) return false;
  return getMajorOutcomeDates(pairing).some(event => {
    const eventTime = new Date(event.date).getTime();
    return Number.isFinite(eventTime) && eventTime > completedAt;
  });
}

export function getFinalKnownBiologicalOutcome(pairing = {}) {
  if (pairing?.liveBirth?.recorded) return 'live_birth';
  if (pairing?.clutch?.recorded || Number(pairing?.clutch?.eggsTotal || 0) > 0) return 'eggs_laid';
  if (pairing?.ovulation?.observed) return 'ovulation_observed';
  return pairing?.completionReason || 'unknown_outcome';
}

export function shouldCountAsBiologicalSuccess(pairing = {}) {
  const finalOutcome = getFinalKnownBiologicalOutcome(pairing);
  return finalOutcome === 'eggs_laid' || finalOutcome === 'live_birth';
}

export function shouldExcludeFromBiologicalFailure(pairing = {}) {
  const reason = pairing?.completionReason;
  return reason === 'unknown_outcome' || reason === 'health_reason' || reason === 'breeding_stopped';
}
