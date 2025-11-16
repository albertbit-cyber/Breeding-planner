import {
  splitMorphHetInput,
  computeGeneInitialSegment,
  generateSnakeId,
  extractYearFromDateString,
  extractSequenceFromId,
  normalizeBackupSettings,
  backupFrequencyToMs,
  sanitizeSnakeRecord,
  sanitizePairingRecord,
  normalizeBackupSnapshot,
  normalizeBackupFileEntry,
  normalizeBackupVault,
  normalizeExportFieldSelection,
  ANIMAL_EXPORT_FIELD_DEFS,
  DEFAULT_ANIMAL_EXPORT_FIELDS,
  PAIRING_EXPORT_FIELD_DEFS,
  DEFAULT_PAIRING_EXPORT_FIELDS,
  buildAnimalExportDataset,
  buildPairingExportDataset,
} from './App.jsx';

describe('splitMorphHetInput', () => {
  it('parses morphs separated by spaces', () => {
    const { morphs, hets } = splitMorphHetInput('Pastel Mojave Clown');
    expect(morphs).toEqual(['Pastel', 'Mojave', 'Clown']);
    expect(hets).toEqual([]);
  });

  it('parses compact morph strings without delimiters', () => {
    const { morphs, hets } = splitMorphHetInput('PastelMojaveClown');
    expect(morphs).toEqual(['Pastel', 'Mojave', 'Clown']);
    expect(hets).toEqual([]);
  });

  it('handles super prefixes in compact strings', () => {
    const { morphs } = splitMorphHetInput('SuperPastelMojave');
    expect(morphs).toEqual(['Super Pastel', 'Mojave']);
  });

  it('parses het descriptors without spaces', () => {
    const { morphs, hets } = splitMorphHetInput('PastelMojave50%hetClown');
    expect(morphs).toEqual(['Pastel', 'Mojave']);
    expect(hets).toEqual(['50% Clown']);
  });

  it('separates morphs and hets when comma separated', () => {
    const { morphs, hets } = splitMorphHetInput('Butter, 66% het Clown');
    expect(morphs).toEqual(['Butter']);
    expect(hets).toEqual(['66% Clown']);
  });

  it('normalizes possiable qualifiers into Possible het entries', () => {
    const { morphs, hets } = splitMorphHetInput('Butter possiable het Clown');
    expect(morphs).toEqual(['Butter']);
    expect(hets).toEqual(['Possible Clown']);
  });
});

describe('computeGeneInitialSegment', () => {
  it('abbreviates morph genes using uppercase initials', () => {
    expect(computeGeneInitialSegment(['Yellow Belly'], [])).toBe('YB');
    expect(computeGeneInitialSegment(['Pastel Yellow Belly'], [])).toBe('PYB');
    expect(computeGeneInitialSegment(['Clown'], [])).toBe('CLO');
  });

  it('concatenates morph abbreviations without separators', () => {
    expect(computeGeneInitialSegment(['Fire', 'Clown'], [])).toBe('FIRCLO');
  });

  it('appends het abbreviations with lowercase h and optional percent', () => {
    expect(computeGeneInitialSegment(['Butter'], ['66% Clown'])).toBe('BUT66%hCLO');
    expect(computeGeneInitialSegment(['Hydra', 'Butter'], ['Clown'])).toBe('HYDBUThCLO');
  });

  it('handles het-only inputs', () => {
    expect(computeGeneInitialSegment([], ['50% Clown'])).toBe('50%hCLO');
  });

  it('applies custom abbreviations for monarch and monsoon', () => {
    expect(computeGeneInitialSegment(['Monarch'], [])).toBe('MONA');
    expect(computeGeneInitialSegment(['Monsoon'], [])).toBe('MONS');
  });

  it('adds a lowercase pos prefix for possiable hets', () => {
    expect(computeGeneInitialSegment([], ['Possiable het Clown'])).toBe('poshCLO');
  });
});

describe('extractYearFromDateString', () => {
  it('returns numeric year for ISO date strings', () => {
    expect(extractYearFromDateString('2024-05-17')).toBe(2024);
  });

  it('returns numeric year when only year provided', () => {
    expect(extractYearFromDateString('1999')).toBe(1999);
  });

  it('returns null for invalid inputs', () => {
    expect(extractYearFromDateString('May 5th')).toBeNull();
    expect(extractYearFromDateString('')).toBeNull();
  });
});

