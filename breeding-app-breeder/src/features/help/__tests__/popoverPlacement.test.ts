import { describe, expect, it } from 'vitest';
import { placePopover } from '../popoverPlacement';

const size = { width: 340, height: 160 };
const desktop = { width: 1366, height: 860 };
const phone = { width: 390, height: 844 };

const inside = (pos: { top: number; left: number }, view: { width: number; height: number }) =>
  pos.left >= 8 && pos.top >= 8 && pos.left + size.width <= view.width - 8 + 0.001 && pos.top + size.height <= view.height - 8 + 0.001;

describe('placePopover', () => {
  it('goes below the control when it fits', () => {
    const pos = placePopover({ top: 100, left: 500, width: 80, height: 30 }, size, desktop);
    expect(pos.side).toBe('below');
    expect(pos.top).toBe(138);
  });

  it('goes above when there is no room below', () => {
    const pos = placePopover({ top: 780, left: 500, width: 80, height: 30 }, size, desktop);
    expect(pos.side).toBe('above');
    expect(pos.top + size.height).toBeLessThanOrEqual(780);
  });

  it('stays 8px inside the viewport at the edges', () => {
    for (const view of [desktop, phone]) {
      for (const left of [0, view.width / 2, view.width - 20]) {
        for (const top of [0, view.height / 2, view.height - 20]) {
          const pos = placePopover({ top, left, width: 20, height: 20 }, size, view);
          expect(inside(pos, view), `${view.width} at ${left},${top}`).toBe(true);
        }
      }
    }
  });

  it('never drops into the reserved strip, even for a control inside it', () => {
    const usable = { width: 390, height: 844 - 140 };
    const pos = placePopover({ top: 790, left: 300, width: 60, height: 50 }, size, usable);
    expect(pos.top + size.height).toBeLessThanOrEqual(usable.height - 8);
  });

  it('centres near the top when the control is gone', () => {
    const pos = placePopover(null, size, phone);
    expect(pos.side).toBe('none');
    expect(inside(pos, phone)).toBe(true);
  });
});
