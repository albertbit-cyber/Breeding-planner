/**
 * One female's breeding card.
 *
 * Layout (top to bottom): identity and status; compact counts and milestone dates; review
 * prompts; fast actions; then three tabs. Overview opens with the pairing plan and milestones
 * (PairingPlanPanel), then the males with their history, forecasts, the timeline and previous
 * cycles. Follicles is this female's own
 * follicle record: chart, trend and every examination. Clutch and hatchlings holds the egg and
 * hatchling outcome and the step that completes the cycle: registering the hatchlings.
 */
import DepartureTag from '../../animals/DepartureTag.jsx';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  deriveStage,
  countObservedLocks,
  countSessions,
  maleHistory,
  recordedEventDate,
  chronologyFlags,
  duplicateFlags,
  CYCLE_STATUS,
  MALE_STATE,
  registrationStatus,
} from '../domain/cycleModel';
import { isIncubating } from '../domain/pairingView';
import { examsForCycle, latestMeasurement, latestChange } from '../domain/follicles';
import { upcomingPairings } from '../domain/pairingPlan';
import { evaluateReview, buildForecasts } from '../domain/reviewRules';
import { cyclesForFemale } from '../domain/cycleModel';
import { diffDays, todayYmd } from '../domain/dates';
import { FollicleChart } from './FollicleChart';
import { CycleTimeline } from './CycleTimeline';
import { PreviousCycles } from './PreviousCycles';
import { PairingPlanPanel } from './PairingPlanPanel';
import { animalName, formatDate, formatDateTime, formatMm, DASH, STATUS_CLASS } from './format';
import { stageLabel, statusLabel, eventTypeLabel, lockStatusLabel, closureOutcomeLabel, flagLabel, legacyReasonLabel, certaintyLabel, methodLabel, resultLabel } from './labels';

const smallBtn = 'text-xs px-2.5 py-1.5 border rounded-lg bg-white hover:bg-neutral-50 disabled:opacity-50';
const primaryBtn = 'appearance-btn appearance-btn--filled text-xs px-2.5 py-1.5 rounded-lg';

function Stat({ label, value, hint }) {
  return (
    <div className="rounded-lg border bg-neutral-50 px-2 py-1.5 min-w-0">
      <div className="text-[10px] uppercase tracking-wide text-neutral-500 truncate">{label}</div>
      <div className="text-sm font-semibold text-neutral-900 truncate">{value}</div>
      {hint ? <div className="text-[10px] text-neutral-500 truncate">{hint}</div> : null}
    </div>
  );
}

function GeneticsChips({ tokens = [] }) {
  if (!tokens.length) return <span className="text-[11px] text-neutral-500">Normal</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {tokens.slice(0, 8).map((token) => <span key={token} className="mt-chip border bg-neutral-50 text-[10px]">{token}</span>)}
      {tokens.length > 8 ? <span className="text-[10px] text-neutral-500">+{tokens.length - 8}</span> : null}
    </div>
  );
}