describe('generateSnakeId sequence allocation', () => {
  const baseConfig = { template: '[YROB][GEN3][-][SEX]-[SEQ]', sequencePadding: 1, uppercase: false, customText: '' };
  const extractSequence = id => {
    const match = id.match(/(\d+)$/);
    return match ? match[1] : null;
  };

  it('increments the sequence globally regardless of prefix', () => {
    const id1 = generateSnakeId('Alpha', 2025, [], null, { idConfig: baseConfig, sex: 'F' });
    const id2 = generateSnakeId('Bravo', 2025, [id1], null, { idConfig: baseConfig, sex: 'M' });
    const id3 = generateSnakeId('Charlie', 2025, [id1, id2], null, { idConfig: baseConfig, sex: 'F' });

    expect(extractSequence(id1)).toBe('1');
    expect(extractSequence(id2)).toBe('2');
    expect(extractSequence(id3)).toBe('3');
  });

  it('ignores preferred sequence overrides to maintain strict increments', () => {
    const first = generateSnakeId('Delta', 2025, [], null, { idConfig: baseConfig });
    const second = generateSnakeId('Echo', 2025, [first], null, { idConfig: baseConfig });
    const existing = [first, second];

    const nextId = generateSnakeId('Foxtrot', 2025, existing, 1, { idConfig: baseConfig });
    expect(extractSequence(nextId)).toBe('3');
  });
});

describe('generateSnakeId birth-year tokens', () => {
  it('uses birth-year tokens and literal dash separator', () => {
    const config = { template: '[YROB][-][YEAROB][-][SEQ]', sequencePadding: 2, uppercase: false, customText: '' };
    const id = generateSnakeId('Gamma', 2025, [], null, {
      idConfig: config,
      birthYear: 2023,
    });
    expect(id).toBe('23-2023-01');
  });

  it('falls back to the main year when birth year is missing', () => {
    const config = { template: '[YROB][SEQ]', sequencePadding: 1, uppercase: false, customText: '' };
    const id = generateSnakeId('Hotel', 2024, [], null, { idConfig: config });
    expect(id).toBe('241');
  });
});

describe('generateSnakeId sequence persistence', () => {
  const config = { template: '[YROB][GEN3][-][SEX]-[SEQ]', sequencePadding: 3, uppercase: false, customText: '' };

  it('aligns the next sequence with the current snake count even when higher numbers are reserved', () => {
    const existing = [
      { id: 'CustomAlpha', idSequence: 5 },
  { id: '25BETA-F-006' },
    ];

    const next = generateSnakeId('Gamma', 2025, existing, null, { idConfig: config });
    expect(extractSequenceFromId(next, config)).toBe(3);
  });

  it('skips reserved numbers that collide with the expected count-based sequence', () => {
    const existing = [
  { id: '25ALPHA-F-001' },
      { id: 'Legacy', idSequence: 3 },
    ];

    const next = generateSnakeId('Beta', 2025, existing, null, { idConfig: config });
    expect(extractSequenceFromId(next, config)).toBe(4);
  });

  it('reuses a forced sequence when provided', () => {
    const others = [
  { id: '25DELTA-M-002', idSequence: 2 },
      { id: 'Special', idSequence: 8 },
    ];

    const updated = generateSnakeId('Alpha', 2025, others, null, { idConfig: config, forceSequence: 3 });
    expect(extractSequenceFromId(updated, config)).toBe(3);
  });
});

describe('extractSequenceFromId', () => {
  it('pulls the numeric sequence using the configured template', () => {
    const config = { template: '[PREFIX]-[SEQ]', sequencePadding: 2, uppercase: false, customText: '' };
    expect(extractSequenceFromId('ALPHA-07', config)).toBe(7);
  });

  it('returns null when the id does not match the template', () => {
    const config = { template: '[PREFIX]-[SEQ]', sequencePadding: 2, uppercase: false, customText: '' };
    expect(extractSequenceFromId('NoDigitsHere', config)).toBeNull();
  });
});

describe('normalizeBackupSettings', () => {
  it('falls back to defaults when given no input', () => {
    const result = normalizeBackupSettings(undefined);
    expect(result).toMatchObject({ frequency: 'off', lastRun: null });
    expect(result.maxVaultEntries).toBeGreaterThan(0);
  });

  it('coerces unsupported frequencies to off while preserving lastRun', () => {
    const result = normalizeBackupSettings({ frequency: 'hourly', lastRun: '2025-05-01T00:00:00.000Z' });
    expect(result).toMatchObject({ frequency: 'off', lastRun: '2025-05-01T00:00:00.000Z' });
    expect(result.maxVaultEntries).toBeGreaterThan(0);
  });

  it('keeps supported frequencies and normalizes lastRun', () => {
    const result = normalizeBackupSettings({ frequency: 'weekly', lastRun: 42 });
    expect(result).toMatchObject({ frequency: 'weekly', lastRun: null });
    expect(result.maxVaultEntries).toBeGreaterThan(0);
  });

  it('allows unlimited retention when requested', () => {
    const result = normalizeBackupSettings({ maxVaultEntries: 'unlimited' });
    expect(result.maxVaultEntries).toBeNull();
    expect(result.frequency).toBe('off');
  });
});

