import { describe, expect, it } from 'vitest';
import {
  ARRIVAL,
  IMPORT_DEFAULT_ARRIVAL,
  MANUAL_ADD_DEFAULT_ARRIVAL,
  admitAnimal,
} from './quarantineDefault';
import { QUARANTINE_TAG, getQuarantineStatus, isInQuarantine } from '../../services/quarantine';
import { canonicalStatusValue } from './statusValue';

const today = '2026-10-06';

const collection = [
  { id: '24Ath-1', name: 'Athena', sex: 'F', status: 'Breeder' },
  { id: '23Zeu-1', name: 'Zeus', sex: 'M', status: 'Holdback' },
  { id: '25Hat-1', name: 'Hatchling', sex: 'U', status: 'For sale' },
];

describe('entering an existing collection', () => {
  it('is the default for an import', () => {
    expect(IMPORT_DEFAULT_ARRIVAL).toBe(ARRIVAL.EXISTING);
  });

  it('marks nothing as newly acquired', () => {
    const admitted = collection.map(animal => admitAnimal(animal, IMPORT_DEFAULT_ARRIVAL, { today }));
    admitted.forEach((animal, index) => {
      expect(isInQuarantine(animal)).toBe(false);
      expect(animal.status).toBe(collection[index].status);
      expect(animal.quarantine ?? null).toBeNull();
    });
  });

  it('still honours an animal whose status is already Quarantine', () => {
    const admitted = admitAnimal({ id: '26New-1', status: QUARANTINE_TAG }, ARRIVAL.EXISTING, { today });
    expect(isInQuarantine(admitted)).toBe(true);
    expect(admitted.quarantine?.startedAt).toBe(today);
  });

  it('is offered for a hand-added animal too', () => {
    const admitted = admitAnimal({ id: '20Old-1', status: 'Breeder' }, ARRIVAL.EXISTING, { today });
    expect(getQuarantineStatus(admitted)).toBe('none');
    expect(admitted.status).toBe('Breeder');
  });
});

describe('a genuinely new arrival', () => {
  it('is the default for a hand-added animal', () => {
    expect(MANUAL_ADD_DEFAULT_ARRIVAL).toBe(ARRIVAL.NEW);
  });

  it('goes into quarantine from today and keeps the status it was given', () => {
    const admitted = admitAnimal({ id: '26Buy-1', status: 'Holdback' }, MANUAL_ADD_DEFAULT_ARRIVAL, {
      today,
      source: 'expo',
      sourceName: 'Hamm',
    });
    expect(isInQuarantine(admitted)).toBe(true);
    expect(admitted.status).toBe(QUARANTINE_TAG);
    expect(admitted.quarantine?.startedAt).toBe(today);
    expect(admitted.quarantine?.previousStatus).toBe('Holdback');
    expect(admitted.quarantine?.sourceName).toBe('Hamm');
  });

  it('quarantines every animal of an import the keeper marks as new arrivals', () => {
    const admitted = collection.map(animal => admitAnimal(animal, ARRIVAL.NEW, { today }));
    expect(admitted.every(isInQuarantine)).toBe(true);
  });
});

describe('the For sale status', () => {
  it('reads every old spelling as one value', () => {
    expect(canonicalStatusValue('FOR SELL')).toBe('For sale');
    expect(canonicalStatusValue(' for sell ')).toBe('For sale');
    expect(canonicalStatusValue('For Sale')).toBe('For sale');
    expect(canonicalStatusValue('Holdback')).toBe('Holdback');
    expect(canonicalStatusValue(canonicalStatusValue('for sell'))).toBe('For sale');
  });
});
