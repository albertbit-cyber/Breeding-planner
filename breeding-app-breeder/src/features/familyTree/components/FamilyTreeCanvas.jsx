import React, { useCallback, useEffect, useMemo } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  useReactFlow,
  useViewport,
  useNodesInitialized,
} from 'reactflow';
import 'reactflow/dist/style.css';
import SnakeNode from './SnakeNode';
import PlaceholderNode from './PlaceholderNode';
import JunctionNode from './JunctionNode';
import ClutchNode from './ClutchNode';

const NODE_TYPES = {
  snakeNode: SnakeNode,
  placeholderNode: PlaceholderNode,
  junctionNode: JunctionNode,
  clutchNode: ClutchNode,
};

/**
 * Generation names, along whichever axis actually separates the generations.
 *
 * They used to be spaced evenly down the left edge, so they lined up with the rows they named
 * only by luck. They are positioned from the real node coordinates now, converted through the
 * live viewport transform so they stay with their generation through panning and zooming --
 * and in the Horizontal view, where a generation is a column rather than a row, they run along
 * the top instead. Down the side there, three of them stacked up in the same inch of gutter.
 */
const GenLabelOverlay = ({ nodes, orientation }) => {
  const viewport = useViewport();
  const horizontal = orientation === 'h';

  const groups = useMemo(() => {
    const byLabel = new Map();
    for (const node of nodes) {
      if (node.type !== 'snakeNode' && node.type !== 'placeholderNode') continue;
      const label = node.data?.generationLabel;
      if (!label) continue;
      const value = horizontal ? node.position.x : node.position.y;
      const entry = byLabel.get(label);
      if (!entry) byLabel.set(label, { label, value });
      else if (value < entry.value) entry.value = value;
    }
    return [...byLabel.values()].sort((a, b) => a.value - b.value);
  }, [nodes, horizontal]);

  if (!groups.length) return null;

  return (
    <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden">
      {groups.map(({ label, value }) => (horizontal ? (
        <div
          key={label}
          className="absolute top-2 flex items-center gap-1.5"
          style={{ left: value * viewport.zoom + viewport.x }}
        >
          <div className="h-1 w-6 rounded-full bg-violet-300 opacity-60" />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-violet-400 whitespace-nowrap">
            {label}
          </span>
        </div>
      ) : (
        <div
          key={label}
          className="absolute left-3 flex items-center gap-1.5"
          style={{ top: value * viewport.zoom + viewport.y + 14 }}
        >
          <div className="w-1 h-6 rounded-full bg-violet-300 opacity-60" />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-violet-400 whitespace-nowrap">
            {label}
          </span>
        </div>
      )))}
    </div>
  );
};

const MINIMAP_COLOR = (node) => {
  if (node.type === 'placeholderNode') return '#e5e7eb';
  if (node.type === 'junctionNode') return '#7c3aed';
  if (node.type === 'clutchNode') return '#8b5cf6';
  if (node.data?.isSelected) return '#7c3aed';
  switch (node.data?.nodeRole) {
    case 'sire': return '#0ea5e9';
    case 'dam': return '#ec4899';
    case 'offspring': return '#10b981';
    case 'sibling': return '#f59e0b';
    case 'egg': return '#fbbf24';
    default: return '#a78bfa';
  }
};

const FlowBody = ({ initialNodes, initialEdges, onNodeClick, fitKey, orientation }) => {
  const [nodes, setNodes] = useNodesState(initialNodes);
  const [edges, setEdges] = useEdgesState(initialEdges);
  const { fitView } = useReactFlow();
  const nodesMeasured = useNodesInitialized();

  useEffect(() => { setNodes(initialNodes); }, [initialNodes, setNodes]);
  useEffect(() => { setEdges(initialEdges); }, [initialEdges, setEdges]);

  // Switching view or animal replaces the whole graph, and the old viewport almost never frames
  // the new one. `fitView` on mount alone left people staring at empty canvas after a tab change.
  //
  // It has to wait for `useNodesInitialized`: cards size themselves to their content, so until
  // React Flow has measured them it fits against zero-sized nodes and the result lands off
  // centre by roughly half the graph.
  useEffect(() => {
    if (!nodesMeasured || !initialNodes.length) return undefined;
    const raf = requestAnimationFrame(() => {
      fitView({ padding: 0.22, duration: 320, maxZoom: 1 });
    });
    return () => cancelAnimationFrame(raf);
  }, [fitKey, nodesMeasured, initialNodes, fitView]);

  const handleNodeClick = useCallback(
    (_event, node) => {
      if (node.type === 'snakeNode') onNodeClick?.(node.data.snake);
    },
    [onNodeClick],
  );

  return (
    <div className="relative w-full h-full">
      <GenLabelOverlay nodes={nodes} orientation={orientation} />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        onNodeClick={handleNodeClick}
        fitView
        fitViewOptions={{ padding: 0.22, maxZoom: 1 }}
        minZoom={0.05}
        maxZoom={2}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        proOptions={{ hideAttribution: true }}
      >
        <MiniMap
          zoomable
          pannable
          nodeColor={MINIMAP_COLOR}
          style={{
            background: '#f5f3ff',
            border: '1px solid #ddd6fe',
            borderRadius: '10px',
          }}
        />
        <Controls style={{ borderRadius: '10px', overflow: 'hidden', border: '1px solid #ddd6fe' }} />
        <Background gap={20} size={1} color="#ede9fe" variant="dots" />
      </ReactFlow>
    </div>
  );
};

const FamilyTreeCanvas = ({ nodes, edges, onSnakeClick, fitKey, orientation = 'v' }) => (
  <ReactFlowProvider>
    <FlowBody
      initialNodes={nodes}
      initialEdges={edges}
      onNodeClick={onSnakeClick}
      fitKey={fitKey}
      orientation={orientation}
    />
  </ReactFlowProvider>
);

export default FamilyTreeCanvas;
