/**
 * Active pairing: one open breeding card per female, grouped by season (newest first). A season
 * that is still finishing (eggs in the incubator, hatchlings to register) shows under its own
 * heading while the next season's pairings start above it.
 */
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { CYCLE_STATUS, collectionFlags } from '../domain/cycleModel';
import { compareYmd } from '../domain/dates';
import { seasonStartYear } from '../domain/season';
import { isIncubating } from '../domain/pairingView';
import { BreedingCard } from './BreedingCard';
import { animalName } from './format';
import { flagLabel } from './labels';

export function groupBySeason(cycles = []) {
  const groups = new Map();
  cycles.forEach((cycle) => {
    const label = cycle.seasonLabel || '';
    const list = groups.get(label) || [];
    list.push(cycle);
    groups.set(label, list);
  });
  return Array.from(groups.entries())
    .map(([label, list]) => ({ label, cycles: list.sort((a, b) => compareYmd(b.startDate, a.startDate)) }))
    .sort((a, b) => (seasonStartYear(b.label) ?? -Infinity) - (seasonStartYear(a.label) ?? -Infinity) || b.label.localeCompare(a.label));
}

export function cycleMatchesSearch(cycle, query, snakesById) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return true;
  const names = [animalName(snakesById?.get?.(cycle.femaleId), cycle.femaleId), cycle.femaleId, cycle.seasonLabel, ...cycle.males.map((m) => `${animalName(snakesById?.get?.(m.maleId), m.maleId)} ${m.maleId}`)];
  const haystack = names.join(' ').toLowerCase();
  return q.split(/\s+/).every((token) => haystack.includes(token));
}

export function BreedingCardsSection({ cycles = [], exams = [], settings, snakesById, geneticsTokensFor, females = [], males = [], actions, openDialog, onOpenSnake, focusedCycleId = null, onFocusCycle, onCreateHatchlings, showAppAlert, locationFor, searchQuery = '', scopedFemaleIds = null, currentSeason = '' }) {
  const { t } = useTranslation();
  const scoped = useMemo(() => cycles.filter((c) => c && !c.deletedAt && (!scopedFemaleIds || scopedFemaleIds.has(c.femaleId))), [cycles, scopedFemaleIds]);
  const q = searchQuery.trim();
  const open = useMemo(() => scoped.filter((c) => c.status !== CYCLE_STATUS.CLOSED && cycleMatchesSearch(c, q, snakesById)), [scoped, q, snakesById]);
  const groups = useMemo(() => groupBySeason(open), [open]);
  const flags = useMemo(() => collectionFlags(scoped), [scoped]);

  const cardProps = (cycle) => ({
    cycle,
    cycles,
    exams,
    settings,
    snakesById,
    geneticsTokensFor,
    males,
    actions,
    openDialog,
    onOpenSnake,
    onOpenCycle: onFocusCycle,
    onCreateHatchlings,
    isFocused: focusedCycleId === cycle.id,
    showAppAlert,
    locationFor,
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="mt-card border p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="font-semibold">{t('breeding.active.title', { defaultValue: 'Active pairing ({{count}})', count: open.length })}</div>
            <div className="text-xs text-neutral-500">{t('breeding.active.subtitle', { defaultValue: 'One breeding card per female for her whole cycle: pairings, locks, follicles, eggs and hatchlings. A card moves to Completed pairing once its hatchlings are registered.' })}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="appearance-btn appearance-btn--filled text-xs px-3 py-1.5 rounded-lg" onClick={() => openDialog({ kind: 'pairing', femaleId: null })}>{t('breeding.cards.recordPairing', { defaultValue: 'Record a pairing' })}</button>
            <button type="button" className="text-xs px-3 py-1.5 border rounded-lg bg-white" onClick={() => openDialog({ kind: 'exam', femaleId: null })} disabled={!open.length}>{t('breeding.cards.recordScan', { defaultValue: 'Record a follicle exam' })}</button>
          </div>
        </div>
        {flags.length ? (
          <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {flags.map((flag) => <div key={`${flag.kind}-${flag.femaleId}`}>{flagLabel(t, flag.kind)}: {animalName(snakesById.get(flag.femaleId), flag.femaleId)}. {t('breeding.cards.multipleActiveHint', { defaultValue: 'Close or pause the one that should not be open; nothing is merged automatically.' })}</div>)}
          </div>
        ) : null}
      </div>
      {groups.length ? groups.map((group) => {
        const incubating = group.cycles.filter(isIncubating).length;
        return (
          <section key={group.label || 'none'} className="flex flex-col gap-2" aria-label={t('breeding.season.heading', { defaultValue: 'Season {{season}}', season: group.label || '?' })}>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-1">
              <h3 className="text-sm font-semibold">{t('breeding.season.heading', { defaultValue: 'Season {{season}}', season: group.label || '?' })}</h3>
              <span className="text-xs text-neutral-500">
                {group.label === currentSeason ? t('breeding.season.currentTag', { defaultValue: 'current season' }) : t('breeding.season.finishingTag', { defaultValue: 'finishing' })}
                {' · '}{t('breeding.season.openCount', { defaultValue: '{{count}} open', count: group.cycles.length })}
                {incubating ? ` · ${t('breeding.season.incubatingCount', { defaultValue: 'in the incubator: {{count}}', count: incubating })}` : ''}
              </span>
            </div>
            {group.cycles.map((cycle) => <BreedingCard key={cycle.id} {...cardProps(cycle)} />)}
          </section>
        );
      }) : (
        <div className="mt-card border p-4 text-sm text-neutral-500">{q ? t('breeding.cards.noMatch', { defaultValue: 'No breeding cards match your search.' }) : t('breeding.active.empty', { defaultValue: 'No active pairing. Record the first pairing of a female to open her breeding card.' })}</div>
      )}
    </div>
  );
}
