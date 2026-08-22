import React, { useMemo } from 'react';
import { listSpecies, listSpeciesGroups } from '../genetics/speciesRegistry';

/**
 * Species picker for an animal, grouped by the taxonomy the gene tables ship with.
 *
 * Deliberately has no default selection: every animal states its species explicitly, so a
 * keeper never discovers later that an animal was silently filed as a ball python. Animals
 * recorded before species existed are a separate case -- they resolve to ball python on
 * read (see resolveSpeciesId), which stays correctable.
 */
export default function SpeciesSelect({
  value = '',
  onChange,
  disabled = false,
  id,
  className = '',
  placeholder = 'Select species…',
}) {
  const optionGroups = useMemo(() => {
    const speciesById = new Map(listSpecies().map(species => [species.id, species]));
    return listSpeciesGroups()
      .map(group => ({
        id: group.id,
        name: group.name,
        species: group.speciesIds
          .map(speciesId => speciesById.get(speciesId))
          .filter(Boolean),
      }))
      .filter(group => group.species.length);
  }, []);

  return (
    <select
      id={id}
      className={className || 'mt-1 w-full border rounded-xl px-2 py-1 bg-white text-sm'}
      value={value || ''}
      disabled={disabled}
      onChange={event => onChange?.(event.target.value)}
    >
      <option value="">{placeholder}</option>
      {optionGroups.map(group => (
        <optgroup key={group.id} label={group.name}>
          {group.species.map(species => (
            <option key={species.id} value={species.id}>
              {species.name}
              {/* Most species have no published morphs. Saying so up front explains why the
                  genetics picker will be empty, rather than letting it look broken. */}
              {species.traitsFile ? '' : ' — no morph data'}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
