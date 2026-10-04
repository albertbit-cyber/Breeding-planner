/**
 * Why a cloud save failed, in words a keeper can act on.
 *
 * A failed save used to go to console.warn and nowhere else. The app now keeps a
 * "not synced" state with one of these reasons. Every reason says the same
 * true thing first: nothing on this device was lost.
 */

const statusOf = (error) => {
  const status = Number(error?.status ?? error?.statusCode);
  return Number.isFinite(status) && status > 0 ? status : null;
};

export function describeCloudSyncFailure(error, { t } = {}) {
  const tr = typeof t === 'function'
    ? t
    : (_key, { defaultValue = '' } = {}) => defaultValue;
  const status = statusOf(error);
  const kind = error?.kind || '';
  const serverMessage = typeof error?.message === 'string' ? error.message.trim() : '';

  if (kind === 'connection' || (status === null && /fetch|network|timed? ?out|abort/i.test(serverMessage))) {
    return {
      kind: 'offline',
      reason: tr('sync.failure.offline', {
        defaultValue: "Can't reach your account right now. Your changes are safe on this device and will sync once the connection is back.",
      }),
    };
  }
  if (status === 401 || kind === 'unauthorized') {
    return {
      kind: 'signedOut',
      reason: tr('sync.failure.signedOut', {
        defaultValue: "You're signed out of your account. Sign in again to sync; your changes are safe on this device.",
      }),
    };
  }
  if (status === 403 || kind === 'forbidden') {
    // The server's own sentence for the animal cap is already plain and exact.
    return {
      kind: 'limit',
      reason: serverMessage || tr('sync.failure.forbidden', {
        defaultValue: "Your plan doesn't allow this save. Everything is still on this device.",
      }),
    };
  }
  if (status === 413) {
    return {
      kind: 'tooLarge',
      reason: tr('sync.failure.tooLarge', {
        defaultValue: 'This save is too large to send in one go. Everything is still on this device.',
      }),
    };
  }
  if (status !== null && status >= 500) {
    return {
      kind: 'server',
      reason: tr('sync.failure.server', {
        defaultValue: "The server couldn't save your changes. They're safe on this device, and the app tries again with your next change.",
      }),
    };
  }
  return {
    kind: 'other',
    reason: serverMessage
      ? tr('sync.failure.otherWithMessage', {
        message: serverMessage,
        defaultValue: 'Your changes did not reach the cloud: {{message}}. They are safe on this device.',
      }).replace('{{message}}', serverMessage)
      : tr('sync.failure.other', {
        defaultValue: 'Your changes did not reach the cloud. They are safe on this device.',
      }),
  };
}
