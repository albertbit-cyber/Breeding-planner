import React from 'react';
import { Handle, Position } from 'reactflow';

const ClutchNode = ({ data }) => (
  <div className="rounded-lg border border-violet-200 bg-white px-3 py-1.5 text-center shadow-sm">
    <Handle type="target" position={Position.Top} className="opacity-0" />
    <div className="text-[10px] uppercase tracking-wide font-semibold text-violet-600 truncate">
      {data?.label || 'Clutch'}
    </div>
    <Handle type="source" position={Position.Bottom} className="opacity-0" />
  </div>
);

export default ClutchNode;
