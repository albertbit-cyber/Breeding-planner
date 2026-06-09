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
            if (n.type === 'placeholderNode') return '#e5e7eb';
            if (n.type === 'junctionNode') return '#7c3aed';
            if (n.type === 'clutchNode') return '#8b5cf6';
            const role = n.data?.nodeRole;
            if (n.data?.isSelected) return '#7c3aed';
            if (role === 'sire')      return '#0ea5e9';
            if (role === 'dam')       return '#ec4899';
            if (role === 'offspring') return '#10b981';
            return '#a78bfa';
          }}
          style={{
            background: '#f5f3ff',
            border: '1px solid #ddd6fe',
            borderRadius: '10px',
          }}
        />
        <Controls
          style={{ borderRadius: '10px', overflow: 'hidden', border: '1px solid #ddd6fe' }}
        />
        <Background gap={20} size={1} color="#ede9fe" variant="dots" />
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
