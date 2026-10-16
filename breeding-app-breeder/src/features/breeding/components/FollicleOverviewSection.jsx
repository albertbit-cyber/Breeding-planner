/**
 * Breeding → Follicle tracking: one row per female with an open card (plus females with
 * examinations but no card). Search, filters and sort by rack, stage, male and next check.
 * Old measurements show their age so nobody reads them as today's size.
 */
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { deriveStage, countObservedLocks, countSessions, CYCLE_STATUS } from '../domain/cycleModel';
import { examsForCycle, examsForFemale, latestMeasurement, latestChange, latestExam } from '../domain/follicles';
import { dueFollowUps } from '../domain/followUps';
import { evaluateReview } from '../domain/reviewRules';
import { compareYmd, diffDays, todayYmd } from '../domain/dates';
import { BreedingSettingsPanel } from './BreedingSettingsPanel';
import { animalName, formatDate, formatMm, DASH, STATUS_CLASS } from './format';
import { stageLabel, statusLabel, methodLabel, resultLabel } from './labels';

const smallBtn = 'text-xs px-2.5 py-1.5 border rounded-lg bg-white hover:bg-neutral-50';

export function buildOverviewRows({ cycles, exams, females, snakesById, settings, locationFor, today }) {
  const rows = [];
  const covered = new Set();
  cycles.filter((c) => c && !c.deletedAt && c.status !== CYCLE_STATUS.CLOSED).forEach((cycle) => {
    covered.add(cycle.femaleId);
    const cycleExams = examsForCycle(exams, cycle);
    const latest = latestMeasurement(cycleExams) || latestMeasurement(cycleExams, { method: 'palpation' });
    const change = latestChange(cycleExams);
    const last = latestExam(cycleExams);
    const review = evaluateReview(cycle, cycleExams, settings, { today });
    const due = dueFollowUps(cycle, cycleExams, { today });
    const latestIntro = cycle.sessions.map((s) => s.introductionDate).filter(Boolean).sort().pop() || null;
    const latestLock = cycle.sessions.flatMap((s) => s.locks).filter((l) => l.status === 'observed' && l.observationDate).map((l) => l.observationDate).sort().pop() || null;
    rows.push({
      key: cycle.id,
      cycle,
      femaleId: cycle.femaleId,
      female: snakesById.get(cycle.femaleId) || null,
      location: locationFor?.(cycle.femaleId) || '',
      seasonLabel: cycle.seasonLabel,
      stage: deriveStage(cycle),
      status: cycle.status,
      latest,
      latestAgeDays: latest ? diffDays(latest.date, today) : null,
      change,
      lastExam: last,
      maleIds: cycle.males.map((m) => m.maleId),
      sessionCount: countSessions(cycle),
      lockCount: countObservedLocks(cycle),
      latestIntro,
      latestLock,
      next: due[0] || null,
      reviewFlags: review.flags,
    });
  });
  females.forEach((female) => {
    if (covered.has(female.id)) return;
    const femaleExams = examsForFemale(exams, female.id);
    if (!femaleExams.length) return;
    const latest = latestMeasurement(femaleExams) || latestMeasurement(femaleExams, { method: 'palpation' });
    const last = latestExam(femaleExams);
    rows.push({
      key: `female-${female.id}`,
      cycle: null,
      femaleId: female.id,
      female,
      location: locationFor?.(female.id) || '',
      seasonLabel: '',
      stage: 'pre_pairing',
      status: null,
      latest,
      latestAgeDays: latest ? diffDays(latest.date, today) : null,
      change: latestChange(femaleExams),
      lastExam: last,
      maleIds: [],
      sessionCount: 0,
      lockCount: 0,
      latestIntro: null,
      latestLock: null,
      next: last?.nextReviewDate ? { kind: 'scan_review', date: last.nextReviewDate, overdue: compareYmd(last.nextReviewDate, today) < 0 } : null,
      reviewFlags: [],
    });
  });
  return rows;
}

