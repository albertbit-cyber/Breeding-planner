import { describe, expect, it } from 'vitest';
import { mergeBreederSnapshots } from '../../App.jsx';
import { renameAnimalInCycles, renameAnimalInExams, renameTombstone } from './animalRename';

const BEFORE = '2026-10-10T08:00:00.000Z';
const SAVED = '2026-10-17T09:30:00.000Z';

const hatchling = (overrides = {}) => ({
  id: '26-U-242',
  name: 'Runa × Confusion - 2',
  species: 'ball-python',
  sex: 'U',
  morphs: [],
  hets: [],
  possibleHets: [],
  tags: [],
  groups: ['Hatchlings 2026'],
  logs: {},
  sireId: '22-M-001',
  damId: '21-F-004',
  updatedAt: BEFORE,
  ...overrides,
});

describe('sexing a hatchling, which renames it', () => {
  // On this device the save replaced 26-U-242 with 26-M-242. The server still held 26-U-242.
  const local = { snakes: [hatchling({ id: '26-M-242', sex: 'M', updatedAt: SAVED })], pairings: [] };
  const server = { snakes: [hatchling()], pairings: [] };

  it('used to come back from the server as a second animal', () => {
    const merged = mergeBreederSnapshots(local, server, {});
    expect(merged.snakes.map(s => s.id).sort()).toEqual(['26-M-242', '26-U-242']);
  });

  it('stays one animal once the old ID is deleted for sync', () => {
    const tombstones = { snakes: { '26-U-242': renameTombstone('26-U-242', { now: SAVED }) } };
    const merged = mergeBreederSnapshots(local, server, tombstones);
    expect(merged.snakes).toHaveLength(1);
    expect(merged.snakes[0]).toMatchObject({ id: '26-M-242', sex: 'M' });
  });

  it('writes the same tombstone shape a delete does', () => {
    expect(renameTombstone(' 26-U-242 ', { now: SAVED })).toEqual({
      id: '26-U-242', appAnimalId: '26-U-242', deletedAt: SAVED,
    });
  });
});

describe('breeding cards and exams follow the new ID', () => {
  const card = {
    id: 'bc-1',
    femaleId: '24-F-010',
    males: [{ maleId: '22-M-001', state: 'participated' }, { maleId: '23-M-002', state: 'planned' }],
    sessions: [{ id: 's1', maleId: '22-M-001', locks: [] }],
    plannedPairings: [{ id: 'p1', maleId: '23-M-002', status: 'pending' }],
    offspring: [{ animalId: '26-U-242', sireAssignment: { maleId: '22-M-001', method: 'single_sire' } }],
  };

  it('renames a male everywhere he appears on the card', () => {
    const [next] = renameAnimalInCycles([card], '22-M-001', '22-M-001b');
    expect(next.males[0].maleId).toBe('22-M-001b');
    expect(next.males[1].maleId).toBe('23-M-002');
    expect(next.sessions[0].maleId).toBe('22-M-001b');
    expect(next.offspring[0].sireAssignment.maleId).toBe('22-M-001b');
    expect(next.offspring[0].sireAssignment.method).toBe('single_sire');
  });

  it('renames the female and an offspring', () => {
    expect(renameAnimalInCycles([card], '24-F-010', '24-F-011')[0].femaleId).toBe('24-F-011');
    expect(renameAnimalInCycles([card], '26-U-242', '26-M-242')[0].offspring[0].animalId).toBe('26-M-242');
  });

  it('hands back the same list when nothing named the old ID', () => {
    const cycles = [card];
    expect(renameAnimalInCycles(cycles, '99-X-999', '99-X-998')).toBe(cycles);
    const exams = [{ id: 'e1', femaleId: '24-F-010' }];
    expect(renameAnimalInExams(exams, '99-X-999', '99-X-998')).toBe(exams);
  });

  it('leaves deleted cards and exams alone', () => {
    const deletedCard = { id: 'bc-2', femaleId: '24-F-010', deletedAt: SAVED };
    expect(renameAnimalInCycles([deletedCard], '24-F-010', '24-F-011')[0]).toBe(deletedCard);
    const exams = [{ id: 'e1', femaleId: '24-F-010' }, { id: 'e2', femaleId: '24-F-010', deletedAt: SAVED }];
    const next = renameAnimalInExams(exams, '24-F-010', '24-F-011');
    expect(next[0].femaleId).toBe('24-F-011');
    expect(next[1]).toBe(exams[1]);
  });
});
