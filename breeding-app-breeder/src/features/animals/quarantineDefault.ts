import {
  QUARANTINE_STATUS,
  applyQuarantineStatus,
  reconcileQuarantineWithStatus,
} from '../../services/quarantine';

/**
 * How an animal comes into the app, which decides whether it starts in quarantine.
 *
 * - `existing`: the keeper is entering animals they already keep. Nothing is quarantined
 *   wholesale; an animal whose status is already Quarantine keeps it and gets a record opened.
 * - `new`: a genuine new arrival (bought, traded, a loan coming in). It is put into quarantine
 *   from today, with its chosen status parked so clearing hands it back.
 *
 * An import is almost always an existing collection moving in, so it defaults to `existing`.
 * A hand-added animal is usually one just brought home, so it defaults to `new`; the keeper can
 * pick either in both places.
 */
export const ARRIVAL = Object.freeze({ EXISTING: 'existing', NEW: 'new' } as const);
export type Arrival = typeof ARRIVAL[keyof typeof ARRIVAL];

export const IMPORT_DEFAULT_ARRIVAL: Arrival = ARRIVAL.EXISTING;
export const MANUAL_ADD_DEFAULT_ARRIVAL: Arrival = ARRIVAL.NEW;

export type AdmitOptions = {
  today: string;
  source?: string;
  sourceName?: string;
};

/** What admitting may add: the Quarantine status and the record that goes with it. */
export type Admitted<T> = T & {
  status?: string;
  quarantine?: {
    startedAt?: string | null;
    previousStatus?: string;
    source?: string;
    sourceName?: string;
  } | null;
};

export function admitAnimal<T extends object>(snake: T, arrival: Arrival, options: AdmitOptions): Admitted<T> {
  if (arrival === ARRIVAL.NEW) {
    return applyQuarantineStatus(snake, QUARANTINE_STATUS.IN, {
      today: options.today,
      source: options.source || 'known-breeder',
      sourceName: options.sourceName || '',
    });
  }
  return reconcileQuarantineWithStatus(snake, { today: options.today });
}
