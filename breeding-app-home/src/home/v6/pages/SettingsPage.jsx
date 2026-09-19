import React from 'react';
import V6Layout from '../V6Layout.jsx';
import { Appearance, FeatureInventory, Settings } from '../SetupSections.jsx';
import { Waitlist } from '../ClosingSections.jsx';
import PageIntro from './PageIntro.jsx';

/* Settings, appearance and the full feature inventory. Reference material: the
   nine setup screens, the theming system, and the sixteen-item inventory that
   used to restate most of the landing page after the reader had already read it. */
export default function SettingsPage() {
  return (
    <V6Layout>
      <PageIntro
        eyebrow="Setup"
        title="Settings that do the work for you."
        lead="The details you enter once and never type again, your own ID format, the names your
          community actually uses, and an interface that adapts to how you need to read it."
      />
      <Settings />
      <Appearance />
      <FeatureInventory />
      <Waitlist />
    </V6Layout>
  );
}
