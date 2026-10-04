import { describe, expect, it } from 'vitest';
import { describeCloudSyncFailure } from './cloudSyncFailure';

describe('describeCloudSyncFailure', () => {
  it('passes the server\'s animal-cap sentence through unchanged', () => {
    const message = 'Free keeps 20 animals in the cloud. This save would bring it to 60, so it was not saved. Every animal is still on this device.';
    expect(describeCloudSyncFailure({ status: 403, kind: 'forbidden', message })).toEqual({ kind: 'limit', reason: message });
  });

  it('reads a lost connection as offline, not as an error in the records', () => {
    expect(describeCloudSyncFailure({ kind: 'connection', message: 'Failed to fetch' }).kind).toBe('offline');
    expect(describeCloudSyncFailure(new TypeError('Failed to fetch')).kind).toBe('offline');
  });

  it('tells a signed-out keeper to sign in again', () => {
    expect(describeCloudSyncFailure({ status: 401 }).reason).toMatch(/Sign in again/);
  });

  it('names a payload that is too large', () => {
    expect(describeCloudSyncFailure({ status: 413 }).kind).toBe('tooLarge');
  });

  it('says a server failure leaves the device copy safe', () => {
    const { kind, reason } = describeCloudSyncFailure({ status: 500, message: 'P2028 transaction closed' });
    expect(kind).toBe('server');
    expect(reason).not.toMatch(/P2028/);
    expect(reason).toMatch(/safe on this device/);
  });

  it('keeps any other server message, framed in plain words', () => {
    expect(describeCloudSyncFailure({ status: 400, message: 'Pairing p-1 is missing its female' }).reason)
      .toBe('Your changes did not reach the cloud: Pairing p-1 is missing its female. They are safe on this device.');
  });
});
