import { topic } from '../helpTypes';

// What Serpentora is, how to find your way, how to get help, and how saving works.
export const gettingStarted = {
  'serpentora': topic('getting-started', { see: ['main-nav', 'saving', 'help-button'] }),
  'main-nav': topic('getting-started', { see: ['nav-dashboard', 'nav-animals', 'nav-more'] }),
  'nav-dashboard': topic('getting-started', { title: 'common:nav.dashboard', see: ['main-nav', 'species-gate'] }),
  'nav-animals': topic('getting-started', { title: 'common:nav.animals', see: ['species-gate', 'nav-pairings'] }),
  'nav-pairings': topic('getting-started', { title: 'common:nav.pairings', see: ['species-gate', 'nav-animals'] }),
  'nav-advisor': topic('getting-started', { title: 'common:nav.advisor', see: ['species-gate', 'nav-pairings'] }),
  'nav-family-tree': topic('getting-started', { title: 'common:nav.familyTree', see: ['species-gate', 'nav-animals'] }),
  'nav-feed-prep': topic('getting-started', { title: 'common:nav.feedPrep', see: ['main-nav'] }),
  'nav-spaces': topic('getting-started', { title: 'common:nav.spaces', see: ['main-nav'] }),
  'nav-quarantine': topic('getting-started', { title: 'common:nav.quarantine', see: ['main-nav'] }),
  'nav-calendar': topic('getting-started', { title: 'common:nav.calendar', see: ['main-nav'] }),
  'nav-lab-tests': topic('getting-started', { title: 'common:nav.shedTerminal', see: ['main-nav'] }),
  'nav-setup': topic('getting-started', { title: 'common:nav.setup', see: ['saving', 'main-nav'] }),
  'nav-more': topic('getting-started', { title: 'common:nav.more', see: ['main-nav'] }),
  'species-gate': topic('getting-started', { see: ['nav-dashboard', 'main-nav'] }),
  'saving': topic('getting-started', { see: ['serpentora', 'nav-setup'] }),
  'help-button': topic('getting-started', { see: ['help-mode', 'help-manual', 'guided-tours'] }),
  'help-mode': topic('getting-started', { see: ['help-button', 'help-manual', 'guided-tours'] }),
  'help-manual': topic('getting-started', { see: ['manual-search', 'help-mode'] }),
  'manual-search': topic('getting-started', { see: ['help-manual'] }),
  'guided-tours': topic('getting-started', { see: ['help-button', 'help-mode'] }),
  'help-hint': topic('getting-started', { see: ['help-button'] }),
  'tour-invitation': topic('getting-started', { see: ['guided-tours'] }),
} as const;
