import { useMemo, useState, useEffect, useCallback } from 'react';
import { buildTreeGraph } from '../utils/buildTreeGraph';
import {
  fetchSnakePedigree,
  fetchTreeStats,
} from '../api/familyTreeApi';

const EMPTY_PEDIGREE = {
  snakes:           [],
  relationships:    [],
  clutches:         [],
  ownershipHistory: [],
};

/**
 * Fetches and derives all data needed by the Family Tree page.
 *
 * selectedSnakeId: the database Animal.id of the currently centred snake.
 *                  Pass null/undefined to show the empty state.
 */
export function useFamilyTreeData({ selectedSnakeId }) {
  const [pedigree, setPedigree]     = useState(EMPTY_PEDIGREE);
  const [stats, setStats]           = useState(null);
  const [loading, setLoading]       = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);
  const [error, setError]           = useState(null);

  // Load pedigree whenever the selected snake changes
  useEffect(() => {
    if (!selectedSnakeId) {
      setPedigree(EMPTY_PEDIGREE);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchSnakePedigree(selectedSnakeId)
      .then((data) => {
        if (!cancelled) {
          setPedigree({
            snakes:           data.snakes           ?? [],
            relationships:    data.relationships    ?? [],
            clutches:         data.clutches         ?? [],
            ownershipHistory: data.ownershipHistory ?? [],
          });
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Failed to load pedigree');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [selectedSnakeId]);

  // Load stats once on mount
  useEffect(() => {
    let cancelled = false;
    setStatsLoading(true);
    fetchTreeStats()
      .then((data) => { if (!cancelled) setStats(data); })
      .catch(() => {}) // stats are non-critical
      .finally(() => { if (!cancelled) setStatsLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Derived data

  const snakeMap = useMemo(
    () => new Map(pedigree.snakes.map((s) => [s.id, s])),
    [pedigree.snakes]
  );

  const selectedSnake = useMemo(() => {
    if (!selectedSnakeId) return null;
    // Try DB id first, then fall back to localId match (when caller passes app-local id)
    return snakeMap.get(selectedSnakeId)
      ?? pedigree.snakes.find((s) => s.localId === selectedSnakeId)
      ?? null;
  }, [snakeMap, selectedSnakeId, pedigree.snakes]);

  const { nodes, edges } = useMemo(() => {
    if (!selectedSnake || !pedigree.snakes.length) return { nodes: [], edges: [] };
    return buildTreeGraph({
      snakes:        pedigree.snakes,
      relationships: pedigree.relationships,
      selectedSnakeId: selectedSnake.id,
    });
  }, [pedigree.snakes, pedigree.relationships, selectedSnake]);

  const snakeParents = useMemo(() => {
    if (!selectedSnake) return { sire: null, dam: null };
    const rels = pedigree.relationships.filter((r) => r.childId === selectedSnake.id);
    return {
      sire: snakeMap.get(rels.find((r) => r.role === 'sire')?.parentId) ?? null,
      dam:  snakeMap.get(rels.find((r) => r.role === 'dam') ?.parentId) ?? null,
    };
  }, [selectedSnake, pedigree.relationships, snakeMap]);

  const snakeOffspring = useMemo(() => {
    if (!selectedSnake) return [];
    const childIds = [...new Set(
      pedigree.relationships
        .filter((r) => r.parentId === selectedSnake.id)
        .map((r) => r.childId)
    )];
    return childIds.map((id) => snakeMap.get(id)).filter(Boolean);
  }, [selectedSnake, pedigree.relationships, snakeMap]);

  const snakeClutches = useMemo(
    () => pedigree.clutches,
    [pedigree.clutches]
  );

  const snakeOwnershipHistory = useMemo(
    () => pedigree.ownershipHistory.filter((o) => o.snakeId === selectedSnakeId),
    [pedigree.ownershipHistory, selectedSnakeId]
  );

  return {
    loading,
    statsLoading,
    error,
    snakes:               pedigree.snakes,
    snakeMap,
    relationships:        pedigree.relationships,
    clutches:             pedigree.clutches,
    stats,
    selectedSnake,
    snakeParents,
    snakeOffspring,
    snakeClutches,
    snakeOwnershipHistory,
    nodes,
    edges,
  };
}
