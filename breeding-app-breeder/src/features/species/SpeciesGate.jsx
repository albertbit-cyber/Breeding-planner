import React from 'react';
import { speciesCardStyle } from './speciesColor';
import { useAppearance } from '../../contexts/AppearanceContext.jsx';

/**
 * Shown in place of a species-scoped tab (Animals, Breeding, Advisor, Family Tree) when no
 * species is open.
 *
 * It used to be a silent bounce to the dashboard: on a phone the bottom bar offers Animals and
 * Breeding at all times, so a tap that changed nothing but the page underneath read as broken.
 * Now the tab explains itself in one sentence and puts the species list right under it; picking
 * one opens that species on the tab that was asked for.
 *
 * With no species at all there is nothing to pick, so the two ways in from the dashboard stand
 * in for the list.
 */
export default function SpeciesGate({
  summaries = [],
  onOpenSpecies,
  onAddAnimal,
  onImportCollection,
  t = (_key, options) => options?.defaultValue || '',
}) {
  const { resolvedAppearance, appearanceState } = useAppearance() || {};
  const mode = resolvedAppearance?.mode === 'dark' ? 'dark' : 'light';
  const preset = appearanceState?.preset || 'default';

  return (
    <section className="bp-species-gate flex flex-col gap-3 max-w-md" aria-labelledby="bp-species-gate-message">
      <p id="bp-species-gate-message" className="text-sm text-neutral-700">
        {t('species.gate.message', { defaultValue: 'Open a species first; everything here lives inside one.' })}
      </p>

      {summaries.length ? (
        <ul className="flex flex-col gap-2">
          {summaries.map(summary => (
            <li key={summary.id}>
              <button
                type="button"
                onClick={() => onOpenSpecies?.(summary.id)}
                style={speciesCardStyle(summary.id, { mode, preset })}
                className="w-full min-h-[48px] text-start bg-white border rounded-xl px-3 py-2 flex items-center gap-3 hover:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-sky-400 transition"
              >
                <span
                  aria-hidden="true"
                  className="w-1 self-stretch rounded-full flex-none"
                  style={{ background: 'var(--species-solid)' }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold leading-tight truncate">{summary.name}</span>
                  {summary.scientificName && (
                    <span className="block text-xs italic truncate text-neutral-600">{summary.scientificName}</span>
                  )}
                </span>
                <span className="text-lg font-semibold tabular-nums leading-none">{summary.total}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onAddAnimal?.()}
            className="min-h-[48px] border border-dashed rounded-xl px-3 py-2 text-sm font-medium text-neutral-600 hover:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-sky-400"
          >
            + {t('actions.addAnimalAndSpecies', { defaultValue: 'New animal & species' })}
          </button>
          <button
            type="button"
            onClick={() => onImportCollection?.()}
            className="min-h-[48px] border border-dashed rounded-xl px-3 py-2 text-sm font-medium text-neutral-600 hover:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-sky-400"
          >
            {'↓'} {t('species.dashboard.importCollection', { defaultValue: 'Import your collection' })}
          </button>
        </div>
      )}
    </section>
  );
}
