import { defineTour } from '../tourTypes';

// How to get help: the ?, then the manual. Two steps, nothing outward.
export const usingHelp = defineTour('tour-help', [
  { id: 'button', part: 1, kind: 'info', target: 'help-button' },
  {
    id: 'manual',
    part: 1,
    kind: 'do',
    target: 'help-button',
    done: context => context.view.manualOpen === true,
  },
]);
