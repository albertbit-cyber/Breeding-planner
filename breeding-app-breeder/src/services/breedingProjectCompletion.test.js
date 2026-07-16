import { describe, expect, it } from 'vitest';
import {
  buildCompletionPatch,
  buildReopenPatch,
  didLateOutcomeOccur,
  getFinalKnownBiologicalOutcome,
  shouldCountAsBiologicalSuccess,
  shouldExcludeFromBiologicalFailure,
} from './breedingProjectCompletion';

describe('breeding project completion rules', () => {
  it('completes an active project with a structured reason and confidence', () => {
    const patch = buildCompletionPatch({}, {
      reason: 'no_ovulation_observed',
      confidence: 'likely',
      note: 'No ovulation was observed by season end.',
    }, 'user-1', '2026-05-01T10:00:00.000Z');

    expect(patch.workflowStatus).toBe('completed');
    expect(patch.completionReason).toBe('no_ovulation_observed');
    expect(patch.outcomeConfidence).toBe('likely');
    expect(patch.completedAt).toBe('2026-05-01T10:00:00.000Z');
  });

  it('rejects completion without a valid reason', () => {
    expect(() => buildCompletionPatch({}, { reason: '', confidence: 'likely' })).toThrow(/Completion reason/);
  });

  it('keeps no ovulation observed distinct from follicles reabsorbed', () => {
    const noOvulation = buildCompletionPatch({}, { reason: 'no_ovulation_observed', confidence: 'likely' });
    const reabsorbed = buildCompletionPatch({}, { reason: 'follicles_reabsorbed', confidence: 'confirmed' });

    expect(noOvulation.completionReason).toBe('no_ovulation_observed');
    expect(reabsorbed.completionReason).toBe('follicles_reabsorbed');
  });

  it('detects late egg laying and counts final outcome as productive', () => {
    const pairing = {
      workflowStatus: 'completed',
      completionReason: 'no_ovulation_observed',
      outcomeConfidence: 'likely',
      completedAt: '2026-05-01T10:00:00.000Z',
      clutch: { recorded: true, date: '2026-05-20', eggsTotal: 6, fertileEggs: 5, slugs: 1 },
    };

    expect(didLateOutcomeOccur(pairing)).toBe(true);
    expect(getFinalKnownBiologicalOutcome(pairing)).toBe('eggs_laid');
    expect(shouldCountAsBiologicalSuccess(pairing)).toBe(true);
  });

  it('reopens while preserving completion metadata', () => {
    const original = {
      workflowStatus: 'completed',
      completionReason: 'season_ended',
      outcomeConfidence: 'unknown',
      completedAt: '2026-05-01T10:00:00.000Z',
      completionNote: 'Closed after season.',
    };
    const patch = buildReopenPatch(original, 'user-1', '2026-05-21T10:00:00.000Z');
    const reopened = { ...original, ...patch };

    expect(reopened.workflowStatus).toBe('active');
    expect(reopened.completionReason).toBe('season_ended');
    expect(reopened.completedAt).toBe(original.completedAt);
    expect(reopened.reopenedAt).toBe('2026-05-21T10:00:00.000Z');
  });

  it('does not automatically count unknown or stopped outcomes as biological failures', () => {
    expect(shouldExcludeFromBiologicalFailure({ completionReason: 'unknown_outcome' })).toBe(true);
    expect(shouldExcludeFromBiologicalFailure({ completionReason: 'health_reason' })).toBe(true);
    expect(shouldExcludeFromBiologicalFailure({ completionReason: 'breeding_stopped' })).toBe(true);
  });
});
