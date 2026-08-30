import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  INTAKE_CHECK_KEYS,
  QUARANTINE_SOURCES,
  QUARANTINE_STATUS,
  TEST_RESULTS,
  addQuarantineCheck,
  addQuarantineTest,
  addQuarantineTreatment,
  applyQuarantineStatus,
  extendQuarantine,
  getDefaultDaysForSource,
  getPlannedDays,
  getQuarantineChecks,
  getQuarantineDays,
  getQuarantineNotes,
  getQuarantineProgress,
  getQuarantineRecord,
  getQuarantineStartDate,
  getQuarantineStatus,
  getQuarantineTests,
  getQuarantineTreatments,
  removeQuarantineCheck,
  removeQuarantineTest,
  removeQuarantineTreatment,
  restartQuarantineClock,
  setQuarantineTestResult,
  todayYmd,
  updateQuarantineDetails,
} from '../../services/quarantine';
import { QUARANTINE_TESTS } from './diagnostics';
import {
  CHECK_FIELD_LABELS,
  CHECK_VALUE_LABELS,
  INTAKE_CHECK_LABELS,
  SOURCE_LABELS,
  SOURCE_NOTES,
  STATUS_LABELS,
  TEST_RESULT_CLASSES,
  TEST_RESULT_LABELS,
  formatYmd,
  makeLabeller,
} from './labels';
import QuickCheckSheet from './QuickCheckSheet';
import CheckGuidanceDialog, { GuidanceButton } from './CheckGuidanceDialog';

// The full record for one animal, shown inside the animal editor. It edits a *draft* — the parent
// owns the state and the save button, exactly like every other field in that modal — so nothing
// here writes until the breeder saves.

const TABS = ['record', 'checks', 'tests', 'history'];

function Field({ label, children, className = '' }) {
  return (
    <label className={`text-xs font-medium text-neutral-600 ${className}`}>
      {label}
      {children}
    </label>
  );
}

function SectionTitle({ children, action }) {
  return (
    <div className="flex items-center justify-between gap-2 mb-1.5">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{children}</div>
      {action}
    </div>
  );
}

function EmptyRow({ children }) {
  return <div className="rounded-xl border border-dashed border-neutral-200 px-3 py-3 text-center text-[11px] text-neutral-400">{children}</div>;
}

