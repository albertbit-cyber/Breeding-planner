import React, { useState, useEffect, useCallback } from 'react';
import { useFamilyTreeData } from './hooks/useFamilyTreeData';
import { fetchMyFamilyTreeAnimals } from './api/familyTreeApi';
import FamilyTreeCanvas from './components/FamilyTreeCanvas';
import SelectedSnakePanel from './components/SelectedSnakePanel';
import PedigreePassportPanel from './components/PedigreePassportPanel';
import ViewTabs from './components/ViewTabs';
import StatsBar from './components/StatsBar';
import './familyTree.css';

const ComingSoonCanvas = ({ label }) => (
  <div className="w-full h-full flex flex-col items-center justify-center gap-4 bg-violet-50/40">
    <div className="text-5xl opacity-20">🌳</div>
    <div className="text-sm font-semibold text-neutral-400">{label} — coming soon</div>
    <div className="text-xs text-neutral-300 text-center max-w-xs">
      This view will display the pedigree in a different layout. Switch back to Tree View to explore the interactive graph.
    </div>
  </div>
);

const FamilyTreePage = () => {
  const [selectedSnakeId, setSelectedSnakeId] = useState(null);
  const [activeView, setActiveView] = useState('tree');
  const [myAnimals, setMyAnimals] = useState([]);
  const [animalsLoading, setAnimalsLoading] = useState(true);
  const [animalsError, setAnimalsError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setAnimalsLoading(true);
    fetchMyFamilyTreeAnimals()
      .then(({ animals }) => {
        if (cancelled) return;
        setMyAnimals(animals ?? []);
        if (animals?.length) setSelectedSnakeId(animals[0].id);
      })
      .catch((err) => {
        if (!cancelled) setAnimalsError(err.message || 'Failed to load animals');
      })
      .finally(() => {
        if (!cancelled) setAnimalsLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const {
    loading,
    error,
    snakes,
    stats,
    selectedSnake,
    snakeParents,
    snakeOffspring,
    snakeClutches,
    snakeOwnershipHistory,
    nodes,
    edges,
  } = useFamilyTreeData({ selectedSnakeId });

  const handleSnakeClick = useCallback((snake) => {
    setSelectedSnakeId(snake.id);
  }, []);

  const handleSnakeSelect = useCallback((snake) => {
    setSelectedSnakeId(snake.id);
  }, []);

  return (
    <div className="ft-page">
      {/* ── Page header ──────────────────────────────────────── */}
      <div className="ft-header">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-base flex-shrink-0 shadow-sm"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #a78bfa)' }}
          >
            🌳
          </div>
          <div className="min-w-0">
            <div className="text-base font-bold text-neutral-900 leading-tight">Family Tree</div>
            <div className="text-[11px] text-violet-500 font-medium">
              Interactive pedigree graph
              {selectedSnake && ` · ${selectedSnake.name}`}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {animalsLoading && (
            <span className="text-[11px] text-neutral-400 animate-pulse">Loading animals…</span>
          )}
          {!animalsLoading && animalsError && (
            <span className="rounded-full bg-rose-100 border border-rose-200 text-rose-700 text-[11px] font-semibold px-3 py-1">
              {animalsError}
            </span>
          )}
          {!animalsLoading && !animalsError && (
            <span className="rounded-full bg-violet-100 border border-violet-200 text-violet-700 text-[11px] font-semibold px-3 py-1">
              {myAnimals.length} animal{myAnimals.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* ── Three-column body ─────────────────────────────────── */}
      <div className="ft-body">
        {/* Left panel */}
        <div className="ft-left-col border-r border-violet-100">
          <SelectedSnakePanel
            snake={selectedSnake}
            parents={snakeParents}
            allSnakes={myAnimals}
            onSnakeSelect={handleSnakeSelect}
          />
        </div>

        {/* Center: view tabs + canvas */}
        <div className="ft-center-col">
          <ViewTabs activeTab={activeView} onTabChange={setActiveView} />

          <div className="ft-canvas-area">
            {(loading || animalsLoading) && (
              <div className="flex items-center justify-center h-full">
                <div className="text-sm text-neutral-400 animate-pulse">Building pedigree graph…</div>
              </div>
            )}

            {(error || animalsError) && (
              <div className="m-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                {error || animalsError}
              </div>
            )}

            {!loading && !animalsLoading && !error && !animalsError && !selectedSnakeId && (
              <div className="flex flex-col items-center justify-center h-full gap-4 text-neutral-400">
                <div className="text-5xl opacity-20">🐍</div>
                <div className="text-sm font-semibold">No animals found</div>
                <div className="text-xs text-center max-w-xs">
                  Add animals in the Animals tab to start building your family tree.
                </div>
              </div>
            )}

            {!loading && !animalsLoading && !error && !animalsError && selectedSnakeId && activeView === 'tree' && (
              <FamilyTreeCanvas
                nodes={nodes}
                edges={edges}
                onSnakeClick={handleSnakeClick}
              />
            )}

            {!loading && !animalsLoading && !error && !animalsError && selectedSnakeId && activeView !== 'tree' && (
              <ComingSoonCanvas
                label={
                  activeView === 'horizontal'  ? 'Horizontal View' :
                  activeView === 'descendants' ? 'Descendants View' :
                  activeView === 'clutch'      ? 'Clutch View' :
                  activeView === 'universe'    ? 'Universe View' :
                  'View'
                }
              />
            )}
          </div>
        </div>

        {/* Right panel */}
        <div className="ft-right-col border-l border-violet-100">
          <PedigreePassportPanel
            snake={selectedSnake}
            parents={snakeParents}
            offspring={snakeOffspring}
            clutches={snakeClutches}
            ownershipHistory={snakeOwnershipHistory}
          />
        </div>
      </div>

      {/* ── Bottom stats bar ──────────────────────────────────── */}
      <StatsBar stats={stats} />
    </div>
  );
};

export default FamilyTreePage;