export function FollicleOverviewSection({ cycles = [], exams = [], females = [], males = [], snakesById, settings, onSettingsChange, locationFor, geneticsTokensFor, openDialog, onOpenCycle, onOpenSnake, speciesOptions = [], searchQuery = '' }) {
  const { t } = useTranslation();
  const today = todayYmd();
  const [stageFilter, setStageFilter] = useState('all');
  const [maleFilter, setMaleFilter] = useState('all');
  const [sortKey, setSortKey] = useState('next');
  const [sortDir, setSortDir] = useState('asc');

  const rows = useMemo(() => buildOverviewRows({ cycles, exams, females, snakesById, settings, locationFor, today }), [cycles, exams, females, snakesById, settings, locationFor, today]);
  const stages = useMemo(() => Array.from(new Set(rows.map((r) => r.stage))), [rows]);
  const maleOptions = useMemo(() => Array.from(new Set(rows.flatMap((r) => r.maleIds))), [rows]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = rows.filter((row) => {
      if (stageFilter !== 'all' && row.stage !== stageFilter) return false;
      if (maleFilter !== 'all' && !row.maleIds.includes(maleFilter)) return false;
      if (q) {
        const hay = [animalName(row.female, row.femaleId), row.femaleId, row.location, row.seasonLabel, ...row.maleIds.map((id) => animalName(snakesById.get(id), id))].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const dir = sortDir === 'asc' ? 1 : -1;
    const cmp = {
      rack: (a, b) => String(a.location).localeCompare(String(b.location)) || animalName(a.female, a.femaleId).localeCompare(animalName(b.female, b.femaleId)),
      stage: (a, b) => a.stage.localeCompare(b.stage),
      male: (a, b) => animalName(snakesById.get(a.maleIds[0]), a.maleIds[0] || '').localeCompare(animalName(snakesById.get(b.maleIds[0]), b.maleIds[0] || '')),
      next: (a, b) => compareYmd(a.next?.date, b.next?.date),
      female: (a, b) => animalName(a.female, a.femaleId).localeCompare(animalName(b.female, b.femaleId)),
      latest: (a, b) => compareYmd(a.latest?.date, b.latest?.date),
    }[sortKey] || (() => 0);
    return list.sort((a, b) => cmp(a, b) * dir);
  }, [rows, stageFilter, maleFilter, searchQuery, sortKey, sortDir, snakesById]);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };
  const header = (key, label) => (
    <th className="text-start py-1.5 pe-2 whitespace-nowrap">
      <button type="button" className="bg-transparent border-0 p-0 font-semibold uppercase tracking-wide text-[10px] text-neutral-500 underline-offset-2 hover:underline" onClick={() => toggleSort(key)} aria-sort={sortKey === key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
        {label}{sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
      </button>
    </th>
  );

  const batchFemaleIds = filtered.map((r) => r.femaleId);

  return (
    <div className="flex flex-col gap-3">
      <div className="mt-card border p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="font-semibold">{t('breeding.overview.title', { defaultValue: 'Follicle tracking and breeding overview' })}</div>
            <div className="text-xs text-neutral-500">{t('breeding.overview.subtitle', { defaultValue: '{{count}} open cards and scanned females. Measurements show their age; an old value is not today\'s size.', count: rows.length })}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="appearance-btn appearance-btn--filled text-xs px-3 py-1.5 rounded-lg" disabled={!batchFemaleIds.length} onClick={() => openDialog({ kind: 'exam', femaleId: batchFemaleIds[0], batchFemaleIds })}>{t('breeding.overview.batchScan', { defaultValue: 'Scan walk: save and next female' })}</button>
            <button type="button" className={smallBtn} disabled={!batchFemaleIds.length} onClick={() => openDialog({ kind: 'pairing', femaleId: batchFemaleIds[0], batchFemaleIds })}>{t('breeding.overview.batchPairing', { defaultValue: 'Pairing walk: save and next female' })}</button>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          <select className="border rounded-lg px-2 py-1 bg-white" value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} aria-label={t('breeding.overview.filterStage', { defaultValue: 'Filter by stage' })}>
            <option value="all">{t('breeding.overview.allStages', { defaultValue: 'All stages' })}</option>
            {stages.map((s) => <option key={s} value={s}>{stageLabel(t, s)}</option>)}
          </select>
          <select className="border rounded-lg px-2 py-1 bg-white" value={maleFilter} onChange={(e) => setMaleFilter(e.target.value)} aria-label={t('breeding.overview.filterMale', { defaultValue: 'Filter by male' })}>
            <option value="all">{t('breeding.overview.allMales', { defaultValue: 'All males' })}</option>
            {maleOptions.map((id) => <option key={id} value={id}>{animalName(snakesById.get(id), id)}</option>)}
          </select>
        </div>
        <div className="mt-2 overflow-x-auto">
          {filtered.length ? (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-wide text-neutral-500">
                  {header('female', t('breeding.field.female', { defaultValue: 'Female' }))}
                  {header('rack', t('breeding.overview.rack', { defaultValue: 'Rack / location' }))}
                  <th className="text-start py-1.5 pe-2">{t('breeding.overview.season', { defaultValue: 'Season' })}</th>
                  {header('stage', t('breeding.overview.stage', { defaultValue: 'Stage / state' }))}
                  {header('latest', t('breeding.overview.latestFollicle', { defaultValue: 'Latest follicle' }))}
                  <th className="text-start py-1.5 pe-2">{t('breeding.overview.change', { defaultValue: 'Comparable change' })}</th>
                  <th className="text-start py-1.5 pe-2">{t('breeding.overview.lastExam', { defaultValue: 'Last exam' })}</th>
                  {header('male', t('breeding.overview.males', { defaultValue: 'Candidate male(s)' }))}
                  <th className="text-start py-1.5 pe-2">{t('breeding.overview.sessionsLocks', { defaultValue: 'Sessions / locks' })}</th>
                  <th className="text-start py-1.5 pe-2">{t('breeding.overview.latestDates', { defaultValue: 'Latest intro / lock' })}</th>
                  {header('next', t('breeding.overview.next', { defaultValue: 'Next planned' }))}
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.key} className="border-t align-top">
                    <td className="py-1.5 pe-2">
                      {onOpenSnake && row.female ? <button type="button" className="font-semibold hover:underline text-start" style={{ color: 'var(--sk-primary, #0284c7)' }} onClick={() => onOpenSnake(row.female)}>{animalName(row.female, row.femaleId)}</button> : <span className="font-semibold">{animalName(row.female, row.femaleId)}</span>}
                      <div className="font-mono text-[10px] text-neutral-500"><bdi>{row.femaleId}</bdi></div>
                    </td>
                    <td className="py-1.5 pe-2">{row.location || DASH}</td>
                    <td className="py-1.5 pe-2">{row.seasonLabel || DASH}</td>
                    <td className="py-1.5 pe-2">
                      <div>{stageLabel(t, row.stage)}</div>
                      {row.status ? <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_CLASS[row.status]}`}>{statusLabel(t, row.status)}</span> : <span className="text-[10px] text-neutral-500">{t('breeding.overview.noCard', { defaultValue: 'No card yet' })}</span>}
                      {row.reviewFlags.length ? <div className="text-[10px] text-sky-800">{t('breeding.card.needsReview', { defaultValue: 'Needs review' })}</div> : null}
                    </td>
                    <td className="py-1.5 pe-2 whitespace-nowrap">
                      {row.latest ? (
                        <>
                          <div className="font-semibold">{formatMm(row.latest.valueMm, { estimate: row.latest.isEstimate })}</div>
                          <div className="text-[10px] text-neutral-500">{formatDate(row.latest.date)}{row.latestAgeDays > 0 ? ` · ${t('breeding.card.daysAgo', { defaultValue: '{{days}} d ago', days: row.latestAgeDays })}` : ''}</div>
                        </>
                      ) : DASH}
                    </td>
                    <td className="py-1.5 pe-2 whitespace-nowrap">{row.change?.comparable ? `${row.change.deltaMm > 0 ? '+' : ''}${row.change.deltaMm} mm / ${row.change.days} d` : DASH}</td>
                    <td className="py-1.5 pe-2 whitespace-nowrap">{row.lastExam ? `${formatDate(row.lastExam.date)} · ${methodLabel(t, row.lastExam.method)} · ${resultLabel(t, row.lastExam.result)}` : DASH}</td>
                    <td className="py-1.5 pe-2">{row.maleIds.length ? row.maleIds.map((id) => animalName(snakesById.get(id), id)).join(', ') : DASH}</td>
                    <td className="py-1.5 pe-2 whitespace-nowrap">{row.cycle ? `${row.sessionCount} / ${row.lockCount}` : DASH}</td>
                    <td className="py-1.5 pe-2 whitespace-nowrap">{row.latestIntro ? formatDate(row.latestIntro) : DASH} / {row.latestLock ? formatDate(row.latestLock) : DASH}</td>
                    <td className="py-1.5 pe-2 whitespace-nowrap">
                      {row.next ? <span className={row.next.overdue ? 'text-amber-700' : ''}>{formatDate(row.next.date)} · {row.next.kind === 'planned_pairing' ? t('breeding.overview.plannedPairing', { defaultValue: 'pairing' }) : t('breeding.overview.scanReview', { defaultValue: 'scan / review' })}{row.next.overdue ? ` (${t('breeding.planned.overdue', { defaultValue: 'overdue' })})` : ''}</span> : DASH}
                    </td>
                    <td className="py-1.5 whitespace-nowrap">
                      <div className="flex flex-col gap-1">
                        {row.cycle ? <button type="button" className={smallBtn} onClick={() => onOpenCycle(row.cycle.id)}>{t('breeding.overview.openCard', { defaultValue: 'Open card' })}</button> : <button type="button" className={smallBtn} onClick={() => openDialog({ kind: 'pairing', femaleId: row.femaleId })}>{t('breeding.overview.startCard', { defaultValue: 'Record first pairing' })}</button>}
                        <button type="button" className={smallBtn} onClick={() => openDialog({ kind: 'exam', femaleId: row.femaleId })}>{t('breeding.action.exam', { defaultValue: '+ Follicle exam' })}</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="text-sm text-neutral-500 py-4">{rows.length ? t('breeding.overview.noMatch', { defaultValue: 'No rows match the current filters.' }) : t('breeding.overview.empty', { defaultValue: 'No open breeding cards or follicle examinations yet. Record a scan or a first pairing to start.' })}</div>
          )}
        </div>
      </div>
      <BreedingSettingsPanel settings={settings} onChange={onSettingsChange} speciesOptions={speciesOptions} females={females} />
    </div>
  );
}
