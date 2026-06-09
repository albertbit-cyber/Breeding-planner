import React, { useState, useEffect, useCallback } from 'react';
import { fetchFemaleReproductiveProfile } from '../../shared/apiClient';

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
  const label = { none: 'No data', low: 'Low confidence', medium: 'Medium confidence', high: 'High confidence' }[level] ?? level;
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

function PatternTag({ tag }) {
  const cfg = PATTERN_LABELS[tag] ?? { label: tag, color: 'bg-neutral-100 text-neutral-600 border-neutral-200' };
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}

// ── Prediction window card ────────────────────────────────────────────────────

function PredictionCard({ title, window: win, source }) {
  if (!win) return null;
  const avgDays = daysFromToday(win.average);
  const urgency = avgDays !== null && avgDays <= 7 ? 'border-rose-200 bg-rose-50' : 'border-violet-100 bg-violet-50/60';
  return (
    <div className={`rounded-xl border p-3 ${urgency}`}>
      <div className="text-[10px] font-semibold uppercase tracking-widest text-violet-500 mb-1">{title}</div>
      <div className="space-y-0.5">
        <div className="flex justify-between text-[11px]">
          <span className="text-neutral-400">Earliest</span>
          <span className="font-semibold text-neutral-700">{formatDate(win.earliest)}</span>
        </div>
        <div className="flex justify-between text-[11px]">
          <span className="text-neutral-500">Average</span>
          <span className="font-bold text-violet-700">{formatDate(win.average)}{avgDays !== null ? <span className="ml-1 text-[10px] text-neutral-400">({avgDays > 0 ? `+${avgDays}d` : avgDays === 0 ? 'today' : `${avgDays}d`})</span> : null}</span>
        </div>
        <div className="flex justify-between text-[11px]">
          <span className="text-neutral-400">Latest</span>
          <span className="font-semibold text-neutral-700">{formatDate(win.latest)}</span>
        </div>
      </div>
      {source && source !== 'personal' && (
        <div className="mt-1.5 text-[9px] text-neutral-400 italic">
          {source === 'collection' ? 'Based on collection averages' : 'Based on species defaults'}
        </div>
      )}
    </div>
  );
}

// ── Cycle timeline row ────────────────────────────────────────────────────────

