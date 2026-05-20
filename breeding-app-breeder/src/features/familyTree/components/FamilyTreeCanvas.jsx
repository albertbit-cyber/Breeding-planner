import React, { useCallback, useMemo } from 'react';
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

const NODE_TYPES = {
  snakeNode: SnakeNode,
  placeholderNode: PlaceholderNode,
};

// Generation label overlay — rendered as a custom ReactFlow panel
const GenLabelOverlay = ({ nodes }) => {
  const genGroups = useMemo(() => {
    const groups = {};
    for (const n of nodes) {
      const y = n.position.y;
      if (!groups[y]) groups[y] = { y, minY: y, label: '' };
    }
    // Assign labels by y position (lower y = earlier generation)
    const ys = Object.keys(groups)
      .map(Number)
      .sort((a, b) => a - b);
    const labelMap = {
      [ys[0]]: 'Great-grandparents',
      [ys[1]]: 'Grandparents',
      [ys[2]]: 'Parents',
      [ys[3]]: 'Selected',
      [ys[4]]: 'Offspring',
    };
    // 3-gen layout: [gen-2, gen-1, gen0, gen+1]
    const fallback = ['Ancestors', 'Grandparents', 'Parents', 'Selected', 'Offspring'];
    return ys.map((y, i) => ({
      y,
      label: labelMap[y] || fallback[i] || `Gen ${i}`,
    }));
  }, [nodes]);

  return (
    <div className="absolute left-3 top-0 bottom-0 pointer-events-none flex flex-col justify-around z-10">
      {genGroups.map(({ y, label }) => (
        <div
          key={y}
          className="flex items-center gap-1.5"
        >
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
  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

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
