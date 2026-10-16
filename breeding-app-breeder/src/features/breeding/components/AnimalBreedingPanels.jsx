/** Breeding summaries inside the animal editor: a female's open card and history, a male's participation. */
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { cyclesForFemale, deriveStage, countObservedLocks, countSessions, CYCLE_STATUS, maleHistory } from '../domain/cycleModel';
import { examsForFemale, latestMeasurement } from '../domain/follicles';
import { FemaleStatistics } from './PreviousCycles';
import { animalName, formatDate, formatMm, DASH, STATUS_CLASS } from './format';
import { stageLabel, statusLabel } from './labels';
import { help } from '../../help/help';

const smallBtn = 'text-xs px-2.5 py-1.5 border rounded-lg bg-white hover:bg-neutral-50';

export function FemaleBreedingPanel({ snake, cycles = [], exams = [], snakesById, onOpenCycle, openDialog }) {
  const { t } = useTranslation();
  const femaleCycles = useMemo(() => cyclesForFemale(cycles, snake?.id), [cycles, snake]);
  const active = femaleCycles.find((c) => c.status !== CYCLE_STATUS.CLOSED) || null;
  const femaleExams = useMemo(() => examsForFemale(exams, snake?.id), [exams, snake]);
  const latest = latestMeasurement(femaleExams) || latestMeasurement(femaleExams, { method: 'palpation' });
  return (
    <div className="p-3 border rounded-xl bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="font-medium text-sm">{t('breeding.animalPanel.femaleTitle', { defaultValue: 'Breeding card' })}</div>
        <div className="flex gap-2">
          {active ? <button {...help('overview-open-card')} type="button" className={smallBtn} onClick={() => onOpenCycle(active.id)}>{t('breeding.overview.openCard', { defaultValue: 'Open card' })}</button> : <button type="button" {...help('overview-open-card')} className={smallBtn} onClick={() => openDialog({ kind: 'pairing', femaleId: snake.id })}>{t('breeding.overview.startCard', { defaultValue: 'Record first pairing' })}</button>}
          <button {...help('card-add-exam')} type="button" className={smallBtn} onClick={() => openDialog({ kind: 'exam', femaleId: snake.id })}>{t('breeding.action.exam', { defaultValue: '+ Follicle exam' })}</button>
        </div>
      </div>
      {active ? (
        <div className="text-xs flex flex-wrap gap-x-4 gap-y-1">
          <span>{t('breeding.card.season', { defaultValue: 'Season {{season}}', season: active.seasonLabel })}</span>
          <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_CLASS[active.status]}`}>{statusLabel(t, active.status)}</span>
          <span>{stageLabel(t, deriveStage(active))}</span>
          <span>{t('breeding.card.sessionsCount', { defaultValue: '{{count}} sessions', count: countSessions(active) })}</span>
          <span>{t('breeding.card.locksCount', { defaultValue: '{{count}} observed locks', count: countObservedLocks(active) })}</span>
          <span>{t('breeding.card.males', { defaultValue: 'Males (candidate sires)' })}: {active.males.map((m) => animalName(snakesById.get(m.maleId), m.maleId)).join(', ') || DASH}</span>
        </div>
      ) : <div className="text-xs text-neutral-500">{t('breeding.animalPanel.noOpenCard', { defaultValue: 'No open breeding card.' })}</div>}
      <div className="mt-1 text-xs">{t('breeding.card.latestFollicle', { defaultValue: 'Latest follicle' })}: {latest ? `${formatMm(latest.valueMm, { estimate: latest.isEstimate })} (${formatDate(latest.date)})` : DASH}</div>
      <div className="mt-2"><FemaleStatistics cycles={femaleCycles} exams={exams} currentCycle={active} snakesById={snakesById} /></div>
    </div>
  );
}

export function MaleBreedingPanel({ snake, cycles = [], snakesById, onOpenCycle }) {
  const { t } = useTranslation();
  const participation = useMemo(() => (cycles || []).filter((c) => c && !c.deletedAt && c.males.some((m) => m.maleId === snake?.id)).map((c) => ({ cycle: c, history: maleHistory(c, snake.id) })), [cycles, snake]);
  return (
    <div className="p-3 border rounded-xl bg-white">
      <div className="font-medium text-sm mb-2">{t('breeding.animalPanel.maleTitle', { defaultValue: 'Breeding cards this male is on' })}</div>
      {participation.length ? (
        <ul className="space-y-1 text-xs">
          {participation.map(({ cycle, history }) => (
            <li key={cycle.id} className="flex flex-wrap items-center gap-2 rounded-lg border bg-neutral-50 px-2 py-1">
              <span className="font-semibold">{animalName(snakesById.get(cycle.femaleId), cycle.femaleId)}</span>
              <span>{cycle.seasonLabel}</span>
              <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_CLASS[cycle.status]}`}>{statusLabel(t, cycle.status)}</span>
              <span className="text-neutral-600">{t('breeding.history.maleCounts', { defaultValue: '{{sessions}} sessions, {{locks}} observed locks', sessions: history.sessionCount, locks: history.lockCount })}</span>
              <span className="text-neutral-600">{t('breeding.male.latestIntro', { defaultValue: 'Last introduced' })}: {history.latestIntroductionDate ? formatDate(history.latestIntroductionDate) : DASH}</span>
              {cycle.males.length > 1 ? <span className="text-neutral-500">{t('breeding.animalPanel.candidateOf', { defaultValue: 'one of {{count}} candidate sires', count: cycle.males.length })}</span> : null}
              <button {...help('overview-open-card')} type="button" className="ms-auto underline" onClick={() => onOpenCycle(cycle.id)}>{t('breeding.overview.openCard', { defaultValue: 'Open card' })}</button>
            </li>
          ))}
        </ul>
      ) : <div className="text-xs text-neutral-500">{t('breeding.animalPanel.maleNone', { defaultValue: 'Not on any breeding card yet.' })}</div>}
    </div>
  );
}
