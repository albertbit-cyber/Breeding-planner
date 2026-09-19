import React from 'react';
import Calculator from './Calculator.jsx';
import ClosingSections from './ClosingSections.jsx';
import ProductSections, { Breeding } from './ProductSections.jsx';
import SetupSections from './SetupSections.jsx';
import SiteHeader from './SiteHeader.jsx';
import V6Layout from './V6Layout.jsx';

/**
 * The Serpentora landing page — the "v6 / Jungle Glass" design.
 *
 * This used to be the whole site: nineteen sections in one 17,000px scroll,
 * which put the plans at 91% depth and the closing waitlist at 97%. Everything
 * here still is, but the reference material — the collection and pedigree, the
 * quarantine protocol, the settings and the full inventory — now has its own
 * routes. What is left is the argument: what it is, proof you can operate
 * yourself, the season, the lab chain, how to start, and what it costs.
 */
export default function SerpentoraSite() {
  return (
    <V6Layout>
      <SiteHeader />
      <Breeding />
      <Calculator />
      <ProductSections />
      <SetupSections />
      <ClosingSections />
    </V6Layout>
  );
}
