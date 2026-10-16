/**
 * The tier's photo limit, per animal.
 *
 * Every tier keeps a number of photos for each animal: Free 3, Hobby 5, Hobby Plus 7, Breeder 9,
 * Professional Breeder and Enterprise without a tier limit. Without a tier limit, and whenever the
 * account's limit is not known (offline before the first check, an unconfigured backend), the
 * technical cap still holds: an animal's photos travel in its record, its backups and its PDFs.
 *
 * A lower limit never removes a photo. An animal that already has more keeps them all; it just
 * cannot take another until it is under the limit. Nothing here picks photos to drop.
 *
 * Every function is pure so the wording can be tested without the app.
 */

export const PHOTO_CAP_FEATURE = 'animals.photos';

/** The technical cap for every tier, matching the backend's PHOTO_MAX_PER_ANIMAL default. */
export const MAX_PHOTOS_PER_ANIMAL = 60;

const finiteLimit = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : null;
};

/**
 * The per-animal cap from a cached `/subscriptions/access` answer for "animals.photos".
 * `tierLimited` says whether the number is the tier's (so an upgrade would help) or only the
 * technical cap. A tier without photos at all (allowed false, not a usage limit) holds 0.
 */
export function photoCapFrom(access) {
  if (!access || typeof access !== 'object') {
    return { limit: MAX_PHOTOS_PER_ANIMAL, tierName: '', tierLimited: false };
  }
  const tierName = access.tier || access.currentTier || '';
  if (access.allowed === false && access.reason !== 'Usage limit reached') {
    return { limit: 0, tierName, tierLimited: true };
  }
  const limit = finiteLimit(access.limit);
  if (limit === null || limit >= MAX_PHOTOS_PER_ANIMAL) {
    return { limit: MAX_PHOTOS_PER_ANIMAL, tierName, tierLimited: false };
  }
  return { limit, tierName, tierLimited: true };
}

/** The cheapest public tier that keeps more photos per animal than `limit`. */
export function nextTierForPhotos(tiers, limit) {
  if (!Array.isArray(tiers) || limit === null || limit === undefined) return null;
  const candidates = tiers
    .filter((tier) => tier && tier.isActive !== false && tier.isPublic !== false && !tier.archivedAt)
    .map((tier) => {
      const feature = (tier.features || []).find((entry) => entry?.featureKey === PHOTO_CAP_FEATURE && entry.enabled);
      if (!feature) return null;
      const tierLimit = finiteLimit(feature.limitValue);
      if (tierLimit !== null && tierLimit <= limit) return null;
      return { name: tier.name, key: tier.key, limit: tierLimit, sortOrder: Number(tier.sortOrder || 0) };
    })
    .filter(Boolean)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  return candidates[0] || null;
}

/** Where one animal stands if `adding` photos are added to the `current` it has. */
export function checkPhotoCap({ cap, current = 0, adding = 0, nextTier = null }) {
  if (!cap) return null;
  const have = Math.max(0, Number(current) || 0);
  const add = Math.max(0, Number(adding) || 0);
  const room = Math.max(0, cap.limit - have);
  return {
    limit: cap.limit,
    tierName: cap.tierName,
    tierLimited: cap.tierLimited,
    current: have,
    adding: add,
    room,
    accepted: Math.min(add, room),
    refused: Math.max(0, add - room),
    full: room === 0,
    over: Math.max(0, have - cap.limit),
    nextTier: cap.tierLimited ? nextTier : null,
  };
}

const identityT = (_key, { defaultValue = '', ...values } = {}) =>
  String(defaultValue).replace(/\{\{(\w+)\}\}/g, (_match, name) => (name in values ? String(values[name]) : ''));

/** "3 of 5 photos", for the line under the photo buttons. */
export function describePhotoCount(result, { t = identityT } = {}) {
  if (!result) return '';
  return t('subscriptions.photoCap.count', {
    current: result.current,
    limit: result.limit,
    defaultValue: '{{current}} of {{limit}} photos',
  });
}

/**
 * The sentence shown when an animal is full, or when only part of a selection fits.
 * Null while there is room for everything being added.
 */
export function describePhotoCap(result, { t = identityT } = {}) {
  if (!result) return null;
  const tierLimited = result.tierLimited;
  if (result.limit === 0) {
    return {
      tone: 'blocked',
      text: t('subscriptions.photoCap.none', {
        tier: result.tierName || t('subscriptions.cap.yourPlan', { defaultValue: 'Your plan' }),
        defaultValue: '{{tier}} does not include animal photos.',
      }),
      upgrade: null,
    };
  }
  if (!result.full && !result.refused) return null;

  const keeps = tierLimited
    ? t('subscriptions.photoCap.keeps', {
      tier: result.tierName || t('subscriptions.cap.yourPlan', { defaultValue: 'Your plan' }),
      limit: result.limit,
      defaultValue: '{{tier}} keeps {{limit}} photos per animal.',
    })
    : t('subscriptions.photoCap.technical', {
      limit: result.limit,
      defaultValue: 'An animal can hold up to {{limit}} photos.',
    });

  let detail;
  if (result.refused && result.accepted) {
    detail = t('subscriptions.photoCap.partly', {
      accepted: result.accepted,
      refused: result.refused,
      defaultValue: 'The first {{accepted}} were added; {{refused}} did not fit.',
    });
  } else if (result.over) {
    detail = t('subscriptions.photoCap.over', {
      current: result.current,
      defaultValue: 'This one has {{current}} and keeps them all. Remove photos to get under the limit before adding another.',
    });
  } else {
    detail = t('subscriptions.photoCap.full', {
      current: result.current,
      defaultValue: 'This one has {{current}}. Remove one to add another.',
    });
  }

  let upgrade = null;
  if (tierLimited) {
    const next = result.nextTier;
    if (!next) {
      upgrade = t('subscriptions.photoCap.upgradeGeneric', { defaultValue: 'Upgrade your plan for more photos.' });
    } else if (next.limit === null) {
      upgrade = t('subscriptions.photoCap.upgradeUnlimited', { tier: next.name, defaultValue: 'Upgrade to {{tier}} for no photo limit.' });
    } else {
      upgrade = t('subscriptions.photoCap.upgradeTo', { tier: next.name, limit: next.limit, defaultValue: 'Upgrade to {{tier}} for {{limit}} per animal.' });
    }
  }
  return { tone: result.refused && result.accepted ? 'warning' : 'blocked', text: `${keeps} ${detail}`, upgrade };
}
