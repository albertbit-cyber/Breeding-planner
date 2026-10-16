/**
 * "Pairing plan and milestones": the breeding card's working window.
 *
 * Left: one row per pairing. Ticking Paired fills today's date and the next row appears one
 * calendar month later; Lock observed fills its own date the same way; each row has a short note.
 * A row whose date passes unticked stays blank and asks for nothing.
 * Right: the milestones with the old pairing card's arithmetic (pre-lay +21 days after ovulation,
 * eggs +30 after the pre-lay shed, hatching +60 after laying) and eggs, slugs and good eggs.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { pairingPlanRows, milestoneSummary, milestoneCountdown, PLAN_MILESTONES } from '../domain/pairingPlan';
import { recordedEventDate } from '../domain/cycleModel';
import { todayYmd } from '../domain/dates';
import { animalName, formatDate, DASH } from './format';
import { eventTypeLabel } from './labels';

const dateInput = 'border rounded-lg px-1.5 py-1 text-xs bg-white tabular-nums w-[9rem] disabled:bg-neutral-50 disabled:text-neutral-500';
/** One plan row: number · Paired + date · Lock observed + date · note. Wraps on narrow screens. */
const rowGrid = 'flex flex-wrap items-center gap-x-3 gap-y-1.5 sm:grid sm:grid-cols-[1.25rem_auto_9rem_auto_9rem_minmax(8rem,1fr)]';
const tick = 'h-4 w-4 shrink-0 accent-current';

/** A text or number field that saves when it loses focus or on Enter, not on every keystroke. */
function CommitField({ value, onCommit, disabled, className, type = 'text', ...rest }) {
  const [draft, setDraft] = useState(value ?? '');
  useEffect(() => { setDraft(value ?? ''); }, [value]);
  const commit = () => { if (String(draft) !== String(value ?? '')) onCommit(draft); };
  return (
    <input
      {...rest}
      type={type}
      className={className}
      value={draft}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } if (e.key === 'Escape') setDraft(value ?? ''); }}
    />
  );
}

function PlanRow({ index, row, cycle, snakesById, showMale, disabled, actions, run, t }) {
  const label = (key, fallback) => t(key, { defaultValue: fallback });
  const togglePaired = (checked) => {
    if (checked) return run(() => actions.planMarkPaired(cycle.id, row));
    if (row.lock && !window.confirm(label('breeding.plan.untickConfirm', 'Untick Paired? The lock recorded on this row is removed too.'))) return null;
    return run(() => actions.planUnmarkPaired(cycle.id, row.sessionId));
  };
  const toggleLock = (checked) => {
    if (!checked) return run(() => actions.planUnmarkLock(cycle.id, row.sessionId, row.lock.id));
    if (!row.paired) return run(() => actions.planMarkPaired(cycle.id, row, { withLock: true }));
    return run(() => actions.planMarkLock(cycle.id, row.sessionId));
  };
  const rowLabel = t('breeding.plan.rowLabel', { defaultValue: 'Pairing {{n}}', n: index + 1 });
  return (
    <li className="py-2 border-t first:border-t-0">
      <div className={rowGrid}>
        <span className="w-5 shrink-0 text-[11px] font-semibold text-neutral-400 tabular-nums" aria-hidden="true">{index + 1}</span>
        <span className="inline-flex items-center gap-1.5">
          <input type="checkbox" className={tick} checked={row.paired} disabled={disabled} onChange={(e) => togglePaired(e.target.checked)} id={`plan-paired-${cycle.id}-${row.key}`} aria-label={`${rowLabel}: ${label('breeding.plan.paired', 'Paired')}`} />
          <label htmlFor={`plan-paired-${cycle.id}-${row.key}`} className="text-xs font-medium">{label('breeding.plan.paired', 'Paired')}</label>
        </span>
        {row.paired ? (
          <input type="date" className={dateInput} value={row.pairedDate || ''} max={todayYmd()} disabled={disabled} aria-label={`${rowLabel}: ${label('breeding.plan.pairedDate', 'Pairing date')}`} onChange={(e) => { if (e.target.value) run(() => actions.planSetPairedDate(cycle.id, row.sessionId, e.target.value)); }} />
        ) : (
          <span className="w-[9rem] rounded-lg border border-dashed px-1.5 py-1 text-xs text-neutral-500 tabular-nums whitespace-nowrap" title={label('breeding.plan.plannedTitle', 'Planned date. Nothing is due if it passes.')}>
            {row.plannedDate ? t('breeding.plan.plannedFor', { defaultValue: 'planned {{date}}', date: formatDate(row.plannedDate) }) : DASH}
          </span>
        )}
        <span className="inline-flex items-center gap-1.5 ms-8 sm:ms-0">
          <input type="checkbox" className={tick} checked={!!row.lock} disabled={disabled} onChange={(e) => toggleLock(e.target.checked)} id={`plan-lock-${cycle.id}-${row.key}`} aria-label={`${rowLabel}: ${label('breeding.plan.lockObserved', 'Lock observed')}`} />
          <label htmlFor={`plan-lock-${cycle.id}-${row.key}`} className="text-xs font-medium whitespace-nowrap">{label('breeding.plan.lockObserved', 'Lock observed')}</label>
        </span>
        {row.lock ? (
          <span className="inline-flex items-center gap-1">
            <input type="date" className={dateInput} value={row.lock.observationDate || ''} max={todayYmd()} disabled={disabled} aria-label={`${rowLabel}: ${label('breeding.plan.lockDate', 'Lock date')}`} onChange={(e) => { if (e.target.value) run(() => actions.planSetLockDate(cycle.id, row.sessionId, row.lock.id, e.target.value)); }} />
            {row.lockCount > 1 ? <span className="text-[11px] text-neutral-500 whitespace-nowrap">{t('breeding.plan.moreLocks', { defaultValue: '+{{count}} more', count: row.lockCount - 1 })}</span> : null}
          </span>
        ) : <span className="hidden sm:block" aria-hidden="true" />}
        <CommitField
          className="min-w-[8rem] flex-1 border rounded-lg px-2 py-1 text-xs bg-white disabled:bg-neutral-50"
          value={row.note}
          disabled={disabled}
          placeholder={label('breeding.plan.notePlaceholder', 'Note')}
          aria-label={`${rowLabel}: ${label('breeding.plan.note', 'Note')}`}
          maxLength={200}
          onCommit={(note) => run(() => actions.planSetNote(cycle.id, row, note))}
        />
      </div>
      {showMale && row.maleId ? <div className="ms-8 mt-0.5 text-[11px] text-neutral-500">{animalName(snakesById?.get?.(row.maleId), row.maleId)}</div> : null}
    </li>
  );
}

