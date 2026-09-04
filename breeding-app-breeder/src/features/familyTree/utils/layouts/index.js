import { buildTreeGraph } from './treeLayout';
import { buildHorizontalGraph } from './horizontalLayout';
import { buildLineageGraph } from './lineageLayout';
import { buildClutchGraph } from './clutchLayout';
import { buildUniverseGraph } from './universeLayout';

/**
 * Every view is the same pedigree seen from a different angle, so each is just a function from
 * (model, selectedId) to nodes and edges. Adding a view means adding one entry here.
 */
export const LAYOUTS = {
  tree: buildTreeGraph,
  horizontal: buildHorizontalGraph,
  lineage: buildLineageGraph,
  clutch: buildClutchGraph,
  universe: buildUniverseGraph,
};

export function buildGraphForView(view, model, selectedId) {
  const build = LAYOUTS[view] || LAYOUTS.tree;
  return build(model, selectedId);
}

export {
  buildTreeGraph,
  buildHorizontalGraph,
  buildLineageGraph,
  buildClutchGraph,
  buildUniverseGraph,
};
