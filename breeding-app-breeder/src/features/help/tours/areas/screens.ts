import { defineTour } from '../tourTypes';

// One short tour per screen, started from the "Take a short tour" link in its header.
// Do steps only ever switch a view, type a search or open a window; deleting, importing,
// syncing, ordering, publishing, Google and plans are explained in info steps, never asked.

export const dashboardTour = defineTour('tour-dashboard', [
  { id: 'search', part: 1, kind: 'do', target: 'dashboard-search', route: ['dashboard'], missing: true, done: c => c.view.dashboardSearch === true },
  { id: 'species', part: 1, kind: 'info', target: 'dashboard-species-card', route: ['dashboard'] },
  { id: 'breeding', part: 1, kind: 'info', target: 'dashboard-breeding', route: ['dashboard'] },
  { id: 'add', part: 1, kind: 'info', target: 'dashboard-add-animal', route: ['dashboard'] },
  { id: 'import', part: 1, kind: 'info', target: 'dashboard-import', route: ['dashboard'] },
]);

export const animalsTour = defineTour('tour-animals', [
  {
    id: 'view',
    part: 1,
    kind: 'do',
    target: 'animals-view',
    route: ['animals'],
    missing: true,
    done: c => c.route[0] === 'animals' && ['males', 'females', 'groups'].includes(String(c.route[1])),
  },
  { id: 'search', part: 1, kind: 'do', target: 'animals-search', route: ['animals'], missing: true, done: c => c.view.animalSearch === true },
  { id: 'layout', part: 1, kind: 'info', target: 'animals-layout', route: ['animals'], missing: true },
  { id: 'filters', part: 1, kind: 'info', target: 'animals-status-filter', route: ['animals'], missing: true },
  { id: 'qr', part: 1, kind: 'info', target: 'animals-export-qr', route: ['animals'], missing: true },
  { id: 'import', part: 1, kind: 'info', target: 'import-animals', route: ['animals'] },
]);

export const recordTour = defineTour('tour-record', [
  { id: 'open', part: 1, kind: 'do', target: 'animals-edit', route: ['animals'], missing: true, done: c => c.modal === 'edit-animal' },
  { id: 'genetics', part: 1, kind: 'info', target: 'record-genetics' },
  { id: 'parentage', part: 1, kind: 'info', target: 'record-parentage' },
  { id: 'logs', part: 1, kind: 'info', target: 'record-logs' },
  { id: 'selling', part: 1, kind: 'info', target: 'sell-for-sale' },
  { id: 'close', part: 1, kind: 'do', target: 'dialog', done: c => c.modal === null },
]);

export const breedingTour = defineTour('tour-breeding', [
  { id: 'incubator', part: 1, kind: 'do', target: 'pairing-view-incubator', route: ['pairings'], missing: true, done: c => c.route[0] === 'pairings' && c.route[1] === 'incubator' },
  { id: 'dashboard', part: 1, kind: 'do', target: 'pairing-view-dashboard', route: ['pairings'], missing: true, done: c => c.route[0] === 'pairings' && c.route[1] === 'dashboard' },
  { id: 'new', part: 1, kind: 'info', target: 'pairing-new', route: ['pairings'] },
  { id: 'stages', part: 1, kind: 'info', target: 'pairings-subtabs', route: ['pairings'] },
]);

export const advisorTour = defineTour('tour-advisor', [
  { id: 'goal', part: 1, kind: 'info', target: 'advisor-goal', route: ['advisor'], missing: true },
  { id: 'run', part: 1, kind: 'info', target: 'advisor-run', route: ['advisor'], missing: true },
  { id: 'cards', part: 1, kind: 'info', target: 'advisor-screen', route: ['advisor'] },
]);

export const familyTreeTour = defineTour('tour-family-tree', [
  { id: 'views', part: 1, kind: 'info', target: 'tree-view-tree', route: ['familyTree'], missing: true },
  { id: 'switch', part: 1, kind: 'info', target: 'tree-switch-snake', route: ['familyTree'], missing: true },
  { id: 'passport', part: 1, kind: 'info', target: 'tree-passport', route: ['familyTree'], missing: true },
]);

export const calendarTour = defineTour('tour-calendar', [
  { id: 'month', part: 1, kind: 'info', target: 'calendar-month', route: ['calendar'], missing: true },
  { id: 'filters', part: 1, kind: 'info', target: 'calendar-filters', route: ['calendar'], missing: true },
  { id: 'exports', part: 1, kind: 'info', target: 'calendar-export-full', route: ['calendar'], missing: true },
  { id: 'google', part: 1, kind: 'info', target: 'calendar-screen', route: ['calendar'] },
]);

export const feedPrepTour = defineTour('tour-feed-prep', [
  { id: 'open', part: 1, kind: 'do', target: 'nav-feed-prep', missing: true, done: c => c.view.feedPrepOpen === true },
  { id: 'pick', part: 1, kind: 'info', target: 'feed-prep-selection' },
  { id: 'report', part: 1, kind: 'info', target: 'feed-prep-copy' },
  { id: 'close', part: 1, kind: 'do', target: 'dialog', done: c => c.modal === null },
]);

export const spacesTour = defineTour('tour-spaces', [
  { id: 'rooms', part: 1, kind: 'info', target: 'spaces-add-room', route: ['spaces'], missing: true },
  { id: 'inside', part: 1, kind: 'info', target: 'spaces-screen', route: ['spaces'] },
  { id: 'delete', part: 1, kind: 'info', target: 'spaces-screen', route: ['spaces'] },
]);

export const quarantineTour = defineTour('tour-quarantine', [
  { id: 'filter', part: 1, kind: 'info', target: 'quarantine-filter', route: ['quarantine'], missing: true },
  { id: 'record', part: 1, kind: 'info', target: 'quarantine-tiles', route: ['quarantine'], missing: true },
  { id: 'notice', part: 1, kind: 'do', target: 'quarantine-notice-open', route: ['quarantine'], missing: true, done: c => c.modal === 'quarantine-notice' },
  { id: 'close', part: 1, kind: 'do', target: 'dialog', done: c => c.modal === null },
]);

export const labTour = defineTour('tour-lab', [
  { id: 'screen', part: 1, kind: 'info', target: 'lab-tests-screen', route: ['shedTerminal'], missing: true },
  { id: 'ordering', part: 1, kind: 'info', target: 'lab-tests-screen', route: ['shedTerminal'] },
  { id: 'certificates', part: 1, kind: 'info', target: 'lab-tests-screen', route: ['shedTerminal'] },
]);

export const settingsTour = defineTour('tour-settings', [
  { id: 'appearance', part: 1, kind: 'do', target: 'settings-appearance', route: ['setup'], missing: true, done: c => c.has('settings-appearance-preset') },
  { id: 'language', part: 1, kind: 'info', target: 'settings-language', route: ['setup'], missing: true },
  { id: 'exports', part: 1, kind: 'info', target: 'export-screen', route: ['setup'], missing: true },
  { id: 'backups', part: 1, kind: 'info', target: 'backup-screen', route: ['setup'], missing: true },
  { id: 'account', part: 1, kind: 'info', target: 'account-screen', route: ['setup'], missing: true },
]);

export const AREA_TOURS = [
  dashboardTour,
  animalsTour,
  recordTour,
  breedingTour,
  advisorTour,
  familyTreeTour,
  feedPrepTour,
  spacesTour,
  quarantineTour,
  calendarTour,
  labTour,
  settingsTour,
];
