import React from 'react';
import { Handle, Position } from 'reactflow';

const PlaceholderNode = ({ data }) => {
  const { role } = data;
  const label    = role === 'sire' ? 'Unknown Sire' : role === 'dam' ? 'Unknown Dam' : 'Unknown Parent';
  const sexIcon  = role === 'sire' ? '♂' : role === 'dam' ? '♀' : '?';
  const sexColor = role === 'sire' ? 'text-sky-300' : role === 'dam' ? 'text-pink-300' : 'text-neutral-400';

  return (
    <div className="rounded-xl border-2 border-dashed border-neutral-200 bg-neutral-50/80 p-3 opacity-70 select-none">
      <Handle
        id="t-top"
        type="target"
        position={Position.Top}
        className="!w-2 !h-2 !bg-neutral-300 !border-neutral-200"
      />
      <Handle id="t-left" type="target" position={Position.Left} className="!w-2 !h-2 !opacity-0 !border-0" />

      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-full bg-neutral-100 border border-neutral-200 flex-shrink-0 flex items-center justify-center">
          <span className={`text-base ${sexColor}`}>{sexIcon}</span>
        </div>
        <div className="min-w-0">
          <div className="text-xs font-medium text-neutral-400">{label}</div>
          <div className="text-[10px] text-neutral-400">No record</div>
        </div>
      </div>

      <Handle
        id="s-bottom"
        type="source"
        position={Position.Bottom}
        className="!w-2 !h-2 !bg-neutral-300 !border-neutral-200"
      />
      <Handle id="s-right" type="source" position={Position.Right} className="!w-2 !h-2 !opacity-0 !border-0" />
    </div>
  );
};

export default PlaceholderNode;
