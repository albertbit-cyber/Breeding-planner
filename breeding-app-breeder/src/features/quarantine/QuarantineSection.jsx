import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  QUARANTINE_STATUS,
  addQuarantineCheck,
  applyQuarantineStatus,
  getNextQuarantineAction,
  getOpenQuarantineFlags,
  getQuarantineClearedDate,
  getQuarantineDays,
  getQuarantineNotes,
  getQuarantineProgress,
  getQuarantineStartDate,
  getQuarantineStatus,
  getWeightChangeSinceIntake,
  restartQuarantineClock,
  selectQuarantineAnimals,
  summarizeQuarantine,
  todayYmd,
} from '../../services/quarantine';
import {
  CHECK_FIELD_LABELS,
  CHECK_VALUE_LABELS,
  DISCLAIMER_LINE,
  FLAG_DISCLAIMER,
  SOURCE_LABELS,
  formatYmd,
  makeLabeller,
  sexSymbol,
  translateTuple,
} from './labels';
import QuickCheckSheet from './QuickCheckSheet';
import ClearanceDialog from './ClearanceDialog';
import DiagnosticsReference from './DiagnosticsReference';
import QuarantineNotice from './QuarantineNotice';
import HousingPanel from './HousingPanel';

// The quarantine section is a record book, not a gate. Nothing here prevents a breeder from
// pairing, selling, feeding or moving an animal — it keeps track of what is where, for how long,
// and what was seen, and every value stays editable.

function SummaryTile({ value, label, tone = 'neutral' }) {
  const tones = {
    neutral: 'border-neutral-200 bg-white text-neutral-900',
    watch: 'border-amber-200 bg-amber-50 text-amber-800',
    info: 'border-sky-200 bg-sky-50 text-sky-800',
    alert: 'border-rose-200 bg-rose-50 text-rose-800',
  };
  return (
    <div className={`rounded-2xl border p-3 text-center shadow-sm ${tones[tone]}`}>
      <div className="text-2xl font-semibold leading-none tabular-nums">{value}</div>
      <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide opacity-75">{label}</div>
    </div>
  );
}

function ProgressBar({ ratio, overdue }) {
  const pct = Math.round((ratio ?? 0) * 100);
  return (
    <div
      className="h-1.5 w-full rounded-full bg-neutral-150 overflow-hidden"
      style={{ background: '#e8ebe9' }}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={`h-full rounded-full transition-[width] ${overdue ? 'bg-emerald-500' : 'bg-amber-500'}`}
        style={{ width: `${Math.max(2, pct)}%` }}
      />
    </div>
  );
}

