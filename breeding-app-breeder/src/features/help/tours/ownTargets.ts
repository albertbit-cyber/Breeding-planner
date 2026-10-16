// Every data-tour id used in the source, and only those. A tour target is valid when it is
// listed here (and so carried by a real element) or is a help id a real control carries.
// The tours test fails on an id listed here that the source no longer has, and on a
// data-tour in the source that is not listed: both stale and unlisted targets are caught.
export const OWN_TARGETS: readonly string[] = [
  'main-nav',
  'add-animal',
  'import-animals',
  'pairings-subtabs',
  'animal-feed-add',
];
