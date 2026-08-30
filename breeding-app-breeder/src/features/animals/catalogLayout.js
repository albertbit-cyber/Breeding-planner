/**
 * Geometry, palette and text fitting for the sales-catalog animal page.
 *
 * The page is A5 landscape. A paper panel holds the text down the left, the
 * photograph runs full bleed to the right of it. Everything here is in
 * millimetres and points, kept out of App.jsx so the fitting maths can be
 * tested without a PDF document.
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
  placeholder: [225, 228, 232],
  placeholderEdge: [190, 195, 201],
  placeholderInk: [120, 125, 130],
};

export const CATALOG_METRICS = {
  panelRatio: 0.42,
  padTop: 11.5,
  padLeft: 11.5,
  padRight: 9,
  padBottom: 9.5,

  nameMaxPt: 21,
  nameMinPt: 8,
  namePreferredLines: 3,

  metaPt: 8.5,
  metaMinPt: 6.5,
  metaTrack: 0.28,

  labelPt: 7,
  labelTrack: 0.4,
  labelGap: 1.6,

  valuePt: 11.5,
  parentNamePt: 9.5,
  parentGenPt: 9.5,

  pricePt: 16,
  markPt: 7,
  markTrack: 0.35,

  lineFactor: 1.18,
  fieldGap: 3.6,
  ruleGap: 4.2,
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

/**
 * Draws the text panel of one animal page.
 *
 * Pure jsPDF: no DOM, no React, no bundler-specific imports. That keeps the
 * page renderable headlessly, so the layout can be proofed as a real PDF
 * instead of being argued about from arithmetic. The photograph is drawn by
 * the caller, which is the only part that needs an <img> to measure.
 *
 * @param row      { name, id, sexWord, bornWord, morph, sire, dam, pairing, price }
 * @param setFont  (doc, style) => void -- injected so the module never has to
 *                 import the app's font loader, which pulls in .ttf?url
 */
