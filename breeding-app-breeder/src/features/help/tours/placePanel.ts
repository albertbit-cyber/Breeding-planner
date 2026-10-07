// Where the tour panel goes. Plain function, tested over a grid of targets and viewports.
//
// 1. 12px from the viewport edge, 14px from the target, 8px halo around the ring.
// 2. Try below, above, right, left, centred on the target along the other axis and
//    clamped; take the first that fits on screen and does not cover target + halo.
// 3. If none fits (a huge control, a narrow phone): the first corner that does not
//    cover it, in the order top-right, bottom-right, top-left, bottom-left.
// 4. No target: bottom-right.

export interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

export const MARGIN = 12;
export const GAP = 14;
export const HALO = 8;
// The smallest band worth putting a capped panel in (heading, a line, the buttons).
export const MIN_BAND = 110;

const overlaps = (a: Rect, b: Rect) =>
  a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height;

const fits = (box: Rect, viewport: Size) =>
  box.left >= MARGIN - 0.5
  && box.top >= MARGIN - 0.5
  && box.left + box.width <= viewport.width - MARGIN + 0.5
  && box.top + box.height <= viewport.height - MARGIN + 0.5;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));

export interface Placement {
  top: number;
  left: number;
  side: string;
  // Set when the panel must be shorter than it wants to be to clear the control.
  maxHeight?: number;
}

export const placePanel = (target: Rect | null, panel: Size, viewport: Size): Placement => {
  const corners: Array<[string, Rect]> = [
    ['top-right', { top: MARGIN, left: viewport.width - MARGIN - panel.width, ...panel }],
    ['bottom-right', { top: viewport.height - MARGIN - panel.height, left: viewport.width - MARGIN - panel.width, ...panel }],
    ['top-left', { top: MARGIN, left: MARGIN, ...panel }],
    ['bottom-left', { top: viewport.height - MARGIN - panel.height, left: MARGIN, ...panel }],
  ];
  if (!target) {
    const [, box] = corners[1];
    return { top: box.top, left: box.left, side: 'bottom-right' };
  }
  const halo: Rect = {
    top: target.top - HALO,
    left: target.left - HALO,
    width: target.width + HALO * 2,
    height: target.height + HALO * 2,
  };
  const centreX = clamp(target.left + target.width / 2 - panel.width / 2, MARGIN, viewport.width - MARGIN - panel.width);
  const centreY = clamp(target.top + target.height / 2 - panel.height / 2, MARGIN, viewport.height - MARGIN - panel.height);
  const sides: Array<[string, Rect]> = [
    ['below', { top: target.top + target.height + GAP, left: centreX, ...panel }],
    ['above', { top: target.top - GAP - panel.height, left: centreX, ...panel }],
    ['right', { top: centreY, left: target.left + target.width + GAP, ...panel }],
    ['left', { top: centreY, left: target.left - GAP - panel.width, ...panel }],
  ];
  for (const [side, box] of [...sides, ...corners]) {
    if (fits(box, viewport) && !overlaps(box, halo)) return { top: box.top, left: box.left, side };
  }
  // 5. Nothing clears it at full height (a small phone, a tall control mid-screen): take
  //    the larger band above or below the target and cap the panel's height to it. The
  //    panel scrolls inside; it still never covers the control.
  const roomAbove = target.top - GAP - MARGIN;
  const roomBelow = viewport.height - MARGIN - (target.top + target.height + GAP);
  if (Math.max(roomAbove, roomBelow) >= MIN_BAND) {
    return roomBelow >= roomAbove
      ? { top: target.top + target.height + GAP, left: centreX, side: 'band-below', maxHeight: roomBelow }
      : { top: MARGIN, left: centreX, side: 'band-above', maxHeight: roomAbove };
  }
  // The control fills the screen: keep the panel on screen in the bottom-right corner.
  const [, box] = corners[1];
  return { top: Math.max(MARGIN, box.top), left: Math.max(MARGIN, box.left), side: 'fallback' };
};