export function BreedingCard({
  cycle,
  cycles = [],
  exams = [],
  settings,
  snakesById,
  geneticsTokensFor,
  males = [],
  actions,
  openDialog,
  onOpenSnake = null,
  onOpenCycle = null,
  onCreateHatchlings = null,
  isFocused = false,
  defaultExpanded = false,
  showAppAlert = null,
  locationFor = null,
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(defaultExpanded || isFocused);
  const [editingSeason, setEditingSeason] = useState(false);
  const [section, setSection] = useState('overview');
  const [seasonDraft, setSeasonDraft] = useState(cycle.seasonLabel);
  const today = todayYmd();

  const female = snakesById?.get?.(cycle.femaleId) || null;
  const cycleExams = useMemo(() => examsForCycle(exams, cycle), [exams, cycle]);
  const femaleCycles = useMemo(() => cyclesForFemale(cycles, cycle.femaleId), [cycles, cycle.femaleId]);
  const stage = deriveStage(cycle);
  const latest = useMemo(() => latestMeasurement(cycleExams) || latestMeasurement(cycleExams, { method: 'palpation' }), [cycleExams]);
  const change = useMemo(() => latestChange(cycleExams), [cycleExams]);
  const review = useMemo(() => evaluateReview(cycle, cycleExams, settings, { today }), [cycle, cycleExams, settings, today]);
  const forecasts = useMemo(() => buildForecasts({ cycle, cycles: femaleCycles, exams, collectionCycles: cycles, settings, today }), [cycle, femaleCycles, exams, cycles, settings, today]);
  const flags = useMemo(() => [...chronologyFlags(cycle), ...duplicateFlags(cycle)], [cycle]);
  const upcoming = useMemo(() => upcomingPairings(cycle, { today }), [cycle, today]);
  const participated = cycle.males.filter((m) => m.state === MALE_STATE.PARTICIPATED);
  const openReviewFlags = (cycle.reviewFlags || []).filter((f) => !f.resolvedAt);
  const isClosed = cycle.status === CYCLE_STATUS.CLOSED;
  const isPaused = cycle.status === CYCLE_STATUS.PAUSED;
  const milestoneDate = (type) => recordedEventDate(cycle, type);
  const suspected = (type) => cycle.events.find((e) => e.type === type && e.certainty === 'suspected');
  const overlays = useMemo(() => femaleCycles.filter((c) => c.id !== cycle.id).map((c) => ({ label: c.seasonLabel, cycle: c, exams: examsForCycle(exams, c) })), [femaleCycles, cycle.id, exams]);
  const latestAge = latest ? diffDays(latest.date, today) : null;
  const incubating = isIncubating(cycle);
  const registration = registrationStatus(cycle);
  const awaitingRegistration = !isClosed && registration.hatched && registration.missing > 0;
  const sortedExams = useMemo(() => [...cycleExams].sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))), [cycleExams]);

  const run = (fn) => {
    try {
      return fn();
    } catch (err) {
      showAppAlert?.(err?.message || String(err));
      return null;
    }
  };

  const saveSeason = () => {
    run(() => actions.setSeasonLabel(cycle.id, seasonDraft));
    setEditingSeason(false);
  };

  const headerIdentity = (
    <div className="flex items-start gap-3 min-w-0">
      <div className="shrink-0 w-10 h-10 rounded-lg flex items-center justify-center text-[11px] font-semibold" style={{ background: 'var(--sk-surface-2, #f3f4f6)', color: 'var(--sk-text-muted, #6b7280)' }} aria-hidden="true">
        {animalName(female, cycle.femaleId).slice(0, 2).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {onOpenSnake && female ? (
            <button type="button" className="font-semibold text-sm text-start hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 rounded" style={{ color: 'var(--sk-primary, #0284c7)' }} onClick={() => onOpenSnake(female)}>{animalName(female, cycle.femaleId)}</button>
          ) : <span className="font-semibold text-sm">{animalName(female, cycle.femaleId)}</span>}
          <span className="text-[11px] text-neutral-500 font-mono"><bdi>{cycle.femaleId}</bdi></span>
          {editingSeason ? (
            <span className="inline-flex items-center gap-1">
              <input className="border rounded-lg px-2 py-0.5 text-xs w-24" value={seasonDraft} onChange={(e) => setSeasonDraft(e.target.value)} aria-label={t('breeding.card.seasonLabel', { defaultValue: 'Season label' })} onKeyDown={(e) => { if (e.key === 'Enter') saveSeason(); if (e.key === 'Escape') setEditingSeason(false); }} autoFocus />
              <button type="button" className={smallBtn} onClick={saveSeason}>{t('common.save', { defaultValue: 'Save' })}</button>
            </span>
          ) : (
            <button type="button" className="inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold bg-neutral-50 hover:bg-neutral-100" title={t('breeding.card.editSeason', { defaultValue: 'Edit season label' })} onClick={() => { setSeasonDraft(cycle.seasonLabel); setEditingSeason(true); }}>
              {t('breeding.card.season', { defaultValue: 'Season {{season}}', season: cycle.seasonLabel || DASH })}
            </button>
          )}
          <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_CLASS[cycle.status]}`}>{statusLabel(t, cycle.status)}</span>
          <span className="inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold bg-sky-50 text-sky-800 border-sky-200">{stageLabel(t, stage)}</span>
          {incubating ? <span className="inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold bg-violet-50 text-violet-800 border-violet-200">{t('breeding.card.inIncubator', { defaultValue: 'In the incubator' })}</span> : null}
          {awaitingRegistration ? <span className="inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold bg-amber-50 text-amber-800 border-amber-200">{t('breeding.card.registerChip', { defaultValue: 'Hatchlings to register: {{count}}', count: registration.missing })}</span> : null}
          {locationFor?.(cycle.femaleId) ? <span className="text-[11px] text-neutral-500">{locationFor(cycle.femaleId)}</span> : null}
        </div>
        <div className="mt-1"><GeneticsChips tokens={geneticsTokensFor?.(female) || []} /></div>
      </div>
      <div className="shrink-0 text-end">
        <div className="text-[10px] uppercase tracking-wide text-neutral-500">{t('breeding.card.latestFollicle', { defaultValue: 'Latest follicle' })}</div>
        {latest ? (
          <>
            <div className="text-sm font-semibold">{formatMm(latest.valueMm, { estimate: latest.isEstimate })}</div>
            <div className="text-[10px] text-neutral-500">{formatDate(latest.date)}{latestAge !== null && latestAge > 0 ? ` · ${t('breeding.card.daysAgo', { defaultValue: '{{days}} d ago', days: latestAge })}` : ''}</div>
          </>
        ) : <div className="text-sm text-neutral-400">{DASH}</div>}
      </div>
    </div>
  );

  if (!expanded) {
    return (
      <div
        role="button"
        tabIndex={0}
        aria-expanded={false}
        aria-label={t('breeding.card.ariaLabel', { defaultValue: 'Breeding card for {{name}}', name: animalName(female, cycle.femaleId) })}
        className={`mt-card border rounded-xl p-3 cursor-pointer text-start w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${isFocused ? 'ring-2 ring-sky-400 ring-offset-1' : ''}`}
        onClick={() => setExpanded(true)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(true); } }}
      >
        {headerIdentity}
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-700">
          <span>{t('breeding.card.sessionsCount', { defaultValue: '{{count}} sessions', count: countSessions(cycle) })}</span>
          <span>{t('breeding.card.locksCount', { defaultValue: '{{count}} observed locks', count: countObservedLocks(cycle) })}</span>
          <span>{t('breeding.card.malesCount', { defaultValue: '{{count}} males', count: cycle.males.length })}</span>
          {upcoming[0] ? <span>{t('breeding.card.nextPlanned', { defaultValue: 'Next planned pairing {{date}}', date: formatDate(upcoming[0].plannedDate) })}</span> : null}
          {(openReviewFlags.length || flags.length || cycle.legacy?.reviewNeeded) ? <span className="text-amber-700">{t('breeding.card.needsReview', { defaultValue: 'Needs review' })}</span> : null}
          <span className="ms-auto font-semibold">{t('breeding.card.viewDetails', { defaultValue: 'View details ›' })}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`mt-card border rounded-xl p-3 w-full ${isFocused ? 'ring-2 ring-sky-400 ring-offset-1' : ''}`} tabIndex={-1} aria-label={t('breeding.card.ariaLabel', { defaultValue: 'Breeding card for {{name}}', name: animalName(female, cycle.femaleId) })}>
      <div className="flex items-start justify-between gap-3">
        {headerIdentity}
        <button type="button" className={`${smallBtn} shrink-0`} onClick={() => setExpanded(false)}>{t('common.collapse', { defaultValue: 'Collapse' })}</button>
      </div>

      {/* Compact counts and milestone dates */}
      <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
        <Stat label={t('breeding.card.sessions', { defaultValue: 'Pairing sessions' })} value={countSessions(cycle)} />
        <Stat label={t('breeding.card.observedLocks', { defaultValue: 'Observed locks' })} value={countObservedLocks(cycle)} hint={t('breeding.card.lockRecordsHint', { defaultValue: 'dated records' })} />
        <Stat label={t('breeding.card.firstPairing', { defaultValue: 'First pairing' })} value={formatDate(cycle.startDate) || DASH} />
        <Stat label={eventTypeLabel(t, 'ovulation')} value={milestoneDate('ovulation') ? formatDate(milestoneDate('ovulation')) : suspected('ovulation') ? formatDate(suspected('ovulation').date) : DASH} hint={!milestoneDate('ovulation') && suspected('ovulation') ? certaintyLabel(t, 'suspected') : null} />
        {cycle.reproductionMode !== 'live_bearing' ? (
          <>
            <Stat label={eventTypeLabel(t, 'pre_lay_shed')} value={milestoneDate('pre_lay_shed') ? formatDate(milestoneDate('pre_lay_shed')) : DASH} />
            <Stat label={eventTypeLabel(t, 'egg_laying')} value={milestoneDate('egg_laying') ? formatDate(milestoneDate('egg_laying')) : DASH} hint={cycle.clutch.eggsTotal !== null ? t('breeding.card.eggsHint', { defaultValue: '{{count}} eggs', count: cycle.clutch.eggsTotal }) : null} />
            <Stat label={eventTypeLabel(t, 'first_hatch')} value={cycle.clutch.firstHatchDate ? formatDate(cycle.clutch.firstHatchDate) : DASH} hint={cycle.clutch.hatchlingsRecorded !== null ? t('breeding.card.hatchlingsHint', { defaultValue: '{{count}} hatchlings', count: cycle.clutch.hatchlingsRecorded }) : null} />
            <Stat label={eventTypeLabel(t, 'final_hatch')} value={cycle.clutch.finalHatchDate ? formatDate(cycle.clutch.finalHatchDate) : DASH} hint={cycle.clutch.outcomeComplete ? t('breeding.card.outcomeComplete', { defaultValue: 'outcome complete' }) : null} />
          </>
        ) : (
          <Stat label={eventTypeLabel(t, 'live_birth')} value={milestoneDate('live_birth') ? formatDate(milestoneDate('live_birth')) : DASH} hint={cycle.clutch.liveBirths !== null ? `${cycle.clutch.liveBirths}` : null} />
        )}
      </div>

      {/* Review prompts and flags */}
      {(review.flags.length || flags.length || openReviewFlags.length || cycle.legacy?.reviewNeeded || isPaused) ? (
        <div className="mt-3 flex flex-col gap-1">
          {isPaused ? <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{cycle.pause?.reason === 'reopened_for_correction' ? t('breeding.card.correctionModeNotice', { defaultValue: 'Reopened for correction (paused). Edit the records, then close the card again.' }) : t('breeding.card.pausedNotice', { defaultValue: 'Paused{{reason}}. No new pairing reminders are proposed while paused.', reason: cycle.pause?.reason ? `: ${cycle.pause.reason}` : '' })}</div> : null}
          {review.flags.map((flag, i) => (
            <div key={`${flag.kind}-${i}`} className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
              {flag.kind === 'pairing_review' ? t('breeding.review.pairingReview', { defaultValue: 'Review pairing: the latest measured diameter ({{value}} on {{date}}) is inside your configured review range ({{min}}–{{max}} mm). This is a prompt to look, not a decision.', value: formatMm(flag.valueMm), date: formatDate(flag.date), min: flag.range[0] ?? '…', max: flag.range[1] ?? '…' }) : null}
              {flag.kind === 'lower_measurement_review' ? t('breeding.review.lowerMeasurement', { defaultValue: 'The latest measurement is {{delta}} mm lower than the previous comparable one ({{days}} days apart). Worth a second look; this is not a diagnosis.', delta: Math.abs(flag.deltaMm), days: flag.days }) : null}
              {flag.kind === 'scan_due' ? t('breeding.review.scanDue', { defaultValue: 'A follicle check was due on {{date}}.', date: formatDate(flag.date) }) : null}
            </div>
          ))}
          {flags.map((flag, i) => <div key={`${flag.kind}-${i}`} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">{flagLabel(t, flag.kind)}{flag.date ? ` (${formatDate(flag.date)})` : ''}. {t('breeding.card.correctHint', { defaultValue: 'Open the record below to correct it.' })}</div>)}
          {openReviewFlags.map((flag) => (
            <div key={flag.id} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 flex flex-wrap items-center justify-between gap-2">
              <span>{flagLabel(t, flag.kind)}{Array.isArray(flag.animalIds) && flag.animalIds.length ? `: ${flag.animalIds.join(', ')}` : ''}</span>
              <button type="button" className={smallBtn} onClick={() => run(() => actions.resolveReviewFlag(cycle.id, flag.id))}>{t('breeding.card.markReviewed', { defaultValue: 'Mark reviewed' })}</button>
            </div>
          ))}
          {cycle.legacy?.reviewNeeded ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">{t('breeding.legacy.title', { defaultValue: 'Migrated from pairing record(s) {{ids}}; please review', ids: (cycle.legacy.pairingIds || []).join(', ') })}</span>
                <button type="button" className={smallBtn} onClick={() => run(() => actions.resolveReviewFlag(cycle.id, 'legacy'))}>{t('breeding.card.markReviewed', { defaultValue: 'Mark reviewed' })}</button>
              </div>
              <ul className="list-disc ps-4 mt-1">{(cycle.legacy.reviewReasons || []).map((r) => <li key={r}>{legacyReasonLabel(t, r)}</li>)}</ul>
              {cycle.legacy.aggregateLocks ? <div className="mt-1">{t('breeding.legacy.aggregateCount', { defaultValue: 'Legacy lock count without dates: {{count}}. Shown here only; it is not part of the observed-lock total.', count: cycle.legacy.aggregateLocks.count })}</div> : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Fast actions */}
      <div className="mt-3 flex flex-wrap gap-2">
        {!isClosed ? <button type="button" className={primaryBtn} onClick={() => openDialog({ kind: 'pairing', cycleId: cycle.id, femaleId: cycle.femaleId, defaultMaleId: cycle.males[cycle.males.length - 1]?.maleId || null })}>{t('breeding.action.pairing', { defaultValue: '+ Pairing' })}</button> : null}
        {!isClosed && cycle.sessions.length ? <button type="button" className={smallBtn} onClick={() => openDialog({ kind: 'lock', cycleId: cycle.id })}>{t('breeding.action.lock', { defaultValue: '+ Observed lock' })}</button> : null}
        <button type="button" className={smallBtn} onClick={() => openDialog({ kind: 'exam', femaleId: cycle.femaleId })}>{t('breeding.action.exam', { defaultValue: '+ Follicle exam' })}</button>
        {!isClosed ? <button type="button" className={smallBtn} onClick={() => openDialog({ kind: 'milestone', cycleId: cycle.id })}>{t('breeding.action.milestone', { defaultValue: '+ Milestone' })}</button> : null}
        {!isClosed && cycle.reproductionMode !== 'live_bearing' ? <button type="button" className={smallBtn} onClick={() => openDialog({ kind: 'clutch', cycleId: cycle.id })}>{t('breeding.action.eggsLaid', { defaultValue: 'Eggs laid' })}</button> : null}
        {!isClosed && cycle.reproductionMode !== 'live_bearing' && (milestoneDate('egg_laying') || cycle.clutch.eggsTotal !== null) ? <button type="button" className={smallBtn} onClick={() => openDialog({ kind: 'hatching', cycleId: cycle.id, mode: 'partial' })}>{t('breeding.action.hatching', { defaultValue: 'Hatching' })}</button> : null}
        {!isClosed && !isPaused ? <button type="button" className={smallBtn} onClick={() => { const reason = window.prompt(t('breeding.action.pauseReason', { defaultValue: 'Reason for pausing (optional)' }), ''); if (reason !== null) run(() => actions.pauseCycle(cycle.id, { reason })); }}>{t('breeding.action.pause', { defaultValue: 'Pause' })}</button> : null}
        {isPaused ? <button type="button" className={smallBtn} onClick={() => run(() => actions.resumeCycle(cycle.id))}>{t('breeding.action.resume', { defaultValue: 'Resume' })}</button> : null}
        {!isClosed && cycle.reproductionMode !== 'live_bearing' && (milestoneDate('egg_laying') || cycle.clutch.eggsTotal !== null) ? <button type="button" className={smallBtn} onClick={() => openDialog({ kind: 'hatching', cycleId: cycle.id, mode: 'complete' })}>{t('breeding.action.complete', { defaultValue: 'Hatching complete' })}</button> : null}
        {!isClosed ? <button type="button" className={smallBtn} onClick={() => openDialog({ kind: 'close', cycleId: cycle.id })}>{t('breeding.action.close', { defaultValue: 'Close card' })}</button> : null}
        {isClosed ? <button type="button" className={smallBtn} onClick={() => { const note = window.prompt(t('breeding.action.reopenNote', { defaultValue: 'Why is this card being reopened?' }), ''); if (note !== null) { const result = run(() => actions.reopenCycle(cycle.id, { note })); if (result?.correctionMode) showAppAlert?.(t('breeding.notice.reopenedPaused', { defaultValue: 'Reopened in correction mode (paused): this female already has a newer open card, so this one does not become active again. Correct the records, then close it.' })); } }}>{t('breeding.action.reopen', { defaultValue: 'Reopen' })}</button> : null}
      </div>

      {/* Closure */}
      {isClosed && cycle.closure ? (
        <div className="mt-3 rounded-lg border bg-neutral-50 px-3 py-2 text-xs">
          <span className="font-semibold">{t('breeding.card.closed', { defaultValue: 'Closed' })}: {closureOutcomeLabel(t, cycle.closure.outcome)}</span>
          {cycle.closure.biologicalCompletionDate ? ` · ${t('breeding.card.biologicalDate', { defaultValue: 'biological completion' })} ${formatDate(cycle.closure.biologicalCompletionDate)}` : ''}
          {` · ${t('breeding.card.closedAt', { defaultValue: 'closed' })} ${formatDateTime(cycle.closure.closedAt)}`}
          {cycle.closure.note ? <div className="text-neutral-600">{cycle.closure.note}</div> : null}
        </div>
      ) : null}
      {cycle.reopenings.length ? <div className="mt-1 text-[11px] text-neutral-500">{t('breeding.card.reopenings', { defaultValue: 'Reopened or resumed {{count}} time(s); earlier closures are kept in the record.', count: cycle.reopenings.length })}</div> : null}

      {/* Registration: the step that completes a hatched cycle */}
      {awaitingRegistration ? (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 flex flex-wrap items-center justify-between gap-2">
          <span>{t('breeding.card.registerNotice', { defaultValue: 'Hatched: {{expected}} hatchlings, {{registered}} registered. The cycle moves to Completed pairing once every hatchling is registered as an animal.', expected: registration.expected, registered: registration.registered })}</span>
          {onCreateHatchlings ? <button type="button" className={primaryBtn} onClick={() => onCreateHatchlings(cycle)}>{t('breeding.card.registerAction', { defaultValue: 'Register hatchlings' })}</button> : null}
        </div>
      ) : null}

      {/* Sections */}
      <div className="mt-3 flex flex-wrap gap-1 border-b" role="tablist" aria-label={t('breeding.card.sections', { defaultValue: 'Card sections' })}>
        {[
          ['overview', t('breeding.card.tabOverview', { defaultValue: 'Overview' })],
          ['follicles', t('breeding.card.tabFollicles', { defaultValue: 'Follicles ({{count}})', count: cycleExams.length })],
          ['clutch', cycle.reproductionMode === 'live_bearing' ? t('breeding.card.tabOffspring', { defaultValue: 'Offspring' }) : t('breeding.card.tabClutch', { defaultValue: 'Clutch and hatchlings' })],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={section === key}
            className={`px-3 py-1.5 text-xs font-semibold -mb-px border-b-2 ${section === key ? 'border-current' : 'border-transparent text-neutral-500 hover:text-neutral-800'}`}
            style={section === key ? { color: 'var(--sk-primary, #0284c7)' } : undefined}
            onClick={() => setSection(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {section === 'overview' ? (
        <>
        <PairingPlanPanel cycle={cycle} snakesById={snakesById} actions={actions} run={run} isClosed={isClosed} />

        {/* Males */}
        <div className="mt-3 rounded-xl border bg-white p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">{t('breeding.card.males', { defaultValue: 'Males (candidate sires)' })}</div>
            <label className="inline-flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={cycle.multipleSires}
                onChange={(e) => {
                  const result = run(() => actions.setMultipleSires(cycle.id, e.target.checked));
                  if (result?.retained) showAppAlert?.(t('breeding.card.multipleRetained', { defaultValue: 'Multiple sires stays on: {{count}} males already have recorded sessions on this card. Their history is kept. Remove or correct sessions through the records below if one was entered in error.', count: result.participated.length }));
                }}
                disabled={isClosed}
              />
              {t('breeding.card.multipleSires', { defaultValue: 'Multiple sires' })}
            </label>
          </div>
          {participated.length > 1 ? <div className="mt-1 text-[11px] text-neutral-600">{t('breeding.card.multipleExplain', { defaultValue: 'More than one male has participated in this cycle. Each male keeps his own history; parentage of hatchlings stays unresolved until assigned.' })}</div> : null}
          <ul className="mt-2 flex flex-col gap-1">
            {cycle.males.map((male) => {
              const snake = snakesById?.get?.(male.maleId) || null;
              const history = maleHistory(cycle, male.maleId);
              return (
                <li key={male.maleId}>
                  <details className="rounded-lg border bg-neutral-50">
                    <summary className="cursor-pointer px-2 py-1.5 text-xs flex flex-wrap items-center gap-2">
                      {onOpenSnake && snake ? <button type="button" className="font-semibold hover:underline" style={{ color: 'var(--sk-primary, #0284c7)' }} onClick={(e) => { e.preventDefault(); onOpenSnake(snake); }}>{animalName(snake, male.maleId)}</button> : <span className="font-semibold">{animalName(snake, male.maleId)}</span>}
                      <span className="font-mono text-[10px] text-neutral-500"><bdi>{male.maleId}</bdi></span>
                      <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] ${male.state === MALE_STATE.PARTICIPATED ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-neutral-100 text-neutral-600'}`}>{male.state === MALE_STATE.PARTICIPATED ? t('breeding.male.participated', { defaultValue: 'Participated' }) : t('breeding.male.planned', { defaultValue: 'Planned only' })}</span>
                      <span className="text-neutral-600">{t('breeding.history.maleCounts', { defaultValue: '{{sessions}} sessions, {{locks}} observed locks', sessions: history.sessionCount, locks: history.lockCount })}</span>
                      <span className="text-neutral-600">{t('breeding.male.latestIntro', { defaultValue: 'Last introduced' })}: {history.latestIntroductionDate ? formatDate(history.latestIntroductionDate) : DASH} · {t('breeding.male.latestLock', { defaultValue: 'Last lock' })}: {history.latestLockDate ? formatDate(history.latestLockDate) : DASH}</span>
                    </summary>
                    <div className="px-2 pb-2 text-xs">
                      <div className="mb-1"><GeneticsChips tokens={geneticsTokensFor?.(snake) || []} /></div>
                      {history.sessions.length ? (
                        <table className="w-full text-xs">
                          <thead><tr className="text-[10px] uppercase tracking-wide text-neutral-500"><th className="text-start py-1 pe-2">{t('breeding.session.introduction', { defaultValue: 'Introduction' })}</th><th className="text-start py-1 pe-2">{t('breeding.session.removal', { defaultValue: 'Removal' })}</th><th className="text-start py-1 pe-2">{t('breeding.session.locks', { defaultValue: 'Lock records' })}</th><th className="text-start py-1 pe-2">{t('breeding.table.notes', { defaultValue: 'Notes' })}</th><th /></tr></thead>
                          <tbody>
                            {history.sessions.map((session) => (
                              <tr key={session.id} className="border-t align-top">
                                <td className="py-1 pe-2 whitespace-nowrap">{formatDate(session.introductionDate)}{session.introductionTime ? ` ${session.introductionTime}` : ''}</td>
                                <td className="py-1 pe-2 whitespace-nowrap">{session.removalDate ? `${formatDate(session.removalDate)}${session.removalTime ? ` ${session.removalTime}` : ''}` : DASH}</td>
                                <td className="py-1 pe-2">
                                  {session.locks.length ? (
                                    <ul className="space-y-0.5">
                                      {session.locks.map((lock) => (
                                        <li key={lock.id} className="flex flex-wrap items-center gap-1">
                                          <span className={lock.status === 'observed' ? 'font-semibold' : 'text-neutral-600'}>{lockStatusLabel(t, lock.status)}</span>
                                          <span>{formatDate(lock.observationDate)}{lock.observationTime ? ` ${lock.observationTime}` : ''}</span>
                                          {lock.notes ? <span className="text-neutral-500">· {lock.notes}</span> : null}
                                          {!isClosed ? (
                                            <select className="border rounded px-1 py-0.5 text-[10px]" value={lock.status} aria-label={t('breeding.field.lockStatus', { defaultValue: 'Status' })} onChange={(e) => run(() => actions.setLockStatus(cycle.id, session.id, lock.id, e.target.value))}>
                                              {['observed', 'not_observed', 'unknown'].map((s) => <option key={s} value={s}>{lockStatusLabel(t, s)}</option>)}
                                            </select>
                                          ) : null}
                                          {!isClosed ? <button type="button" className="underline text-[10px]" onClick={() => run(() => actions.removeLock(cycle.id, session.id, lock.id))}>{t('common.remove', { defaultValue: 'Remove' })}</button> : null}
                                        </li>
                                      ))}
                                    </ul>
                                  ) : <span className="text-neutral-500">{t('breeding.session.noLockRecord', { defaultValue: 'No lock record (unknown)' })}</span>}
                                </td>
                                <td className="py-1 pe-2 text-neutral-600">{session.notes || DASH}</td>
                                <td className="py-1 whitespace-nowrap">
                                  {!isClosed ? <button type="button" className="underline text-[10px] me-2" onClick={() => openDialog({ kind: 'lock', cycleId: cycle.id, sessionId: session.id })}>{t('breeding.session.addLock', { defaultValue: '+ Lock' })}</button> : null}
                                  {!isClosed ? <button type="button" className="underline text-[10px] me-2" onClick={() => openDialog({ kind: 'editSession', cycleId: cycle.id, sessionId: session.id })}>{t('common.edit', { defaultValue: 'Edit' })}</button> : null}
                                  {!isClosed ? <button type="button" className="underline text-[10px]" onClick={() => { if (window.confirm(t('breeding.session.removeConfirm', { defaultValue: 'Remove this pairing session and its lock records?' }))) run(() => actions.removeSession(cycle.id, session.id)); }}>{t('common.remove', { defaultValue: 'Remove' })}</button> : null}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : <div className="text-neutral-500">{t('breeding.male.noSessions', { defaultValue: 'No actual pairing session yet.' })}</div>}
                      {male.state === MALE_STATE.PLANNED && !isClosed ? <button type="button" className={`${smallBtn} mt-1`} onClick={() => run(() => actions.removeMale(cycle.id, male.maleId))}>{t('breeding.male.removePlanned', { defaultValue: 'Remove planned male' })}</button> : null}
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
          {!isClosed ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <select className="border rounded-lg px-2 py-1 text-xs bg-white" defaultValue="" onChange={(e) => { if (e.target.value) { run(() => actions.addMale(cycle.id, e.target.value)); e.target.value = ''; } }} aria-label={t('breeding.card.addMale', { defaultValue: 'Add candidate male' })} disabled={!cycle.multipleSires && cycle.males.length >= 1}>
                <option value="">{t('breeding.card.addMale', { defaultValue: 'Add candidate male' })}</option>
                {males.filter((m) => !cycle.males.some((x) => x.maleId === m.id)).map((m) => <option key={m.id} value={m.id}>{animalName(m)} ({m.id})</option>)}
              </select>
              {!cycle.multipleSires && cycle.males.length >= 1 ? <span className="text-[11px] text-neutral-500">{t('breeding.card.enableMultipleHint', { defaultValue: 'Turn on Multiple sires to add another male to this cycle.' })}</span> : null}
            </div>
          ) : null}
        </div>

        {/* Forecasts */}
        <div className="mt-3">
          <div className="rounded-xl border bg-white p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 mb-1">{t('breeding.card.forecastTitle', { defaultValue: 'Expected windows (history-based)' })}</div>
            {forecasts.windows?.length ? (
              <ul className="space-y-1 text-xs">
                {forecasts.windows.map((w) => (
                  <li key={w.metric}>
                    <span className="font-semibold">{eventTypeLabel(t, w.target)}</span>: {formatDate(w.earliest)} – {formatDate(w.latest)}{w.typical ? ` (${t('breeding.forecast.typical', { defaultValue: 'typical' })} ${formatDate(w.typical)})` : ''}
                    <div className="text-neutral-500">
                      {w.kind === 'forecast' ? t('breeding.forecast.fromFemale', { defaultValue: 'From {{n}} of her completed cycles; anchored on {{anchor}} {{date}}. Historical range, not a confidence interval.', n: w.sampleCount, anchor: eventTypeLabel(t, w.anchor), date: formatDate(w.anchorDate) }) : null}
                      {w.kind === 'descriptive' ? t('breeding.forecast.descriptive', { defaultValue: 'Descriptive only: {{n}} prior cycle(s), fewer than the {{min}} needed for a forecast. Anchored on {{anchor}} {{date}}.', n: w.sampleCount, min: forecasts.minCycles, anchor: eventTypeLabel(t, w.anchor), date: formatDate(w.anchorDate) }) : null}
                      {w.source === 'collection_history' ? t('breeding.forecast.fromCollection', { defaultValue: 'From {{n}} completed cycles of other females of this species in your collection; anchored on {{anchor}} {{date}}. Historical range.', n: w.sampleCount, anchor: eventTypeLabel(t, w.anchor), date: formatDate(w.anchorDate) }) : null}
                      {w.kind === 'reference' ? t('breeding.forecast.reference', { defaultValue: 'Species reference range (keeper literature), not this female\'s data. Anchored on {{anchor}} {{date}}.', anchor: eventTypeLabel(t, w.anchor), date: formatDate(w.anchorDate) }) : null}
                      {w.overdue ? ` ${t('breeding.forecast.overdue', { defaultValue: 'The range has passed without a recorded event.' })}` : ''}
                    </div>
                  </li>
                ))}
              </ul>
            ) : <div className="text-xs text-neutral-500">{isClosed ? t('breeding.forecast.closed', { defaultValue: 'No projections for a closed card.' }) : t('breeding.forecast.none', { defaultValue: 'No window yet: a window needs a recorded anchor event (ovulation, pre-lay shed or laying) and usable history or a documented species reference.' })}</div>}
          </div>
        </div>

        <div className="mt-3 rounded-xl border bg-white p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 mb-1">{t('breeding.card.timeline', { defaultValue: 'Timeline' })}</div>
          <CycleTimeline
            cycle={cycle}
            exams={exams}
            snakesById={snakesById}
            onSelectExam={(examId) => openDialog({ kind: 'exam', examId, femaleId: cycle.femaleId })}
            onSelectEvent={isClosed ? null : (eventId) => openDialog({ kind: 'milestone', cycleId: cycle.id, eventId })}
            onSelectSession={isClosed ? null : (sessionId) => openDialog({ kind: 'editSession', cycleId: cycle.id, sessionId })}
            onSelectPlanned={isClosed ? null : (plannedId) => openDialog({ kind: 'reschedule', cycleId: cycle.id, plannedId })}
          />
        </div>
        {/* Previous cycles */}
        <div className="mt-3">
          <PreviousCycles cycles={femaleCycles} exams={exams} currentCycle={cycle} snakesById={snakesById} onOpenCycle={onOpenCycle} />
        </div>
        </>
      ) : null}

      {section === 'follicles' ? (
        <div className="mt-3 flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-neutral-600 min-w-0">
              {change?.comparable ? <div className="text-xs text-neutral-700">{t('breeding.card.trend', { defaultValue: 'Follicle trend: {{sign}}{{delta}} mm over {{days}} days ({{rate}} mm/day), comparable ultrasound records only.', sign: change.deltaMm > 0 ? '+' : '', delta: change.deltaMm, days: change.days, rate: change.ratePerDay })}</div> : latest ? <div className="text-xs text-neutral-500">{t('breeding.card.singleScan', { defaultValue: 'One measurement only; a trend needs two comparable scans.' })}</div> : null}
            </div>
            <button type="button" className={primaryBtn} onClick={() => openDialog({ kind: 'exam', femaleId: cycle.femaleId })}>{t('breeding.action.exam', { defaultValue: '+ Follicle exam' })}</button>
          </div>
          {cycleExams.length ? <FollicleChart exams={cycleExams} cycle={cycle} overlays={overlays} onSelectExam={(examId) => openDialog({ kind: 'exam', examId, femaleId: cycle.femaleId })} /> : null}
          <div className="rounded-xl border bg-white p-3 overflow-x-auto">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 mb-1">{t('breeding.card.examsTitle', { defaultValue: 'Follicle examinations' })}</div>
            {sortedExams.length ? (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wide text-neutral-500">
                    <th className="text-start py-1 pe-2">{t('breeding.table.date', { defaultValue: 'Date' })}</th>
                    <th className="text-start py-1 pe-2">{t('breeding.table.method', { defaultValue: 'Method' })}</th>
                    <th className="text-start py-1 pe-2">{t('breeding.table.result', { defaultValue: 'Result' })}</th>
                    <th className="text-start py-1 pe-2">{t('breeding.table.largest', { defaultValue: 'Largest' })}</th>
                    <th className="text-start py-1 pe-2">{t('breeding.table.count', { defaultValue: 'Count' })}</th>
                    <th className="text-start py-1 pe-2">{t('breeding.table.notes', { defaultValue: 'Notes' })}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {sortedExams.map((exam) => (
                    <tr key={exam.id} className="border-t align-top">
                      <td className="py-1 pe-2 whitespace-nowrap tabular-nums">{formatDate(exam.date)}{exam.time ? ` ${exam.time}` : ''}</td>
                      <td className="py-1 pe-2">{methodLabel(t, exam.method)}</td>
                      <td className="py-1 pe-2">{resultLabel(t, exam.result)}</td>
                      <td className="py-1 pe-2 whitespace-nowrap tabular-nums">{exam.largestDiameterMm !== null ? formatMm(exam.largestDiameterMm, { estimate: exam.largestIsEstimate }) : DASH}</td>
                      <td className="py-1 pe-2 tabular-nums">{exam.visibleCount ?? DASH}</td>
                      <td className="py-1 pe-2 text-neutral-600">{exam.notes || DASH}</td>
                      <td className="py-1 whitespace-nowrap"><button type="button" className="underline text-[10px]" onClick={() => openDialog({ kind: 'exam', examId: exam.id, femaleId: cycle.femaleId })}>{t('common.edit', { defaultValue: 'Edit' })}</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <div className="text-xs text-neutral-500">{t('breeding.card.noExams', { defaultValue: 'No follicle examination on this card yet. Exams normally happen between pairings during the season.' })}</div>}
          </div>
        </div>
      ) : null}

      {section === 'clutch' ? (
        <>
        {/* Clutch and offspring */}
        {cycle.reproductionMode !== 'live_bearing' || cycle.offspring.length ? (
          <div className="mt-3 rounded-xl border bg-white p-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">{t('breeding.card.outcomeTitle', { defaultValue: 'Clutch and hatchlings' })}</div>
              {onCreateHatchlings && !isClosed && cycle.clutch.hatchlingsRecorded ? <button type="button" className={smallBtn} onClick={() => onCreateHatchlings(cycle)}>{t('breeding.card.createHatchlings', { defaultValue: 'Create hatchling records' })}</button> : null}
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
              <span>{t('breeding.metric.eggsTotal', { defaultValue: 'Eggs laid' })}: <strong>{cycle.clutch.eggsTotal ?? DASH}</strong></span>
              <span>{t('breeding.metric.fertileEggs', { defaultValue: 'Fertile eggs' })}: <strong>{cycle.clutch.fertileEggs ?? DASH}</strong></span>
              <span>{t('breeding.metric.slugs', { defaultValue: 'Slugs' })}: <strong>{cycle.clutch.slugs ?? DASH}</strong></span>
              <span>{t('breeding.metric.hatchlings', { defaultValue: 'Hatchlings' })}: <strong>{cycle.clutch.hatchlingsRecorded ?? DASH}</strong></span>
              <span>{t('breeding.field.lostEggs', { defaultValue: 'Unhatched / lost eggs' })}: <strong>{cycle.clutch.lostEggs ?? DASH}</strong></span>
              <span>{cycle.clutch.outcomeComplete ? t('breeding.card.outcomeCompleteFull', { defaultValue: 'Final outcome recorded' }) : t('breeding.card.outcomeOpen', { defaultValue: 'Final outcome not yet recorded' })}</span>
            </div>
            {cycle.offspring.length ? (
              <ul className="mt-2 space-y-1">
                {cycle.offspring.map((item) => {
                  const snake = snakesById?.get?.(item.animalId) || null;
                  const sire = item.sireAssignment?.maleId ? snakesById?.get?.(item.sireAssignment.maleId) : null;
                  return (
                    <li key={item.animalId} className="flex flex-wrap items-center gap-2">
                      {onOpenSnake && snake ? <button type="button" className="underline" onClick={() => onOpenSnake(snake)}>{animalName(snake, item.animalId)}</button> : <span>{animalName(snake, item.animalId)}</span>}
                      <DepartureTag animal={snake} />
                      <span className="text-neutral-600">
                        {t('breeding.offspring.sire', { defaultValue: 'Sire' })}: {item.sireAssignment?.maleId ? `${animalName(sire, item.sireAssignment.maleId)} (${item.sireAssignment.method.replace(/_/g, ' ')}, ${item.sireAssignment.certainty})` : t('breeding.offspring.unresolved', { defaultValue: 'unresolved' })}
                      </span>
                      <button type="button" className="underline" onClick={() => openDialog({ kind: 'sire', cycleId: cycle.id, animalId: item.animalId })}>{t('breeding.offspring.assign', { defaultValue: 'Assign / correct' })}</button>
                    </li>
                  );
                })}
              </ul>
            ) : <div className="mt-1 text-neutral-500">{t('breeding.offspring.none', { defaultValue: 'No hatchling records linked yet.' })}</div>}
            {participated.length > 1 ? <div className="mt-1 text-[11px] text-neutral-500">{t('breeding.offspring.multiHint', { defaultValue: 'With several candidate sires, genetic outcomes are shown separately per female–male pair in the genetics calculator; a lock never selects a father.' })}</div> : null}
          </div>
        ) : null}

        </>
      ) : null}
    </div>
  );
}
