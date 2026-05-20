import React from 'react';

const SEX_ICON  = { male: '♂', female: '♀' };
const SEX_COLOR = { male: 'text-sky-500', female: 'text-pink-500' };

const STATUS_CHIP = {
  breeding:  'bg-violet-100 text-violet-700 border-violet-200',
  holdback:  'bg-amber-100  text-amber-700  border-amber-200',
  hatchling: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  sold:      'bg-neutral-100 text-neutral-500 border-neutral-200',
  retired:   'bg-gray-100   text-gray-500   border-gray-200',
};

const LEGEND_ITEMS = [
  { color: 'bg-violet-400', label: 'Selected snake' },
  { color: 'bg-sky-400',    label: 'Sire (male parent)' },
  { color: 'bg-pink-400',   label: 'Dam (female parent)' },
  { color: 'bg-emerald-400',label: 'Offspring' },
  { color: 'bg-neutral-300',label: 'Unknown parent' },
];

const AvatarPlaceholder = ({ snake }) => {
  const initial = snake?.name?.charAt(0)?.toUpperCase() || '?';
  const gradient =
    snake?.sex === 'male'
      ? 'linear-gradient(135deg, #7c3aed, #a78bfa)'
      : 'linear-gradient(135deg, #7c3aed, #f472b6)';

  if (snake?.photoUrl) {
    return (
      <img
        src={snake.photoUrl}
        alt={snake.name}
        className="w-full h-full object-cover rounded-2xl"
      />
    );
  }
  return (
    <div
      className="w-full h-full rounded-2xl flex items-center justify-center text-3xl font-bold text-white shadow-inner"
      style={{ background: gradient }}
    >
      {initial}
    </div>
  );
};

const InfoRow = ({ label, value, mono }) => (
  <div className="flex items-start justify-between gap-2 py-1.5 border-b border-neutral-50 last:border-0">
    <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400 flex-shrink-0">
      {label}
    </span>
    <span className={`text-xs text-neutral-700 text-right ${mono ? 'font-mono' : ''}`}>
      {value || '—'}
    </span>
  </div>
);

const SelectedSnakePanel = ({ snake, parents, onSnakeSelect, allSnakes }) => {
  if (!snake) {
    return (
      <div className="ft-left-panel flex items-center justify-center">
        <p className="text-sm text-neutral-400">Select a snake to view details.</p>
      </div>
    );
  }

  const sexIcon  = SEX_ICON[snake.sex]  || '?';
  const sexColor = SEX_COLOR[snake.sex] || 'text-neutral-400';
  const statusClass = STATUS_CHIP[snake.status] || 'bg-neutral-100 text-neutral-500 border-neutral-200';

  return (
    <div className="ft-left-panel flex flex-col gap-4 overflow-y-auto">
      {/* Snake avatar card */}
      <div className="rounded-2xl bg-white border border-violet-100 shadow-sm p-4 flex flex-col gap-3">
        <div className="h-32 w-full">
          <AvatarPlaceholder snake={snake} />
        </div>

        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-base font-bold text-neutral-900 leading-tight truncate">
              {snake.name}
            </div>
            <div className="text-[11px] text-neutral-400 font-mono">
              {snake.globalId || snake.localId || '—'}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
            <span className={`text-xl font-bold ${sexColor}`}>{sexIcon}</span>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusClass}`}>
              {snake.status}
            </span>
          </div>
        </div>

        {/* Genetics */}
        {snake.genetics?.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {snake.genetics.map(g => (
              <span
                key={g}
                className="rounded-lg bg-violet-100 px-2 py-1 text-[11px] font-semibold text-violet-700"
              >
                {g}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Quick info */}
      <div className="rounded-2xl bg-white border border-violet-100 shadow-sm p-4">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-violet-500 mb-2">
          Quick Info
        </div>
        <div className="space-y-0">
          <InfoRow label="Species"  value={snake.species} />
          <InfoRow label="Hatch"    value={snake.hatchDate} mono />
          <InfoRow label="Breeder"  value={snake.breederName} />
          <InfoRow label="ID"       value={snake.globalId || snake.localId} mono />
          <InfoRow label="Parents"  value={
            [parents?.sire?.name, parents?.dam?.name].filter(Boolean).join(' × ') || 'Unknown'
          } />
        </div>
      </div>

      {/* Snake search / switch */}
      {allSnakes?.length > 1 && (
        <div className="rounded-2xl bg-white border border-violet-100 shadow-sm p-4">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-violet-500 mb-2">
            Switch Snake
          </div>
          <div className="space-y-1 max-h-36 overflow-y-auto">
            {allSnakes.map(s => (
              <button
                key={s.id}
                type="button"
                onClick={() => onSnakeSelect?.(s)}
                className={[
                  'w-full text-left rounded-lg px-2 py-1.5 text-xs transition-colors flex items-center gap-2',
                  s.id === snake.id
                    ? 'bg-violet-100 text-violet-800 font-semibold'
                    : 'text-neutral-600 hover:bg-neutral-50',
                ].join(' ')}
              >
                <span className={s.sex === 'male' ? 'text-sky-500' : 'text-pink-500'}>
                  {SEX_ICON[s.sex] || '?'}
                </span>
                <span className="truncate">{s.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="rounded-2xl bg-white border border-violet-100 shadow-sm p-4">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-violet-500 mb-2">
          Legend
        </div>
        <div className="space-y-1.5">
          {LEGEND_ITEMS.map(({ color, label }) => (
            <div key={label} className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-sm flex-shrink-0 ${color}`} />
              <span className="text-[11px] text-neutral-600">{label}</span>
            </div>
          ))}
          <div className="flex items-center gap-2 mt-1">
            <div className="w-3 h-0.5 border-t-2 border-dashed border-neutral-300 flex-shrink-0" />
            <span className="text-[11px] text-neutral-600">Unconfirmed link</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 border-t-2 border-solid border-violet-400 flex-shrink-0" />
            <span className="text-[11px] text-neutral-600">Confirmed link</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SelectedSnakePanel;