function MilestoneRow({ type, date, cycle, disabled, actions, run, t, children }) {
  const id = `plan-ms-${cycle.id}-${type}`;
  return (
    <li className="py-2 border-t first:border-t-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="inline-flex items-center gap-1.5 min-w-[9rem]">
          <input type="checkbox" id={id} className={tick} checked={!!date} disabled={disabled} onChange={(e) => run(() => actions.planSetMilestone(cycle.id, type, e.target.checked ? todayYmd() : null))} />
          <label htmlFor={id} className="text-xs font-medium">{type === 'egg_laying' ? t('breeding.plan.eggsLaid', { defaultValue: 'Eggs laid' }) : eventTypeLabel(t, type)}</label>
        </span>
        {date ? (
          <input type="date" className={dateInput} value={date} max={todayYmd()} disabled={disabled} aria-label={t('breeding.plan.milestoneDate', { defaultValue: '{{milestone}} date', milestone: eventTypeLabel(t, type) })} onChange={(e) => { if (e.target.value) run(() => actions.planSetMilestone(cycle.id, type, e.target.value)); }} />
        ) : null}
      </div>
      {children ? <div className="ms-6 mt-0.5 text-[11px] text-neutral-600">{children}</div> : null}
    </li>
  );
}

function countdownText(t, countdown) {
  if (!countdown) return null;
  const what = {
    pre_lay_shed: t('breeding.plan.etaPreLay', { defaultValue: 'Pre-lay shed expected' }),
    egg_laying: t('breeding.plan.etaEggs', { defaultValue: 'Eggs expected' }),
    first_hatch: t('breeding.plan.etaHatch', { defaultValue: 'Hatching expected' }),
  }[countdown.key];
  const when = countdown.daysLeft > 1
    ? t('breeding.plan.inDays', { defaultValue: 'in {{count}} days', count: countdown.daysLeft })
    : countdown.daysLeft === 1 ? t('breeding.plan.tomorrow', { defaultValue: 'tomorrow' })
      : countdown.daysLeft === 0 ? t('breeding.plan.today', { defaultValue: 'today' })
        : t('breeding.plan.daysPast', { defaultValue: '{{count}} days past the expected date', count: Math.abs(countdown.daysLeft) });
  return { what, when, day: t('breeding.plan.dayOf', { defaultValue: 'Day {{day}} of {{total}}', day: countdown.dayNumber, total: countdown.totalDays }) };
}

