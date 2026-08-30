import React from 'react';

/**
 * Breeding attention across the whole collection, one line per species.
 *
 * The counts are the same four the Breeding Tracker's own dashboard shows, so a keeper reads
 * the same numbers wherever they look. What this adds is every species at once: from inside a
 * species workspace you can only ever see one of them, and an overdue clutch in the species
 * you are not currently looking at is exactly the thing worth surfacing.
 *
 * Purely presentational -- the counting lives in App.jsx alongside the pairing-lifecycle
 * helpers that decide what "overdue" means.
 *
 * The pressable cells are divs, not buttons, because `.app-root button` in App.css repaints
 * every button with the theme colour under `!important`. A row of four identically coloured
 * cells would destroy the only thing this table is for -- telling overdue from upcoming at a
 * glance -- so it follows BreedingDashboardSection, whose summary cards dodge it the same way.
 */

/**
 * `urgency` is what the Breeding Tracker dashboard opens filtered to. Tracking is the row
 * total rather than a band of its own, so it opens unfiltered like the species name does.
 */
const COLUMNS = [
  {
    key: 'overdue',
    urgency: 'overdue',
    labelKey: 'pairing.dashboard.overdue',
    label: 'Overdue',
    tone: 'text-rose-700 bg-rose-50 border-rose-200 hover:border-rose-400',
  },
  {
    key: 'due',
    urgency: 'due',
    labelKey: 'pairing.dashboard.dueSoon',
    label: 'Due in 3 days',
    tone: 'text-amber-700 bg-amber-50 border-amber-200 hover:border-amber-400',
  },
  {
    key: 'soon',
    urgency: 'soon',
    labelKey: 'pairing.dashboard.nextWeek',
    label: 'Next 7 days',
    tone: 'text-sky-700 bg-sky-50 border-sky-200 hover:border-sky-400',
  },
  {
    key: 'tracking',
    urgency: null,
    labelKey: 'pairing.dashboard.tracking',
    label: 'Tracking',
    tone: 'text-neutral-700 bg-white border-neutral-300 hover:border-neutral-500',
  },
];

const CELL_BASE = 'w-16 sm:w-20 text-center tabular-nums text-sm font-semibold border rounded-lg py-1';
const ZERO_TONE = 'text-neutral-300 bg-white border-neutral-100';

/** Enter and Space, so a div standing in for a button still behaves like one. */
const pressKeys = (handler) => (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  handler();
};

export default function SpeciesBreedingTable({
  rows = [],
  onOpenBreeding,
  t = (_key, options) => options?.defaultValue || '',
}) {
  // Nothing kept yet means nothing to breed. The species grid above already asks for a first
  // animal, and a second empty panel saying so would only be noise.
  if (!rows.length) return null;

  const nothingTracked = rows.every(row => row.tracking === 0);

  return (
    <div className="rounded-2xl border bg-white overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2 border-b bg-neutral-50 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
        <span className="flex-1 min-w-0">
          {t('species.dashboard.breedingSpecies', { defaultValue: 'Species' })}
        </span>
        {COLUMNS.map(column => (
          <span key={column.key} className="w-16 sm:w-20 text-center leading-tight">
            {t(column.labelKey, { defaultValue: column.label })}
          </span>
        ))}
      </div>

      {rows.map(row => {
        const openAll = () => onOpenBreeding?.(row.id, null);
        return (
          <div key={row.id} className="flex items-center gap-2 px-4 py-1.5 border-b last:border-b-0">
            <div
              role="button"
              tabIndex={0}
              onClick={openAll}
              onKeyDown={pressKeys(openAll)}
              className="flex-1 min-w-0 text-left text-sm font-medium truncate rounded-lg px-1 py-1 cursor-pointer hover:text-[#3c1b73] focus:outline-none focus:ring-2 focus:ring-sky-400"
            >
              {row.name}
            </div>

            {COLUMNS.map(column => {
              const value = row[column.key] || 0;
              const label = t(column.labelKey, { defaultValue: column.label });

              // A zero is worth showing -- it answers "does this species need me?" -- but there
              // is nothing behind it to open, so it is not a control at all.
              if (!value) {
                return (
                  <div key={column.key} className={`${CELL_BASE} ${ZERO_TONE}`} aria-label={`${row.name} - ${label}: 0`}>
                    0
                  </div>
                );
              }

              const open = () => onOpenBreeding?.(row.id, column.urgency);
              return (
                <div
                  key={column.key}
                  role="button"
                  tabIndex={0}
                  onClick={open}
                  onKeyDown={pressKeys(open)}
                  aria-label={`${row.name} - ${label}: ${value}`}
                  className={`${CELL_BASE} ${column.tone} cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-sky-400`}
                >
                  {value}
                </div>
              );
            })}
          </div>
        );
      })}

      {nothingTracked && (
        <div className="px-4 py-3 border-t text-xs text-neutral-500">
          {t('species.dashboard.breedingEmpty', {
            defaultValue: 'No active pairings anywhere yet. Start one from a species’ Breeding Tracker.',
          })}
        </div>
      )}
    </div>
  );
}
