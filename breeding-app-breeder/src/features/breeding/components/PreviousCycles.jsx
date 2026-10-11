/**
 * The small, collapsible "Previous breeding cycles" section and the across-cycle statistics.
 * Medians come with their range and their own sample count; one prior cycle is called one prior
 * cycle; no history is an honest empty state.
 */
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { summarizeCycle, femaleStatistics, compareWithHistory, INTERVAL_METRICS, COUNT_METRICS } from '../domain/history';
import { todayYmd } from '../domain/dates';
import { animalName, formatDate, formatDays, formatMm, DASH, STATUS_CLASS } from './format';
import { metricLabel, statusLabel, closureOutcomeLabel } from './labels';

function Interval({ value }) {
  const { t } = useTranslation();
  if (!value || value.status === 'not_recorded') return <span className="text-neutral-400">{t('breeding.history.notRecorded', { defaultValue: 'Not recorded' })}</span>;
  if (value.status === 'invalid_chronology') return <span className="text-rose-700">{t('breeding.history.invalidChronology', { defaultValue: 'Dates conflict' })}</span>;
  return <span className="tabular-nums">{formatDays(value.value)}</span>;
}

export function CycleSummaryDetails({ summary, snakesById }) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
      <div className="space-y-1">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">{t('breeding.history.pairingsAndLocks', { defaultValue: 'Pairings and locks' })}</div>
        <div>{t('breeding.history.sessions', { defaultValue: 'Pairing sessions: {{count}}', count: summary.sessionCount })} · {t('breeding.history.locks', { defaultValue: 'Observed locks: {{count}}', count: summary.lockCount })}</div>
        <div>{t('breeding.history.frequency', { defaultValue: 'Average interval between introductions' })}: {summary.frequency.averageIntervalDays === null ? t('breeding.history.unavailable', { defaultValue: 'unavailable (fewer than two introductions)' }) : formatDays(summary.frequency.averageIntervalDays)}{summary.frequency.sameDayCount ? ` · ${t('breeding.history.sameDay', { defaultValue: '{{count}} same-day sessions', count: summary.frequency.sameDayCount })}` : ''}</div>
        {summary.lockDates.length ? <div className="text-neutral-600">{t('breeding.history.lockDates', { defaultValue: 'Lock dates' })}: {summary.lockDates.map(formatDate).join(', ')}</div> : null}
        <ul className="mt-1 space-y-1">
          {summary.males.map((male) => (
            <li key={male.maleId} className="rounded-lg border bg-neutral-50 px-2 py-1">
              <div className="font-medium">{animalName(snakesById?.get?.(male.maleId), male.maleId)} <span className="text-neutral-500">· {t('breeding.history.maleCounts', { defaultValue: '{{sessions}} sessions, {{locks}} observed locks', sessions: male.sessionCount, locks: male.lockCount })}</span></div>
              {male.sessions.length ? (
                <div className="text-neutral-600">{male.sessions.map((s) => `${formatDate(s.introductionDate)}${s.removalDate ? ` → ${formatDate(s.removalDate)}` : ''}`).join(', ')}</div>
              ) : null}
              <div className="text-neutral-600">
                {t('breeding.history.maleInterval', { defaultValue: 'Interval between his introductions' })}: {male.frequency.averageIntervalDays === null ? DASH : formatDays(male.frequency.averageIntervalDays)}
                {' · '}
                {t('breeding.history.maleToOvulation', { defaultValue: 'last pairing to ovulation' })}: <Interval value={male.lastPairingToOvulation} />
              </div>
            </li>
          ))}
        </ul>
        <div className="text-[11px] text-neutral-500">{t('breeding.history.noPaternityHint', { defaultValue: 'Timing per male is shown for information; it implies neither causation nor paternity.' })}</div>
      </div>
      <div className="space-y-1">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">{t('breeding.history.intervals', { defaultValue: 'Intervals' })}</div>
        <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5">
          {INTERVAL_METRICS.map((key) => (
            <React.Fragment key={key}>
              <dt className="text-neutral-600">{metricLabel(t, key)}</dt>
              <dd className="text-end"><Interval value={summary.intervals[key]} /></dd>
            </React.Fragment>
          ))}
        </dl>
        <div className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 mt-2">{t('breeding.history.outcome', { defaultValue: 'Outcome' })}</div>
        <div>
          {summary.clutch.noClutch
            ? t('breeding.history.noClutch', { defaultValue: 'No clutch' })
            : `${t('breeding.metric.eggsTotal', { defaultValue: 'Eggs laid' })}: ${summary.clutch.eggsTotal ?? DASH} · ${t('breeding.metric.fertileEggs', { defaultValue: 'Fertile eggs' })}: ${summary.clutch.fertileEggs ?? DASH} · ${t('breeding.metric.slugs', { defaultValue: 'Slugs' })}: ${summary.clutch.slugs ?? DASH} · ${t('breeding.metric.hatchlings', { defaultValue: 'Hatchlings' })}: ${summary.clutch.hatchlingsRecorded ?? DASH}`}
        </div>
        <div className="text-neutral-600">
          {t('breeding.history.completion', { defaultValue: 'Hatching completed' })}: {summary.biologicalCompletionDate ? formatDate(summary.biologicalCompletionDate) : DASH}
          {' · '}
          {t('breeding.history.closedAdmin', { defaultValue: 'Card closed (administrative)' })}: {summary.administrativeClosedAt ? formatDate(summary.administrativeClosedAt) : DASH}
        </div>
        <div className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 mt-2">{t('breeding.history.follicles', { defaultValue: 'Follicles' })}</div>
        <div>
          {summary.follicles.examCount
            ? `${t('breeding.history.firstMeasurement', { defaultValue: 'First' })}: ${summary.follicles.firstMeasurement ? `${formatMm(summary.follicles.firstMeasurement.valueMm)} (${formatDate(summary.follicles.firstMeasurement.date)})` : DASH} · ${t('breeding.history.latestMeasurement', { defaultValue: 'Latest' })}: ${summary.follicles.latestMeasurement ? `${formatMm(summary.follicles.latestMeasurement.valueMm)} (${formatDate(summary.follicles.latestMeasurement.date)})` : DASH}${summary.follicles.trend?.comparable ? ` · ${summary.follicles.trend.deltaMm > 0 ? '+' : ''}${summary.follicles.trend.deltaMm} mm / ${summary.follicles.trend.days} d` : ''}`
            : t('breeding.history.noScans', { defaultValue: 'No examinations in this cycle' })}
        </div>
      </div>
    </div>
  );
}

