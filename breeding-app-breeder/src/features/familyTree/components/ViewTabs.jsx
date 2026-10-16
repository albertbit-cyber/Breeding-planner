import React from 'react';
import { useTranslation } from 'react-i18next';

/**
 * The five ways of looking at one pedigree. Each maps to a layout in `utils/layouts`.
 */
export const VIEW_TABS = [
  { id: 'tree', helpId: 'tree-view-tree', label: 'Tree', icon: '🌳', hint: 'Ancestors, clutch-mates and offspring around the selected animal' },
  { id: 'horizontal', helpId: 'tree-view-horizontal', label: 'Horizontal', icon: '↔', hint: 'A printed-style pedigree chart, read left to right' },
  { id: 'lineage', helpId: 'tree-view-lineage', label: 'Lineage', icon: '↕', hint: 'Ancestors and descendants together, scrolling both ways' },
  { id: 'clutch', helpId: 'tree-view-clutch', label: 'Clutch', icon: '🥚', hint: 'Each clutch whole — parents, hatchlings and eggs still in' },
  { id: 'universe', helpId: 'tree-view-universe', label: 'Universe', icon: '🌐', hint: 'The entire collection as one connected graph' },
];

/** The translated label and hint of one view tab, falling back to the English in VIEW_TABS. */
export const viewTabText = (t, tab) => {
  const text = {
    tree: {
      label: t('familyTree.views.tree.label', { defaultValue: 'Tree' }),
      hint: t('familyTree.views.tree.hint', { defaultValue: 'Ancestors, clutch-mates and offspring around the selected animal' }),
    },
    horizontal: {
      label: t('familyTree.views.horizontal.label', { defaultValue: 'Horizontal' }),
      hint: t('familyTree.views.horizontal.hint', { defaultValue: 'A printed-style pedigree chart, read left to right' }),
    },
    lineage: {
      label: t('familyTree.views.lineage.label', { defaultValue: 'Lineage' }),
      hint: t('familyTree.views.lineage.hint', { defaultValue: 'Ancestors and descendants together, scrolling both ways' }),
    },
    clutch: {
      label: t('familyTree.views.clutch.label', { defaultValue: 'Clutch' }),
      hint: t('familyTree.views.clutch.hint', { defaultValue: 'Each clutch whole — parents, hatchlings and eggs still in' }),
    },
    universe: {
      label: t('familyTree.views.universe.label', { defaultValue: 'Universe' }),
      hint: t('familyTree.views.universe.hint', { defaultValue: 'The entire collection as one connected graph' }),
    },
  }[tab?.id];
  return text || { label: tab?.label, hint: tab?.hint };
};

const ViewTabs = ({ activeTab, onTabChange }) => {
  const { t } = useTranslation();
  return (
  <div
    className="flex items-center gap-1 px-4 py-2 border-b border-violet-100 bg-white/80 backdrop-blur-sm flex-shrink-0 overflow-x-auto"
    role="tablist"
    aria-label={t('familyTree.views.ariaLabel', { defaultValue: 'Family tree view' })}
  >
    {VIEW_TABS.map(tab => {
      const active = activeTab === tab.id;
      const text = viewTabText(t, tab);
      return (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active}
          onClick={() => onTabChange(tab.id)}
          data-help={tab.helpId}
          title={text.hint}
          className={[
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex-shrink-0',
            active
              ? 'sk-tab-active shadow-sm'
              : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800',
          ].join(' ')}
        >
          <span aria-hidden="true">{tab.icon}</span>
          <span>{text.label}</span>
        </button>
      );
    })}
  </div>
  );
};

export default ViewTabs;
