import React from 'react';

/**
 * The five ways of looking at one pedigree. Each maps to a layout in `utils/layouts`.
 */
export const VIEW_TABS = [
  { id: 'tree', label: 'Tree', icon: '🌳', hint: 'Ancestors, clutch-mates and offspring around the selected animal' },
  { id: 'horizontal', label: 'Horizontal', icon: '↔', hint: 'A printed-style pedigree chart, read left to right' },
  { id: 'lineage', label: 'Lineage', icon: '↕', hint: 'Ancestors and descendants together, scrolling both ways' },
  { id: 'clutch', label: 'Clutch', icon: '🥚', hint: 'Each clutch whole — parents, hatchlings and eggs still in' },
  { id: 'universe', label: 'Universe', icon: '🌐', hint: 'The entire collection as one connected graph' },
];

const ViewTabs = ({ activeTab, onTabChange }) => (
  <div
    className="flex items-center gap-1 px-4 py-2 border-b border-violet-100 bg-white/80 backdrop-blur-sm flex-shrink-0 overflow-x-auto"
    role="tablist"
    aria-label="Family tree view"
  >
    {VIEW_TABS.map(tab => {
      const active = activeTab === tab.id;
      return (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active}
          onClick={() => onTabChange(tab.id)}
          title={tab.hint}
          className={[
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex-shrink-0',
            active
              ? 'sk-tab-active shadow-sm'
              : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800',
          ].join(' ')}
        >
          <span aria-hidden="true">{tab.icon}</span>
          <span>{tab.label}</span>
        </button>
      );
    })}
  </div>
);

export default ViewTabs;
