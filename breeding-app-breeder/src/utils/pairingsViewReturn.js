/**
 * Where collapsing an expanded pairing card should leave the keeper.
 *
 * The Breeding Tracker dashboard opens a pairing by switching to Active (or Completed)
 * Projects and focusing its card, which expands it. Collapsing that card should hand the
 * keeper back to the dashboard they came from -- but only then. Someone who opened Active
 * Projects by hand, or arrived from the calendar or a snake card, expects a collapse to
 * simply collapse, not to teleport them to a view they never asked for.
 *
 * The origin is therefore recorded on the way in, and bound to the pairing it was recorded
 * for: focusing some other pairing in the meantime -- from the calendar, a snake card, a
 * freshly created pairing -- must not inherit the earlier card's return trip.
 */
export function resolveCollapseView(currentView, returnTo, pairingId) {
  if (!returnTo || returnTo.view !== 'dashboard') return currentView;
  if (!pairingId || returnTo.pairingId !== pairingId) return currentView;
  if (currentView !== 'active' && currentView !== 'completed') return currentView;
  return 'dashboard';
}

export default resolveCollapseView;
