/**
 * Geometry, palette and text fitting for the sales-catalog animal page.
 *
 * The page is A5 landscape. The photograph takes the full width across the top
 * and the text runs in a band beneath it -- a wide box for a wide picture, so
 * nothing has to be cropped to fill it.
 *
 * A 1.4 photograph in a 2.3 box still leaves a margin either side, so the box
 * is painted with a colour sampled from the photograph's own edge before the
 * image goes down. That sampling needs a canvas and therefore lives in the
 * caller; everything here is millimetres, points and jsPDF, with no DOM, so
 * the page can be rendered headlessly and actually looked at.
 */

/** Points to millimetres. jsPDF is driven in mm, type is specified in pt. */
export const pt2mm = (pt) => pt * 0.352778;

/** Print palette. Amber is the suite accent from VISUAL_LANGUAGE.md, darkened for paper. */
export const CATALOG_COLORS = {
  paper: [245, 244, 241],
  ink: [17, 20, 24],
  soft: [60, 65, 73],
  muted: [92, 97, 105],
  rule: [216, 214, 209],
  accent: [184, 117, 20],
  ground: [141, 143, 140],
  placeholder: [225, 228, 232],
  placeholderEdge: [190, 195, 201],
  placeholderInk: [120, 125, 130],
};

export const CATALOG_METRICS = {
  /** Share of the page height given to the photograph. */
  photoRatio: 0.65,

  bandPadTop: 6.4,
  bandPadX: 11.5,
  bandPadBottom: 9.5,
  bandGap: 9,
  /** Share of the band's width given to the name column. */
  leadRatio: 0.56,

  nameMaxPt: 16,
  nameMinPt: 8,
  namePreferredLines: 2,
  nameMaxHeightMm: 15,

  metaPt: 8,
  metaMinPt: 6.5,
  metaTrack: 0.24,

  labelPt: 6.5,
  labelTrack: 0.36,
  labelGap: 0.9,

  valuePt: 9.5,
  parentNamePt: 9,
  parentGenPt: 9,

  pricePt: 14,
  markPt: 6.5,
  markTrack: 0.3,

  lineFactor: 1.18,
  fieldGap: 2.4,
};

/**
 * Picks the largest type size at which `text` fits the given box.
 *
 * Steps down from `startSize` while the wrapped text exceeds either the line
 * budget or the height budget. It never truncates: at `minSize` it returns
 * whatever the text wraps to, however many lines that is. A catalog page can
 * afford a smaller name; it cannot afford half a name.
 *
 * @param measure (text, size) => string[]  wraps text to the column at that size
 * @returns {{ size:number, lines:string[] }}
 */
export function fitTextToBox({
  text,
  measure,
  startSize,
  minSize,
  maxLines = Infinity,
  maxHeightMm = Infinity,
  lineFactor = CATALOG_METRICS.lineFactor,
  step = 0.5,
}) {
  const value = String(text || '').trim();
  if (!value) return { size: startSize, lines: [] };

  let size = startSize;
  let lines = measure(value, size);

  while (size > minSize) {
    const fitsLines = lines.length <= maxLines;
    const fitsHeight = lines.length * pt2mm(size * lineFactor) <= maxHeightMm;
    if (fitsLines && fitsHeight) return { size, lines };
    size = Math.max(minSize, Number((size - step).toFixed(2)));
    lines = measure(value, size);
  }

  // At the floor the whole string still ships, however tall it turns out.
  return { size, lines };
}

/** Height in mm a fitted block will occupy. */
export function blockHeightMm({ size, lines }, lineFactor = CATALOG_METRICS.lineFactor) {
  return (Array.isArray(lines) ? lines.length : 0) * pt2mm(size * lineFactor);
}

/**
 * Spells out sex for a buyer. The app stores M/F/U; 1.0 and 0.1 are breeder
 * shorthand that reads as a decimal to everyone else.
 */
export function catalogSexWord(normalized, labels = {}) {
  if (normalized === 'M') return labels.male || 'Male';
  if (normalized === 'F') return labels.female || 'Female';
  return labels.unsexed || 'Unsexed';
}

