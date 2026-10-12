/**
 * Glue between the pure breeding domain and React state.
 *
 * Every action reads the current records from refs, runs the domain function (which throws on
 * an invalid input, so the dialog can keep the keeper's entry and show why), then writes the
 * changed record back with a by-id upsert. Follow-ups that the product rules attach to an
 * action (the one-calendar-month proposal after an observed lock, the review of pending
 * reminders after ovulation, linking pre-pairing scans to a new card) happen here, in one place.
 */
import { useCallback, useMemo, useRef, useEffect } from 'react';
import {
  recordPairingSession,
  addLockObservation,
  setLockStatus as setLockStatusDomain,
  removeLock as removeLockDomain,
  updateSession as updateSessionDomain,
  removeSession as removeSessionDomain,
  addCandidateMale,
  removeCandidateMale,
  setMultipleSires as setMultipleSiresDomain,
  recordEvent,
  removeEvent,
  updateClutch as updateClutchDomain,
  recordHatching as recordHatchingDomain,
  completeHatchingOutcome,
  closeCycle as closeCycleDomain,
  reopenCycle as reopenCycleDomain,
  pauseCycle as pauseCycleDomain,
  resumeCycle as resumeCycleDomain,
  setSeasonLabel as setSeasonLabelDomain,
  assignOffspringSire,
  linkOffspring as linkOffspringDomain,
  cyclesForFemale,
  CYCLE_STATUS,
} from './domain/cycleModel';
import {
  scheduleFollowUpForLock,
  applyProposal,
  reviewPlannedAfterOvulation,
  addManualPlannedPairing,
  reschedulePlannedPairing,
  skipPlannedPairing,
  cancelPlannedPairing,
} from './domain/followUps';
import { createExam, updateExam, associateExamsWithCycle, setInterpretationOverride as setOverrideDomain } from './domain/follicles';
import { normalizeBreedingSettings } from './domain/reviewRules';
import { nowIso, todayYmd, toYmd } from './domain/dates';

function upsertById(list, record) {
  const items = Array.isArray(list) ? list : [];
  const index = items.findIndex((item) => item?.id === record.id);
  if (index < 0) return [...items, record];
  return items.map((item, i) => (i === index ? record : item));
}

/** The end of the female's most recent closed cycle before `cycle`, used to bound scan association. */
export function previousCycleEnd(cycles, cycle) {
  const earlier = cyclesForFemale(cycles, cycle.femaleId)
    .filter((c) => c.id !== cycle.id && c.status === CYCLE_STATUS.CLOSED && c.startDate && cycle.startDate && c.startDate < cycle.startDate);
  const latest = earlier[0];
  if (!latest) return null;
  return latest.closure?.biologicalCompletionDate || toYmd(latest.closure?.closedAt) || latest.startDate;
}

