export interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

const EDGE = 8;
const GAP = 8;

// Where the Help Mode popover goes: below the control if it fits, else above, else
// whichever side has more room. Centred on the control and clamped 8px inside the
// viewport. `viewport.height` is the usable height: callers subtract any strip kept free
// at the bottom (the Help Mode pill). No anchor: centred near the top.
export const placePopover = (anchor: Box | null, size: Size, viewport: Size): { top: number; left: number; side: 'below' | 'above' | 'none' } => {
  const clampLeft = (left: number) => Math.min(Math.max(EDGE, left), Math.max(EDGE, viewport.width - size.width - EDGE));
  const clampTop = (top: number) => Math.min(Math.max(EDGE, top), Math.max(EDGE, viewport.height - size.height - EDGE));
  if (!anchor) {
    return { top: clampTop(viewport.height * 0.2), left: clampLeft((viewport.width - size.width) / 2), side: 'none' };
  }
  const left = clampLeft(anchor.left + anchor.width / 2 - size.width / 2);
  const below = anchor.top + anchor.height + GAP;
  const above = anchor.top - GAP - size.height;
  if (below + size.height <= viewport.height - EDGE) return { top: below, left, side: 'below' };
  // A control below the usable area (the phone's bottom bar, under the reserved strip):
  // the popover still goes above it, but never lower than the usable area allows.
  if (above >= EDGE) return { top: Math.min(above, clampTop(above)), left, side: 'above' };
  const roomBelow = viewport.height - (anchor.top + anchor.height);
  return roomBelow >= anchor.top
    ? { top: clampTop(below), left, side: 'below' }
    : { top: clampTop(above), left, side: 'above' };
};
