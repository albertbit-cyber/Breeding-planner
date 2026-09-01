import React, { useCallback, useEffect, useMemo } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
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

// Generation label overlay — uses generationLabel data field tagged at build time,
// then groups by label so sibling stacks produce one label, not N.

const GenLabelOverlay = ({ nodes }) => {
  const genGroups = useMemo(() => {
    const byLabel = new Map();
    for (const n of nodes) {
      if (n.type !== 'snakeNode' && n.type !== 'placeholderNode') continue;
      const label = n.data?.generationLabel
        || (n.data?.isSelected ? 'Selected' : null);
      if (!label) continue;
      const entry = byLabel.get(label);
      const y = n.position.y;
      if (!entry) { byLabel.set(label, { label, minY: y }); }
      else if (y < entry.minY) { entry.minY = y; }
    }
    return [...byLabel.values()].sort((a, b) => a.minY - b.minY);
  }, [nodes]);

  return (
    <div className="absolute left-3 top-0 bottom-0 pointer-events-none flex flex-col justify-around z-10">
      {genGroups.map(({ label, minY }) => (
        <div key={label} className="flex items-center gap-1.5">
          <div className="w-1 h-6 rounded-full bg-violet-300 opacity-60" />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-violet-400 whitespace-nowrap">
            {label}
          </span>
        </div>
      ))}
    </div>
  );
};

const FlowBody = ({ initialNodes, initialEdges, onNodeClick }) => {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => {
    setNodes(initialNodes);
  }, [initialNodes, setNodes]);

  useEffect(() => {
    setEdges(initialEdges);
  }, [initialEdges, setEdges]);

  const handleNodeClick = useCallback(
    (_event, node) => {
      if (node.type === 'snakeNode') {
        onNodeClick?.(node.data.snake);
      }
    },
    [onNodeClick]
  );

  return (
    <div className="relative w-full h-full">
      <GenLabelOverlay nodes={nodes} />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        fitView
        fitViewOptions={{ padding: 0.22 }}
        minZoom={0.25}
        maxZoom={2}
        nodesDraggable={false}
        elementsSelectable
        proOptions={{ hideAttribution: true }}
      >
        <MiniMap
          zoomable
          pannable
          nodeColor={(n) => {
            if (n.type === 'placeholderNode') return 'var(--sk-border)';
            if (n.type === 'junctionNode') return 'var(--sk-series-4)';
            if (n.type === 'clutchNode') return 'var(--sk-series-6)';
            const role = n.data?.nodeRole;
            if (n.data?.isSelected) return 'var(--sk-series-4)';
            if (role === 'sire')      return 'var(--sk-series-1)';
            if (role === 'dam')       return 'var(--sk-series-2)';
            if (role === 'offspring') return 'var(--sk-series-3)';
            return 'var(--sk-series-6)';
          }}
          style={{
            background: 'var(--sk-surface-2)',
            border: '1px solid var(--sk-border)',
            borderRadius: '10px',
          }}
        />
        <Controls
          style={{ borderRadius: '10px', overflow: 'hidden', border: '1px solid var(--sk-border)' }}
        />
        <Background gap={20} size={1} color="var(--sk-border)" variant="dots" />
      </ReactFlow>
    </div>
  );
};

const FamilyTreeCanvas = ({ nodes, edges, onSnakeClick }) => (
  <ReactFlowProvider>
    <FlowBody
      initialNodes={nodes}
      initialEdges={edges}
      onNodeClick={onSnakeClick}
    />
  </ReactFlowProvider>
);

export default FamilyTreeCanvas;