describe('backupFrequencyToMs', () => {
  it('maps known frequencies to milliseconds', () => {
    expect(backupFrequencyToMs('nightly')).toBe(24 * 60 * 60 * 1000);
    expect(backupFrequencyToMs('weekly')).toBe(7 * 24 * 60 * 60 * 1000);
    expect(backupFrequencyToMs('monthly')).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it('returns null for unsupported values', () => {
    expect(backupFrequencyToMs('once')).toBeNull();
  });
});

describe('sanitizeSnakeRecord', () => {
  it('normalizes lists and trims values', () => {
    const raw = {
      morphs: [' Enchi ', ''],
      hets: [null, ' Clown '],
      tags: ['holdback', undefined],
      groups: 'Breeders',
      logs: { feeds: [{ date: '2025-01-01' }], weights: [], sheds: [], cleanings: [], meds: [] },
    };
    const sanitized = sanitizeSnakeRecord(raw);
    expect(sanitized?.morphs).toEqual(['Enchi']);
    expect(sanitized?.hets).toEqual(['Clown']);
    expect(sanitized?.tags).toEqual(['holdback']);
    expect(sanitized?.groups).toEqual(['Breeders']);
    expect(sanitized?.logs.feeds).toEqual([{ date: '2025-01-01' }]);
    expect(sanitized?.logs.feeds).not.toBe(raw.logs.feeds);
  });

  it('returns null for invalid input', () => {
    expect(sanitizeSnakeRecord(null)).toBeNull();
  });
});

describe('sanitizePairingRecord', () => {
  it('wraps raw data with lifecycle defaults', () => {
    const sanitized = sanitizePairingRecord({ id: 'pair-1', ovulation: { date: '2025-05-01' } });
    expect(sanitized?.id).toBe('pair-1');
    expect(sanitized?.ovulation.date).toBe('2025-05-01');
    expect(sanitized?.clutch).toBeDefined();
  });

  it('returns null for invalid input', () => {
    expect(sanitizePairingRecord(undefined)).toBeNull();
  });
});

describe('normalizeBackupSnapshot', () => {
  it('returns null when required fields are missing', () => {
    expect(normalizeBackupSnapshot({ savedAt: '', payload: {} })).toBeNull();
    expect(normalizeBackupSnapshot({ savedAt: '2025-01-01T00:00:00.000Z' })).toBeNull();
  });

  it('returns the snapshot when savedAt and payload are valid', () => {
    const payload = { snakes: [], pairings: [] };
    const snapshot = normalizeBackupSnapshot({ savedAt: '2025-01-01T00:00:00.000Z', payload });
    expect(snapshot).toEqual({ savedAt: '2025-01-01T00:00:00.000Z', payload });
    expect(snapshot?.payload).toBe(payload);
  });
});

describe('normalizeBackupFileEntry', () => {
  it('returns null without a payload', () => {
    expect(normalizeBackupFileEntry({ id: 'x' })).toBeNull();
  });

  it('normalizes id, name, and payload', () => {
    const entry = normalizeBackupFileEntry({
      id: 'file-1',
      name: 'Test backup',
      createdAt: '2025-05-01T00:00:00.000Z',
      updatedAt: '2025-05-02T00:00:00.000Z',
      source: 'auto',
      payload: { snakes: [] },
    });
    expect(entry).toEqual({
      id: 'file-1',
      name: 'Test backup',
      createdAt: '2025-05-01T00:00:00.000Z',
      updatedAt: '2025-05-02T00:00:00.000Z',
      source: 'auto',
      payload: { snakes: [] },
    });
  });
});

describe('normalizeBackupVault', () => {
  it('filters invalid entries and sorts by createdAt desc', () => {
    const entries = normalizeBackupVault([
      { id: 'one', name: 'One', createdAt: '2025-01-01T00:00:00.000Z', source: 'manual', payload: { snakes: [] } },
      { id: 'two', name: 'Two', createdAt: '2025-06-01T00:00:00.000Z', source: 'auto', payload: { pairings: [] } },
      { id: 'bad' },
    ]);
    expect(entries.map(e => e.id)).toEqual(['two', 'one']);
  });
});

const BASE_SNAKES = [
  {
    id: 'F1',
    name: 'Ivy',
    sex: 'F',
    weight: 1500,
    morphs: ['Pastel'],
    hets: ['Clown'],
    tags: ['breeder'],
    groups: ['Main'],
    status: 'Active',
    sireId: 'SIRE-1',
    damId: 'DAM-1',
    logs: {
      feeds: [{ date: '2025-04-01', feed: 'Rat', size: 'Small', weightGrams: 120 }],
      weights: [{ date: '2025-03-15', grams: 1500 }],
      sheds: [{ date: '2025-03-20' }],
      cleanings: [{ date: '2025-04-10' }],
      meds: [],
    },
  },
  {
    id: 'M1',
    name: 'Atlas',
    sex: 'M',
    weight: 900,
    morphs: ['Enchi'],
    hets: [],
    tags: ['breeder'],
    groups: ['Main'],
    status: 'Active',
    logs: {
      feeds: [{ date: '2025-04-05', feed: 'Mouse', size: 'Medium' }],
      weights: [{ date: '2025-03-10', grams: 900 }],
      sheds: [],
      cleanings: [],
      meds: [],
    },
  },
];

const BASE_PAIRINGS = [
  {
    id: 'PAIR-1',
    femaleId: 'F1',
    maleId: 'M1',
    label: '',
    startDate: '2025-01-15',
    ovulation: { observed: true, date: '2025-02-01' },
    preLayShed: { observed: true, date: '2025-02-22' },
    clutch: { recorded: true, date: '2025-03-01', eggsTotal: 6, fertileEggs: 5, slugs: 1 },
    hatch: { recorded: true, date: '2025-05-25', hatchedCount: 5 },
    goals: ['Clown project'],
  },
];

const clone = (value) => JSON.parse(JSON.stringify(value));

describe('normalizeExportFieldSelection', () => {
  it('falls back to defaults when selection is empty', () => {
    expect(
      normalizeExportFieldSelection([], DEFAULT_ANIMAL_EXPORT_FIELDS, ANIMAL_EXPORT_FIELD_DEFS)
    ).toEqual(DEFAULT_ANIMAL_EXPORT_FIELDS);
  });

  it('filters unknown keys while preserving order', () => {
    const result = normalizeExportFieldSelection(
      ['unknown', 'name', 'id'],
      DEFAULT_ANIMAL_EXPORT_FIELDS,
      ANIMAL_EXPORT_FIELD_DEFS
    );
    expect(result).toEqual(['name', 'id']);
  });
});

describe('buildAnimalExportDataset', () => {
  it('includes selected fields and derived values', () => {
    const snakes = clone(BASE_SNAKES);
    const pairings = clone(BASE_PAIRINGS);
    const selection = ['id', 'name', 'projects', 'lastFeedDate', 'lastWeightGrams'];
    const dataset = buildAnimalExportDataset(snakes, pairings, selection);
    expect(dataset.columns.map(col => col.key)).toEqual(selection);
    expect(dataset.rows).toHaveLength(snakes.length);
    const femaleRow = dataset.rows.find(row => row.id === 'F1');
    expect(femaleRow).toBeDefined();
    expect(femaleRow.projects).toBe('Ivy × Atlas');
    expect(femaleRow.lastFeedDate).toBe('01/04/2025');
    expect(femaleRow.lastWeightGrams).toBe(1500);
    const maleRow = dataset.rows.find(row => row.id === 'M1');
    expect(maleRow?.projects).toBe('Ivy × Atlas');
  });
});

describe('buildPairingExportDataset', () => {
  it('derives participant names, status, and counts', () => {
    const pairings = clone(BASE_PAIRINGS);
    const snakes = clone(BASE_SNAKES);
    const selection = ['label', 'femaleName', 'maleName', 'status', 'eggsTotal', 'hatchedCount', 'cycleYear'];
    const dataset = buildPairingExportDataset(pairings, snakes, selection);
    expect(dataset.columns.map(col => col.key)).toEqual(selection);
    expect(dataset.rows).toHaveLength(1);
    const row = dataset.rows[0];
    expect(row.label).toBe('Ivy × Atlas');
    expect(row.femaleName).toBe('Ivy');
    expect(row.maleName).toBe('Atlas');
    expect(row.status).toBe('Hatched');
    expect(row.eggsTotal).toBe(6);
    expect(row.hatchedCount).toBe(5);
    expect(row.cycleYear).toBe('2025');
  });
});
