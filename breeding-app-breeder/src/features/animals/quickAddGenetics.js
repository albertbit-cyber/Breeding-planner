import { collectLiveGenetics } from './quickAddParser';
import { getGeneAliases, getGeneGroups, normalizeGeneCandidate } from '../../genetics/geneLibrary';
import { resolveSpeciesId } from '../../genetics/speciesRegistry';

/**
 * The vocabulary free-text Quick Add matches against, for ONE species.
 *
 * `speciesId` is not optional in spirit: without it the live-genetics pass below harvested
 * genes off every animal in the collection, so pasting crested gecko text matched "Pastel"
 * because some ball python had it -- inventing a gene the animal cannot carry. Genes only
 * ever come from the target species' table plus animals of that same species.
 */
export function buildQuickAddGeneticsSource(snakes = [], morphAliases = [], geneAliases = [], speciesId = '') {
  // No species yet means no vocabulary. Returning the previous species' genes would be the
  // very leak this function exists to close, so an empty list is the honest answer -- the
  // caller refuses to parse until a species is known, from the picker or from the text.
  if (!speciesId) return [];
  const sameSpecies = (Array.isArray(snakes) ? snakes : [])
    .filter(snake => resolveSpeciesId(snake?.species) === speciesId);
  const live = collectLiveGenetics(sameSpecies);
  const sourceMap = new Map();
  Object.values(getGeneGroups()).forEach(groupList => {
    (groupList || []).forEach(name => {
      const display = String(name || '').trim();
      if (!display) return;
      const key = normalizeGeneCandidate(display);
      if (!key || sourceMap.has(key)) return;
      sourceMap.set(key, { name: display, aliases: [] });
    });
  });

  live.forEach(item => {
    const display = String(item?.name || '').trim();
    if (!display) return;
    const key = normalizeGeneCandidate(display);
    if (!key) return;
    if (!sourceMap.has(key)) {
      sourceMap.set(key, { name: display, aliases: [] });
    }
    const entry = sourceMap.get(key);
    const aliases = Array.isArray(item?.aliases) ? item.aliases : [];
    aliases.forEach(alias => {
      const cleanedAlias = String(alias || '').trim();
      if (!cleanedAlias) return;
      if (!entry.aliases.some(existing => existing.toLowerCase() === cleanedAlias.toLowerCase())) {
        entry.aliases.push(cleanedAlias);
      }
    });
  });

  Object.entries(getGeneAliases()).forEach(([alias, canonical]) => {
    const canonicalKey = normalizeGeneCandidate(canonical || '');
    if (!canonicalKey || !sourceMap.has(canonicalKey)) return;
    const entry = sourceMap.get(canonicalKey);
    const cleanedAlias = String(alias || '').trim();
    if (!cleanedAlias) return;
    if (!entry.aliases.some(existing => existing.toLowerCase() === cleanedAlias.toLowerCase())) {
      entry.aliases.push(cleanedAlias);
    }
  });

  // Morph aliases (e.g. "Batman", "Blackhead DG Clown") are registered by their exact
  // alias name only. We intentionally do NOT auto-generate prefix shorthands here because
  // short prefixes (e.g. "Black" from "BlackheadDGClown") would match unrelated genes
  // and corrupt free-text parsing.
  (Array.isArray(morphAliases) ? morphAliases : []).forEach((entry) => {
    const alias = String(entry?.alias || '').trim();
    const key = normalizeGeneCandidate(alias);
    if (!alias || !key) return;
    if (!sourceMap.has(key)) {
      sourceMap.set(key, { name: alias, aliases: [], shorthand: [] });
    }
  });

  (Array.isArray(geneAliases) ? geneAliases : []).forEach((row) => {
    const geneName = String(row?.geneName || '').trim();
    const key = normalizeGeneCandidate(geneName);
    if (!geneName || !key) return;
    if (!sourceMap.has(key)) {
      sourceMap.set(key, { name: geneName, aliases: [], shorthand: [] });
    }
    const target = sourceMap.get(key);
    if (!Array.isArray(target.aliases)) target.aliases = [];
    if (!Array.isArray(target.shorthand)) target.shorthand = [];

    const aliasValues = Array.isArray(row?.aliases) ? row.aliases : [];
    aliasValues.forEach((alias) => {
      const cleaned = String(alias || '').trim();
      if (!cleaned) return;
      if (!target.aliases.some(existing => existing.toLowerCase() === cleaned.toLowerCase())) {
        target.aliases.push(cleaned);
      }
    });

    const shorthandValues = Array.isArray(row?.shorthand) ? row.shorthand : [];
    shorthandValues.forEach((value) => {
      const cleaned = String(value || '').trim();
      if (!cleaned) return;
      if (!target.shorthand.some(existing => existing.toLowerCase() === cleaned.toLowerCase())) {
        target.shorthand.push(cleaned);
      }
    });
  });

  return [...sourceMap.values()];
}
