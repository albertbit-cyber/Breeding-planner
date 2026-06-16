// Privacy filter utilities for the Family Tree.
// privacyLevel values: 'public' | 'shared' | 'private' | 'anonymous'
//
// TODO: When backend auth context is available, replace `viewerBreederId`
// with the authenticated user's ID from the auth context.

export const PRIVACY_LEVELS = {
  PUBLIC: 'public',
  SHARED: 'shared',
  PRIVATE: 'private',
  ANONYMOUS: 'anonymous',
};

/**
 * Returns true if the viewer is allowed to see full snake details.
 * Shared snakes are visible to any authenticated breeder.
 * Private snakes are only visible to their owner.
 */
export function canViewSnake(snake, viewerBreederId) {
  if (snake.privacyLevel === PRIVACY_LEVELS.PUBLIC) return true;
  if (snake.privacyLevel === PRIVACY_LEVELS.SHARED) return Boolean(viewerBreederId);
  if (snake.privacyLevel === PRIVACY_LEVELS.PRIVATE) {
    return snake.currentOwnerId === viewerBreederId || snake.breederId === viewerBreederId;
  }
  // anonymous — visible as a placeholder only, never as a full record
  return false;
}

/**
 * Converts a private or anonymous snake into a safe placeholder representation
 * so the graph can still show that a parent exists without exposing details.
 */
export function anonymizeSnake(snake) {
  return {
    id: snake.id,
    globalId: null,
    localId: null,
    name: 'Anonymous',
    species: snake.species,
    sex: snake.sex,
    genetics: [],
    breederId: null,
    breederName: 'Hidden',
    currentOwnerId: null,
    clutchId: null,
    hatchDate: null,
    status: 'unknown',
    privacyLevel: PRIVACY_LEVELS.ANONYMOUS,
    photoUrl: null,
    _isAnonymized: true,
  };
}

/**
 * Filters a list of snakes according to what the viewer may see.
 * Snakes that are private and not owned by the viewer become anonymized.
 */
export function applyPrivacyFilter(snakes, viewerBreederId) {
  return snakes.map(snake => {
    if (canViewSnake(snake, viewerBreederId)) return snake;
    if (snake.privacyLevel === PRIVACY_LEVELS.ANONYMOUS) return anonymizeSnake(snake);
    // Private and not visible → treat as anonymous in graph context
    return anonymizeSnake(snake);
  });
}
