import { describe, expect, it } from 'vitest';
import { HALO, MARGIN, placePanel, type Rect } from '../tours/placePanel';

const viewports = [
  { width: 1366, height: 860 },
  { width: 1024, height: 700 },
  { width: 390, height: 844 },
  { width: 320, height: 568 },
];
const panel = (view: { width: number }) => ({ width: Math.min(360, view.width - MARGIN * 2), height: 220 });

const overlaps = (a: Rect, b: Rect) =>
  a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height;

describe('placePanel', () => {
  it('never covers the target or its halo and always stays on screen', () => {
    for (const view of viewports) {
      const size = panel(view);
      for (const fx of [0, 0.25, 0.5, 0.75, 1]) {
        for (const fy of [0, 0.25, 0.5, 0.75, 1]) {
          for (const [w, h] of [[40, 40], [160, 44], [view.width * 0.6, 120]]) {
            const target = {
              left: Math.min(view.width - w - 4, Math.max(4, fx * view.width - w / 2)),
              top: Math.min(view.height - h - 4, Math.max(4, fy * view.height - h / 2)),
              width: w,
              height: h,
            };
            const pos = placePanel(target, size, view);
            const box = { top: pos.top, left: pos.left, width: size.width, height: Math.min(size.height, pos.maxHeight ?? Infinity) };
            const where = `${view.width}x${view.height} target ${Math.round(target.left)},${Math.round(target.top)} ${Math.round(w)}x${h}`;
            expect(box.left, where).toBeGreaterThanOrEqual(MARGIN - 0.5);
            expect(box.top, where).toBeGreaterThanOrEqual(MARGIN - 0.5);
            expect(box.left + box.width, where).toBeLessThanOrEqual(view.width - MARGIN + 0.5);
            expect(box.top + box.height, where).toBeLessThanOrEqual(view.height - MARGIN + 0.5);
            const halo = { top: target.top - HALO, left: target.left - HALO, width: target.width + HALO * 2, height: target.height + HALO * 2 };
            if (pos.side !== 'fallback') expect(overlaps(box, halo), where).toBe(false);
          }
        }
      }
    }
  });

  it('prefers below, then above', () => {
    const view = viewports[0];
    expect(placePanel({ top: 100, left: 600, width: 100, height: 40 }, panel(view), view).side).toBe('below');
    expect(placePanel({ top: 760, left: 600, width: 100, height: 40 }, panel(view), view).side).toBe('above');
  });

  it('caps the panel to the free band when even the corners would cover the control', () => {
    const view = { width: 320, height: 568 };
    const pos = placePanel({ top: 224, left: 4, width: 192, height: 120 }, panel(view), view);
    expect(pos.side).toMatch(/^band-/);
    expect(pos.maxHeight).toBeGreaterThanOrEqual(110);
  });

  it('only gives up (fallback) when the control fills the screen', () => {
    const view = { width: 390, height: 844 };
    expect(placePanel({ top: 20, left: 0, width: 390, height: 800 }, panel(view), view).side).toBe('fallback');
  });

  it('goes bottom-right with no target', () => {
    const view = viewports[2];
    const size = panel(view);
    const pos = placePanel(null, size, view);
    expect(pos.side).toBe('bottom-right');
    expect(pos.top + size.height).toBe(view.height - MARGIN);
  });
});
