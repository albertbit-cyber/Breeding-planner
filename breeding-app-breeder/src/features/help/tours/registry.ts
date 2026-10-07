import type { Tour } from './tourTypes';
import { helpStore } from '../helpStore';
import { usingHelp } from './areas/usingHelp';

// Every tour, in the order the Help menu lists them. Essentials comes first.
export const TOURS: Tour[] = [
  usingHelp,
];

export const getTour = (id: string | null | undefined): Tour | null =>
  (id ? TOURS.find(tour => tour.id === id) || null : null);

helpStore.registerTours(id => getTour(id)?.steps.length || null);
