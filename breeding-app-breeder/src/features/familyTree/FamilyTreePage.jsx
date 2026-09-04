import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useFamilyTreeData } from './hooks/useFamilyTreeData';
import FamilyTreeCanvas from './components/FamilyTreeCanvas';
import SelectedSnakePanel from './components/SelectedSnakePanel';
import PedigreePassportPanel from './components/PedigreePassportPanel';
import ViewTabs, { VIEW_TABS } from './components/ViewTabs';
import StatsBar from './components/StatsBar';
import './familyTree.css';
import { splitPairLabel } from '../animals/parentage';

/**
 * The Family Tree.
 *
 * All the pedigree reasoning that used to live in this file -- name parsing, parent guessing,
 * sibling matching, virtual eggs -- now happens once in `utils/pedigreeModel`, and each view is
 * a layout over that one model. The page is left to do what a page should: pick an animal, pick
 * a view, and hand both to the hook.
 */

const EmptyCanvas = ({ icon, title, body }) => (
  <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center">
    <div className="text-5xl opacity-20">{icon}</div>
    <div className="text-sm font-semibold text-neutral-500">{title}</div>
    {body && <div className="text-xs text-neutral-400 max-w-xs leading-relaxed">{body}</div>}
  </div>
);

const FamilyTreePage = ({ snakes = [], pairings = [], focusSnakeId = null }) => {
  const [selectedSnakeId, setSelectedSnakeId] = useState(() => focusSnakeId || snakes[0]?.id || null);
  const [activeView, setActiveView] = useState('tree');

  useEffect(() => {
    if (focusSnakeId) setSelectedSnakeId(focusSnakeId);
  }, [focusSnakeId]);

  // Keep a selection alive when the collection loads late, or when the selected animal is
  // deleted or filtered out from under us.
  useEffect(() => {
    if (!snakes.length) return;
    if (selectedSnakeId && snakes.some(snake => snake?.id === selectedSnakeId)) return;
    setSelectedSnakeId(snakes[0].id);
  }, [snakes, selectedSnakeId]);

  const {
    graph,
    selectedSnake,
    parents,
    offspring,
    clutches,
    ownershipHistory,
    stats,
    loading,
    serverError,
  } = useFamilyTreeData({
    animals: snakes,
    pairings,
    selectedSnakeId,
    view: activeView,
  });

  // A click on a card re-centres the whole page on that animal. Eggs have no record behind
  // them, so they stay inert rather than selecting into an empty panel.
  const handleSnakeClick = useCallback((snake) => {
    if (!snake?.id || snake.isEgg) return;
    setSelectedSnakeId(snake.id);
  }, []);

  const activeTab = useMemo(
    () => VIEW_TABS.find(tab => tab.id === activeView) || VIEW_TABS[0],
    [activeView],
  );

  const noAnimals = !snakes.length;
  const emptyGraph = !graph.nodes.length;

  const canvasBody = () => {
    if (noAnimals) {
      return (
        <EmptyCanvas
          icon="🐍"
          title="No animals yet"
          body="Add animals in the Animals tab, and their pedigree will build itself from the parents and clutches you record."
        />
      );
    }
    if (loading && emptyGraph) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="text-sm text-neutral-400 animate-pulse">Building pedigree…</div>
        </div>
      );
    }
    if (emptyGraph) {
      return (
        <EmptyCanvas
          icon={activeTab.icon}
          title={`Nothing to draw in ${activeTab.label} view`}
          body={
            activeView === 'clutch'
              ? 'This animal has no clutch recorded either side of it. Set its parents in the animal editor, or log a clutch on its pairing.'
              : 'Select an animal with recorded parents or offspring, or set parentage in the animal editor.'
          }
        />
      );
    }
    return (
      <FamilyTreeCanvas
        nodes={graph.nodes}
        edges={graph.edges}
        onSnakeClick={handleSnakeClick}
        fitKey={`${activeView}:${selectedSnakeId}`}
        orientation={graph.orientation}
      />
    );
  };

  return (
    <div className="ft-page">
      <div className="ft-header">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center text-base flex-shrink-0 shadow-sm"
            style={{ background: 'linear-gradient(135deg, var(--sk-series-4), var(--sk-series-6))', color: 'var(--sk-text-on-accent)' }}
          >
            🌳
          </div>
          <div className="min-w-0">
            <div className="text-base font-bold text-neutral-900 leading-tight">Family Tree</div>
            <div className="text-[11px] text-neutral-500 font-medium truncate">
              {activeTab.hint}
              {selectedSnake && ` · ${selectedSnake.name}`}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="rounded-full bg-violet-100 border border-violet-200 text-violet-700 text-[11px] font-semibold px-3 py-1">
            {snakes.length} animal{snakes.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      <div className="ft-body">
        <div className="ft-left-col border-r border-violet-100">
          <SelectedSnakePanel
            snake={selectedSnake}
            parents={parents}
            allSnakes={snakes}
            onSnakeSelect={handleSnakeClick}
          />
        </div>

        <div className="ft-center-col">
          <ViewTabs activeTab={activeView} onTabChange={setActiveView} />

          {/* The pedigree is drawn from what is in the browser, so a server that cannot be
              reached costs the extra relatives it would have added, not the tree itself. */}
          {serverError && !noAnimals && (
            <div className="mx-4 mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
              Showing this collection only — the shared pedigree service is unreachable.
            </div>
          )}

          <div className="ft-canvas-area">{canvasBody()}</div>
        </div>

        <div className="ft-right-col border-l border-violet-100">
          <PedigreePassportPanel
            snake={selectedSnake}
            parents={parents}
            offspring={offspring}
            clutches={clutches}
            ownershipHistory={ownershipHistory}
          />
        </div>
      </div>

      <StatsBar stats={stats} />
    </div>
  );
};

export default FamilyTreePage;
