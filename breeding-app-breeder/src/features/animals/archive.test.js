import { describe, it, expect } from 'vitest';
import {
  isArchivedAnimal,
  getArchiveRecord,
  getArchiveHistory,
  buildArchivePatch,
  buildExitDetailsPatch,
  buildEraseContactPatch,
  buildAddNotePatch,
  buildReturnPatch,
  activeAnimals,
  archivedAnimals,
  closePairingsForArchivedFemale,
} from './archive';
import { closeCyclesForArchivedFemale, cancelPlannedPairingsForArchivedMale, normalizeCycle, CYCLE_STATUS } from '../breeding/domain/cycleModel';

const NOW = '2026-10-13T10:00:00.000Z';
const snake = (over = {}) => ({ id: 's1', name: 'Nala', sex: 'F', status: 'Breeder', logs: { feeds: [{ id: 'f1', date: '2026-01-01' }] }, ...over });

describe('which animals are archived', () => {
  it('reads an archive record or a leaving status, and nothing else', () => {
    expect(isArchivedAnimal(snake())).toBe(false);
    expect(isArchivedAnimal(snake({ status: 'On loan' }))).toBe(false);
    expect(isArchivedAnimal(snake({ status: 'Retired' }))).toBe(false);
    expect(isArchivedAnimal(snake({ status: 'Sold' }))).toBe(true);
    expect(isArchivedAnimal(snake({ status: ' deceased ' }))).toBe(true);
    expect(isArchivedAnimal(snake({ archive: { reason: 'lost' } }))).toBe(true);
  });

  it('splits a collection into active and archived', () => {
    const list = [snake(), snake({ id: 's2', status: 'Sold' }), null, snake({ id: 's3', status: 'On loan' })];
    expect(activeAnimals(list).map(s => s.id)).toEqual(['s1', 's3']);
    expect(archivedAnimals(list).map(s => s.id)).toEqual(['s2']);
  });
});

describe('snakes swept in by their status', () => {
  it('get a record with the reason implied and no invented date', () => {
    const record = getArchiveRecord(snake({ status: 'Deceased' }));
    expect(record.reason).toBe('died');
    expect(record.date).toBe('');
    expect(record.recorded).toBe(false);
  });

  it('take the date, buyer and price from a marketplace sale', () => {
    const record = getArchiveRecord(snake({
      status: 'Sold',
      soldVia: { saleId: 'sale-1', soldAt: '2026-03-03T12:00:00Z', buyerName: 'J. Smith', price: 450, currency: 'eur' },
    }));
    expect(record).toMatchObject({ reason: 'sold', date: '2026-03-03', counterpartyName: 'J. Smith', price: 450, currency: 'EUR', marketplaceSaleId: 'sale-1' });
  });

  it('does not write anything back when read', () => {
    const animal = snake({ status: 'Sold' });
    getArchiveRecord(animal);
    expect(animal.archive).toBeUndefined();
  });
});

describe('archiving', () => {
  it('writes the status, the record, and takes the snake off sale', () => {
    const patch = buildArchivePatch(snake({ forSale: true }), { reason: 'sold', date: '2026-10-01', counterpartyName: 'Ann', price: '300', currency: 'eur' }, { now: NOW });
    expect(patch.status).toBe('Sold');
    expect(patch.forSale).toBe(false);
    expect(patch.archive).toMatchObject({ reason: 'sold', date: '2026-10-01', counterpartyName: 'Ann', price: 300, currency: 'EUR', archivedAt: NOW });
    expect(patch.archive.recorded).toBeUndefined();
  });

  it('uses the neutral Archived status for reasons a custom tag could collide with', () => {
    expect(buildArchivePatch(snake(), { reason: 'traded', date: '2026-10-01' }, { now: NOW }).status).toBe('Archived');
    expect(buildArchivePatch(snake(), { reason: 'died', date: '2026-10-01' }, { now: NOW }).status).toBe('Deceased');
  });

  it('refuses an incomplete form', () => {
    expect(() => buildArchivePatch(snake(), { reason: 'sold' }, { now: NOW })).toThrow(/date/);
    expect(() => buildArchivePatch(snake(), { reason: 'escaped', date: '2026-10-01' }, { now: NOW })).toThrow(/why/);
    expect(() => buildArchivePatch(snake(), { reason: 'other', date: '2026-10-01' }, { now: NOW })).toThrow(/note/);
  });

  it('can record details for a snake that was only marked Sold', () => {
    const patch = buildArchivePatch(snake({ status: 'Sold' }), { reason: 'sold', date: '2026-02-02' }, { now: NOW });
    expect(patch.archive.date).toBe('2026-02-02');
  });

  it('never archives the same snake twice', () => {
    const archived = snake({ archive: { reason: 'sold', date: '2026-01-01' } });
    expect(() => buildArchivePatch(archived, { reason: 'died', date: '2026-02-02' })).toThrow(/already/);
  });
});

