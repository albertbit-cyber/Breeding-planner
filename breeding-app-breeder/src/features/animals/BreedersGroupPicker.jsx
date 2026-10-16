import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getSpeciesById } from '../../genetics/speciesRegistry';
import { help } from '../help/help';

/**
 * Puts chosen animals into the Breeders group, which is where pairing and the Breeding
 * Advisor look for parents.
 *
 * Nothing starts ticked. The app cannot tell a breeding adult from a holdback or a
 * hatchling, so it offers the shortcuts and the keeper decides. An animal has one group,
 * so each row says which group it would leave: the move is never silent.
 */
export default function BreedersGroupPicker({
  males: allMales = [],
  females: allFemales = [],
  onAdd,
  primaryButtonClass = 'appearance-btn appearance-btn--filled',
  heading = null,
}) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState(() => new Set());
  // Kept here as well as in the collection, because the import result hands over a list
  // taken at the moment of the write and does not see the move.
  const [addedIds, setAddedIds] = useState(() => new Set());
  const addedCount = addedIds.size;
  const males = useMemo(() => allMales.filter(animal => !addedIds.has(animal.id)), [allMales, addedIds]);
  const females = useMemo(() => allFemales.filter(animal => !addedIds.has(animal.id)), [allFemales, addedIds]);

  const rows = useMemo(() => [
    ...males.map(animal => ({ animal, sexSymbol: '♂' })),
    ...females.map(animal => ({ animal, sexSymbol: '♀' })),
  ], [males, females]);

  // An import can span species, and pairing never crosses one, so a mixed list names each.
  const showSpecies = new Set(rows.map(({ animal }) => animal.species || '')).size > 1;

  const toggle = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // A shortcut selects that whole sex, or clears it again once it is all selected.
  const toggleAll = (animals) => {
    setSelected(prev => {
      const next = new Set(prev);
      const allIn = animals.length > 0 && animals.every(animal => next.has(animal.id));
      animals.forEach(animal => (allIn ? next.delete(animal.id) : next.add(animal.id)));
      return next;
    });
  };

  if (addedCount > 0 && !rows.length) {
    return (
      <p className="text-sm text-emerald-700" role="status">
        {t('breedersPicker.added', {
          count: addedCount,
          defaultValue: '{{count}} added to Breeders. They can be paired now.',
        })}
      </p>
    );
  }

  if (!rows.length) {
    return (
      <p className="text-sm text-neutral-500">
        {t('breedersPicker.noCandidates', {
          defaultValue: 'No sexed animals outside the Breeders group. Set an animal’s sex to make it pairable.',
        })}
      </p>
    );
  }

  const allMalesSelected = males.length > 0 && males.every(animal => selected.has(animal.id));
  const allFemalesSelected = females.length > 0 && females.every(animal => selected.has(animal.id));

  return (
    <div className="space-y-3">
      {heading}
      {addedCount > 0 && (
        <p className="text-sm text-emerald-700" role="status">
          {t('breedersPicker.added', {
            count: addedCount,
            defaultValue: '{{count}} added to Breeders. They can be paired now.',
          })}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          {...help('animals-breeders-select-all')}
          className="text-xs px-3 py-2 rounded-lg border bg-white disabled:opacity-50"
          aria-pressed={allMalesSelected}
          disabled={!males.length}
          onClick={() => toggleAll(males)}
        >
          {t('breedersPicker.allMales', { count: males.length, defaultValue: 'Select all males ({{count}})' })}
        </button>
        <button
          type="button"
          {...help('animals-breeders-select-all')}
          className="text-xs px-3 py-2 rounded-lg border bg-white disabled:opacity-50"
          aria-pressed={allFemalesSelected}
          disabled={!females.length}
          onClick={() => toggleAll(females)}
        >
          {t('breedersPicker.allFemales', { count: females.length, defaultValue: 'Select all females ({{count}})' })}
        </button>
      </div>
      <ul className="border rounded-xl bg-white max-h-56 overflow-auto divide-y">
        {rows.map(({ animal, sexSymbol }) => {
          const currentGroup = Array.isArray(animal.groups) ? animal.groups[0] : animal.groups;
          return (
            <li key={animal.id}>
              <label {...help('animals-breeders-pick')} className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.has(animal.id)}
                  onChange={() => toggle(animal.id)}
                />
                <span className="w-4 text-neutral-500" aria-hidden="true">{sexSymbol}</span>
                <span className="min-w-0 flex-1 truncate">
                  <bdi>{animal.name || animal.id}</bdi>
                  {showSpecies && animal.species ? (
                    <span className="block text-[11px] text-neutral-500 truncate">
                      {getSpeciesById(animal.species)?.name || animal.species}
                    </span>
                  ) : null}
                </span>
                {currentGroup ? (
                  <span className="text-[11px] text-neutral-500 truncate max-w-[40%]">
                    {t('breedersPicker.currentGroup', { group: currentGroup, defaultValue: 'now in {{group}}' })}
                  </span>
                ) : null}
              </label>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        {...help('animals-breeders-add')}
        className={`px-3 py-2 rounded-xl text-sm ${primaryButtonClass} disabled:opacity-50`}
        disabled={!selected.size}
        onClick={() => {
          const ids = Array.from(selected);
          onAdd?.(ids);
          setAddedIds(prev => new Set([...prev, ...ids]));
          setSelected(new Set());
        }}
      >
        {selected.size
          ? t('breedersPicker.add', { count: selected.size, defaultValue: 'Add {{count}} to Breeders' })
          : t('breedersPicker.addNone', { defaultValue: 'Add to Breeders' })}
      </button>
    </div>
  );
}

/**
 * What pairing and the Advisor show instead of a dead end when the Breeders group cannot
 * yet make a pair: one sentence on why, and the picker one tap away.
 */
export function BreedersGroupGate({
  breederMaleCount = 0,
  breederFemaleCount = 0,
  candidateMales = [],
  candidateFemales = [],
  onAdd,
  primaryButtonClass,
  purpose = 'pairing',
  onAddAnimal,
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  if (breederMaleCount > 0 && breederFemaleCount > 0) return null;

  const missing = !breederMaleCount && !breederFemaleCount
    ? 'both'
    : !breederMaleCount ? 'male' : 'female';
  const reasons = purpose === 'advisor'
    ? {
      both: t('breedersPicker.gate.advisorEmpty', { defaultValue: 'The Advisor suggests pairs from the Breeders group, and that group is empty.' }),
      male: t('breedersPicker.gate.advisorNoMale', { defaultValue: 'The Advisor suggests pairs from the Breeders group, and it has no male yet.' }),
      female: t('breedersPicker.gate.advisorNoFemale', { defaultValue: 'The Advisor suggests pairs from the Breeders group, and it has no female yet.' }),
    }
    : {
      both: t('breedersPicker.gate.pairingEmpty', { defaultValue: 'Pairing picks parents from the Breeders group, and that group is empty.' }),
      male: t('breedersPicker.gate.pairingNoMale', { defaultValue: 'Pairing picks parents from the Breeders group, and it has no male yet.' }),
      female: t('breedersPicker.gate.pairingNoFemale', { defaultValue: 'Pairing picks parents from the Breeders group, and it has no female yet.' }),
    };
  const reason = reasons[missing];
  // Nothing to choose from for the missing side means the next step is a new animal, not a list.
  const canChoose = missing === 'male'
    ? candidateMales.length > 0
    : missing === 'female'
      ? candidateFemales.length > 0
      : candidateMales.length + candidateFemales.length > 0;

  return (
    <div className="text-sm bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-3">
      <p {...help('animals-breeders-gate')} className="text-amber-900">{reason}</p>
      {!canChoose ? (
        typeof onAddAnimal === 'function' ? (
          <button
            type="button"
            {...help('animals-breeders-add-animal')}
            className="text-sm px-3 py-2 rounded-xl border border-amber-300 bg-white text-amber-900 font-medium"
            onClick={onAddAnimal}
          >
            {missing === 'male'
              ? t('breedersPicker.addMale', { defaultValue: 'Add a male' })
              : missing === 'female'
                ? t('breedersPicker.addFemale', { defaultValue: 'Add a female' })
                : t('breedersPicker.addAnimal', { defaultValue: 'Add an animal' })}
          </button>
        ) : null
      ) : open ? (
        <BreedersGroupPicker
          males={candidateMales}
          females={candidateFemales}
          onAdd={onAdd}
          primaryButtonClass={primaryButtonClass}
        />
      ) : (
        <button
          type="button"
          {...help('animals-breeders-choose')}
          className="text-sm px-3 py-2 rounded-xl border border-amber-300 bg-white text-amber-900 font-medium"
          onClick={() => setOpen(true)}
        >
          {t('breedersPicker.choose', { defaultValue: 'Choose animals for the Breeders group' })}
        </button>
      )}
    </div>
  );
}
