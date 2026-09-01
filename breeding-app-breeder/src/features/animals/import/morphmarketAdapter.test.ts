import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  buildMorphMarketImportPlan,
  parseMorphMarketDate,
  parseMorphMarketWeight,
  selectRowsToCommit,
  MORPHMARKET_IMPORT_SOURCE,
} from './morphmarketAdapter';
import { resolveSpeciesFromCategory } from './speciesAliases';
import { IMPORT_SOURCES } from './importSource';
import { buildQuickAddGeneticsSource } from '../quickAddGenetics';
import { parseAnimalText } from '../quickAddParser';
import { setActiveSpecies } from '../../../genetics/geneDatabase';
import { DEFAULT_SPECIES_ID } from '../../../genetics/speciesRegistry';

const FIXTURE = readFileSync(new URL('./__fixtures__/morphmarketAnimals.csv', import.meta.url), 'utf8');

const HEADER = "Category*,Title*,Animal_Id*,Maturity,Price,State,Visibility,Enabled,Sex,Dob,Weight,Quantity,Group_Id,Traits,Photo_Urls,Video_Url,Desc,Length,Length_Type,Proven_Breeder,Is_Group,Wholesale_Price,Wholesale_Only,Wholesale_Description,Origin,Diet,Min_Shipping,Max_Shipping,Is_Rep_Photo,Is_Negotiable,Is_For_Trade,Enable 'Buy Now',Last_Update**,First_Listed**,Last_Renewal**,Impression_Count**,Click_Count**,Inquiries_Count**,Mm_Url**,Sires**,Dams**,Private_Notes";

