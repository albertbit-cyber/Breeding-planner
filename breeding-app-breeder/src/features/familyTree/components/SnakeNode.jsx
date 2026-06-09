import React from 'react';
import { Handle, Position } from 'reactflow';

const SEX_ICON  = { male: '♂', female: '♀', unknown: '?' };
const SEX_COLOR = { male: 'text-sky-500', female: 'text-pink-500', unknown: 'text-neutral-400' };

const STATUS_CHIP = {
  breeding:  'bg-violet-100 text-violet-700',
  holdback:  'bg-amber-100  text-amber-700',
  hatchling: 'bg-emerald-100 text-emerald-700',
  sold:      'bg-neutral-100 text-neutral-500',
  retired:   'bg-gray-100   text-gray-500',
};

const ROLE_BORDER = {
  selected:  'border-violet-400 ring-2 ring-violet-300 shadow-violet-100',
  sire:      'border-sky-200',
  dam:       'border-pink-200',
  offspring: 'border-emerald-200',
  sibling:   'border-amber-200',
  ancestor:  'border-neutral-200',
};

const ROLE_BG = {
  selected:  'bg-violet-50',
  sire:      'bg-sky-50',
  dam:       'bg-pink-50',
  offspring: 'bg-emerald-50',
  sibling:   'bg-amber-50',
  ancestor:  'bg-white',
};

const AVATAR_GRADIENT = {
  selected:  'linear-gradient(135deg, #7c3aed, #a78bfa)',
  sire:      'linear-gradient(135deg, #0ea5e9, #38bdf8)',
  dam:       'linear-gradient(135deg, #ec4899, #f9a8d4)',
  offspring: 'linear-gradient(135deg, #10b981, #6ee7b7)',
  sibling:   'linear-gradient(135deg, #f59e0b, #fcd34d)',
  ancestor:  'linear-gradient(135deg, #6366f1, #a5b4fc)',
};

const SnakeNode = ({ data }) => {
  const { snake, nodeRole = 'ancestor', isSelected } = data;
  const role = isSelected ? 'selected' : nodeRole;

  const initial = snake.name?.charAt(0)?.toUpperCase() || '?';
  const sexIcon  = SEX_ICON[snake.sex]  || '?';
  const sexColor = SEX_COLOR[snake.sex] || 'text-neutral-400';
  const statusClass = STATUS_CHIP[snake.status] || 'bg-neutral-100 text-neutral-500';
  const displayedGenes = (snake.genetics || []).slice(0, 3);
  const extraGeneCount = (snake.genetics || []).length - 3;

  return (
    <div
      className={[
        'rounded-xl border p-3 shadow-md transition-all select-none cursor-pointer',
        ROLE_BORDER[role] || 'border-neutral-200',
        ROLE_BG[role]    || 'bg-white',
      ].join(' ')}
    >
      {/* Incoming edge handle (top) */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-2 !h-2 !bg-violet-400 !border-violet-300"
      />

      {/* Header row: avatar + name/id + sex */}
      <div className="flex items-center gap-2.5">
        <div
          className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-sm font-bold text-white shadow-sm"
          style={{ background: AVATAR_GRADIENT[role] || AVATAR_GRADIENT.ancestor }}
        >
          {snake.photoUrl ? (
            <img
              src={snake.photoUrl}
              alt={snake.name}
              className="w-full h-full rounded-full object-cover"
            />
          ) : (
            initial
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-neutral-900 truncate leading-tight">
            {snake.name || 'Unnamed'}
          </div>
          <div className="text-[10px] text-neutral-400 truncate font-mono">
            {snake.globalId || snake.localId || '—'}
          </div>
        </div>

        <span className={`text-base font-bold flex-shrink-0 ${sexColor}`}>
          {sexIcon}
        </span>
      </div>

      {/* Genetics chips */}
      {displayedGenes.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {displayedGenes.map(g => (
            <span
              key={g}
              className="rounded-md bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700 leading-tight"
            >
              {g}
            </span>
          ))}
          {extraGeneCount > 0 && (
            <span className="rounded-md bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-500 leading-tight">
              +{extraGeneCount}
            </span>
          )}
        </div>
      )}

      {/* Footer: breeder name + status badge */}
      <div className="mt-2 flex items-center justify-between gap-1">
        <div className="text-[10px] text-neutral-400 truncate flex-1">
          {snake.breederName || '—'}
        </div>
        {snake.status && (
          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-tight flex-shrink-0 ${statusClass}`}>
            {snake.status}
          </span>
        )}
      </div>

      {/* Hatch year if available */}
      {snake.hatchDate && (
        <div className="mt-1 text-[9px] text-neutral-300 text-right font-mono">
          {snake.hatchDate.slice(0, 4)}
        </div>
      )}

      {/* Outgoing edge handle (bottom) */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-2 !h-2 !bg-violet-400 !border-violet-300"
      />
    </div>
  );
};

export default SnakeNode;
