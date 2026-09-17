import React from 'react';
import './v6.css';
import Calculator from './Calculator.jsx';
import ClosingSections from './ClosingSections.jsx';
import ProductSections, { Breeding } from './ProductSections.jsx';
import QuarantineSection from './QuarantineSection.jsx';
import SetupSections from './SetupSections.jsx';
import SiteHeader from './SiteHeader.jsx';
import { LookProvider, useLookState } from './useLook.js';

/**
 * The Serpentora marketing site — the "v6 / Jungle Glass" design.
 *
 * Section order follows the design file exactly, and the numbering in the
 * eyebrows is the design's own: it runs 01, 02, 03, 04, then the collection,
 * 06, 05, the lab pair, 08, 07, 12, and so on. The numbers label the parts of
 * the product, not the order they are read in, so they are left alone.
 *
 * This page brings its own masthead and footer rather than the site-wide Navbar
 * and Footer, which are built for the light marketing chrome on the other
 * routes and would fight this palette. See HomeApp for the routing split.
 */
export default function SerpentoraSite() {
  const look = useLookState();

  return (
    <LookProvider value={look}>
      <div className="v6" data-look={look.look}>
        <div
          className="v6-glow"
          style={{ top: -180, left: -120, width: 720, height: 720, filter: 'blur(18px)' }}
        />
        <div
          className="v6-glow"
          style={{
            top: 620,
            right: -200,
            width: 760,
            height: 760,
            filter: 'blur(22px)',
            animationDuration: '34s',
            animationDirection: 'reverse',
          }}
        />

        <SiteHeader />
        <Breeding />
        <Calculator />
        <ProductSections />
        <QuarantineSection />
        <SetupSections />
        <ClosingSections />
      </div>
    </LookProvider>
  );
}
