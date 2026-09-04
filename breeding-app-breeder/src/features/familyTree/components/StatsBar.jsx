import React from 'react';

const Stat = ({ icon, label, value }) => (
  <div className="flex items-center gap-2 px-4 py-2 border-r border-violet-100 last:border-0 flex-shrink-0">
    <span className="text-base">{icon}</span>
    <div className="flex flex-col leading-tight">
      <span className="text-xs font-bold text-neutral-700">{value ?? '—'}</span>
      <span className="text-[10px] text-neutral-500">{label}</span>
    </div>
  </div>
);

/**
 * Where the figures came from. There is no mock data behind this any more -- "This collection"
 * means the counts are drawn from the animals in the browser, which is the normal case and not
 * a degraded one, so it is not dressed up as an outage.
 */
const StatusDot = ({ online }) => (
  <div className="flex items-center gap-1.5 px-4 ml-auto flex-shrink-0">
    <div
      className={`w-2 h-2 rounded-full ${online ? 'bg-emerald-400' : 'bg-violet-300'}`}
      style={online ? { boxShadow: '0 0 0 3px rgba(52, 211, 153, 0.2)' } : {}}
    />
    <span className="text-[10px] font-semibold text-neutral-500">
      {online ? 'Shared pedigree' : 'This collection'}
    </span>
  </div>
);

const StatsBar = ({ stats }) => {
  const {
    totalSnakes = 0,
    totalClutches = 0,
    totalBreeders = 0,
    totalBloodlines = 0,
    generationsTracked = 0,
    networkStatus = 'offline',
  } = stats || {};

  const isOnline = networkStatus === 'online';

  return (
    <div className="ft-stats-bar flex items-center overflow-x-auto">
      <Stat icon="🐍" label="Snakes"      value={totalSnakes} />
      <Stat icon="🥚" label="Clutches"    value={totalClutches} />
      <Stat icon="👤" label="Breeders"    value={totalBreeders} />
      <Stat icon="🧬" label="Bloodlines"  value={totalBloodlines} />
      <Stat icon="📊" label="Generations" value={generationsTracked} />
      <StatusDot online={isOnline} />
    </div>
  );
};

export default StatsBar;
