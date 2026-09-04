import React from 'react';
import { Handle, Position } from 'reactflow';

/**
 * The dot where a sire and a dam meet. Everything that clutch produced hangs off it, so one
 * junction is drawn per clutch rather than per pair -- that is what keeps two clutches from the
 * same pair, and half-siblings by different partners, on separate branches.
 *
 * Handles exist for both orientations. A stacked layout feeds the parents in from the sides and
 * drops the offspring out of the bottom; a horizontal one feeds both parents in from the left
 * and runs the offspring out to the right.
 */
const HANDLE_STYLE = {
  width: 6,
  height: 6,
  background: '#7c3aed',
  border: '2px solid #ede9fe',
};

const HIDDEN = { ...HANDLE_STYLE, opacity: 0, border: 0 };

const JunctionNode = () => (
  <div className="relative w-3 h-3 rounded-full bg-violet-500 shadow-sm shadow-violet-200">
    <Handle type="target" id="t-left" position={Position.Left} style={HANDLE_STYLE} />
    <Handle type="target" id="t-right" position={Position.Right} style={HANDLE_STYLE} />
    <Handle type="target" id="t-top" position={Position.Top} style={HIDDEN} />
    <Handle type="source" id="s-bottom" position={Position.Bottom} style={HANDLE_STYLE} />
    <Handle type="source" id="s-right" position={Position.Right} style={HIDDEN} />
  </div>
);

export default JunctionNode;
