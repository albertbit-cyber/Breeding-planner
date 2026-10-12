import React from 'react';
import { Handle, Position } from 'reactflow';
import { useTranslation } from 'react-i18next';

/**
 * The label on a clutch's branch. It carries the clutch ID the keeper knows it by, and a count
 * of what came out of it, so a branch can be read without following it down to the cards.
 */
const ClutchNode = ({ data }) => {
  const { t } = useTranslation();
  const { label, hatchedCount = 0, eggCount = 0, isSelected } = data || {};

  return (
    <div
      className={[
        'rounded-lg border bg-white px-3 py-1.5 text-center shadow-sm transition-all',
        isSelected ? 'border-violet-400 ring-2 ring-violet-200' : 'border-violet-200',
      ].join(' ')}
    >
      <Handle type="target" id="t-top" position={Position.Top} className="opacity-0" />
      <Handle type="target" id="t-left" position={Position.Left} className="opacity-0" />

      <div className="text-[10px] uppercase tracking-wide font-semibold text-violet-600 truncate">
        {label || t('familyTree.clutchNode.clutch', { defaultValue: 'Clutch' })}
      </div>

      {(hatchedCount > 0 || eggCount > 0) && (
        <div className="mt-0.5 flex items-center justify-center gap-1.5 text-[9px] font-medium text-neutral-400">
          {hatchedCount > 0 && <span>{t('familyTree.clutchNode.hatched', { defaultValue: '{{hatched}} hatched', hatched: hatchedCount })}</span>}
          {hatchedCount > 0 && eggCount > 0 && <span className="text-violet-200">·</span>}
          {eggCount > 0 && <span>{t('familyTree.clutchNode.inEgg', { defaultValue: '{{eggs}} in egg', eggs: eggCount })}</span>}
        </div>
      )}

      <Handle type="source" id="s-bottom" position={Position.Bottom} className="opacity-0" />
      <Handle type="source" id="s-right" position={Position.Right} className="opacity-0" />
    </div>
  );
};

export default ClutchNode;
