import React from 'react';
import V6Layout from '../V6Layout.jsx';
import { Advisor, Collection, PedigreeAndHealth } from '../ProductSections.jsx';
import { SpeciesLibrary } from '../SetupSections.jsx';
import { Waitlist } from '../ClosingSections.jsx';
import PageIntro from './PageIntro.jsx';

/* The animal record, end to end: the card, the pedigree, the health history and
   the advisor that reads them. Lifted off the landing page, which was carrying
   nineteen sections. */
export default function CollectionPage() {
  return (
    <V6Layout>
      <PageIntro
        eyebrow="The collection"
        title="One record per animal, from hatch to sale."
        lead="Weights, feeds, sheds, sexing, photos and IDs on the card. Four generations and an
          inbreeding coefficient in the tree. Every health event in the history. The advisor reads
          all three."
      />
      <Collection />
      <PedigreeAndHealth />
      <Advisor />
      <SpeciesLibrary />
      <Waitlist />
    </V6Layout>
  );
}
