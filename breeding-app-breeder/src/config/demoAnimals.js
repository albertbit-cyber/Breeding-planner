// The demo collection: what a keeper sees before they have added anything of their own,
// and what returns if they delete their last animal. Data only, so its integrity can be
// asserted in a test without loading the app.
//
// Every gene named here must be a real entry in that species' generated table. A demo
// animal carrying an invented morph teaches the wrong thing and breaks the moment it is
// opened -- demoAnimals.test.ts fails the build if one drifts.
export const DEMO_ANIMALS = [
  {
    id: '25Ath-1',
    name: 'Athena - DEMO',
    species: 'ball-python',
    sex: 'F',
    morphs: ['Clown', 'Pastel'],
    hets: ['Hypo'],
    possibleHets: [],
    weight: 850,
    year: 2025,
    birthDate: '2024-06-15',
    tags: ['proven', 'female'],
    groups: ['Breeders'],
    status: 'Active',
    imageUrl: undefined,
    isDemo: true,
    logs: { feeds: [], weights: [], sheds: [], cleanings: [], meds: [] }
  },
  {
    id: '25Bor-1',
    name: 'Boris - DEMO',
    species: 'ball-python',
    sex: 'M',
    morphs: ['Pinstripe', 'Albino'],
    hets: [],
    possibleHets: [],
    weight: 1020,
    year: 2023,
    birthDate: '2023-08-02',
    tags: ['male'],
    groups: ['Breeders'],
    status: 'Active',
    imageUrl: undefined,
    isDemo: true,
    logs: { feeds: [], weights: [], sheds: [], cleanings: [], meds: [] }
  },
  // Three more species so a first-time keeper meets a dashboard, not a single card. Every
  // gene below is a real entry in that species' generated table -- a demo animal carrying an
  // invented morph would teach the wrong thing and break the moment it was opened.
  {
    id: '25Mar-1',
    name: 'Marmalade - DEMO',
    species: 'crested-gecko',
    sex: 'F',
    morphs: ['Harlequin', 'Cappuccino'],
    hets: [],
    possibleHets: [],
    weight: 52,
    year: 2024,
    birthDate: '2024-03-20',
    tags: ['proven', 'female'],
    groups: ['Breeders'],
    status: 'Active',
    imageUrl: undefined,
    isDemo: true,
    logs: { feeds: [], weights: [], sheds: [], cleanings: [], meds: [] }
  },
  {
    id: '25Cin-1',
    name: 'Cinder - DEMO',
    species: 'corn-snake',
    sex: 'F',
    morphs: ['Anerythristic', 'Motley'],
    hets: ['Amelanistic'],
    possibleHets: [],
    weight: 310,
    year: 2023,
    birthDate: '2023-07-14',
    tags: ['proven', 'female'],
    groups: ['Breeders'],
    status: 'Active',
    imageUrl: undefined,
    isDemo: true,
    logs: { feeds: [], weights: [], sheds: [], cleanings: [], meds: [] }
  },
  {
    id: '25Onx-1',
    name: 'Onyx - DEMO',
    species: 'leopard-gecko',
    sex: 'M',
    morphs: ['Eclipse', 'Blizzard'],
    hets: [],
    possibleHets: [],
    weight: 58,
    year: 2024,
    birthDate: '2024-02-27',
    tags: ['male'],
    groups: ['Breeders'],
    status: 'Active',
    imageUrl: undefined,
    isDemo: true,
    logs: { feeds: [], weights: [], sheds: [], cleanings: [], meds: [] }
  }
];
