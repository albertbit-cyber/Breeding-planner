import React from 'react';
import V6Layout from '../V6Layout.jsx';
import QuarantineSection from '../QuarantineSection.jsx';
import { Waitlist } from '../ClosingSections.jsx';
import PageIntro from './PageIntro.jsx';

/* The quarantine protocol: seven subsections on its own route.
   It is the deepest, most useful writing on the site and it was buried two
   thirds of the way down a 17,000px scroll. */
export default function QuarantinePage() {
  return (
    <V6Layout>
      <PageIntro
        eyebrow="Quarantine"
        title="New arrivals, handled properly."
        lead="An isolation clock set by where the animal came from, a weekly check that does not
          depend on memory, the diagnostics worth running and the limits of each — and six clearance
          gates that report rather than block."
      />
      <QuarantineSection />
      <Waitlist />
    </V6Layout>
  );
}