describe('after archiving', () => {
  const archived = () => {
    const base = snake();
    return { ...base, ...buildArchivePatch(base, { reason: 'sold', date: '2026-10-01', counterpartyName: 'Ann', counterpartyContact: 'ann@example.com' }, { now: NOW }) };
  };

  it('lets the exit details be corrected but nothing else', () => {
    const animal = archived();
    const patch = buildExitDetailsPatch(animal, { price: 250, name: 'Renamed', logs: {} }, { now: NOW });
    expect(Object.keys(patch).sort()).toEqual(['archive', 'status']);
    expect(patch.archive.price).toBe(250);
    expect(patch.archive.archivedAt).toBe(NOW);
  });

  it('erases the buyer contact and keeps the rest', () => {
    const animal = { ...archived(), soldVia: { saleId: 'x', buyerName: 'Ann' } };
    const patch = buildEraseContactPatch(animal, { now: NOW });
    expect(patch.archive.counterpartyName).toBe('');
    expect(patch.archive.counterpartyContact).toBe('');
    expect(patch.archive.erasedContactAt).toBe(NOW);
    expect(patch.archive.date).toBe('2026-10-01');
    expect(patch.soldVia.buyerName).toBeNull();
  });

  it('only ever appends notes', () => {
    let animal = archived();
    animal = { ...animal, ...buildAddNotePatch(animal, 'Buyer reports 8 eggs', { now: NOW }) };
    animal = { ...animal, ...buildAddNotePatch(animal, 'Second', { now: '2026-10-14T00:00:00.000Z' }) };
    expect(getArchiveRecord(animal).notes.map(n => n.text)).toEqual(['Buyer reports 8 eggs', 'Second']);
    expect(() => buildAddNotePatch(animal, '   ')).toThrow(/empty/);
  });

  it('returns to the collection as an event that keeps the period', () => {
    const animal = archived();
    const patch = buildReturnPatch(animal, { date: '2026-11-01', note: 'Buyback' }, { now: NOW });
    const back = { ...animal, ...patch };
    expect(isArchivedAnimal(back)).toBe(false);
    expect(back.status).toBe('Active');
    const history = getArchiveHistory(back);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ reason: 'sold', date: '2026-10-01', returnDate: '2026-11-01', returnNote: 'Buyback' });
    // The history it carried is untouched.
    expect(back.logs).toEqual(animal.logs);
  });
});

describe('breeding when a snake is archived', () => {
  const pairings = [
    { id: 'p1', femaleId: 's1', maleId: 'm1', workflowStatus: 'active' },
    { id: 'p2', femaleId: 's1', maleId: 'm1', workflowStatus: 'completed', completionReason: 'eggs_laid' },
    { id: 'p3', femaleId: 's9', maleId: 's1', workflowStatus: 'active' },
  ];
  const isOpen = p => p.workflowStatus !== 'completed';

  it("completes the female's open pairings with the archive reason", () => {
    const { pairings: next, closedIds } = closePairingsForArchivedFemale(pairings, 's1', 'sold', { isOpen, now: NOW });
    expect(closedIds).toEqual(['p1']);
    expect(next[0]).toMatchObject({ workflowStatus: 'completed', completionReason: 'female_sold', outcomeConfidence: 'confirmed', completedAt: NOW });
    expect(next[1]).toBe(pairings[1]);
    expect(next[2]).toBe(pairings[2]);
  });

  it('falls back to the generic reason for other exits', () => {
    expect(closePairingsForArchivedFemale(pairings, 's1', 'traded', { isOpen, now: NOW }).pairings[0].completionReason).toBe('female_left_collection');
    expect(closePairingsForArchivedFemale(pairings, 's1', 'died', { isOpen, now: NOW }).pairings[0].completionReason).toBe('female_died');
  });

  it("closes the female's open breeding cards and cancels their pending pairings", () => {
    const cycle = normalizeCycle({ id: 'c1', femaleId: 's1', startDate: '2026-09-01', plannedPairings: [{ id: 'pp1', maleId: 'm1', date: '2026-11-01', status: 'pending' }] });
    const closed = normalizeCycle({ id: 'c0', femaleId: 's1', startDate: '2025-09-01', status: 'closed', closure: { outcome: 'no_clutch' } });
    const { cycles, closedIds } = closeCyclesForArchivedFemale([cycle, closed], 's1', 'female_sold', { now: NOW });
    expect(closedIds).toEqual(['c1']);
    expect(cycles[0].status).toBe(CYCLE_STATUS.CLOSED);
    expect(cycles[0].closure.outcome).toBe('female_sold');
    expect(cycles[0].plannedPairings[0].status).toBe('cancelled');
    expect(cycles[1]).toBe(closed);
  });

  it("keeps a female's card open when the male leaves, cancelling only his pending pairings", () => {
    const cycle = normalizeCycle({
      id: 'c1', femaleId: 's1', startDate: '2026-09-01',
      plannedPairings: [
        { id: 'pp1', maleId: 'm1', date: '2026-11-01', status: 'pending' },
        { id: 'pp2', maleId: 'm2', date: '2026-11-02', status: 'pending' },
      ],
    });
    const { cycles, changedIds } = cancelPlannedPairingsForArchivedMale([cycle], 'm1', { now: NOW });
    expect(changedIds).toEqual(['c1']);
    expect(cycles[0].status).toBe(CYCLE_STATUS.ACTIVE);
    expect(cycles[0].plannedPairings.map(p => p.status)).toEqual(['cancelled', 'pending']);
  });
});

