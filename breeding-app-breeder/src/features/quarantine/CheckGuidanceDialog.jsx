import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { CHECK_GUIDANCE, getGuidance } from './checkGuidance';
import CheckDiagram from './CheckDiagrams';
import SnakeCheckMap from './SnakeCheckMap';
import { DISCLAIMER_LINE, translateTuple } from './labels';

// Opened from the "?" next to any observation field. Shows where to look on the body, what normal
// and abnormal look like side by side, and the actual technique — then lets the breeder step
// through the other checks without closing, because in practice they are done in one pass.

export default function CheckGuidanceDialog({ checkKey, onClose }) {
  const { t } = useTranslation();
  const [activeKey, setActiveKey] = useState(checkKey);
  const guidance = getGuidance(activeKey);

  if (typeof document === 'undefined' || !guidance) return null;

  const index = CHECK_GUIDANCE.findIndex(entry => entry.key === activeKey);
  const previous = CHECK_GUIDANCE[index - 1];
  const next = CHECK_GUIDANCE[index + 1];

  return createPortal((
    <div
      className="fixed inset-0 z-[10060] flex items-end sm:items-center justify-center bg-neutral-900/50 backdrop-blur-sm p-0 sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl border max-h-[92vh] overflow-y-auto"
        onClick={event => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={guidance.title}
      >
        <div className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b px-4 py-3 flex items-center justify-between gap-2 rounded-t-2xl">
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">{guidance.title}</div>
            <div className="text-[11px] text-neutral-500">
              {t('quarantine.guide.subtitle', { defaultValue: 'How to check, and what you are looking for' })}
            </div>
          </div>
          <button type="button" className="rounded-xl border px-3 py-1.5 text-xs" onClick={onClose}>
            {t('common.close', { defaultValue: 'Close' })}
          </button>
        </div>

        <div className="p-4 flex flex-col gap-4">
          <div className="rounded-xl border bg-neutral-50 p-2">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
              {t('quarantine.guide.whereToLook', { defaultValue: 'Where to look' })}
            </div>
            <SnakeCheckMap selectedKey={activeKey} onSelect={setActiveKey} compact />
            {!guidance.point ? (
              <p className="mt-1 text-[11px] text-neutral-500">
                {t('quarantine.guide.notOnBody', { defaultValue: 'Checked in the enclosure rather than on the animal.' })}
              </p>
            ) : null}
          </div>

          <CheckDiagram
            checkKey={activeKey}
            normalLabel={t('quarantine.guide.normal', { defaultValue: 'Normal' })}
            concerningLabel={t('quarantine.guide.concerning', { defaultValue: 'Worth acting on' })}
          />

          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 mb-1">
              {t('quarantine.guide.lookFor', { defaultValue: 'What you want to see' })}
            </div>
            <p className="text-xs text-neutral-700">{guidance.lookFor}</p>
          </div>

          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 mb-1">
              {t('quarantine.guide.howTo', { defaultValue: 'How to check' })}
            </div>
            <ol className="list-decimal pl-4 flex flex-col gap-1 text-xs text-neutral-700">
              {guidance.howTo.map((step, position) => <li key={position}>{step}</li>)}
            </ol>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-2.5">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700 mb-0.5">
                {t('quarantine.guide.normal', { defaultValue: 'Normal' })}
              </div>
              <p className="text-[11px] text-emerald-900">{guidance.normal}</p>
            </div>
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-2.5">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-rose-700 mb-0.5">
                {t('quarantine.guide.concerning', { defaultValue: 'Worth acting on' })}
              </div>
              <p className="text-[11px] text-rose-900">{guidance.concerning}</p>
            </div>
          </div>

          {guidance.note ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-[11px] text-amber-900">
              {guidance.note}
            </p>
          ) : null}

          <p className="text-[10px] text-neutral-400">
            {t('quarantine.guide.schematic', { defaultValue: 'Drawings are schematic, not photographs.' })}{' '}
            {translateTuple(t, DISCLAIMER_LINE)}
          </p>
        </div>

        <div className="sticky bottom-0 bg-white/95 backdrop-blur border-t px-4 py-3 flex items-center justify-between gap-2">
          <button
            type="button"
            className="rounded-xl border px-3 py-1.5 text-xs disabled:opacity-40"
            disabled={!previous}
            onClick={() => previous && setActiveKey(previous.key)}
          >
            ← {previous ? previous.title : t('quarantine.guide.first', { defaultValue: 'First' })}
          </button>
          <button
            type="button"
            className="rounded-xl border px-3 py-1.5 text-xs disabled:opacity-40"
            disabled={!next}
            onClick={() => next && setActiveKey(next.key)}
          >
            {next ? next.title : t('quarantine.guide.last', { defaultValue: 'Last' })} →
          </button>
        </div>
      </div>
    </div>
  ), document.body);
}

/** The "?" itself. Small, quiet, and next to every field that asks the breeder to judge something. */
export function GuidanceButton({ checkKey, onOpen, className = '' }) {
  const { t } = useTranslation();
  if (!getGuidance(checkKey)) return null;
  return (
    <button
      type="button"
      className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-neutral-300 text-[10px] font-bold leading-none text-neutral-500 hover:border-sky-400 hover:bg-sky-50 hover:text-sky-600 ${className}`}
      aria-label={t('quarantine.guide.open', { defaultValue: 'How do I check this?' })}
      title={t('quarantine.guide.open', { defaultValue: 'How do I check this?' })}
      onClick={event => { event.preventDefault(); event.stopPropagation(); onOpen?.(checkKey); }}
    >
      ?
    </button>
  );
}
