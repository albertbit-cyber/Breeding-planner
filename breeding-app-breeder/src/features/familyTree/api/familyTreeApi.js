import { apiRequest } from '../../../shared/apiClient';

export async function fetchMyFamilyTreeAnimals() {
  return apiRequest('/family-tree/animals', { authScope: 'breeder' });
}

export async function fetchSnakePedigree(animalId) {
  return apiRequest(`/family-tree/snake/${encodeURIComponent(animalId)}`, { authScope: 'breeder' });
}

export async function fetchMoreAncestors(animalId, depth = 1) {
  return apiRequest(`/family-tree/snake/${encodeURIComponent(animalId)}/ancestors?depth=${depth}`, { authScope: 'breeder' });
}

export async function fetchMoreDescendants(animalId, depth = 1) {
  return apiRequest(`/family-tree/snake/${encodeURIComponent(animalId)}/descendants?depth=${depth}`, { authScope: 'breeder' });
}

export async function fetchTreeStats() {
  return apiRequest('/family-tree/stats', { authScope: 'breeder' });
}
