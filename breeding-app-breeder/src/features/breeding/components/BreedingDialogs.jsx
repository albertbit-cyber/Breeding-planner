/**
 * The quick-entry dialogs of a breeding card. Each keeps its input on a failed save and shows
 * the reason; none defaults a lock to "observed" or invents a date.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LOCK_STATUS, EVENT_TYPES, CLOSURE_OUTCOMES, ARCHIVE_CLOSURE_OUTCOMES, EGG_LAYING_ONLY_EVENTS } from '../domain/cycleModel';
import { EXAM_METHODS, EXAM_RESULTS, MEASUREMENT_AXES } from '../domain/follicles';
import { addCalendarMonths, todayYmd } from '../domain/dates';
import { animalLabel, formatDate } from './format';
import { eventTypeLabel, closureOutcomeLabel, methodLabel, resultLabel, lockStatusLabel } from './labels';

const inputClass = 'w-full border rounded-xl px-3 py-2 text-sm bg-white';
const labelClass = 'text-xs font-medium';
const hintClass = 'text-[11px] text-neutral-500';

export function BreedingDialog({ title, subtitle, onClose, onConfirm, confirmLabel, children, busy = false, error = null, secondaryAction = null, wide = false }) {
  const { t } = useTranslation();
  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="sk-scrim fixed inset-0 flex items-end sm:items-center justify-center z-[70] p-0 sm:p-4" onClick={onClose} role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="breeding-dialog-title"
        className={`bg-white w-full ${wide ? 'max-w-2xl' : 'max-w-md'} rounded-t-2xl sm:rounded-2xl shadow-xl border p-4 sm:p-5 max-h-[92vh] flex flex-col`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <div id="breeding-dialog-title" className="font-semibold">{title}</div>
            {subtitle ? <div className={hintClass}>{subtitle}</div> : null}
          </div>
          <button type="button" className="text-sm px-2 py-1 shrink-0" onClick={onClose}>{t('common.close', { defaultValue: 'Close' })}</button>
        </div>
        <div className="space-y-3 overflow-auto pe-1 flex-1">{children}</div>
        {error ? (
          <div role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
            {error}
            <div className="mt-1 text-rose-700">{t('breeding.dialog.retryHint', { defaultValue: 'Your entry is kept. Correct it and save again.' })}</div>
          </div>
        ) : null}
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          {secondaryAction}
          <button type="button" className="px-3 py-2 rounded-xl text-sm border" onClick={onClose} disabled={busy}>{t('common.cancel', { defaultValue: 'Cancel' })}</button>
          {onConfirm ? (
            <button type="button" className="appearance-btn appearance-btn--filled px-3 py-2 rounded-xl text-sm" onClick={onConfirm} disabled={busy} aria-busy={busy}>
              {busy ? t('breeding.dialog.saving', { defaultValue: 'Saving…' }) : (confirmLabel || t('common.save', { defaultValue: 'Save' }))}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Shared save handling: run, keep input and show the error on failure. */
function useSubmit(onSubmit, onClose) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const submit = async (payload, { keepOpen = false } = {}) => {
    setBusy(true);
    setError(null);
    try {
      const result = await onSubmit(payload);
      if (!keepOpen) onClose?.();
      return result;
    } catch (err) {
      setError(err?.message || String(err));
      return null;
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, setError, submit };
}

function AnimalSelect({ value, onChange, options, placeholder, disabled = false, id }) {
  return (
    <select id={id} className={inputClass} value={value || ''} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
      <option value="">{placeholder}</option>
      {options.map((snake) => <option key={snake.id} value={snake.id}>{animalLabel(snake)}</option>)}
    </select>
  );
}

/**
 * Quick pairing entry. Female prefilled from the card; male prefilled from the card's last
 * selection but visible and changeable; date defaults to today and may be backdated; lock status
 * is a three-way choice that never defaults to Yes.
 */
