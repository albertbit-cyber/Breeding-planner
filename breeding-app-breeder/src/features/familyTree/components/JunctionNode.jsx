import React from 'react';
import { Handle, Position } from 'reactflow';

// Junction dot sits between a sire/dam pair and their offspring.
// Left and Right are targets (sire and dam connect in from each side).
// Bottom is the source (offspring or clutch node connects out below).
// No Top handle — nothing connects into the junction from above.
const HANDLE_STYLE = {
  width: 6,
  height: 6,
  background: '#7c3aed',
  border: '2px solid #ede9fe',
};

const JunctionNode = () => (
  <div className="relative w-3 h-3 rounded-full bg-violet-500 shadow-sm shadow-violet-200">
    <Handle type="target" id="left"   position={Position.Left}   style={HANDLE_STYLE} />
    <Handle type="target" id="right"  position={Position.Right}  style={HANDLE_STYLE} />
    <Handle type="source" id="bottom" position={Position.Bottom} style={HANDLE_STYLE} />
  </div>
);

export default JunctionNode;
