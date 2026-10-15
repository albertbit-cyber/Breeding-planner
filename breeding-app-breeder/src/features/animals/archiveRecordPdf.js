/**
 * The archive record as an A4 PDF: one document per animal that stands on its own when printed,
 * filed or sent to a buyer. Reads the same data as the record page and the text copy
 * (archiveRecord.js), and uses the catalog's paper-and-ink palette so every PDF the app makes
 * looks like it came from the same place.
 */

import { CATALOG_COLORS } from './catalogLayout';
import { exitDetailRows, formatRecordDate, archiveRecordFileName } from './archiveRecord';
import { applyPdfUnicodeFont, setPdfFont } from '../../utils/pdfFonts';

const MARGIN = 18;
const LINE = 5.2;

const fill = (template, values) => template.replace(/\{\{(\w+)\}\}/g, (_, name) => (values[name] === undefined ? '' : String(values[name])));

async function loadImageDataUrl(url) {
  if (!url) return null;
  if (url.startsWith('data:image/')) return url;
  try {
    const response = await fetch(url, { mode: 'cors' });
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch (_) {
    // A photo the browser may not read (another origin, offline) is left out, not fatal.
    return null;
  }
}

function imageSize(dataUrl) {
  return new Promise((resolve) => {
    if (typeof Image === 'undefined') { resolve(null); return; }
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

/**
 * Build the PDF and return the jsPDF document. `breederName` goes in the footer.
 */
export async function buildArchiveRecordPdf(data, labels, { locale, breederName = '' } = {}) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  await applyPdfUnicodeFont(doc);
  const C = CATALOG_COLORS;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const contentW = pageW - MARGIN * 2;
  const d = (value) => formatRecordDate(value, locale);
  let y = MARGIN;

  const ink = (rgb) => doc.setTextColor(rgb[0], rgb[1], rgb[2]);
  const font = (style, size) => { setPdfFont(doc, style); doc.setFontSize(size); };
  const paintPage = () => {
    doc.setFillColor(C.paper[0], C.paper[1], C.paper[2]);
    doc.rect(0, 0, pageW, pageH, 'F');
  };
  const newPage = () => { doc.addPage('a4', 'portrait'); paintPage(); y = MARGIN; };
  const ensure = (height) => { if (y + height > pageH - MARGIN - 8) newPage(); };
  const rule = () => {
    doc.setDrawColor(C.rule[0], C.rule[1], C.rule[2]);
    doc.setLineWidth(0.3);
    doc.line(MARGIN, y, pageW - MARGIN, y);
  };
  const heading = (label) => {
    ensure(16);
    y += 5;
    rule();
    y += 6;
    font('bold', 10);
    ink(C.accent);
    doc.text(label.toUpperCase(), MARGIN, y, { charSpace: 0.4 });
    y += LINE + 1;
  };
  const paragraph = (value, { size = 10, color = C.soft, style = 'normal', indent = 0 } = {}) => {
    font(style, size);
    ink(color);
    const lines = doc.splitTextToSize(String(value), contentW - indent);
    lines.forEach((line) => {
      ensure(LINE);
      doc.text(line, MARGIN + indent, y);
      y += LINE;
    });
  };
  const pairs = (rows) => {
    const labelW = 42;
    rows.forEach((row) => {
      font('normal', 9);
      ink(C.muted);
      const valueLines = doc.splitTextToSize(String(row.value), contentW - labelW);
      ensure(LINE * valueLines.length);
      doc.text(row.label, MARGIN, y);
      font(row.missing ? 'normal' : 'bold', 10);
      ink(row.missing ? C.muted : C.ink);
      valueLines.forEach((line, index) => doc.text(line, MARGIN + labelW, y + index * LINE));
      y += LINE * valueLines.length + 0.8;
    });
  };

  paintPage();
  const a = data.animal;

  // Header: the photograph on the right, identity on the left.
  const photoBox = 46;
  let photoDrawn = false;
  const photo = await loadImageDataUrl(a.photo);
  if (photo) {
    const size = await imageSize(photo);
    if (size && size.w && size.h) {
      const scale = Math.min(photoBox / size.w, photoBox / size.h);
      const w = size.w * scale;
      const h = size.h * scale;
      try {
        doc.addImage(photo, pageW - MARGIN - w, MARGIN, w, h, undefined, 'FAST');
        photoDrawn = true;
      } catch (_) { /* unsupported image format: carry on without it */ }
    }
  }
  const headerW = contentW - (photoDrawn ? photoBox + 6 : 0);
  font('bold', 8.5);
  ink(C.accent);
  doc.text(labels.recordTitle.toUpperCase(), MARGIN, y + 2, { charSpace: 0.5 });
  y += 11;
  font('bold', 22);
  ink(C.ink);
  doc.splitTextToSize(a.name || a.id, headerW).slice(0, 2).forEach((line) => { doc.text(line, MARGIN, y); y += 9; });
  font('normal', 10);
  ink(C.soft);
  const idLine = [a.name && a.id ? `${labels.id} ${a.id}` : '', `${a.sexCode} ${labels.sex[a.sex] || ''}`.trim(), a.species].filter(Boolean).join('  ·  ');
  doc.text(doc.splitTextToSize(idLine, headerW), MARGIN, y);
  y += LINE + 1;
  if (a.genetics) {
    font('bold', 10.5);
    ink(C.ink);
    doc.splitTextToSize(a.genetics, headerW).forEach((line) => { doc.text(line, MARGIN, y); y += LINE; });
  }
  font('normal', 9);
  ink(C.muted);
  const facts = [
    a.birthDate ? `${labels.hatched} ${d(a.birthDate)}` : '',
    a.sire || a.dam ? `${labels.parents}: ${[a.sire?.name, a.dam?.name].filter(Boolean).join(' × ')}` : '',
    data.lastWeight ? `${labels.lastWeight} ${data.lastWeight.grams} g` : '',
  ].filter(Boolean).join('   ');
  if (facts) {
    doc.splitTextToSize(facts, headerW).forEach((line) => { doc.text(line, MARGIN, y); y += LINE - 0.6; });
  }
  y = Math.max(y, photoDrawn ? MARGIN + photoBox + 2 : y);

  heading(labels.exit);
  pairs(exitDetailRows(data.exit, labels, { locale }));
  if (data.exit?.erasedContactAt) paragraph(fill(labels.contactErased, { date: d(data.exit.erasedContactAt) }), { size: 8.5, color: C.muted });

  if (data.exit?.notes?.length) {
    heading(labels.notes);
    data.exit.notes.forEach((note) => {
      paragraph(d(note.at), { size: 8.5, color: C.muted, style: 'bold' });
      paragraph(note.text, { size: 10, color: C.ink });
      y += 1;
    });
  }

  if (data.previous.length) {
    heading(labels.previousPeriods);
    data.previous.forEach((period) => {
      paragraph(`${labels.reasons[period.reason] || period.reason}, ${period.date ? d(period.date) : labels.dateNotRecorded}  →  ${fill(labels.returned, { date: d(period.returnDate) })}`, { color: C.ink });
      if (period.returnNote) paragraph(period.returnNote, { size: 9, indent: 4 });
    });
  }

  heading(labels.breeding);
  if (!data.pairings.length) {
    paragraph(labels.noBreeding, { color: C.muted });
  } else {
    data.pairings.forEach((p) => {
      const line = [p.year, fill(labels.pairedWith, { name: p.partnerName })].filter(Boolean).join('  ');
      paragraph(line, { color: C.ink, style: 'bold' });
      const detail = [
        p.clutchRecorded ? fill(labels.clutch, { date: d(p.clutchDate), eggs: p.eggs, fertile: p.fertile }) : '',
        p.hatched !== null ? fill(labels.hatchedCount, { count: p.hatched }) : '',
        labels.closure[p.completionReason] || '',
        p.completed ? '' : labels.stillOpen,
      ].filter(Boolean).join('  ·  ');
      if (detail) paragraph(detail, { size: 9, indent: 4 });
      y += 0.8;
    });
  }
  if (data.offspring.length) {
    y += 1;
    paragraph(`${labels.offspring}: ${data.offspring.map(o => (o.left ? `${o.name} (${labels.reasons[o.left] || labels.archivedMarker})` : o.name)).join(', ')}`, { size: 9 });
  }

  heading(labels.feeding);
  if (!data.feeds.length) {
    paragraph(labels.noFeeds, { color: C.muted });
  } else {
    paragraph(fill(labels.feedingSummary, { count: data.feedTotals.count, refused: data.feedTotals.refused }), { size: 9, color: C.muted });
    y += 1;
    const cols = [MARGIN, MARGIN + 34, MARGIN + contentW - 22];
    data.feeds.forEach((feed) => {
      ensure(LINE);
      font('normal', 9);
      ink(C.muted);
      doc.text(d(feed.date), cols[0], y);
      ink(feed.refused ? C.accent : C.ink);
      doc.text(doc.splitTextToSize(feed.refused ? labels.refused : (feed.food || ''), cols[2] - cols[1] - 4)[0], cols[1], y);
      ink(C.soft);
      if (feed.grams) doc.text(`${feed.grams} g`, cols[2], y);
      y += LINE - 0.4;
    });
  }

  if (data.weights.length) {
    heading(labels.weights);
    const perRow = 4;
    const colW = contentW / perRow;
    for (let i = 0; i < data.weights.length; i += perRow) {
      ensure(LINE);
      data.weights.slice(i, i + perRow).forEach((w, j) => {
        font('normal', 9);
        ink(C.muted);
        doc.text(d(w.date), MARGIN + j * colW, y);
        font('bold', 9);
        ink(C.ink);
        doc.text(`${w.grams} g`, MARGIN + j * colW + 26, y);
      });
      y += LINE - 0.4;
    }
  }

  // Footer on every page.
  const pages = doc.getNumberOfPages();
  const generated = fill(labels.generated, { date: d(new Date().toISOString()) });
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    font('normal', 7.5);
    ink(C.muted);
    doc.text([breederName, generated].filter(Boolean).join('  ·  '), MARGIN, pageH - 10);
    doc.text(`${page} / ${pages}`, pageW - MARGIN, pageH - 10, { align: 'right' });
  }
  return doc;
}

export async function downloadArchiveRecordPdf(data, labels, options = {}) {
  const doc = await buildArchiveRecordPdf(data, labels, options);
  doc.save(archiveRecordFileName(data, 'pdf'));
}
