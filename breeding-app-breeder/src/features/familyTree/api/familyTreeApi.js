import { getSharedApiConfig, DEFAULT_SHARED_API_TIMEOUT_MS } from '../../../shared/config/api';
import { getAuthToken } from '../../../shared/apiClient';

// ── Shared fetch wrapper ──────────────────────────────────────

async function ftFetch(path, options = {}) {
  const { baseUrl, ok, message } = getSharedApiConfig();
  if (!ok || !baseUrl) throw new Error(message || 'Backend not configured');

  const token = getAuthToken('breeder');
  if (!token) throw new Error('Not authenticated');

  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), DEFAULT_SHARED_API_TIMEOUT_MS);

  try {
    const res = await fetch(`${baseUrl}/family-tree${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...(options.headers ?? {}),
      },
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message || `HTTP ${res.status}`);
    }

    return res.json();
  } finally {
    clearTimeout(tid);
  }
}

// ── Exported API functions ────────────────────────────────────

/**
 * Returns the authenticated breeder's animals with database IDs.
 * Used to populate the animal picker in the Family Tree page.
 * → { animals: FamilyTreeAnimal[] }
 */
export async function fetchMyFamilyTreeAnimals() {
  return ftFetch('/animals');
}

/**
 * Returns the full pedigree centered on an animal:
 *   Gen -2 grandparents, Gen -1 parents, Gen 0 selected, Gen +1 offspring.
 * → { selectedSnakeId, snakes, relationships, clutches, ownershipHistory }
 */
export async function fetchSnakePedigree(animalId) {
  return ftFetch(`/snake/${encodeURIComponent(animalId)}`);
}

/**
 * Lazily loads more ancestor generations above a given animal.
 * depth: 1–4 (backend clamps it).
 * → { snakes, relationships }
 */
export async function fetchMoreAncestors(animalId, depth = 1) {
  return ftFetch(`/snake/${encodeURIComponent(animalId)}/ancestors?depth=${depth}`);
}

/**
 * Lazily loads more descendant generations below a given animal.
 * → { snakes, relationships }
 */
export async function fetchMoreDescendants(animalId, depth = 1) {
  return ftFetch(`/snake/${encodeURIComponent(animalId)}/descendants?depth=${depth}`);
}

/**
 * Returns aggregate stats for the stats bar.
 * → { totalSnakes, totalClutches, totalBreeders, totalBloodlines, generationsTracked, networkStatus }
 */
export async function fetchTreeStats() {
  return ftFetch('/stats');
}
