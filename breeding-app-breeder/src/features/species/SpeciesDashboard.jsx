import React from 'react';
import SpeciesBreedingTable from './SpeciesBreedingTable';
import { speciesCardStyle } from './speciesColor';
import { useAppearance } from '../../contexts/AppearanceContext.jsx';

/**
 * Landing page: the species you actually keep, with the counts you would otherwise open a
 * species to find.
 *
 * Purely presentational. Every number is computed in App.jsx, where the pairing-lifecycle
 * and demo helpers live, so this file never has to know how a pairing counts as active.
 *
 * A species appears here only once an animal of it exists. The full 64-species catalogue
 * stays reachable from the add-animal picker -- this page is the collection, not the menu.
 *
 * The search box here is the collection-wide one: it reaches every animal of every species,
 * which is what makes it useful from a page where no species is open yet. The search inside a
 * species workspace is a separate box that only ever sees that species.
 *
 * Two halves, in the order a keeper asks the questions: what do I keep, then what needs me
 * this week. Both are whole-collection views, which is the only thing the dashboard can show
 * that a species workspace cannot.
 */
export default function SpeciesDashboard({
  summaries = [],
  totals = { animals: 0, species: 0, activePairings: 0 },
  isDemoCollection = false,
  onOpenSpecies,
  onAddAnimal,
  searchQuery = '',
  onSearchQueryChange,
  searchResults = [],
  searchResultTotal = 0,
  onOpenAnimal,
  breeding = [],
  onOpenBreeding,
  t = (_key, options) => options?.defaultValue || '',
}) {
  // The tint has to composite over whatever card colour the keeper's preset uses, and must
  // stand down entirely on the two presets chosen for contrast.
  const { resolvedAppearance, appearanceState } = useAppearance() || {};
  const mode = resolvedAppearance?.mode === 'dark' ? 'dark' : 'light';
  const preset = appearanceState?.preset || 'default';

  const isSearching = Boolean(String(searchQuery).trim());
  const hiddenResultCount = Math.max(0, searchResultTotal - searchResults.length);
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

      <div className="header-search-shell w-full">
        <input
          value={searchQuery}
          onChange={e => onSearchQueryChange?.(e.target.value)}
          placeholder={t('species.dashboard.searchPlaceholder', {
            defaultValue: 'Search every animal, any species',
          })}
          className="header-search-input w-full pr-11"
        />
        {searchQuery ? (
          <button
            type="button"
            className="header-search-clear"
            onClick={() => onSearchQueryChange?.('')}
            aria-label={t('filters.clear', { defaultValue: 'Clear' })}
            title={t('filters.clear', { defaultValue: 'Clear' })}
          >
            {'✕'}
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-neutral-600 tabular-nums">
        <span><strong className="text-neutral-900">{totals.animals}</strong> {t('species.dashboard.animals', { defaultValue: 'animals' })}</span>
        <span><strong className="text-neutral-900">{totals.species}</strong> {t('species.dashboard.species', { defaultValue: 'species' })}</span>
        <span><strong className="text-neutral-900">{totals.activePairings}</strong> {t('species.dashboard.activePairings', { defaultValue: 'active pairings' })}</span>
      </div>

      {/* While searching, the hits stand in for both halves rather than sitting above them: a
          search should answer with results, not results followed by an unrelated dashboard. */}
      {isSearching ? (
        <SearchResults
          results={searchResults}
          hiddenResultCount={hiddenResultCount}
          onOpenAnimal={onOpenAnimal}
          t={t}
        />
      ) : (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <SectionHeading>{t('species.dashboard.speciesHeading', { defaultValue: 'Species' })}</SectionHeading>
          <div className={`grid gap-3 ${speciesGridClass(summaries.length)}`}>
            {summaries.map(summary => (
              <SpeciesCard
                key={summary.id}
                summary={summary}
                mode={mode}
                preset={preset}
                onOpen={() => onOpenSpecies?.(summary.id)}
                t={t}
              />
            ))}

            <button
              type="button"
              onClick={() => onAddAnimal?.()}
              className="text-center border border-dashed rounded-2xl p-4 min-h-[132px] flex flex-col items-center justify-center gap-1 text-neutral-500 hover:border-neutral-400 hover:text-neutral-700 focus:outline-none focus:ring-2 focus:ring-sky-400 transition"
            >
              <span className="text-xl font-semibold text-[#3c1b73]" aria-hidden="true">+</span>
              <span className="text-sm font-medium">
                {t('actions.addAnimalAndSpecies', { defaultValue: 'New animal & species' })}
              </span>
              <span className="text-[11px] leading-snug">
                {t('species.dashboard.addHint', { defaultValue: 'a new species appears here once you own one' })}
              </span>
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <SectionHeading>{t('species.dashboard.breedingHeading', { defaultValue: 'Breeding' })}</SectionHeading>
          <SpeciesBreedingTable rows={breeding} onOpenBreeding={onOpenBreeding} t={t} />
        </div>
      </div>
      )}
    </div>
  );
}

/**
 * Three across is the ceiling. Below that the cards widen rather than leaving a gap, but a
 * single species is capped so it does not become a billboard.
 */
function speciesGridClass(count) {
  if (count <= 1) return 'grid-cols-1 max-w-md';
  if (count === 2) return 'grid-cols-1 sm:grid-cols-2 max-w-3xl';
  return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';
}

/**
 * One species, two halves.
 *
 * Upper: what you keep. Tinted with the species' own colour, which is where the card gets its
 * identity from at a glance.
 *
 * Lower: what needs you. Deliberately untinted -- amber and red down here mean overdue, and
 * they can only mean that if the species hue is nowhere near them.
 */
function SpeciesCard({ summary, mode, preset, onOpen, t }) {
  const style = speciesCardStyle(summary.id, { mode, preset });
  const statuses = Object.entries(summary.statusCounts || {})
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);
  const stages = Object.entries(summary.stages || {}).filter(([, count]) => count > 0);
  const next = summary.nextEvent;

  return (
    <button
      type="button"
      onClick={onOpen}
      style={style}
      className="text-left bg-white border rounded-2xl overflow-hidden flex flex-col hover:border-neutral-400 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-400 transition"
    >
      {/* Livestock */}
      <div
        className="px-4 pt-3 pb-3 border-b"
        style={{
          background: 'var(--species-tint)',
          // Contrast presets get an edge bar instead of a wash.
          borderLeft: 'var(--species-edge) solid var(--species-solid)',
          // Demo cards are desaturated so example data never reads as the keeper's own.
          filter: summary.isDemo ? 'saturate(0.45)' : undefined,
        }}
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0">
            <div className="font-semibold leading-tight truncate">{summary.name}</div>
            {summary.scientificName && (
              <div className="text-xs italic truncate text-neutral-600">{summary.scientificName}</div>
            )}
          </div>
          <div className="ml-auto text-2xl font-semibold tabular-nums leading-none">{summary.total}</div>
        </div>

        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-xs tabular-nums text-neutral-700">
          {summary.females > 0 && <span>{'♀'} {summary.females}</span>}
          {summary.males > 0 && <span>{'♂'} {summary.males}</span>}
          {summary.unsexed > 0 && (
            <span>{t('species.dashboard.unsexed', { defaultValue: 'unsexed' })} {summary.unsexed}</span>
          )}
          {summary.isDemo && (
            <span className="text-[10px] font-bold tracking-wider uppercase border rounded px-1.5 py-0.5">
              {t('species.dashboard.demoBadge', { defaultValue: 'Demo' })}
            </span>
          )}
        </div>

        {statuses.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {statuses.map(([tag, count]) => (
              <span
                key={tag}
                className="text-[11px] tabular-nums rounded px-1.5 py-0.5 bg-white/75 border border-black/10 text-neutral-700"
              >
                {tag} {count}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Breeding */}
      <div className="px-4 pt-2.5 pb-3 flex flex-col gap-1.5 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
            {t('species.dashboard.breedingHeading', { defaultValue: 'Breeding' })}
          </span>
          <span className="ml-auto text-xs tabular-nums text-neutral-600">
            {summary.activePairings > 0
              ? t('species.dashboard.pairingCount', {
                  defaultValue: '{{count}} pairing(s)',
                  count: summary.activePairings,
                })
              : t('species.dashboard.noPairings', { defaultValue: 'no pairings' })}
            {summary.eggs > 0 && ` · ${t('species.dashboard.eggCount', { defaultValue: '{{count}} eggs', count: summary.eggs })}`}
          </span>
        </div>

        {stages.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {stages.map(([key, count]) => (
              <span key={key} className="text-[11px] tabular-nums bg-neutral-50 border rounded px-1.5 py-0.5 text-neutral-600">
                {STAGE_LABELS[key] || key} {count}
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 text-xs mt-auto pt-0.5 min-w-0">
          {next ? (
            <>
              <span className={`font-semibold rounded px-1.5 py-0.5 text-[11px] flex-none ${URGENCY_CLASS[next.urgency] || URGENCY_CLASS.none}`}>
                {next.countdownLabel}
              </span>
              <span className="text-neutral-500 truncate">{next.stage}</span>
            </>
          ) : (
            <span className="text-neutral-400">
              {t('species.dashboard.nothingScheduled', { defaultValue: 'Nothing scheduled' })}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

/** Stage keys come from the breeding tracker; these are their card-sized labels. */
const STAGE_LABELS = {
  locks: 'Locks',
  ovulation: 'Ovulation',
  preLay: 'Pre-lay',
  clutch: 'Incubating',
  hatched: 'Hatched',
  active: 'Active',
};

/** Semantic only. Kept clear of every species hue so urgency still reads as urgency. */
const URGENCY_CLASS = {
  overdue: 'bg-rose-50 text-rose-700 border border-rose-200',
  due: 'bg-amber-50 text-amber-700 border border-amber-200',
  soon: 'bg-sky-50 text-sky-700 border border-sky-200',
  upcoming: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  none: 'bg-neutral-100 text-neutral-600 border border-neutral-200',
};

function SectionHeading({ children }) {
  return (
    <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
      {children}
    </h2>
  );
}

/**
 * Every row carries its species, because a hit list drawn from the whole collection is the one
 * place two identically named animals from different species can end up side by side.
 */
function SearchResults({ results, hiddenResultCount, onOpenAnimal, t }) {
  if (!results.length) {
    return (
      <div className="border rounded-2xl bg-white px-4 py-6 text-center text-sm text-neutral-500">
        {t('species.dashboard.searchEmpty', { defaultValue: 'No animals match that search.' })}
      </div>
    );
  }

  return (
    <div className="border rounded-2xl bg-white divide-y overflow-hidden">
      {results.map(result => (
        <button
          key={result.key}
          type="button"
          onClick={() => onOpenAnimal?.(result.snake)}
          className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-neutral-50 focus:outline-none focus:bg-neutral-50 transition"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2 min-w-0">
              <span className="font-medium truncate">{result.name}</span>
              {result.sex && <span className="text-neutral-500 flex-none">{result.sex}</span>}
              {result.animalId && (
                <span className="text-xs text-neutral-400 tabular-nums truncate">{result.animalId}</span>
              )}
            </div>
            {result.genes && <div className="text-xs text-neutral-500 truncate">{result.genes}</div>}
          </div>
          <span className="text-xs text-neutral-600 bg-neutral-50 border rounded px-1.5 py-0.5 flex-none max-w-[40%] truncate">
            {result.speciesName}
          </span>
        </button>
      ))}
      {hiddenResultCount > 0 && (
        <div className="px-4 py-2 text-xs text-neutral-500">
          {t('species.dashboard.searchTruncated', {
            defaultValue: '{{count}} more match -- narrow the search to see them',
            count: hiddenResultCount,
          })}
        </div>
      )}
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
