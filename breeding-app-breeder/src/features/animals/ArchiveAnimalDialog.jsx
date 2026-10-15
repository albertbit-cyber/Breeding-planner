import React, { useMemo, useState } from 'react';
import useDialogFocus from './useDialogFocus';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { ARCHIVE_REASONS, EXIT_FIELDS_BY_REASON, getArchiveRecord } from './archive';
import { archiveLabels } from './archiveRecord';

const todayYmd = () => {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

const inputClass = 'border rounded-xl px-3 py-2 bg-white text-sm w-full';

/**
 * Move a snake to the archive, or (mode "edit") correct the exit details of one already there.
 *
 * The same form for both on purpose: the exit details are the one part of an archived record that
 * stays editable, and they are exactly what this form collects.
 *
 * `onSubmit(input)` may throw; the message is shown and the entry kept.
 */
export default function ArchiveAnimalDialog({
  animal,
  mode = 'archive',
  defaultCurrency = 'EUR',
  openBreeding = { pairings: 0, cycles: 0 },
  isFemale = false,
  onSubmit,
  onCancel,
}) {
  const { t } = useTranslation();
  const labels = useMemo(() => archiveLabels(t), [t]);
  // A snake already marked Sold or Deceased opens with what is known about it.
  const existing = getArchiveRecord(animal);
  const [form, setForm] = useState(() => ({
    // No reason is preselected: a keeper recording a death should not have to un-pick "Sold".
    reason: existing?.reason || '',
    date: existing?.date || todayYmd(),
    counterpartyName: existing?.counterpartyName || '',
    counterpartyContact: existing?.counterpartyContact || '',
    price: existing?.price ?? (animal?.price ? String(animal.price) : ''),
    currency: existing?.currency || animal?.currency || defaultCurrency,
    handover: existing?.handover || '',
    tradeReceived: existing?.tradeReceived || '',
    causeOfDeath: existing?.causeOfDeath || '',
    necropsy: existing?.necropsy || '',
    necropsyResult: existing?.necropsyResult || '',
    circumstances: existing?.circumstances || '',
    note: existing?.note || '',
  }));
  const [initialForm] = useState(form);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // A stray tap outside the sheet must not throw away a buyer, price or cause of death.
  const dirty = JSON.stringify(form) !== JSON.stringify(initialForm);
  const dialogRef = useDialogFocus(() => { if (!dirty) onCancel(); }, { active: Boolean(animal) });

  if (!animal || typeof document === 'undefined') return null;

  const fields = EXIT_FIELDS_BY_REASON[form.reason] || [];
  const has = (key) => fields.includes(key);
  const set = (key) => (event) => setForm(prev => ({ ...prev, [key]: event.target.value }));
  const name = animal.name || animal.id;
  const breedingOpen = isFemale && (openBreeding.pairings > 0 || openBreeding.cycles > 0);

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      // Fields that do not apply to the chosen reason are not sent, so switching from Sold to
      // Died does not leave a stale buyer behind.
      const input = { reason: form.reason, date: form.date, note: form.note };
      fields.forEach((key) => { input[key] = form[key]; });
      await onSubmit(input);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  const counterpartyLabel = form.reason === 'sold' ? labels.counterpartySold : labels.counterpartyOther;

  return createPortal((
    <div className="sk-scrim fixed inset-0 flex items-end sm:items-center justify-center sm:p-4 z-[10030]" onClick={dirty ? undefined : onCancel}>
      <form
        ref={dialogRef}
        className="archive-dialog relative bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl border max-h-[92vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
        onSubmit={submit}
        aria-labelledby="archive-dialog-title"
        role="dialog"
        aria-modal="true"
      >
        <div className="p-5 pb-3">
          <h2 id="archive-dialog-title" className="font-semibold text-lg">
            {mode === 'edit'
              ? t('archive.dialog.editTitle', { defaultValue: 'Exit details for {{name}}', name })
              : t('archive.dialog.title', { defaultValue: 'Move {{name}} to the archive', name })}
          </h2>
          {mode !== 'edit' && (
            <p className="mt-1 text-sm text-neutral-600 leading-relaxed">
              {t('archive.dialog.lead', { defaultValue: 'The record is kept: feeding, weights, breeding, genetics and photos. From now on it can only be read. You can still correct these exit details, add notes, or bring the snake back later.' })}
            </p>
          )}
        </div>

        <div className="px-5 pb-2 flex flex-col gap-4">
          <fieldset>
            <legend className="text-xs font-medium mb-2">{labels.reason}</legend>
            <div className="archive-reason-grid grid grid-cols-2 sm:grid-cols-3 gap-2">
              {ARCHIVE_REASONS.map(reason => (
                <label
                  key={reason}
                  className={`archive-reason-option flex items-center gap-2 rounded-xl border px-3 py-2 text-sm cursor-pointer ${form.reason === reason ? 'archive-reason-option--selected' : ''}`}
                >
                  <input type="radio" name="archive-reason" value={reason} checked={form.reason === reason} onChange={set('reason')} />
                  <span>{labels.reasons[reason]}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium">{labels.date}</span>
            <input type="date" className={inputClass} value={form.date} max={todayYmd()} onChange={set('date')} required />
          </label>

          {has('counterpartyName') && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium">{counterpartyLabel} <span className="text-neutral-500 font-normal">{t('archive.dialog.optional', { defaultValue: '(optional)' })}</span></span>
                <input className={inputClass} value={form.counterpartyName} onChange={set('counterpartyName')} maxLength={200} autoComplete="off" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium">{labels.contact} <span className="text-neutral-500 font-normal">{t('archive.dialog.optional', { defaultValue: '(optional)' })}</span></span>
                <input className={inputClass} value={form.counterpartyContact} onChange={set('counterpartyContact')} maxLength={300} autoComplete="off" placeholder={t('archive.dialog.contactPlaceholder', { defaultValue: 'Email or phone' })} />
              </label>
            </div>
          )}

          {has('price') && (
            <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium">{labels.price} <span className="text-neutral-500 font-normal">{t('archive.dialog.optional', { defaultValue: '(optional)' })}</span></span>
                <input className={inputClass} inputMode="decimal" value={form.price} onChange={set('price')} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium">{t('archive.field.currency', { defaultValue: 'Currency' })}</span>
                <input className={`${inputClass} uppercase`} value={form.currency} onChange={(event) => setForm(prev => ({ ...prev, currency: event.target.value.toUpperCase().replace(/[^A-Z]/g, '') }))} maxLength={3} autoComplete="off" spellCheck={false} />
              </label>
            </div>
          )}

          {has('tradeReceived') && (
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium">{labels.tradeReceived}</span>
              <input className={inputClass} value={form.tradeReceived} onChange={set('tradeReceived')} maxLength={500} />
            </label>
          )}

          {has('handover') && (
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium">{labels.handover}</span>
              <input className={inputClass} value={form.handover} onChange={set('handover')} maxLength={200} placeholder={t('archive.dialog.handoverPlaceholder', { defaultValue: 'Shipped, picked up, at an expo…' })} />
            </label>
          )}

          {has('causeOfDeath') && (
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium">{labels.causeOfDeath} <span className="text-neutral-500 font-normal">{t('archive.dialog.ifKnown', { defaultValue: '(if known)' })}</span></span>
              <input className={inputClass} value={form.causeOfDeath} onChange={set('causeOfDeath')} maxLength={500} />
            </label>
          )}

          {has('necropsy') && (
            <div className="grid grid-cols-1 sm:grid-cols-[10rem_minmax(0,1fr)] gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium">{labels.necropsyLabel}</span>
                <select className={inputClass} value={form.necropsy} onChange={set('necropsy')}>
                  <option value="">{labels.notRecorded}</option>
                  <option value="no">{labels.necropsy.no}</option>
                  <option value="pending">{labels.necropsy.pending}</option>
                  <option value="yes">{labels.necropsy.yes}</option>
                </select>
              </label>
              {form.necropsy === 'yes' && (
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium">{labels.necropsyResult}</span>
                  <input className={inputClass} value={form.necropsyResult} onChange={set('necropsyResult')} maxLength={2000} />
                </label>
              )}
            </div>
          )}

          {has('circumstances') && (
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium">{labels.circumstances}</span>
              <textarea className={inputClass} rows={2} value={form.circumstances} onChange={set('circumstances')} maxLength={2000} />
            </label>
          )}

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium">
              {labels.note}{' '}
              <span className="text-neutral-500 font-normal">
                {form.reason === 'other'
                  ? t('archive.dialog.required', { defaultValue: '(required)' })
                  : t('archive.dialog.optional', { defaultValue: '(optional)' })}
              </span>
            </span>
            <textarea className={inputClass} rows={2} value={form.note} onChange={set('note')} maxLength={4000} required={form.reason === 'other'} />
          </label>

          {mode !== 'edit' && breedingOpen && form.reason && (
            <p className="archive-dialog__notice text-sm rounded-xl px-3 py-2 leading-relaxed">
              {t('archive.dialog.breedingNotice', {
                defaultValue: 'Her open breeding ({{count}}) will be completed as "{{reason}}". No clutch or hatchlings will be expected from it.',
                count: openBreeding.pairings + openBreeding.cycles,
                reason: form.reason === 'sold'
                  ? t('archive.closure.femaleSold', { defaultValue: 'Female sold' })
                  : form.reason === 'died'
                    ? t('archive.closure.femaleDied', { defaultValue: 'Female died' })
                    : t('archive.closure.femaleLeft', { defaultValue: 'Female left the collection' }),
              })}
            </p>
          )}

          {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
        </div>

        <div className="sticky bottom-0 bg-white border-t px-5 py-3 flex justify-end gap-2">
          <button type="button" className="px-3 py-2 rounded-xl text-sm border" onClick={onCancel}>
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </button>
          <button type="submit" className="px-3 py-2 rounded-xl text-sm appearance-btn appearance-btn--filled" disabled={busy || !form.reason}>
            {busy
              ? t('archive.dialog.saving', { defaultValue: 'Saving…' })
              : mode === 'edit'
                ? t('archive.dialog.saveDetails', { defaultValue: 'Save details' })
                : t('archive.dialog.confirm', { defaultValue: 'Move to archive' })}
          </button>
        </div>
      </form>
    </div>
  ), document.body);
}
