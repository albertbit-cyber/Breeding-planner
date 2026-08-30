import { listSpecies } from '../../genetics/speciesRegistry';

/**
 * A colour that belongs to a species and never moves.
 *
 * The hue comes from the species' position in the generated catalogue, spaced by the golden
 * angle. Deriving it from the catalogue rather than from the keeper's own collection is the
 * point: adding a fourth species must not repaint the three they already recognise.
 *
 * The golden angle is kept deliberately. A rotation of 182.75 spreads all 64 species more
 * evenly on paper, but it lands species TWO apart in the catalogue only 5.5 degrees apart --
 * and species near each other in the catalogue are taxonomically related, so they are exactly
 * the ones a keeper is likely to own together. The golden angle keeps any two species within
 * six catalogue positions at least 32 degrees apart, which is the case that matters.
 */
const SPECIES_HUE_ROTATION = 137.508;

/**
 * Lightness/saturation tiers, used as a second axis alongside hue.
 *
 * Hue alone cannot separate 64 species: at best they sit 5.6 degrees apart, which is not a
 * visible difference. Worse, the golden angle collides at Fibonacci gaps -- species 8, 21 or
 * 55 positions apart land within a few degrees. Lightness is the second axis that resolves it.
 *
 * Ten paints, `index % 10`, which is the smallest modulus that leaves NO pair of species both
 * close in hue and identical in paint. They are expressed as five lightness steps crossed with
 * two saturation levels rather than ten lightness steps, so the set still reads as one family.
 */
const TIER_LIGHTNESS = {
  light: [56, 49, 63, 45, 67],
  dark: [46, 39, 53, 35, 57],
};
const TIER_SATURATION = {
  light: [64, 46],
  dark: [56, 40],
};
const TIER_COUNT = 10;

/** The alpha the tint is applied at. Asked for as "not 100%, maybe 60%". */
export const SPECIES_TINT_ALPHA = 0.6;

/**
 * Presets that exist to guarantee contrast. Washing a colour across them would undo exactly
 * what a keeper chose them for, so on these the species colour appears as a solid edge bar
 * instead -- identity kept, contrast untouched.
 */
const CONTRAST_PRESETS = new Set(['highContrast', 'visualImpaired']);

let paintByIdCache = null;

function paintIndex() {
  if (paintByIdCache) return paintByIdCache;
  paintByIdCache = new Map();
  listSpecies().forEach((species, index) => {
    paintByIdCache.set(species.id, {
      hue: Math.round((index * SPECIES_HUE_ROTATION) % 360),
      tier: index % TIER_COUNT,
    });
  });
  return paintByIdCache;
}

/**
 * Hue in degrees for a species. Unknown ids fall back to 0 rather than throwing -- a card
 * with an odd colour is better than a dashboard that will not render.
 */
export function getSpeciesHue(speciesId) {
  const key = String(speciesId ?? '').trim();
  if (!key) return 0;
  return paintIndex().get(key)?.hue ?? 0;
}

/** The lightness/saturation tier for a species. Exposed so its spread can be asserted. */
export function getSpeciesTier(speciesId) {
  const key = String(speciesId ?? '').trim();
  if (!key) return 0;
  return paintIndex().get(key)?.tier ?? 0;
}

/** True when the active appearance preset must not be tinted. */
export function prefersUntintedSurfaces(presetKey) {
  return CONTRAST_PRESETS.has(String(presetKey ?? '').trim());
}

/**
 * The CSS custom properties a species card needs. Returned as a style object so the component
 * stays declarative and every colour decision lives here.
 */
export function speciesCardStyle(speciesId, { mode = 'light', preset = 'default' } = {}) {
  const hue = getSpeciesHue(speciesId);
  const tier = getSpeciesTier(speciesId);
  const key = mode === 'dark' ? 'dark' : 'light';
  const band = {
    l: TIER_LIGHTNESS[key][tier % 5],
    s: TIER_SATURATION[key][Math.floor(tier / 5) % 2],
  };
  const untinted = prefersUntintedSurfaces(preset);
  return {
    '--species-hue': String(hue),
    // Solid form, used for the edge bar and any place the colour must stay legible.
    '--species-solid': `hsl(${hue} ${band.s}% ${band.l}%)`,
    // Washed form for the livestock half. Transparent on contrast presets so the surface
    // underneath shows through untouched.
    '--species-tint': untinted
      ? 'transparent'
      : `hsl(${hue} ${band.s}% ${band.l}% / ${SPECIES_TINT_ALPHA})`,
    '--species-edge': untinted ? '6px' : '0px',
  };
}