import { isRemovedAnimal, isOutOfCollection, familyLinksOf, buildRemovalStub, mergeWithRemoval, departureOf } from './archive';

describe('deleting a snake that has family links', () => {
  const clown = {
    id: 'M-1', name: 'Clown male', sex: 'M', species: 'ball-python', status: 'Breeder',
    morphs: ['Clown'], hets: [], sireId: 'M-0', damId: 'F-0', price: 900, notes: 'calm',
    photos: [{ id: 'p1', url: 'data:image/png;base64,AAA' }, { id: 'p2', url: 'data:image/png;base64,BBB' }],
    logs: { feeds: [{ id: 'f1', date: '2026-01-01' }], weights: [{ id: 'w1', date: '2026-01-01', grams: 900 }] },
    groups: ['Breeders'], tags: ['hatchling'], metadata: { pairingId: 'P-0', secret: 'x' },
  };
  const hatchling = { id: 'H-1', name: 'Clown Pied', sireId: 'M-1', damId: 'F-2' };
  const loner = { id: 'B-1', name: 'Bought in' };
  const pairings = [{ id: 'P-1', femaleId: 'F-2', maleId: 'M-1' }];

  it('finds pairings, offspring and own parents as links', () => {
    expect(familyLinksOf(clown, { animals: [clown, hatchling], pairings })).toMatchObject({ pairings: 1, offspring: 1, parents: 2, hasLinks: true });
    expect(familyLinksOf(hatchling, { animals: [clown, hatchling], pairings: [] })).toMatchObject({ parents: 2, hasLinks: true });
    expect(familyLinksOf(loner, { animals: [loner], pairings }).hasLinks).toBe(false);
  });

  it('keeps identity, the main photo and family links, and erases the rest', () => {
    const stub = buildRemovalStub(clown, { reason: 'died', now: NOW });
    expect(stub).toMatchObject({ id: 'M-1', name: 'Clown male', morphs: ['Clown'], sireId: 'M-0', damId: 'F-0', status: 'Removed', removed: { reason: 'died', date: '2026-10-13' } });
    expect(stub.photos).toHaveLength(1);
    expect(stub.photos[0].id).toBe('p1');
    expect(stub.logs.feeds).toEqual([]);
    expect(stub.logs.weights).toEqual([]);
    expect(stub.price).toBeUndefined();
    expect(stub.notes).toBeUndefined();
    expect(stub.groups).toEqual([]);
    expect(stub.tags).toEqual(['hatchling']);
    expect(stub.metadata).toEqual({ pairingId: 'P-0', clutchId: undefined, hatchlingIndex: undefined });
    expect(isRemovedAnimal(stub)).toBe(true);
    expect(isArchivedAnimal(stub)).toBe(false);
    expect(isOutOfCollection(stub)).toBe(true);
    expect(activeAnimals([stub, hatchling]).map(a => a.id)).toEqual(['H-1']);
    expect(archivedAnimals([stub])).toEqual([]);
    expect(departureOf(stub)).toEqual({ kind: 'removed', reason: 'died', date: '2026-10-13' });
  });

  it('takes the reason from the archive when an archived snake is deleted', () => {
    const archived = { ...clown, status: 'Sold', archive: { reason: 'sold', date: '2026-05-01' } };
    expect(buildRemovalStub(archived, { now: NOW }).removed.reason).toBe('sold');
    expect(() => buildRemovalStub(clown, { reason: 'vanished', now: NOW })).toThrow(/why/);
  });

  it('never merges a deleted card back together with a full copy', () => {
    const stub = buildRemovalStub(clown, { reason: 'died', now: NOW });
    const ts = (a) => Date.parse(a.updatedAt || 0) || 0;
    const newerFull = { ...clown, updatedAt: '2027-01-01T00:00:00.000Z' };
    expect(mergeWithRemoval(newerFull, stub, ts)).toBe(stub);
    expect(mergeWithRemoval(stub, newerFull, ts)).toBe(stub);
    expect(mergeWithRemoval(clown, hatchling, ts)).toBeNull();
  });
});
