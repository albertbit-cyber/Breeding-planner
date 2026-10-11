/** The Breeding cards list: open cards first, then closed ones behind a disclosure, plus the way to start a card. */
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CYCLE_STATUS, collectionFlags } from '../domain/cycleModel';
import { compareYmd } from '../domain/dates';
import { BreedingCard } from './BreedingCard';
import { animalName } from './format';
import { flagLabel } from './labels';

export function BreedingCardsSection({ cycles = [], exams = [], settings, snakesById, geneticsTokensFor, females = [], males = [], actions, openDialog, onOpenSnake, focusedCycleId = null, onFocusCycle, onCreateHatchlings, showAppAlert, locationFor, searchQuery = '', scopedFemaleIds = null }) {
  const { t } = useTranslation();
  const [showClosed, setShowClosed] = useState(false);
  const scoped = useMemo(() => cycles.filter((c) => c && !c.deletedAt && (!scopedFemaleIds || scopedFemaleIds.has(c.femaleId))), [cycles, scopedFemaleIds]);
  const q = searchQuery.trim().toLowerCase();
  const matches = (cycle) => {
    if (!q) return true;
    const names = [animalName(snakesById.get(cycle.femaleId), cycle.femaleId), cycle.femaleId, cycle.seasonLabel, ...cycle.males.map((m) => animalName(snakesById.get(m.maleId), m.maleId))];
    return names.join(' ').toLowerCase().includes(q);
  };
  const open = useMemo(() => scoped.filter((c) => c.status !== CYCLE_STATUS.CLOSED && matches(c)).sort((a, b) => compareYmd(b.startDate, a.startDate)), [scoped, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const closed = useMemo(() => scoped.filter((c) => c.status === CYCLE_STATUS.CLOSED && matches(c)).sort((a, b) => compareYmd(b.startDate, a.startDate)), [scoped, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const flags = useMemo(() => collectionFlags(scoped), [scoped]);
  const femalesWithoutCard = useMemo(() => females.filter((f) => !open.some((c) => c.femaleId === f.id)), [females, open]);

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
          <div>
            <div className="font-semibold">{t('breeding.cards.title', { defaultValue: 'Breeding cards ({{count}})', count: open.length })}</div>
            <div className="text-xs text-neutral-500">{t('breeding.cards.subtitle', { defaultValue: 'One card per female per cycle. The first actual pairing starts a card; a planned appointment does not.' })}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="appearance-btn appearance-btn--filled text-xs px-3 py-1.5 rounded-lg" onClick={() => openDialog({ kind: 'pairing', femaleId: null })}>{t('breeding.cards.recordPairing', { defaultValue: 'Record a pairing' })}</button>
            <button type="button" className="text-xs px-3 py-1.5 border rounded-lg bg-white" onClick={() => openDialog({ kind: 'exam', femaleId: null })}>{t('breeding.cards.recordScan', { defaultValue: 'Record a follicle exam' })}</button>
          </div>
        </div>
        {flags.length ? (
          <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {flags.map((flag) => <div key={`${flag.kind}-${flag.femaleId}`}>{flagLabel(t, flag.kind)}: {animalName(snakesById.get(flag.femaleId), flag.femaleId)}. {t('breeding.cards.multipleActiveHint', { defaultValue: 'Close or pause the one that should not be open; nothing is merged automatically.' })}</div>)}
          </div>
        ) : null}
        {femalesWithoutCard.length && !q ? (
          <div className="mt-2 text-xs text-neutral-600">
            {t('breeding.cards.withoutCard', { defaultValue: '{{count}} breeder female(s) without an open card.', count: femalesWithoutCard.length })}{' '}
            <span className="text-neutral-500">{t('breeding.cards.withoutCardHint', { defaultValue: 'Pre-pairing scans can be recorded for them now and will join the card once the first pairing is recorded.' })}</span>
          </div>
        ) : null}
      </div>
      {open.length ? open.map((cycle) => <BreedingCard key={cycle.id} {...cardProps(cycle)} />) : (
        <div className="mt-card border p-4 text-sm text-neutral-500">{q ? t('breeding.cards.noMatch', { defaultValue: 'No breeding cards match your search.' }) : t('breeding.cards.empty', { defaultValue: 'No open breeding cards. Record the first actual pairing of a female to create her card.' })}</div>
      )}
      {closed.length ? (
        <div className="mt-card border p-3">
          <button type="button" className="w-full flex items-center justify-between text-sm font-semibold" onClick={() => setShowClosed((v) => !v)} aria-expanded={showClosed}>
            <span>{t('breeding.cards.closedTitle', { defaultValue: 'Closed cards ({{count}})', count: closed.length })}</span>
            <span className="text-xs text-neutral-500">{showClosed ? t('common.hide', { defaultValue: 'Hide' }) : t('common.show', { defaultValue: 'Show' })}</span>
          </button>
          {showClosed ? <div className="mt-3 flex flex-col gap-3">{closed.map((cycle) => <BreedingCard key={cycle.id} {...cardProps(cycle)} />)}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
