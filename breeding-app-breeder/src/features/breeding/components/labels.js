/** Translated labels for the breeding vocabulary. Every helper takes `t` so the keys are scannable. */

export const stageLabel = (t, stage) => ({
  none: t('breeding.stage.none', { defaultValue: 'No card' }),
  pre_pairing: t('breeding.stage.prePairing', { defaultValue: 'Before pairing' }),
  pairing: t('breeding.stage.pairing', { defaultValue: 'Pairing' }),
  locks_observed: t('breeding.stage.locksObserved', { defaultValue: 'Locks observed' }),
  ovulation_suspected: t('breeding.stage.ovulationSuspected', { defaultValue: 'Ovulation suspected' }),
  ovulated: t('breeding.stage.ovulated', { defaultValue: 'Ovulated' }),
  pre_lay_shed: t('breeding.stage.preLayShed', { defaultValue: 'Pre-lay shed' }),
  incubating: t('breeding.stage.incubating', { defaultValue: 'Eggs laid, incubating' }),
  hatching: t('breeding.stage.hatching', { defaultValue: 'Hatching' }),
  live_birth: t('breeding.stage.liveBirth', { defaultValue: 'Live birth' }),
  complete: t('breeding.stage.complete', { defaultValue: 'Outcome complete' }),
  closed_without_offspring: t('breeding.stage.closedWithoutOffspring', { defaultValue: 'Closed without offspring' }),
}[stage] || stage);

export const statusLabel = (t, status) => ({
  active: t('breeding.status.active', { defaultValue: 'Active' }),
  paused: t('breeding.status.paused', { defaultValue: 'Paused' }),
  closed: t('breeding.status.closed', { defaultValue: 'Closed' }),
}[status] || status);

export const eventTypeLabel = (t, type) => ({
  ovulation: t('breeding.event.ovulation', { defaultValue: 'Ovulation' }),
  pre_lay_shed: t('breeding.event.preLayShed', { defaultValue: 'Pre-lay shed' }),
  egg_laying: t('breeding.event.eggLaying', { defaultValue: 'Egg laying' }),
  live_birth: t('breeding.event.liveBirth', { defaultValue: 'Live birth' }),
  first_hatch: t('breeding.event.firstHatch', { defaultValue: 'First hatch' }),
  final_hatch: t('breeding.event.finalHatch', { defaultValue: 'Final hatch' }),
  hatching_complete: t('breeding.event.hatchingComplete', { defaultValue: 'Hatching complete' }),
}[type] || type);

export const timelineKindLabel = (t, kind) => ({
  pairing_session: t('breeding.timeline.pairingSession', { defaultValue: 'Pairing session' }),
  male_removed: t('breeding.timeline.maleRemoved', { defaultValue: 'Male removed' }),
  lock_observed: t('breeding.timeline.lockObserved', { defaultValue: 'Lock observed' }),
  lock_not_observed: t('breeding.timeline.lockNotObserved', { defaultValue: 'No lock seen' }),
  lock_unknown: t('breeding.timeline.lockUnknown', { defaultValue: 'Lock unknown' }),
  planned_pairing: t('breeding.timeline.plannedPairing', { defaultValue: 'Planned pairing' }),
  follicle_exam: t('breeding.timeline.follicleExam', { defaultValue: 'Follicle exam' }),
  closure: t('breeding.timeline.closure', { defaultValue: 'Card closed' }),
}[kind] || eventTypeLabel(t, kind));

export const certaintyLabel = (t, certainty) => ({
  recorded: t('breeding.certainty.recorded', { defaultValue: 'Recorded' }),
  suspected: t('breeding.certainty.suspected', { defaultValue: 'Suspected' }),
  estimated: t('breeding.certainty.estimated', { defaultValue: 'Estimated' }),
  planned: t('breeding.certainty.planned', { defaultValue: 'Planned' }),
}[certainty] || certainty);

export const lockStatusLabel = (t, status) => ({
  observed: t('breeding.lock.observed', { defaultValue: 'Lock observed' }),
  not_observed: t('breeding.lock.notObserved', { defaultValue: 'Not observed' }),
  unknown: t('breeding.lock.unknown', { defaultValue: 'Unknown' }),
}[status] || status);

export const methodLabel = (t, method) => ({
  ultrasound: t('breeding.exam.method.ultrasound', { defaultValue: 'Ultrasound' }),
  palpation: t('breeding.exam.method.palpation', { defaultValue: 'Palpation (estimate)' }),
  external: t('breeding.exam.method.external', { defaultValue: 'External observation' }),
}[method] || method);

export const resultLabel = (t, result) => ({
  follicles_seen: t('breeding.exam.result.folliclesSeen', { defaultValue: 'Follicles seen' }),
  not_visualized: t('breeding.exam.result.notVisualized', { defaultValue: 'Not visualized' }),
  inconclusive: t('breeding.exam.result.inconclusive', { defaultValue: 'Inconclusive' }),
  post_ovulation: t('breeding.exam.result.postOvulation', { defaultValue: 'Post-ovulation structures' }),
}[result] || result);

export const closureOutcomeLabel = (t, outcome) => ({
  hatching_complete: t('breeding.closure.hatchingComplete', { defaultValue: 'Hatching complete' }),
  live_birth_complete: t('breeding.closure.liveBirthComplete', { defaultValue: 'Live birth complete' }),
  no_clutch: t('breeding.closure.noClutch', { defaultValue: 'No clutch' }),
  failed_clutch: t('breeding.closure.failedClutch', { defaultValue: 'Failed clutch' }),
  cancelled: t('breeding.closure.cancelled', { defaultValue: 'Cancelled' }),
  other: t('breeding.closure.other', { defaultValue: 'Other (see note)' }),
}[outcome] || outcome);

