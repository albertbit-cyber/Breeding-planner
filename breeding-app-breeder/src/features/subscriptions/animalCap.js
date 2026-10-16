/**
 * The tier's animal cap, as the app states it before the keeper commits.
 *
 * Free keeps 10 animals. The app does not let a keeper add past their tier's cap
 * and says so before the confirm button, with the next tier that would hold more.
 * Nothing here decides which animals to drop: an import that would cross the cap
 * waits until the keeper skips rows or upgrades.
 *
 * Every function is pure so the wording can be tested without the app.
 */

export const ANIMAL_CAP_FEATURE = 'animals.create';

const finiteLimit = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
};

/** The cap from a cached `/subscriptions/access` answer, or null when there is none. */
export function animalCapFrom(access) {
  if (!access || typeof access !== 'object') return null;
  const limit = finiteLimit(access.limit);
  if (limit === null) return null;
  return { limit, tierName: access.tier || access.currentTier || '' };
}

/**
 * The cheapest public tier that holds more animals than `limit`: a higher
 * number, or animal records with no limit at all.
 */
export function nextTierForAnimals(tiers, limit) {
  if (!Array.isArray(tiers) || limit === null || limit === undefined) return null;
  const candidates = tiers
    .filter((tier) => tier && tier.isActive !== false && tier.isPublic !== false && !tier.archivedAt)
    .map((tier) => {
      const feature = (tier.features || []).find((entry) => entry?.featureKey === ANIMAL_CAP_FEATURE && entry.enabled);
      if (!feature) return null;
      const tierLimit = finiteLimit(feature.limitValue);
      if (tierLimit !== null && tierLimit <= limit) return null;
      return { name: tier.name, key: tier.key, limit: tierLimit, sortOrder: Number(tier.sortOrder || 0) };
    })
    .filter(Boolean)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  return candidates[0] || null;
}

/**
 * Where the keeper stands if they add `adding` animals to `currentCount`.
 * Null when the account has no known cap.
 */
export function checkAnimalCap({ cap, currentCount = 0, adding = 0, nextTier = null }) {
  if (!cap) return null;
  const current = Math.max(0, Number(currentCount) || 0);
  const add = Math.max(0, Number(adding) || 0);
  const total = current + add;
  return {
    limit: cap.limit,
    tierName: cap.tierName,
    current,
    adding: add,
    total,
    room: Math.max(0, cap.limit - current),
    blocked: add > 0 && total > cap.limit,
    atCap: current >= cap.limit,
    nextTier,
  };
}

const identityT = (_key, { defaultValue = '', ...values } = {}) =>
  String(defaultValue).replace(/\{\{(\w+)\}\}/g, (_match, name) => (name in values ? String(values[name]) : ''));

const upgradeSentence = (nextTier, t) => {
  if (!nextTier) {
    return t('subscriptions.cap.upgradeGeneric', { defaultValue: 'Upgrade your plan to add more.' });
  }
  if (nextTier.limit === null) {
    return t('subscriptions.cap.upgradeUnlimited', {
      tier: nextTier.name,
      defaultValue: 'Upgrade to {{tier}} for no animal limit.',
    });
  }
  return t('subscriptions.cap.upgradeTo', {
    tier: nextTier.name,
    limit: nextTier.limit,
    defaultValue: 'Upgrade to {{tier}} for up to {{limit}}.',
  });
};

/**
 * The sentence a confirm screen shows. `context` is 'add' for one animal,
 * 'import' for a reviewed file (rows can be set to Skip) and 'paste' for pasted
 * text (lines are removed). Batch wording says how many to leave out, because
 * choosing which ones is the keeper's call.
 */
export function describeAnimalCap(result, { context = 'add', t = identityT } = {}) {
  if (!result) return null;
  const tier = result.tierName || t('subscriptions.cap.yourPlan', { defaultValue: 'Your plan' });
  const keeps = t('subscriptions.cap.keeps', {
    tier,
    limit: result.limit,
    defaultValue: '{{tier}} keeps {{limit}} animals.',
  });

  if (!result.blocked) {
    return {
      tone: result.total >= result.limit ? 'warning' : 'info',
      text: `${keeps} ${t('subscriptions.cap.standing', {
        total: result.total,
        limit: result.limit,
        defaultValue: 'This makes {{total}} of {{limit}}.',
      })}`,
      upgrade: null,
    };
  }

  const upgrade = upgradeSentence(result.nextTier, t);
  if (context === 'import' || context === 'paste') {
    const over = result.total - result.limit;
    const room = result.room;
    const paste = context === 'paste';
    const detail = room > 0
      ? t(paste ? 'subscriptions.cap.pasteRoom' : 'subscriptions.cap.importRoom', {
        adding: result.adding,
        current: result.current,
        room,
        over,
        defaultValue: paste
          ? 'This import adds {{adding}} to your {{current}}, and there is room for {{room}}. Remove {{over}} lines from the list, or upgrade.'
          : 'This import adds {{adding}} to your {{current}}, and there is room for {{room}}. Set {{over}} more rows to Skip, or upgrade.',
      })
      : t(paste ? 'subscriptions.cap.pasteFull' : 'subscriptions.cap.importFull', {
        adding: result.adding,
        current: result.current,
        defaultValue: paste
          ? 'You already have {{current}}, so none of these {{adding}} new animals fit.'
          : 'You already have {{current}}, so none of these {{adding}} new animals fit. Set them to Skip, or upgrade.',
      });
    return { tone: 'blocked', text: `${keeps} ${detail}`, upgrade };
  }

  const detail = t('subscriptions.cap.addFull', {
    current: result.current,
    defaultValue: 'You have {{current}}, so this one can\'t be added.',
  });
  return { tone: 'blocked', text: `${keeps} ${detail}`, upgrade };
}
