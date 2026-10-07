import type { Tour } from './tourTypes';
import { helpStore } from '../helpStore';
import { essentials } from './essentials';
import { usingHelp } from './areas/usingHelp';
import { AREA_TOURS } from './areas/screens';

// Every tour, in the order the Help menu lists them. Essentials comes first.
export const TOURS: Tour[] = [
  essentials,
  ...AREA_TOURS,
  usingHelp,
];

export const getTour = (id: string | null | undefined): Tour | null =>
  (id ? TOURS.find(tour => tour.id === id) || null : null);

helpStore.registerTours(id => getTour(id)?.steps.length || null);
