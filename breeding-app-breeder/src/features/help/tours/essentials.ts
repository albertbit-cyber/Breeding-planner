import { defineTour } from './tourTypes';

// The essentials tour: the core loop with the keeper's own real data, at desktop and at
// 390px. Phone and desktop controls carry the same data-tour id; findTarget takes the
// visible one. Every do step waits on the app's own state; the tour never acts, except
// the plainly labelled offer to add one example animal.
export const essentials = defineTour('essentials', [
  // 1 · Finding your way
  { id: 'welcome', part: 1, kind: 'info' },
  { id: 'places', part: 1, kind: 'info', target: 'main-nav' },
  {
    id: 'open-species',
    part: 1,
    kind: 'do',
    target: 'dashboard-species-card',
    route: ['dashboard'],
    missing: true,
    done: c => c.view.speciesOpen === true,
  },
  { id: 'examples', part: 1, kind: 'info' },

  // 2 · Your first animal
  {
    id: 'add',
    part: 2,
    kind: 'do',
    target: 'add-animal',
    route: ['animals'],
    missing: true,
    done: c => c.modal === 'add-animal',
  },
  {
    id: 'add-real',
    part: 2,
    kind: 'do',
    target: 'add-submit',
    noScroll: true,
    missing: true,
    done: c => c.data.realAnimals > (c.base.realAnimals ?? 0) || (c.data.exampleAnimal === true && c.modal !== 'add-animal'),
    offer: {
      id: 'add-example-animal',
      label: 'help:tour.essentials.offer.label',
      note: 'help:tour.essentials.offer.note',
    },
  },

  // 3 · Its record
  {
    id: 'open-record',
    part: 3,
    kind: 'do',
    target: 'animals-edit',
    route: ['animals'],
    missing: true,
    done: c => c.modal === 'edit-animal',
  },
  { id: 'genetics', part: 3, kind: 'info', target: 'record-genetics' },
  {
    // A card's quick-add only opens from a tile that already has an entry, so a new
    // animal's first feed is logged in its record: Add, then Save changes.
    id: 'feed',
    part: 3,
    kind: 'do',
    target: 'animal-feed-add',
    avoid: ['record-save'],
    missing: true,
    done: c => c.data.feeds > (c.base.feeds ?? 0),
  },
  {
    id: 'close-record',
    part: 3,
    kind: 'do',
    target: 'dialog',
    done: c => c.modal === null,
  },

  // 4 · Breeding
  {
    id: 'open-breeding',
    part: 4,
    kind: 'do',
    target: 'nav-pairings',
    missing: true,
    done: c => c.route[0] === 'pairings',
  },
  {
    id: 'new-pairing',
    part: 4,
    kind: 'do',
    target: 'pairing-new',
    route: ['pairings'],
    missing: true,
    done: c => c.modal === 'create-pairing' || c.modal === 'breeders-guard',
  },
  { id: 'choosing', part: 4, kind: 'info', target: 'dialog' },
  {
    id: 'close-pairing',
    part: 4,
    kind: 'do',
    target: 'dialog',
    done: c => c.modal === null,
  },
  { id: 'stages', part: 4, kind: 'info', target: 'pairings-subtabs', route: ['pairings'] },

  // 5 · Your records are yours
  { id: 'import', part: 5, kind: 'info', target: 'import-animals', route: ['animals'] },
  { id: 'saving', part: 5, kind: 'info', target: 'nav-setup' },

  // 6 · Help
  { id: 'help', part: 6, kind: 'info', target: 'help-button' },
]);
