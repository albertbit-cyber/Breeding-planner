import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { CHECK_FIELDS, getQuarantineDays, todayYmd } from '../../services/quarantine';
import { CHECK_FIELD_LABELS, CHECK_VALUE_LABELS, makeLabeller } from './labels';
import CheckGuidanceDialog, { GuidanceButton } from './CheckGuidanceDialog';

// The screen that decides whether any of this gets used. It is opened one-handed, on a phone, in a
// snake room, while the breeder is already holding something. So: every field preselected to the
// "nothing to report" answer, big targets, and a single save. A clean check must cost one tap.

export default function QuickCheckSheet({ snake, onSave, onClose }) {
  const { t } = useTranslation();
  const label = makeLabeller(t);
  const [draft, setDraft] = useState(() => ({
    date: todayYmd(),
    weightGrams: '',
    notes: '',
    ...Object.fromEntries(CHECK_FIELDS.map(field => [field.key, field.options[0]])),
  }));
  const [guidanceKey, setGuidanceKey] = useState(null);

  if (typeof document === 'undefined') return null;

  const day = getQuarantineDays(snake);
  const set = (patch) => setDraft(prev => ({ ...prev, ...patch }));

  return createPortal((
    <div
      className="fixed inset-0 z-[10050] flex items-end sm:items-center justify-center bg-neutral-900/45 backdrop-blur-sm p-0 sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl border max-h-[92vh] overflow-y-auto"
        onClick={event => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t('quarantine.logCheck', { defaultValue: 'Log check' })}
      >
        <div className="sticky top-0 bg-white/95 backdrop-blur border-b px-4 py-3 flex items-center justify-between rounded-t-2xl">
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">{snake?.name || snake?.id}</div>
            <div className="text-[11px] text-neutral-500">
              {day === null
                ? t('quarantine.noStartDate', { defaultValue: 'No start date' })
                : t('quarantine.dayCount', { count: day, defaultValue: 'Day {{count}}' })}
            </div>
          </div>
          <button type="button" className="rounded-xl border px-3 py-1.5 text-xs" onClick={onClose}>
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </button>
        </div>

        <div className="p-4 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="text-[11px] font-medium text-neutral-600">
              {t('quarantine.date', { defaultValue: 'Date' })}
              <input
                type="date"
                className="mt-1 w-full rounded-xl border px-2 py-2 text-sm"
                value={draft.date}
                onChange={event => set({ date: event.target.value })}
              />
            </label>
            <label className="text-[11px] font-medium text-neutral-600">
              {t('quarantine.weightGrams', { defaultValue: 'Weight (g)' })}
              <input
                type="number"
                inputMode="numeric"
                className="mt-1 w-full rounded-xl border px-2 py-2 text-sm"
                value={draft.weightGrams}
                placeholder={t('quarantine.optional', { defaultValue: 'Optional' })}
                onChange={event => set({ weightGrams: event.target.value })}
              />
            </label>
          </div>

          {CHECK_FIELDS.map(field => (
            <div key={field.key}>
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-neutral-600 mb-1">
                {label(CHECK_FIELD_LABELS, field.key)}
                <GuidanceButton checkKey={field.key} onOpen={setGuidanceKey} />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {field.options.map(option => {
                  const active = draft[field.key] === option;
                  const isOk = option === field.options[0];
                  return (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={active}
                      className={`rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${
                        active
                          ? (isOk
                            ? 'border-emerald-500 bg-emerald-500 text-white'
                            : 'border-amber-500 bg-amber-500 text-white')
                          : 'bg-white text-neutral-600 hover:border-neutral-400'
                      }`}
                      onClick={() => set({ [field.key]: option })}
                    >
                      {label(CHECK_VALUE_LABELS, option, option)}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          <label className="text-[11px] font-medium text-neutral-600">
            {t('quarantine.notes', { defaultValue: 'Notes' })}
            <textarea
              rows={2}
              className="mt-1 w-full rounded-xl border px-2 py-2 text-sm"
              value={draft.notes}
              placeholder={t('quarantine.checkNotesPlaceholder', { defaultValue: 'Anything the buttons did not cover' })}
              onChange={event => set({ notes: event.target.value })}
            />
          </label>
        </div>

        <div className="sticky bottom-0 bg-white/95 backdrop-blur border-t px-4 py-3">
          <button
            type="button"
            className="w-full rounded-xl bg-sky-500 px-4 py-3 text-sm font-semibold text-white"
            onClick={() => { onSave?.(draft); onClose?.(); }}
          >
            {t('quarantine.saveCheck', { defaultValue: 'Save check' })}
          </button>
        </div>

        {guidanceKey ? (
          <CheckGuidanceDialog checkKey={guidanceKey} onClose={() => setGuidanceKey(null)} />
        ) : null}
      </div>
    </div>
  ), document.body);
}
