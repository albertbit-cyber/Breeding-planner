/**
 * Follicle graph: examination dates on X, millimetres on Y, every actual point drawn. The default
 * series is the largest measured ultrasound diameter; palpation estimates are a separate dashed
 * series with square markers; exams without a number (not visualized, inconclusive, external,
 * post-ovulation) sit as labelled markers along the baseline. Shape and text carry identity,
 * colour is secondary. A table renders the same data for screen readers and small screens.
 */
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { buildFollicleSeries, relativeDay } from '../domain/follicles';
import { diffDays, compareYmd } from '../domain/dates';
import { formatDate, formatMm, DASH } from './format';
import { methodLabel, resultLabel } from './labels';
import { help } from '../../help/help';

const WIDTH = 640;
const HEIGHT = 240;
const PAD = { top: 16, right: 16, bottom: 44, left: 44 };

export function FollicleChart({ exams = [], cycle = null, overlays = [], onSelectExam = null, title = null }) {
  const { t } = useTranslation();
  const [view, setView] = useState('chart');
  const [showOverlays, setShowOverlays] = useState(false);
  const series = useMemo(() => buildFollicleSeries(exams), [exams]);
  const relative = !!cycle?.startDate;

  const points = useMemo(() => {
    const all = [...series.ultrasound.map((p) => ({ ...p, method: 'ultrasound' })), ...series.palpation.map((p) => ({ ...p, method: 'palpation' }))];
    const nonNumeric = series.nonNumeric;
    const xOf = (date) => (relative ? diffDays(cycle.startDate, date) : null);
    return { all, nonNumeric, xOf };
  }, [series, relative, cycle]);

  const overlaySeries = useMemo(() => (showOverlays && relative ? overlays.map((o) => ({
    label: o.label,
    points: buildFollicleSeries(o.exams).ultrasound.filter(() => o.cycle?.startDate).map((p) => ({ x: diffDays(o.cycle.startDate, p.date), y: p.valueMm })),
  })).filter((o) => o.points.length) : []), [overlays, showOverlays, relative]);

  const allDates = [...points.all.map((p) => p.date), ...points.nonNumeric.map((p) => p.date)].sort(compareYmd);
  const hasAny = allDates.length > 0;
  let xMin;
  let xMax;
  if (relative) {
    const xs = [...points.all.map((p) => points.xOf(p.date)), ...points.nonNumeric.map((p) => points.xOf(p.date)), ...overlaySeries.flatMap((o) => o.points.map((p) => p.x)), 0];
    xMin = Math.min(...xs);
    xMax = Math.max(...xs);
  } else if (hasAny) {
    xMin = 0;
    xMax = Math.max(1, diffDays(allDates[0], allDates[allDates.length - 1]));
  }
  if (xMin === xMax) { xMin -= 7; xMax += 7; }
  const ys = [...points.all.map((p) => p.valueMm), ...overlaySeries.flatMap((o) => o.points.map((p) => p.y))];
  const yMax = Math.max(10, Math.ceil((Math.max(0, ...ys) + 2) / 5) * 5);
  const plotW = WIDTH - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const xScale = (x) => PAD.left + ((x - xMin) / (xMax - xMin || 1)) * plotW;
  const yScale = (y) => PAD.top + plotH - (y / yMax) * plotH;
  const xOfPoint = (p) => (relative ? points.xOf(p.date) : diffDays(allDates[0], p.date));

  const path = (list) => list.map((p, i) => `${i === 0 ? 'M' : 'L'}${xScale(xOfPoint(p)).toFixed(1)},${yScale(p.valueMm).toFixed(1)}`).join(' ');
  const yTicks = Array.from({ length: Math.floor(yMax / 5) + 1 }, (_, i) => i * 5);
  const xTicks = (() => {
    const span = xMax - xMin;
    const step = span <= 30 ? 7 : span <= 120 ? 14 : span <= 365 ? 30 : 90;
    const ticks = [];
    const start = Math.ceil(xMin / step) * step;
    for (let x = start; x <= xMax; x += step) ticks.push(x);
    return ticks;
  })();

  const tableRows = useMemo(() => [...exams].filter((e) => e && !e.deletedAt).sort((a, b) => compareYmd(a.date, b.date)), [exams]);

  if (!hasAny) {
    return (
      <div className="rounded-xl border bg-white p-3 text-xs text-neutral-500">
        {t('breeding.chart.empty', { defaultValue: 'No follicle examinations yet. The first scan appears here with its date and measurement.' })}
      </div>
    );
  }


  return (
    <div className="rounded-xl border bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">{title || t('breeding.chart.title', { defaultValue: 'Follicle measurements' })}</div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {relative && overlays.length ? (
            <label {...help('card-chart-overlay')} className="inline-flex items-center gap-1">
              <input type="checkbox" checked={showOverlays} onChange={(e) => setShowOverlays(e.target.checked)} />
              {t('breeding.chart.overlay', { defaultValue: 'Overlay previous cycles (day 0 = first pairing)' })}
            </label>
          ) : null}
          <div role="tablist" className="inline-flex rounded-lg border overflow-hidden">
            <button {...help('card-chart-view')} type="button" role="tab" aria-selected={view === 'chart'} className={`px-2 py-1 ${view === 'chart' ? 'appearance-tab--active' : ''}`} onClick={() => setView('chart')}>{t('breeding.chart.chartView', { defaultValue: 'Chart' })}</button>
            <button {...help('card-chart-view')} type="button" role="tab" aria-selected={view === 'table'} className={`px-2 py-1 ${view === 'table' ? 'appearance-tab--active' : ''}`} onClick={() => setView('table')}>{t('breeding.chart.tableView', { defaultValue: 'Table' })}</button>
          </div>
        </div>
      </div>
      {view === 'chart' ? (
        <>
          <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full h-auto" role="img" aria-label={t('breeding.chart.ariaLabel', { defaultValue: 'Follicle diameter in millimetres over time. Use the table view for exact values.' })}>
            {yTicks.map((y) => (
              <g key={y}>
                <line x1={PAD.left} x2={WIDTH - PAD.right} y1={yScale(y)} y2={yScale(y)} stroke="var(--sk-border, #e5e7eb)" strokeWidth="1" />
                <text x={PAD.left - 6} y={yScale(y) + 3} fontSize="10" textAnchor="end" fill="var(--sk-text-muted, #6b7280)">{y}</text>
              </g>
            ))}
            {xTicks.map((x) => (
              <g key={x}>
                <line x1={xScale(x)} x2={xScale(x)} y1={PAD.top} y2={HEIGHT - PAD.bottom} stroke="var(--sk-border, #e5e7eb)" strokeDasharray="2 3" />
                <text x={xScale(x)} y={HEIGHT - PAD.bottom + 14} fontSize="10" textAnchor="middle" fill="var(--sk-text-muted, #6b7280)">{relative ? `${x >= 0 ? '+' : ''}${x}d` : x}</text>
              </g>
            ))}
            {relative ? <line x1={xScale(0)} x2={xScale(0)} y1={PAD.top} y2={HEIGHT - PAD.bottom} stroke="var(--sk-text-muted, #6b7280)" strokeWidth="1.5" /> : null}
            <text x={PAD.left} y={HEIGHT - 6} fontSize="10" fill="var(--sk-text-muted, #6b7280)">{relative ? t('breeding.chart.xRelative', { defaultValue: 'Days from first actual pairing (negative = before pairing)' }) : t('breeding.chart.xAbsolute', { defaultValue: 'Days from first examination' })}</text>
            <text x={PAD.left - 6} y={PAD.top - 5} fontSize="10" textAnchor="end" fill="var(--sk-text-muted, #6b7280)">mm</text>
            {overlaySeries.map((o, i) => (
              <g key={o.label} opacity="0.55">
                <path d={o.points.map((p, j) => `${j === 0 ? 'M' : 'L'}${xScale(p.x).toFixed(1)},${yScale(p.y).toFixed(1)}`).join(' ')} fill="none" stroke={`var(--sk-series-${(i % 4) + 3}, #94a3b8)`} strokeWidth="1.5" strokeDasharray="4 3" />
                {o.points.map((p, j) => <circle key={j} cx={xScale(p.x)} cy={yScale(p.y)} r="2.5" fill={`var(--sk-series-${(i % 4) + 3}, #94a3b8)`} />)}
              </g>
            ))}
            {series.palpation.length ? <path d={path(series.palpation)} fill="none" stroke="var(--sk-series-2, #d97706)" strokeWidth="1.5" strokeDasharray="5 4" /> : null}
            {series.ultrasound.length ? <path d={path(series.ultrasound)} fill="none" stroke="var(--sk-series-1, #0ea5e9)" strokeWidth="2" /> : null}
            {series.ultrasound.map((p) => (
              <g key={p.examId} tabIndex={onSelectExam ? 0 : -1} role={onSelectExam ? 'button' : undefined} onClick={() => onSelectExam?.(p.examId)} onKeyDown={(e) => { if (onSelectExam && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onSelectExam(p.examId); } }} className={onSelectExam ? 'cursor-pointer' : ''}>
                <title>{`${formatDate(p.date)} · ${formatMm(p.valueMm)} · ${methodLabel(t, 'ultrasound')}`}</title>
                <circle cx={xScale(xOfPoint(p))} cy={yScale(p.valueMm)} r="5" fill="var(--sk-series-1, #0ea5e9)" stroke="var(--sk-surface, #fff)" strokeWidth="1.5" />
                <text x={xScale(xOfPoint(p))} y={yScale(p.valueMm) - 8} fontSize="10" textAnchor="middle" fill="var(--sk-text, #111827)">{p.valueMm}</text>
              </g>
            ))}
            {series.palpation.map((p) => (
              <g key={p.examId} tabIndex={onSelectExam ? 0 : -1} role={onSelectExam ? 'button' : undefined} onClick={() => onSelectExam?.(p.examId)} className={onSelectExam ? 'cursor-pointer' : ''}>
                <title>{`${formatDate(p.date)} · ${formatMm(p.valueMm, { estimate: true })} · ${methodLabel(t, 'palpation')}`}</title>
                <rect x={xScale(xOfPoint(p)) - 4.5} y={yScale(p.valueMm) - 4.5} width="9" height="9" fill="var(--sk-surface, #fff)" stroke="var(--sk-series-2, #d97706)" strokeWidth="2" />
                <text x={xScale(xOfPoint(p))} y={yScale(p.valueMm) - 8} fontSize="10" textAnchor="middle" fill="var(--sk-text, #111827)">~{p.valueMm}</text>
              </g>
            ))}
            {points.nonNumeric.map((p) => (
              <g key={p.examId} tabIndex={onSelectExam ? 0 : -1} role={onSelectExam ? 'button' : undefined} onClick={() => onSelectExam?.(p.examId)} className={onSelectExam ? 'cursor-pointer' : ''}>
                <title>{`${formatDate(p.date)} · ${resultLabel(t, p.result)} · ${methodLabel(t, p.method)}`}</title>
                <polygon points={`${xScale(xOfPoint(p))},${yScale(0) - 8} ${xScale(xOfPoint(p)) - 5},${yScale(0)} ${xScale(xOfPoint(p)) + 5},${yScale(0)}`} fill="var(--sk-text-muted, #6b7280)" />
              </g>
            ))}
          </svg>
          <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-neutral-600">
            <span className="inline-flex items-center gap-1"><span aria-hidden="true" className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: 'var(--sk-series-1, #0ea5e9)' }} />{t('breeding.chart.legendUltrasound', { defaultValue: 'Ultrasound, largest measured diameter' })}</span>
            <span className="inline-flex items-center gap-1"><span aria-hidden="true" className="inline-block w-2.5 h-2.5 border-2" style={{ borderColor: 'var(--sk-series-2, #d97706)' }} />{t('breeding.chart.legendPalpation', { defaultValue: 'Palpation estimate (~)' })}</span>
            <span className="inline-flex items-center gap-1"><span aria-hidden="true">▲</span>{t('breeding.chart.legendNonNumeric', { defaultValue: 'Exam without a measurement' })}</span>
          </div>
        </>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-start text-[10px] uppercase tracking-wide text-neutral-500">
                <th className="text-start py-1 pe-2">{t('breeding.table.date', { defaultValue: 'Date' })}</th>
                {relative ? <th className="text-start py-1 pe-2">{t('breeding.table.day', { defaultValue: 'Day' })}</th> : null}
                <th className="text-start py-1 pe-2">{t('breeding.table.method', { defaultValue: 'Method' })}</th>
                <th className="text-start py-1 pe-2">{t('breeding.table.result', { defaultValue: 'Result' })}</th>
                <th className="text-start py-1 pe-2">{t('breeding.table.largest', { defaultValue: 'Largest diameter' })}</th>
                <th className="text-start py-1 pe-2">{t('breeding.table.count', { defaultValue: 'Visible count' })}</th>
                <th className="text-start py-1">{t('breeding.table.notes', { defaultValue: 'Notes' })}</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((exam) => (
                <tr key={exam.id} className="border-t">
                  <td className="py-1 pe-2 whitespace-nowrap">{onSelectExam ? <button {...help('card-exam-edit')} type="button" className="underline" onClick={() => onSelectExam(exam.id)}>{formatDate(exam.date)}</button> : formatDate(exam.date)}</td>
                  {relative ? <td className="py-1 pe-2">{relativeDay(exam, cycle)}</td> : null}
                  <td className="py-1 pe-2">{methodLabel(t, exam.method)}</td>
                  <td className="py-1 pe-2">{resultLabel(t, exam.result)}</td>
                  <td className="py-1 pe-2">{exam.largestDiameterMm === null ? DASH : formatMm(exam.largestDiameterMm, { estimate: exam.largestIsEstimate })}</td>
                  <td className="py-1 pe-2">{exam.visibleCount === null ? DASH : `${exam.visibleCount}${exam.countCertainty === 'approximate' ? ' ~' : ''}`}</td>
                  <td className="py-1 text-neutral-600">{exam.notes || DASH}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