export function FemaleStatistics({ cycles, exams, currentCycle, snakesById }) {
  const { t } = useTranslation();
  const stats = useMemo(() => femaleStatistics(cycles, exams, { excludeCycleId: currentCycle?.id || null }), [cycles, exams, currentCycle]);
  const comparison = useMemo(() => (currentCycle ? compareWithHistory(summarizeCycle(currentCycle, exams), stats, { today: todayYmd() }) : null), [currentCycle, exams, stats]);
  if (!stats.hasHistory) {
    return <div className="text-xs text-neutral-500">{t('breeding.stats.empty', { defaultValue: 'No completed earlier cycle to compare with yet. Statistics appear once a previous card holds usable dates.' })}</div>;
  }
  const verdictLabel = (verdict) => ({
    faster: t('breeding.stats.faster', { defaultValue: 'faster than her range' }),
    slower: t('breeding.stats.slower', { defaultValue: 'slower than her range' }),
    within_range: t('breeding.stats.withinRange', { defaultValue: 'within her range' }),
  }[verdict] || '');
  const rows = [...INTERVAL_METRICS, ...COUNT_METRICS, 'locksPerCycle', 'sessionsPerCycle'];
  return (
    <div className="text-xs">
      <div className="text-neutral-600 mb-1">
        {stats.cycleCount === 1
          ? t('breeding.stats.onePrior', { defaultValue: 'Based on one prior cycle. This is a single observation, not a personal norm.' })
          : t('breeding.stats.basedOn', { defaultValue: 'Typical = median of {{count}} prior cycles; each metric shows its own sample count.', count: stats.cycleCount })}
        {stats.noClutchCycles.length ? ` ${t('breeding.stats.noClutchNote', { defaultValue: '{{count}} cycle(s) ended without a clutch; they are listed, not counted as zero eggs.', count: stats.noClutchCycles.length })}` : ''}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-[10px] uppercase tracking-wide text-neutral-500">
              <th className="text-start py-1 pe-2">{t('breeding.stats.metric', { defaultValue: 'Metric' })}</th>
              <th className="text-end py-1 pe-2">{t('breeding.stats.typical', { defaultValue: 'Typical (median)' })}</th>
              <th className="text-end py-1 pe-2">{t('breeding.stats.range', { defaultValue: 'Shortest–longest' })}</th>
              <th className="text-end py-1 pe-2">{t('breeding.stats.n', { defaultValue: 'Cycles' })}</th>
              {comparison ? <th className="text-start py-1">{t('breeding.stats.thisCycle', { defaultValue: 'This cycle' })}</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((key) => {
              const stat = stats.metrics[key];
              const isCount = COUNT_METRICS.includes(key) || key === 'locksPerCycle' || key === 'sessionsPerCycle';
              const fmt = (v) => (v === null || v === undefined ? DASH : isCount ? `${v}` : formatDays(v));
              const cmp = comparison?.[key];
              return (
                <tr key={key} className="border-t">
                  <td className="py-1 pe-2 text-neutral-700">{metricLabel(t, key)}</td>
                  <td className="py-1 pe-2 text-end tabular-nums">{stat.n ? fmt(stat.median) : <span className="text-neutral-400">{t('breeding.stats.noData', { defaultValue: 'no data' })}</span>}</td>
                  <td className="py-1 pe-2 text-end tabular-nums">{stat.n ? `${fmt(stat.min)} – ${fmt(stat.max)}` : DASH}</td>
                  <td className="py-1 pe-2 text-end tabular-nums">{stat.n}</td>
                  {comparison ? (
                    <td className="py-1 text-neutral-700">
                      {cmp?.verdict === 'not_completed' ? t('breeding.stats.notCompleted', { defaultValue: 'not yet' }) : cmp?.verdict && cmp.verdict !== 'no_history' ? `${fmt(cmp.current)} · ${verdictLabel(cmp.verdict)}` : DASH}
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {comparison?.elapsedSinceFirstPairing ? (
        <div className="mt-1 text-neutral-600">
          {t('breeding.stats.elapsed', { defaultValue: '{{days}} days since first pairing without recorded ovulation; her range was {{min}}–{{max}} days ({{n}} cycles).', days: comparison.elapsedSinceFirstPairing.days, min: comparison.elapsedSinceFirstPairing.min, max: comparison.elapsedSinceFirstPairing.max, n: comparison.elapsedSinceFirstPairing.n })}
        </div>
      ) : null}
      <div className="mt-1 text-[11px] text-neutral-500">{t('breeding.stats.precisionNote', { defaultValue: 'Only exact, recorded milestone dates are used. Estimated or suspected dates are left out.' })}</div>
    </div>
  );
}

export function PreviousCycles({ cycles = [], exams = [], currentCycle, snakesById, onOpenCycle = null }) {
  const { t } = useTranslation();
  const previous = useMemo(() => cycles.filter((c) => c && c.id !== currentCycle?.id && !c.deletedAt), [cycles, currentCycle]);
  const summaries = useMemo(() => previous.map((c) => summarizeCycle(c, exams)), [previous, exams]);
  return (
    <details className="rounded-xl border bg-white">
      <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-neutral-700 flex items-center justify-between">
        <span>{t('breeding.previous.title', { defaultValue: 'Previous breeding cycles ({{count}})', count: previous.length })}</span>
        <span className="text-[11px] text-neutral-500">{t('breeding.previous.hint', { defaultValue: 'Most recent first' })}</span>
      </summary>
      <div className="px-3 pb-3 space-y-3">
        <FemaleStatistics cycles={cycles} exams={exams} currentCycle={currentCycle} snakesById={snakesById} />
        {summaries.length ? (
          <ul className="space-y-1">
            {summaries.map((summary, index) => {
              const cycle = previous[index];
              return (
                <li key={summary.cycleId}>
                  <details className="rounded-lg border bg-neutral-50">
                    <summary className="cursor-pointer px-2 py-1.5 text-xs flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{summary.seasonLabel}</span>
                      <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_CLASS[summary.status] || ''}`}>{statusLabel(t, summary.status)}</span>
                      <span className="text-neutral-600">{formatDate(summary.startDate) || DASH}{summary.biologicalCompletionDate ? ` → ${formatDate(summary.biologicalCompletionDate)}` : ''}</span>
                      <span className="text-neutral-600">{summary.closure ? closureOutcomeLabel(t, summary.closure.outcome) : t('breeding.previous.open', { defaultValue: 'Still open' })}</span>
                      <span className="text-neutral-600">{t('breeding.history.sessionsShort', { defaultValue: '{{count}} sessions', count: summary.sessionCount })} · {t('breeding.history.locksShort', { defaultValue: '{{count}} locks', count: summary.lockCount })}</span>
                      {onOpenCycle ? <button type="button" className="ms-auto underline" onClick={(e) => { e.preventDefault(); onOpenCycle(cycle.id); }}>{t('breeding.previous.openCard', { defaultValue: 'Open card' })}</button> : null}
                    </summary>
                    <div className="px-2 pb-2"><CycleSummaryDetails summary={summary} snakesById={snakesById} /></div>
                  </details>
                </li>
              );
            })}
          </ul>
        ) : <div className="text-xs text-neutral-500">{t('breeding.previous.empty', { defaultValue: 'No earlier cycle recorded for this female.' })}</div>}
      </div>
    </details>
  );
}
