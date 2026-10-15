/**
 * The cycle clock banner: what to watch for next, the expected day, and how far along she is.
 * Neutral while counting, blue in the watch days, soft amber for the first two days past due,
 * pastel red after that. Used on the breeding card and on the Breeding dashboard.
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import { addDays } from '../domain/dates';
import { WATCH_DAYS_BEFORE } from '../domain/cycleClock';
import { formatDate } from './format';
import { eventTypeLabel } from './labels';

export const CLOCK_TONE = {
  upcoming: { box: 'border-neutral-200 bg-neutral-50 text-neutral-800', bar: 'bg-neutral-400' },
  watch: { box: 'border-sky-200 bg-sky-50 text-sky-900', bar: 'bg-sky-500' },
  due: { box: 'border-sky-300 bg-sky-50 text-sky-900', bar: 'bg-sky-600' },
  late: { box: 'border-amber-200 bg-amber-50 text-amber-900', bar: 'bg-amber-500' },
  overdue: { box: 'border-rose-200 bg-rose-50 text-rose-900', bar: 'bg-rose-400' },
};

export function clockHeadline(t, clock) {
  if (!clock) return '';
  const what = {
    pre_lay_shed: t('breeding.clock.what.preLayShed', { defaultValue: 'pre-lay shed' }),
    egg_laying: t('breeding.clock.what.eggs', { defaultValue: 'eggs' }),
    first_hatch: t('breeding.clock.what.hatching', { defaultValue: 'hatching' }),
  }[clock.target] || clock.target;
  const due = formatDate(clock.dueDate);
  switch (clock.state) {
    case 'watch':
      return t('breeding.clock.watchNow', { defaultValue: 'Watch for {{what}} now: expected {{date}} (in {{count}} days)', what, date: due, count: clock.daysUntil });
    case 'due':
      return t('breeding.clock.dueToday', { defaultValue: 'Watch for {{what}}: expected today', what });
    case 'late':
    case 'overdue':
      return clock.daysLate === 1
        ? t('breeding.clock.pastDueOne', { defaultValue: 'Watch for {{what}}: 1 day past due (expected {{date}})', what, date: due })
        : t('breeding.clock.pastDue', { defaultValue: 'Watch for {{what}}: {{count}} days past due (expected {{date}})', what, date: due, count: clock.daysLate });
    default:
      return t('breeding.clock.upcoming', { defaultValue: 'Watch for {{what}} from {{from}}: expected {{date}} (in {{count}} days)', what, from: formatDate(addDays(clock.dueDate, -WATCH_DAYS_BEFORE)), date: due, count: clock.daysUntil });
  }
}

export function CycleClock({ clock, compact = false }) {
  const { t } = useTranslation();
  if (!clock) return null;
  const tone = CLOCK_TONE[clock.state] || CLOCK_TONE.upcoming;
  const headline = clockHeadline(t, clock);
  if (compact) {
    return <div className={`mt-2 rounded-lg border px-2.5 py-1.5 text-xs font-medium ${tone.box}`} role="status">{headline}</div>;
  }
  const dayLabel = t('breeding.clock.day', {
    defaultValue: 'Day {{day}} of {{total}} since {{anchor}} on {{date}}',
    day: clock.day,
    total: clock.totalDays,
    anchor: eventTypeLabel(t, clock.anchor).toLowerCase(),
    date: formatDate(clock.anchorDate),
  });
  return (
    <div className={`mt-3 rounded-xl border px-3 py-2.5 ${tone.box}`} role="status" aria-label={t('breeding.clock.label', { defaultValue: 'Cycle clock' })}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="text-sm font-semibold">{headline}</div>
        <div className="text-xs tabular-nums opacity-80">{dayLabel}</div>
      </div>
      <div className="mt-2 h-2 w-full rounded-full bg-white/70 border border-black/5 overflow-hidden" aria-hidden="true">
        <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${Math.round(clock.progress * 100)}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-[10px] tabular-nums opacity-70" aria-hidden="true">
        <span>{formatDate(clock.anchorDate)}</span>
        <span>{t('breeding.clock.rule', { defaultValue: '{{days}}-day rule', days: clock.totalDays })}</span>
        <span>{formatDate(clock.dueDate)}</span>
      </div>
    </div>
  );
}