/** First recorded date of birth, in the order the app fills them in. */
export function catalogBirthValue(animal) {
  if (!animal || typeof animal !== 'object') return '';
  const candidates = [
    animal.birthDate,
    animal.hatchDate,
    animal?.metadata?.hatchDate,
    animal.year,
  ];
  for (const candidate of candidates) {
    const value = String(candidate || '').trim();
    if (value) return value;
  }
  return '';
}

/** The box the photograph is placed in: full width, across the top. */
export function catalogPhotoBox(pageW, pageH) {
  return { x: 0, y: 0, w: pageW, h: pageH * CATALOG_METRICS.photoRatio };
}

/**
 * Fits a picture inside a box without cropping it, centred.
 * Returns the rectangle to draw the image into.
 */
export function fitImageInBox(naturalW, naturalH, box) {
  const w = Number(naturalW) || 0;
  const h = Number(naturalH) || 0;
  if (w <= 0 || h <= 0) return { x: box.x, y: box.y, w: box.w, h: box.h };
  const scale = Math.min(box.w / w, box.h / h);
  const drawW = w * scale;
  const drawH = h * scale;
  return {
    x: box.x + ((box.w - drawW) / 2),
    y: box.y + ((box.h - drawH) / 2),
    w: drawW,
    h: drawH,
  };
}

/**
 * Draws the text band beneath the photograph.
 *
 * Left column carries the name, the identity caption and the animal's own
 * genetics, with the price anchored to the foot. Right column carries the
 * parents. Splitting them keeps both columns short enough to fit a band that
 * is only about 40mm of usable height.
 *
 * @param row      { name, id, sexWord, bornWord, morph, sire, dam, pairing, price }
 * @param setFont  (doc, style) => void -- injected so the module never has to
 *                 import the app's font loader, which pulls in .ttf?url
 */
