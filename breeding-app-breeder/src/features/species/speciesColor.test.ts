import { describe, expect, it } from 'vitest';
import { getSpeciesHue, getSpeciesTier, prefersUntintedSurfaces, speciesCardStyle, SPECIES_TINT_ALPHA } from './speciesColor';
import { listSpecies } from '../../genetics/speciesRegistry';

describe('species hue', () => {
  it('is fixed to the species, not to the collection', () => {
    // The whole point: adding a species must not repaint the ones already learned. Deriving
    // from the catalogue rather than from the keeper's own list is what guarantees that.
    const before = getSpeciesHue('ball-python');
    const others = ['crested-gecko', 'corn-snake', 'kingsnake'].map(getSpeciesHue);
    expect(getSpeciesHue('ball-python')).toBe(before);
    expect(others.every(hue => typeof hue === 'number')).toBe(true);
  });

  it('gives a distinct hue to species that sit next to each other in the catalogue', () => {
    // Golden-angle spacing exists so catalogue neighbours land far apart on the wheel --
    // otherwise the pythons would all be the same colour.
    const ids = listSpecies().slice(0, 6).map(species => species.id);
    const hues = ids.map(getSpeciesHue);
    hues.slice(1).forEach((hue, index) => {
      const gap = Math.abs(hue - hues[index]);
      const wrapped = Math.min(gap, 360 - gap);
      expect(wrapped, `${ids[index]} and ${ids[index + 1]} are too close`).toBeGreaterThan(30);
    });
  });

  it('stays inside the colour wheel', () => {
    listSpecies().forEach((species) => {
      const hue = getSpeciesHue(species.id);
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThan(360);
    });
  });

  it('does not throw on an unknown species', () => {
    // A card with an odd colour beats a dashboard that will not render.
    expect(getSpeciesHue('not-a-species')).toBe(0);
    expect(getSpeciesHue('')).toBe(0);
    expect(getSpeciesHue(undefined)).toBe(0);
  });
});

describe('appearance presets', () => {
  it('recognises the two presets chosen for contrast', () => {
    expect(prefersUntintedSurfaces('highContrast')).toBe(true);
    expect(prefersUntintedSurfaces('visualImpaired')).toBe(true);
    expect(prefersUntintedSurfaces('default')).toBe(false);
    expect(prefersUntintedSurfaces('darkBreeder')).toBe(false);
  });

  it('tints normal presets at the requested strength', () => {
    const style = speciesCardStyle('ball-python', { mode: 'light', preset: 'default' });
    expect(style['--species-tint']).toContain(`/ ${SPECIES_TINT_ALPHA}`);
    expect(style['--species-edge']).toBe('0px');
  });

  it('replaces the wash with an edge bar on contrast presets', () => {
    // Washing colour across a preset chosen for legibility would undo the reason it exists.
    const style = speciesCardStyle('ball-python', { mode: 'light', preset: 'visualImpaired' });
    expect(style['--species-tint']).toBe('transparent');
    expect(style['--species-edge']).not.toBe('0px');
    // The identity colour survives, just in a form that cannot hurt contrast.
    expect(style['--species-solid']).toContain('hsl(');
  });

  it('darkens the tint on dark mode so it sits under light text', () => {
    const light = speciesCardStyle('corn-snake', { mode: 'light', preset: 'default' });
    const dark = speciesCardStyle('corn-snake', { mode: 'dark', preset: 'default' });
    expect(light['--species-tint']).not.toBe(dark['--species-tint']);
    // Same hue in both, only the lightness band changes.
    expect(light['--species-hue']).toBe(dark['--species-hue']);
  });
});

describe('separation across the whole catalogue', () => {
  it('never leaves two species with both a close hue and the same tier', () => {
    // The real failure mode: a keeper owns an arbitrary subset, and golden-angle spacing
    // collides at Fibonacci gaps (8, 13, 21 apart). Hue alone is not enough, so any pair that
    // is close in hue must be separated by lightness instead.
    const species = listSpecies();
    const offenders: string[] = [];

    for (let i = 0; i < species.length; i += 1) {
      for (let j = i + 1; j < species.length; j += 1) {
        const a = species[i].id;
        const b = species[j].id;
        const gap = Math.abs(getSpeciesHue(a) - getSpeciesHue(b));
        const hueDistance = Math.min(gap, 360 - gap);
        if (hueDistance < 25 && getSpeciesTier(a) === getSpeciesTier(b)) {
          offenders.push(`${a} / ${b} (${hueDistance}° apart, tier ${getSpeciesTier(a)})`);
        }
      }
    }

    expect(offenders, offenders.slice(0, 5).join('; ')).toEqual([]);
  });
});
