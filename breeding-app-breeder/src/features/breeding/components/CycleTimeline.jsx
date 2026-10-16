/** The shared event timeline. Every row names its kind, its certainty and (where relevant) the male. */
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { buildTimeline } from '../domain/timeline';
import { animalName, formatDate, formatMm, CERTAINTY_CLASS } from './format';
import { timelineKindLabel, certaintyLabel, methodLabel, resultLabel, closureOutcomeLabel } from './labels';

export function CycleTimeline({ cycle, exams = [], snakesById, onSelectExam = null, onSelectEvent = null, onSelectSession = null, onSelectPlanned = null, limit = null }) {
  const { t } = useTranslation();
  const entries = useMemo(() => buildTimeline(cycle, exams), [cycle, exams]);
  const shown = limit ? entries.slice(-limit) : entries;
  if (!entries.length) {
    return <div className="text-xs text-neutral-500">{t('breeding.timeline.empty', { defaultValue: 'Nothing recorded yet.' })}</div>;
  }
  const open = (entry) => {
    if (entry.examId && onSelectExam) return () => onSelectExam(entry.examId);
    if (entry.eventId && onSelectEvent) return () => onSelectEvent(entry.eventId);
    if (entry.sessionId && onSelectSession) return () => onSelectSession(entry.sessionId);
    if (entry.plannedId && onSelectPlanned) return () => onSelectPlanned(entry.plannedId);
    return null;
  };
  return (
    <ol className="flex flex-col gap-1" aria-label={t('breeding.timeline.ariaLabel', { defaultValue: 'Breeding timeline' })}>
      {shown.map((entry) => {
        const handler = open(entry);
        const detail = [];
        if (entry.maleId) detail.push(animalName(snakesById?.get?.(entry.maleId), entry.maleId));
        if (entry.kind === 'follicle_exam') detail.push(`${methodLabel(t, entry.method)} · ${entry.valueMm !== null && entry.valueMm !== undefined ? formatMm(entry.valueMm, { estimate: entry.isEstimate }) : resultLabel(t, entry.result)}`);
        if (entry.kind === 'planned_pairing' && entry.status !== 'pending') detail.push(t(`breeding.planned.status.${entry.status}`, { defaultValue: entry.status }));
        if (entry.kind === 'closure') detail.push(closureOutcomeLabel(t, entry.outcome) + (entry.administrative ? ` · ${t('breeding.timeline.administrativeDate', { defaultValue: 'administrative date' })}` : ''));
        if (entry.relativeDay !== null && entry.relativeDay !== undefined && entry.relativeDay < 0) detail.push(t('breeding.timeline.beforePairing', { defaultValue: '{{days}} d before first pairing', days: Math.abs(entry.relativeDay) }));
        const row = (
          <>
            <span className="w-[82px] shrink-0 tabular-nums text-neutral-600">{formatDate(entry.date)}{entry.time ? ` ${entry.time}` : ''}</span>
            <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold shrink-0 ${CERTAINTY_CLASS[entry.certainty] || CERTAINTY_CLASS.recorded}`}>{certaintyLabel(t, entry.certainty)}</span>
            <span className="font-medium text-neutral-800">{timelineKindLabel(t, entry.kind)}</span>
            {detail.length ? <span className="text-neutral-600 truncate">{detail.join(' · ')}</span> : null}
            {entry.notes ? <span className="text-neutral-500 truncate hidden sm:inline">{entry.notes}</span> : null}
          </>
        );
        return (
          <li key={entry.id} className={`text-xs ${entry.status === 'cancelled' || entry.status === 'skipped' ? 'opacity-60 line-through' : ''}`}>
            {handler ? (
              <button type="button" className="w-full flex flex-wrap items-center gap-2 text-start rounded-lg px-2 py-1 hover:bg-neutral-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400" onClick={handler}>{row}</button>
            ) : (
              <div className="flex flex-wrap items-center gap-2 px-2 py-1">{row}</div>
            )}
          </li>
        );
      })}
      {limit && entries.length > limit ? <li className="text-[11px] text-neutral-500 px-2">{t('breeding.timeline.more', { defaultValue: '{{count}} earlier entries', count: entries.length - limit })}</li> : null}
    </ol>
  );
}