function CycleRow({ cycle }) {
  const [open, setOpen] = useState(false);
  const hasData = cycle.ovulationDate || cycle.preLayShedDate || cycle.eggLayingDate || cycle.locks.length > 0;

  const stages = [
    { label: 'Pairing', date: cycle.pairingStartDate, color: 'bg-neutral-300' },
    { label: 'First lock', date: cycle.intervals.firstLockDate, color: 'bg-sky-400' },
    { label: 'Ovulation', date: cycle.ovulationDate, color: 'bg-violet-400' },
    { label: 'Pre-lay shed', date: cycle.preLayShedDate, color: 'bg-amber-400' },
    { label: 'Eggs laid', date: cycle.eggLayingDate, color: 'bg-emerald-400' },
  ].filter(s => s.date);

  return (
    <div className="rounded-xl border border-violet-100 bg-white overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-violet-50/40 transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className="text-[11px] font-bold text-violet-700">{cycle.season}</div>
          <div className="text-[10px] text-neutral-400">Cycle {cycle.cycleIndex}</div>
          {cycle.eggLayingDate && (
            <div className="text-[10px] font-semibold text-emerald-600">
              {cycle.eggCount ? `${cycle.fertileCount ?? '?'}/${cycle.eggCount} eggs` : 'Eggs laid'}
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
          <span className="text-neutral-300 text-xs">{open ? '▲' : '▼'}</span>
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
                { label: 'Locks', value: cycle.intervals.lockCount > 0 ? `${cycle.intervals.lockCount} locks` : null },
                { label: 'Avg days between locks', value: cycle.intervals.avgDaysBetweenLocks != null ? `${cycle.intervals.avgDaysBetweenLocks}d` : null },
                { label: 'First lock → Ovulation', value: cycle.intervals.firstLockToOvulation != null ? `${cycle.intervals.firstLockToOvulation}d` : null },
                { label: 'Ovulation → Pre-lay shed', value: cycle.intervals.ovulationToPreLayShed != null ? `${cycle.intervals.ovulationToPreLayShed}d` : null },
                { label: 'Pre-lay shed → Eggs laid', value: cycle.intervals.preLayShedToEggLaying != null ? `${cycle.intervals.preLayShedToEggLaying}d` : null },
                { label: 'Total cycle length', value: cycle.intervals.pairingStartToEggLaying != null ? `${cycle.intervals.pairingStartToEggLaying}d` : null },
                { label: 'Fertility', value: cycle.intervals.fertilityRate != null ? `${Math.round(cycle.intervals.fertilityRate * 100)}%` : null },
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
              <div className="text-[9px] uppercase tracking-widest font-semibold text-neutral-400 mb-1">Lock dates</div>
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
            <div className="text-xs text-neutral-400 text-center py-2">No events recorded for this cycle.</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Analytics overview ────────────────────────────────────────────────────────

function AnalyticsOverview({ analytics }) {
  const rows = [
    { label: 'Total cycles',           value: analytics.totalCycles },
    { label: 'Lifetime locks',         value: analytics.totalLifetimeLocks },
    { label: 'Avg locks / cycle',      value: analytics.avgLocksPerCycle != null ? analytics.avgLocksPerCycle.toFixed(1) : null },
    { label: 'Avg days between locks', value: analytics.avgDaysBetweenLocks != null ? `${analytics.avgDaysBetweenLocks}d` : null },
    { label: '1st lock → Ovulation',   value: analytics.avgFirstLockToOvulation != null ? `${analytics.avgFirstLockToOvulation}d avg` : null },
    { label: 'Ovulation → Pre-lay',    value: analytics.avgOvulationToPreLayShed != null ? `${analytics.avgOvulationToPreLayShed}d avg` : null },
    { label: 'Pre-lay → Eggs laid',    value: analytics.avgPreLayShedToEggLaying != null ? `${analytics.avgPreLayShedToEggLaying}d avg` : null },
    { label: 'Avg fertility',          value: analytics.avgFertilityRate != null ? `${Math.round(analytics.avgFertilityRate * 100)}%` : null },
  ].filter(r => r.value != null && r.value !== 0 || r.label === 'Total cycles');

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

export function ReproductiveIntelligencePanel({ snake }) {
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
      setError(e?.message || 'Failed to load reproductive profile');
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
      parts.push(`lays eggs ~${analytics.avgPreLayShedToEggLaying}d after pre-lay shed`);
    if (analytics.avgLocksPerCycle != null && analytics.avgLocksPerCycle > 0)
      parts.push(`averages ${analytics.avgLocksPerCycle.toFixed(1)} locks per season`);
    if (patternTags.includes('consistent'))
      parts.push('shows highly consistent reproductive timing');
    return parts.length ? parts.join(', ') + '.' : null;
  })();

  // Active cycle for prediction context
  const activeCycle = cycles.find(c => !c.eggLayingDate);

  return (
    <div className="border border-violet-100 rounded-2xl overflow-hidden bg-white">
      {/* Header */}
      <div className="px-4 py-3 border-b border-violet-100 flex items-center justify-between bg-violet-50/40">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-violet-500">
            Reproductive Intelligence
          </div>
          {analytics && (
            <div className="mt-0.5 flex items-center gap-2">
              <ConfidenceBadge level={confidence} />
              {analytics.totalCycles > 0 && (
                <span className="text-[10px] text-neutral-400">{analytics.totalCycles} cycle{analytics.totalCycles !== 1 ? 's' : ''} recorded</span>
              )}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={load}
          className="text-[10px] text-violet-400 hover:text-violet-600 transition-colors px-2 py-1 rounded-lg hover:bg-violet-100"
        >
          Refresh
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-violet-100 overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={[
              'px-3 py-2 text-xs font-semibold whitespace-nowrap flex-shrink-0 transition-colors',
              tab === t
                ? 'border-b-2 border-violet-500 text-violet-700'
                : 'text-neutral-400 hover:text-neutral-600',
            ].join(' ')}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="p-4">
        {loading && (
          <div className="flex items-center justify-center py-8 text-sm text-neutral-400">Loading…</div>
        )}
        {!loading && error && (
          <div className="text-xs text-rose-500 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{error}</div>
        )}
        {!loading && !error && !profile && (
          <div className="text-xs text-neutral-400 text-center py-6">No reproductive data yet.</div>
        )}
        {!loading && !error && profile && (
          <>
            {/* ── Overview ── */}
            {tab === 'Overview' && (
              <div className="space-y-4">
                {/* Pattern tags */}
                {patternTags.length > 0 && (
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-widest text-violet-500 mb-1.5">Profile</div>
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
                    <div className="text-[10px] font-semibold uppercase tracking-widest text-violet-500 mb-1.5">Current Cycle</div>
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-[11px] space-y-1">
                      <div className="font-semibold text-emerald-700">{activeCycle.season} — Cycle {activeCycle.cycleIndex}</div>
                      {activeCycle.ovulationDate && <div className="text-neutral-600">Ovulation recorded: <span className="font-semibold">{formatDate(activeCycle.ovulationDate)}</span></div>}
                      {activeCycle.preLayShedDate && <div className="text-neutral-600">Pre-lay shed: <span className="font-semibold">{formatDate(activeCycle.preLayShedDate)}</span></div>}
                      {!activeCycle.ovulationDate && activeCycle.intervals.lockCount > 0 && (
                        <div className="text-neutral-600">{activeCycle.intervals.lockCount} lock{activeCycle.intervals.lockCount !== 1 ? 's' : ''} recorded</div>
                      )}
                    </div>
                  </div>
                ) : analytics.totalCycles > 0 ? (
                  <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-[11px] text-neutral-500 text-center">
                    No active cycle — not currently in pairing
                  </div>
                ) : null}

                {/* Analytics summary */}
                {analytics.totalCycles > 0 && (
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-widest text-violet-500 mb-1.5">Lifetime Averages</div>
                    <AnalyticsOverview analytics={analytics} />
                  </div>
                )}

                {analytics.totalCycles === 0 && (
                  <div className="text-center py-4 space-y-1">
                    <div className="text-2xl opacity-20">🐍</div>
                    <div className="text-xs text-neutral-400 font-semibold">No cycles recorded yet</div>
                    <div className="text-[11px] text-neutral-300">
                      Predictions will improve after the first complete breeding season.
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Cycles ── */}
            {tab === 'Cycles' && (
              <div className="space-y-2">
                {cycles.length === 0 && (
                  <div className="text-xs text-neutral-400 text-center py-6">No cycles recorded yet.</div>
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
                      {predictions.source === 'collection' ? '(using collection data)' : '(using species defaults)'}
                    </span>
                  )}
                  {predictions?.basedOnCycles > 0 && (
                    <span className="text-[10px] text-neutral-400">Based on {predictions.basedOnCycles} cycle{predictions.basedOnCycles !== 1 ? 's' : ''}</span>
                  )}
                </div>

                {predictions?.fromOvulation && (
                  <div className="space-y-2">
                    <div className="text-[10px] font-semibold uppercase tracking-widest text-violet-500">From ovulation</div>
                    <PredictionCard title="Expected Pre-Lay Shed" window={predictions.fromOvulation.preLayShed} source={predictions.source} />
                    <PredictionCard title="Expected Egg Laying" window={predictions.fromOvulation.eggLaying} source={predictions.source} />
                  </div>
                )}

                {predictions?.fromPreLayShed && (
                  <div className="space-y-2">
                    <div className="text-[10px] font-semibold uppercase tracking-widest text-violet-500">From pre-lay shed</div>
                    <PredictionCard title="Expected Egg Laying" window={predictions.fromPreLayShed.eggLaying} source={predictions.source} />
                  </div>
                )}

                {!predictions?.fromOvulation && !predictions?.fromPreLayShed && (
                  <div className="rounded-xl bg-neutral-50 border border-dashed border-neutral-200 p-4 text-center text-xs text-neutral-400">
                    {activeCycle
                      ? 'Record ovulation or pre-lay shed to generate date predictions.'
                      : 'Start a pairing to generate predictions.'}
                  </div>
                )}

                {predictions?.nextLockEstimate?.avgLocksBeforeOvulation != null && (
                  <div className="rounded-xl bg-violet-50 border border-violet-100 px-3 py-2 text-[11px] text-violet-700">
                    This female typically needs <span className="font-bold">{predictions.nextLockEstimate.avgLocksBeforeOvulation.toFixed(1)}</span> locks before ovulation.
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
