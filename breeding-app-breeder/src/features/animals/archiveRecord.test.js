import { describe, it, expect } from 'vitest';
import { buildArchiveRecordData, formatArchiveRecordText, archiveRecordFileName, exitDetailRows, archiveLabels } from './archiveRecord';

const female = {
  id: '24-F-012',
  name: 'Nala',
  sex: 'F',
  status: 'Sold',
  species: 'ball_python',
  morphs: ['Pastel', 'Clown'],
  hets: ['Pied'],
  birthDate: '2024-06-01',
  sireId: 'm1',
  damId: 'f0',
  archive: {
    reason: 'sold',
    date: '2026-10-01',
    counterpartyName: 'Ann Keeper',
    price: 450,
    currency: 'EUR',
    notes: [{ id: 'n1', at: '2026-10-05T09:00:00Z', text: 'Buyer reports she is eating' }],
  },
  logs: {
    feeds: [
      { date: '2026-09-01', feed: 'Rat', size: 'Small', weightGrams: 40 },
      { date: '2026-09-08', refused: true },
    ],
    weights: [{ date: '2026-09-01', grams: 1200 }, { date: '2026-08-01', grams: 1150 }],
  },
};
const animals = [
  female,
  { id: 'm1', name: 'Rex', sex: 'M' },
  { id: 'f0', name: 'Old Mum', sex: 'F', status: 'Deceased' },
  { id: 'h1', name: 'Hatchling 1', sex: 'M', damId: '24-F-012', birthDate: '2026-08-20' },
];
const pairings = [
  { id: 'p1', femaleId: '24-F-012', maleId: 'm1', cycleYear: '2026', workflowStatus: 'completed', clutch: { recorded: true, date: '2026-06-10', eggsTotal: 7, fertileEggs: 6 }, hatch: { recorded: true, hatchedCount: 6 } },
];

describe('the archive record', () => {
  const data = buildArchiveRecordData({ animal: female, animals, pairings, speciesName: 'Ball python' });

  it('is only built for archived animals', () => {
    expect(buildArchiveRecordData({ animal: { id: 'x', status: 'Breeder' }, animals })).toBeNull();
  });

  it('resolves identity, parents, history and offspring', () => {
    expect(data.animal).toMatchObject({ name: 'Nala', sexCode: '0.1', species: 'Ball python', genetics: 'Pastel, Clown, het Pied' });
    expect(data.animal.sire.name).toBe('Rex');
    expect(data.animal.dam.name).toBe('Old Mum');
    expect(data.feedTotals).toEqual({ count: 2, refused: 1 });
    expect(data.feeds[0].date).toBe('2026-09-08');
    expect(data.lastWeight.grams).toBe(1200);
    expect(data.pairings[0]).toMatchObject({ partnerName: 'Rex', eggs: 7, fertile: 6, hatched: 6, completed: true });
    expect(data.offspring.map(o => o.name)).toEqual(['Hatchling 1']);
  });

  it('lists the exit details in reading order and says when the date is missing', () => {
    const labels = archiveLabels();
    const rows = exitDetailRows(data.exit, labels, { locale: 'en-GB' });
    expect(rows.map(r => r.label)).toEqual(['Reason', 'Date', 'Buyer', 'Price']);
    const undated = exitDetailRows({ ...data.exit, date: '' }, labels);
    expect(undated[1]).toMatchObject({ value: 'Date not recorded', missing: true });
  });

  it('reads as plain text', () => {
    const text = formatArchiveRecordText(data, archiveLabels(), { locale: 'en-GB' });
    expect(text).toContain('Nala (24-F-012)');
    expect(text).toContain('LEFT THE COLLECTION');
    expect(text).toContain('Buyer: Ann Keeper');
    expect(text).toContain('Buyer reports she is eating');
    expect(text).toContain('Feeds logged: 2 · refused: 1');
    expect(text).toContain('with Rex');
    expect(text).toContain('Offspring in the records: Hatchling 1');
  });

  it('gets a file name every file system accepts', () => {
    expect(archiveRecordFileName(data)).toBe('archive-nala-24-f-012.pdf');
    expect(archiveRecordFileName({ animal: { name: 'Ölçü / "x"' } }, 'txt')).toBe('archive-olcu-x.txt');
  });
});
