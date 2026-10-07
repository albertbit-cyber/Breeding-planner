import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchFemaleReproductiveProfile } from '../../shared/apiClient';
import { help } from '../help/help';

// ── Utility ───────────────────────────────────────────────────────────────────

function formatDate(str) {
  if (!str) return '—';
  const d = new Date(str + 'T00:00:00');
  return isNaN(d.getTime()) ? str : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function daysFromToday(str) {
  if (!str) return null;
  const target = new Date(str + 'T00:00:00');
  const today  = new Date(); today.setHours(0,0,0,0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

// ── Confidence badge ──────────────────────────────────────────────────────────

const CONFIDENCE_STYLES = {
  none:   'bg-neutral-100 text-neutral-500 border-neutral-200',
  low:    'bg-amber-50   text-amber-700   border-amber-200',
  medium: 'bg-sky-50     text-sky-700     border-sky-200',
  high:   'bg-emerald-50 text-emerald-700 border-emerald-200',
};

function ConfidenceBadge({ level }) {
  const { t } = useTranslation();
  const label = {
    none: t('reproIntel.confidence.none', { defaultValue: 'No data' }),
    low: t('reproIntel.confidence.low', { defaultValue: 'Low confidence' }),
    medium: t('reproIntel.confidence.medium', { defaultValue: 'Medium confidence' }),
    high: t('reproIntel.confidence.high', { defaultValue: 'High confidence' }),
  }[level] ?? level;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${CONFIDENCE_STYLES[level] ?? CONFIDENCE_STYLES.none}`}>
      {label}
    </span>
  );
}

// ── Pattern tags ──────────────────────────────────────────────────────────────

const PATTERN_LABELS = {
  early_ovulator:    { label: 'Early ovulator',     color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  late_ovulator:     { label: 'Late ovulator',      color: 'bg-rose-50    text-rose-700    border-rose-200'    },
  frequent_locker:   { label: 'Frequent locker',    color: 'bg-violet-50  text-violet-700  border-violet-200'  },
  infrequent_locker: { label: 'Infrequent locker',  color: 'bg-amber-50   text-amber-700   border-amber-200'   },
  consistent:        { label: 'Consistent timing',  color: 'bg-sky-50     text-sky-700     border-sky-200'     },
  variable:          { label: 'Variable timing',    color: 'bg-orange-50  text-orange-700  border-orange-200'  },
};

const patternLabel = (t, tag) => ({
  early_ovulator: t('reproIntel.pattern.earlyOvulator', { defaultValue: 'Early ovulator' }),
  late_ovulator: t('reproIntel.pattern.lateOvulator', { defaultValue: 'Late ovulator' }),
  frequent_locker: t('reproIntel.pattern.frequentLocker', { defaultValue: 'Frequent locker' }),
  infrequent_locker: t('reproIntel.pattern.infrequentLocker', { defaultValue: 'Infrequent locker' }),
  consistent: t('reproIntel.pattern.consistent', { defaultValue: 'Consistent timing' }),
  variable: t('reproIntel.pattern.variable', { defaultValue: 'Variable timing' }),
}[tag]);

function PatternTag({ tag }) {
  const { t } = useTranslation();
  const cfg = PATTERN_LABELS[tag] ?? { label: tag, color: 'bg-neutral-100 text-neutral-600 border-neutral-200' };
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${cfg.color}`}>
      {patternLabel(t, tag) ?? cfg.label}
    </span>
  );
}

// ── Prediction window card ────────────────────────────────────────────────────

function PredictionCard({ title, window: win, source }) {
  const { t } = useTranslation();
  if (!win) return null;
  const earliestDays = daysFromToday(win.earliest);
  const avgDays = daysFromToday(win.average);
  const latestDays = daysFromToday(win.latest);
  const urgency = avgDays !== null && avgDays <= 7 ? 'border-rose-200 bg-rose-50' : 'border-violet-100 bg-violet-50/60';

  let barLeftPct = null;
  let barWidthPct = null;
  let avgPct = null;
  if (earliestDays !== null && latestDays !== null && latestDays > earliestDays) {
    const axisStart = Math.min(0, earliestDays);
    const axisEnd = Math.max(latestDays, axisStart + 1);
    const span = axisEnd - axisStart;
    barLeftPct = ((earliestDays - axisStart) / span) * 100;
    barWidthPct = ((latestDays - earliestDays) / span) * 100;
    avgPct = avgDays !== null ? ((avgDays - axisStart) / span) * 100 : null;
  }

  return (
    <div className={`rounded-xl border p-3 ${urgency}`}>
      <div className="text-[10px] font-semibold uppercase tracking-widest text-violet-500 mb-1">{title}</div>
      {barLeftPct !== null && (
        <div className="relative h-2.5 rounded-full bg-violet-100 overflow-hidden mb-2">
          <div
            className="absolute inset-y-0 rounded-full bg-violet-400"
            style={{ left: `${barLeftPct}%`, width: `${barWidthPct}%` }}
          />
          {avgPct !== null && (
            <div className="absolute inset-y-0 w-0.5 bg-violet-700" style={{ left: `${avgPct}%` }} />
          )}
        </div>
      )}
      <div className="space-y-0.5">
        <div className="flex justify-between text-[11px]">
          <span className="text-neutral-400">{t('reproIntel.window.earliest', { defaultValue: 'Earliest' })}</span>
          <span className="font-semibold text-neutral-700">{formatDate(win.earliest)}</span>
        </div>
        <div className="flex justify-between text-[11px]">
          <span className="text-neutral-500">{t('reproIntel.window.average', { defaultValue: 'Average' })}</span>
          <span className="font-bold text-violet-700">{formatDate(win.average)}{avgDays !== null ? <span className="ms-1 text-[10px] text-neutral-400">({avgDays > 0 ? `+${avgDays}d` : avgDays === 0 ? t('reproIntel.window.today', { defaultValue: 'today' }) : `${avgDays}d`})</span> : null}</span>
        </div>
        <div className="flex justify-between text-[11px]">
          <span className="text-neutral-400">{t('reproIntel.window.latest', { defaultValue: 'Latest' })}</span>
          <span className="font-semibold text-neutral-700">{formatDate(win.latest)}</span>
        </div>
      </div>
      {source && source !== 'personal' && (
        <div className="mt-1.5 text-[9px] text-neutral-400 italic">
          {source === 'collection' ? t('reproIntel.window.basedOnCollection', { defaultValue: 'Based on collection averages' }) : t('reproIntel.window.basedOnSpecies', { defaultValue: 'Based on species defaults' })}
        </div>
      )}
    </div>
  );
}

// ── Cycle timeline row ────────────────────────────────────────────────────────

function CycleRow({ cycle }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const hasData = cycle.ovulationDate || cycle.preLayShedDate || cycle.eggLayingDate || cycle.locks.length > 0;

  const stages = [
    { label: t('reproIntel.stage.pairing', { defaultValue: 'Pairing' }), date: cycle.pairingStartDate, color: 'bg-neutral-300' },
    { label: t('reproIntel.stage.firstLock', { defaultValue: 'First lock' }), date: cycle.intervals.firstLockDate, color: 'bg-sky-400' },
    { label: t('reproIntel.stage.ovulation', { defaultValue: 'Ovulation' }), date: cycle.ovulationDate, color: 'bg-violet-400' },
    { label: t('reproIntel.stage.preLayShed', { defaultValue: 'Pre-lay shed' }), date: cycle.preLayShedDate, color: 'bg-amber-400' },
    { label: t('reproIntel.stage.eggsLaid', { defaultValue: 'Eggs laid' }), date: cycle.eggLayingDate, color: 'bg-emerald-400' },
  ].filter(s => s.date);

  return (
    <div className="rounded-xl border border-violet-100 bg-white overflow-hidden">
      <button
        type="button"
        {...help('animals-repro-cycle')}
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-start hover:bg-violet-50/40 transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className="text-[11px] font-bold text-violet-700">{cycle.season}</div>
          <div className="text-[10px] text-neutral-400">{t('reproIntel.cycleN', { defaultValue: 'Cycle {{index}}', index: cycle.cycleIndex })}</div>
          {cycle.eggLayingDate && (
            <div className="text-[10px] font-semibold text-emerald-600">
              {cycle.eggCount ? t('reproIntel.fertileOfEggs', { defaultValue: '{{fertile}}/{{total}} eggs', fertile: cycle.fertileCount ?? '?', total: cycle.eggCount }) : t('reproIntel.stage.eggsLaid', { defaultValue: 'Eggs laid' })}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {stages.length > 0 && (
            <div className="flex items-center gap-0.5">
              {stages.map((s, i) => (
                <div key={i} className={`w-1.5 h-1.5 rounded-full ${s.color}`} title={s.label} />
              ))}
            </div>
          )}
          <span className="text-neutral-400 text-xs">{open ? '▲' : '▼'}</span>
        </div>
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-2 border-t border-violet-50">
          {/* Visual timeline bar */}
          {stages.length > 0 && (
            <div className="mt-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                {stages.map((s, i) => (
                  <React.Fragment key={i}>
                    <div className="flex flex-col items-center gap-0.5">
                      <div className={`w-2.5 h-2.5 rounded-full ${s.color}`} />
                      <div className="text-[9px] text-neutral-400 text-center leading-tight max-w-[40px]">{s.label}</div>
                      <div className="text-[9px] font-mono text-neutral-500">{formatDate(s.date)}</div>
                    </div>
                    {i < stages.length - 1 && <div className="flex-1 h-0.5 bg-neutral-100 mb-4" />}
                  </React.Fragment>
                ))}
              </div>
            </div>
          )}

          {/* Key intervals */}
          {hasData && (
            <div className="space-y-1 mt-1">
              {[
                { label: t('reproIntel.interval.locks', { defaultValue: 'Locks' }), value: cycle.intervals.lockCount > 0 ? t('reproIntel.interval.lockCount', { defaultValue: '{{locks}} locks', locks: cycle.intervals.lockCount }) : null },
                { label: t('reproIntel.avgDaysBetweenLocks', { defaultValue: 'Avg days between locks' }), value: cycle.intervals.avgDaysBetweenLocks != null ? `${cycle.intervals.avgDaysBetweenLocks}d` : null },
                { label: t('reproIntel.interval.firstLockToOvulation', { defaultValue: 'First lock → Ovulation' }), value: cycle.intervals.firstLockToOvulation != null ? `${cycle.intervals.firstLockToOvulation}d` : null },
                { label: t('reproIntel.interval.ovulationToPreLayShed', { defaultValue: 'Ovulation → Pre-lay shed' }), value: cycle.intervals.ovulationToPreLayShed != null ? `${cycle.intervals.ovulationToPreLayShed}d` : null },
                { label: t('reproIntel.interval.preLayShedToEggsLaid', { defaultValue: 'Pre-lay shed → Eggs laid' }), value: cycle.intervals.preLayShedToEggLaying != null ? `${cycle.intervals.preLayShedToEggLaying}d` : null },
                { label: t('reproIntel.interval.totalCycleLength', { defaultValue: 'Total cycle length' }), value: cycle.intervals.pairingStartToEggLaying != null ? `${cycle.intervals.pairingStartToEggLaying}d` : null },
                { label: t('reproIntel.interval.fertility', { defaultValue: 'Fertility' }), value: cycle.intervals.fertilityRate != null ? `${Math.round(cycle.intervals.fertilityRate * 100)}%` : null },
              ].filter(r => r.value).map(r => (
                <div key={r.label} className="flex justify-between text-[11px]">
                  <span className="text-neutral-400">{r.label}</span>
                  <span className="font-semibold text-neutral-700">{r.value}</span>
                </div>
              ))}
            </div>
          )}

          {/* Lock list */}
          {cycle.locks.length > 0 && (
            <div>
              <div className="text-[9px] uppercase tracking-widest font-semibold text-neutral-400 mb-1">{t('reproIntel.lockDates', { defaultValue: 'Lock dates' })}</div>
              <div className="flex flex-wrap gap-1">
                {cycle.locks.map(l => (
                  <span key={l.id} className="rounded-full bg-sky-50 border border-sky-100 px-2 py-0.5 text-[10px] font-mono text-sky-700">
                    {formatDate(l.lockDate)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {!hasData && (
            <div className="text-xs text-neutral-400 text-center py-2">{t('reproIntel.noEventsForCycle', { defaultValue: 'No events recorded for this cycle.' })}</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Stat tile ─────────────────────────────────────────────────────────────────

function StatTile({ label, value, accent }) {
  return (
    <div className="rounded-xl bg-violet-50/60 border border-violet-100 px-3 py-2.5 flex flex-col gap-0.5 min-w-0">
      <div className={`text-lg font-bold truncate ${accent ? 'text-emerald-600' : 'text-neutral-800'}`}>{value ?? '—'}</div>
      <div className="text-[10px] text-neutral-500">{label}</div>
    </div>
  );
}

// ── Analytics overview ────────────────────────────────────────────────────────

function AnalyticsOverview({ analytics }) {
  const { t } = useTranslation();
  const rows = [
    { id: 'totalCycles', label: t('reproIntel.totalCycles', { defaultValue: 'Total cycles' }), value: analytics.totalCycles },
    { label: t('reproIntel.analytics.lifetimeLocks', { defaultValue: 'Lifetime locks' }), value: analytics.totalLifetimeLocks },
    { label: t('reproIntel.analytics.avgLocksPerCycle', { defaultValue: 'Avg locks / cycle' }), value: analytics.avgLocksPerCycle != null ? analytics.avgLocksPerCycle.toFixed(1) : null },
    { label: t('reproIntel.avgDaysBetweenLocks', { defaultValue: 'Avg days between locks' }), value: analytics.avgDaysBetweenLocks != null ? `${analytics.avgDaysBetweenLocks}d` : null },
    { label: t('reproIntel.analytics.firstLockToOvulation', { defaultValue: '1st lock → Ovulation' }), value: analytics.avgFirstLockToOvulation != null ? t('reproIntel.analytics.daysAvg', { defaultValue: '{{days}}d avg', days: analytics.avgFirstLockToOvulation }) : null },
    { label: t('reproIntel.analytics.ovulationToPreLay', { defaultValue: 'Ovulation → Pre-lay' }), value: analytics.avgOvulationToPreLayShed != null ? t('reproIntel.analytics.daysAvg', { defaultValue: '{{days}}d avg', days: analytics.avgOvulationToPreLayShed }) : null },
    { label: t('reproIntel.analytics.preLayToEggsLaid', { defaultValue: 'Pre-lay → Eggs laid' }), value: analytics.avgPreLayShedToEggLaying != null ? t('reproIntel.analytics.daysAvg', { defaultValue: '{{days}}d avg', days: analytics.avgPreLayShedToEggLaying }) : null },
    { label: t('reproIntel.avgFertility', { defaultValue: 'Avg fertility' }), value: analytics.avgFertilityRate != null ? `${Math.round(analytics.avgFertilityRate * 100)}%` : null },
  ].filter(r => r.value != null && r.value !== 0 || r.id === 'totalCycles');

  return (
    <div className="space-y-1">
      {rows.map(r => (
        <div key={r.label} className="flex justify-between items-center text-[11px] py-1 border-b border-neutral-50 last:border-0">
          <span className="text-neutral-400">{r.label}</span>
          <span className="font-semibold text-neutral-700">{r.value ?? '—'}</span>
        </div>
      ))}
    </div>
  );
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

const TABS = ['Overview', 'Cycles', 'Predictions'];

// ── Main panel ────────────────────────────────────────────────────────────────

const tabLabel = (t, tabName) => ({
  Overview: t('reproIntel.tabs.overview', { defaultValue: 'Overview' }),
  Cycles: t('reproIntel.tabs.cycles', { defaultValue: 'Cycles' }),
  Predictions: t('reproIntel.tabs.predictions', { defaultValue: 'Predictions' }),
}[tabName] ?? tabName);

export function ReproductiveIntelligencePanel({ snake }) {
  const { t } = useTranslation();
  const [profile, setProfile]     = useState(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [tab, setTab]             = useState('Overview');

  const femaleAppId = snake?.id;

  const load = useCallback(async () => {
    if (!femaleAppId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchFemaleReproductiveProfile(femaleAppId);
      setProfile(data);
    } catch (e) {
      setError(e?.message || t('reproIntel.loadFailed', { defaultValue: 'Failed to load reproductive profile' }));
    } finally {
      setLoading(false);
    }
  }, [femaleAppId]);

  useEffect(() => { load(); }, [load]);

  // Normalised values for "safe" rendering
  const analytics    = profile?.analytics ?? null;
  const predictions  = profile?.predictions ?? null;
  const cycles       = profile?.cycles ?? [];
  const confidence   = analytics?.confidence ?? 'none';
  const patternTags  = analytics?.patternTags ?? [];

  // Insight sentence for overview
  const insightSentence = (() => {
    if (!analytics || analytics.totalCycles === 0) return null;
    const parts = [];
    if (analytics.avgPreLayShedToEggLaying != null)
      parts.push(t('reproIntel.insight.laysAfterShed', { defaultValue: 'lays eggs ~{{days}}d after pre-lay shed', days: analytics.avgPreLayShedToEggLaying }));
    if (analytics.avgLocksPerCycle != null && analytics.avgLocksPerCycle > 0)
      parts.push(t('reproIntel.insight.averagesLocks', { defaultValue: 'averages {{locks}} locks per season', locks: analytics.avgLocksPerCycle.toFixed(1) }));
    if (patternTags.includes('consistent'))
      parts.push(t('reproIntel.insight.consistent', { defaultValue: 'shows highly consistent reproductive timing' }));
    return parts.length ? parts.join(', ') + '.' : null;
  })();

  // Active cycle for prediction context
  const activeCycle = cycles.find(c => !c.eggLayingDate);

  // Most recent lock date across all recorded cycles, for the headline stat tile
  const lastLockDate = cycles
    .flatMap(c => (c.locks || []).map(l => l.lockDate))
    .filter(Boolean)
    .sort()
    .slice(-1)[0] || null;

  return (
    <div className="border border-violet-100 rounded-2xl overflow-hidden bg-white">
      {/* Header */}
      <div {...help('animals-repro')} className="px-4 py-3 border-b border-violet-100 flex items-center justify-between bg-violet-50/40">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-violet-500">
            {t('reproIntel.title', { defaultValue: 'Reproductive Intelligence' })}
          </div>
          {analytics && (
            <div className="mt-0.5 flex items-center gap-2">
              <ConfidenceBadge level={confidence} />
              {analytics.totalCycles > 0 && (
                <span className="text-[10px] text-neutral-400">{t('reproIntel.cyclesRecorded', { count: analytics.totalCycles, defaultValue_one: '{{count}} cycle recorded', defaultValue_other: '{{count}} cycles recorded' })}</span>
              )}
            </div>
          )}
        </div>
        <button
          type="button"
          {...help('animals-repro-refresh')}
          onClick={load}
          className="text-[10px] text-violet-400 hover:text-violet-600 transition-colors px-2 py-1 rounded-lg hover:bg-violet-100"
        >
          {t('common.refresh', { defaultValue: 'Refresh' })}
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-violet-100 overflow-x-auto">
        {TABS.map(tabName => (
          <button
            key={tabName}
            type="button"
            {...help('animals-repro-tabs')}
            onClick={() => setTab(tabName)}
            className={[
              'px-3 py-2 text-xs font-semibold whitespace-nowrap flex-shrink-0 transition-colors',
              tab === tabName
                ? 'border-b-2 border-violet-500 text-violet-700'
                : 'text-neutral-400 hover:text-neutral-600',
            ].join(' ')}
          >
            {tabLabel(t, tabName)}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="p-4">
        {loading && (
          <div className="flex items-center justify-center py-8 text-sm text-neutral-400">{t('mobile.common.loadingEllipsis', { defaultValue: 'Loading…' })}</div>
        )}
        {!loading && error && (
          <div className="text-xs text-rose-500 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{error}</div>
        )}
        {!loading && !error && !profile && (
          <div className="text-xs text-neutral-400 text-center py-6">{t('reproIntel.noData', { defaultValue: 'No reproductive data yet.' })}</div>
        )}
        {!loading && !error && profile && (
          <>
            {/* ── Overview ── */}
            {tab === 'Overview' && (
              <div className="space-y-4">
                {/* Pattern tags */}
                {patternTags.length > 0 && (
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-widest text-violet-500 mb-1.5">{t('reproIntel.profile', { defaultValue: 'Profile' })}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {patternTags.map(tag => <PatternTag key={tag} tag={tag} />)}
                    </div>
                  </div>
                )}

                {/* Insight sentence */}
                {insightSentence && (
                  <div className="rounded-xl bg-violet-50 border border-violet-100 px-3 py-2 text-[11px] text-violet-700 italic">
                    "{insightSentence[0].toUpperCase() + insightSentence.slice(1)}"
                  </div>
                )}

                {/* Active cycle status */}
                {activeCycle ? (
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-widest text-violet-500 mb-1.5">{t('reproIntel.currentCycle', { defaultValue: 'Current Cycle' })}</div>
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-[11px] space-y-1">
                      <div className="font-semibold text-emerald-700">{t('reproIntel.seasonCycle', { defaultValue: '{{season}} — Cycle {{index}}', season: activeCycle.season, index: activeCycle.cycleIndex })}</div>
                      {activeCycle.ovulationDate && <div className="text-neutral-600">{t('reproIntel.ovulationRecorded', { defaultValue: 'Ovulation recorded:' })} <span className="font-semibold">{formatDate(activeCycle.ovulationDate)}</span></div>}
                      {activeCycle.preLayShedDate && <div className="text-neutral-600">{t('reproIntel.preLayShedLabel', { defaultValue: 'Pre-lay shed:' })} <span className="font-semibold">{formatDate(activeCycle.preLayShedDate)}</span></div>}
                      {!activeCycle.ovulationDate && activeCycle.intervals.lockCount > 0 && (
                        <div className="text-neutral-600">{t('reproIntel.locksRecorded', { count: activeCycle.intervals.lockCount, defaultValue_one: '{{count}} lock recorded', defaultValue_other: '{{count}} locks recorded' })}</div>
                      )}
                    </div>
                  </div>
                ) : analytics.totalCycles > 0 ? (
                  <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-[11px] text-neutral-500 text-center">
                    {t('reproIntel.noActiveCycle', { defaultValue: 'No active cycle — not currently in pairing' })}
                  </div>
                ) : null}

                {/* Analytics summary */}
                {analytics.totalCycles > 0 && (
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-widest text-violet-500 mb-1.5">{t('reproIntel.lifetimeAverages', { defaultValue: 'Lifetime Averages' })}</div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
                      <StatTile label={t('reproIntel.totalCycles', { defaultValue: 'Total cycles' })} value={analytics.totalCycles} />
                      <StatTile
                        label={t('reproIntel.avgDaysBetweenLocks', { defaultValue: 'Avg days between locks' })}
                        value={analytics.avgDaysBetweenLocks != null ? `${analytics.avgDaysBetweenLocks}d` : null}
                      />
                      <StatTile label={t('reproIntel.lastLockDate', { defaultValue: 'Last lock date' })} value={lastLockDate ? formatDate(lastLockDate) : null} />
                      <StatTile
                        label={t('reproIntel.avgFertility', { defaultValue: 'Avg fertility' })}
                        value={analytics.avgFertilityRate != null ? `${Math.round(analytics.avgFertilityRate * 100)}%` : null}
                        accent
                      />
                    </div>
                    <AnalyticsOverview analytics={analytics} />
                  </div>
                )}

                {analytics.totalCycles === 0 && (
                  <div className="text-center py-4 space-y-1">
                    <div className="text-2xl opacity-20">🐍</div>
                    <div className="text-xs text-neutral-400 font-semibold">{t('reproIntel.noCyclesYet', { defaultValue: 'No cycles recorded yet' })}</div>
                    <div className="text-[11px] text-neutral-400">
                      {t('reproIntel.predictionsWillImprove', { defaultValue: 'Predictions will improve after the first complete breeding season.' })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Cycles ── */}
            {tab === 'Cycles' && (
              <div className="space-y-2">
                {cycles.length === 0 && (
                  <div className="text-xs text-neutral-400 text-center py-6">{t('reproIntel.noCyclesYetPeriod', { defaultValue: 'No cycles recorded yet.' })}</div>
                )}
                {cycles.map(cycle => (
                  <CycleRow key={cycle.id} cycle={cycle} />
                ))}
              </div>
            )}

            {/* ── Predictions ── */}
            {tab === 'Predictions' && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <ConfidenceBadge level={confidence} />
                  {predictions?.source && predictions.source !== 'personal' && (
                    <span className="text-[10px] text-neutral-400">
                      {predictions.source === 'collection' ? t('reproIntel.usingCollectionData', { defaultValue: '(using collection data)' }) : t('reproIntel.usingSpeciesDefaults', { defaultValue: '(using species defaults)' })}
                    </span>
                  )}
                  {predictions?.basedOnCycles > 0 && (
                    <span className="text-[10px] text-neutral-400">{t('reproIntel.basedOnCycles', { count: predictions.basedOnCycles, defaultValue_one: 'Based on {{count}} cycle', defaultValue_other: 'Based on {{count}} cycles' })}</span>
                  )}
                </div>

                {predictions?.fromOvulation && (
                  <div className="space-y-2">
                    <div className="text-[10px] font-semibold uppercase tracking-widest text-violet-500">{t('reproIntel.fromOvulation', { defaultValue: 'From ovulation' })}</div>
                    <PredictionCard title={t('reproIntel.expectedPreLayShed', { defaultValue: 'Expected Pre-Lay Shed' })} window={predictions.fromOvulation.preLayShed} source={predictions.source} />
                    <PredictionCard title={t('reproIntel.expectedEggLaying', { defaultValue: 'Expected Egg Laying' })} window={predictions.fromOvulation.eggLaying} source={predictions.source} />
                  </div>
                )}

                {predictions?.fromPreLayShed && (
                  <div className="space-y-2">
                    <div className="text-[10px] font-semibold uppercase tracking-widest text-violet-500">{t('reproIntel.fromPreLayShed', { defaultValue: 'From pre-lay shed' })}</div>
                    <PredictionCard title={t('reproIntel.expectedEggLaying', { defaultValue: 'Expected Egg Laying' })} window={predictions.fromPreLayShed.eggLaying} source={predictions.source} />
                  </div>
                )}

                {!predictions?.fromOvulation && !predictions?.fromPreLayShed && (
                  <div className="rounded-xl bg-neutral-50 border border-dashed border-neutral-200 p-4 text-center text-xs text-neutral-400">
                    {activeCycle
                      ? t('reproIntel.recordToPredict', { defaultValue: 'Record ovulation or pre-lay shed to generate date predictions.' })
                      : t('reproIntel.startPairingToPredict', { defaultValue: 'Start a pairing to generate predictions.' })}
                  </div>
                )}

                {predictions?.nextLockEstimate?.avgLocksBeforeOvulation != null && (
                  <div className="rounded-xl bg-violet-50 border border-violet-100 px-3 py-2 text-[11px] text-violet-700">
                    {t('reproIntel.typicallyNeedsPrefix', { defaultValue: 'This female typically needs' })} <span className="font-bold">{predictions.nextLockEstimate.avgLocksBeforeOvulation.toFixed(1)}</span> {t('reproIntel.typicallyNeedsSuffix', { defaultValue: 'locks before ovulation.' })}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default ReproductiveIntelligencePanel;