export function useBreedingActions({ cycles, exams, settings, setCycles, setExams, setSettings, addTombstone, snakesById }) {
  const cyclesRef = useRef(cycles);
  const examsRef = useRef(exams);
  useEffect(() => { cyclesRef.current = cycles; }, [cycles]);
  useEffect(() => { examsRef.current = exams; }, [exams]);

  const writeCycle = useCallback((cycle) => {
    setCycles((prev) => upsertById(prev, cycle));
    cyclesRef.current = upsertById(cyclesRef.current, cycle);
    return cycle;
  }, [setCycles]);

  const linkExamsToCycle = useCallback((cycle) => {
    const { exams: nextExams, associated } = associateExamsWithCycle(examsRef.current, cycle, { previousCycleEnd: previousCycleEnd(cyclesRef.current, cycle), now: nowIso() });
    if (associated.length) {
      examsRef.current = nextExams;
      setExams(() => nextExams);
    }
    return associated;
  }, [setExams]);

  const withCycle = useCallback((cycleId, fn) => {
    const cycle = cyclesRef.current.find((c) => c?.id === cycleId);
    if (!cycle) throw new Error('Breeding card not found.');
    return writeCycle(fn(cycle));
  }, [writeCycle]);

  const speciesFor = useCallback((femaleId) => {
    const snake = snakesById?.get?.(femaleId) || null;
    return snake ? { speciesId: snake.speciesId || null, reproductionMode: snake.reproductionMode || 'egg_laying' } : {};
  }, [snakesById]);

  const actions = useMemo(() => ({
    /** Quick pairing entry. Returns the card, the session, and what happened to the follow-up. */
    recordPairing(input) {
      const now = nowIso();
      const today = todayYmd();
      const { speciesId, reproductionMode } = speciesFor(input.femaleId);
      const result = recordPairingSession(cyclesRef.current, { ...input, speciesId: input.speciesId || speciesId, reproductionMode: input.reproductionMode || reproductionMode }, { now });
      let cycle = result.cycle;
      let followUp = null;
      if (result.lock) {
        const scheduled = scheduleFollowUpForLock(cycle, { sessionId: result.session.id, lock: result.lock, today, now });
        cycle = scheduled.cycle;
        followUp = { proposal: scheduled.proposal, planned: scheduled.planned };
      }
      cyclesRef.current = result.created ? [...cyclesRef.current.filter((c) => c.id !== cycle.id), cycle] : cyclesRef.current;
      writeCycle(cycle);
      const associated = linkExamsToCycle(cycle);
      return { cycle, session: result.session, lock: result.lock, created: result.created, followUp, associatedExamIds: associated };
    },

    addLock(cycleId, sessionId, input) {
      const now = nowIso();
      const today = todayYmd();
      let followUp = null;
      const cycle = withCycle(cycleId, (current) => {
        const added = addLockObservation(current, sessionId, input, { now });
        let next = added.cycle;
        const scheduled = scheduleFollowUpForLock(next, { sessionId, lock: added.lock, today, now });
        next = scheduled.cycle;
        followUp = { proposal: scheduled.proposal, planned: scheduled.planned, merged: added.merged };
        return next;
      });
      return { cycle, followUp };
    },

    /** Accept a suppressed-as-historical proposal deliberately: create the planned pairing anyway. */
    acceptHistoricalProposal(cycleId, { maleId, date, sessionId = null, lockId = null }) {
      return withCycle(cycleId, (current) => applyProposal(current, { kind: 'create', date, maleId }, { sessionId, lockId, now: nowIso() }).cycle);
    },

    setLockStatus(cycleId, sessionId, lockId, status, notes) {
      return withCycle(cycleId, (current) => setLockStatusDomain(current, sessionId, lockId, status, { now: nowIso(), notes }));
    },
    removeLock(cycleId, sessionId, lockId) {
      return withCycle(cycleId, (current) => removeLockDomain(current, sessionId, lockId, { now: nowIso() }));
    },
    updateSession(cycleId, sessionId, patch) {
      return withCycle(cycleId, (current) => updateSessionDomain(current, sessionId, patch, { now: nowIso() }));
    },
    removeSession(cycleId, sessionId) {
      return withCycle(cycleId, (current) => removeSessionDomain(current, sessionId, { now: nowIso() }));
    },

    addMale(cycleId, maleId) {
      return withCycle(cycleId, (current) => addCandidateMale(current, maleId, { now: nowIso() }));
    },
    removeMale(cycleId, maleId) {
      let outcome = null;
      withCycle(cycleId, (current) => { outcome = removeCandidateMale(current, maleId, { now: nowIso() }); return outcome.cycle; });
      return outcome;
    },
    setMultipleSires(cycleId, enabled) {
      let outcome = null;
      withCycle(cycleId, (current) => { outcome = setMultipleSiresDomain(current, enabled, { now: nowIso() }); return outcome.cycle; });
      return outcome;
    },

    recordMilestone(cycleId, event) {
      const now = nowIso();
      let review = null;
      const cycle = withCycle(cycleId, (current) => {
        let next = recordEvent(current, event, { now });
        if (event.type === 'ovulation') {
          const reviewed = reviewPlannedAfterOvulation(next, { now });
          next = reviewed.cycle;
          review = { cancelled: reviewed.cancelled, toReview: reviewed.toReview };
        }
        return next;
      });
      return { cycle, review };
    },
    removeMilestone(cycleId, eventId) {
      return withCycle(cycleId, (current) => removeEvent(current, eventId, { now: nowIso() }));
    },

    updateClutch(cycleId, patch) {
      return withCycle(cycleId, (current) => updateClutchDomain(current, patch, { now: nowIso() }));
    },
    recordHatching(cycleId, input) {
      return withCycle(cycleId, (current) => recordHatchingDomain(current, input, { now: nowIso() }));
    },
    completeHatching(cycleId, input) {
      return withCycle(cycleId, (current) => completeHatchingOutcome(current, input, { now: nowIso() }));
    },

    closeCycle(cycleId, input) {
      return withCycle(cycleId, (current) => closeCycleDomain(current, input, { now: nowIso() }));
    },
    /**
     * Reopen keeps the one-open-card rule: when the female already has a newer open card, the
     * reopened one comes back paused (correction mode) rather than as a second active card.
     */
    reopenCycle(cycleId, input = {}) {
      let correctionMode = false;
      const cycle = withCycle(cycleId, (current) => {
        const now = nowIso();
        const reopened = reopenCycleDomain(current, input, { now });
        const otherOpen = cyclesForFemale(cyclesRef.current, current.femaleId).some((c) => c.id !== current.id && c.status !== CYCLE_STATUS.CLOSED);
        if (!otherOpen) return reopened;
        correctionMode = true;
        return pauseCycleDomain(reopened, { reason: 'reopened_for_correction' }, { now });
      });
      return { cycle, correctionMode };
    },
    pauseCycle(cycleId, input = {}) {
      return withCycle(cycleId, (current) => pauseCycleDomain(current, input, { now: nowIso() }));
    },
    resumeCycle(cycleId) {
      return withCycle(cycleId, (current) => resumeCycleDomain(current, { now: nowIso() }));
    },
    setSeasonLabel(cycleId, label) {
      return withCycle(cycleId, (current) => setSeasonLabelDomain(current, label, { now: nowIso() }));
    },

    addPlannedPairing(cycleId, input) {
      let outcome = null;
      withCycle(cycleId, (current) => { outcome = addManualPlannedPairing(current, input, { now: nowIso() }); return outcome.cycle; });
      return outcome;
    },
    reschedulePlanned(cycleId, plannedId, date) {
      return withCycle(cycleId, (current) => reschedulePlannedPairing(current, plannedId, date, { now: nowIso() }));
    },
    skipPlanned(cycleId, plannedId, reason = '') {
      return withCycle(cycleId, (current) => skipPlannedPairing(current, plannedId, { reason, now: nowIso() }));
    },
    cancelPlanned(cycleId, plannedId, reason = '') {
      return withCycle(cycleId, (current) => cancelPlannedPairing(current, plannedId, { reason, now: nowIso() }));
    },

    assignSire(cycleId, animalId, assignment) {
      return withCycle(cycleId, (current) => assignOffspringSire(current, animalId, assignment, { now: nowIso() }));
    },
    linkOffspring(cycleId, animalId) {
      return withCycle(cycleId, (current) => linkOffspringDomain(current, animalId, { now: nowIso() }));
    },
    resolveReviewFlag(cycleId, flagId, note = '') {
      const now = nowIso();
      return withCycle(cycleId, (current) => ({
        ...current,
        reviewFlags: (current.reviewFlags || []).map((flag) => (flag.id === flagId ? { ...flag, resolvedAt: now, note } : flag)),
        legacy: current.legacy && flagId === 'legacy' ? { ...current.legacy, reviewNeeded: false, reviewedAt: now, reviewNote: note } : current.legacy,
        updatedAt: now,
        metadata: { ...(current.metadata || {}), updatedAt: now },
      }));
    },

    deleteCycle(cycleId) {
      const deletedAt = nowIso();
      addTombstone?.('breedingCycles', cycleId, deletedAt);
      cyclesRef.current = cyclesRef.current.filter((c) => c?.id !== cycleId);
      setCycles((prev) => prev.filter((c) => c?.id !== cycleId));
    },

    /** Create or update a follicle examination; links it to the female's active card when there is one. */
    saveExam(input) {
      const now = nowIso();
      const existing = input.id ? examsRef.current.find((e) => e?.id === input.id) : null;
      let exam = existing ? updateExam(existing, input, { now }) : createExam(input, { now });
      if (!exam.cycleId) {
        const active = cyclesForFemale(cyclesRef.current, exam.femaleId).find((c) => c.status !== CYCLE_STATUS.CLOSED) || null;
        if (active) {
          const bound = previousCycleEnd(cyclesRef.current, active);
          if (!bound || exam.date > bound) exam = { ...exam, cycleId: active.id };
        }
      }
      examsRef.current = upsertById(examsRef.current, exam);
      setExams((prev) => upsertById(prev, exam));
      return exam;
    },
    setExamCycle(examId, cycleId) {
      const existing = examsRef.current.find((e) => e?.id === examId);
      if (!existing) throw new Error('Examination not found.');
      const exam = { ...existing, cycleId: cycleId || null, updatedAt: nowIso(), metadata: { ...(existing.metadata || {}), updatedAt: nowIso() } };
      examsRef.current = upsertById(examsRef.current, exam);
      setExams((prev) => upsertById(prev, exam));
      return exam;
    },
    overrideInterpretation(examId, input) {
      const existing = examsRef.current.find((e) => e?.id === examId);
      if (!existing) throw new Error('Examination not found.');
      const exam = setOverrideDomain(existing, input, { now: nowIso() });
      examsRef.current = upsertById(examsRef.current, exam);
      setExams((prev) => upsertById(prev, exam));
      return exam;
    },
    deleteExam(examId) {
      const deletedAt = nowIso();
      addTombstone?.('follicleExams', examId, deletedAt);
      examsRef.current = examsRef.current.filter((e) => e?.id !== examId);
      setExams((prev) => prev.filter((e) => e?.id !== examId));
    },

    updateSettings(updater) {
      setSettings((prev) => normalizeBreedingSettings({ ...(typeof updater === 'function' ? updater(normalizeBreedingSettings(prev)) : updater), updatedAt: nowIso() }));
    },
  }), [withCycle, writeCycle, linkExamsToCycle, speciesFor, setCycles, setExams, setSettings, addTombstone]);

  return actions;
}
