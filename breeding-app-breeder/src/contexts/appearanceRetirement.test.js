/**
 * Guards the skin/material retirement: anything removed from the picker must
 * still resolve to something legal for users who had it saved.
 */
import { describe, it, expect } from 'vitest';
import { sanitizeAppearance, APPEARANCE_PRESETS, MATERIALS } from './AppearanceContext.jsx';

import { APPEARANCE_VERSION as V } from './AppearanceContext.jsx';
describe('retirement migration', () => {
  it('remaps removed skins to a surviving dark neighbour, not to light default', () => {
    expect(sanitizeAppearance({ version: V, preset: 'deep-canopy' }).preset).toBe('moss-mist');
    expect(sanitizeAppearance({ version: V, preset: 'copper-canopy' }).preset).toBe('fern-clay');
  });
  it('remaps removed materials', () => {
    expect(sanitizeAppearance({ version: V, preset: 'moss-mist', material: 'journal' }).material).toBe('vellum');
    for (const m of ['soapstone', 'basalt', 'moss-relief', 'lacquer']) {
      expect(sanitizeAppearance({ version: V, preset: 'moss-mist', material: m }).material).toBe('flat');
    }
  });
  it('never lets a replacement land on a skin that blocks it', () => {
    // journal -> vellum, but vellum is `no` on the AAA skin
    expect(sanitizeAppearance({ version: V, preset: 'high-contrast-forest', material: 'journal' }).material).toBe('flat');
  });
  it('keeps surviving values untouched', () => {
    const r = sanitizeAppearance({ version: V, preset: 'moss-mist', material: 'vellum' });
    expect(r.preset).toBe('moss-mist');
    expect(r.material).toBe('vellum');
  });
  it('still lands retired accessibility presets on the AAA skin (regression)', () => {
    expect(sanitizeAppearance({ version: 1, preset: 'highContrast' }).preset).toBe('high-contrast-forest');
    expect(sanitizeAppearance({ version: 1, preset: 'visualImpaired' }).preset).toBe('high-contrast-forest');
  });
  it('garbage falls back to default', () => {
    expect(sanitizeAppearance({ version: V, preset: 'nope', material: 'nope' }).preset).toBe('default');
  });
});