export default function QuarantinePanel({ draft, setDraft }) {
  const { t } = useTranslation();
  const label = makeLabeller(t);
  const [tab, setTab] = useState('record');
  const [checkSheetOpen, setCheckSheetOpen] = useState(false);
  const [testDraft, setTestDraft] = useState(null);
  const [treatmentDraft, setTreatmentDraft] = useState(null);
  const [guidanceKey, setGuidanceKey] = useState(null);

  const status = getQuarantineStatus(draft);
  const record = getQuarantineRecord(draft);
  const progress = getQuarantineProgress(draft);
  const days = getQuarantineDays(draft);
  const checks = getQuarantineChecks(draft);
  const tests = getQuarantineTests(draft);
  const treatments = getQuarantineTreatments(draft);
  const history = record.history;

  const patch = (updater) => setDraft(current => updater(current));

  return (
    <div className="p-3 border rounded-xl bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="font-medium text-sm">{t('quarantine.title', { defaultValue: 'Quarantine' })}</div>
        {status === QUARANTINE_STATUS.IN && progress ? (
          <div className="text-xs text-neutral-500 tabular-nums">
            {t('quarantine.dayOfPlanned', { day: days, planned: progress.planned, defaultValue: 'Day {{day}} of {{planned}}' })}
            {progress.dueDate ? ` · ${t('quarantine.dueOn', { date: formatYmd(progress.dueDate), defaultValue: 'due {{date}}' })}` : ''}
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        {[QUARANTINE_STATUS.NONE, QUARANTINE_STATUS.IN, QUARANTINE_STATUS.CLEARED].map(option => {
          const active = status === option;
          return (
            <button
              key={option}
              type="button"
              aria-pressed={active}
              className={`px-3 py-1.5 rounded-xl border text-xs font-medium ${
                active ? 'border-sky-500 bg-sky-500 text-white' : 'bg-white text-neutral-600'
              }`}
              onClick={() => patch(current => applyQuarantineStatus(current, option, { today: todayYmd() }))}
            >
              {label(STATUS_LABELS, option)}
            </button>
          );
        })}
      </div>

      {status === QUARANTINE_STATUS.NONE ? (
        <p className="mt-2 text-xs text-neutral-500">
          {t('quarantine.editorHelp', {
            defaultValue: 'Quarantine is a record only — it never blocks pairing, feeding, selling or anything else.',
          })}
        </p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap gap-1.5 border-b pb-2">
            {TABS.map(key => (
              <button
                key={key}
                type="button"
                aria-pressed={tab === key}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium ${
                  tab === key ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-100'
                }`}
                onClick={() => setTab(key)}
              >
                {t(`quarantine.tab.${key}`, {
                  defaultValue: { record: 'Record', checks: 'Checks', tests: 'Tests', history: 'History' }[key],
                })}
                {key === 'checks' && checks.length ? ` (${checks.length})` : ''}
                {key === 'tests' && tests.length ? ` (${tests.length})` : ''}
              </button>
            ))}
          </div>

          {tab === 'record' ? (
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label={t('quarantine.source', { defaultValue: 'Where it came from' })}>
                <select
                  className="mt-1 w-full border rounded-xl px-2 py-1.5 text-sm bg-white"
                  value={record.source || ''}
                  onChange={event => patch(current => updateQuarantineDetails(current, { source: event.target.value }))}
                >
                  <option value="">{t('quarantine.sourceUnset', { defaultValue: 'Not recorded' })}</option>
                  {QUARANTINE_SOURCES.map(source => (
                    <option key={source.key} value={source.key}>
                      {label(SOURCE_LABELS, source.key)}
                      {source.defaultDays ? ` — ${source.defaultDays}d` : ''}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label={t('quarantine.sourceName', { defaultValue: 'Who from' })}>
                <input
                  type="text"
                  className="mt-1 w-full border rounded-xl px-2 py-1.5 text-sm"
                  value={record.sourceName}
                  placeholder={t('quarantine.sourceNamePlaceholder', { defaultValue: 'Breeder, shop or shipment' })}
                  onChange={event => patch(current => updateQuarantineDetails(current, { sourceName: event.target.value }))}
                />
              </Field>

              {record.source ? (
                <p className="sm:col-span-2 -mt-1 text-[11px] text-neutral-500">{label(SOURCE_NOTES, record.source, '')}</p>
              ) : null}

              <Field label={t('quarantine.startedAt', { defaultValue: 'Started' })}>
                <input
                  type="date"
                  className="mt-1 w-full border rounded-xl px-2 py-1.5 text-sm"
                  value={getQuarantineStartDate(draft) || ''}
                  onChange={event => patch(current => updateQuarantineDetails(current, { startedAt: event.target.value || null }))}
                />
              </Field>

              <Field label={t('quarantine.plannedDays', { defaultValue: 'Planned length (days)' })}>
                <input
                  type="number"
                  min="1"
                  className="mt-1 w-full border rounded-xl px-2 py-1.5 text-sm"
                  value={getPlannedDays(draft) || ''}
                  placeholder={record.source ? String(getDefaultDaysForSource(record.source)) : '90'}
                  onChange={event => patch(current => updateQuarantineDetails(current, { plannedDays: Number(event.target.value) || null }))}
                />
              </Field>

              {status === QUARANTINE_STATUS.CLEARED ? (
                <Field label={t('quarantine.clearedAt', { defaultValue: 'Cleared' })}>
                  <input
                    type="date"
                    className="mt-1 w-full border rounded-xl px-2 py-1.5 text-sm"
                    value={record.clearedAt || ''}
                    onChange={event => patch(current => updateQuarantineDetails(current, { clearedAt: event.target.value || null }))}
                  />
                </Field>
              ) : null}

              <Field label={t('quarantine.intakeWeight', { defaultValue: 'Intake weight (g)' })}>
                <input
                  type="number"
                  className="mt-1 w-full border rounded-xl px-2 py-1.5 text-sm"
                  value={record.intakeWeight || ''}
                  onChange={event => patch(current => updateQuarantineDetails(current, { intakeWeight: Number(event.target.value) || null }))}
                />
              </Field>

              <div className="sm:col-span-2">
                <SectionTitle
                  action={(
                    <button
                      type="button"
                      className="rounded-xl border px-2.5 py-1 text-[11px] text-neutral-600"
                      onClick={() => setGuidanceKey('mites')}
                    >
                      {t('quarantine.guide.showAll', { defaultValue: 'What to check' })}
                    </button>
                  )}
                >
                  {t('quarantine.intakeChecklist', { defaultValue: 'Intake check' })}
                </SectionTitle>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {INTAKE_CHECK_KEYS.map(key => {
                    const value = record.intakeChecks?.[key] || 'unchecked';
                    return (
                      <div key={key} className="flex items-center justify-between gap-2 rounded-xl border px-2.5 py-1.5">
                        <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-neutral-600">
                          <span className="truncate">{label(INTAKE_CHECK_LABELS, key)}</span>
                          <GuidanceButton checkKey={key} onOpen={setGuidanceKey} />
                        </span>
                        <span className="flex shrink-0 gap-1">
                          {['pass', 'flag'].map(option => (
                            <button
                              key={option}
                              type="button"
                              aria-pressed={value === option}
                              className={`rounded-lg border px-2 py-0.5 text-[10px] font-semibold ${
                                value === option
                                  ? (option === 'pass'
                                    ? 'border-emerald-500 bg-emerald-500 text-white'
                                    : 'border-amber-500 bg-amber-500 text-white')
                                  : 'bg-white text-neutral-500'
                              }`}
                              onClick={() => patch(current => updateQuarantineDetails(current, {
                                intakeChecks: { ...(record.intakeChecks || {}), [key]: value === option ? 'unchecked' : option },
                              }))}
                            >
                              {option === 'pass'
                                ? t('quarantine.intakePass', { defaultValue: 'OK' })
                                : t('quarantine.intakeFlag', { defaultValue: 'Flag' })}
                            </button>
                          ))}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <Field className="sm:col-span-2" label={t('quarantine.notes', { defaultValue: 'Notes' })}>
                <textarea
                  rows={2}
                  className="mt-1 w-full border rounded-xl px-2 py-1.5 text-sm"
                  placeholder={t('quarantine.notesPlaceholder', { defaultValue: 'Source, observations, treatments…' })}
                  value={getQuarantineNotes(draft)}
                  onChange={event => patch(current => updateQuarantineDetails(current, { notes: event.target.value }))}
                />
              </Field>

              {status === QUARANTINE_STATUS.IN ? (
                <div className="sm:col-span-2 flex flex-wrap gap-1.5 border-t pt-3">
                  <button
                    type="button"
                    className="rounded-xl border px-3 py-1.5 text-xs"
                    onClick={() => patch(current => restartQuarantineClock(current, { today: todayYmd(), reason: t('quarantine.restartedManually', { defaultValue: 'Restarted from the animal record' }) }))}
                  >
                    {t('quarantine.restartClock', { defaultValue: 'Restart clock' })}
                  </button>
                  {[14, 30].map(extra => (
                    <button
                      key={extra}
                      type="button"
                      className="rounded-xl border px-3 py-1.5 text-xs"
                      onClick={() => patch(current => extendQuarantine(current, extra, { today: todayYmd() }))}
                    >
                      {t('quarantine.extendBy', { count: extra, defaultValue: 'Extend +{{count}} days' })}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {tab === 'checks' ? (
            <div className="mt-3 flex flex-col gap-2">
              <SectionTitle
                action={(
                  <button
                    type="button"
                    className="rounded-xl bg-sky-500 px-3 py-1.5 text-xs font-semibold text-white"
                    onClick={() => setCheckSheetOpen(true)}
                  >
                    {t('quarantine.logCheck', { defaultValue: 'Log check' })}
                  </button>
                )}
              >
                {t('quarantine.checksTitle', { defaultValue: 'Observation checks' })}
              </SectionTitle>
              {checks.length ? [...checks].reverse().map(check => (
                <div key={check.id} className="rounded-xl border px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium">{formatYmd(check.date)}</span>
                    <span className="flex items-center gap-2">
                      {check.weightGrams ? <span className="text-[11px] tabular-nums text-neutral-600">{check.weightGrams} g</span> : null}
                      <button
                        type="button"
                        className="text-[11px] text-neutral-400 hover:text-rose-600"
                        onClick={() => patch(current => removeQuarantineCheck(current, check.id))}
                      >
                        {t('actions.delete', { defaultValue: 'Delete' })}
                      </button>
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {Object.keys(CHECK_FIELD_LABELS).map(key => {
                      const value = check[key];
                      const ok = value === 'none' || value === 'normal' || value === 'shed-clean';
                      return (
                        <span
                          key={key}
                          className={`rounded-full border px-2 py-0.5 text-[10px] ${
                            ok ? 'border-neutral-200 bg-neutral-50 text-neutral-500' : 'border-amber-200 bg-amber-50 text-amber-700 font-semibold'
                          }`}
                        >
                          {label(CHECK_FIELD_LABELS, key)}: {label(CHECK_VALUE_LABELS, value, value)}
                        </span>
                      );
                    })}
                  </div>
                  {check.notes ? <p className="mt-1 text-[11px] text-neutral-600">{check.notes}</p> : null}
                </div>
              )) : <EmptyRow>{t('quarantine.noChecks', { defaultValue: 'No checks logged yet.' })}</EmptyRow>}
            </div>
          ) : null}

          {tab === 'tests' ? (
            <div className="mt-3 flex flex-col gap-3">
              <div className="flex flex-col gap-2">
                <SectionTitle
                  action={(
                    <button
                      type="button"
                      className="rounded-xl border px-3 py-1.5 text-xs"
                      onClick={() => setTestDraft({ date: todayYmd(), kind: QUARANTINE_TESTS[0].name, lab: '', result: 'pending', notes: '' })}
                    >
                      {t('quarantine.addTest', { defaultValue: 'Log test' })}
                    </button>
                  )}
                >
                  {t('quarantine.testsTitle', { defaultValue: 'Tests' })}
                </SectionTitle>

                {testDraft ? (
                  <div className="rounded-xl border bg-neutral-50 p-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <Field label={t('quarantine.date', { defaultValue: 'Date' })}>
                      <input type="date" className="mt-1 w-full border rounded-xl px-2 py-1.5 text-sm" value={testDraft.date}
                        onChange={event => setTestDraft(prev => ({ ...prev, date: event.target.value }))} />
                    </Field>
                    <Field label={t('quarantine.testKind', { defaultValue: 'Test' })}>
                      <select className="mt-1 w-full border rounded-xl px-2 py-1.5 text-sm bg-white" value={testDraft.kind}
                        onChange={event => setTestDraft(prev => ({ ...prev, kind: event.target.value }))}>
                        {QUARANTINE_TESTS.map(test => <option key={test.key} value={test.name}>{test.name}</option>)}
                      </select>
                    </Field>
                    <Field label={t('quarantine.lab', { defaultValue: 'Vet or laboratory' })}>
                      <input type="text" className="mt-1 w-full border rounded-xl px-2 py-1.5 text-sm" value={testDraft.lab}
                        onChange={event => setTestDraft(prev => ({ ...prev, lab: event.target.value }))} />
                    </Field>
                    <Field label={t('quarantine.result', { defaultValue: 'Result' })}>
                      <select className="mt-1 w-full border rounded-xl px-2 py-1.5 text-sm bg-white" value={testDraft.result}
                        onChange={event => setTestDraft(prev => ({ ...prev, result: event.target.value }))}>
                        {TEST_RESULTS.map(result => <option key={result} value={result}>{label(TEST_RESULT_LABELS, result)}</option>)}
                      </select>
                    </Field>
                    <div className="sm:col-span-2 flex gap-2">
                      <button type="button" className="rounded-xl bg-sky-500 px-3 py-1.5 text-xs font-semibold text-white"
                        onClick={() => { patch(current => addQuarantineTest(current, testDraft)); setTestDraft(null); }}>
                        {t('common.save', { defaultValue: 'Save' })}
                      </button>
                      <button type="button" className="rounded-xl border px-3 py-1.5 text-xs" onClick={() => setTestDraft(null)}>
                        {t('common.cancel', { defaultValue: 'Cancel' })}
                      </button>
                    </div>
                  </div>
                ) : null}

                {tests.length ? [...tests].reverse().map(test => (
                  <div key={test.id} className="rounded-xl border px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-medium">{test.kind}</span>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${TEST_RESULT_CLASSES[test.result]}`}>
                        {label(TEST_RESULT_LABELS, test.result)}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-neutral-500">
                      {formatYmd(test.date)}{test.lab ? ` · ${test.lab}` : ''}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {test.result === 'pending'
                        ? TEST_RESULTS.filter(result => result !== 'pending').map(result => (
                          <button
                            key={result}
                            type="button"
                            className="rounded-lg border px-2 py-0.5 text-[10px] font-medium"
                            onClick={() => patch(current => setQuarantineTestResult(current, test.id, result, { today: todayYmd() }))}
                          >
                            {label(TEST_RESULT_LABELS, result)}
                          </button>
                        ))
                        : null}
                      <button
                        type="button"
                        className="ml-auto text-[11px] text-neutral-400 hover:text-rose-600"
                        onClick={() => patch(current => removeQuarantineTest(current, test.id))}
                      >
                        {t('actions.delete', { defaultValue: 'Delete' })}
                      </button>
                    </div>
                  </div>
                )) : <EmptyRow>{t('quarantine.noTests', { defaultValue: 'No tests logged yet.' })}</EmptyRow>}
              </div>

              <div className="flex flex-col gap-2 border-t pt-3">
                <SectionTitle
                  action={(
                    <button
                      type="button"
                      className="rounded-xl border px-3 py-1.5 text-xs"
                      onClick={() => setTreatmentDraft({ date: todayYmd(), what: '', dose: '', reason: '' })}
                    >
                      {t('quarantine.addTreatment', { defaultValue: 'Log treatment' })}
                    </button>
                  )}
                >
                  {t('quarantine.treatmentsTitle', { defaultValue: 'Treatments' })}
                </SectionTitle>

                {treatmentDraft ? (
                  <div className="rounded-xl border bg-neutral-50 p-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <Field label={t('quarantine.date', { defaultValue: 'Date' })}>
                      <input type="date" className="mt-1 w-full border rounded-xl px-2 py-1.5 text-sm" value={treatmentDraft.date}
                        onChange={event => setTreatmentDraft(prev => ({ ...prev, date: event.target.value }))} />
                    </Field>
                    <Field label={t('quarantine.treatmentWhat', { defaultValue: 'What was given' })}>
                      <input type="text" className="mt-1 w-full border rounded-xl px-2 py-1.5 text-sm" value={treatmentDraft.what}
                        onChange={event => setTreatmentDraft(prev => ({ ...prev, what: event.target.value }))} />
                    </Field>
                    <Field label={t('quarantine.treatmentDose', { defaultValue: 'Dose' })}>
                      <input type="text" className="mt-1 w-full border rounded-xl px-2 py-1.5 text-sm" value={treatmentDraft.dose}
                        onChange={event => setTreatmentDraft(prev => ({ ...prev, dose: event.target.value }))} />
                    </Field>
                    <Field label={t('quarantine.treatmentReason', { defaultValue: 'Reason' })}>
                      <input type="text" className="mt-1 w-full border rounded-xl px-2 py-1.5 text-sm" value={treatmentDraft.reason}
                        onChange={event => setTreatmentDraft(prev => ({ ...prev, reason: event.target.value }))} />
                    </Field>
                    <div className="sm:col-span-2 flex flex-wrap gap-2 items-center">
                      <button type="button" className="rounded-xl bg-sky-500 px-3 py-1.5 text-xs font-semibold text-white"
                        onClick={() => { patch(current => addQuarantineTreatment(current, treatmentDraft)); setTreatmentDraft(null); }}>
                        {t('common.save', { defaultValue: 'Save' })}
                      </button>
                      <button type="button" className="rounded-xl border px-3 py-1.5 text-xs" onClick={() => setTreatmentDraft(null)}>
                        {t('common.cancel', { defaultValue: 'Cancel' })}
                      </button>
                      <span className="text-[11px] text-neutral-500">
                        {t('quarantine.treatmentRestartHint', { defaultValue: 'Treated for mites? Consider restarting the clock afterwards.' })}
                      </span>
                    </div>
                  </div>
                ) : null}

                {treatments.length ? [...treatments].reverse().map(treatment => (
                  <div key={treatment.id} className="rounded-xl border px-3 py-2 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-medium">{treatment.what}{treatment.dose ? ` · ${treatment.dose}` : ''}</div>
                      <div className="text-[11px] text-neutral-500">
                        {formatYmd(treatment.date)}{treatment.reason ? ` · ${treatment.reason}` : ''}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="shrink-0 text-[11px] text-neutral-400 hover:text-rose-600"
                      onClick={() => patch(current => removeQuarantineTreatment(current, treatment.id))}
                    >
                      {t('actions.delete', { defaultValue: 'Delete' })}
                    </button>
                  </div>
                )) : <EmptyRow>{t('quarantine.noTreatments', { defaultValue: 'No treatments logged.' })}</EmptyRow>}
              </div>
            </div>
          ) : null}

          {tab === 'history' ? (
            <div className="mt-3 flex flex-col gap-1.5">
              {history.length ? [...history].reverse().map(entry => (
                <div key={entry.id} className="flex items-start gap-2 text-[11px]">
                  <span className="tabular-nums text-neutral-400 shrink-0 w-24">{formatYmd(entry.date)}</span>
                  <span className="text-neutral-700">
                    {t(`quarantine.historyTo.${entry.to}`, {
                      defaultValue: {
                        in: 'Entered quarantine',
                        cleared: 'Cleared',
                        restarted: 'Clock restarted',
                        extended: 'Extended',
                      }[entry.to] || entry.to,
                    })}
                    {entry.note ? <span className="text-neutral-500"> — {entry.note}</span> : null}
                  </span>
                </div>
              )) : <EmptyRow>{t('quarantine.noHistory', { defaultValue: 'Nothing recorded yet.' })}</EmptyRow>}
            </div>
          ) : null}
        </>
      )}

      {checkSheetOpen ? (
        <QuickCheckSheet
          snake={draft}
          onSave={entry => patch(current => addQuarantineCheck(current, entry))}
          onClose={() => setCheckSheetOpen(false)}
        />
      ) : null}

      {guidanceKey ? (
        <CheckGuidanceDialog checkKey={guidanceKey} onClose={() => setGuidanceKey(null)} />
      ) : null}
    </div>
  );
}
