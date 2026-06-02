import React from 'react';

export const VIEW_TABS = [
  { id: 'tree',        label: 'Tree View',    icon: '🌳', ready: true  },
  { id: 'horizontal',  label: 'Horizontal',   icon: '↔',  ready: false },
  { id: 'descendants', label: 'Descendants',  icon: '↓',  ready: false },
  { id: 'clutch',      label: 'Clutch View',  icon: '🥚', ready: false },
  { id: 'universe',    label: 'Universe',     icon: '🌐', ready: false },
];

const ViewTabs = ({ activeTab, onTabChange }) => (
  <div className="flex items-center gap-1 px-4 py-2 border-b border-violet-100 bg-white/80 backdrop-blur-sm flex-shrink-0 overflow-x-auto">
    {VIEW_TABS.map(tab => (
      <button
        key={tab.id}
        type="button"
        onClick={() => onTabChange(tab.id)}
        title={tab.ready ? tab.label : `${tab.label} — coming soon`}
        className={[
          'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex-shrink-0',
          activeTab === tab.id
            ? 'bg-violet-600 text-white shadow-sm'
            : tab.ready
            ? 'text-neutral-500 hover:bg-violet-50 hover:text-violet-700'
            : 'text-neutral-300 cursor-not-allowed',
        ].join(' ')}
        disabled={!tab.ready}
      >
        <span>{tab.icon}</span>
        <span>{tab.label}</span>
        {!tab.ready && (
          <span className="ml-0.5 rounded-full bg-neutral-100 text-neutral-400 text-[9px] px-1.5 py-0.5 font-medium">
            Soon
          </span>
        )}
      </button>
    ))}
  </div>
);

export default ViewTabs;
