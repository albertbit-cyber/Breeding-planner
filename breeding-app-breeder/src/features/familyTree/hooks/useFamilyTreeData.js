import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildPedigree, clutchLabel, computeGenerations } from '../utils/pedigreeModel';
import { buildGraphForView } from '../utils/layouts';
import { fetchSnakePedigree, fetchTreeStats } from '../api/familyTreeApi';

/**
 * Everything the Family Tree page reads.
 *
 * The animals held in the browser are the source of truth: they are what the keeper edits, and
 * they are complete. The server is asked as well, but only ever to add what the browser has not
 * got -- a relative held by another keeper, an ownership record. It used to be the other way
 * round, and a successful-but-empty response would replace a working tree with a lone animal.
 * So a failed request here is not an error worth showing while there are animals to draw.
 */
export function useFamilyTreeData({ animals = [], pairings = [], selectedSnakeId, view = 'tree' }) {
  const [server, setServer] = useState(null);
  const [serverError, setServerError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState(null);

  // Cache per animal, so flipping between views or back to an animal already looked at does not
  // re-request it.
  const serverCache = useRef(new Map());

  useEffect(() => {
    if (!selectedSnakeId) {
      setServer(null);
      setServerError(null);
      return undefined;
    }

    if (serverCache.current.has(selectedSnakeId)) {
      setServer(serverCache.current.get(selectedSnakeId));
      setServerError(null);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);

    fetchSnakePedigree(selectedSnakeId)
      .then((data) => {
        if (cancelled) return;
        serverCache.current.set(selectedSnakeId, data);
        setServer(data);
        setServerError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setServer(null);
        setServerError(err?.message || 'Could not reach the pedigree service');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [selectedSnakeId]);

  useEffect(() => {
    let cancelled = false;
    fetchTreeStats()
      .then((data) => { if (!cancelled) setStats(data); })
      .catch(() => {});   // the bar falls back to locally derived counts
    return () => { cancelled = true; };
  }, []);

  // ── The model ────────────────────────────────────────────────────────────────────────

  const model = useMemo(
    () => buildPedigree({ animals, pairings, server }),
    [animals, pairings, server],
  );

  const selectedSnake = useMemo(
    () => (selectedSnakeId ? model.get(selectedSnakeId) : null),
    [model, selectedSnakeId],
  );

  const graph = useMemo(() => {
    if (!selectedSnake && view !== 'universe') return { nodes: [], edges: [] };
    if (view === 'universe') return buildGraphForView(view, model, selectedSnakeId);
    return buildGraphForView(view, model, selectedSnake.id);
  }, [model, selectedSnake, selectedSnakeId, view]);

  // ── Panel data ───────────────────────────────────────────────────────────────────────

  const parents = useMemo(() => {
    if (!selectedSnake) return { sire: null, dam: null };
    const { sireId, damId } = model.parents(selectedSnake.id);
    return { sire: model.get(sireId), dam: model.get(damId) };
  }, [model, selectedSnake]);

  const offspring = useMemo(() => {
    if (!selectedSnake) return [];
    return model.children(selectedSnake.id).map(id => model.get(id)).filter(Boolean);
  }, [model, selectedSnake]);

  const clutches = useMemo(() => {
    if (!selectedSnake) return [];
    const own = model.parents(selectedSnake.id).clutchKey;
    const list = [...model.clutchesOf(selectedSnake.id)];
    const ownClutch = own ? model.clutch(own) : null;
    if (ownClutch && !list.some(c => c.key === ownClutch.key)) list.unshift(ownClutch);

    return list.map(clutch => ({
      id: clutch.key,
      displayId: clutchLabel(clutch, model),
      hatchDate: clutch.date,
      eggCount: clutch.laidCount ?? clutch.memberIds.length,
      hatchedCount: clutch.childIds.length,
    }));
  }, [model, selectedSnake]);

  const ownershipHistory = useMemo(
    () => (server?.ownershipHistory || []).filter(record => record.snakeId === selectedSnakeId),
    [server, selectedSnakeId],
  );

  // Counts drawn from what is actually on screen. The server's own figures are used for the
  // things only it can know -- how many breeders are on the network.
  const derivedStats = useMemo(() => {
    const depths = computeGenerations(model);
    const deepest = depths.size ? Math.max(...depths.values()) : 0;
    return {
      totalSnakes: [...model.animalsById.values()].filter(animal => !animal.isEgg).length,
      totalClutches: model.clutches.size,
      totalBreeders: stats?.totalBreeders ?? 1,
      totalBloodlines: model.parentsOf.size,
      // A collection with no recorded parentage spans no generations, not one.
      generationsTracked: model.parentsOf.size ? deepest + 1 : 0,
      networkStatus: server ? 'online' : 'local',
    };
  }, [model, stats, server]);

  const refresh = useCallback(() => {
    serverCache.current.delete(selectedSnakeId);
    setServer(null);
  }, [selectedSnakeId]);

  return {
    model,
    graph,
    nodes: graph.nodes,
    edges: graph.edges,
    selectedSnake,
    parents,
    offspring,
    clutches,
    ownershipHistory,
    stats: derivedStats,
    loading,
    serverError,
    refresh,
  };
}