function NextActionLine({ action }) {
  const { t } = useTranslation();
  if (!action) return null;
  const map = {
    'awaiting-results': ['quarantine.next.awaiting', 'Awaiting {{count}} test result(s)'],
    'fecal-due': ['quarantine.next.fecalDue', 'Faecal sample due'],
    'fecal-soon': ['quarantine.next.fecalSoon', 'Faecal due in {{count}} days'],
    'check-due': ['quarantine.next.checkDue', 'Weekly check due'],
    'check-soon': ['quarantine.next.checkSoon', 'Next check in {{count}} days'],
  };
  const entry = map[action.kind];
  if (!entry) return null;
  const urgent = action.kind === 'fecal-due' || action.kind === 'check-due';
  const count = action.kind === 'awaiting-results' ? action.count : Math.abs(action.inDays ?? 0);
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${urgent ? 'text-amber-700' : 'text-neutral-500'}`}>
      <span aria-hidden="true">{urgent ? '●' : '○'}</span>
      {t(entry[0], { count, defaultValue: entry[1] })}
    </span>
  );
}

function QuarantineCard({ snake, onCheck, onClear, onEnter, onRestart, onRemove, onOpenAnimal }) {
  const { t } = useTranslation();
  const label = makeLabeller(t);
  const [menuOpen, setMenuOpen] = useState(false);

  const status = getQuarantineStatus(snake);
  const inQuarantine = status === QUARANTINE_STATUS.IN;
  const days = getQuarantineDays(snake);
  const progress = getQuarantineProgress(snake);
  const action = getNextQuarantineAction(snake);
  const flags = getOpenQuarantineFlags(snake);
  const weight = getWeightChangeSinceIntake(snake);
  const notes = getQuarantineNotes(snake);
  const record = snake?.quarantine || {};

  return (
    <div className="rounded-2xl border bg-white shadow-sm overflow-hidden flex flex-col">
      <div className="p-3 flex flex-col gap-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <button
              type="button"
              className="text-left text-sm font-semibold text-neutral-900 hover:underline truncate max-w-full"
              onClick={() => onOpenAnimal?.(snake)}
            >
              {snake.name || snake.id || t('quarantine.unnamed', { defaultValue: 'Unnamed' })}
            </button>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-neutral-500">
              <span aria-hidden="true">{sexSymbol(snake.sex)}</span>
              {snake.id ? <span className="truncate font-mono">{snake.id}</span> : null}
              {record.source ? <span className="truncate">{label(SOURCE_LABELS, record.source)}</span> : null}
              {record.sourceName ? <span className="truncate">· {record.sourceName}</span> : null}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className={`text-sm font-semibold tabular-nums ${inQuarantine ? 'text-amber-700' : 'text-emerald-700'}`}>
              {days === null
                ? t('quarantine.noStartDate', { defaultValue: 'No start date' })
                : (progress
                  ? t('quarantine.dayOfPlanned', { day: days, planned: progress.planned, defaultValue: 'Day {{day}} of {{planned}}' })
                  : t('quarantine.dayCount', { count: days, defaultValue: 'Day {{count}}' }))}
            </div>
            {!inQuarantine && getQuarantineClearedDate(snake) ? (
              <div className="text-[10px] text-neutral-500">
                {t('quarantine.clearedOn', { date: formatYmd(getQuarantineClearedDate(snake)), defaultValue: 'Cleared {{date}}' })}
              </div>
            ) : null}
          </div>
        </div>

        {progress ? <ProgressBar ratio={progress.ratio} overdue={progress.remaining <= 0} /> : null}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {inQuarantine ? <NextActionLine action={action} /> : null}
          {weight ? (
            <span className={`text-[11px] font-medium ${weight.delta >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
              {weight.delta >= 0 ? '+' : ''}{weight.delta} g {t('quarantine.sinceIntake', { defaultValue: 'since intake' })}
            </span>
          ) : null}
          {getQuarantineStartDate(snake) ? (
            <span className="text-[11px] text-neutral-400">
              {t('quarantine.startedOn', { date: formatYmd(getQuarantineStartDate(snake)), defaultValue: 'from {{date}}' })}
            </span>
          ) : null}
        </div>

        {flags.length ? (
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap gap-1.5">
              {flags.map((flag, index) => (
                <span
                  key={`${flag.kind}-${flag.field}-${index}`}
                  className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700"
                >
                  {flag.kind === 'test'
                    ? t('quarantine.flagTest', { kind: flag.field, defaultValue: '{{kind}} positive' })
                    : `${label(CHECK_FIELD_LABELS, flag.field)}: ${label(CHECK_VALUE_LABELS, flag.value, flag.value)}`}
                  <span className="font-normal opacity-70">{formatYmd(flag.date)}</span>
                </span>
              ))}
            </div>
            {/* Sits directly under the finding, where someone is most tempted to reach their own
                conclusion about what it means. */}
            <p className="text-[11px] text-rose-800">{translateTuple(t, FLAG_DISCLAIMER)}</p>
          </div>
        ) : null}

        {notes ? (
          <p className="whitespace-pre-wrap break-words rounded-xl bg-neutral-50 p-2 text-[11px] text-neutral-600">{notes}</p>
        ) : null}
      </div>

      <div className="mt-auto border-t bg-neutral-50 p-2 flex flex-wrap items-center gap-1.5">
        {inQuarantine ? (
          <>
            <button
              type="button"
              className="rounded-xl bg-sky-500 px-3 py-1.5 text-xs font-semibold text-white"
              onClick={() => onCheck?.(snake)}
            >
              {t('quarantine.logCheck', { defaultValue: 'Log check' })}
            </button>
            <button
              type="button"
              className="rounded-xl border border-emerald-200 bg-white px-3 py-1.5 text-xs font-medium text-emerald-700"
              onClick={() => onClear?.(snake)}
            >
              {t('quarantine.markCleared', { defaultValue: 'Mark cleared' })}
            </button>
          </>
        ) : (
          <button
            type="button"
            className="rounded-xl border border-amber-200 bg-white px-3 py-1.5 text-xs font-medium text-amber-700"
            onClick={() => onEnter?.(snake)}
          >
            {t('quarantine.putBack', { defaultValue: 'Back into quarantine' })}
          </button>
        )}
        <div className="relative ml-auto">
          <button
            type="button"
            className="rounded-xl border bg-white px-2.5 py-1.5 text-xs"
            aria-haspopup="true"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(open => !open)}
          >
            ⋯
          </button>
          {menuOpen ? (
            <>
              <div className="fixed inset-0 z-10" role="presentation" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 bottom-full z-20 mb-1 w-56 rounded-xl border bg-white py-1 shadow-lg">
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-xs hover:bg-neutral-50"
                  onClick={() => { setMenuOpen(false); onOpenAnimal?.(snake); }}
                >
                  {t('quarantine.openAnimal', { defaultValue: 'Open animal' })}
                </button>
                {inQuarantine ? (
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left text-xs hover:bg-neutral-50"
                    onClick={() => { setMenuOpen(false); onRestart?.(snake); }}
                  >
                    {t('quarantine.restartClock', { defaultValue: 'Restart clock…' })}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-xs text-neutral-500 hover:bg-neutral-50"
                  onClick={() => { setMenuOpen(false); onRemove?.(snake); }}
                >
                  {t('quarantine.removeRecord', { defaultValue: 'Remove record' })}
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function QuarantineSection({
  snakes = [],
  onUpdateSnake,
  onOpenAnimal,
  showAppPrompt,
  spaces,
  onMoveToQuarantine,
  onOpenSpaces,
}) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState(QUARANTINE_STATUS.IN);
  const [checkTarget, setCheckTarget] = useState(null);
  const [clearTarget, setClearTarget] = useState(null);
  const [referenceOpen, setReferenceOpen] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);

  const summary = useMemo(() => summarizeQuarantine(snakes), [snakes]);
  const counts = useMemo(() => ({
    [QUARANTINE_STATUS.IN]: summary.inQuarantine,
    [QUARANTINE_STATUS.CLEARED]: selectQuarantineAnimals(snakes, QUARANTINE_STATUS.CLEARED).length,
    all: selectQuarantineAnimals(snakes, 'all').length,
  }), [snakes, summary.inQuarantine]);

  const visible = useMemo(() => selectQuarantineAnimals(snakes, filter), [snakes, filter]);

  const handleEnter = useCallback((snake) => {
    onUpdateSnake?.(snake.id, current => applyQuarantineStatus(current, QUARANTINE_STATUS.IN, { today: todayYmd() }));
  }, [onUpdateSnake]);

  const handleClearConfirmed = useCallback((snake, note) => {
    onUpdateSnake?.(snake.id, current => applyQuarantineStatus(current, QUARANTINE_STATUS.CLEARED, { today: todayYmd(), note }));
  }, [onUpdateSnake]);

  const handleRemove = useCallback((snake) => {
    onUpdateSnake?.(snake.id, current => applyQuarantineStatus(current, QUARANTINE_STATUS.NONE, { today: todayYmd() }));
  }, [onUpdateSnake]);

  const handleSaveCheck = useCallback((snake, draft) => {
    onUpdateSnake?.(snake.id, current => addQuarantineCheck(current, draft));
  }, [onUpdateSnake]);

  const handleRestart = useCallback(async (snake) => {
    const reason = typeof showAppPrompt === 'function'
      ? await showAppPrompt(t('quarantine.restartReasonPrompt', { defaultValue: 'Why is the clock restarting? (e.g. mites treated)' }), '')
      : '';
    if (reason === null) return;
    onUpdateSnake?.(snake.id, current => restartQuarantineClock(current, { today: todayYmd(), reason }));
  }, [onUpdateSnake, showAppPrompt, t]);

  const filters = [
    { key: QUARANTINE_STATUS.IN, label: t('quarantine.filterIn', { defaultValue: 'In quarantine' }), count: counts[QUARANTINE_STATUS.IN] },
    { key: QUARANTINE_STATUS.CLEARED, label: t('quarantine.filterCleared', { defaultValue: 'Cleared' }), count: counts[QUARANTINE_STATUS.CLEARED] },
    { key: 'all', label: t('quarantine.filterAll', { defaultValue: 'All' }), count: counts.all },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold">{t('quarantine.title', { defaultValue: 'Quarantine' })}</h2>
            <p className="mt-0.5 text-xs text-neutral-500 max-w-prose">
              {t('quarantine.intro', {
                defaultValue: 'Animals tagged Quarantine appear here. Records and reminders only — nothing in the app is blocked.',
              })}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              className="rounded-xl border px-3 py-1.5 text-xs font-medium text-neutral-600"
              onClick={() => setNoticeOpen(true)}
            >
              {t('quarantine.notice.open', { defaultValue: 'Read the notice' })}
            </button>
            <button
              type="button"
              className="rounded-xl border px-3 py-1.5 text-xs font-medium text-neutral-600"
              aria-expanded={referenceOpen}
              onClick={() => setReferenceOpen(open => !open)}
            >
              {t('quarantine.diag.toggle', { defaultValue: 'Tests & laboratories' })}
            </button>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
          <SummaryTile value={summary.inQuarantine} label={t('quarantine.tile.in', { defaultValue: 'In quarantine' })} />
          <SummaryTile value={summary.checkDue} tone={summary.checkDue ? 'watch' : 'neutral'} label={t('quarantine.tile.due', { defaultValue: 'Check due' })} />
          <SummaryTile value={summary.awaitingResults} tone={summary.awaitingResults ? 'info' : 'neutral'} label={t('quarantine.tile.awaiting', { defaultValue: 'Awaiting results' })} />
          <SummaryTile value={summary.flagged} tone={summary.flagged ? 'alert' : 'neutral'} label={t('quarantine.tile.flagged', { defaultValue: 'Flagged' })} />
        </div>

        {summary.inQuarantine > 0 ? (
          <p className="mt-3 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-[11px] text-neutral-600">
            {t('quarantine.serviceLast', {
              defaultValue: 'Service quarantine last — after the rest of the collection — and keep its tools, tongs and cleaning kit separate.',
            })}
          </p>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-2">
          {filters.map(option => (
            <button
              key={option.key}
              type="button"
              className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === option.key ? 'border-sky-500 bg-sky-500 text-white' : 'bg-white text-neutral-600'
              }`}
              aria-pressed={filter === option.key}
              onClick={() => setFilter(option.key)}
            >
              {option.label} ({option.count})
            </button>
          ))}
        </div>
      </div>

      <HousingPanel
        snakes={snakes}
        spaces={spaces}
        onMoveToQuarantine={onMoveToQuarantine}
        onOpenSpaces={onOpenSpaces}
      />

      {referenceOpen ? <DiagnosticsReference /> : null}

      {visible.length ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map(snake => (
            <QuarantineCard
              key={snake.id}
              snake={snake}
              onCheck={setCheckTarget}
              onClear={setClearTarget}
              onEnter={handleEnter}
              onRestart={handleRestart}
              onRemove={handleRemove}
              onOpenAnimal={onOpenAnimal}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border bg-white p-6 text-center text-sm text-neutral-500 shadow-sm">
          {filter === QUARANTINE_STATUS.IN
            ? t('quarantine.emptyIn', { defaultValue: 'No animals are in quarantine right now.' })
            : filter === QUARANTINE_STATUS.CLEARED
              ? t('quarantine.emptyCleared', { defaultValue: 'No animals have been cleared yet.' })
              : t('quarantine.emptyAll', { defaultValue: 'No quarantine records yet.' })}
          <p className="mt-1 text-xs text-neutral-400">
            {t('quarantine.emptyHelp', {
              defaultValue: 'Tick “newly acquired animal” when adding an animal, or set an animal’s tag to Quarantine.',
            })}
          </p>
        </div>
      )}

      {checkTarget ? (
        <QuickCheckSheet
          snake={checkTarget}
          onSave={draft => handleSaveCheck(checkTarget, draft)}
          onClose={() => setCheckTarget(null)}
        />
      ) : null}

      {clearTarget ? (
        <ClearanceDialog
          snake={clearTarget}
          onConfirm={note => handleClearConfirmed(clearTarget, note)}
          onClose={() => setClearTarget(null)}
        />
      ) : null}

      {noticeOpen ? <QuarantineNotice mode="reference" onClose={() => setNoticeOpen(false)} /> : null}

      <p className="px-1 text-[11px] text-neutral-400">{translateTuple(t, DISCLAIMER_LINE)}</p>
    </div>
  );
}