export function drawCatalogBand(doc, row = {}, options = {}) {
  const { pageW, pageH, breederInfo = null, setFont = null } = options;
  const M = CATALOG_METRICS;
  const C = CATALOG_COLORS;

  const bandTop = (pageH * M.photoRatio) + M.bandPadTop;
  const bandBottom = pageH - M.bandPadBottom;
  const contentW = pageW - (M.bandPadX * 2);
  const leadX = M.bandPadX;
  const leadW = (contentW - M.bandGap) * M.leadRatio;
  const parX = leadX + leadW + M.bandGap;
  const parW = contentW - leadW - M.bandGap;

  const applyFont = (style) => { if (setFont) setFont(doc, style); else doc.setFont('helvetica', style); };
  const setInk = (rgb) => doc.setTextColor(rgb[0], rgb[1], rgb[2]);

  const nameValue = String(row.name || '').trim();
  const idValue = String(row.id || '').trim();
  const sexWord = String(row.sexWord || '').trim();
  const bornWord = String(row.bornWord || '').trim();
  const morphValue = String(row.morph || '').trim();
  const sire = row.sire || { name: '', genetics: '' };
  const dam = row.dam || { name: '', genetics: '' };
  const hasParents = Boolean(sire.name || sire.genetics || dam.name || dam.genetics);
  const pairingValue = String(row.pairing || '').trim();
  const priceValue = String(row.price === null || typeof row.price === 'undefined' ? '' : row.price).trim();

  doc.setLineHeightFactor(M.lineFactor);

  // jsPDF measures with splitTextToSize but draws with setCharSpace, and the
  // two disagree: a tracked line wraps to the column and then grows past it.
  // Wrapping against a budget reduced by the tracking it will actually add is
  // what keeps a caption inside its column.
  const measureIn = (text, size, width, track = 0) => {
    doc.setFontSize(size);
    if (!track) return doc.splitTextToSize(text, width);
    let budget = width;
    let lines = doc.splitTextToSize(text, budget);
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const widest = lines.reduce((max, line) => Math.max(
        max,
        doc.getTextWidth(line) + (track * Math.max(0, String(line).length - 1)),
      ), 0);
      if (widest <= width) break;
      budget -= (widest - width) + 0.5;
      lines = doc.splitTextToSize(text, budget);
    }
    return lines;
  };

  // Each column runs its own cursor, so neither can push the other around.
  const column = (x, width) => {
    let cursorY = bandTop;
    const run = (lines, size, style, rgb, track = 0) => {
      if (!lines || !lines.length) return;
      if (cursorY > bandBottom) return;
      applyFont(style);
      doc.setFontSize(size);
      setInk(rgb);
      if (track) doc.setCharSpace(track);
      doc.text(lines, x, cursorY, { baseline: 'top' });
      if (track) doc.setCharSpace(0);
      cursorY += lines.length * pt2mm(size * M.lineFactor);
    };
    return {
      run,
      label: (text) => {
        run(measureIn(text, M.labelPt, width, M.labelTrack), M.labelPt, 'bold', C.accent, M.labelTrack);
        cursorY += M.labelGap;
      },
      gap: (mm) => { cursorY += mm; },
      get y() { return cursorY; },
    };
  };

  // ---- left column: who the animal is -------------------------------------
  const lead = column(leadX, leadW);

  const nameSource = nameValue || idValue;
  if (nameSource) {
    const fitted = fitTextToBox({
      text: nameSource,
      measure: (text, size) => measureIn(text, size, leadW),
      startSize: M.nameMaxPt,
      minSize: M.nameMinPt,
      maxLines: M.namePreferredLines,
      maxHeightMm: M.nameMaxHeightMm,
    });
    lead.run(fitted.lines, fitted.size, 'bold', C.ink);
  }

  const metaParts = [];
  if (nameValue && idValue && nameValue !== idValue) metaParts.push(idValue);
  if (sexWord) metaParts.push(sexWord);
  if (bornWord) metaParts.push(bornWord);
  if (metaParts.length) {
    lead.gap(1.4);
    const metaFit = fitTextToBox({
      text: metaParts.join('  ·  ').toUpperCase(),
      measure: (text, size) => measureIn(text, size, leadW, M.metaTrack),
      startSize: M.metaPt,
      minSize: M.metaMinPt,
      maxLines: 1,
      step: 0.25,
    });
    lead.run(metaFit.lines, metaFit.size, 'bold', C.muted, M.metaTrack);
  }

  // An empty morph used to print a bare dash; a page says nothing rather than
  // saying nothing at length.
  if (morphValue) {
    lead.gap(M.fieldGap);
    lead.label('MORPH');
    lead.run(measureIn(morphValue, M.valuePt, leadW), M.valuePt, 'normal', C.ink);
  }

  // ---- right column: where it came from ------------------------------------
  const par = column(parX, parW);
  if (hasParents) {
    const drawParent = (label, parent) => {
      if (!parent.name && !parent.genetics) return;
      par.label(label);
      if (parent.name) par.run(measureIn(parent.name, M.parentNamePt, parW), M.parentNamePt, 'bold', C.ink);
      if (parent.genetics) par.run(measureIn(parent.genetics, M.parentGenPt, parW), M.parentGenPt, 'normal', C.soft);
      par.gap(M.fieldGap);
    };
    drawParent('SIRE', sire);
    drawParent('DAM', dam);
  } else if (pairingValue) {
    // Pairing only earns its place when the parents themselves are unknown;
    // otherwise it repeats the two blocks above it.
    par.label('PAIRING');
    par.run(measureIn(pairingValue, M.parentGenPt, parW), M.parentGenPt, 'normal', C.soft);
  }

  // ---- foot: price left, breeder right -------------------------------------
  const markText = String((breederInfo && (breederInfo.businessName || breederInfo.name)) || '').trim();
  if (priceValue) {
    applyFont('bold');
    doc.setFontSize(M.pricePt);
    setInk(C.ink);
    doc.text(priceValue, leadX, bandBottom, { baseline: 'bottom' });
  }
  if (markText) {
    applyFont('bold');
    doc.setFontSize(M.markPt);
    setInk(C.muted);
    doc.setCharSpace(M.markTrack);
    doc.text(markText.toUpperCase(), pageW - M.bandPadX, bandBottom, { align: 'right', baseline: 'bottom' });
    doc.setCharSpace(0);
  }

  return Math.max(lead.y, par.y);
}