/** Builds a one-row MorphMarket CSV from just the fields a test cares about. */
function csvWith(overrides: Record<string, string> = {}) {
  const values: Record<string, string> = {
    'Category*': 'Ball Pythons',
    'Title*': 'Test Animal',
    'Animal_Id*': '26-M-001',
    Sex: 'Male',
    Dob: '8/7/2026',
    Weight: '180',
    Price: '400',
    State: 'Not For Sale',
    Traits: 'pastel',
    ...overrides,
  };
  const headers = HEADER.split(',');
  const row = headers.map(header => {
    const value = values[header] ?? '';
    return /[",\n]/.test(value) ? '"' + value.replace(/"/g, '""') + '"' : value;
  });
  return HEADER + '\n' + row.join(',') + '\n';
}

/** Stand-in genetics engine. The real one is exercised separately, below. */
const stubGenetics = vi.fn(async (_speciesId: string, traits: string) => ({
  morphs: traits.split(/\s+/).filter(Boolean).map(word => word[0].toUpperCase() + word.slice(1)),
  hets: [],
}));

afterEach(async () => {
  stubGenetics.mockClear();
  await setActiveSpecies(DEFAULT_SPECIES_ID);
});

const single = async (csv: string, options = {}) => {
  const plan = await buildMorphMarketImportPlan(csv, { parseGenetics: stubGenetics, ...options });
  return plan.rows[0];
};

describe('species resolution', () => {
  it('maps the MorphMarket category "Ball Pythons" onto the existing Ball Python species', () => {
    expect(resolveSpeciesFromCategory('Ball Pythons')).toBe('ball-python');
  });

  it('accepts the singular and other well-known wordings of the same species', () => {
    expect(resolveSpeciesFromCategory('Ball Python')).toBe('ball-python');
    expect(resolveSpeciesFromCategory('  ball   pythons ')).toBe('ball-python');
    expect(resolveSpeciesFromCategory('Royal Python')).toBe('ball-python');
  });

  it('is not hard-coded to ball pythons', () => {
    expect(resolveSpeciesFromCategory('Crested Geckos')).toBe('crested-gecko');
    expect(resolveSpeciesFromCategory('Corn Snakes')).toBe('corn-snake');
  });

  it('returns null rather than guessing for a category it does not know', () => {
    expect(resolveSpeciesFromCategory('Aquatic Space Newts')).toBeNull();
    expect(resolveSpeciesFromCategory('')).toBeNull();
  });
});

describe('buildMorphMarketImportPlan', () => {
  it('refuses to map a CSV that is not a MorphMarket export', async () => {
    const plan = await buildMorphMarketImportPlan('Name,ID,Sex\nBoo,1,M\n', { parseGenetics: stubGenetics });
    expect(plan.source).toBe(IMPORT_SOURCES.GENERIC_CSV);
    expect(plan.rows).toHaveLength(0);
  });

  it('maps Title* to the animal name, preserved as supplied', async () => {
    const row = await single(csvWith({ 'Title*': 'Confusion Firefly Lesser Clown #2' }));
    expect(row.animal?.name).toBe('Confusion Firefly Lesser Clown #2');
  });

  it('preserves Animal_Id* exactly, including case and hyphens', async () => {
    const row = await single(csvWith({ 'Animal_Id*': '26-M-242' }));
    expect(row.animal?.id).toBe('26-M-242');
  });

  it('never derives sex, year or species from the characters of the ID', async () => {
    // The id says M and 26; the Sex column says Female. The column wins, always.
    const row = await single(csvWith({ 'Animal_Id*': '26-M-242', Sex: 'Female', Dob: '' }));
    expect(row.animal?.sex).toBe('F');
    expect(row.animal?.birthDate).toBeNull();
  });

  describe('sex', () => {
    it.each([
      ['male', 'M'],
      ['Male', 'M'],
      ['MALE', 'M'],
      ['female', 'F'],
      ['Female', 'F'],
    ])('normalises %s to %s', async (input, expected) => {
      const row = await single(csvWith({ Sex: input }));
      expect(row.animal?.sex).toBe(expected);
      expect(row.warnings.map(w => w.code)).not.toContain('unknown-sex');
    });

    it.each(['?', 'unknown', ''])('treats %s as unknown, with a warning', async input => {
      const row = await single(csvWith({ Sex: input }));
      expect(row.animal?.sex).toBe('U');
      expect(row.warnings.map(w => w.code)).toContain('unknown-sex');
      expect(row.status).not.toBe('error');
    });
  });

  describe('date of birth', () => {
    it('reads MorphMarket US M/D/YYYY rather than trusting the locale', () => {
      // 8/7/2026 is the 7th of August, not the 8th of July.
      expect(parseMorphMarketDate('8/7/2026')).toEqual({ value: '2026-08-07', parsed: true });
      expect(parseMorphMarketDate('12/25/2025')).toEqual({ value: '2025-12-25', parsed: true });
    });

    it('accepts ISO dates from hand-edited sheets', () => {
      expect(parseMorphMarketDate('2026-03-14')).toEqual({ value: '2026-03-14', parsed: true });
    });

    it('refuses to invent a date it cannot read', () => {
      expect(parseMorphMarketDate('sometime last spring')).toEqual({ value: null, parsed: false });
      expect(parseMorphMarketDate('2/30/2026')).toEqual({ value: null, parsed: false });
    });

    it('imports the animal with a valid DOB', async () => {
      const row = await single(csvWith({ Dob: '8/7/2026' }));
      expect(row.animal?.birthDate).toBe('2026-08-07');
      expect(row.warnings.map(w => w.code)).not.toContain('missing-dob');
    });

    it('still imports the animal when DOB is empty, with a non-blocking warning', async () => {
      const row = await single(csvWith({ Dob: '' }));
      expect(row.animal).not.toBeNull();
      expect(row.animal?.birthDate).toBeNull();
      expect(row.status).toBe('warning');
      expect(row.warnings.map(w => w.code)).toContain('missing-dob');
    });

    it('flags an unreadable DOB for review instead of guessing one', async () => {
      const row = await single(csvWith({ Dob: 'last spring' }));
      expect(row.animal?.birthDate).toBeNull();
      expect(row.warnings.map(w => w.code)).toContain('unparsable-dob');
    });
  });

  describe('weight', () => {
    it('reads the value as grams', async () => {
      const row = await single(csvWith({ Weight: '180' }));
      expect(row.animal?.weight).toBe(180);
      expect(parseMorphMarketWeight('1,250')).toEqual({ value: 1250, parsed: true });
    });

    it('still imports the animal when weight is empty', async () => {
      const row = await single(csvWith({ Weight: '' }));
      expect(row.animal).not.toBeNull();
      expect(row.animal?.weight).toBeNull();
      expect(row.status).toBe('warning');
      expect(row.warnings.map(w => w.code)).toContain('missing-weight');
    });

    it('rejects a nonsensical weight rather than writing it', async () => {
      const row = await single(csvWith({ Weight: 'heavy' }));
      expect(row.animal?.weight).toBeNull();
      expect(row.warnings.map(w => w.code)).toContain('invalid-weight');
      expect(row.status).not.toBe('error');
    });
  });

  describe('price and marketplace state', () => {
    it('keeps the numeric price', async () => {
      const row = await single(csvWith({ Price: '400' }));
      expect(row.animal?.price).toBe('400');
    });

    it('never sets forSale, even when MorphMarket says the animal is For Sale', async () => {
      const row = await single(csvWith({ Price: '400', State: 'For Sale' }));
      expect(row.animal?.price).toBe('400');
      expect(row.animal).not.toHaveProperty('forSale');
      expect(row.animal).not.toHaveProperty('isForSale');
      expect(JSON.stringify(row.animal)).not.toMatch(/for sale/i);
    });

    it.each(['For Sale', 'Sold', 'On Hold'])('ignores the MorphMarket State %s entirely', async state => {
      const row = await single(csvWith({ State: state }));
      expect(row.animal).not.toHaveProperty('status');
      expect(row.animal).not.toHaveProperty('forSale');
    });
  });

  describe('genetics', () => {
    it('sends the complete raw Traits string through the injected species-aware parser', async () => {
      await single(csvWith({ 'Category*': 'Ball Pythons', Traits: 'confusion fire pastel clown lesser' }));
      expect(stubGenetics).toHaveBeenCalledWith('ball-python', 'confusion fire pastel clown lesser');
    });

    it('resolves the species BEFORE parsing traits, and parses per species', async () => {
      const csv = HEADER + '\n'
        + 'Crested Geckos,Gecko,CG-1,,,,,,Female,,,,,harlequin pinstripe,'
        + ',,,,,,,,,,,,,,,,,,,,,,,,,,\n';
      await buildMorphMarketImportPlan(csv, { parseGenetics: stubGenetics });
      expect(stubGenetics).toHaveBeenCalledWith('crested-gecko', 'harlequin pinstripe');
    });

    it('keeps the raw Traits string as provenance', async () => {
      const row = await single(csvWith({ Traits: 'confusion fire pastel clown lesser' }));
      expect(row.animal?.importRawTraits).toBe('confusion fire pastel clown lesser');
    });

    it('never parses genetics for a row whose species could not be resolved', async () => {
      await single(csvWith({ 'Category*': 'Aquatic Space Newts' }));
      expect(stubGenetics).not.toHaveBeenCalled();
    });

    it('surfaces genetics the engine could not place instead of picking an interpretation', async () => {
      const noMatch = vi.fn(async () => ({ morphs: [], hets: [], unmatchedNotes: 'sparklebright' }));
      const row = await single(csvWith({ Traits: 'sparklebright' }), { parseGenetics: noMatch });
      expect(row.warnings.map(w => w.code)).toContain('unrecognized-traits');
      expect(row.animal?.morphs).toEqual([]);
    });

    it('actually parses ball python traits through the app own genetics engine', async () => {
      // No stub here: the real species-aware free-text parser, wired the way App.jsx wires it.
      const parseGenetics = async (speciesId: string, traits: string) => {
        const settled = await setActiveSpecies(speciesId);
        return parseAnimalText(traits, buildQuickAddGeneticsSource([], [], [], settled));
      };
      const row = await single(
        csvWith({ Traits: 'confusion fire pastel clown lesser' }),
        { parseGenetics },
      );
      expect(row.animal?.morphs).toEqual(
        expect.arrayContaining(['Confusion', 'Fire', 'Pastel', 'Clown', 'Lesser']),
      );
    });
  });

  describe('animal ID handling', () => {
    it('imports an animal with no Animal_Id*, with a warning and no invented id', async () => {
      const row = await single(csvWith({ 'Animal_Id*': '' }));
      expect(row.animal).not.toBeNull();
      expect(row.animal?.id).toBe('');
      expect(row.status).toBe('warning');
      expect(row.warnings.map(w => w.code)).toContain('missing-animal-id');
    });

    it('raises a conflict when the ID already exists, and defaults to skipping it', async () => {
      const row = await single(csvWith({ 'Animal_Id*': '26-M-242' }), {
        existingAnimals: [{ id: '26-M-242' }],
      });
      expect(row.status).toBe('conflict');
      expect(row.conflictWithId).toBe('26-M-242');
      expect(row.resolution).toBe('skip');
    });

    it('does not silently overwrite or duplicate a conflicting animal', async () => {
      const plan = await buildMorphMarketImportPlan(csvWith({ 'Animal_Id*': '26-M-242' }), {
        parseGenetics: stubGenetics,
        existingAnimals: [{ id: '26-M-242' }],
      });
      const { create, update, skipped } = selectRowsToCommit(plan.rows);
      expect(create).toHaveLength(0);
      expect(update).toHaveLength(0);
      expect(skipped).toHaveLength(1);
    });

    it('writes an update only when the keeper explicitly asks for one', async () => {
      const plan = await buildMorphMarketImportPlan(csvWith({ 'Animal_Id*': '26-M-242' }), {
        parseGenetics: stubGenetics,
        existingAnimals: [{ id: '26-M-242' }],
      });
      plan.rows[0].resolution = 'update';
      const { create, update } = selectRowsToCommit(plan.rows);
      expect(create).toHaveLength(0);
      expect(update).toHaveLength(1);
    });

    it('cannot double a collection when the same export is imported twice', async () => {
      const csv = csvWith({ 'Animal_Id*': '26-M-242' });
      const first = await buildMorphMarketImportPlan(csv, { parseGenetics: stubGenetics });
      expect(selectRowsToCommit(first.rows).create).toHaveLength(1);

      const second = await buildMorphMarketImportPlan(csv, {
        parseGenetics: stubGenetics,
        existingAnimals: [{ id: '26-M-242' }],
      });
      expect(selectRowsToCommit(second.rows).create).toHaveLength(0);
    });

    it('flags a repeated ID inside the same file', async () => {
      const twice = csvWith({ 'Animal_Id*': '26-M-242' })
        + csvWith({ 'Animal_Id*': '26-M-242' }).split('\n')[1] + '\n';
      const plan = await buildMorphMarketImportPlan(twice, { parseGenetics: stubGenetics });
      expect(plan.rows[1].warnings.map(w => w.code)).toContain('duplicate-animal-id-in-file');
    });
  });

  describe('row-level error isolation', () => {
    it('errors one unresolvable-species row and leaves the rest importable', async () => {
      const plan = await buildMorphMarketImportPlan(FIXTURE, { parseGenetics: stubGenetics });
      const errored = plan.rows.filter(row => row.status === 'error');
      expect(errored).toHaveLength(1);
      expect(errored[0].errors.map(e => e.code)).toEqual(['unresolved-species']);
      expect(errored[0].animal).toBeNull();
      expect(plan.summary.importable).toBe(plan.rows.length - 1);
    });

    it('errors a row with no title rather than creating a nameless animal', async () => {
      const row = await single(csvWith({ 'Title*': '' }));
      expect(row.status).toBe('error');
      expect(row.errors.map(e => e.code)).toContain('missing-title');
      expect(row.animal).toBeNull();
    });

    it('never offers an error row for commit', async () => {
      const plan = await buildMorphMarketImportPlan(FIXTURE, { parseGenetics: stubGenetics });
      plan.rows.forEach(row => { row.resolution = 'import'; });
      const { create, failed } = selectRowsToCommit(plan.rows);
      expect(failed).toHaveLength(1);
      expect(create.every(row => row.status !== 'error')).toBe(true);
    });
  });

  describe('ignored MorphMarket fields', () => {
    it('does not carry marketplace or husbandry columns onto the animal', async () => {
      const plan = await buildMorphMarketImportPlan(FIXTURE, { parseGenetics: stubGenetics });
      const animal = plan.rows[0].animal!;
      expect(Object.keys(animal).sort()).toEqual([
        'birthDate', 'hets', 'id', 'importRawTraits', 'importSource', 'importedAt',
        'morphs', 'name', 'price', 'sex', 'species', 'weight',
      ]);
      const serialized = JSON.stringify(animal);
      // Diet, Origin, Desc, Photo_Urls, Mm_Url**, Private_Notes and friends from row 1.
      expect(serialized).not.toMatch(/Frozen\/Thawed|Captive Bred|feeding well|example\.invalid|morphmarket\.com|rack 3/i);
    });
  });

  describe('CSV robustness', () => {
    it('does not shift columns when an ignored description holds commas, quotes and newlines', async () => {
      const plan = await buildMorphMarketImportPlan(FIXTURE, { parseGenetics: stubGenetics });
      const row = plan.rows[1];
      expect(row.animal?.name).toBe('Pastel Yellow Belly Female');
      expect(row.animal?.id).toBe('26-F-186');
      expect(row.animal?.sex).toBe('F');
      expect(row.animal?.birthDate).toBe('2026-03-14');
      expect(row.animal?.weight).toBe(640);
    });

    it('reads a file with CRLF endings and a UTF-8 BOM', async () => {
      const csv = '﻿' + csvWith().replace(/\n/g, '\r\n');
      const plan = await buildMorphMarketImportPlan(csv, { parseGenetics: stubGenetics });
      expect(plan.source).toBe(IMPORT_SOURCES.MORPHMARKET);
      expect(plan.rows[0].animal?.name).toBe('Test Animal');
    });

    it('treats blank, "null" and "undefined" cells as absent rather than as values', async () => {
      const row = await single(csvWith({ 'Animal_Id*': 'null', Dob: 'undefined', Weight: '' }));
      expect(row.animal?.id).toBe('');
      expect(row.animal?.birthDate).toBeNull();
      expect(row.animal?.weight).toBeNull();
    });

    it('skips blank padding rows without reporting them as failures', async () => {
      const plan = await buildMorphMarketImportPlan(csvWith() + ',,,,,,,,\n\n', {
        parseGenetics: stubGenetics,
      });
      expect(plan.rows).toHaveLength(1);
    });
  });

  describe('provenance and summary', () => {
    it('stamps every imported animal with its source and time', async () => {
      const row = await single(csvWith(), { now: () => new Date('2026-09-01T10:00:00Z') });
      expect(row.animal?.importSource).toBe(MORPHMARKET_IMPORT_SOURCE);
      expect(row.animal?.importedAt).toBe('2026-09-01T10:00:00.000Z');
    });

    it('counts the file dynamically for the review screen', async () => {
      const plan = await buildMorphMarketImportPlan(FIXTURE, { parseGenetics: stubGenetics });
      expect(plan.summary).toMatchObject({
        total: 6,
        errors: 1,
        importable: 5,
        male: 3,
        female: 2,
        unknownSex: 1,
        missingAnimalId: 1,
      });
      expect(plan.summary.bySpecies).toEqual([
        { speciesId: 'ball-python', count: 4 },
        { speciesId: 'crested-gecko', count: 1 },
      ]);
    });
  });
});