export function PairingPlanPanel({ cycle, snakesById, actions, run, isClosed = false }) {
  const { t } = useTranslation();
  const rows = useMemo(() => pairingPlanRows(cycle), [cycle]);
  const summary = useMemo(() => milestoneSummary(cycle), [cycle]);
  const countdown = milestoneCountdown(cycle);
  const timer = countdownText(t, countdown);
  const liveBearing = cycle.reproductionMode === 'live_bearing';
  const showMale = cycle.males.length > 1 || new Set(rows.map((r) => r.maleId).filter(Boolean)).size > 1;
  const ovulated = !!recordedEventDate(cycle, 'ovulation');
  const shared = { cycle, disabled: isClosed, actions, run, t };
  const dateOf = { ovulation: summary.ovulation, pre_lay_shed: summary.preLay, egg_laying: summary.laid, live_birth: summary.liveBirth };
  const etaUnder = {
    ovulation: summary.preLayEta && !summary.preLay ? t('breeding.plan.preLayEta', { defaultValue: 'Pre-lay shed expected {{date}} (+{{days}} days)', date: formatDate(summary.preLayEta), days: 21 }) : null,
    pre_lay_shed: summary.eggLayingEta && !summary.laid ? t('breeding.plan.eggEta', { defaultValue: 'Eggs expected {{date}} (+{{days}} days)', date: formatDate(summary.eggLayingEta), days: 30 }) : null,
    egg_laying: summary.hatchEta && !summary.hatched ? t('breeding.plan.hatchEta', { defaultValue: 'Hatching expected {{date}} (+{{days}} days)', date: formatDate(summary.hatchEta), days: 60 }) : null,
  };
  const sectionTitle = 'text-[10px] font-semibold uppercase tracking-wide text-neutral-500';

  return (
    <section className="mt-3 rounded-xl border bg-white p-3" aria-label={t('breeding.plan.title', { defaultValue: 'Pairing plan and milestones' })}>
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-x-6 gap-y-4">
        <div className="min-w-0">
          <div className={sectionTitle}>{t('breeding.plan.pairingsTitle', { defaultValue: 'Pairing plan' })}</div>
          {rows.length ? (
            <ol className="mt-1">
              {rows.map((row, index) => <PlanRow key={row.key} index={index} row={row} snakesById={snakesById} showMale={showMale} {...shared} />)}
            </ol>
          ) : <div className="mt-1 text-xs text-neutral-500">{t('breeding.plan.noRows', { defaultValue: 'No pairing on this card.' })}</div>}
          <div className="mt-1 text-[11px] text-neutral-500">
            {ovulated
              ? t('breeding.plan.endedAtOvulation', { defaultValue: 'Ovulation recorded: no further pairing rows.' })
              : t('breeding.plan.hint', { defaultValue: 'Tick Paired when they pair: today\'s date is filled in and the next row appears one month later. A date that passes unticked is simply left blank. Upcoming dates show in the Calendar.' })}
          </div>
        </div>

        <div className="min-w-0 lg:border-s lg:ps-6">
          <div className={sectionTitle}>{t('breeding.plan.milestonesTitle', { defaultValue: 'Milestones' })}</div>
          {timer ? (
            <div className="mt-1.5 rounded-lg border bg-neutral-50 px-2.5 py-1.5 text-xs flex flex-wrap items-baseline gap-x-2" role="status">
              <span className="font-semibold">{timer.what}</span>
              <span className="tabular-nums">{formatDate(countdown.targetDate)}</span>
              <span className="text-neutral-600">{timer.when} · {timer.day}</span>
            </div>
          ) : null}
          <ul className="mt-1">
            {(liveBearing ? PLAN_MILESTONES.live_bearing : PLAN_MILESTONES.egg_laying).map((type) => (
              <MilestoneRow key={type} type={type} date={dateOf[type]} {...shared}>{etaUnder[type]}</MilestoneRow>
            ))}
          </ul>
          {!liveBearing ? (
            <div className="mt-2 grid grid-cols-3 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-medium text-neutral-600">{t('breeding.plan.eggs', { defaultValue: 'Eggs' })}</span>
                <CommitField type="number" min="0" step="1" inputMode="numeric" className="border rounded-lg px-2 py-1 text-xs bg-white tabular-nums w-full disabled:bg-neutral-50" value={summary.eggs ?? ''} disabled={isClosed} onCommit={(v) => run(() => actions.planSetClutchCounts(cycle.id, { eggsTotal: v }))} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-medium text-neutral-600">{t('breeding.plan.slugs', { defaultValue: 'Slugs' })}</span>
                <CommitField type="number" min="0" step="1" inputMode="numeric" className="border rounded-lg px-2 py-1 text-xs bg-white tabular-nums w-full disabled:bg-neutral-50" value={summary.slugs ?? ''} disabled={isClosed} onCommit={(v) => run(() => actions.planSetClutchCounts(cycle.id, { slugs: v }))} />
              </label>
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-medium text-neutral-600">{t('breeding.plan.goodEggs', { defaultValue: 'Good eggs' })}</span>
                <span className="px-2 py-1 text-xs font-semibold tabular-nums">{summary.goodEggs ?? DASH}</span>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
