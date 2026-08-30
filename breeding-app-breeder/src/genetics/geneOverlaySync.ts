import { fetchGeneOverlay } from "../shared/apiClient";
import { setSpeciesGeneOverlay } from "./geneDatabase";

/**
 * Pulls the laboratory-contributed genes for a species and layers them over the
 * generated table.
 *
 * The generated tables come from Morphpedia and are rebuilt routinely, so they
 * cannot hold a gene a partner laboratory has just started testing for. Those
 * live server-side and arrive here, which is what lets a lab result for a brand
 * new gene write back to the animal at all.
 *
 * Deliberately forgiving: a keeper offline, or signed out, or on a build that
 * predates the endpoint, still gets the full generated database. A missing
 * overlay costs them the newest few genes; a thrown error would cost them the
 * genetics screen entirely.
 */

const fetched = new Set<string>();
let inFlight: Promise<void> | null = null;

export const syncGeneOverlay = async (speciesId: string, options: { force?: boolean } = {}) => {
  const id = String(speciesId || "").trim();
  if (!id) return;
  if (!options.force && fetched.has(id)) return;

  // One request at a time: switching species quickly should not fire a burst.
  if (inFlight) await inFlight.catch(() => {});

  inFlight = (async () => {
    try {
      const data = await fetchGeneOverlay(id);
      setSpeciesGeneOverlay(id, data?.genes || []);
      fetched.add(id);
    } catch {
      // Offline, signed out, or an older backend. The generated table stands.
    } finally {
      inFlight = null;
    }
  })();

  await inFlight;
};

/** Forces the next sync to re-fetch, e.g. after a lab result introduces a gene. */
export const invalidateGeneOverlay = (speciesId?: string): void => {
  if (speciesId) fetched.delete(String(speciesId).trim());
  else fetched.clear();
};