export function QuickPairingDialog({ femaleId, females = [], males = [], defaultMaleId = null, seasonLabel = '', onSubmit, onClose, batch = null }) {
  const { t } = useTranslation();
  const today = todayYmd();
  const [female, setFemale] = useState(femaleId || '');
  const [male, setMale] = useState(defaultMaleId || '');
  const [introductionDate, setIntroductionDate] = useState(today);
  const [lockStatus, setLockStatus] = useState(LOCK_STATUS.UNKNOWN);
  const [lockDate, setLockDate] = useState('');
  const [lockDiffers, setLockDiffers] = useState(false);
  const [notes, setNotes] = useState('');
  const [more, setMore] = useState(false);
  const [introductionTime, setIntroductionTime] = useState('');
  const [removalDate, setRemovalDate] = useState('');
  const [removalTime, setRemovalTime] = useState('');
  const { busy, error, submit } = useSubmit(onSubmit, onClose);

  useEffect(() => { setFemale(femaleId || ''); }, [femaleId]);
  useEffect(() => { setMale(defaultMaleId || ''); }, [defaultMaleId]);

  const proposedNext = lockStatus === LOCK_STATUS.OBSERVED ? addCalendarMonths(lockDiffers && lockDate ? lockDate : introductionDate, 1) : null;

  const payload = () => ({
    femaleId: female,
    maleId: male,
    introductionDate,
    introductionTime: introductionTime || null,
    removalDate: removalDate || null,
    removalTime: removalTime || null,
    lockStatus,
    lockDate: lockStatus !== LOCK_STATUS.UNKNOWN && lockDiffers && lockDate ? lockDate : null,
    notes,
    seasonLabel,
  });

  const resetForNextFemale = () => {
    // Measurements and locks never carry over to the next animal in a rack walk.
    setLockStatus(LOCK_STATUS.UNKNOWN);
    setLockDate('');
    setLockDiffers(false);
    setNotes('');
    setRemovalDate('');
    setRemovalTime('');
  };

  const saveAndNext = batch ? (
    <button
      type="button"
      className="px-3 py-2 rounded-xl text-sm border"
      disabled={busy || !batch.nextFemaleId}
      onClick={async () => {
        const result = await submit(payload(), { keepOpen: true });
        if (result !== null) {
          resetForNextFemale();
          batch.onNext?.();
        }
      }}
    >
      {t('breeding.quickPairing.saveAndNext', { defaultValue: 'Save and next female' })}
    </button>
  ) : null;

  return (
    <BreedingDialog
      title={t('breeding.quickPairing.title', { defaultValue: 'Record a pairing session' })}
      subtitle={seasonLabel ? t('breeding.quickPairing.seasonInherited', { defaultValue: 'Season {{season}} (from the card)', season: seasonLabel }) : null}
      onClose={onClose}
      onConfirm={() => submit(payload())}
      confirmLabel={t('breeding.quickPairing.save', { defaultValue: 'Save session' })}
      busy={busy}
      error={error}
      secondaryAction={saveAndNext}
    >
      <label className="flex flex-col gap-1">
        <span className={labelClass}>{t('breeding.field.female', { defaultValue: 'Female' })}</span>
        <AnimalSelect value={female} onChange={setFemale} options={females} placeholder={t('breeding.field.chooseFemale', { defaultValue: 'Choose a female' })} disabled={!!femaleId} />
      </label>
      <label className="flex flex-col gap-1">
        <span className={labelClass}>{t('breeding.field.male', { defaultValue: 'Male' })}</span>
        <AnimalSelect value={male} onChange={setMale} options={males} placeholder={t('breeding.field.chooseMale', { defaultValue: 'Choose a male' })} />
        <span className={hintClass}>{t('breeding.quickPairing.maleHint', { defaultValue: 'Changing the male here applies to this new session only. Earlier sessions keep their male.' })}</span>
      </label>
      <label className="flex flex-col gap-1">
        <span className={labelClass}>{t('breeding.field.pairingDate', { defaultValue: 'Pairing date (introduction)' })}</span>
        <input type="date" className={inputClass} value={introductionDate} max={today} onChange={(e) => setIntroductionDate(e.target.value)} />
      </label>
      <fieldset className="flex flex-col gap-1">
        <legend className={labelClass}>{t('breeding.field.lockObserved', { defaultValue: 'Lock observed?' })}</legend>
        <div className="flex flex-wrap gap-2" role="radiogroup">
          {[LOCK_STATUS.OBSERVED, LOCK_STATUS.NOT_OBSERVED, LOCK_STATUS.UNKNOWN].map((status) => (
            <label key={status} className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer ${lockStatus === status ? 'appearance-tab--active' : ''}`}>
              <input type="radio" name="lock-status" value={status} checked={lockStatus === status} onChange={() => setLockStatus(status)} />
              {status === LOCK_STATUS.OBSERVED ? t('breeding.lock.yes', { defaultValue: 'Yes' }) : lockStatusLabel(t, status)}
            </label>
          ))}
        </div>
        <span className={hintClass}>{t('breeding.lock.notObservedHint', { defaultValue: '"Not observed" means no lock was seen. It is not proof that mating did not happen.' })}</span>
      </fieldset>
      {lockStatus !== LOCK_STATUS.UNKNOWN ? (
        <div className="flex flex-col gap-1">
          <label className="inline-flex items-center gap-2 text-xs">
            <input type="checkbox" checked={lockDiffers} onChange={(e) => setLockDiffers(e.target.checked)} />
            {t('breeding.field.lockDateDiffers', { defaultValue: 'The lock was seen on a different day than the introduction' })}
          </label>
          {lockDiffers ? (
            <input type="date" className={inputClass} value={lockDate} min={introductionDate} max={today} onChange={(e) => setLockDate(e.target.value)} aria-label={t('breeding.field.lockDate', { defaultValue: 'Lock observation date' })} />
          ) : null}
        </div>
      ) : null}
      {proposedNext ? (
        <div className="rounded-lg border bg-neutral-50 px-3 py-2 text-xs text-neutral-700">
          {proposedNext < today
            ? t('breeding.quickPairing.nextProposalPast', { defaultValue: 'One calendar month after this lock would be {{date}}, which is already past, so no reminder is created automatically. Use "Plan pairing" on the card if you want a next date.', date: formatDate(proposedNext) })
            : t('breeding.quickPairing.nextProposal', { defaultValue: 'An observed lock proposes the next pairing with this male on {{date}} (one calendar month later). You can move or skip it on the card.', date: formatDate(proposedNext) })}
        </div>
      ) : null}
      <label className="flex flex-col gap-1">
        <span className={labelClass}>{t('breeding.field.notes', { defaultValue: 'Notes (optional)' })}</span>
        <textarea className={inputClass} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <button type="button" className="text-xs underline text-start" onClick={() => setMore((v) => !v)} aria-expanded={more}>
        {more ? t('breeding.dialog.fewerDetails', { defaultValue: 'Fewer details' }) : t('breeding.dialog.moreDetails', { defaultValue: 'More details' })}
      </button>
      {more ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className={labelClass}>{t('breeding.field.introductionTime', { defaultValue: 'Introduction time' })}</span>
            <input type="time" className={inputClass} value={introductionTime} onChange={(e) => setIntroductionTime(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>{t('breeding.field.removalDate', { defaultValue: 'Removal date' })}</span>
            <input type="date" className={inputClass} value={removalDate} min={introductionDate} onChange={(e) => setRemovalDate(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>{t('breeding.field.removalTime', { defaultValue: 'Removal time' })}</span>
            <input type="time" className={inputClass} value={removalTime} onChange={(e) => setRemovalTime(e.target.value)} />
          </label>
        </div>
      ) : null}
    </BreedingDialog>
  );
}

/** A dated lock observation on an existing session. */
export function LockObservationDialog({ cycle, sessions = [], snakesById, defaultSessionId = null, onSubmit, onClose }) {
  const { t } = useTranslation();
  const today = todayYmd();
  const [sessionId, setSessionId] = useState(defaultSessionId || sessions[0]?.id || '');
  const [status, setStatus] = useState(LOCK_STATUS.OBSERVED);
  const [date, setDate] = useState(today);
  const [time, setTime] = useState('');
  const [notes, setNotes] = useState('');
  const { busy, error, submit } = useSubmit(onSubmit, onClose);
  const session = sessions.find((s) => s.id === sessionId) || null;
  return (
    <BreedingDialog
      title={t('breeding.lockDialog.title', { defaultValue: 'Record a lock observation' })}
      subtitle={t('breeding.lockDialog.subtitle', { defaultValue: 'One dated record per sighting day. A second sighting on the same day updates the same record.' })}
      onClose={onClose}
      onConfirm={() => submit({ sessionId, status, observationDate: date, observationTime: time || null, notes })}
      busy={busy}
      error={error}
    >
      <label className="flex flex-col gap-1">
        <span className={labelClass}>{t('breeding.field.session', { defaultValue: 'Pairing session' })}</span>
        <select className={inputClass} value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>{animalLabel(snakesById?.get?.(s.maleId), s.maleId)} · {formatDate(s.introductionDate)}</option>
          ))}
        </select>
        {!sessions.length ? <span className={hintClass}>{t('breeding.lockDialog.noSessions', { defaultValue: 'Record a pairing session first. A lock belongs to a session with a male.' })}</span> : null}
      </label>
      <fieldset className="flex flex-col gap-1">
        <legend className={labelClass}>{t('breeding.field.lockStatus', { defaultValue: 'Status' })}</legend>
        <div className="flex flex-wrap gap-2">
          {[LOCK_STATUS.OBSERVED, LOCK_STATUS.NOT_OBSERVED, LOCK_STATUS.UNKNOWN].map((value) => (
            <label key={value} className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer ${status === value ? 'appearance-tab--active' : ''}`}>
              <input type="radio" name="lock-obs-status" checked={status === value} onChange={() => setStatus(value)} />
              {lockStatusLabel(t, value)}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className={labelClass}>{t('breeding.field.observationDate', { defaultValue: 'Observation date' })}</span>
          <input type="date" className={inputClass} value={date} min={session?.introductionDate || undefined} max={today} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>{t('breeding.field.timeOptional', { defaultValue: 'Time (optional)' })}</span>
          <input type="time" className={inputClass} value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
      </div>
      <label className="flex flex-col gap-1">
        <span className={labelClass}>{t('breeding.field.notes', { defaultValue: 'Notes (optional)' })}</span>
        <textarea className={inputClass} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      {cycle?.status === 'closed' ? <div className={hintClass}>{t('breeding.lockDialog.closedCard', { defaultValue: 'This card is closed. The observation is kept, but no reminder is proposed.' })}</div> : null}
    </BreedingDialog>
  );
}

const emptyMeasurement = () => ({ id: `fm-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`, valueMm: '', axis: 'length', location: '', structureLabel: '' });

/**
 * Quick follicle entry. A result such as "inconclusive" or "not visualized" needs no number; an
 * external observation cannot carry one; a palpation value is saved as an estimate.
 */
export function FollicleExamDialog({ femaleId, females = [], exam = null, onSubmit, onClose, onAttach = null, batch = null }) {
  const { t } = useTranslation();
  const today = todayYmd();
  const [female, setFemale] = useState(exam?.femaleId || femaleId || '');
  const [date, setDate] = useState(exam?.date || today);
  const [time, setTime] = useState(exam?.time || '');
  const [method, setMethod] = useState(exam?.method || 'ultrasound');
  const [result, setResult] = useState(exam?.result || 'follicles_seen');
  const [largest, setLargest] = useState(exam?.largestDiameterMm ?? '');
  const [measurements, setMeasurements] = useState(exam?.measurements?.length ? exam.measurements : []);
  const [visibleCount, setVisibleCount] = useState(exam?.visibleCount ?? '');
  const [countCertainty, setCountCertainty] = useState(exam?.countCertainty || 'unknown');
  const [coverage, setCoverage] = useState(exam?.coverage || 'complete');
  const [notes, setNotes] = useState(exam?.notes || '');
  const [nextReview, setNextReview] = useState(exam?.nextReviewDate || '');
  const [attachments, setAttachments] = useState(exam?.attachments || []);
  const [advanced, setAdvanced] = useState(false);
  const [operator, setOperator] = useState(exam?.operator || '');
  const [equipment, setEquipment] = useState(exam?.equipment || '');
  const [imageQuality, setImageQuality] = useState(exam?.imageQuality || '');
  const { busy, error, setError, submit } = useSubmit(onSubmit, onClose);

  const canMeasure = method !== 'external' && result !== 'not_visualized' && result !== 'inconclusive';
  const isEstimate = method === 'palpation';
  const isPostOvulation = result === 'post_ovulation';

  useEffect(() => { if (method === 'external') { setLargest(''); setMeasurements([]); } }, [method]);

  const payload = () => ({
    id: exam?.id,
    femaleId: female,
    cycleId: exam?.cycleId || null,
    date,
    time: time || null,
    method,
    result,
    largestDiameterMm: canMeasure && largest !== '' ? Number(largest) : null,
    measurements: canMeasure ? measurements.filter((m) => m.valueMm !== '' && m.valueMm !== null) : [],
    visibleCount: visibleCount === '' ? null : Number(visibleCount),
    countCertainty,
    coverage,
    notes,
    nextReviewDate: nextReview || null,
    attachments,
    operator,
    equipment,
    imageQuality: imageQuality || null,
  });

  const handleFiles = async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length || !onAttach) return;
    try {
      const added = await onAttach(files);
      setAttachments((prev) => [...prev, ...added]);
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      event.target.value = '';
    }
  };

  const saveAndNext = batch ? (
    <button
      type="button"
      className="px-3 py-2 rounded-xl text-sm border"
      disabled={busy || !batch.nextFemaleId}
      onClick={async () => {
        const saved = await submit(payload(), { keepOpen: true });
        if (saved !== null) {
          // Nothing measured carries over to the next female.
          setLargest(''); setMeasurements([]); setVisibleCount(''); setNotes(''); setAttachments([]); setResult('follicles_seen');
          batch.onNext?.();
        }
      }}
    >
      {t('breeding.quickPairing.saveAndNext', { defaultValue: 'Save and next female' })}
    </button>
  ) : null;

  return (
    <BreedingDialog
      title={exam ? t('breeding.examDialog.editTitle', { defaultValue: 'Edit follicle examination' }) : t('breeding.examDialog.title', { defaultValue: 'Record a follicle examination' })}
      onClose={onClose}
      onConfirm={() => submit(payload())}
      busy={busy}
      error={error}
      secondaryAction={saveAndNext}
      wide
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className={labelClass}>{t('breeding.field.female', { defaultValue: 'Female' })}</span>
          <AnimalSelect value={female} onChange={setFemale} options={females} placeholder={t('breeding.field.chooseFemale', { defaultValue: 'Choose a female' })} disabled={!!femaleId || !!exam} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>{t('breeding.field.examDate', { defaultValue: 'Examination date' })}</span>
          <input type="date" className={inputClass} value={date} max={today} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>{t('breeding.field.timeOptional', { defaultValue: 'Time (optional)' })}</span>
          <input type="time" className={inputClass} value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>{t('breeding.field.method', { defaultValue: 'Method' })}</span>
          <select className={inputClass} value={method} onChange={(e) => setMethod(e.target.value)}>
            {EXAM_METHODS.map((m) => <option key={m} value={m}>{methodLabel(t, m)}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>{t('breeding.field.result', { defaultValue: 'Result' })}</span>
          <select className={inputClass} value={result} onChange={(e) => setResult(e.target.value)}>
            {EXAM_RESULTS.map((r) => <option key={r} value={r}>{resultLabel(t, r)}</option>)}
          </select>
        </label>
      </div>
      {method === 'external' ? (
        <div className="rounded-lg border bg-neutral-50 px-3 py-2 text-xs text-neutral-700">{t('breeding.examDialog.externalHint', { defaultValue: 'An external observation records what you saw; it cannot produce a measured follicle diameter.' })}</div>
      ) : null}
      {isPostOvulation ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{t('breeding.examDialog.postOvulationHint', { defaultValue: 'Post-ovulation structures are not follicles. Sizes entered here are kept with this exam and never placed on the follicle curve.' })}</div>
      ) : null}
      {canMeasure ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className={labelClass}>{isEstimate ? t('breeding.field.largestEstimate', { defaultValue: 'Largest diameter, estimate (mm)' }) : t('breeding.field.largestMeasured', { defaultValue: 'Largest measured diameter (mm)' })}</span>
            <input type="number" inputMode="decimal" min="0.1" step="0.1" className={inputClass} value={largest} onChange={(e) => setLargest(e.target.value)} placeholder={t('breeding.field.optional', { defaultValue: 'Optional' })} />
            {isEstimate ? <span className={hintClass}>{t('breeding.examDialog.palpationHint', { defaultValue: 'Palpation values are saved as estimates and kept apart from ultrasound measurements.' })}</span> : null}
          </label>
          <div className="flex flex-col gap-1">
            <span className={labelClass}>{t('breeding.field.extraMeasurements', { defaultValue: 'Additional measurements' })}</span>
            {measurements.map((m, index) => (
              <div key={m.id} className="grid grid-cols-[1fr_1fr_auto] gap-1 items-center">
                <input type="number" inputMode="decimal" min="0.1" step="0.1" className="border rounded-lg px-2 py-1 text-xs" value={m.valueMm} onChange={(e) => setMeasurements((prev) => prev.map((x, i) => (i === index ? { ...x, valueMm: e.target.value } : x)))} aria-label={t('breeding.field.measurementMm', { defaultValue: 'Measurement (mm)' })} />
                <select className="border rounded-lg px-2 py-1 text-xs" value={m.axis} onChange={(e) => setMeasurements((prev) => prev.map((x, i) => (i === index ? { ...x, axis: e.target.value } : x)))} aria-label={t('breeding.field.axis', { defaultValue: 'Axis' })}>
                  {MEASUREMENT_AXES.map((axis) => <option key={axis} value={axis}>{axis.replace(/_/g, ' ')}</option>)}
                </select>
                <button type="button" className="text-xs px-2 py-1 border rounded-lg" onClick={() => setMeasurements((prev) => prev.filter((_, i) => i !== index))}>{t('common.remove', { defaultValue: 'Remove' })}</button>
              </div>
            ))}
            <button type="button" className="text-xs underline text-start" onClick={() => setMeasurements((prev) => [...prev, emptyMeasurement()])}>{t('breeding.examDialog.addMeasurement', { defaultValue: '+ Add measurement' })}</button>
          </div>
        </div>
      ) : null}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <label className="flex flex-col gap-1">
          <span className={labelClass}>{t('breeding.field.visibleCount', { defaultValue: 'Visible follicle count' })}</span>
          <input type="number" inputMode="numeric" min="0" step="1" className={inputClass} value={visibleCount} onChange={(e) => setVisibleCount(e.target.value)} placeholder={t('breeding.field.optional', { defaultValue: 'Optional' })} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>{t('breeding.field.countCertainty', { defaultValue: 'Count certainty' })}</span>
          <select className={inputClass} value={countCertainty} onChange={(e) => setCountCertainty(e.target.value)}>
            <option value="unknown">{t('breeding.certainty.unknownCount', { defaultValue: 'Unknown' })}</option>
            <option value="approximate">{t('breeding.certainty.approximate', { defaultValue: 'Approximate' })}</option>
            <option value="exact">{t('breeding.certainty.exact', { defaultValue: 'Exact' })}</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>{t('breeding.field.coverage', { defaultValue: 'Examination coverage' })}</span>
          <select className={inputClass} value={coverage} onChange={(e) => setCoverage(e.target.value)}>
            <option value="complete">{t('breeding.coverage.complete', { defaultValue: 'Complete' })}</option>
            <option value="partial">{t('breeding.coverage.partial', { defaultValue: 'Partial' })}</option>
          </select>
        </label>
      </div>
      <label className="flex flex-col gap-1">
        <span className={labelClass}>{t('breeding.field.examNotes', { defaultValue: 'Notes (appearance, behaviour, feeding, other observations)' })}</span>
        <textarea className={inputClass} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className={labelClass}>{t('breeding.field.nextReview', { defaultValue: 'Next check date' })}</span>
          <input type="date" className={inputClass} value={nextReview} min={date} onChange={(e) => setNextReview(e.target.value)} />
        </label>
        <div className="flex flex-col gap-1">
          <span className={labelClass}>{t('breeding.field.attachments', { defaultValue: 'Images / video (evidence for your review)' })}</span>
          {onAttach ? <input type="file" accept="image/*,video/*" multiple className="text-xs" onChange={handleFiles} /> : <span className={hintClass}>{t('breeding.examDialog.attachUnavailable', { defaultValue: 'Attachments are not available here.' })}</span>}
          {attachments.length ? (
            <ul className="text-xs text-neutral-700 list-disc ps-4">
              {attachments.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2">
                  <span className="truncate">{a.name || a.kind}</span>
                  <button type="button" className="underline" onClick={() => setAttachments((prev) => prev.filter((x) => x.id !== a.id))}>{t('common.remove', { defaultValue: 'Remove' })}</button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
      <button type="button" className="text-xs underline text-start" onClick={() => setAdvanced((v) => !v)} aria-expanded={advanced}>
        {advanced ? t('breeding.dialog.fewerDetails', { defaultValue: 'Fewer details' }) : t('breeding.examDialog.advanced', { defaultValue: 'Operator, equipment, image quality' })}
      </button>
      {advanced ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <label className="flex flex-col gap-1"><span className={labelClass}>{t('breeding.field.operator', { defaultValue: 'Operator' })}</span><input className={inputClass} value={operator} onChange={(e) => setOperator(e.target.value)} /></label>
          <label className="flex flex-col gap-1"><span className={labelClass}>{t('breeding.field.equipment', { defaultValue: 'Equipment' })}</span><input className={inputClass} value={equipment} onChange={(e) => setEquipment(e.target.value)} /></label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>{t('breeding.field.imageQuality', { defaultValue: 'Image quality' })}</span>
            <select className={inputClass} value={imageQuality} onChange={(e) => setImageQuality(e.target.value)}>
              <option value="">{DASH_OPTION}</option>
              <option value="good">{t('breeding.quality.good', { defaultValue: 'Good' })}</option>
              <option value="fair">{t('breeding.quality.fair', { defaultValue: 'Fair' })}</option>
              <option value="poor">{t('breeding.quality.poor', { defaultValue: 'Poor' })}</option>
            </select>
          </label>
        </div>
      ) : null}
    </BreedingDialog>
  );
}

const DASH_OPTION = '—';

/** Milestone entry: type, date, exact/estimated, recorded/suspected. No earlier milestone is required. */
export function MilestoneDialog({ cycle, defaultType = 'ovulation', event = null, onSubmit, onClose }) {
  const { t } = useTranslation();
  const today = todayYmd();
  const allowed = useMemo(() => EVENT_TYPES.filter((type) => cycle?.reproductionMode !== 'live_bearing' || !EGG_LAYING_ONLY_EVENTS.includes(type)).filter((type) => type !== 'hatching_complete'), [cycle]);
  const [type, setType] = useState(event?.type || defaultType);
  const [date, setDate] = useState(event?.date || today);
  const [precision, setPrecision] = useState(event?.precision || 'exact');
  const [certainty, setCertainty] = useState(event?.certainty || 'recorded');
  const [notes, setNotes] = useState(event?.notes || '');
  const { busy, error, submit } = useSubmit(onSubmit, onClose);
  return (
    <BreedingDialog
      title={event ? t('breeding.milestoneDialog.editTitle', { defaultValue: 'Correct a milestone' }) : t('breeding.milestoneDialog.title', { defaultValue: 'Record a milestone' })}
      subtitle={t('breeding.milestoneDialog.subtitle', { defaultValue: 'A known later milestone can be entered without the earlier ones. Conflicting dates are flagged, never changed for you.' })}
      onClose={onClose}
      onConfirm={() => submit({ id: event?.id, type, date, precision, certainty, notes })}
      busy={busy}
      error={error}
    >
      <label className="flex flex-col gap-1">
        <span className={labelClass}>{t('breeding.field.milestone', { defaultValue: 'Milestone' })}</span>
        <select className={inputClass} value={type} onChange={(e) => setType(e.target.value)} disabled={!!event}>
          {allowed.map((value) => <option key={value} value={value}>{eventTypeLabel(t, value)}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className={labelClass}>{t('breeding.field.date', { defaultValue: 'Date' })}</span>
        <input type="date" className={inputClass} value={date} max={today} onChange={(e) => setDate(e.target.value)} />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className={labelClass}>{t('breeding.field.certainty', { defaultValue: 'Observation' })}</span>
          <select className={inputClass} value={certainty} onChange={(e) => setCertainty(e.target.value)}>
            <option value="recorded">{t('breeding.certainty.recordedObservation', { defaultValue: 'Recorded (seen)' })}</option>
            <option value="suspected">{t('breeding.certainty.suspectedObservation', { defaultValue: 'Suspected (interpretation)' })}</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>{t('breeding.field.precision', { defaultValue: 'Date precision' })}</span>
          <select className={inputClass} value={precision} onChange={(e) => setPrecision(e.target.value)}>
            <option value="exact">{t('breeding.precision.exact', { defaultValue: 'Exact date' })}</option>
            <option value="estimated">{t('breeding.precision.estimated', { defaultValue: 'Estimated date' })}</option>
          </select>
        </label>
      </div>
      <div className={hintClass}>{t('breeding.milestoneDialog.statsHint', { defaultValue: 'Suspected and estimated dates are shown on the card but left out of the female\'s default history statistics.' })}</div>
      <label className="flex flex-col gap-1">
        <span className={labelClass}>{t('breeding.field.notes', { defaultValue: 'Notes (optional)' })}</span>
        <textarea className={inputClass} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
    </BreedingDialog>
  );
}

/** Clutch counts and laying date; hatching and the explicit completion live in HatchingDialog. */
export function ClutchDialog({ cycle, onSubmit, onClose }) {
  const { t } = useTranslation();
  const laid = cycle?.events?.find((e) => e.type === 'egg_laying' && e.certainty === 'recorded')?.date || '';
  const [laidDate, setLaidDate] = useState(laid || todayYmd());
  const [eggsTotal, setEggsTotal] = useState(cycle?.clutch?.eggsTotal ?? '');
  const [fertile, setFertile] = useState(cycle?.clutch?.fertileEggs ?? '');
  const [slugs, setSlugs] = useState(cycle?.clutch?.slugs ?? '');
  const [notes, setNotes] = useState(cycle?.clutch?.notes || '');
  const { busy, error, submit } = useSubmit(onSubmit, onClose);
  const count = (v) => (v === '' ? null : Number(v));
  return (
    <BreedingDialog
      title={t('breeding.clutchDialog.title', { defaultValue: 'Record the clutch' })}
      subtitle={t('breeding.clutchDialog.subtitle', { defaultValue: 'Eggs laid are not follicles and not hatchlings. Leave a count empty if you do not know it.' })}
      onClose={onClose}
      onConfirm={() => submit({ laidDate: laid ? undefined : laidDate, eggsTotal: count(eggsTotal), fertileEggs: count(fertile), slugs: count(slugs), notes })}
      busy={busy}
      error={error}
    >
      {!laid ? (
        <label className="flex flex-col gap-1">
          <span className={labelClass}>{t('breeding.field.layingDate', { defaultValue: 'Laying date' })}</span>
          <input type="date" className={inputClass} value={laidDate} max={todayYmd()} onChange={(e) => setLaidDate(e.target.value)} />
        </label>
      ) : <div className={hintClass}>{t('breeding.clutchDialog.laidOn', { defaultValue: 'Laid on {{date}} (correct the date from the milestones list).', date: formatDate(laid) })}</div>}
      <div className="grid grid-cols-3 gap-2">
        <label className="flex flex-col gap-1"><span className={labelClass}>{t('breeding.field.eggsTotal', { defaultValue: 'Total eggs' })}</span><input type="number" min="0" step="1" inputMode="numeric" className={inputClass} value={eggsTotal} onChange={(e) => setEggsTotal(e.target.value)} /></label>
        <label className="flex flex-col gap-1"><span className={labelClass}>{t('breeding.field.fertileEggs', { defaultValue: 'Fertile' })}</span><input type="number" min="0" step="1" inputMode="numeric" className={inputClass} value={fertile} onChange={(e) => setFertile(e.target.value)} /></label>
        <label className="flex flex-col gap-1"><span className={labelClass}>{t('breeding.field.slugs', { defaultValue: 'Slugs' })}</span><input type="number" min="0" step="1" inputMode="numeric" className={inputClass} value={slugs} onChange={(e) => setSlugs(e.target.value)} /></label>
      </div>
      <label className="flex flex-col gap-1">
        <span className={labelClass}>{t('breeding.field.notes', { defaultValue: 'Notes (optional)' })}</span>
        <textarea className={inputClass} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
    </BreedingDialog>
  );
}

/** Partial hatching or the explicit "Hatching complete" action. */
export function HatchingDialog({ cycle, mode = 'partial', onSubmit, onClose }) {
  const { t } = useTranslation();
  const today = todayYmd();
  const [date, setDate] = useState(cycle?.clutch?.finalHatchDate || today);
  const [count, setCount] = useState(cycle?.clutch?.hatchlingsRecorded ?? '');
  const [lost, setLost] = useState(cycle?.clutch?.lostEggs ?? '');
  const [notes, setNotes] = useState('');
  const { busy, error, submit } = useSubmit(onSubmit, onClose);
  const complete = mode === 'complete';
  return (
    <BreedingDialog
      title={complete ? t('breeding.hatchDialog.completeTitle', { defaultValue: 'Record the final outcome (hatching complete)' }) : t('breeding.hatchDialog.partialTitle', { defaultValue: 'Record hatching' })}
      subtitle={complete
        ? t('breeding.hatchDialog.completeSubtitle', { defaultValue: 'Completes the cycle: every egg\'s outcome is resolved. The first hatchling alone never closes a card.' })
        : t('breeding.hatchDialog.partialSubtitle', { defaultValue: 'Hatching in progress. The card stays open until you record the final outcome.' })}
      onClose={onClose}
      onConfirm={() => submit(complete
        ? { finalHatchDate: date, hatchlingsRecorded: count === '' ? null : Number(count), lostEggs: lost === '' ? null : Number(lost), notes }
        : { date, hatchlingsRecorded: count === '' ? null : Number(count), notes })}
      confirmLabel={complete ? t('breeding.hatchDialog.completeAction', { defaultValue: 'Hatching complete' }) : t('common.save', { defaultValue: 'Save' })}
      busy={busy}
      error={error}
    >
      <label className="flex flex-col gap-1">
        <span className={labelClass}>{complete ? t('breeding.field.finalHatchDate', { defaultValue: 'Final hatch date' }) : t('breeding.field.hatchDate', { defaultValue: 'Hatch date' })}</span>
        <input type="date" className={inputClass} value={date} max={today} onChange={(e) => setDate(e.target.value)} />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1"><span className={labelClass}>{t('breeding.field.hatchlingsRecorded', { defaultValue: 'Hatchlings so far' })}</span><input type="number" min="0" step="1" inputMode="numeric" className={inputClass} value={count} onChange={(e) => setCount(e.target.value)} /></label>
        {complete ? <label className="flex flex-col gap-1"><span className={labelClass}>{t('breeding.field.lostEggs', { defaultValue: 'Unhatched / lost eggs' })}</span><input type="number" min="0" step="1" inputMode="numeric" className={inputClass} value={lost} onChange={(e) => setLost(e.target.value)} /></label> : null}
      </div>
      <label className="flex flex-col gap-1">
        <span className={labelClass}>{t('breeding.field.notes', { defaultValue: 'Notes (optional)' })}</span>
        <textarea className={inputClass} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
    </BreedingDialog>
  );
}

export function CloseCycleDialog({ cycle, onSubmit, onClose }) {
  const { t } = useTranslation();
  const outcomes = CLOSURE_OUTCOMES.filter((o) => o !== 'hatching_complete' && !ARCHIVE_CLOSURE_OUTCOMES.includes(o) && (cycle?.reproductionMode === 'live_bearing' || o !== 'live_birth_complete'));
  const [outcome, setOutcome] = useState('no_clutch');
  const [note, setNote] = useState('');
  const [biologicalDate, setBiologicalDate] = useState('');
  const { busy, error, submit } = useSubmit(onSubmit, onClose);
  return (
    <BreedingDialog
      title={t('breeding.closeDialog.title', { defaultValue: 'Close this breeding card' })}
      subtitle={t('breeding.closeDialog.subtitle', { defaultValue: 'Closing without hatchlings needs a documented reason. Everything recorded stays; the card can be reopened.' })}
      onClose={onClose}
      onConfirm={() => submit({ outcome, note, biologicalCompletionDate: biologicalDate || null })}
      confirmLabel={t('breeding.closeDialog.action', { defaultValue: 'Close card' })}
      busy={busy}
      error={error}
    >
      <label className="flex flex-col gap-1">
        <span className={labelClass}>{t('breeding.field.outcome', { defaultValue: 'Outcome' })}</span>
        <select className={inputClass} value={outcome} onChange={(e) => setOutcome(e.target.value)}>
          {outcomes.map((o) => <option key={o} value={o}>{closureOutcomeLabel(t, o)}</option>)}
        </select>
      </label>
      {outcome === 'live_birth_complete' ? (
        <label className="flex flex-col gap-1">
          <span className={labelClass}>{t('breeding.field.biologicalDate', { defaultValue: 'Date of the final birth' })}</span>
          <input type="date" className={inputClass} value={biologicalDate} onChange={(e) => setBiologicalDate(e.target.value)} />
        </label>
      ) : null}
      <label className="flex flex-col gap-1">
        <span className={labelClass}>{outcome === 'other' ? t('breeding.field.noteRequired', { defaultValue: 'Note (required)' }) : t('breeding.field.notes', { defaultValue: 'Notes (optional)' })}</span>
        <textarea className={inputClass} rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
    </BreedingDialog>
  );
}

export function PlannedPairingDialog({ cycle, males = [], planned = null, onSubmit, onClose }) {
  const { t } = useTranslation();
  const [maleId, setMaleId] = useState(planned?.maleId || cycle?.males?.[0]?.maleId || '');
  const [date, setDate] = useState(planned?.date || todayYmd());
  const [note, setNote] = useState(planned?.note || '');
  const { busy, error, submit } = useSubmit(onSubmit, onClose);
  return (
    <BreedingDialog
      title={planned ? t('breeding.plannedDialog.rescheduleTitle', { defaultValue: 'Move the planned pairing' }) : t('breeding.plannedDialog.title', { defaultValue: 'Plan a pairing' })}
      subtitle={t('breeding.plannedDialog.subtitle', { defaultValue: 'A planned pairing is a reminder. It is not a session and never counts as a lock.' })}
      onClose={onClose}
      onConfirm={() => submit({ maleId, date, note })}
      busy={busy}
      error={error}
    >
      <label className="flex flex-col gap-1">
        <span className={labelClass}>{t('breeding.field.male', { defaultValue: 'Male' })}</span>
        <AnimalSelect value={maleId} onChange={setMaleId} options={males} placeholder={t('breeding.field.chooseMale', { defaultValue: 'Choose a male' })} disabled={!!planned} />
      </label>
      <label className="flex flex-col gap-1">
        <span className={labelClass}>{t('breeding.field.date', { defaultValue: 'Date' })}</span>
        <input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      {!planned ? (
        <label className="flex flex-col gap-1">
          <span className={labelClass}>{t('breeding.field.notes', { defaultValue: 'Notes (optional)' })}</span>
          <textarea className={inputClass} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      ) : null}
    </BreedingDialog>
  );
}

export function SireAssignmentDialog({ cycle, offspring, snakesById, onSubmit, onClose }) {
  const { t } = useTranslation();
  const current = offspring?.sireAssignment || {};
  const [maleId, setMaleId] = useState(current.maleId || '');
  const [method, setMethod] = useState(current.method && current.method !== 'unresolved' && current.method !== 'single_candidate' ? current.method : 'breeder_assigned');
  const [certainty, setCertainty] = useState(current.certainty && current.certainty !== 'unknown' ? current.certainty : 'reported');
  const [note, setNote] = useState('');
  const { busy, error, submit } = useSubmit(onSubmit, onClose);
  const candidates = (cycle?.males || []).map((m) => snakesById?.get?.(m.maleId) || { id: m.maleId, name: m.maleId });
  return (
    <BreedingDialog
      title={t('breeding.sireDialog.title', { defaultValue: 'Sire of {{name}}', name: animalLabel(snakesById?.get?.(offspring?.animalId), offspring?.animalId) })}
      subtitle={t('breeding.sireDialog.subtitle', { defaultValue: 'Only the card\'s candidate males can be assigned. Leave the sire empty to keep parentage unresolved.' })}
      onClose={onClose}
      onConfirm={() => submit({ maleId: maleId || null, method, certainty, note })}
      busy={busy}
      error={error}
    >
      <label className="flex flex-col gap-1">
        <span className={labelClass}>{t('breeding.field.sire', { defaultValue: 'Sire' })}</span>
        <AnimalSelect value={maleId} onChange={setMaleId} options={candidates} placeholder={t('breeding.sireDialog.unresolved', { defaultValue: 'Unresolved (no sire assigned)' })} />
      </label>
      {maleId ? (
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className={labelClass}>{t('breeding.field.assignmentMethod', { defaultValue: 'Basis' })}</span>
            <select className={inputClass} value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="breeder_assigned">{t('breeding.sireMethod.breederAssigned', { defaultValue: 'Breeder\'s judgement' })}</option>
              <option value="dna_test">{t('breeding.sireMethod.dnaTest', { defaultValue: 'DNA test' })}</option>
              <option value="visual_genetics">{t('breeding.sireMethod.visualGenetics', { defaultValue: 'Visual genetics' })}</option>
              <option value="only_candidate">{t('breeding.sireMethod.onlyCandidate', { defaultValue: 'Only one male was paired' })}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>{t('breeding.field.assignmentCertainty', { defaultValue: 'Certainty' })}</span>
            <select className={inputClass} value={certainty} onChange={(e) => setCertainty(e.target.value)}>
              <option value="reported">{t('breeding.sireCertainty.reported', { defaultValue: 'Reported' })}</option>
              <option value="confirmed">{t('breeding.sireCertainty.confirmed', { defaultValue: 'Confirmed' })}</option>
            </select>
          </label>
        </div>
      ) : null}
      <label className="flex flex-col gap-1">
        <span className={labelClass}>{t('breeding.field.notes', { defaultValue: 'Notes (optional)' })}</span>
        <textarea className={inputClass} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
    </BreedingDialog>
  );
}
