import React from 'react';

/**
 * Landing page: the species you actually keep, with the counts you would otherwise open a
 * species to find.
 *
 * Purely presentational. Every number is computed in App.jsx, where the pairing-lifecycle
 * and demo helpers live, so this file never has to know how a pairing counts as active.
 *
 * A species appears here only once an animal of it exists. The full 64-species catalogue
 * stays reachable from the add-animal picker -- this page is the collection, not the menu.
 */
export default function SpeciesDashboard({
  summaries = [],
  totals = { animals: 0, species: 0, activePairings: 0 },
  isDemoCollection = false,
  onOpenSpecies,
  onAddAnimal,
  t = (_key, options) => options?.defaultValue || '',
}) {
  return (
    <div className="space-y-4">
      {isDemoCollection && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-[10px] font-bold tracking-wider uppercase text-amber-700 border border-amber-300 rounded px-1.5 py-0.5">
            {t('species.dashboard.demoBadge', { defaultValue: 'Demo' })}
          </span>
          <span className="text-sm text-amber-900">
            {t('species.dashboard.demoBanner', {
              defaultValue: 'These are example animals so the app has something to show. Add your first animal and they disappear.',
            })}
          </span>
        </div>
      )}

      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-neutral-600 tabular-nums">
        <span><strong className="text-neutral-900">{totals.animals}</strong> {t('species.dashboard.animals', { defaultValue: 'animals' })}</span>
        <span><strong className="text-neutral-900">{totals.species}</strong> {t('species.dashboard.species', { defaultValue: 'species' })}</span>
        <span><strong className="text-neutral-900">{totals.activePairings}</strong> {t('species.dashboard.activePairings', { defaultValue: 'active pairings' })}</span>
      </div>

      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {summaries.map(summary => (
          <button
            key={summary.id}
            type="button"
            onClick={() => onOpenSpecies?.(summary.id)}
            className="text-left bg-white border rounded-2xl p-4 flex flex-col gap-3 hover:border-neutral-400 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-400 transition"
          >
            <div className="flex items-start gap-3">
              <div className="min-w-0">
                <div className="font-semibold leading-tight truncate">{summary.name}</div>
                {summary.scientificName && (
                  <div className="text-xs text-neutral-500 italic truncate">{summary.scientificName}</div>
                )}
              </div>
              <div className="ml-auto text-2xl font-semibold tabular-nums text-[#3c1b73] leading-none">
                {summary.total}
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {summary.females > 0 && <Chip>{'♀'} {summary.females}</Chip>}
              {summary.males > 0 && <Chip>{'♂'} {summary.males}</Chip>}
              {summary.unsexed > 0 && (
                <Chip>{t('species.dashboard.unsexed', { defaultValue: 'unsexed' })} {summary.unsexed}</Chip>
              )}
              {summary.isDemo && (
                <span className="text-[10px] font-bold tracking-wider uppercase text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                  {t('species.dashboard.demoBadge', { defaultValue: 'Demo' })}
                </span>
              )}
            </div>

            <div className="border-t pt-2 flex items-center gap-2 text-xs text-neutral-500">
              <span
                className={`w-1.5 h-1.5 rounded-full flex-none ${summary.hasGenes ? 'bg-emerald-500' : 'bg-amber-500'}`}
                aria-hidden="true"
              />
              <span className="truncate">
                {summary.activePairings > 0
                  ? t('species.dashboard.pairingCount', {
                      defaultValue: '{{count}} pairing(s)',
                      count: summary.activePairings,
                    })
                  : t('species.dashboard.noPairings', { defaultValue: 'no pairings' })}
                {' · '}
                {summary.hasGenes
                  ? t('species.dashboard.geneCount', {
                      defaultValue: '{{count}} genes',
                      count: summary.geneCount,
                    })
                  /* Said here rather than discovered later in an empty genetics picker,
                     which reads as a broken app instead of a documented gap. */
                  : t('species.dashboard.noGenes', { defaultValue: 'no gene table yet' })}
              </span>
            </div>
          </button>
        ))}

        <button
          type="button"
          onClick={() => onAddAnimal?.()}
          className="text-center border border-dashed rounded-2xl p-4 min-h-[132px] flex flex-col items-center justify-center gap-1 text-neutral-500 hover:border-neutral-400 hover:text-neutral-700 focus:outline-none focus:ring-2 focus:ring-sky-400 transition"
        >
          <span className="text-xl font-semibold text-[#3c1b73]" aria-hidden="true">+</span>
          <span className="text-sm font-medium">{t('actions.addAnimal', { defaultValue: 'Add animal' })}</span>
          <span className="text-[11px] leading-snug">
            {t('species.dashboard.addHint', { defaultValue: 'a new species appears here once you own one' })}
          </span>
        </button>
      </div>
    </div>
  );
}

function Chip({ children }) {
  return (
    <span className="text-[11px] tabular-nums bg-neutral-50 border rounded px-1.5 py-0.5 text-neutral-600">
      {children}
    </span>
  );
}