export function drawCatalogPanel(doc, row = {}, options = {}) {
  const { pageW, pageH, breederInfo = null, setFont = null } = options;
  const M = CATALOG_METRICS;
  const C = CATALOG_COLORS;

  const panelW = pageW * M.panelRatio;
  const textX = M.padLeft;
  const textW = panelW - M.padLeft - M.padRight;
  const panelBottom = pageH - M.padBottom;

  const applyFont = (style) => { if (setFont) setFont(doc, style); else doc.setFont('helvetica', style); };

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
  let cursorY = M.padTop;

  // jsPDF measures with splitTextToSize but draws with setCharSpace, and the
  // two disagree: a tracked line wraps to the column and then grows past it.
  // Wrapping at a budget reduced by the tracking the line will actually add
  // is what keeps the meta line off the photograph.
  const measureAt = (text, size, track = 0) => {
    doc.setFontSize(size);
    if (!track) return doc.splitTextToSize(text, textW);
    let budget = textW;
    let lines = doc.splitTextToSize(text, budget);
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const widest = lines.reduce((max, line) => Math.max(
        max,
        doc.getTextWidth(line) + (track * Math.max(0, String(line).length - 1)),
      ), 0);
      if (widest <= textW) break;
      budget -= (widest - textW) + 0.5;
      lines = doc.splitTextToSize(text, budget);
    }
    return lines;
  };
  const setInk = (rgb) => doc.setTextColor(rgb[0], rgb[1], rgb[2]);

  // Every run is drawn from its top edge, so the stack advances by exactly
  // the height it consumed and two fields can never share a line.
  const runBlock = (lines, size, style, rgb, track = 0) => {
    if (!lines || !lines.length) return;
    applyFont(style);
    doc.setFontSize(size);
    setInk(rgb);
    if (track) doc.setCharSpace(track);
    doc.text(lines, textX, cursorY, { baseline: 'top' });
    if (track) doc.setCharSpace(0);
    cursorY += lines.length * pt2mm(size * M.lineFactor);
  };

  const runLabel = (label) => {
    runBlock(measureAt(label, M.labelPt, M.labelTrack), M.labelPt, 'bold', C.accent, M.labelTrack);
    cursorY += M.labelGap;
  };

  // The name leads. It shrinks to fit rather than being cut, so however long
  // a hatchling name runs, all of it reaches the page.
  const nameSource = nameValue || idValue;
  if (nameSource) {
    const fitted = fitTextToBox({
      text: nameSource,
      measure: measureAt,
      startSize: M.nameMaxPt,
      minSize: M.nameMinPt,
      maxLines: M.namePreferredLines,
      maxHeightMm: 34,
    });
    runBlock(fitted.lines, fitted.size, 'bold', C.ink);
  }

  // Identity, sex and hatch date read as one quiet line rather than three
  // labelled rows competing with the name above them.
  const metaParts = [];
  if (nameValue && idValue && nameValue !== idValue) metaParts.push(idValue);
  if (sexWord) metaParts.push(sexWord);
  if (bornWord) metaParts.push(bornWord);
  if (metaParts.length) {
    cursorY += 1.8;
    const metaText = metaParts.join('  ·  ').toUpperCase();
    const metaFit = fitTextToBox({
      text: metaText,
      measure: (text, size) => measureAt(text, size, M.metaTrack),
      startSize: M.metaPt,
      minSize: M.metaMinPt,
      maxLines: 1,
      step: 0.25,
    });
    runBlock(metaFit.lines, metaFit.size, 'bold', C.muted, M.metaTrack);
  }

  cursorY += M.ruleGap;
  doc.setDrawColor(C.rule[0], C.rule[1], C.rule[2]);
  doc.setLineWidth(0.3);
  doc.line(textX, cursorY, textX + textW, cursorY);
  cursorY += M.ruleGap;

  // An empty morph used to print a bare dash; a page says nothing rather
  // than saying nothing at length.
  if (morphValue) {
    runLabel('MORPH');
    runBlock(measureAt(morphValue, M.valuePt), M.valuePt, 'normal', C.ink);
    cursorY += M.fieldGap;
  }

  if (hasParents) {
    const drawParent = (label, parent) => {
      if (!parent.name && !parent.genetics) return;
      runLabel(label);
      if (parent.name) runBlock(measureAt(parent.name, M.parentNamePt), M.parentNamePt, 'bold', C.ink);
      if (parent.genetics) runBlock(measureAt(parent.genetics, M.parentGenPt), M.parentGenPt, 'normal', C.soft);
      cursorY += M.fieldGap;
    };
    drawParent('SIRE', sire);
    drawParent('DAM', dam);
  } else if (pairingValue) {
    // Pairing only earns its place when the parents themselves are unknown;
    // otherwise it repeats the two blocks above it.
    runLabel('PAIRING');
    runBlock(measureAt(pairingValue, M.parentGenPt), M.parentGenPt, 'normal', C.soft);
    cursorY += M.fieldGap;
  }

  // Price anchors the foot of the panel, so a short entry no longer trails
  // off into half a page of blank paper.
  const markText = String((breederInfo && (breederInfo.businessName || breederInfo.name)) || '').trim();
  if (priceValue || markText) {
    const footTop = panelBottom - pt2mm(M.pricePt * M.lineFactor);
    const ruleY = footTop - 3.4;
    if (priceValue && ruleY > cursorY) {
      doc.setDrawColor(C.rule[0], C.rule[1], C.rule[2]);
      doc.setLineWidth(0.3);
      doc.line(textX, ruleY, textX + textW, ruleY);
    }
    if (priceValue) {
      applyFont('bold');
      doc.setFontSize(M.pricePt);
      setInk(C.ink);
      doc.text(priceValue, textX, footTop, { baseline: 'top' });
    }
    if (markText) {
      applyFont('bold');
      doc.setFontSize(M.markPt);
      setInk(C.muted);
      doc.setCharSpace(M.markTrack);
      doc.text(markText.toUpperCase(), textX + textW, panelBottom, { align: 'right', baseline: 'bottom' });
      doc.setCharSpace(0);
    }
  }

  return cursorY;
}