export const metricLabel = (t, key) => ({
  firstPairingToOvulation: t('breeding.metric.firstPairingToOvulation', { defaultValue: 'First pairing to ovulation' }),
  lastPairingBeforeOvulationToOvulation: t('breeding.metric.lastPairingToOvulation', { defaultValue: 'Last pairing before ovulation to ovulation' }),
  firstLockBeforeOvulationToOvulation: t('breeding.metric.firstLockToOvulation', { defaultValue: 'First observed lock to ovulation' }),
  ovulationToPreLayShed: t('breeding.metric.ovulationToShed', { defaultValue: 'Ovulation to pre-lay shed' }),
  preLayShedToLaying: t('breeding.metric.shedToLaying', { defaultValue: 'Pre-lay shed to laying' }),
  firstPairingToLaying: t('breeding.metric.firstPairingToLaying', { defaultValue: 'First pairing to laying' }),
  layingToFirstHatch: t('breeding.metric.layingToFirstHatch', { defaultValue: 'Laying to first hatch' }),
  layingToFinalHatch: t('breeding.metric.layingToFinalHatch', { defaultValue: 'Laying to final hatch' }),
  firstPairingToHatchingComplete: t('breeding.metric.firstPairingToComplete', { defaultValue: 'First pairing to completed hatching' }),
  eggsTotal: t('breeding.metric.eggsTotal', { defaultValue: 'Eggs laid' }),
  fertileEggs: t('breeding.metric.fertileEggs', { defaultValue: 'Fertile eggs' }),
  slugs: t('breeding.metric.slugs', { defaultValue: 'Slugs' }),
  hatchlingsRecorded: t('breeding.metric.hatchlings', { defaultValue: 'Hatchlings' }),
  locksPerCycle: t('breeding.metric.locksPerCycle', { defaultValue: 'Observed locks per cycle' }),
  sessionsPerCycle: t('breeding.metric.sessionsPerCycle', { defaultValue: 'Pairing sessions per cycle' }),
}[key] || key);

export const flagLabel = (t, kind) => ({
  shed_before_ovulation: t('breeding.flag.shedBeforeOvulation', { defaultValue: 'Pre-lay shed is dated before ovulation' }),
  laying_before_shed: t('breeding.flag.layingBeforeShed', { defaultValue: 'Egg laying is dated before the pre-lay shed' }),
  laying_before_ovulation: t('breeding.flag.layingBeforeOvulation', { defaultValue: 'Egg laying is dated before ovulation' }),
  hatch_before_laying: t('breeding.flag.hatchBeforeLaying', { defaultValue: 'First hatch is dated before laying' }),
  final_hatch_before_first: t('breeding.flag.finalBeforeFirst', { defaultValue: 'Final hatch is dated before the first hatch' }),
  ovulation_before_first_pairing: t('breeding.flag.ovulationBeforePairing', { defaultValue: 'Ovulation is dated before the first pairing' }),
  removal_before_introduction: t('breeding.flag.removalBeforeIntro', { defaultValue: 'Male removed before he was introduced' }),
  lock_before_introduction: t('breeding.flag.lockBeforeIntro', { defaultValue: 'Lock observed before the introduction' }),
  lock_after_removal: t('breeding.flag.lockAfterRemoval', { defaultValue: 'Lock observed after the male was removed' }),
  locks_same_day_different_males: t('breeding.flag.locksSameDayDifferentMales', { defaultValue: 'Locks with two different males on the same day' }),
  locks_same_day_same_male_different_sessions: t('breeding.flag.locksSameDaySameMale', { defaultValue: 'Two sessions with the same male record a lock on the same day' }),
  overlapping_sessions_same_male: t('breeding.flag.overlappingSessions', { defaultValue: 'Overlapping sessions with the same male' }),
  same_day_sessions_same_male: t('breeding.flag.sameDaySessions', { defaultValue: 'Two sessions with the same male on one day' }),
  multiple_active_cycles: t('breeding.flag.multipleActive', { defaultValue: 'More than one open card for this female' }),
  duplicate_active_cycle: t('breeding.flag.duplicateActive', { defaultValue: 'A second open card arrived from another device; this one was paused for review' }),
  unresolved_animal_reference: t('breeding.flag.unresolvedAnimal', { defaultValue: 'This card names an animal that is not in your collection' }),
}[kind] || kind);

export const legacyReasonLabel = (t, reason) => ({
  no_actual_pairing_date: t('breeding.legacy.noActualDate', { defaultValue: 'The pairing record had no actual pairing date' }),
  aggregate_locks_without_dates: t('breeding.legacy.aggregateLocks', { defaultValue: 'Lock count without dates kept as an aggregate (not counted as dated locks)' }),
  missing_male: t('breeding.legacy.missingMale', { defaultValue: 'No male on the pairing record' }),
  introduction_inferred_from_lock: t('breeding.legacy.introductionInferred', { defaultValue: 'Introduction date taken from the lock date' }),
  merged_by_explicit_season: t('breeding.legacy.mergedBySeason', { defaultValue: 'Two pairing records with the same season were merged into one card' }),
  overlaps_other_cycle_same_female: t('breeding.legacy.overlaps', { defaultValue: 'Overlaps another card of the same female' }),
  multiple_active_legacy_pairings: t('breeding.legacy.multipleActive', { defaultValue: 'Several pairing records of this female were open at once' }),
}[reason] || reason);
