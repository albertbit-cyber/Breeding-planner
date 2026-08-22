import React from 'react';

import HeroBlock from './HeroBlock.jsx';
import StatsBlock from './StatsBlock.jsx';
import FeatureGridBlock from './FeatureGridBlock.jsx';
import FeatureListBlock from './FeatureListBlock.jsx';
import StepsBlock from './StepsBlock.jsx';
import TutorialListBlock from './TutorialListBlock.jsx';
import CtaBlock from './CtaBlock.jsx';
import RichTextBlock from './RichTextBlock.jsx';
import PricingTableBlock from './PricingTableBlock.jsx';

/**
 * The block registry. A page is an array of `{ type, ...props }` objects and
 * this maps each `type` onto the component that draws it.
 *
 * Phase 1 feeds these from a JSON constant in the repo; phase 2 will feed the
 * same shape from the content API so the admin editor and this renderer stay two
 * ends of one contract. Adding a block type means adding it here and to the
 * editor's field definitions — nowhere else.
 */
export const BLOCK_TYPES = {
  hero: HeroBlock,
  stats: StatsBlock,
  featureGrid: FeatureGridBlock,
  featureList: FeatureListBlock,
  steps: StepsBlock,
  tutorials: TutorialListBlock,
  cta: CtaBlock,
  richText: RichTextBlock,
  pricingTable: PricingTableBlock,
};

export const BLOCK_TYPE_NAMES = Object.keys(BLOCK_TYPES);

/**
 * An unrecognised type is skipped rather than thrown. Once content comes from
 * the database an editor can publish a block this bundle predates, and losing
 * one section is a great deal better than a blank page where the site used to
 * be. In development it is noisy on purpose.
 */
function UnknownBlock({ type }) {
  if (import.meta.env.DEV) {
    console.warn(`[blocks] Unknown block type "${type}" — skipped.`);
    return (
      <div style={{ padding: '1rem 1.5rem', background: '#fbd5d5', color: '#8c2020', fontSize: 13 }}>
        Unknown block type <code>{String(type)}</code> — nothing rendered.
      </div>
    );
  }
  return null;
}

export function Block({ block }) {
  if (!block || block.hidden) return null;
  const Component = BLOCK_TYPES[block.type];
  if (!Component) return <UnknownBlock type={block.type} />;

  const { type, id, hidden, ...props } = block;
  return <Component {...props} />;
}

export default function BlockRenderer({ blocks = [] }) {
  return (
    <>
      {blocks.map((block, i) => (
        <Block key={(block && block.id) || i} block={block} />
      ))}
    </>
  );
}
