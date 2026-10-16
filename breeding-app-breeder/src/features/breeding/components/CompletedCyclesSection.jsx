/**
 * Completed pairing: closed breeding cards, grouped by the season each cycle started in, with
 * season and outcome filters. Reopening a card sends it back to Active pairing under the same
 * season; it never moves into the current one.
 */
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CYCLE_STATUS } from '../domain/cycleModel';
import { BreedingCard } from './BreedingCard';
import { groupBySeason, cycleMatchesSearch } from './BreedingCardsSection';
import { formatDate } from './format';
import { help } from '../../help/help';

const OUTCOME_FILTERS = {
  productive: (c) => c.closure?.outcome === 'hatching_complete' || c.closure?.outcome === 'live_birth_complete',
  no_clutch: (c) => c.closure?.outcome === 'no_clutch',
  failed_clutch: (c) => c.closure?.outcome === 'failed_clutch',
  stopped: (c) => ['cancelled', 'other'].includes(c.closure?.outcome),
  female_left: (c) => ['female_sold', 'female_died', 'female_left_collection'].includes(c.closure?.outcome),
  reopened: (c) => (c.reopenings || []).some((r) => r.reopenedAt),
};

function Chip({ active, onClick, children, ...rest }) {
  return (
    <button
      type="button"
      onClick={onClick}
      {...rest}
      aria-pressed={active}
      className={`text-xs px-2.5 py-1 rounded-full border ${active ? 'font-semibold' : 'bg-white text-neutral-600 hover:bg-neutral-50'}`}
      style={active ? { borderColor: 'var(--sk-primary, #0284c7)', color: 'var(--sk-primary, #0284c7)', background: 'var(--sk-primary-soft, #f0f9ff)' } : undefined}
    >
      {children}
    </button>
  );
}

export function CompletedCyclesSection({ cycles = [], exams = [], settings, snakesById, geneticsTokensFor, males = [], actions, openDialog, onOpenSnake, focusedCycleId = null, onFocusCycle, onCreateHatchlings, showAppAlert, locationFor, searchQuery = '', scopedFemaleIds = null, seasonSummaries = [] }) {
  const { t } = useTranslation();
  const [seasonFilter, setSeasonFilter] = useState('all');
  const [outcomeFilter, setOutcomeFilter] = useState('all');
  const closed = useMemo(() => cycles.filter((c) => c && !c.deletedAt && c.status === CYCLE_STATUS.CLOSED && (!scopedFemaleIds || scopedFemaleIds.has(c.femaleId))), [cycles, scopedFemaleIds]);
  const seasons = useMemo(() => groupBySeason(closed).map((g) => g.label), [closed]);
  // A season that no longer has completed cycles (one was reopened) falls back to all seasons.
  const season = seasonFilter !== 'all' && seasons.includes(seasonFilter) ? seasonFilter : 'all';
  const filtered = useMemo(() => closed.filter((c) => (
    (season === 'all' || c.seasonLabel === season)
    && (outcomeFilter === 'all' || OUTCOME_FILTERS[outcomeFilter]?.(c))
    && cycleMatchesSearch(c, searchQuery, snakesById)
  )), [closed, season, outcomeFilter, searchQuery, snakesById]);
  const groups = useMemo(() => groupBySeason(filtered), [filtered]);
  const summaryByLabel = useMemo(() => new Map(seasonSummaries.map((row) => [row.label, row])), [seasonSummaries]);

  const outcomeLabels = [
    ['productive', t('breeding.completed.filter.productive', { defaultValue: 'Hatched' })],
    ['no_clutch', t('breeding.completed.filter.noClutch', { defaultValue: 'No clutch' })],
    ['failed_clutch', t('breeding.completed.filter.failedClutch', { defaultValue: 'Failed clutch' })],
    ['stopped', t('breeding.completed.filter.stopped', { defaultValue: 'Stopped' })],
    ['female_left', t('breeding.completed.filter.femaleLeft', { defaultValue: 'Female left' })],
    ['reopened', t('breeding.completed.filter.reopened', { defaultValue: 'Reopened' })],
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="mt-card border p-3 flex flex-col gap-2">
        <div>
          <div className="font-semibold">{t('breeding.completed.title', { defaultValue: 'Completed pairing ({{count}})', count: closed.length })}</div>
          <div className="text-xs text-neutral-500">{t('breeding.completed.subtitle', { defaultValue: 'Finished cycles, filed under the season they started in. Reopening one sends it back to Active pairing in that same season.' })}</div>
        </div>
        {seasons.length ? (
          <div {...help('completed-filter-season')} className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t('breeding.completed.seasonFilter', { defaultValue: 'Season' })}>
            <Chip active={season === 'all'} onClick={() => setSeasonFilter('all')}>{t('breeding.completed.allSeasons', { defaultValue: 'All seasons' })}</Chip>
            {seasons.map((label) => <Chip key={label || 'none'} active={season === label} onClick={() => setSeasonFilter(label)}>{label || '?'}</Chip>)}
          </div>
        ) : null}
        <div {...help('completed-filter-outcome')} className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t('breeding.completed.outcomeFilter', { defaultValue: 'Outcome' })}>
          <Chip active={outcomeFilter === 'all'} onClick={() => setOutcomeFilter('all')}>{t('breeding.completed.allOutcomes', { defaultValue: 'All outcomes' })}</Chip>
          {outcomeLabels.map(([key, label]) => <Chip key={key} active={outcomeFilter === key} onClick={() => setOutcomeFilter(key)}>{label}</Chip>)}
        </div>
      </div>
      {groups.length ? groups.map((group) => {
        const summary = summaryByLabel.get(group.label);
        return (
          <section key={group.label || 'none'} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-1">
              <h3 className="text-sm font-semibold">{t('breeding.season.heading', { defaultValue: 'Season {{season}}', season: group.label || '?' })}</h3>
              <span className="text-xs text-neutral-500">
                {summary?.ended
                  ? t('breeding.season.endedOn', { defaultValue: 'ended {{date}}', date: formatDate(summary.endedOn) || '?' })
                  : summary?.isCurrent
                    ? t('breeding.season.currentTag', { defaultValue: 'current season' })
                    : t('breeding.season.stillOpen', { defaultValue: 'still running: {{count}} open', count: summary?.open || 0 })}
                {' · '}{t('breeding.season.closedCount', { defaultValue: '{{count}} completed', count: group.cycles.length })}
              </span>
            </div>
            {group.cycles.map((cycle) => (
              <BreedingCard
                key={cycle.id}
                cycle={cycle}
                cycles={cycles}
                exams={exams}
                settings={settings}
                snakesById={snakesById}
                geneticsTokensFor={geneticsTokensFor}
                males={males}
                actions={actions}
                openDialog={openDialog}
                onOpenSnake={onOpenSnake}
                onOpenCycle={onFocusCycle}
                onCreateHatchlings={onCreateHatchlings}
                isFocused={focusedCycleId === cycle.id}
                showAppAlert={showAppAlert}
                locationFor={locationFor}
              />
            ))}
          </section>
        );
      }) : (
        <div className="mt-card border p-4 text-sm text-neutral-500">{closed.length ? t('breeding.completed.noMatch', { defaultValue: 'No completed pairing matches these filters.' }) : t('breeding.completed.empty', { defaultValue: 'No completed pairing yet. A cycle lands here once its hatchlings are registered, or when you close it.' })}</div>
      )}
    </div>
  );
}
