import React, { useMemo, useState, useEffect, useCallback, useRef } from "react";
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import * as pdfjsLib from 'pdfjs-dist/build/pdf';
// use the CDN worker by version
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

// --- lightweight helpers (placeholders if full implementations aren't present) ---
const cap = s => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : '');

function pairingLifecycleDefaults() {
  return {
    ovulation: { observed: false, date: '', notes: '' },
    preLayShed: { observed: false, date: '', notes: '', intervalFromOvulation: null },
  clutch: { recorded: false, date: '', eggsTotal: '', fertileEggs: '', slugs: '', notes: '' },
    hatch: { scheduledDate: '', recorded: false, date: '', hatchedCount: 0, notes: '' }
  };
}
const cx = (...parts) => parts.flat().filter(Boolean).join(' ');
const uid = (prefix='id') => `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random()*10000).toString(36)}`;
const localYMD = (d = new Date()) => {
  const y = d.getFullYear(); const m = String(d.getMonth()+1).padStart(2,'0'); const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
};
const nowIsoString = () => new Date().toISOString();
function formatDateTimeForDisplay(dateLike) {
  if (!dateLike) return '';
  const dt = dateLike instanceof Date ? dateLike : new Date(dateLike);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function extractYearFromDateString(value) {
  if (!value) return null;
  const normalized = String(value).trim();
  if (!normalized) return null;
  const match = normalized.match(/^(\d{4})/);
  if (!match) return null;
  const year = Number(match[1]);
  return Number.isFinite(year) ? year : null;
}
function appendNoteLine(existing = '', line = '') {
  const trimmedLine = String(line || '').trim();
  if (!trimmedLine) return existing || '';
  const current = String(existing || '');
  if (!current) return trimmedLine;
  const lines = current.split('\n').map(l => l.trim());
  if (lines.includes(trimmedLine)) return current;
  return `${current}${current.endsWith('\n') ? '' : '\n'}${trimmedLine}`;
}
function buildLockLogLine(timestampIso) {
  const formatted = formatDateTimeForDisplay(timestampIso);
  return formatted ? `Lock observed ${formatted}` : 'Lock observed';
}
const PENDING_ANIMAL_VIEW_KEY = 'breedingPlannerPendingAnimalView';
const STORAGE_KEYS = {
  snakes: 'breedingPlannerSnakes',
  pairings: 'breedingPlannerPairings',
  groups: 'breedingPlannerGroups',
  breeder: 'breedingPlannerBreederInfo',
  lastFeedDefaults: 'breedingPlannerLastFeedDefaults',
  backupSettings: 'breedingPlannerBackupSettings',
  backupSnapshot: 'breedingPlannerBackupSnapshot',
  backupVault: 'breedingPlannerBackupVault',
};

const DEFAULT_FAVICON_HREF = `${process.env.PUBLIC_URL || ''}/app-icons/icon_512x512.png`;

const BACKUP_FREQUENCIES = ['off', 'nightly', 'weekly', 'monthly'];
const DEFAULT_BACKUP_LIMIT = 20;
const VAULT_LIMIT_OPTIONS = [5, 10, 20, 50, 100, 200, 'unlimited'];

const ANIMAL_EXPORT_FIELD_DEFS = [
  {
    key: 'id',
    label: 'Animal ID',
    section: 'Identity',
    getter: snake => snake?.id || '',
  },
  {
    key: 'name',
    label: 'Name',
    section: 'Identity',
    getter: snake => snake?.name || '',
  },
  {
    key: 'sex',
    label: 'Sex',
    section: 'Identity',
    getter: snake => {
      const normalized = normalizeSexValue(snake?.sex);
      return normalized === 'UNKNOWN' ? '' : normalized;
    },
  },
  {
    key: 'status',
    label: 'Status',
    section: 'Identity',
    getter: snake => snake?.status || '',
  },
  {
    key: 'year',
    label: 'Hatch year',
    section: 'Timeline',
    getter: snake => {
      if (!snake) return '';
      if (Number.isFinite(Number(snake.year))) return Number(snake.year);
      const yearFromBirth = extractYearFromDateString(snake.birthDate);
      return yearFromBirth || '';
    },
  },
  {
    key: 'birthDate',
    label: 'Birth date',
    section: 'Timeline',
    getter: snake => (snake?.birthDate ? formatDateForDisplay(snake.birthDate) : ''),
  },
  {
    key: 'weight',
    label: 'Current weight (g)',
    section: 'Husbandry',
    getter: snake => {
      const value = snake?.weight;
      if (Number.isFinite(Number(value))) return Number(value);
      return value || '';
    },
  },
  {
    key: 'genetics',
    label: 'Genetics summary',
    section: 'Genetics',
    getter: snake => joinTokens(combineMorphsAndHetsForDisplay(snake?.morphs, snake?.hets)),
  },
  {
    key: 'morphs',
    label: 'Morphs',
    section: 'Genetics',
    getter: snake => joinTokens(snake?.morphs),
  },
  {
    key: 'hets',
    label: 'Hets',
    section: 'Genetics',
    getter: snake => joinTokens(snake?.hets),
  },
  {
    key: 'tags',
    label: 'Tags',
    section: 'Attributes',
    getter: snake => joinTokens(snake?.tags),
  },
  {
    key: 'groups',
    label: 'Groups',
    section: 'Attributes',
    getter: snake => joinTokens(snake?.groups),
  },
  {
    key: 'sireId',
    label: 'Sire ID',
    section: 'Lineage',
    getter: snake => snake?.sireId || '',
  },
  {
    key: 'damId',
    label: 'Dam ID',
    section: 'Lineage',
    getter: snake => snake?.damId || '',
  },
  {
    key: 'projects',
    label: 'Projects (pairings)',
    section: 'Breeding',
    getter: (snake, ctx = {}) => {
      if (!snake?.id) return '';
      const list = ctx.pairingsBySnakeId?.get(snake.id) || [];
      if (!list.length) return '';
      return joinTokens(list.map(item => item.label));
    },
  },
  {
    key: 'lastFeedDate',
    label: 'Last feed date',
    section: 'Husbandry',
    getter: snake => {
      const entry = getLatestLogEntry(snake?.logs, 'feeds');
      return entry?.date ? formatDateForDisplay(entry.date) : '';
    },
  },
  {
    key: 'lastFeedDetails',
    label: 'Last feed details',
    section: 'Husbandry',
    getter: snake => {
      const entry = getLatestLogEntry(snake?.logs, 'feeds');
      if (!entry) return '';
      const parts = [entry.feed, entry.size, entry.method]
        .map(val => (typeof val === 'string' ? val.trim() : ''))
        .filter(Boolean);
      if (typeof entry.weightGrams === 'number' && entry.weightGrams > 0) {
        parts.push(`${entry.weightGrams} g`);
      } else if (typeof entry.grams === 'number' && entry.grams > 0) {
        parts.push(`${entry.grams} g`);
      }
      return joinTokens(parts);
    },
  },
  {
    key: 'lastWeightDate',
    label: 'Last weigh date',
    section: 'Husbandry',
    getter: snake => {
      const entry = getLatestLogEntry(snake?.logs, 'weights');
      return entry?.date ? formatDateForDisplay(entry.date) : '';
    },
  },
  {
    key: 'lastWeightGrams',
    label: 'Last recorded weight (g)',
    section: 'Husbandry',
    getter: snake => {
      const entry = getLatestLogEntry(snake?.logs, 'weights');
      if (entry && Number.isFinite(Number(entry.grams))) return Number(entry.grams);
      return '';
    },
  },
  {
    key: 'lastShedDate',
    label: 'Last shed date',
    section: 'Husbandry',
    getter: snake => {
      const entry = getLatestLogEntry(snake?.logs, 'sheds');
      return entry?.date ? formatDateForDisplay(entry.date) : '';
    },
  },
  {
    key: 'lastCleaningDate',
    label: 'Last cleaning date',
    section: 'Husbandry',
    getter: snake => {
      const entry = getLatestLogEntry(snake?.logs, 'cleanings');
      return entry?.date ? formatDateForDisplay(entry.date) : '';
    },
  },
  {
    key: 'lastMedDate',
    label: 'Last medication date',
    section: 'Husbandry',
    getter: snake => {
      const entry = getLatestLogEntry(snake?.logs, 'meds');
      return entry?.date ? formatDateForDisplay(entry.date) : '';
    },
  },
];

const DEFAULT_ANIMAL_EXPORT_FIELDS = [
  'id',
  'name',
  'sex',
  'status',
  'genetics',
  'groups',
  'weight',
  'projects',
  'lastFeedDate',
];

const PAIRING_EXPORT_FIELD_DEFS = [
  {
    key: 'pairingId',
    label: 'Pairing ID',
    section: 'Identifiers',
    getter: pairing => pairing?.id || '',
  },
  {
    key: 'label',
    label: 'Project label',
    section: 'Identifiers',
    getter: (pairing, ctx = {}) => ctx.displayLabel || pairing?.label || '',
  },
  {
    key: 'cycleYear',
    label: 'Season year',
    section: 'Timeline',
    getter: (pairing, ctx = {}) => ctx.cycleYear || '',
  },
  {
    key: 'femaleId',
    label: 'Female ID',
    section: 'Participants',
    getter: pairing => pairing?.femaleId || '',
  },
  {
    key: 'femaleName',
    label: 'Female name',
    section: 'Participants',
    getter: (pairing, ctx = {}) => ctx.femaleName || pairing?.femaleId || '',
  },
  {
    key: 'femaleGenetics',
    label: 'Female genetics',
    section: 'Participants',
    getter: (pairing, ctx = {}) => ctx.femaleGenetics || '',
  },
  {
    key: 'maleId',
    label: 'Male ID',
    section: 'Participants',
    getter: pairing => pairing?.maleId || '',
  },
  {
    key: 'maleName',
    label: 'Male name',
    section: 'Participants',
    getter: (pairing, ctx = {}) => ctx.maleName || pairing?.maleId || '',
  },
  {
    key: 'maleGenetics',
    label: 'Male genetics',
    section: 'Participants',
    getter: (pairing, ctx = {}) => ctx.maleGenetics || '',
  },
  {
    key: 'startDate',
    label: 'Start date',
    section: 'Timeline',
    getter: pairing => (pairing?.startDate ? formatDateForDisplay(pairing.startDate) : ''),
  },
  {
    key: 'ovulationDate',
    label: 'Ovulation date',
    section: 'Timeline',
    getter: (pairing, ctx = {}) => (ctx.derived?.ovulationDate ? formatDateForDisplay(ctx.derived.ovulationDate) : ''),
  },
  {
    key: 'preLayDate',
    label: 'Pre-lay shed',
    section: 'Timeline',
    getter: (pairing, ctx = {}) => (ctx.derived?.preLayDate ? formatDateForDisplay(ctx.derived.preLayDate) : ''),
  },
  {
    key: 'clutchDate',
    label: 'Clutch date',
    section: 'Timeline',
    getter: (pairing, ctx = {}) => (ctx.derived?.clutchDate ? formatDateForDisplay(ctx.derived.clutchDate) : ''),
  },
  {
    key: 'eggsTotal',
    label: 'Eggs laid',
    section: 'Outcomes',
    getter: pairing => {
      const value = pairing?.clutch?.eggsTotal;
      if (Number.isFinite(Number(value))) return Number(value);
      return value || '';
    },
  },
  {
    key: 'fertileEggs',
    label: 'Fertile eggs',
    section: 'Outcomes',
    getter: pairing => {
      const value = pairing?.clutch?.fertileEggs;
      if (Number.isFinite(Number(value))) return Number(value);
      return value || '';
    },
  },
  {
    key: 'slugs',
    label: 'Slugs',
    section: 'Outcomes',
    getter: pairing => {
      const value = pairing?.clutch?.slugs;
      if (Number.isFinite(Number(value))) return Number(value);
      return value || '';
    },
  },
  {
    key: 'hatchDate',
    label: 'Hatch date',
    section: 'Timeline',
    getter: (pairing, ctx = {}) => (ctx.derived?.hatchDate ? formatDateForDisplay(ctx.derived.hatchDate) : ''),
  },
  {
    key: 'hatchScheduledDate',
    label: 'Scheduled hatch',
    section: 'Timeline',
    getter: (pairing, ctx = {}) => (ctx.derived?.hatchScheduledDate ? formatDateForDisplay(ctx.derived.hatchScheduledDate) : ''),
  },
  {
    key: 'hatchedCount',
    label: 'Hatched count',
    section: 'Outcomes',
    getter: pairing => {
      const value = pairing?.hatch?.hatchedCount;
      if (Number.isFinite(Number(value))) return Number(value);
      return value || '';
    },
  },
  {
    key: 'status',
    label: 'Project status',
    section: 'Summary',
    getter: (pairing, ctx = {}) => summarizePairingStatus(ctx.derived),
  },
  {
    key: 'goals',
    label: 'Goals',
    section: 'Summary',
    getter: pairing => joinTokens(pairing?.goals),
  },
  {
    key: 'hatchlingsCount',
    label: 'Hatchlings produced',
    section: 'Summary',
    getter: (pairing, ctx = {}) => (Array.isArray(ctx.hatchlings) ? ctx.hatchlings.length : ''),
  },
];

const DEFAULT_PAIRING_EXPORT_FIELDS = [
  'label',
  'cycleYear',
  'femaleName',
  'maleName',
  'clutchDate',
  'eggsTotal',
  'hatchDate',
  'hatchedCount',
  'status',
];

function normalizeExportFieldSelection(selection, fallback, definitions) {
  const allowed = new Set(definitions.map(def => def.key));
  const cleaned = Array.isArray(selection)
    ? selection.filter(key => allowed.has(key))
    : [];
  return cleaned.length ? cleaned : [...fallback];
}

function buildAnimalExportDataset(snakes = [], pairings = [], selected = DEFAULT_ANIMAL_EXPORT_FIELDS) {
  const normalizedFields = normalizeExportFieldSelection(selected, DEFAULT_ANIMAL_EXPORT_FIELDS, ANIMAL_EXPORT_FIELD_DEFS);
  const defByKey = new Map(ANIMAL_EXPORT_FIELD_DEFS.map(def => [def.key, def]));
  const selectedDefs = normalizedFields.map(key => defByKey.get(key)).filter(Boolean);
  const snakeMap = makeSnakeMap(snakes);
  const pairingsBySnakeId = groupPairingsBySnake(pairings, snakeMap);
  const context = { snakes, pairings, snakeMap, pairingsBySnakeId };
  const rows = [];
  (Array.isArray(snakes) ? snakes : []).forEach(snake => {
    if (!snake) return;
    const row = {};
    selectedDefs.forEach(def => {
      const raw = typeof def.getter === 'function' ? def.getter(snake, context) : snake[def.key];
      row[def.key] = formatExportValue(raw);
    });
    rows.push(row);
  });
  return {
    columns: selectedDefs.map(def => ({ key: def.key, label: def.label })),
    rows,
  };
}

function buildPairingExportDataset(pairings = [], snakes = [], selected = DEFAULT_PAIRING_EXPORT_FIELDS) {
  const normalizedFields = normalizeExportFieldSelection(selected, DEFAULT_PAIRING_EXPORT_FIELDS, PAIRING_EXPORT_FIELD_DEFS);
  const defByKey = new Map(PAIRING_EXPORT_FIELD_DEFS.map(def => [def.key, def]));
  const selectedDefs = normalizedFields.map(key => defByKey.get(key)).filter(Boolean);
  const snakeMap = makeSnakeMap(snakes);
  const hatchlingsByPairing = groupHatchlingsByPairing(snakes);
  const rows = [];
  (Array.isArray(pairings) ? pairings : []).forEach(rawPairing => {
    if (!rawPairing) return;
    const pairing = withPairingLifecycleDefaults({ ...rawPairing });
    const derived = getBreedingCycleDerived(pairing);
    const femaleSnake = pairing?.femaleId ? snakeMap.get(pairing.femaleId) : null;
    const maleSnake = pairing?.maleId ? snakeMap.get(pairing.maleId) : null;
    const displayLabel = resolvePairingLabel(pairing, femaleSnake, maleSnake);
    const cycleYear = computeBreedingCycleYear({
      clutchDate: derived.clutchDate,
      preLayDate: derived.preLayDate,
      ovulationDate: derived.ovulationDate,
      hatchDate: derived.hatchDate,
      startDate: pairing.startDate || '',
    });
    const hatchlings = hatchlingsByPairing.get(pairing.id) || [];
    const context = {
      snakes,
      pairings,
      snakeMap,
      derived,
      displayLabel,
      femaleSnake,
      femaleName: femaleSnake?.name || pairing.femaleId || '',
      femaleGenetics: joinTokens(combineMorphsAndHetsForDisplay(femaleSnake?.morphs, femaleSnake?.hets)),
      maleSnake,
      maleName: maleSnake?.name || pairing.maleId || '',
      maleGenetics: joinTokens(combineMorphsAndHetsForDisplay(maleSnake?.morphs, maleSnake?.hets)),
      cycleYear,
      hatchlings,
    };
    const row = {};
    selectedDefs.forEach(def => {
      const raw = typeof def.getter === 'function' ? def.getter(pairing, context) : pairing[def.key];
      row[def.key] = formatExportValue(raw);
    });
    rows.push(row);
  });
  return {
    columns: selectedDefs.map(def => ({ key: def.key, label: def.label })),
    rows,
  };
}

function formatExportValue(value) {
  if (value === null || typeof value === 'undefined') return '';
  if (Array.isArray(value)) {
    const parts = value
      .map(item => {
        const formatted = formatExportValue(item);
        if (formatted === null || typeof formatted === 'undefined') return '';
        if (typeof formatted === 'number') return String(formatted);
        return formatted;
      })
      .filter(Boolean);
    return parts.join(', ');
  }
  if (value instanceof Date) {
    return formatDateForDisplay(value) || value.toISOString();
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch (err) {
      return String(value);
    }
  }
  return value;
}

function joinTokens(values) {
  if (!Array.isArray(values)) {
    if (values === null || typeof values === 'undefined') return '';
    return String(values);
  }
  return values
    .map(value => (value === null || typeof value === 'undefined' ? '' : String(value).trim()))
    .filter(Boolean)
    .join(', ');
}

function getLatestLogEntry(logs, key) {
  if (!logs || typeof logs !== 'object') return null;
  const entries = Array.isArray(logs[key]) ? logs[key] : [];
  if (!entries.length) return null;
  return entries[entries.length - 1];
}

function makeSnakeMap(snakes = []) {
  const map = new Map();
  (Array.isArray(snakes) ? snakes : []).forEach(snake => {
    if (snake && snake.id) {
      map.set(snake.id, snake);
    }
  });
  return map;
}

function groupPairingsBySnake(pairings = [], snakeMap = new Map()) {
  const map = new Map();
  (Array.isArray(pairings) ? pairings : []).forEach(rawPairing => {
    if (!rawPairing) return;
    const pairing = withPairingLifecycleDefaults({ ...rawPairing });
    const femaleSnake = pairing.femaleId ? snakeMap.get(pairing.femaleId) : null;
    const maleSnake = pairing.maleId ? snakeMap.get(pairing.maleId) : null;
    const label = resolvePairingLabel(pairing, femaleSnake, maleSnake);
    if (pairing.femaleId) {
      if (!map.has(pairing.femaleId)) map.set(pairing.femaleId, []);
      map.get(pairing.femaleId).push({ id: pairing.id, label });
    }
    if (pairing.maleId) {
      if (!map.has(pairing.maleId)) map.set(pairing.maleId, []);
      map.get(pairing.maleId).push({ id: pairing.id, label });
    }
  });
  return map;
}

function groupHatchlingsByPairing(snakes = []) {
  const map = new Map();
  (Array.isArray(snakes) ? snakes : []).forEach(snake => {
    if (!snake) return;
    const pairingId = snake.pairingId || snake?.metadata?.pairingId || null;
    if (!pairingId) return;
    if (!map.has(pairingId)) map.set(pairingId, []);
    map.get(pairingId).push(snake);
  });
  return map;
}

function resolvePairingLabel(pairing, femaleSnake, maleSnake) {
  if (pairing?.label && pairing.label.trim()) return pairing.label.trim();
  const femaleName = femaleSnake?.name || pairing?.femaleId || 'Female';
  const maleName = maleSnake?.name || pairing?.maleId || 'Male';
  return `${femaleName} × ${maleName}`;
}

function summarizePairingStatus(derived) {
  if (!derived) return 'Planned';
  if (derived.hatchedRecorded) return 'Hatched';
  if (derived.clutchRecorded) return 'Eggs laid';
  if (derived.preLayObserved) return 'Pre-lay shed';
  if (derived.ovulationObserved) return 'Ovulation observed';
  return 'Planned';
}

async function exportDatasetToPdf(dataset, options = {}) {
  const columns = Array.isArray(dataset?.columns) ? dataset.columns : [];
  const rows = Array.isArray(dataset?.rows) ? dataset.rows : [];
  const { title = '', subtitle = '', fileName = 'export.pdf', orientation = 'landscape' } = options;
  const { jsPDF } = await import(/* webpackMode: "eager" */ 'jspdf');
  const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
  const margin = 12;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const headerHeight = 8;
  const rowPadding = 2;
  const baseLineHeight = 4.5;

  let y = margin;
  doc.setFontSize(14);
  if (title) {
    doc.text(title, margin, y);
    y += 7;
  }
  if (subtitle) {
    doc.setFontSize(10);
    doc.text(subtitle, margin, y);
    y += 6;
  }
  doc.setFontSize(9);

  if (!columns.length) {
    doc.text('No columns selected.', margin, y + 5);
    doc.save(fileName);
    return;
  }

  const availableWidth = pageWidth - margin * 2;
  const minWidth = 22;
  let baseWidth = availableWidth / columns.length;
  let widths = columns.map(() => baseWidth);
  if (baseWidth > minWidth) {
    widths = columns.map(() => Math.max(minWidth, baseWidth));
    const total = widths.reduce((sum, value) => sum + value, 0);
    if (total > availableWidth) {
      const scale = availableWidth / total;
      widths = widths.map(value => value * scale);
    }
  } else {
    widths = columns.map(() => baseWidth);
  }

  const renderHeader = () => {
    let x = margin;
    doc.setFontSize(9);
    doc.setFont(undefined, 'bold');
    columns.forEach((column, index) => {
      doc.setFillColor(237, 242, 247);
      doc.setDrawColor(210);
      doc.rect(x, y, widths[index], headerHeight, 'FD');
      doc.setTextColor(51, 65, 85);
      const label = column.label || column.key || `Column ${index + 1}`;
      doc.text(label, x + 2, y + headerHeight - 2);
      x += widths[index];
    });
    doc.setFont(undefined, 'normal');
    doc.setTextColor(17, 24, 39);
    y += headerHeight;
  };

  renderHeader();

  rows.forEach(row => {
    const cellLines = columns.map((column, index) => {
      const raw = row[column.key];
      const value = raw === null || typeof raw === 'undefined' ? '' : raw;
      const text = typeof value === 'number' ? String(value) : String(value || '');
      const wrapWidth = Math.max(10, widths[index] - 4);
      return doc.splitTextToSize(text, wrapWidth);
    });
    const maxLines = cellLines.reduce((max, lines) => Math.max(max, lines.length || 1), 1);
    const rowHeight = Math.max(headerHeight, maxLines * baseLineHeight + rowPadding * 2);
    if (y + rowHeight > pageHeight - margin) {
      doc.addPage(undefined, orientation);
      y = margin;
      renderHeader();
    }
    let x = margin;
    columns.forEach((column, index) => {
      const lines = cellLines[index];
      doc.setDrawColor(230);
      doc.rect(x, y, widths[index], rowHeight);
      doc.text(lines, x + 2, y + rowPadding + 3);
      x += widths[index];
    });
    y += rowHeight;
  });

  const generatedAt = new Date().toISOString();
  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.text(`Generated ${formatDateTimeForDisplay(generatedAt) || generatedAt}`, margin, pageHeight - margin + 4);
  doc.save(fileName);
}

async function exportDatasetToXlsx(dataset, options = {}) {
  const columns = Array.isArray(dataset?.columns) ? dataset.columns : [];
  const rows = Array.isArray(dataset?.rows) ? dataset.rows : [];
  const { fileName = 'export.xlsx' } = options;
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('Spreadsheet export is only supported in a browser environment.');
  }
  let XLSX;
  try {
    XLSX = await import(/* webpackMode: "eager" */ 'xlsx');
  } catch (err) {
    throw new Error('XLSX library is unavailable.');
  }
  if (!XLSX || !XLSX.utils) {
    throw new Error('XLSX library is unavailable.');
  }
  const headerLabels = columns.map(column => column.label || column.key);
  const sheetRows = rows.map(row => {
    const entry = {};
    columns.forEach(column => {
      const key = column.label || column.key;
      const value = row[column.key];
      entry[key] = value === null || typeof value === 'undefined' ? '' : value;
    });
    return entry;
  });
  const worksheet = XLSX.utils.json_to_sheet(sheetRows, { header: headerLabels });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, options.sheetName || 'Export');
  const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
}

function groupFieldDefsBySection(defs = []) {
  const sections = new Map();
  defs.forEach(def => {
    const key = def.section || 'Other';
    if (!sections.has(key)) {
      sections.set(key, []);
    }
    sections.get(key).push(def);
  });
  return Array.from(sections.entries()).map(([section, fields]) => ({ section, fields }));
}

function normalizeBackupSettings(raw) {
  const defaults = { frequency: 'off', lastRun: null, maxVaultEntries: DEFAULT_BACKUP_LIMIT };
  if (!raw || typeof raw !== 'object') {
    return defaults;
  }
  const frequency = BACKUP_FREQUENCIES.includes(raw.frequency) ? raw.frequency : defaults.frequency;
  const lastRun = typeof raw.lastRun === 'string' && raw.lastRun ? raw.lastRun : null;
  let maxVaultEntries = defaults.maxVaultEntries;
  if (raw.maxVaultEntries === 'unlimited' || raw.maxVaultEntries === null) {
    maxVaultEntries = null;
  } else {
    const parsed = parseInt(raw.maxVaultEntries, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      maxVaultEntries = Math.min(parsed, 200);
    }
  }
  return { frequency, lastRun, maxVaultEntries };
}

function backupFrequencyToMs(freq) {
  switch (freq) {
    case 'nightly':
      return 24 * 60 * 60 * 1000;
    case 'weekly':
      return 7 * 24 * 60 * 60 * 1000;
    case 'monthly':
      return 30 * 24 * 60 * 60 * 1000;
    default:
      return null;
  }
}

function normalizeBackupSnapshot(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const savedAt = typeof raw.savedAt === 'string' && raw.savedAt ? raw.savedAt : null;
  const payload = raw.payload && typeof raw.payload === 'object' ? raw.payload : null;
  if (!savedAt || !payload) return null;
  return { savedAt, payload };
}

const LEGACY_DEFAULT_ID_TEMPLATE = '[YR][PREFIX]-[SEQ]';

const DEFAULT_ID_GENERATOR_CONFIG = Object.freeze({
  template: '[YROB][GEN3][-][SEX]-[SEQ]',
  sequencePadding: 1,
  uppercase: false,
  customText: '',
});

function getDefaultIdGeneratorConfig() {
  return { ...DEFAULT_ID_GENERATOR_CONFIG };
}

function normalizeIdGeneratorConfig(raw) {
  const base = getDefaultIdGeneratorConfig();
  if (!raw || typeof raw !== 'object') {
    return base;
  }
  const result = { ...base, ...raw };
  result.template = String(result.template || base.template);
  const pad = parseInt(result.sequencePadding, 10);
  result.sequencePadding = Number.isFinite(pad) && pad > 0 ? Math.min(pad, 6) : base.sequencePadding;
  result.uppercase = result.uppercase !== false;
  result.customText = String(
    typeof result.customText === 'string'
      ? result.customText
      : (result.customText ?? base.customText ?? '')
  );
  return result;
}

function normalizeBreederInfo(raw) {
  const base = {
    name: '',
    businessName: '',
    email: '',
    phone: '',
    logoUrl: '',
    idGenerator: getDefaultIdGeneratorConfig(),
  };
  if (!raw || typeof raw !== 'object') {
    return base;
  }
  const info = { ...base, ...raw };
  const rawIdGenerator = raw?.idGenerator;
  let normalizedConfig = normalizeIdGeneratorConfig(info.idGenerator);
  const shouldUpgradeTemplate =
    !rawIdGenerator ||
    (typeof rawIdGenerator === 'object' &&
      (!Object.prototype.hasOwnProperty.call(rawIdGenerator, 'template') ||
        String(rawIdGenerator.template || '').trim() === LEGACY_DEFAULT_ID_TEMPLATE) &&
      !Object.prototype.hasOwnProperty.call(rawIdGenerator, 'customText') &&
      !Object.prototype.hasOwnProperty.call(rawIdGenerator, 'uppercase') &&
      !Object.prototype.hasOwnProperty.call(rawIdGenerator, 'sequencePadding'));
  if (shouldUpgradeTemplate) {
    normalizedConfig = {
      ...normalizedConfig,
      template: DEFAULT_ID_GENERATOR_CONFIG.template,
    };
  }
  info.idGenerator = normalizeIdGeneratorConfig(normalizedConfig);
  return info;
}

const ID_TEMPLATE_TOKENS = [
  { token: '[YR]', description: 'Last two digits of the year (e.g., 25).' },
  { token: '[YEAR]', description: 'Full four-digit year (e.g., 2025).' },
  { token: '[YROB]', description: 'Last two digits of the birth year.' },
  { token: '[YEAROB]', description: 'Full four-digit birth year.' },
  { token: '[PREFIX]', description: 'Legacy prefix derived from the name (or sire × dam pattern).' },
  { token: '[PREFIXU]', description: 'Prefix in uppercase.' },
  { token: '[PREFIXL]', description: 'Prefix in lowercase.' },
  { token: '[NAME]', description: 'Letters from the name in Title Case.' },
  { token: '[NAMEU]', description: 'Letters from the name in uppercase.' },
  { token: '[NAMEL]', description: 'Letters from the name in lowercase.' },
  { token: '[INITIALS]', description: 'Initials from each word of the name.' },
  { token: '[SLUG]', description: 'Letters and numbers condensed to lowercase.' },
  { token: '[SLUGU]', description: 'Letters and numbers condensed to uppercase.' },
  { token: '[PAREN]', description: 'Code from a leading parentheses block (e.g., (DH)).' },
  { token: '[HETS]', description: 'Compact het markers (e.g., 50%Hclo).' },
  { token: '[SEX]', description: 'Animal sex (F or M).' },
  { token: '[TEXT]', description: 'Free text snippet from the wizard.' },
  { token: '[GEN3]', description: 'First three letters of each gene (e.g., Enchi Fire Clown → EncFirClo).' },
  { token: '[SEQ]', description: 'Running sequence number with optional padding.' },
  { token: '[-]', description: 'Literal dash separator.' },
];

function loadStoredJson(key, fallback) {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch (err) {
    console.warn(`Failed to read ${key} from storage`, err);
    return fallback;
  }
}

function saveStoredJson(key, value) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn(`Failed to persist ${key} to storage`, err);
  }
}

function cloneLogs(logs = {}) {
  return {
    feeds: [...(logs.feeds || [])],
    weights: [...(logs.weights || [])],
    sheds: [...(logs.sheds || [])],
    cleanings: [...(logs.cleanings || [])],
    meds: [...(logs.meds || [])],
  };
}

const MAX_PHOTOS_PER_SNAKE = 60;

function normalizePhotoEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const url = typeof raw.url === 'string' && raw.url.trim()
    ? raw.url.trim()
    : (typeof raw.dataUrl === 'string' && raw.dataUrl.trim() ? raw.dataUrl.trim() : null);
  if (!url) return null;
  const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : uid('photo');
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  const addedAt = typeof raw.addedAt === 'string' && raw.addedAt ? raw.addedAt : new Date().toISOString();
  const source = raw.source === 'camera' ? 'camera' : 'upload';
  const type = typeof raw.type === 'string' ? raw.type : '';
  const sizeValue = Number(raw.size);
  const size = Number.isFinite(sizeValue) && sizeValue >= 0 ? sizeValue : null;
  const note = typeof raw.note === 'string' ? raw.note : '';
  return { id, url, name, addedAt, source, type, size, note };
}

function normalizeSnakePhotos(rawList) {
  if (!Array.isArray(rawList)) return [];
  return rawList.map(normalizePhotoEntry).filter(Boolean);
}

function trimSnakePhotoList(list, limit = MAX_PHOTOS_PER_SNAKE) {
  if (!Array.isArray(list)) return [];
  if (typeof limit !== 'number' || limit <= 0) return list;
  if (list.length <= limit) return list;
  return list.slice(list.length - limit);
}

function sanitizeSnakeRecord(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const snake = { ...raw };
  snake.morphs = Array.isArray(raw.morphs) ? raw.morphs.map(token => String(token || '').trim()).filter(Boolean) : [];
  snake.hets = Array.isArray(raw.hets) ? raw.hets.map(token => String(token || '').trim()).filter(Boolean) : [];
  snake.tags = Array.isArray(raw.tags) ? raw.tags.map(token => String(token || '').trim()).filter(Boolean) : [];
  snake.groups = Array.isArray(raw.groups)
    ? raw.groups.map(token => String(token || '').trim()).filter(Boolean)
    : normalizeSingleGroupValue(raw.groups);
  snake.logs = cloneLogs(raw.logs);
  snake.photos = normalizeSnakePhotos(raw.photos);
  if (snake.metadata && typeof snake.metadata === 'object') {
    snake.metadata = { ...snake.metadata };
  }
  return snake;
}

function sanitizePairingRecord(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return withPairingLifecycleDefaults({ ...raw });
}

function normalizeBackupFileEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const payload = raw.payload && typeof raw.payload === 'object' ? raw.payload : null;
  if (!payload) return null;
  const source = raw.source === 'auto' ? 'auto' : 'manual';
  const createdAt = typeof raw.createdAt === 'string' && raw.createdAt ? raw.createdAt : new Date().toISOString();
  const updatedAt = typeof raw.updatedAt === 'string' && raw.updatedAt ? raw.updatedAt : createdAt;
  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : `${source === 'auto' ? 'Auto' : 'Manual'} backup ${formatDateTimeForDisplay(createdAt)}`;
  const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : uid('backup');
  return {
    id,
    name,
    createdAt,
    updatedAt,
    source,
    payload,
  };
}

function normalizeBackupVault(raw) {
  if (!Array.isArray(raw)) return [];
  const entries = raw.map(normalizeBackupFileEntry).filter(Boolean);
  entries.sort((a, b) => {
    const aTime = new Date(a.createdAt || 0).getTime();
    const bTime = new Date(b.createdAt || 0).getTime();
    return bTime - aTime;
  });
  return entries;
}

const seedSnakes = [
  {
    id: '25Ath-1',
    name: 'Athena - DEMO',
    sex: 'F',
    morphs: ['Clown', 'Pastel'],
    hets: ['Hypo'],
    weight: 850,
    year: 2025,
    birthDate: '2024-06-15',
    tags: ['proven', 'female'],
    groups: ['Breeders'],
    status: 'Active',
    imageUrl: undefined,
    isDemo: true,
    logs: { feeds: [], weights: [], sheds: [], cleanings: [], meds: [] }
  },
  {
    id: '25Bor-1',
    name: 'Boris - DEMO',
    sex: 'M',
    morphs: ['Pinstripe', 'Albino'],
    hets: [],
    weight: 1020,
    year: 2023,
    birthDate: '2023-08-02',
    tags: ['male'],
    groups: ['Breeders'],
    status: 'Active',
    imageUrl: undefined,
    isDemo: true,
    logs: { feeds: [], weights: [], sheds: [], cleanings: [], meds: [] }
  },
  {
    id: '25Jun-1',
    name: 'Juniper - DEMO',
    sex: 'F',
    morphs: ['GHI'],
    hets: [],
    weight: 460,
    year: 2024,
    birthDate: '2024-04-11',
    tags: ['holdback'],
    groups: ['Holdbacks'],
    status: 'Active',
    imageUrl: undefined,
    isDemo: true,
    logs: { feeds: [], weights: [], sheds: [], cleanings: [], meds: [] }
  },
  {
    id: '25Neo-1',
    name: 'Neo - DEMO',
    sex: 'M',
    morphs: ['Normal'],
    hets: [],
    weight: 180,
    year: 2025,
    birthDate: '2025-05-01',
    tags: ['hatchling'],
    groups: ['Hatchlings 2025'],
    status: 'Active',
    imageUrl: undefined,
    isDemo: true,
    logs: { feeds: [], weights: [], sheds: [], cleanings: [], meds: [] }
  }
];

const BORIS_DEMO_SEED = seedSnakes.find(s => s?.name === 'Boris - DEMO');
const BORIS_PREVIEW_DEFAULTS = {
  name: BORIS_DEMO_SEED?.name || 'Boris - DEMO',
  year: BORIS_DEMO_SEED?.year || extractYearFromDateString(BORIS_DEMO_SEED?.birthDate) || new Date().getFullYear(),
  birthYear: extractYearFromDateString(BORIS_DEMO_SEED?.birthDate) || BORIS_DEMO_SEED?.year || new Date().getFullYear(),
  sex: ensureSex(BORIS_DEMO_SEED?.sex, 'M'),
  genes: (() => {
    const morphs = Array.isArray(BORIS_DEMO_SEED?.morphs) ? BORIS_DEMO_SEED.morphs : [];
    const hets = Array.isArray(BORIS_DEMO_SEED?.hets) ? BORIS_DEMO_SEED.hets : [];
    const combined = [...morphs, ...hets].map(token => String(token || '').trim()).filter(Boolean);
    return combined.length ? combined.join(', ') : '';
  })(),
};

const seedPairings = [];
const DEFAULT_GROUPS = ["Breeders", "Holdbacks", "Hatchlings 2024", "Hatchlings 2025"];

function createFreshSnakes() {
  return seedSnakes.map(s => {
    const existingSequence = Number(s?.idSequence);
    const resolvedSequence = Number.isFinite(existingSequence) && existingSequence > 0
      ? existingSequence
      : (extractSequenceFromId(s?.id) || null);
    return {
      ...s,
      idSequence: resolvedSequence,
      morphs: [...(s.morphs || [])],
      hets: [...(s.hets || [])],
      tags: [...(s.tags || [])],
      groups: normalizeSingleGroupValue(s.groups),
      logs: cloneLogs(s.logs),
      photos: normalizeSnakePhotos(s.photos),
    };
  });
}

function createFreshPairings() {
  return seedPairings.map(p => withPairingLifecycleDefaults({
    ...p,
    goals: [...(p.goals || [])],
    notes: p.notes || '',
    appointments: (p.appointments || []).map(ap => ({ ...ap })),
  }));
}

function formatDateForDisplay(dateLike) {
  if (!dateLike) return '';
  if (typeof dateLike === 'string') {
    const m = dateLike.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    const parsed = new Date(dateLike);
    if (!isNaN(parsed)) {
      const dd = String(parsed.getDate()).padStart(2, '0');
      const mm = String(parsed.getMonth() + 1).padStart(2, '0');
      const yyyy = parsed.getFullYear();
      return `${dd}/${mm}/${yyyy}`;
    }
    return dateLike;
  }
  if (dateLike instanceof Date) {
    const dd = String(dateLike.getDate()).padStart(2, '0');
    const mm = String(dateLike.getMonth() + 1).padStart(2, '0');
    const yyyy = dateLike.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }
  try {
    const parsed = new Date(dateLike);
    if (!isNaN(parsed)) {
      const dd = String(parsed.getDate()).padStart(2, '0');
      const mm = String(parsed.getMonth() + 1).padStart(2, '0');
      const yyyy = parsed.getFullYear();
      return `${dd}/${mm}/${yyyy}`;
    }
  } catch (e) {
    // ignore
  }
  return String(dateLike);
}
function withPairingLifecycleDefaults(pairing = {}) {
  const defaults = pairingLifecycleDefaults();
  const ovulation = { ...defaults.ovulation, ...(pairing.ovulation || {}) };
  const preLayShed = { ...defaults.preLayShed, ...(pairing.preLayShed || {}) };
  const clutch = { ...defaults.clutch, ...(pairing.clutch || {}) };
  const hatch = { ...defaults.hatch, ...(pairing.hatch || {}) };

  const toCountOrNull = (value) => {
    if (value === '' || value === null || typeof value === 'undefined') return null;
    const num = Number(value);
    if (!Number.isFinite(num) || num < 0) return null;
    return num;
  };

  const clutchRecorded = !!clutch.recorded;
  let fertileCount = toCountOrNull(clutch.fertileEggs);
  let slugCount = toCountOrNull(clutch.slugs);
  let totalCount = toCountOrNull(clutch.eggsTotal);

  if (!clutchRecorded) {
    clutch.fertileEggs = '';
    clutch.slugs = '';
    clutch.eggsTotal = '';
  } else {
    if (fertileCount === null && totalCount !== null) {
      const safeSlugs = slugCount ?? 0;
      fertileCount = Math.max(0, totalCount - safeSlugs);
    }
    if (slugCount === null) slugCount = 0;
    if (fertileCount === null) fertileCount = 0;

    fertileCount = Math.max(0, fertileCount);
    slugCount = Math.max(0, slugCount);
    totalCount = fertileCount + slugCount;

    clutch.fertileEggs = fertileCount;
    clutch.slugs = slugCount;
    clutch.eggsTotal = totalCount;
  }

  hatch.hatchedCount = Number(hatch.hatchedCount || 0);
  if (!Number.isFinite(hatch.hatchedCount) || hatch.hatchedCount < 0) hatch.hatchedCount = 0;

  const hatchLimit = typeof clutch.fertileEggs === 'number' && Number.isFinite(clutch.fertileEggs)
    ? Math.max(0, clutch.fertileEggs)
    : (typeof clutch.eggsTotal === 'number' && Number.isFinite(clutch.eggsTotal) ? Math.max(0, clutch.eggsTotal) : null);

  if (typeof hatchLimit === 'number' && Number.isFinite(hatchLimit)) {
    hatch.hatchedCount = Math.min(Math.max(0, hatch.hatchedCount), hatchLimit);
  } else {
    hatch.hatchedCount = Math.max(0, hatch.hatchedCount);
  }
  return {
    ...pairing,
    ovulation,
    preLayShed,
    clutch,
    hatch,
  };
}

function initSnakeDraft(s) {
  if (!s) return { name:'', sex:'F', morphs:[], hets:[], tags:[], groups:[], logs: cloneLogs(), idSequence: null };
  const existingSequence = Number(s?.idSequence);
  const resolvedSequence = Number.isFinite(existingSequence) && existingSequence > 0
    ? existingSequence
    : (extractSequenceFromId(s?.id) || null);
  return {
    ...s,
    idSequence: resolvedSequence,
    sex: ensureSex(s.sex, 'F'),
    morphs: s.morphs || [],
    hets: s.hets || [],
    tags: s.tags || [],
    groups: normalizeSingleGroupValue(s.groups),
    logs: cloneLogs(s.logs),
    photos: normalizeSnakePhotos(s.photos),
  };
}

function createEmptyNewAnimalDraft() {
  return {
    id: "",
    autoId: true,
    idSequence: null,
    name: "",
    sex: "F",
    morphHetInput: "",
    morphs: [],
    hets: [],
    weight: "",
    year: "",
    birthDate: "",
    imageUrl: "",
    photos: [],
    groups: [],
    logs: cloneLogs()
  };
}

function snakeById(list, id) {
  if (!Array.isArray(list)) return null; return list.find(x => x && x.id === id) || null;
}

function normalizeSexValue(raw) {
  const value = String(raw ?? '').trim().toLowerCase();
  if (!value) return 'UNKNOWN';
  if (value === 'm' || value === 'male') return 'M';
  if (value === 'f' || value === 'female') return 'F';
  if (/^male\b/.test(value)) return 'M';
  if (/^female\b/.test(value)) return 'F';
  if (/^supermale\b/.test(value)) return 'M';
  if (/^superfemale\b/.test(value)) return 'F';
  if (/^1[\s.:/]*0$/.test(value)) return 'M';
  if (/^0[\s.:/]*1$/.test(value)) return 'F';
  if (/^m/.test(value)) return 'M';
  if (/^f/.test(value)) return 'F';
  return 'UNKNOWN';
}

function ensureSex(raw, fallback = 'F') {
  const normalized = normalizeSexValue(raw);
  return normalized === 'UNKNOWN' ? fallback : normalized;
}

function isFemaleSnake(snake) {
  return normalizeSexValue(snake?.sex) === 'F';
}

function isMaleSnake(snake) {
  return normalizeSexValue(snake?.sex) === 'M';
}

function formatHetForDisplay(rawHet) {
  if (rawHet === null || rawHet === undefined) return null;
  let text = String(rawHet).replace(/\s+/g, ' ').trim();
  if (!text) return null;

  let working = text;
  const prefixes = [];

  const percentMatch = working.match(/^(\d{1,3}%)(?:\s+)(.*)$/i);
  if (percentMatch) {
    prefixes.push(percentMatch[1].trim());
    working = percentMatch[2].trim();
  }

  const qualifierMatch = working.match(/^(pos(?:s?i?a?ble)?|probable|maybe|ph)\b\s*(.*)$/i);
  if (qualifierMatch) {
    const qualifierWord = qualifierMatch[1].toLowerCase();
    const qualifierLookup = {
      pos: 'Possible',
      possiable: 'Possible',
      posible: 'Possible',
      possible: 'Possible',
      probable: 'Probable',
      maybe: 'Maybe',
      ph: 'Possible'
    };
    prefixes.push(qualifierLookup[qualifierWord] || cap(qualifierWord));
    working = qualifierMatch[2].trim();
  }

  let base = working;
  if (/\bhet\b/i.test(base)) {
    base = base.replace(/\bhet\b/gi, '').trim();
  }

  if (base) {
    base = base
      .split(/\s+/)
      .map(segment => {
        if (!segment) return '';
        const upper = segment.toUpperCase();
        if (segment === upper) return segment;
        return segment.charAt(0).toUpperCase() + segment.slice(1);
      })
      .join(' ')
      .trim();
  }

  const parts = [...prefixes, 'Het'];
  if (base) parts.push(base);
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function uniqueGeneTokens(tokens = []) {
  const seen = new Set();
  const result = [];
  tokens.forEach(token => {
    const key = String(token).replace(/\s+/g, ' ').trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    result.push(token);
  });
  return result;
}

function combineMorphsAndHetsForDisplay(morphs = [], hets = []) {
  const morphList = Array.isArray(morphs) ? morphs : (morphs ? [morphs] : []);
  const hetList = Array.isArray(hets) ? hets : (hets ? [hets] : []);
  const normalizedMorphs = morphList.map(m => String(m).trim()).filter(Boolean);
  const normalizedHets = hetList.map(formatHetForDisplay).filter(Boolean);
  const combined = uniqueGeneTokens([...normalizedMorphs, ...normalizedHets]);
  const groupWeight = {
    'Dominant': 0,
    'Incomplete Dominant': 1,
    'Recessive': 2,
    'Other': 3
  };
  const weighted = combined.map((token, index) => {
    const group = getGeneDisplayGroup(token) || 'Other';
    const weight = typeof groupWeight[group] === 'number' ? groupWeight[group] : groupWeight.Other;
    return { token, index, weight };
  });
  weighted.sort((a, b) => {
    if (a.weight !== b.weight) return a.weight - b.weight;
    return a.index - b.index;
  });
  return weighted.map(item => item.token);
}

function isHetDescriptorToken(token) {
  if (!token) return false;
  const lower = String(token).toLowerCase();
  if (lower.includes('het')) return true;
  if (/(^|\s)(pos(?:s?i?a?ble)?|probable|maybe|ph)(\s|$)/i.test(lower)) return true;
  if (/\d{1,3}%/.test(lower)) return true;
  return false;
}

function isHetGeneToken(token) {
  if (!token) return false;
  const normalizedRaw = String(token).replace(/\s+/g, ' ').trim();
  if (!normalizedRaw) return false;
  const lower = normalizedRaw.toLowerCase();
  const hetPrefixPattern = /^(?:\d{1,3}%\s*)?(?:(?:pos(?:s?i?a?ble)?|probable|maybe|ph)\s+)?het\b/;
  if (hetPrefixPattern.test(lower)) {
    return true;
  }
  return isHetDescriptorToken(token);
}

function normalizeHetInputToken(token) {
  if (!token) return null;
  let working = String(token).replace(/\s+/g, ' ').trim();
  if (!working) return null;

  let percent = '';
  const percentMatch = working.match(/^(\d{1,3}%)(?:\s*)(.*)$/i);
  if (percentMatch) {
    percent = percentMatch[1].toUpperCase();
    working = percentMatch[2].trim();
  }

  let qualifier = '';
  const qualifierMatch = working.match(/^(pos(?:s?i?a?ble)?|probable|maybe|ph)(?:\s*)(.*)$/i);
  if (qualifierMatch) {
    qualifier = qualifierMatch[1].toLowerCase();
    working = qualifierMatch[2].trim();
  }

  working = working
    .replace(/\bhet\b/gi, ' ')
    .replace(/^het(?=[A-Za-z])/i, '')
    .trim();

  const qualifierMap = {
    pos: 'Possible',
    ph: 'Possible',
    possible: 'Possible',
    possiable: 'Possible',
    posible: 'Possible',
    probable: 'Probable',
    maybe: 'Maybe',
  };

  const qualifierText = qualifierMap[qualifier] || '';

  const parts = [];
  if (qualifierText) parts.push(qualifierText);
  if (working) parts.push(working);
  let result = parts.join(' ').trim();
  if (percent) result = `${percent} ${result}`.trim();
  return result || null;
}

const geneLookupCache = {
  map: null,
  compactMap: null,
  maxWords: 1,
  maxCompactLength: 0,
};

function normalizeGeneLookupKey(value) {
  return String(value || '')
    .replace(/[()[\]]/g, ' ')
    .replace(/[-_/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function ensureGeneLookupCache() {
  if (geneLookupCache.map) return geneLookupCache;
  if (typeof GENE_GROUPS === 'undefined') {
    return geneLookupCache;
  }
  const lookup = new Map();
  const addVariant = (raw, canonical) => {
    const key = normalizeGeneLookupKey(raw);
    if (!key) return;
    if (!lookup.has(key)) {
      lookup.set(key, canonical);
    }
  };

  Object.values(GENE_GROUPS).forEach(list => {
    (list || []).forEach(name => {
      if (!name) return;
      addVariant(name, name);
      const withoutParens = name.replace(/\(.*?\)/g, '').trim();
      if (withoutParens && withoutParens !== name) addVariant(withoutParens, name);
    });
  });

  if (typeof GENE_ALIASES === 'object' && GENE_ALIASES) {
    Object.entries(GENE_ALIASES).forEach(([alias, canonical]) => {
      if (!alias) return;
      if (canonical) addVariant(canonical, canonical);
      addVariant(alias, canonical || alias);
    });
  }

  const compactLookup = new Map();
  let maxWords = 1;
  let maxCompactLength = 0;

  const addCompactVariant = (key, canonicalDisplay) => {
    const compactKey = key.replace(/\s+/g, '');
    if (!compactKey) return;
    if (!compactLookup.has(compactKey)) {
      compactLookup.set(compactKey, { display: canonicalDisplay, sourceKey: compactKey });
      if (compactKey.length > maxCompactLength) maxCompactLength = Math.max(maxCompactLength, compactKey.length);
    }
  };

  lookup.forEach((canonical, key) => {
    const words = key.split(' ').filter(Boolean);
    if (words.length > maxWords) maxWords = words.length;
    addCompactVariant(key, canonical);

    const canonicalLower = String(canonical || '').toLowerCase();
    if (!canonicalLower.startsWith('super ')) {
      const superKey = `super${key.replace(/\s+/g, '')}`;
      const superDisplay = `Super ${canonical}`;
      addCompactVariant(superKey, superDisplay);
    }
  });

  geneLookupCache.map = lookup;
  geneLookupCache.compactMap = compactLookup;
  geneLookupCache.maxWords = maxWords;
  geneLookupCache.maxCompactLength = maxCompactLength;
  return geneLookupCache;
}

function lookupCanonicalGene(raw) {
  if (!raw) return null;
  const cache = ensureGeneLookupCache();
  const lookup = cache.map;
  if (!lookup) return null;
  const key = normalizeGeneLookupKey(raw);
  if (!key) return null;
  return lookup.get(key) || null;
}

function splitWordsByGeneList(words) {
  const result = [];
  if (!Array.isArray(words) || !words.length) return result;
  const cache = ensureGeneLookupCache();
  const maxWords = cache.maxWords || 1;

  let i = 0;
  while (i < words.length) {
    const current = words[i];
    if (!current) {
      i += 1;
      continue;
    }
    const lower = current.toLowerCase();

    if (lower === 'super' && i + 1 < words.length) {
      let matched = null;
      let consumed = 0;
      for (let len = Math.min(maxWords, words.length - (i + 1)); len >= 1; len--) {
        const candidateWords = words.slice(i + 1, i + 1 + len);
        const candidateSource = candidateWords.join(' ');
        const canonical = lookupCanonicalGene(candidateSource);
        if (canonical) {
          matched = {
            display: `Super ${canonical}`,
            source: `Super ${candidateSource}`,
          };
          consumed = len + 1;
          break;
        }
      }
      if (matched) {
        result.push(matched);
        i += consumed;
        continue;
      }
    }

    let matched = null;
    let consumed = 0;
    for (let len = Math.min(maxWords, words.length - i); len >= 1; len--) {
      const candidateWords = words.slice(i, i + len);
      const candidateSource = candidateWords.join(' ');
      const canonical = lookupCanonicalGene(candidateSource);
      if (canonical) {
        matched = {
          display: canonical,
          source: candidateSource,
        };
        consumed = len;
        break;
      }
    }

    if (matched) {
      result.push(matched);
      i += consumed;
      continue;
    }

    result.push({ display: current, source: current });
    i += 1;
  }

  return result;
}

function splitCompactGeneString(text) {
  if (!text) return [];
  const cache = ensureGeneLookupCache();
  const compactMap = cache.compactMap;
  if (!compactMap || !compactMap.size) return [];

  const normalized = normalizeGeneLookupKey(text);
  const compact = normalized.replace(/\s+/g, '');
  if (!compact) return [];

  const maxLen = cache.maxCompactLength || compact.length;
  const memo = new Map();

  const dfs = (index) => {
    if (index === compact.length) return [[]];
    if (memo.has(index)) return memo.get(index);

    const results = [];
    const limit = Math.min(maxLen, compact.length - index);
    for (let len = limit; len >= 1; len--) {
      const slice = compact.slice(index, index + len);
      const entry = compactMap.get(slice);
      if (!entry) continue;
      const tails = dfs(index + len);
      tails.forEach(tail => {
        results.push([entry, ...tail]);
      });
    }

    memo.set(index, results);
    return results;
  };

  const combos = dfs(0).filter(combo => combo.length);
  if (!combos.length) return [];
  combos.sort((a, b) => a.length - b.length);
  const bestLength = combos[0].length;
  const best = combos.find(combo => combo.length === bestLength) || combos[0];
  return best.map(entry => ({ display: entry.display, source: entry.sourceKey }));
}

function splitSegmentIntoTokens(segment) {
  if (!segment) return [];
  const original = String(segment).replace(/[+]+/g, ' ');
  let working = original;
  const entries = [];
  const ranges = [];
  let order = 0;

  const overlaps = (start, end) => ranges.some(range => Math.max(range.start, start) < Math.min(range.end, end));
  const pushEntry = (token, start) => {
    const trimmed = String(token || '').replace(/\s+/g, ' ').trim();
    if (!trimmed) return;
    const position = Number.isFinite(start) ? start : Number.POSITIVE_INFINITY;
    entries.push({ token: trimmed, start: position, order: order++ });
  };
  const addRange = (start, end) => {
    if (!Number.isFinite(start) || !Number.isFinite(end)) return;
    ranges.push({ start, end });
  };

  const hetRegex = /(?:\d{1,3}%\s*)?(?:pos(?:s?i?a?ble)?|probable|maybe|ph)?\s*het\s*[A-Za-z][A-Za-z\s-]*/gi;
  let match;
  while ((match = hetRegex.exec(working)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (overlaps(start, end)) continue;
    pushEntry(match[0], start);
    addRange(start, end);
  }

  const percentRegex = /\d{1,3}%\s*[A-Za-z][A-Za-z\s-]*/gi;
  while ((match = percentRegex.exec(working)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (overlaps(start, end)) continue;
    pushEntry(match[0], start);
    addRange(start, end);
  }

  if (ranges.length) {
    let rebuilt = '';
    let previousIndex = 0;
    const sortedRanges = [...ranges].sort((a, b) => a.start - b.start);
    sortedRanges.forEach(range => {
      rebuilt += working.slice(previousIndex, range.start);
      rebuilt += ' ';
      previousIndex = range.end;
    });
    rebuilt += working.slice(previousIndex);
    working = rebuilt;
  }

  const originalLower = original.toLowerCase();
  let searchCursor = 0;

  const findPosition = source => {
    if (!source) return Number.POSITIVE_INFINITY;
    const target = String(source).toLowerCase();
    let idx = originalLower.indexOf(target, searchCursor);
    while (idx !== -1) {
      const start = idx;
      const end = start + target.length;
      if (!overlaps(start, end)) {
        addRange(start, end);
        searchCursor = end;
        return start;
      }
      idx = originalLower.indexOf(target, end);
    }
    idx = originalLower.indexOf(target);
    while (idx !== -1) {
      const start = idx;
      const end = start + target.length;
      if (!overlaps(start, end)) {
        addRange(start, end);
        searchCursor = end;
        return start;
      }
      idx = originalLower.indexOf(target, end);
    }
    return Number.POSITIVE_INFINITY;
  };

  const leftoverWords = working.split(/\s+/).filter(Boolean);
  const leftoverPairs = splitWordsByGeneList(leftoverWords);
  if (leftoverPairs.length) {

    leftoverPairs.forEach(pair => {
      const isFallback = pair.display === pair.source;
      if (isFallback) {
        const compactPairs = splitCompactGeneString(pair.source) || [];
        const differsFromOriginal = compactPairs.length > 1 || (compactPairs.length === 1 && compactPairs[0].display !== pair.display);
        if (differsFromOriginal && compactPairs.length) {
          compactPairs.forEach(tokenPair => {
            if (!tokenPair || !tokenPair.display) return;
            const searchCandidates = [tokenPair.source, tokenPair.display].filter(Boolean);
            let start = Number.POSITIVE_INFINITY;
            for (const candidate of searchCandidates) {
              start = findPosition(candidate);
              if (Number.isFinite(start)) break;
            }
            pushEntry(tokenPair.display, start);
          });
          return;
        }
      }

      const start = findPosition(pair.source);
      pushEntry(pair.display, start);
    });
  }

  const sortedAfterPairs = [...ranges].sort((a, b) => a.start - b.start);
  let cursor = 0;
  const uncoveredFragments = [];
  sortedAfterPairs.forEach(range => {
    if (range.start > cursor) {
      const fragment = original.slice(cursor, range.start);
      if (fragment && /[A-Za-z]/.test(fragment)) {
        uncoveredFragments.push(fragment);
      }
    }
    cursor = Math.max(cursor, range.end);
  });
  if (cursor < original.length) {
    const fragment = original.slice(cursor);
    if (fragment && /[A-Za-z]/.test(fragment)) {
      uncoveredFragments.push(fragment);
    }
  }

  if (uncoveredFragments.length) {
    uncoveredFragments.forEach(fragment => {
      const compactPairs = splitCompactGeneString(fragment) || [];
      compactPairs.forEach(pair => {
        if (!pair || !pair.display) return;
        const searchCandidates = [pair.source, pair.display].filter(Boolean);
        let start = Number.POSITIVE_INFINITY;
        for (const candidate of searchCandidates) {
          start = findPosition(candidate);
          if (Number.isFinite(start)) break;
        }
        pushEntry(pair.display, start);
      });
    });
  }

  entries.sort((a, b) => {
    if (a.start === b.start) return a.order - b.order;
    return a.start - b.start;
  });

  return entries.map(entry => entry.token);
}

function splitMorphHetInput(value) {
  const raw = String(value || '').trim();
  if (!raw) return { morphs: [], hets: [] };

  const segments = raw
    .split(/[\n\r,;|/+]+/)
    .map(segment => segment.trim())
    .filter(Boolean);

  const tokens = segments.flatMap(splitSegmentIntoTokens);

  const morphs = [];
  const hets = [];

  tokens.forEach(token => {
    if (isHetDescriptorToken(token)) {
      const normalizedHet = normalizeHetInputToken(token);
      if (normalizedHet) hets.push(normalizedHet);
    } else {
      morphs.push(token);
    }
  });

  return { morphs, hets };
}

function formatMorphHetForInput(morphs = [], hets = []) {
  const morphTokens = (Array.isArray(morphs) ? morphs : [])
    .map(m => String(m).trim())
    .filter(Boolean);
  const hetTokens = (Array.isArray(hets) ? hets : [])
    .map(formatHetForDisplay)
    .filter(Boolean);
  return [...morphTokens, ...hetTokens].join(', ');
}

function genMonthlyAppointments(startDate, months=3) {
  const out = [];
  const start = new Date(startDate || new Date());
  for (let i=0;i<months;i++) {
    const d = new Date(start.getFullYear(), start.getMonth()+i, start.getDate());
    out.push({ id: uid('ap'), date: localYMD(d), notes: '', lockObserved: false, lockLoggedAt: null });
  }
  return out;
}

function readFileAsDataURL(file) {
  return new Promise((res, rej) => {
    const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file);
  });
}

function scaleDimensions(width, height, maxDimension = 1024) {
  if (!width || !height) return { width: 0, height: 0 };
  const largest = Math.max(width, height);
  if (!maxDimension || largest <= maxDimension) {
    return { width, height };
  }
  const scale = maxDimension / largest;
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale)
  };
}

function loadImageFromUrl(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url;
  });
}

async function decodeQrFromImageFile(file, { maxDimension = 1024 } = {}) {
  if (!file) return null;
  const blobUrl = URL.createObjectURL(file);
  try {
    const image = await loadImageFromUrl(blobUrl);
    const naturalWidth = image.naturalWidth || image.width;
    const naturalHeight = image.naturalHeight || image.height;
    if (!naturalWidth || !naturalHeight) {
      throw new Error('Invalid image dimensions');
    }

    const { width, height } = scaleDimensions(naturalWidth, naturalHeight, maxDimension);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
      throw new Error('Canvas context not available');
    }
    context.drawImage(image, 0, 0, width, height);

    const imageData = context.getImageData(0, 0, width, height);
    const result = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
    if (result && typeof result.data === 'string') {
      return result.data;
    }
    return null;
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

function extractDecodedText(payload) {
  if (!payload) return null;
  if (typeof payload === 'string') return payload;
  if (typeof payload === 'object') {
    if (typeof payload.text === 'string') return payload.text;
    if (typeof payload.decodedText === 'string') return payload.decodedText;
    if (typeof payload.data === 'string') return payload.data;
    if (Array.isArray(payload) && payload.length > 0) {
      return extractDecodedText(payload[0]);
    }
  }
  return null;
}

function extractSnakeIdFromPayload(decoded) {
  if (decoded == null) return null;
  const raw = String(decoded).trim();
  if (!raw) return null;
  const match = raw.match(/#?snake=?(.*)/);
  const candidate = match ? match[1] : raw;
  try {
    const decodedValue = decodeURIComponent(candidate);
    return decodedValue || null;
  } catch {
    return candidate || null;
  }
}

// lightweight logs helpers
function updateLog(target, key, idxOrEntry, maybePatch) {
  // If first arg is a setter function (used by LogsEditor), apply an in-place update
  if (typeof target === 'function') {
    const setDraft = target;
    const idx = idxOrEntry;
    const patch = maybePatch || {};
    setDraft(d => {
      const logs = { ...(d.logs || {}) };
      const arr = Array.isArray(logs[key]) ? [...logs[key]] : [];
      // if idx is a number, merge patch into that index
      if (typeof idx === 'number') {
        const existing = arr[idx] || {};
        arr[idx] = { ...existing, ...patch };
      } else if (idxOrEntry && typeof idxOrEntry === 'object') {
        // allow calling updateLog(setDraft, key, newEntry) to append
        arr.push(idxOrEntry);
      }
      return { ...d, logs: { ...logs, [key]: arr } };
    });
    return;
  }

  // Backwards-compatible: if first arg is a snake object, return a new snake with an appended entry
  const snake = target;
  if (!snake) return snake;
  const entry = idxOrEntry;
  const logs = { ...(snake.logs || {}) };
  logs[key] = [...(logs[key]||[]), entry];
  return { ...snake, logs };
}

// LogsEditor is implemented later in the file; stub removed.


function parseReptileBuddyText(raw) {
  if (!raw) return [];
  // more robust heuristic parser: split by blank lines into blocks and try several common patterns
  const blocks = raw.split(/\n\s*\n/).map(b=>b.trim()).filter(Boolean);
  const out = [];
  for (const b of blocks) {
  let lines = b.split(/\n/).map(l=>l.trim()).filter(Boolean);
  // ignore species line 'Ball Python (Python regius)'
  lines = lines.filter(l => !/^ball python\s*\(python regius\)$/i.test(l));
    const obj = { name: '', sex: 'F', morphs: [], hets: [], tags: [], groups: [], imageUrl: undefined };

    // helper to split a comma/slash separated list into array
    const splitList = s => (s || '').split(/[,/]/).map(x=>x.trim()).filter(Boolean);

    // Special-case: many PDFs export records as 4-line blocks:
    // 1: Name (ID)
    // 2: Species (latin)
    // 3: Gender
    // 4: Genetics (e.g. "Pinstripe, Albino (Heterozygous)")
    // If we detect this pattern, parse it strictly.
    if (lines.length >= 4) {
      const mNameId = lines[0].match(/^(.*?)\s*\(([^)]+)\)\s*$/);
      const genderLine = lines[2].toLowerCase();
      if (mNameId && /female|male|f|m/i.test(genderLine)) {
        obj.name = mNameId[1].trim();
        obj.id = mNameId[2].trim();
        obj.sex = /female/i.test(genderLine) ? 'F' : (/male/i.test(genderLine) ? 'M' : 'F');

        // parse genetics line
        const genLine = lines[3];
        // match tokens like "Albino (Heterozygous)" or plain "Pinstripe"
        const tokenRe = /([^,]+(?:\([^)]*\))?)/g;
        const tokens = [];
        let tk;
        while ((tk = tokenRe.exec(genLine)) !== null) {
          const t = tk[1].trim();
          if (t) tokens.push(t);
        }

        for (let t of tokens) {
          // extract annotation in parentheses if present
          const ma = t.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
          let gene = t;
          let anno = null;
          if (ma) { gene = ma[1].trim(); anno = ma[2].trim().toLowerCase(); }
          // normalize common annotation names
          if (!anno) {
            // plain token -> treat as visual (morph)
            obj.morphs.push(gene);
          } else if (/regular/i.test(anno)) {
            // Regular means it's a visual form
            obj.morphs.push(gene);
          } else if (/heterozygous66|heterozygous 66|66%|\b66\b/i.test(anno)) {
            obj.hets.push(`66% ${gene}`);
          } else if (/heterozygous50|heterozygous 50|50%|\b50\b/i.test(anno)) {
            obj.hets.push(`50% ${gene}`);
          } else if (/heterozygous|het/i.test(anno)) {
            obj.hets.push(`${gene}`);
          } else if (/\bpos(?:s?i?a?ble)?\b/i.test(anno)) {
            obj.hets.push(`${gene} (possible)`);
          } else {
            // unknown annotation - add to hets conservatively
            obj.hets.push(`${gene} (${anno})`);
          }
        }

        if (obj.name) out.push(obj);
        continue; // done with this block
      }
    }

    // Try to detect "Name:" style and explicit fields first
    for (const l of lines) {
      const low = l.toLowerCase();
      if (low.startsWith('name:')) obj.name = l.split(':').slice(1).join(':').trim();
      if (low.startsWith('sex:')) {
        if (/female/i.test(l)) obj.sex = 'F';
        else if (/male/i.test(l)) obj.sex = 'M';
      }
      if (low.startsWith('morphs:') || low.startsWith('morph:') || low.includes('morph')) {
        // capture after ':' if present, otherwise try to take rest of line
        const parts = l.split(':');
        const payload = parts.length > 1 ? parts.slice(1).join(':') : l.replace(/morphs?:/i, '').trim();
        obj.morphs = splitList(payload);
      }
      if (low.startsWith('hets:') || low.startsWith('het:') || low.includes('het')) {
        const parts = l.split(':');
        const payload = parts.length > 1 ? parts.slice(1).join(':') : l.replace(/hets?:/i, '').trim();
        obj.hets = splitList(payload);
      }
    }

    // If no explicit name found, try some common line patterns
    if (!obj.name && lines.length) {
      const first = lines[0];
      // patterns: "Name (Female)", "Name - Female - Clown", "Name — Female"
      const mParen = first.match(/^(.+?)\s*\((male|female|m|f)\)/i);
      if (mParen) {
        obj.name = mParen[1].trim();
        obj.sex = /male/i.test(mParen[2]) ? 'M' : 'F';
      } else {
        const parts = first.split(/[-–—|\t]/).map(p=>p.trim()).filter(Boolean);
        if (parts.length >= 2 && /^(male|female|m|f)$/i.test(parts[1])) {
          obj.name = parts[0];
          obj.sex = /male/i.test(parts[1]) ? 'M' : 'F';
          // remaining parts could include morphs
          if (parts.length > 2) obj.morphs = splitList(parts.slice(2).join(', '));
        } else {
          // fallback: use first line as name
          obj.name = first;
        }
      }
    }

    // Try to extract sex from any line if not set
    if ((!obj.sex || obj.sex === '') && lines.some(l=>/male|female|\bM\b|\bF\b/i.test(l))) {
      for (const l of lines) {
        if (/female/i.test(l)) { obj.sex = 'F'; break; }
        if (/male/i.test(l)) { obj.sex = 'M'; break; }
      }
    }

    // Try to find morphs/hets in other lines if still empty
    if ((!obj.morphs || !obj.morphs.length) && lines.length > 1) {
      for (const l of lines.slice(1)) {
        if (/morphs?:|visuals?:/i.test(l) || /,/.test(l) || /\//.test(l)) {
          const parts = l.split(/:|–|-|—/).map(p=>p.trim()).filter(Boolean);
          const payload = parts.length>1 ? parts.slice(1).join(':') : parts[0];
          const arr = splitList(payload);
          if (arr.length) { obj.morphs = arr; break; }
        }
      }
    }

    if ((!obj.hets || !obj.hets.length) && lines.length > 1) {
      for (const l of lines.slice(1)) {
        if (/hets?:/i.test(l) || /het\b/i.test(l)) {
          const parts = l.split(/:|–|-|—/).map(p=>p.trim()).filter(Boolean);
          const payload = parts.length>1 ? parts.slice(1).join(':') : parts[0];
          const arr = splitList(payload);
          if (arr.length) { obj.hets = arr; break; }
        }
      }
    }

    // normalize: ensure arrays and trim name
    obj.name = (obj.name || '').trim();
    obj.morphs = Array.isArray(obj.morphs) ? obj.morphs.map(x=>x.trim()).filter(Boolean) : (obj.morphs ? [String(obj.morphs).trim()] : []);
    obj.hets = Array.isArray(obj.hets) ? obj.hets.map(x=>x.trim()).filter(Boolean) : (obj.hets ? [String(obj.hets).trim()] : []);

    if (obj.name) out.push(obj);
  }
  return out;
}

// Strict parser for 4-line blocks as described by user:
// Line1: Name (ID)
// Line2: species (ignored)
// Line3: gender
// Line4: genetics tokens with optional annotations
function parseFourLineBlocks(raw) {
  if (!raw) return [];
  const blocks = raw.split(/\n\s*\n/).map(b=>b.trim()).filter(Boolean);
  const out = [];
  for (const b of blocks) {
  // remove any species line like 'Ball Python (Python regius)'
  let lines = b.split(/\n/).map(l=>l.trim()).filter(Boolean);
  lines = lines.filter(l => !/^ball python\s*\(python regius\)$/i.test(l));
  if (lines.length < 3) continue;
    // line1: Name (ID)
    const m = lines[0].match(/^(.*?)\s*\(([^)]+)\)\s*$/);
    if (!m) continue;
    const name = m[1].trim();
    const id = m[2].trim();
  // line2: gender (after removing species line, gender will be at index 1)
  const g = lines[1] ? lines[1].toLowerCase() : '';
  const sex = /female/i.test(g) ? 'F' : (/male/i.test(g) ? 'M' : 'F');
  // line3: genetics (after removing species)
  const genLine = lines[2] || '';
    const tokens = genLine.split(',').map(t=>t.trim()).filter(Boolean);
    const morphs = [];
    const hets = [];
    for (const t of tokens) {
      const ma = t.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
      let gene = t;
      let anno = null;
      if (ma) { gene = ma[1].trim(); anno = ma[2].trim().toLowerCase(); }
      if (!anno) {
        morphs.push(gene);
      } else if (/regular/i.test(anno)) {
        morphs.push(gene);
      } else if (/heterozygous66|heterozygous 66|66%|\b66\b/i.test(anno)) {
        hets.push(`66% ${gene}`);
      } else if (/heterozygous50|heterozygous 50|50%|\b50\b/i.test(anno)) {
        hets.push(`50% ${gene}`);
      } else if (/heterozygous|het/i.test(anno)) {
        hets.push(`${gene}`);
      } else if (/\bpos(?:s?i?a?ble)?\b/i.test(anno)) {
        hets.push(`${gene} (possible)`);
      } else {
        hets.push(`${gene} (${anno})`);
      }
    }
    out.push({ name, id, sex, morphs, hets });
  }
  return out;
}

function convertParsedToSnake(p, idConfig = null) {
  // p: { name, id?, sex, morphs, hets, year? }
  const sex = ensureSex(p.sex, 'F');
  // normalize tokens possibly present in morphs/hets/genetics
  const combined = [
    ...(Array.isArray(p.morphs) ? p.morphs : (p.morphs ? [String(p.morphs)] : [])),
    ...(Array.isArray(p.hets) ? p.hets : (p.hets ? [String(p.hets)] : [])),
    ...(Array.isArray(p.genetics) ? p.genetics : (p.genetics ? [String(p.genetics)] : []))
  ];
  const norm = normalizeMorphHetLists(combined);
  const birthDate = normalizeDateInput(p.birthDate || p.hatchDate || p.birthdate || null);
  const birthYear = birthDate ? extractYearFromDateString(birthDate) : null;

  const providedIdRaw = (p.id || '').toString().trim();
  const existingRecordsRaw = Array.isArray(p.__existingRecords) ? p.__existingRecords : null;
  const existingIdsRaw = Array.isArray(p.__existingIds) ? p.__existingIds : [];
  const existingEntries = (existingRecordsRaw && existingRecordsRaw.length)
    ? existingRecordsRaw
        .map(record => {
          if (!record) return null;
          if (typeof record === 'string') {
            const id = record;
            return { id, idSequence: extractSequenceFromId(id, idConfig) };
          }
          const id = record.id != null ? String(record.id) : '';
          if (!id) return null;
          const seqValue = Number(record.idSequence);
          const normalizedSeq = Number.isFinite(seqValue) && seqValue > 0
            ? Math.floor(seqValue)
            : extractSequenceFromId(id, idConfig);
          return { id, idSequence: normalizedSeq };
        })
        .filter(Boolean)
    : existingIdsRaw
        .map(id => String(id))
        .filter(Boolean)
        .map(id => ({ id, idSequence: extractSequenceFromId(id, idConfig) }));
  const existingIdSet = new Set(existingEntries.map(entry => entry.id));

  let yearVal = Number(p.year);
  if (!Number.isFinite(yearVal) || yearVal <= 0) yearVal = new Date().getFullYear();
  let nameForId = p.name || '';
  let hadYear = false;
  if (p.name) {
  const m = String(p.name).trim().match(/^(20\d{2})\b[-\s:/]*(.*)$/);
    if (m) {
      hadYear = true;
      yearVal = Number(m[1]) || yearVal;
      nameForId = (m[2] || '').trim() || nameForId;
    }
  }
  if (Number.isFinite(birthYear)) {
    yearVal = birthYear;
  }

  let resolvedId = '';
  if (providedIdRaw) {
    let candidate = providedIdRaw;
    if (existingIdSet.has(candidate)) {
      let counter = 2;
      while (existingIdSet.has(`${providedIdRaw}-${counter}`)) counter += 1;
      candidate = `${providedIdRaw}-${counter}`;
    }
    resolvedId = candidate;
  }

  const idSource = providedIdRaw || p.name || '';
  const suffixMatch = String(idSource).match(/-(\d+)$/);
  const suffixNum = suffixMatch ? Number(suffixMatch[1]) : null;

  const generatedId = resolvedId || generateSnakeId(
    nameForId || (sex === 'F' ? 'NewFemale' : 'NewMale'),
    yearVal,
    existingEntries,
    suffixNum,
    {
      hadYear,
      originalRawName: String(p.name || ''),
      morphs: norm.morphs,
      hets: norm.hets,
      idConfig,
      sex,
      birthYear,
    }
  );
  const idSequence = extractSequenceFromId(generatedId, idConfig);

  const weightValue = Number(p.weight);
  const weight = Number.isFinite(weightValue) ? weightValue : 0;
  const rawGroups = Array.isArray(p.groups) ? p.groups : splitMultiValueCell(p.groups);
  const groups = rawGroups.map(g => String(g).trim()).filter(Boolean);
  const rawTags = Array.isArray(p.tags) ? p.tags : splitMultiValueCell(p.tags);
  const tags = rawTags.map(t => String(t).trim()).filter(Boolean);
  const status = String(p.status || 'Active').trim() || 'Active';
  const notes = typeof p.notes === 'string' ? p.notes.trim() : '';
  const imageUrl = p.imageUrl ? String(p.imageUrl) : undefined;
  const photos = normalizeSnakePhotos(p.photos);
  const primaryImageUrl = imageUrl || (photos.length ? photos[photos.length - 1].url : undefined);

  return {
    id: generatedId,
    name: (nameForId && nameForId.length) ? nameForId : (p.name || (sex === 'F' ? 'New Female' : 'New Male')),
    sex,
    morphs: norm.morphs,
    hets: norm.hets,
    weight,
    year: yearVal,
    birthDate,
    tags,
    groups,
    status,
    notes,
  imageUrl: primaryImageUrl,
    photos,
    idSequence,
    logs: { feeds:[], weights:[], sheds:[], cleanings:[], meds:[] }
  };
}

const SEQ_PLACEHOLDER = '__SEQ_PLACEHOLDER__';

function escapeRegexSpecial(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function padSequenceNumber(value, padding = 1) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) {
    const fallback = Number.isFinite(num) ? Math.max(1, Math.floor(num) || 1) : 1;
    return String(fallback);
  }
  const str = String(Math.floor(num));
  if (!padding || padding <= 1) return str;
  return str.padStart(padding, '0');
}

function ensureTemplateHasSequence(template) {
  const base = String(template || '').trim();
  if (/\[SEQ\]/i.test(base)) return base;
  if (!base) return DEFAULT_ID_GENERATOR_CONFIG.template;
  if (/(?:-|_|\.|#|\/|\s)$/.test(base)) {
    return `${base}[SEQ]`;
  }
  return `${base}-[SEQ]`;
}

function computeHetSegment(hets = []) {
  const list = Array.isArray(hets) ? hets : [];
  const segments = [];
  for (const h of list) {
    const hh = String(h || '').trim();
    if (!hh) continue;
    const pct = hh.match(/(\d+)%\s*(.*)$/i);
    if (pct) {
      const num = pct[1];
      const gene = (pct[2] || '')
        .replace(/[^A-Za-z]/g, '')
        .slice(0, 3)
        .toLowerCase();
      if (gene) segments.push(`${num}%H${gene}`);
      continue;
    }
  const poss = hh.match(/^(.+?)\s*\(pos(?:s?i?a?ble)?\)$/i);
    let geneName = hh;
    if (poss) geneName = poss[1];
    geneName = geneName.replace(/[^A-Za-z]/g, '').slice(0, 3).toLowerCase();
    if (geneName) segments.push(`H${geneName}`);
  }
  return segments.join('');
}

function sanitizeGeneForAbbreviation(token) {
  return String(token || '')
    .replace(/\bhet\b/gi, '')
    .replace(/\bpos(?:s?i?a?ble)?\b|\bprobable\b|\bmaybe\b|\bph\b/gi, '')
    .replace(/\d{1,3}%/g, '')
    .replace(/[()]/g, ' ')
    .replace(/[^A-Za-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function abbreviateGeneToken(token) {
  const sanitized = sanitizeGeneForAbbreviation(token);
  if (!sanitized) return '';
  const custom = {
    monarch: 'MONA',
    monsoon: 'MONS',
  };
  const key = sanitized.replace(/[^A-Za-z]/g, '').toLowerCase();
  if (custom[key]) return custom[key];
  const words = sanitized
    .split(/\s+/)
    .map(word => word.replace(/[^A-Za-z]/g, ''))
    .filter(Boolean);
  if (!words.length) return '';
  if (words.length >= 2) {
    return words.map(word => word.charAt(0).toUpperCase()).join('');
  }
  const upper = words[0].toUpperCase();
  return upper.length <= 3 ? upper : upper.slice(0, 3);
}

function computeGeneInitialSegment(morphs = [], hets = []) {
  const morphList = Array.isArray(morphs) ? morphs : (morphs ? [morphs] : []);
  const hetList = Array.isArray(hets) ? hets : (hets ? [hets] : []);

  const morphCodes = morphList
    .map(token => abbreviateGeneToken(token))
    .filter(Boolean);

  const hetCodes = hetList
    .map(token => {
      const raw = String(token || '').trim();
      if (!raw) return '';
      const percentMatch = raw.match(/(\d{1,3}%)/);
      const percent = percentMatch ? percentMatch[1] : '';
      const isPossibleHet = /\bpos(?:s?i?a?ble)?\b/i.test(raw) || /\bph\b/i.test(raw) || /\bmaybe\b/i.test(raw) || /\bprobable\b/i.test(raw);
      const geneCode = abbreviateGeneToken(raw);
      if (!geneCode) return '';
      const prefixes = [];
      if (percent) prefixes.push(percent);
      if (isPossibleHet && !prefixes.includes('pos')) {
        prefixes.push('pos');
      }
      return `${prefixes.join('')}h${geneCode}`;
    })
    .filter(Boolean);

  const combined = [...morphCodes, ...hetCodes];
  if (combined.length) return combined.join('');
  return '';
}

function titleCaseWords(value) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function computeIdNameSegments(nameInput = '') {
  const rawName = String(nameInput ?? '');
  const name = rawName.trim();
  const lettersOnly = name.replace(/[^A-Za-z]/g, '');
  const sanitizedAlnum = name.replace(/[^A-Za-z0-9]/g, '');
  const prefixCore = sanitizedAlnum || lettersOnly || 'X';
  const prefixUpper = prefixCore.toUpperCase();
  const prefixLower = prefixCore.toLowerCase();
  const nameTitle = name ? titleCaseWords(name) : prefixUpper;
  const nameUpper = name ? name.toUpperCase() : prefixUpper;
  const nameLower = name ? name.toLowerCase() : prefixLower;
  const words = name.split(/\s+/).filter(Boolean);
  const initials = words.length
    ? words.map(w => w.charAt(0).toUpperCase()).join('')
    : prefixUpper.charAt(0) || 'X';
  const parenMatch = name.match(/^\s*\(([^)]+)\)/);
  let parenChunk = '';
  if (parenMatch) {
    const inside = parenMatch[1].replace(/[^A-Za-z0-9]/g, '');
    if (inside) {
      const base = inside.toUpperCase().slice(0, 3);
      parenChunk = `(${base})`;
    }
  }

  return {
    rawName,
    lettersOnly,
    sanitizedAlnum,
    prefixCore,
    prefixUpper,
    prefixLower,
    nameTitle,
    nameUpper,
    nameLower,
    initials: initials || prefixUpper.charAt(0) || 'X',
    slugLower: sanitizedAlnum ? sanitizedAlnum.toLowerCase() : prefixLower,
    slugUpper: sanitizedAlnum ? sanitizedAlnum.toUpperCase() : prefixUpper,
    parenChunk,
  };
}

function buildIdTemplateContext({ name, rawName, morphs, hets, year, sex, birthYear }) {
  const yearValue = Number(year) || new Date().getFullYear();
  const birthYearValue = Number(birthYear);
  const resolvedBirthYear = Number.isFinite(birthYearValue) && birthYearValue > 0 ? birthYearValue : yearValue;
  const birthYearShort = String(resolvedBirthYear).slice(-2).padStart(2, '0');
  const segments = computeIdNameSegments(name || rawName);
  const geneInitials = computeGeneInitialSegment(morphs, hets);
  return {
    ...segments,
    hetSegment: computeHetSegment(hets),
    yearFull: yearValue,
    yearShort: String(yearValue).slice(-2).padStart(2, '0'),
    birthYearFull: resolvedBirthYear,
    birthYearShort,
    sexCode: String(sex || 'U').trim().charAt(0).toUpperCase() || 'U',
    geneInitials,
  };
}

function buildIdFromTemplateNormalized(config, context, sequenceValue = SEQ_PLACEHOLDER) {
  const template = ensureTemplateHasSequence(config.template);
  const replacements = {
    '[YEAR]': String(context.yearFull),
    '[YR]': context.yearShort,
    '[YEAROB]': String(context.birthYearFull ?? context.yearFull),
    '[YROB]': context.birthYearShort ?? context.yearShort,
    '[PREFIX]': context.prefixCore,
    '[PREFIXU]': context.prefixUpper,
    '[PREFIXL]': context.prefixLower,
    '[NAME]': context.nameTitle,
    '[NAMEU]': context.nameUpper,
    '[NAMEL]': context.nameLower,
    '[INITIALS]': context.initials,
    '[SLUG]': context.slugLower,
    '[SLUGU]': context.slugUpper,
    '[PAREN]': context.parenChunk,
    '[HETS]': context.hetSegment,
    '[SEX]': context.sexCode,
    '[TEXT]': config.customText || '',
    '[GEN3]': context.geneInitials || '',
    '[-]': '-',
  };

  let output = template;
  for (const [token, value] of Object.entries(replacements)) {
    output = output.replace(new RegExp(escapeRegexSpecial(token), 'g'), value);
  }

  let sequenceString;
  if (sequenceValue === SEQ_PLACEHOLDER) {
    sequenceString = SEQ_PLACEHOLDER;
  } else if (Number.isFinite(Number(sequenceValue))) {
    sequenceString = padSequenceNumber(sequenceValue, config.sequencePadding);
  } else {
    sequenceString = String(sequenceValue || '');
  }
  output = output.replace(/\[SEQ\]/gi, sequenceString);

  if (config.uppercase) {
    output = output.toUpperCase();
  }

  return output.trim();
}

function buildSequenceRegexFromTemplate(template) {
  const ensured = ensureTemplateHasSequence(template);
  const tokenRegex = /\[([A-Z0-9-]+)\]/gi;
  let lastIndex = 0;
  const parts = [];
  let match;
  let seqCaptured = false;
  while ((match = tokenRegex.exec(ensured)) !== null) {
    const staticChunk = ensured.slice(lastIndex, match.index);
    if (staticChunk) {
      parts.push(escapeRegexSpecial(staticChunk));
    }
    const tokenName = (match[1] || '').toUpperCase();
    if (tokenName === 'SEQ') {
      if (!seqCaptured) {
        parts.push('(\\d+)');
        seqCaptured = true;
      } else {
        parts.push('(?:\\d+)');
      }
    } else if (tokenName === '-') {
      parts.push('(?:-)');
    } else {
      parts.push('(?:.*?)');
    }
    lastIndex = match.index + match[0].length;
  }
  const trailing = ensured.slice(lastIndex);
  if (trailing) {
    parts.push(escapeRegexSpecial(trailing));
  }
  return new RegExp(`^${parts.join('')}$`, 'i');
}

function extractSequenceFromId(id, idConfig = null) {
  if (!id) return null;
  const normalizedConfig = normalizeIdGeneratorConfig(idConfig);
  if (!normalizedConfig?.template) return null;
  const pattern = buildSequenceRegexFromTemplate(normalizedConfig.template);
  const match = String(id).match(pattern);
  if (!match || match.length < 2) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

// Generate snake id using configurable template rules
function generateSnakeId(name, year, existingSnakesOrIds = [], preferredNumber = null, opts = {}) {
  const {
    hadYear = false,
    originalRawName = '',
    morphs = [],
    hets = [],
    idConfig = null,
    sex = 'U',
    birthYear = null,
    forceSequence = null,
  } = opts || {};
  const normalizedConfig = normalizeIdGeneratorConfig(idConfig);

  const existingEntries = Array.isArray(existingSnakesOrIds)
    ? existingSnakesOrIds
        .map(item => {
          if (!item) return null;
          if (typeof item === 'string') {
            const id = item;
            return { id, idSequence: extractSequenceFromId(id, normalizedConfig) };
          }
          if (typeof item === 'object') {
            if (item.id || item.id === '') {
              const rawId = item.id;
              const id = typeof rawId === 'string' ? rawId : (rawId != null ? String(rawId) : '');
              if (!id) return null;
              const seqValue = Number(item.idSequence);
              const normalizedSeq = Number.isFinite(seqValue) && seqValue > 0
                ? Math.floor(seqValue)
                : extractSequenceFromId(id, normalizedConfig);
              return { id, idSequence: normalizedSeq };
            }
            const fallback = String(item);
            if (!fallback) return null;
            return { id: fallback, idSequence: extractSequenceFromId(fallback, normalizedConfig) };
          }
          const fallback = String(item);
          if (!fallback) return null;
          return { id: fallback, idSequence: extractSequenceFromId(fallback, normalizedConfig) };
        })
        .filter(entry => entry && entry.id)
    : [];

  const existingIds = existingEntries.map(entry => entry.id).filter(Boolean);
  const existingIdsLower = existingIds.map(id => id.toLowerCase());
  const existingIdSetLower = new Set(existingIdsLower);
  const existingUniqueCount = existingIdSetLower.size;
  const reservedSequences = new Set();
  existingEntries.forEach(entry => {
    const value = Number(entry.idSequence);
    if (Number.isFinite(value) && value > 0) {
      reservedSequences.add(Math.floor(value));
    }
  });

  const effectiveYear = Number(year) || new Date().getFullYear();
  const baseName = (name && String(name).trim())
    || (originalRawName && String(originalRawName).trim())
    || (sex === 'M' ? 'New Male' : 'New Female');

  const context = buildIdTemplateContext({
    name: baseName,
    rawName: hadYear ? originalRawName : name,
    morphs,
    hets,
    year: effectiveYear,
    sex,
    birthYear: birthYear ?? effectiveYear,
  });

  const buildCandidate = (num) => buildIdFromTemplateNormalized(normalizedConfig, context, num);
  const sequencePattern = buildSequenceRegexFromTemplate(normalizedConfig.template);

  for (const id of existingIds) {
    if (!id || typeof id !== 'string') continue;
    const match = id.match(sequencePattern);
    if (!match) continue;
    const value = Number(match[1]);
    if (Number.isFinite(value) && value > 0) {
      reservedSequences.add(Math.floor(value));
    }
  }

  const tryForcedSequence = Number(forceSequence);
  if (Number.isFinite(tryForcedSequence) && tryForcedSequence > 0) {
    const forced = Math.floor(tryForcedSequence);
    const candidate = buildCandidate(forced);
    if (!existingIdSetLower.has(candidate.toLowerCase())) {
      return candidate;
    }
  }

  let nextSequence = Math.max(1, existingUniqueCount + 1);
  while (reservedSequences.has(nextSequence)) {
    nextSequence += 1;
  }
  if (preferredNumber != null) {
    // Manual overrides are ignored to guarantee strictly increasing sequence values.
  }
  let candidate = buildCandidate(nextSequence);
  while (existingIdSetLower.has(candidate.toLowerCase())) {
    nextSequence += 1;
    while (reservedSequences.has(nextSequence)) {
      nextSequence += 1;
    }
    candidate = buildCandidate(nextSequence);
  }

  return candidate;
}

// Normalize a list of tokens into morphs (visuals) and hets (including % and possible)
function normalizeMorphHetLists(tokens) {
  const arr = Array.isArray(tokens) ? tokens.slice() : (tokens ? String(tokens).split(/[,/]/).map(s=>s.trim()).filter(Boolean) : []);
  const morphs = [];
  const hets = [];
  for (let t of arr) {
    if (!t) continue;
    const raw = String(t).trim();
    const low = raw.toLowerCase();
    // if token explicitly marks Regular in parentheses, treat as a morph and remove the annotation
    if (/\([^)]*\bregular\b[^)]*\)/i.test(raw)) {
      const gene = raw.replace(/\([^)]*\bregular\b[^)]*\)/i, '').replace(/[()]/g,'').trim();
      morphs.push(cap(gene));
      continue;
    }
    // detect percentage hets (e.g., '50% clown' or 'clown (heterozygous50)')
    const pctMatch = raw.match(/(\d+)%/);
    if (pctMatch) {
      const pct = pctMatch[1];
      // remove pct and het-like words to get gene name
      let gene = raw.replace(/(\d+)%/,'').replace(/\bheterozygous\b/ig,'').replace(/\bhet\b/ig,'').replace(/[()]/g,'').trim();
      gene = cap(gene) || gene;
      hets.push(`${pct}% ${gene}`);
      continue;
    }
    // 'possible' annotation
    if (/\bpos(?:s?i?a?ble)?\b/i.test(low)) {
      const gene = raw.replace(/\bpos(?:s?i?a?ble)?\b/ig,'').replace(/[()]/g,'').trim();
      hets.push(`${cap(gene)} (possible)`);
      continue;
    }
    // explicit het words
    if (/\bheterozygous\b|\bhet\b/i.test(low)) {
      const gene = raw.replace(/\bheterozygous\b/ig,'').replace(/\bhet\b/ig,'').replace(/[()]/g,'').trim();
      hets.push(cap(gene));
      continue;
    }
    // otherwise treat as morph (visual)
    morphs.push(cap(raw));
  }
  const normalizedMorphs = uniqueGeneTokens(morphs.map(m => String(m).trim()).filter(Boolean));
  const normalizedHets = uniqueGeneTokens(
    hets
      .map(h => formatHetForDisplay(h))
      .filter(Boolean)
  );
  return {
    morphs: normalizedMorphs,
    hets: normalizedHets
  };
}

function formatParsedPreview(p) {
  // p: { name, id, sex, morphs, hets }
  const name = p.name || '';
  const id = p.id || '';
  const gender = p.sex === 'M' ? 'Male' : (p.sex === 'F' ? 'Female' : 'Unknown');
  const geneticsTokens = combineMorphsAndHetsForDisplay(p.morphs, p.hets);
  const genetics = geneticsTokens.length ? geneticsTokens.join(', ') : '-';

  return `Name - ${name}\nID - ${id}\nGender - ${gender}\nGenetics - ${genetics}`;
}

/**
 * Parse a single-line snake description:
 * Name (ID) Ball Python (Python regius) Gender Trait1, Trait2 (Tag), ...
 * Returns { name, id, gender, genetics: [] }
 */
function parseOneLineSnake(line) {
  if (!line || typeof line !== 'string') return null;
  const input = line.trim();

  // extract Name (ID)
  const nameIdMatch = input.match(/^\s*(.*?)\s*\(([^)]+)\)\s*/);
  if (!nameIdMatch) return null;
  const name = nameIdMatch[1].trim();
  const id = nameIdMatch[2].trim();

  let rest = input.slice(nameIdMatch[0].length).trim();
  // remove species phrase if present
  rest = rest.replace(/Ball Python\s*\(Python regius\)/i, '').trim();

  // extract gender
  const genderMatch = rest.match(/^(Female|Male|Unknown)\b/i);
  const gender = genderMatch ? (genderMatch[1][0].toUpperCase() + genderMatch[1].slice(1).toLowerCase()) : 'Unknown';
  let geneticsPart = genderMatch ? rest.slice(genderMatch[0].length).trim() : rest;
  geneticsPart = geneticsPart.replace(/^[-\s:]+/, '').trim();

  if (!geneticsPart) return { name, id, gender, genetics: [] };

  const tokens = geneticsPart.split(',').map(t=>t.trim()).filter(Boolean);
  const genetics = tokens.map(token => {
    const m = token.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
    const gene = m ? m[1].trim() : token;
    const tag = m ? m[2].trim().toLowerCase() : null;
    if (!tag) return gene;
    if (/^regular$/i.test(tag)) return gene;
    if (/heterozygous66|heterozygous 66|66%|^66$/i.test(tag)) return `66% ${gene}`;
    if (/heterozygous50|heterozygous 50|50%|^50$/i.test(tag)) return `50% ${gene}`;
    if (/heterozygous|^het$/i.test(tag)) return `${gene}`;
    if (/\bpos(?:s?i?a?ble)?\b/i.test(tag)) return `Possible het ${gene}`;
    return `het ${gene}`;
  });

  return { name, id, gender, genetics };
}

// Parse lines like: "name | gender | genetics" or "lady D | Female | Normal"
function normalizeTraitToken(token) {
  const t = (token || '').trim();
  const ma = t.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  const gene = ma ? ma[1].trim() : t;
  const tag = ma ? ma[2].trim().toLowerCase() : null;
  if (!tag) return gene;
  if (/^regular$/i.test(tag)) return gene;
  if (/heterozygous66|66%|^66$/i.test(tag)) return `66% het ${gene}`;
  if (/heterozygous50|50%|^50$/i.test(tag)) return `50% het ${gene}`;
  if (/heterozygous|^het$/i.test(tag)) return `het ${gene}`;
  if (/\bpos(?:s?i?a?ble)?\b/i.test(tag)) return `Possible het ${gene}`;
  return `het ${gene}`;
}

function parsePipeSeparatedLines(raw) {
  if (!raw) return [];
  const lines = raw.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
  const out = [];
  for (const line of lines) {
    // expect at least two pipes: name | gender | genetics
    if (!/\|/.test(line)) continue;
    const parts = line.split('|').map(p=>p.trim()).filter(Boolean);
    if (parts.length < 2) continue;
    const name = parts[0];
    const gender = parts[1].match(/female/i) ? 'F' : (parts[1].match(/male/i) ? 'M' : 'Unknown');
    const geneticsPart = parts.slice(2).join(', ');
    const tokens = geneticsPart ? geneticsPart.split(',').map(t=>t.trim()).filter(Boolean) : [];
    const genetics = tokens.map(normalizeTraitToken);
    out.push({ name, sex: gender, morphs: genetics.filter(g=>!/^het\b|^66%|^50%|^possible/i.test(g)), hets: genetics.filter(g=>/^het\b|^66%|^50%|^Possible/i.test(g)) });
  }
  return out;
}

// Simple CSV parser that returns rows (array of cells). Handles quoted fields.
function parseCsvToRows(csvText) {
  const rows = [];
  let i = 0;
  const len = csvText.length;
  let cur = '';
  let row = [];
  let inQuotes = false;
  while (i < len) {
    const ch = csvText[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i+1 < len && csvText[i+1] === '"') { cur += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      cur += ch; i++; continue;
    }
    if (ch === '"') { inQuotes = true; i++; continue; }
    if (ch === ',') { row.push(cur); cur = ''; i++; continue; }
    if (ch === '\r') { i++; continue; }
    if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; i++; continue; }
    cur += ch; i++;
  }
  // push last
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

function normalizeHeaderLabel(label) {
  return String(label || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function detectHeaderKey(label) {
  const normalized = normalizeHeaderLabel(label);
  if (!normalized) return null;
  if (/^name$|^animal name$|^snake name$/.test(normalized)) return 'name';
  if (/^id$|^animal id$|^snake id$|^identifier$/.test(normalized)) return 'id';
  if (/(^|\s)(sex|gender)(\s|$)/.test(normalized)) return 'sex';
  if (/(^|\s)(morph|visual|combo)(s)?(\s|$)/.test(normalized)) return 'morphs';
  if (/(^|\s)(het|hetero)(s)?(\s|$)/.test(normalized)) return 'hets';
  if (/(^|\s)(genetic|gene|traits?)(s)?(\s|$)/.test(normalized)) return 'genetics';
  if (/(^|\s)(group|collection|category|rack)(s)?(\s|$)/.test(normalized)) return 'groups';
  if (/(^|\s)(tag|keyword)(s)?(\s|$)/.test(normalized)) return 'tags';
  if (/(^|\s)(birth|hatch|dob)(\s|$)/.test(normalized)) return 'birthDate';
  if (/^year$|^birth year$|^hatch year$/.test(normalized)) return 'year';
  if (/(^|\s)weight(\s|$)|(^|\s)grams?(\s|$)/.test(normalized)) return 'weight';
  if (/(^|\s)status(\s|$)/.test(normalized)) return 'status';
  if (/(^|\s)notes?(\s|$)|(^|\s)comments?(\s|$)/.test(normalized)) return 'notes';
  return null;
}

function splitMultiValueCell(value) {
  if (value === null || value === undefined) return [];
  return String(value)
    .split(/[;|,/\n]/)
    .map(v => v.trim())
    .filter(Boolean);
}

function normalizeSingleGroupValue(raw) {
  if (!raw && raw !== 0) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  for (const entry of list) {
    if (entry === null || typeof entry === 'undefined') continue;
    const trimmed = String(entry).trim();
    if (trimmed) return [trimmed];
  }
  return [];
}

function normalizeDateInput(value) {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parsed = new Date(trimmed);
  if (isNaN(parsed.getTime())) return null;
  return localYMD(parsed);
}

function buildHeaderIndex(headerRow = []) {
  const index = {};
  headerRow.forEach((cell, idx) => {
    const key = detectHeaderKey(cell);
    if (!key) return;
    if (!index[key]) index[key] = [];
    index[key].push(idx);
  });
  return { index, hasHeader: Object.keys(index).length > 0 };
}

function getHeaderValues(row = [], headerIndex = {}, key) {
  const positions = headerIndex[key];
  if (!positions || !positions.length) return [];
  return positions.map(pos => (row[pos] || '').toString()).filter(Boolean);
}

// Add Animal modal form
function AddAnimalWizard({ newAnimal, setNewAnimal, groups, setGroups, onCancel, onAdd, theme='blue' }) {
  const canSubmit = Boolean(newAnimal.name && newAnimal.name.trim().length);
  const selectedGroup = (Array.isArray(newAnimal.groups) && newAnimal.groups.length ? newAnimal.groups[0] : '') || '';

  return (
    <div className="p-4">
      <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm max-h-[68vh] overflow-auto">
            <div>
              <label className="text-xs font-medium">Name</label>
              <input className="mt-1 w-full border rounded-xl px-2 py-1 text-sm" value={newAnimal.name} onChange={e=>setNewAnimal(a=>({...a,name:e.target.value}))} placeholder="e.g., Athena" />
            </div>
            <div>
              <label className="text-xs font-medium">ID</label>
              <input
                className="mt-1 w-full border rounded-xl px-2 py-1 text-sm font-mono"
                value={newAnimal.id || ''}
                onChange={e => {
                  const value = e.target.value;
                  setNewAnimal(a => ({ ...a, id: value, autoId: false }));
                }}
                placeholder="Optional: custom ID (e.g., 25Ath-2)"
              />
              <div className="mt-1 text-[11px] text-neutral-500">If you leave this blank an ID will be generated. If the ID you enter already exists a suffix will be appended to make it unique.</div>
            </div>
            <div>
              <label className="text-xs font-medium">Sex</label>
              <select className="mt-1 w-full border rounded-xl px-2 py-1 bg-white text-sm" value={newAnimal.sex} onChange={e=>setNewAnimal(a=>({...a,sex:e.target.value}))}>
                <option value="F">Female</option>
                <option value="M">Male</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-medium">Genetics (morphs &amp; hets)</label>
              <input
                className="mt-1 w-full border rounded-xl px-2 py-1 text-sm"
                value={newAnimal.morphHetInput || ''}
                onChange={e=>{
                  const value = e.target.value;
                  const { morphs, hets } = splitMorphHetInput(value);
                  setNewAnimal(a=>({ ...a, morphHetInput: value, morphs, hets }));
                }}
                placeholder="Clown, Pastel, Het Hypo"
              />
              <div className="mt-1 text-[11px] text-neutral-500">
                Separate traits with commas. Prefix recessive traits with “Het”, “Possible”, or a percentage to tag them automatically.
              </div>
            </div>
            <div>
              <label className="text-xs font-medium">Weight (g)</label>
              <input type="number" className="mt-1 w-full border rounded-xl px-2 py-1 text-sm" value={newAnimal.weight} onChange={e=>setNewAnimal(a=>({...a,weight:e.target.value}))} placeholder="0" />
            </div>
            <div>
              <label className="text-xs font-medium">Year</label>
              <input type="number" className="mt-1 w-full border rounded-xl px-2 py-1 text-sm" value={newAnimal.year} onChange={e=>setNewAnimal(a=>({...a,year:e.target.value}))} placeholder="2025" />
            </div>
            <div>
              <label className="text-xs font-medium">Birth date</label>
              <input
                type="date"
                className="mt-1 w-full border rounded-xl px-2 py-1 text-sm"
                value={newAnimal.birthDate || ''}
                onChange={e => {
                  const raw = e.target.value;
                  setNewAnimal(prev => {
                    const normalized = raw ? normalizeDateInput(raw) || raw : '';
                    const birthYear = extractYearFromDateString(normalized || raw);
                    const next = { ...prev, birthDate: normalized };
                    if (birthYear) {
                      next.year = String(birthYear);
                    } else if (!normalized) {
                      next.birthDate = '';
                    }
                    return next;
                  });
                }}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-medium">Group</label>
              {groups.length ? (
                <select
                  className="mt-1 w-full border rounded-xl px-2 py-2 text-sm bg-white"
                  value={selectedGroup}
                  onChange={e => {
                    const value = e.target.value.trim();
                    setNewAnimal(a => ({
                      ...a,
                      groups: value ? [value] : [],
                    }));
                  }}
                >
                  <option value="">No group</option>
                  {groups.map(g => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              ) : (
                <div className="mt-1 text-xs text-neutral-500">No groups yet. Add one below.</div>
              )}
              <div className="mt-3 border border-dashed border-neutral-200 rounded-xl p-3 bg-white">
                <AddGroupInline onAdd={(g)=>{
                  if (!g) return;
                  setGroups(prev => prev.includes(g) ? prev : [...prev, g]);
                  setNewAnimal(a => ({ ...a, groups: [g] }));
                }} />
              </div>
            </div>
      </div>

      <div className="p-4 border-t flex items-center justify-between">
        <div className="text-xs text-neutral-500">Data is local only in this demo.</div>
        <div className="flex gap-2">
          <button className="px-3 py-2 rounded-xl text-sm border" onClick={onCancel}>Cancel</button>
          <button className={cx('px-3 py-2 rounded-xl text-sm text-white', canSubmit ? primaryBtnClass(theme,true) : primaryBtnClass(theme,false))} disabled={!canSubmit} onClick={onAdd}>
            Add animal
          </button>
        </div>
      </div>
    </div>
  );
}

export default function BreedingPlannerApp() {
  // logs helpers are defined at module scope (updateLog, LogsEditor)
  // component state
  const [snakes, setSnakes] = useState(createFreshSnakes);
  const [pairings, setPairings] = useState(createFreshPairings);
  const [tab, setTab] = useState('animals');
  const [pairingsView, setPairingsView] = useState('active');
  const [completedYearFilter, setCompletedYearFilter] = useState('All');
  const [animalView, setAnimalView] = useState('all');
  const [query, setQuery] = useState('');
  const tag = 'all';
  const [groupFilter, setGroupFilter] = useState('all');
  const [showGroups, setShowGroups] = useState([]);
  const [hiddenGroups, setHiddenGroups] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [groups, setGroups] = useState(() => [...DEFAULT_GROUPS]);
  const [theme, setTheme] = useState('blue');
  const [breederInfo, setBreederInfo] = useState(() => {
    const stored = loadStoredJson(STORAGE_KEYS.breeder, null);
    return normalizeBreederInfo(stored);
  });
  const [backupSettings, setBackupSettings] = useState(() => normalizeBackupSettings(loadStoredJson(STORAGE_KEYS.backupSettings, null)));
  const [autoBackupSnapshot, setAutoBackupSnapshot] = useState(() => normalizeBackupSnapshot(loadStoredJson(STORAGE_KEYS.backupSnapshot, null)));
  const [backupVault, setBackupVault] = useState(() => normalizeBackupVault(loadStoredJson(STORAGE_KEYS.backupVault, [])));
  const [animalExportFields, setAnimalExportFields] = useState(() => [...DEFAULT_ANIMAL_EXPORT_FIELDS]);
  const [pairingExportFields, setPairingExportFields] = useState(() => [...DEFAULT_PAIRING_EXPORT_FIELDS]);
  const [exportFeedback, setExportFeedback] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newAnimal, setNewAnimal] = useState(createEmptyNewAnimalDraft);
  const [importText, setImportText] = useState("");
  const [importPreview, setImportPreview] = useState([]);
  const [showImportModal, setShowImportModal] = useState(false);
  const [returnToGroupsAfterEdit, setReturnToGroupsAfterEdit] = useState(false);
  const [showUnassigned, setShowUnassigned] = useState(true);
  const [pairingGuard, setPairingGuard] = useState(null);

  // last feed defaults (persisted) - store feed/form/size/etc but not grams
  const [lastFeedDefaults, setLastFeedDefaults] = useState(() => {
    return loadStoredJson(STORAGE_KEYS.lastFeedDefaults, { feed: 'Mouse', size: 'pinky', sizeDetail: '', form: 'Frozen/thawed', formDetail: '', notes: '' });
  });
  useEffect(() => { saveStoredJson(STORAGE_KEYS.lastFeedDefaults, lastFeedDefaults); }, [lastFeedDefaults]);

  useEffect(() => { saveStoredJson(STORAGE_KEYS.breeder, normalizeBreederInfo(breederInfo)); }, [breederInfo]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const customLogo = typeof breederInfo?.logoUrl === 'string' ? breederInfo.logoUrl.trim() : '';
    const desiredHref = customLogo || DEFAULT_FAVICON_HREF;
    const existingLink = document.querySelector("link[rel='icon']") || document.querySelector("link[rel='shortcut icon']");
    let link = existingLink;
    if (!link) {
      link = document.createElement('link');
      link.setAttribute('rel', 'icon');
      document.head.appendChild(link);
    }
    if (link.getAttribute('href') !== desiredHref) {
      link.setAttribute('href', desiredHref);
    }
    if (customLogo) {
      const dataMatch = customLogo.match(/^data:(image\/[^;]+);/i);
      if (dataMatch && dataMatch[1]) {
        link.setAttribute('type', dataMatch[1]);
      } else {
        link.removeAttribute('type');
      }
      link.removeAttribute('sizes');
    } else {
      link.setAttribute('type', 'image/png');
      link.setAttribute('sizes', '512x512');
    }
  }, [breederInfo?.logoUrl]);

  useEffect(() => {
    saveStoredJson(STORAGE_KEYS.backupSettings, backupSettings);
  }, [backupSettings]);

  useEffect(() => {
    if (!autoBackupSnapshot) {
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.removeItem(STORAGE_KEYS.backupSnapshot);
        } catch (err) {
          console.warn('Failed to clear backup snapshot', err);
        }
      }
      return;
    }
    saveStoredJson(STORAGE_KEYS.backupSnapshot, autoBackupSnapshot);
  }, [autoBackupSnapshot]);

  useEffect(() => {
    saveStoredJson(STORAGE_KEYS.backupVault, backupVault);
  }, [backupVault]);

  useEffect(() => {
    const limit = normalizeBackupSettings(backupSettings).maxVaultEntries;
    if (typeof limit !== 'number' || limit <= 0) return;
    setBackupVault(prev => {
      if (!Array.isArray(prev)) return [];
      if (prev.length <= limit) return prev;
      return prev.slice(0, limit);
    });
  }, [backupSettings, setBackupVault]);

  const updateBackupSettings = useCallback((patch) => {
    setBackupSettings(prev => normalizeBackupSettings({ ...(prev || {}), ...(patch || {}) }));
  }, []);

  const createBackupPayload = useCallback(() => ({
    version: 1,
    generatedAt: new Date().toISOString(),
    snakes,
    pairings,
    groups,
    breederInfo: normalizeBreederInfo(breederInfo),
    theme,
    lastFeedDefaults,
  }), [snakes, pairings, groups, breederInfo, theme, lastFeedDefaults]);

  const addBackupVaultEntry = useCallback((payload, meta = {}) => {
    if (!payload || typeof payload !== 'object') return null;
    const source = meta.source === 'auto' ? 'auto' : 'manual';
    const createdAt = typeof meta.savedAt === 'string' && meta.savedAt ? meta.savedAt : new Date().toISOString();
    const name = typeof meta.name === 'string' && meta.name.trim()
      ? meta.name.trim()
      : `${source === 'auto' ? 'Auto' : 'Manual'} backup • ${formatDateTimeForDisplay(createdAt)}`;
    const entry = normalizeBackupFileEntry({
      id: typeof meta.id === 'string' && meta.id.trim() ? meta.id.trim() : uid(source === 'auto' ? 'auto-backup' : 'manual-backup'),
      name,
      createdAt,
      updatedAt: createdAt,
      source,
      payload,
    });
    if (!entry) return null;
    const { maxVaultEntries: limit } = normalizeBackupSettings(backupSettings);
    setBackupVault(prev => {
      const prior = Array.isArray(prev) ? prev : [];
      const withoutDupe = prior.filter(existing => existing.id !== entry.id);
      const next = [entry, ...withoutDupe];
      next.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      if (typeof limit === 'number' && limit > 0) {
        return next.slice(0, limit);
      }
      return next;
    });
    return entry;
  }, [setBackupVault, backupSettings]);

  const renameBackupVaultEntry = useCallback((id, nextName) => {
    const trimmed = typeof nextName === 'string' ? nextName.trim() : '';
    if (!trimmed) return;
    const updatedAt = new Date().toISOString();
    setBackupVault(prev => {
      const list = Array.isArray(prev) ? prev : [];
      return list.map(entry => entry.id === id ? { ...entry, name: trimmed, updatedAt } : entry);
    });
  }, [setBackupVault]);

  const deleteBackupVaultEntry = useCallback((id) => {
    setBackupVault(prev => (Array.isArray(prev) ? prev.filter(entry => entry.id !== id) : []));
  }, [setBackupVault]);

  const runAutoBackup = useCallback(() => {
    let payload;
    try {
      payload = createBackupPayload();
    } catch (err) {
      console.error('Failed to build backup payload', err);
      return;
    }
    let snapshotPayload;
    try {
      snapshotPayload = JSON.parse(JSON.stringify(payload));
    } catch (err) {
      console.error('Failed to serialize auto backup payload', err);
      return;
    }
    const savedAt = new Date().toISOString();
    setAutoBackupSnapshot({ savedAt, payload: snapshotPayload });
    setBackupSettings(prev => normalizeBackupSettings({ ...(prev || {}), lastRun: savedAt }));
    addBackupVaultEntry(snapshotPayload, {
      source: 'auto',
      savedAt,
      name: `Auto backup • ${formatDateTimeForDisplay(savedAt)}`,
    });
  }, [createBackupPayload, addBackupVaultEntry, setBackupSettings]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const intervalMs = backupFrequencyToMs(backupSettings.frequency);
    if (!intervalMs) return;

    let cancelled = false;
    const maybeRun = () => {
      if (cancelled) return;
      const lastRunTime = backupSettings.lastRun ? new Date(backupSettings.lastRun).getTime() : 0;
      if (!lastRunTime || Number.isNaN(lastRunTime) || (Date.now() - lastRunTime) >= intervalMs) {
        runAutoBackup();
      }
    };

    maybeRun();
    const id = window.setInterval(maybeRun, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [backupSettings.frequency, backupSettings.lastRun, runAutoBackup]);

  const handleRestoreBackup = useCallback((payload) => {
    if (!payload || typeof payload !== 'object') {
      throw new Error('Backup file is empty or invalid.');
    }
    const nextSnakesRaw = Array.isArray(payload.snakes) ? payload.snakes : [];
    const nextSnakes = nextSnakesRaw.map(sanitizeSnakeRecord).filter(Boolean);
    const nextPairingsRaw = Array.isArray(payload.pairings) ? payload.pairings : [];
    const nextPairings = nextPairingsRaw.map(sanitizePairingRecord).filter(Boolean);
    const nextGroups = Array.isArray(payload.groups)
      ? payload.groups.map(g => String(g || '').trim()).filter(Boolean)
      : [];
    const nextBreeder = normalizeBreederInfo(payload.breederInfo || payload.breeder);
    const themeOptions = ['blue', 'green', 'dark'];
    const nextTheme = typeof payload.theme === 'string' && themeOptions.includes(payload.theme)
      ? payload.theme
      : null;
    const nextFeedDefaults = payload.lastFeedDefaults && typeof payload.lastFeedDefaults === 'object'
      ? { ...payload.lastFeedDefaults }
      : null;

    setSnakes(nextSnakes);
    setPairings(nextPairings);
    setGroups(nextGroups);
    setBreederInfo(nextBreeder);
    if (nextTheme) {
      setTheme(nextTheme);
    }
    if (nextFeedDefaults) {
      setLastFeedDefaults(nextFeedDefaults);
    }
    setAutoBackupSnapshot(null);
    setBackupSettings(prev => normalizeBackupSettings({ ...(prev || {}), lastRun: null }));
  }, [setSnakes, setPairings, setGroups, setBreederInfo, setTheme, setLastFeedDefaults, setAutoBackupSnapshot, setBackupSettings]);

  useEffect(() => {
    try {
      const storedView = window.localStorage.getItem(PENDING_ANIMAL_VIEW_KEY);
  if (storedView && (storedView === 'all' || storedView === 'males' || storedView === 'females' || storedView === 'groups')) {
        setAnimalView(storedView);
      }
    } catch (err) {
      console.warn('Failed to restore pending animal view', err);
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(PENDING_ANIMAL_VIEW_KEY, animalView);
    } catch (err) {
      console.warn('Failed to persist animal view', err);
    }
  }, [animalView]);

  useEffect(() => {
    if (pairingsView !== 'completed' && completedYearFilter !== 'All') {
      setCompletedYearFilter('All');
    }
  }, [pairingsView, completedYearFilter]);

  useEffect(() => {
    if (!showAddModal) return;
    setNewAnimal(prev => {
      if (!prev) return prev;
      const hasManualId = prev.autoId === false && String(prev.id || '').trim().length > 0;
      if (hasManualId) return prev;
      const sex = ensureSex(prev.sex, 'F');
      const parsed = splitMorphHetInput(prev.morphHetInput || '');
      const morphs = Array.isArray(prev.morphs) && prev.morphs.length ? prev.morphs : parsed.morphs;
      const hets = Array.isArray(prev.hets) && prev.hets.length ? prev.hets : parsed.hets;
      const birthYear = extractYearFromDateString(prev.birthDate);
      const numericYear = Number(prev.year);
      const fallbackYear = Number.isFinite(numericYear) && numericYear > 0 ? numericYear : new Date().getFullYear();
      const derivedYear = birthYear ?? fallbackYear;
      const generatedId = generateSnakeId(
        prev.name,
        derivedYear,
        snakes,
        null,
        {
          idConfig: breederInfo?.idGenerator,
          sex,
          morphs,
          hets,
          birthYear,
        }
      );
      const desiredYearString = birthYear ? String(birthYear) : prev.year;
      const generatedSequence = extractSequenceFromId(generatedId, breederInfo?.idGenerator);
      if ((prev.id || '') === generatedId && prev.year === desiredYearString && prev.autoId === true && prev.idSequence === generatedSequence) {
        return prev;
      }
      return { ...prev, id: generatedId, year: desiredYearString, autoId: true, idSequence: generatedSequence };
    });
  }, [
    showAddModal,
    snakes,
    breederInfo,
    newAnimal.name,
    newAnimal.sex,
    newAnimal.morphHetInput,
    newAnimal.morphs,
    newAnimal.hets,
    newAnimal.year,
    newAnimal.birthDate,
    newAnimal.autoId,
    newAnimal.idSequence,
  ]);

  const handleAnimalViewTabChange = useCallback((nextView) => {
    if (!nextView || nextView === animalView) return;
    setAnimalView(nextView);
  }, [animalView]);

  // pairing modal
  const [showPairingModal, setShowPairingModal] = useState(false);
  const [draft, setDraft] = useState({
    maleId:"", femaleId:"", goals:[], notes:"",
    startDate: localYMD(new Date())
  });

  // inline pairing focus
  const [focusedPairingId, setFocusedPairingId] = useState(null);

  // edit snake
  const [editSnake, setEditSnake] = useState(null);
  const [editSnakeDraft, setEditSnakeDraft] = useState(null);
  const [qrFor, setQrFor] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [pendingDeleteSnake, setPendingDeleteSnake] = useState(null);
  const [hatchWizard, setHatchWizard] = useState(null);
  const [photoGallerySnakeId, setPhotoGallerySnakeId] = useState(null);
  const editCameraInputRef = useRef(null);
  const editUploadInputRef = useRef(null);
  const [editUploadingPhoto, setEditUploadingPhoto] = useState(false);

  useEffect(() => {
    setSnakes(prev => {
      let changed = false;
      const next = prev.map(s => {
        const normalized = normalizeSexValue(s?.sex);
        if (!s || normalized === 'UNKNOWN' || s.sex === normalized) return s;
        changed = true;
        return { ...s, sex: normalized };
      });
      return changed ? next : prev;
    });
  }, []);

  useEffect(() => {
    if (!photoGallerySnakeId) return;
    if (!snakes.some(s => s.id === photoGallerySnakeId)) {
      setPhotoGallerySnakeId(null);
    }
  }, [photoGallerySnakeId, snakes]);

  const females = useMemo(() => snakes.filter(isFemaleSnake), [snakes]);
  const males   = useMemo(() => snakes.filter(isMaleSnake), [snakes]);

  const pairingsPartition = useMemo(() => {
    const active = [];
    const completed = [];
    pairings.forEach(p => {
      if (isPairingCompleted(p)) {
        completed.push(p);
      } else {
        active.push(p);
      }
    });
    return { active, completed };
  }, [pairings]);

  const activePairings = pairingsPartition.active;
  const completedPairings = pairingsPartition.completed;
  const activePairingsCount = activePairings.length;
  const completedPairingsCount = completedPairings.length;
  const completedPairingsWithYear = useMemo(() => {
    return completedPairings.map(pairing => {
      const normalized = withPairingLifecycleDefaults({ ...pairing });
      const derived = getBreedingCycleDerived(normalized);
      const yearValue = computeBreedingCycleYear({
        clutchDate: derived?.clutchDate || '',
        preLayDate: derived?.preLayDate || '',
        ovulationDate: derived?.ovulationDate || '',
        hatchDate: derived?.hatchDate || '',
        startDate: normalized.startDate || '',
      });
      const year = (yearValue && typeof yearValue === 'string' && yearValue.trim()) ? yearValue : 'Unknown';
      return { pairing, year };
    });
  }, [completedPairings]);

  const completedYearOptions = useMemo(() => {
    const set = new Set();
    completedPairingsWithYear.forEach(({ year }) => {
      set.add(year || 'Unknown');
    });
    const list = Array.from(set);
    list.sort((a, b) => {
      const parseYear = (value) => (/^\d{4}$/.test(value) ? Number(value) : null);
      const aNum = parseYear(a);
      const bNum = parseYear(b);
      if (aNum !== null && bNum !== null) return bNum - aNum;
      if (aNum !== null) return -1;
      if (bNum !== null) return 1;
      return a.localeCompare(b);
    });
    return list;
  }, [completedPairingsWithYear]);

  useEffect(() => {
    if (pairingsView !== 'completed') return;
    if (completedYearFilter === 'All') return;
    if (!completedYearOptions.includes(completedYearFilter)) {
      setCompletedYearFilter(completedYearOptions[0] || 'All');
    }
  }, [pairingsView, completedYearFilter, completedYearOptions]);

  const filteredCompletedPairings = useMemo(() => {
    if (pairingsView !== 'completed') return completedPairings;
    if (completedYearFilter === 'All') return completedPairingsWithYear.map(item => item.pairing);
    return completedPairingsWithYear
      .filter(item => item.year === completedYearFilter)
      .map(item => item.pairing);
  }, [pairingsView, completedPairings, completedPairingsWithYear, completedYearFilter]);

  const displayedPairings = pairingsView === 'completed' ? filteredCompletedPairings : activePairings;
  const filteredCompletedCount = filteredCompletedPairings.length;

  useEffect(() => {
    if (!focusedPairingId) return;
    if (activePairings.some(p => p.id === focusedPairingId)) {
      if (pairingsView !== 'active') setPairingsView('active');
      return;
    }
    if (completedPairings.some(p => p.id === focusedPairingId)) {
      if (pairingsView !== 'completed') setPairingsView('completed');
    }
  }, [focusedPairingId, activePairings, completedPairings, pairingsView]);

  // open snake if URL contains #snake=id
  useEffect(()=>{
    const h = window.location.hash.match(/#snake=(.+)/);
    if (h) {
      const id = decodeURIComponent(h[1]);
      const s = snakes.find(x=>x.id===id);
      if (s) { setEditSnake(s); setEditSnakeDraft(initSnakeDraft(s)); }
    }
  }, [snakes]);

  // open pairing if URL contains #pairing=id
  useEffect(()=>{
    const h = window.location.hash.match(/#pairing=(.+)/);
    if (h) {
      const id = decodeURIComponent(h[1]);
      const p = pairings.find(x=>x.id===id);
  if (p) { setTab('pairings'); setPairingsView(isPairingCompleted(p) ? 'completed' : 'active'); setFocusedPairingId(p.id); }
    }
  }, [pairings]);

  // generate QR data url when requested
  useEffect(()=>{
    if (!qrFor) { setQrDataUrl(null); return; }
    const url = `${window.location.origin}${window.location.pathname}#snake=${encodeURIComponent(qrFor)}`;
    QRCode.toDataURL(url, { width: 300 }).then(dataUrl => setQrDataUrl(dataUrl)).catch(()=>setQrDataUrl(null));
  }, [qrFor]);


  const filterSnakesByCriteria = useCallback((inputList) => {
    let base = Array.isArray(inputList) ? inputList.slice() : [];
    base = filterSnakes(base, query, tag);
    if (statusFilter === 'active') base = base.filter(s => s.status === 'Active');
    if (statusFilter === 'inactive') base = base.filter(s => s.status !== 'Active');

    const hasShowGroups = Array.isArray(showGroups) && showGroups.length > 0;
    const hasHiddenGroups = Array.isArray(hiddenGroups) && hiddenGroups.length > 0;

    if (hasShowGroups || hasHiddenGroups) {
      base = base.filter(s => {
        const memberships = Array.isArray(s?.groups) ? s.groups : [];
        const matchesShow = hasShowGroups ? memberships.some(g => showGroups.includes(g)) : true;
        const matchesHide = hasHiddenGroups ? memberships.some(g => hiddenGroups.includes(g)) : false;
        if (hasShowGroups && !matchesShow) return false;
        if (hasHiddenGroups && matchesHide) return false;
        return true;
      });
    } else if (groupFilter !== 'all') {
      base = base.filter(s => (s.groups || []).includes(groupFilter));
    }

    if (!showUnassigned) {
      base = base.filter(s => Array.isArray(s.groups) && s.groups.length);
    }

    return base;
  }, [query, tag, statusFilter, showGroups, hiddenGroups, groupFilter, showUnassigned]);

  const filteredAll = useMemo(() => filterSnakesByCriteria(snakes), [filterSnakesByCriteria, snakes]);

  const filteredFemales = useMemo(
    () => filterSnakesByCriteria(snakes.filter(isFemaleSnake)),
    [filterSnakesByCriteria, snakes]
  );

  const filteredMales = useMemo(
    () => filterSnakesByCriteria(snakes.filter(isMaleSnake)),
    [filterSnakesByCriteria, snakes]
  );

  const activeAnimalList = useMemo(() => {
    if (animalView === "groups") return [];
    if (animalView === "all") return filteredAll;
    if (animalView === "females") return filteredFemales;
    if (animalView === "males") return filteredMales;
    return filteredAll;
  }, [animalView, filteredAll, filteredFemales, filteredMales]);

  const activeAnimalLabel = animalView === "groups" ? "Groups"
    : animalView === "females" ? "Females"
    : animalView === "males" ? "Males"
    : "All animals";

  const animalsCardTitle = (
    <div className="flex flex-col items-center gap-2 w-full">
      <span className="text-base font-semibold">{`${activeAnimalLabel} (${activeAnimalList.length})`}</span>
      <GeneLegend />
    </div>
  );

  const currentFemale = snakeById(snakes, draft.femaleId || "");
  const currentMale   = snakeById(snakes, draft.maleId || "");

  const isBreeder = useCallback((s) => (s.groups || []).includes("Breeders"), []);

  const proceedWithPairing = useCallback((snake) => {
    if (!snake) return;
    setDraft({
      maleId: isMaleSnake(snake) ? snake.id : "",
      femaleId: isFemaleSnake(snake) ? snake.id : "",
      goals: [],
      notes: "",
      startDate: localYMD(new Date())
    });
    setShowPairingModal(true);
  }, [setDraft, setShowPairingModal]);

  const startPairingWithSnake = useCallback((snake) => {
    if (!snake) return;
    if (!isBreeder(snake)) {
      setPairingGuard({ snake });
      return;
    }
    proceedWithPairing(snake);
  }, [isBreeder, proceedWithPairing]);

  const handlePairingGuardCancel = useCallback(() => {
    setPairingGuard(null);
  }, []);

  const handlePairingGuardConfirm = useCallback(() => {
    if (!pairingGuard?.snake) return;
    const snakeId = pairingGuard.snake.id;
    setSnakes(prev => prev.map(s => {
      if (!s || s.id !== snakeId) return s;
      return { ...s, groups: ['Breeders'] };
    }));
    setGroups(prev => prev.includes("Breeders") ? prev : [...prev, "Breeders"]);
    const updatedSnake = {
      ...pairingGuard.snake,
      groups: ['Breeders']
    };
    setPairingGuard(null);
    proceedWithPairing(updatedSnake);
  }, [pairingGuard, setSnakes, setGroups, proceedWithPairing]);

  const handleAddSnakePhotos = useCallback(async (snakeId, files, options = {}) => {
    if (!snakeId) return { newEntries: [], combined: null, imageUrl: null };
    const fileArray = Array.isArray(files) ? files : Array.from(files || []);
    const images = fileArray.filter(file => file && (typeof file.type !== 'string' || file.type.startsWith('image/')));
    if (!images.length) return { newEntries: [], combined: null, imageUrl: null };
    const sourceLabel = options.source === 'camera' ? 'camera' : 'upload';
    const entries = await Promise.all(images.map(async (file) => {
      try {
        const dataUrl = await readFileAsDataURL(file);
        return normalizePhotoEntry({
          id: uid('photo'),
          url: dataUrl,
          name: file.name || '',
          type: file.type || '',
          size: file.size,
          addedAt: new Date().toISOString(),
          source: sourceLabel,
        });
      } catch (err) {
        console.error('Failed to read image file', err);
        return null;
      }
    }));
    const newEntries = entries.filter(Boolean);
    if (!newEntries.length) return { newEntries: [], combined: null, imageUrl: null };

    let combinedResult = null;
    let imageUrlResult = null;
    setSnakes(prev => prev.map(s => {
      if (!s || s.id !== snakeId) return s;
      const existing = normalizeSnakePhotos(s.photos);
      const combined = trimSnakePhotoList([...existing, ...newEntries]);
      const latestUrl = newEntries[newEntries.length - 1]?.url || (combined.length ? combined[combined.length - 1].url : undefined);
      const nextImageUrl = latestUrl || s.imageUrl || (combined.length ? combined[combined.length - 1].url : undefined);
      combinedResult = combined;
      imageUrlResult = nextImageUrl;
      return { ...s, photos: combined, imageUrl: nextImageUrl };
    }));
    return { newEntries, combined: combinedResult, imageUrl: imageUrlResult };
  }, [setSnakes]);

  const handleRemoveSnakePhoto = useCallback((snakeId, photoId) => {
    if (!snakeId || !photoId) return;
    setSnakes(prev => prev.map(s => {
      if (!s || s.id !== snakeId) return s;
      const remaining = normalizeSnakePhotos(s.photos).filter(photo => photo.id !== photoId);
      let nextImageUrl = s.imageUrl;
      if (!remaining.some(photo => photo.url === nextImageUrl)) {
        nextImageUrl = remaining.length ? remaining[remaining.length - 1].url : undefined;
      }
      return { ...s, photos: remaining, imageUrl: nextImageUrl };
    }));
  }, [setSnakes]);

  const handleSetSnakeCoverPhoto = useCallback((snakeId, photoId) => {
    if (!snakeId || !photoId) return;
    setSnakes(prev => prev.map(s => {
      if (!s || s.id !== snakeId) return s;
      const photos = normalizeSnakePhotos(s.photos);
      const selected = photos.find(photo => photo.id === photoId);
      if (!selected) return s;
      return { ...s, photos, imageUrl: selected.url };
    }));
  }, [setSnakes]);

  const handleOpenPhotoGallery = useCallback((snakeId) => {
    if (!snakeId) return;
    setPhotoGallerySnakeId(snakeId);
  }, []);

  const handleClosePhotoGallery = useCallback(() => {
    setPhotoGallerySnakeId(null);
  }, []);

  const photoGallerySnake = useMemo(() => (
    photoGallerySnakeId ? snakes.find(s => s.id === photoGallerySnakeId) || null : null
  ), [snakes, photoGallerySnakeId]);

  const photoGalleryPhotos = useMemo(() => (
    photoGallerySnake ? normalizeSnakePhotos(photoGallerySnake.photos) : []
  ), [photoGallerySnake]);

  const formatPhotoSize = useCallback((value) => {
    if (!Number.isFinite(value) || value <= 0) return '';
    if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
    if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${value} B`;
  }, []);

  const editPhotoCount = useMemo(() => (
    Array.isArray(editSnakeDraft?.photos) ? editSnakeDraft.photos.length : 0
  ), [editSnakeDraft?.photos]);

  const handleEditPhotoSelection = useCallback(async (fileList, source) => {
    if (!editSnake?.id) return;
    const files = Array.isArray(fileList) ? fileList.filter(Boolean) : Array.from(fileList || []).filter(Boolean);
    if (!files.length) return;
    try {
      setEditUploadingPhoto(true);
      const result = await handleAddSnakePhotos(editSnake.id, files, { source });
      const newEntries = Array.isArray(result?.newEntries) ? result.newEntries : [];
      const combinedFromHandler = Array.isArray(result?.combined) ? result.combined : null;
      const imageUrlFromHandler = typeof result?.imageUrl === 'string' ? result.imageUrl : null;
      if (!newEntries.length) return;

      setEditSnakeDraft(prev => {
        if (!prev) return prev;
        const existing = normalizeSnakePhotos(prev.photos);
        const nextPhotos = combinedFromHandler || trimSnakePhotoList([...existing, ...newEntries]);
        const nextImageUrl = imageUrlFromHandler || prev.imageUrl || (nextPhotos.length ? nextPhotos[nextPhotos.length - 1].url : prev.imageUrl);
        return { ...prev, photos: nextPhotos, imageUrl: nextImageUrl };
      });

      setEditSnake(prev => {
        if (!prev) return prev;
        const existing = normalizeSnakePhotos(prev.photos);
        const nextPhotos = combinedFromHandler || trimSnakePhotoList([...existing, ...newEntries]);
        const nextImageUrl = imageUrlFromHandler || prev.imageUrl || (nextPhotos.length ? nextPhotos[nextPhotos.length - 1].url : prev.imageUrl);
        return { ...prev, photos: nextPhotos, imageUrl: nextImageUrl };
      });
    } catch (err) {
      console.error('Failed to add photos', err);
      alert('Could not save those pictures. Please try again with smaller images.');
    } finally {
      setEditUploadingPhoto(false);
    }
  }, [editSnake, handleAddSnakePhotos]);

  const handleEditCameraInputChange = useCallback(async (event) => {
    const files = event?.target?.files;
    if (files && files.length) {
      await handleEditPhotoSelection(files, 'camera');
    }
    if (event?.target) {
      event.target.value = '';
    }
  }, [handleEditPhotoSelection]);

  const handleEditUploadInputChange = useCallback(async (event) => {
    const files = event?.target?.files;
    if (files && files.length) {
      await handleEditPhotoSelection(files, 'upload');
    }
    if (event?.target) {
      event.target.value = '';
    }
  }, [handleEditPhotoSelection]);

  const triggerEditCameraCapture = useCallback(() => {
    const el = editCameraInputRef.current;
    if (el) el.click();
  }, []);

  const triggerEditUploadPicker = useCallback(() => {
    const el = editUploadInputRef.current;
    if (el) el.click();
  }, []);

  const handleEditViewPictures = useCallback(() => {
    if (!editSnake?.id) return;
    handleOpenPhotoGallery(editSnake.id);
  }, [editSnake, handleOpenPhotoGallery]);

  function openNewPairingModal() {
    setDraft({
      maleId: "",
      femaleId: "",
      goals: [],
      notes: "",
      startDate: localYMD(new Date())
    });
    setPairingsView('active');
    setShowPairingModal(true);
  }

  const openSnakeCard = useCallback((snake) => {
    if (!snake) return;
    setReturnToGroupsAfterEdit(tab === 'animals' && animalView === 'groups');
    setTab('animals');
  setAnimalView(isFemaleSnake(snake) ? 'females' : 'males');
    setEditSnake(snake);
    setEditSnakeDraft(initSnakeDraft(snake));
  }, [animalView, tab]);

  const closeSnakeEditor = useCallback(() => {
    setEditSnake(null);
    setEditSnakeDraft(null);
    if (returnToGroupsAfterEdit) {
      setTab('animals');
      setAnimalView('groups');
      setReturnToGroupsAfterEdit(false);
    }
  }, [returnToGroupsAfterEdit]);

  const requestDeleteSnake = useCallback((snake) => {
    if (!snake) return;
    setPendingDeleteSnake(snake);
  }, []);

  const performSnakeDeletion = useCallback((id) => {
    if (!id) return;
    setSnakes(prev => {
      const next = prev.filter(s => s.id !== id);
      if (!next.length) return createFreshSnakes();
      return next;
    });
    setPairings(prev => prev.filter(p => p.maleId !== id && p.femaleId !== id));
    if (editSnake && editSnake.id === id) {
      closeSnakeEditor();
    }
  }, [closeSnakeEditor, editSnake]);

  const confirmDeleteSnake = useCallback(() => {
    if (!pendingDeleteSnake) return;
    performSnakeDeletion(pendingDeleteSnake.id);
    setPendingDeleteSnake(null);
  }, [performSnakeDeletion, pendingDeleteSnake]);

  const cancelDeleteSnake = useCallback(() => {
    setPendingDeleteSnake(null);
  }, []);

  function addAnimalFromForm() {
    const sex = ensureSex(newAnimal.sex, "F");
    const parsedMorphHet = splitMorphHetInput(newAnimal.morphHetInput || '');
    const morphList = Array.isArray(newAnimal.morphs)
      ? newAnimal.morphs.map(s => String(s).trim()).filter(Boolean)
      : parsedMorphHet.morphs;
    const hetList = Array.isArray(newAnimal.hets)
      ? newAnimal.hets.map(s => String(s).trim()).filter(Boolean)
      : parsedMorphHet.hets;
    const existingIds = snakes.map(s => s.id);
    const normalizedBirthDate = normalizeDateInput(newAnimal.birthDate || null);
    const birthYear = extractYearFromDateString(normalizedBirthDate);
    const numericYear = Number(newAnimal.year);
    const fallbackYear = Number.isFinite(numericYear) && numericYear > 0 ? numericYear : new Date().getFullYear();
    const derivedYear = birthYear ?? fallbackYear;
    // If user supplied an explicit id, use it (make unique if necessary), otherwise generate one
    let resolvedId = (newAnimal.id || '').toString().trim();
    const hasManualId = newAnimal.autoId === false && resolvedId.length > 0;
    if (hasManualId) {
      // ensure uniqueness by appending a numeric suffix if needed
      if (existingIds.includes(resolvedId)) {
        let counter = 2;
        let candidate = `${resolvedId}-${counter}`;
        while (existingIds.includes(candidate)) {
          counter += 1;
          candidate = `${resolvedId}-${counter}`;
        }
        resolvedId = candidate;
      }
    } else {
      resolvedId = generateSnakeId(
        newAnimal.name,
        derivedYear,
        snakes,
        null,
        { idConfig: breederInfo?.idGenerator, sex, morphs: morphList, hets: hetList, birthYear }
      );
    }
    let idSequence = Number(newAnimal.idSequence);
    if (!Number.isFinite(idSequence) || idSequence <= 0) {
      idSequence = extractSequenceFromId(resolvedId, breederInfo?.idGenerator) || null;
    }
    const groupList = normalizeSingleGroupValue(newAnimal.groups);
    const draftPhotos = normalizeSnakePhotos(newAnimal.photos);
    const coverImage = newAnimal.imageUrl?.trim() || (draftPhotos.length ? draftPhotos[draftPhotos.length - 1].url : undefined);
    const snake = {
      id: resolvedId,
      name: newAnimal.name.trim() || (sex === "F" ? "New Female" : "New Male"),
      sex,
      morphs: morphList,
      hets:   hetList,
      weight: Number(newAnimal.weight) || 0,
  year:   derivedYear,
  birthDate: normalizedBirthDate || null,
      tags:   [],
      groups: groupList,
      status: "Active",
      imageUrl: coverImage,
      photos: draftPhotos,
      logs: cloneLogs(newAnimal.logs),
      idSequence: Number.isFinite(idSequence) && idSequence > 0 ? idSequence : null,
      isDemo: false
    };
    setSnakes(prev => {
      const base = prev.filter(s => !s.isDemo);
      return [...base, snake];
    });
    setGroups(prev => Array.from(new Set([...(prev || []), ...snake.groups])));
    setShowAddModal(false);
  setNewAnimal(createEmptyNewAnimalDraft());
  }

  function runImportPreview() {
    const items = parseReptileBuddyText(importText);
    setImportPreview(items);
  }

  function applyImport() {
    const existingKeySet = new Set(
      snakes.map(s => `${(s.name || '').trim().toLowerCase()}|${ensureSex(s.sex, 'F')}`)
    );
    const existingIds = snakes.map(s => s.id);
    const existingRecords = snakes.map(s => ({ id: s.id, idSequence: s.idSequence }));
    const canonicalGroupMap = new Map((groups || []).map(label => [String(label).trim().toLowerCase(), label]));

    const normalizeImportedGroup = (label) => {
      const trimmed = String(label || '').trim();
      if (!trimmed) return null;
      const key = trimmed.toLowerCase();
      if (canonicalGroupMap.has(key)) return canonicalGroupMap.get(key);
      canonicalGroupMap.set(key, trimmed);
      return trimmed;
    };

    const normalizedToAdd = [];
    for (const preview of importPreview) {
  const converted = convertParsedToSnake({ ...preview, __existingIds: existingIds, __existingRecords: existingRecords }, breederInfo?.idGenerator);
      const sex = ensureSex(converted.sex, 'F');
      const nameKey = (converted.name || '').trim().toLowerCase();
      const compositeKey = `${nameKey}|${sex}`;
      if (existingKeySet.has(compositeKey)) continue;
      existingKeySet.add(compositeKey);
      existingIds.push(converted.id);
      existingRecords.push({ id: converted.id, idSequence: converted.idSequence });
      const normalizedGroups = normalizeSingleGroupValue(
        (converted.groups || []).map(normalizeImportedGroup).filter(Boolean)
      );
  normalizedToAdd.push({ ...converted, sex, groups: normalizedGroups, isDemo: false });
    }

    if (!normalizedToAdd.length) {
      setImportText("");
      setImportPreview([]);
      setTab("animals");
      setAnimalView("all");
      return;
    }
    setSnakes(prev => {
      const base = prev.filter(s => !s.isDemo);
      return [...base, ...normalizedToAdd];
    });
    // ensure any groups from added snakes are included in master groups list
    const newGroups = Array.from(new Set(normalizedToAdd.flatMap(s => s.groups || [])));
    if (newGroups.length) setGroups(prev => Array.from(new Set([...(prev||[]), ...newGroups])));
    setImportText("");
    setImportPreview([]);
    setTab("animals");
    setAnimalView("all");
    setShowImportModal(false);
  }

  function addPairingFromDraft() {
    const fId = draft.femaleId || "";
    const mId = draft.maleId || "";
    const femaleName = snakeById(snakes, fId)?.name || "Female";
    const maleName = snakeById(snakes, mId)?.name || "Male";
    const autoLabel = `${femaleName} × ${maleName}`;
    const p = {
      id: uid(),
      femaleId: fId,
      maleId: mId,
      label: autoLabel,
      // startDate will be set to the date of the first generated appointment when present
      startDate: draft.startDate,
      lockObserved: false,
      goals: draft.goals || [],
      notes: draft.notes || "",
      appointments: genMonthlyAppointments(draft.startDate, 5),
    };
    // if appointments exist, set startDate to the first appointment date
    if (p.appointments && p.appointments.length) p.startDate = p.appointments[0].date;
    setPairings(prev => [...prev, withPairingLifecycleDefaults(p)]);
    setShowPairingModal(false);
    setTab("pairings");
    setFocusedPairingId(p.id);
  }

    const openHatchWizardForPayload = useCallback((payload) => {
      if (!payload || !payload.pairing || !payload.count || payload.count <= 0) return;
      const pairing = withPairingLifecycleDefaults({ ...payload.pairing });
      const hatchedOn = payload.hatchedDate || localYMD(new Date());
      const parsedDate = parseYmd(hatchedOn) || new Date();
      const year = Number.isFinite(parsedDate.getFullYear()) ? parsedDate.getFullYear() : new Date().getFullYear();
      const sire = snakeById(snakes, pairing?.maleId);
      const dam = snakeById(snakes, pairing?.femaleId);
      const pairingName = `${dam?.name || 'Dam'} × ${sire?.name || 'Sire'}`;
      const baseExistingRecords = snakes.map(s => ({ id: s.id, idSequence: s.idSequence }));
      const idsInUse = new Set(baseExistingRecords.map(record => record.id));
      const recordsInUse = baseExistingRecords.map(record => ({ ...record }));
      const configClone = breederInfo?.idGenerator ? { ...breederInfo.idGenerator } : null;

      const entries = Array.from({ length: payload.count }, (_, idx) => {
        const sequenceLabel = payload.existingCount + idx + 1;
        const defaultName = `Hatchling ${sequenceLabel} (${pairingName})`;
        const generatedId = generateSnakeId(
          defaultName,
          year,
          recordsInUse,
          null,
          {
            idConfig: configClone,
            sex: 'F',
            morphs: [],
            hets: [],
            birthYear: year,
          }
        );
        idsInUse.add(generatedId);
        const seqValue = extractSequenceFromId(generatedId, configClone);
        recordsInUse.push({ id: generatedId, idSequence: seqValue });
        return {
          id: generatedId,
          autoId: true,
          name: defaultName,
          sex: 'F',
          morph: '',
          weight: '',
          birthDate: hatchedOn,
          idSequence: seqValue,
        };
      });

      setHatchWizard({
        pairingId: pairing.id,
        pairing,
        entries,
        currentIndex: 0,
        hatchedDate: hatchedOn,
        total: payload.count,
        existingCount: payload.existingCount,
        previousHatch: payload.previousHatch || pairing.hatch,
        context: {
          pairingName,
          sireName: sire?.name || '',
          damName: dam?.name || '',
          groupName: `Hatchlings ${year}`,
          year,
          idConfig: configClone,
          existingIdsBase: baseExistingRecords.map(record => record.id),
          existingRecordsBase: baseExistingRecords,
        },
      });
    }, [snakes, breederInfo]);

    const regenerateWizardIdInState = useCallback((state, index, sexOverride) => {
      if (!state) return state;
      const entries = Array.isArray(state.entries) ? state.entries : [];
      if (!entries[index]) return state;
      const context = state.context || {};
      const baseIds = Array.isArray(context.existingIdsBase) ? context.existingIdsBase.map(id => String(id || '').trim()).filter(Boolean) : [];
      const idsInUse = new Set(baseIds);
      const baseRecordsRaw = Array.isArray(context.existingRecordsBase) ? context.existingRecordsBase : [];
      const baseRecords = baseRecordsRaw
        .map(record => {
          if (!record) return null;
          if (typeof record === 'string') {
            const id = record;
            return { id, idSequence: extractSequenceFromId(id, context.idConfig) };
          }
          const id = record.id != null ? String(record.id) : '';
          if (!id) return null;
          const seqValue = Number(record.idSequence);
          const normalizedSeq = Number.isFinite(seqValue) && seqValue > 0
            ? Math.floor(seqValue)
            : extractSequenceFromId(id, context.idConfig);
          return { id, idSequence: normalizedSeq };
        })
        .filter(Boolean);
      const recordsInUse = baseRecords.map(record => ({ ...record }));
      entries.forEach((entry, idx) => {
        if (idx === index) return;
        const trimmed = String(entry?.id || '').trim();
        if (trimmed) {
          idsInUse.add(trimmed);
          const seqCandidate = Number(entry?.idSequence);
          const derivedSeq = Number.isFinite(seqCandidate) && seqCandidate > 0
            ? Math.floor(seqCandidate)
            : extractSequenceFromId(trimmed, context.idConfig);
          recordsInUse.push({ id: trimmed, idSequence: derivedSeq });
        }
      });
      const baseName = entries[index].name || context.pairingName || `Hatchling ${index + 1}`;
      const sex = ensureSex(sexOverride ?? entries[index].sex, 'F');
      const entryBirthYear = extractYearFromDateString(entries[index].birthDate);
      const derivedYear = entryBirthYear ?? context.year ?? new Date().getFullYear();
      const candidate = generateSnakeId(
        baseName,
        derivedYear,
        recordsInUse,
        null,
        {
          idConfig: context.idConfig,
          sex,
          morphs: [],
          hets: [],
          birthYear: entryBirthYear ?? derivedYear,
        }
      );
      if (!candidate) return state;
      const sequenceValue = extractSequenceFromId(candidate, context.idConfig);
      const nextEntries = entries.map((entry, idx) => idx === index ? { ...entry, id: candidate, autoId: true, idSequence: sequenceValue } : entry);
      return { ...state, entries: nextEntries };
    }, []);

    const updateHatchWizardEntry = useCallback((index, updates) => {
      setHatchWizard(prev => {
        if (!prev) return prev;
        const entries = Array.isArray(prev.entries) ? prev.entries : [];
        if (index < 0 || index >= entries.length) return prev;
        const nextEntries = entries.map((entry, idx) => {
          if (idx !== index) return entry;
          const nextEntry = { ...entry, ...updates };
          if (!Object.prototype.hasOwnProperty.call(updates, 'autoId') && Object.prototype.hasOwnProperty.call(updates, 'id')) {
            nextEntry.autoId = false;
          }
          return nextEntry;
        });
        return { ...prev, entries: nextEntries };
      });
    }, []);

    const handleWizardIdChange = useCallback((index, value) => {
      updateHatchWizardEntry(index, { id: value });
    }, [updateHatchWizardEntry]);

    const handleWizardMorphChange = useCallback((index, value) => {
      updateHatchWizardEntry(index, { morph: value });
    }, [updateHatchWizardEntry]);

    const handleWizardWeightChange = useCallback((index, value) => {
      updateHatchWizardEntry(index, { weight: value });
    }, [updateHatchWizardEntry]);

    const handleWizardBirthDateChange = useCallback((index, value) => {
      setHatchWizard(prev => {
        if (!prev) return prev;
        const entries = Array.isArray(prev.entries) ? prev.entries : [];
        if (index < 0 || index >= entries.length) return prev;
        const normalized = value ? normalizeDateInput(value) || value : '';
        const nextEntries = entries.map((entry, idx) =>
          idx === index ? { ...entry, birthDate: normalized } : entry
        );
        let nextState = { ...prev, entries: nextEntries };
        if (entries[index]?.autoId) {
          nextState = regenerateWizardIdInState(nextState, index, nextEntries[index].sex);
        }
        return nextState;
      });
    }, [regenerateWizardIdInState]);

    const handleWizardSexChange = useCallback((index, value) => {
      const normalized = ensureSex(value, 'F');
      setHatchWizard(prev => {
        if (!prev) return prev;
        const entries = Array.isArray(prev.entries) ? prev.entries : [];
        if (index < 0 || index >= entries.length) return prev;
        const wasAuto = !!entries[index]?.autoId;
        const nextEntries = entries.map((entry, idx) => idx === index ? { ...entry, sex: normalized } : entry);
        let nextState = { ...prev, entries: nextEntries };
        if (wasAuto) {
          nextState = regenerateWizardIdInState(nextState, index, normalized);
        }
        return nextState;
      });
    }, [regenerateWizardIdInState]);

    const handleWizardRegenerateId = useCallback((index) => {
      setHatchWizard(prev => regenerateWizardIdInState(prev, index, prev?.entries?.[index]?.sex));
    }, [regenerateWizardIdInState]);

    const handleWizardNext = useCallback(() => {
      setHatchWizard(prev => {
        if (!prev) return prev;
        const total = Array.isArray(prev.entries) ? prev.entries.length : 0;
        const nextIndex = Math.min(total - 1, (prev.currentIndex || 0) + 1);
        if (nextIndex === prev.currentIndex) return prev;
        return { ...prev, currentIndex: nextIndex };
      });
    }, []);

    const handleWizardPrev = useCallback(() => {
      setHatchWizard(prev => {
        if (!prev) return prev;
        const prevIndex = Math.max(0, (prev.currentIndex || 0) - 1);
        if (prevIndex === prev.currentIndex) return prev;
        return { ...prev, currentIndex: prevIndex };
      });
    }, []);

    const handleWizardCancel = useCallback(() => {
      setHatchWizard(null);
    }, []);

    const handleWizardSave = useCallback(() => {
      setHatchWizard(prev => {
        if (!prev) return prev;
        const entries = Array.isArray(prev.entries) ? prev.entries : [];
        if (!entries.length) return null;
        const context = prev.context || {};
        const pairing = prev.pairing || null;
        const hatchedOn = prev.hatchedDate || localYMD(new Date());
        const baseGroup = context.groupName || null;
  const existingIds = new Set(snakes.map(s => s.id));
  const existingRecords = snakes.map(s => ({ id: s.id, idSequence: s.idSequence }));
        const created = [];

        entries.forEach((entry, idx) => {
          const fallbackName = entry.name || context.pairingName || `Hatchling ${idx + 1}`;
          const sex = ensureSex(entry.sex, 'F');
          let resolvedId = String(entry.id || '').trim();
          const rawBirthValue = entry.birthDate || hatchedOn;
          const normalizedBirthDate = rawBirthValue ? normalizeDateInput(rawBirthValue) || rawBirthValue : '';
          const entryBirthYear = extractYearFromDateString(normalizedBirthDate || rawBirthValue);
          const yearBase = entryBirthYear ?? context.year ?? new Date().getFullYear();
          if (!resolvedId) {
            resolvedId = generateSnakeId(
              fallbackName,
              yearBase,
              existingRecords,
              null,
              { idConfig: context.idConfig, sex, morphs: [], hets: [], birthYear: entryBirthYear ?? yearBase }
            );
          }
          if (!resolvedId) return;
          if (existingIds.has(resolvedId)) {
            let suffix = 2;
            let candidate = `${resolvedId}-${suffix}`;
            while (existingIds.has(candidate)) {
              suffix += 1;
              candidate = `${resolvedId}-${suffix}`;
            }
            resolvedId = candidate;
          }
          existingIds.add(resolvedId);
          const idSequence = extractSequenceFromId(resolvedId, breederInfo?.idGenerator);
          existingRecords.push({ id: resolvedId, idSequence });
          const birthDateRaw = normalizedBirthDate || rawBirthValue;
          const parsedBirth = parseYmd(birthDateRaw);
          const derivedYear = parsedBirth && Number.isFinite(parsedBirth.getFullYear())
            ? parsedBirth.getFullYear()
            : yearBase;
          const { morphs, hets } = splitMorphHetInput(entry.morph || '');
          const grams = Number(entry.weight);
          const weight = Number.isFinite(grams) && grams >= 0 ? grams : 0;
          created.push({
            id: resolvedId,
            name: fallbackName,
            sex,
            morphs,
            hets,
            weight,
            year: derivedYear,
            birthDate: birthDateRaw,
            pairingId: pairing?.id || prev.pairingId || null,
            sireId: pairing?.maleId || null,
            damId: pairing?.femaleId || null,
            tags: ['hatchling'],
            groups: baseGroup ? normalizeSingleGroupValue(baseGroup) : [],
            status: 'Active',
            imageUrl: undefined,
            logs: cloneLogs(),
            idSequence,
            isDemo: false,
          });
        });

        if (created.length) {
          setSnakes(prevSnakes => {
            const base = prevSnakes.filter(s => !s.isDemo);
            return [...base, ...created];
          });
          if (baseGroup) {
            setGroups(prevGroups => (prevGroups.includes(baseGroup) ? prevGroups : [...prevGroups, baseGroup]));
          }
          if (typeof window !== 'undefined' && typeof window.alert === 'function') {
            window.alert(`${created.length} hatchlings added${baseGroup ? ` to ${baseGroup}` : ''}.`);
          }
        }

        return null;
      });
  }, [snakes, setSnakes, setGroups, breederInfo]);

  const handleGenerateIdForEditSnake = useCallback(() => {
    setEditSnakeDraft(draft => {
      if (!draft) return draft;
      const currentId = String(draft.id || '').trim();
      if (currentId) return draft;
      const existingRecords = snakes
        .filter(s => s && s.id !== editSnake?.id)
        .map(s => ({ id: s.id, idSequence: s.idSequence }));
      const derivedYear = Number(draft.year) || (draft.birthDate ? (parseYmd(draft.birthDate)?.getFullYear() || new Date().getFullYear()) : new Date().getFullYear());
      const draftBirthYear = draft.birthDate ? extractYearFromDateString(draft.birthDate) : null;
      const forcedSequence = Number(draft.idSequence);
      const sequenceOverride = Number.isFinite(forcedSequence) && forcedSequence > 0 ? Math.floor(forcedSequence) : null;
      const generatedId = generateSnakeId(
        draft.name,
        derivedYear,
        existingRecords,
        null,
        {
          idConfig: breederInfo?.idGenerator,
          sex: draft.sex || 'U',
          morphs: draft.morphs || [],
          hets: draft.hets || [],
          birthYear: draftBirthYear ?? derivedYear,
          forceSequence: sequenceOverride,
        }
      );
      if (!generatedId) return draft;
      const generatedSequence = extractSequenceFromId(generatedId, breederInfo?.idGenerator);
      return {
        ...draft,
        id: generatedId,
        idSequence: generatedSequence ?? (sequenceOverride ?? draft.idSequence ?? null),
        autoId: true,
      };
    });
  }, [snakes, editSnake, breederInfo]);

  const handleUpdateIdForEditSnake = useCallback(() => {
    setEditSnakeDraft(draft => {
      if (!draft) return draft;
      const existingRecords = snakes
        .filter(s => s && s.id !== editSnake?.id)
        .map(s => ({ id: s.id, idSequence: s.idSequence }));
      const derivedYear = Number(draft.year) || (draft.birthDate ? (parseYmd(draft.birthDate)?.getFullYear() || new Date().getFullYear()) : new Date().getFullYear());
      const draftBirthYear = draft.birthDate ? extractYearFromDateString(draft.birthDate) : null;
      const forcedSequence = Number(draft.idSequence);
      const sequenceOverride = Number.isFinite(forcedSequence) && forcedSequence > 0 ? Math.floor(forcedSequence) : null;
      const generatedId = generateSnakeId(
        draft.name,
        derivedYear,
        existingRecords,
        null,
        {
          idConfig: breederInfo?.idGenerator,
          sex: draft.sex || 'U',
          morphs: draft.morphs || [],
          hets: draft.hets || [],
          birthYear: draftBirthYear ?? derivedYear,
          forceSequence: sequenceOverride,
        }
      );
      if (!generatedId) return draft;
      const generatedSequence = extractSequenceFromId(generatedId, breederInfo?.idGenerator);
      return {
        ...draft,
        id: generatedId,
        idSequence: generatedSequence ?? (sequenceOverride ?? draft.idSequence ?? null),
        autoId: true,
      };
    });
  }, [snakes, editSnake, breederInfo]);

  const handleUpdatePairing = useCallback((pairingId, updater) => {
    let hatchPayload = null;
    setPairings(prev => prev.map(p => {
      if (p.id !== pairingId) return p;
      const current = withPairingLifecycleDefaults({ ...p });
      const nextRaw = typeof updater === 'function' ? updater(current) : updater;
      const merged = withPairingLifecycleDefaults({ ...current, ...(nextRaw || {}) });
      merged.id = p.id;
      const previousCount = current?.hatch?.recorded ? Number(current.hatch.hatchedCount || 0) : 0;
      const newCount = merged?.hatch?.recorded ? Number(merged.hatch.hatchedCount || 0) : 0;
      const delta = merged?.hatch?.recorded ? Math.max(0, newCount - previousCount) : 0;
      if (delta > 0) {
        hatchPayload = {
          pairing: { ...current, ...merged },
          count: delta,
          hatchedDate: merged.hatch.date,
          existingCount: previousCount,
          previousHatch: { ...current.hatch },
        };
      }
      return merged;
    }));
    if (hatchPayload) {
      openHatchWizardForPayload(hatchPayload);
    }
  }, [setPairings, openHatchWizardForPayload]);

  const themeVars = theme === 'green' ? { '--primary': '#059669', '--primary-border':'#059669', '--primary-contrast':'#fff' }
                    : theme === 'dark' ? { '--primary':'#374151', '--primary-border':'#374151', '--primary-contrast':'#fff' }
                    : { '--primary':'#0ea5e9', '--primary-border':'#0ea5e9', '--primary-contrast':'#fff' };

  return (
    <div className="app-root w-full min-h-screen bg-neutral-50 text-neutral-900" style={themeVars}>
      {/* header */}
      <div className="px-5 py-4 border-b bg-white sticky top-0 z-10">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-3">
              {breederInfo.logoUrl ? (
                <img src={breederInfo.logoUrl} alt="logo" className="w-10 h-10 rounded-full object-cover border" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-neutral-50 flex items-center justify-center text-xs text-neutral-400 border">Logo</div>
              )}
              <div>
                <div className="text-2xl font-semibold tracking-tight">Breeding Planner</div>
                <div className="text-xs text-neutral-600">{breederInfo.businessName ? `${breederInfo.businessName} • ${breederInfo.name}` : ''}</div>
              </div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <TabButton theme={theme} active={tab==="animals"} onClick={()=>setTab("animals")}>Animals</TabButton>
            <TabButton theme={theme} active={tab==="pairings"} onClick={()=>setTab("pairings")}>Breeding Planner</TabButton>
            <TabButton theme={theme} active={tab==="calendar"} onClick={()=>setTab("calendar")}>Calendar</TabButton>
            <TabButton theme={theme} active={tab==="setup"} onClick={()=>setTab("setup")}>Setup</TabButton>

            {/* theme toggle */}
            <div className="ml-2">
              <select className="border rounded-lg px-2 py-1 text-sm bg-white" value={theme} onChange={e=>setTheme(e.target.value)}>
                <option value="blue">Blue</option>
                <option value="green">Green</option>
                <option value="dark">Dark</option>
              </select>
            </div>

            <div className="ml-auto flex items-center gap-2">
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search name, morph, het, tag"
                className="px-3 py-2 border rounded-xl text-sm w-64 focus:outline-none focus:ring-2 focus:ring-black/10"
              />
            </div>
          </div>
        </div>
      </div>

      {/* body */}
      <div className="max-w-7xl mx-auto p-5">
        {tab === "animals" && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <TabButton theme={theme} active={animalView === "all"} onClick={()=>handleAnimalViewTabChange("all")}>All</TabButton>
                <TabButton theme={theme} active={animalView === "males"} onClick={()=>handleAnimalViewTabChange("males")}>Males</TabButton>
                <TabButton theme={theme} active={animalView === "females"} onClick={()=>handleAnimalViewTabChange("females")}>Females</TabButton>
                <TabButton theme={theme} active={animalView === "groups"} onClick={()=>handleAnimalViewTabChange("groups")}>Groups</TabButton>
              </div>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <button onClick={()=>setShowExportModal(true)} className={cx('px-3 py-2 rounded-xl text-sm', primaryBtnClass(theme,true))}>Export QR</button>
                <button onClick={()=>setShowScanner(true)} className={cx('px-3 py-2 rounded-xl text-sm', primaryBtnClass(theme,true))}>Scan QR</button>
                <button
                  onClick={() => {
                    setNewAnimal(createEmptyNewAnimalDraft());
                    setShowAddModal(true);
                  }}
                  className={cx('px-3 py-2 rounded-xl text-sm', primaryBtnClass(theme,true))}
                >
                  + Add animal
                </button>
                <button onClick={() => setShowImportModal(true)} className={cx('px-3 py-2 rounded-xl text-sm', primaryBtnClass(theme,true))}>Import animals</button>
              </div>
            </div>

            {animalView === "groups" ? (
              <GroupsSection
                groups={groups}
                setGroups={setGroups}
                snakes={snakes}
                theme={theme}
                onOpenSnake={openSnakeCard}
                onDeleteGroup={(g)=>{
                  const inUse = snakes.some(s => (s.groups||[]).includes(g));
                  if (inUse) return alert("Group in use by some snakes. Remove from those snakes first.");
                  setGroups(prev => prev.filter(x=>x!==g));
                  if (groupFilter === g) setGroupFilter("all");
                }}
              />
            ) : (
              <Card title={animalsCardTitle}>
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Status</span>
                  <TabButton
                    theme={theme}
                    active={statusFilter === 'all'}
                    onClick={() => setStatusFilter('all')}
                  >
                    All statuses
                  </TabButton>
                  <TabButton
                    theme={theme}
                    active={statusFilter === 'active'}
                    onClick={() => setStatusFilter('active')}
                  >
                    Active only
                  </TabButton>
                  <TabButton
                    theme={theme}
                    active={statusFilter === 'inactive'}
                    onClick={() => setStatusFilter('inactive')}
                  >
                    Resting / in grow-out
                  </TabButton>
                </div>
                <GroupCheckboxes
                  groups={groups}
                  showGroups={showGroups}
                  setShowGroups={setShowGroups}
                  hiddenGroups={hiddenGroups}
                  setHiddenGroups={setHiddenGroups}
                  showUnassigned={showUnassigned}
                  setShowUnassigned={setShowUnassigned}
                />
                <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  {activeAnimalList.map(s => (
                    <SnakeCard
                      key={s.id}
                      s={s}
                      groups={groups}
                      setSnakes={setSnakes}
                      setQrFor={setQrFor}
                      onEdit={(sn)=>{ setEditSnake(sn); setEditSnakeDraft(initSnakeDraft(sn)); }}
                      onQuickPair={(sn)=> startPairingWithSnake(sn)}
                      onDelete={requestDeleteSnake}
                      pairings={pairings}
                      onOpenPairing={(pid)=>{ const p = pairings.find(x=>x.id===pid); if (p) { setTab('pairings'); setFocusedPairingId(p.id); } }}
                      lastFeedDefaults={lastFeedDefaults}
                      setLastFeedDefaults={setLastFeedDefaults}
                    />
                  ))}
                  {!activeAnimalList.length && (
                    <div className="col-span-full text-sm text-neutral-500">No animals match your filters.</div>
                  )}
                </div>
              </Card>
            )}
          </div>
        )}

        {tab === "pairings" && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <TabButton
                  theme={theme}
                  active={pairingsView === 'active'}
                  onClick={() => {
                    setPairingsView('active');
                    setFocusedPairingId(null);
                    setCompletedYearFilter('All');
                  }}
                >
                  Active projects ({activePairingsCount})
                </TabButton>
                <TabButton
                  theme={theme}
                  active={pairingsView === 'completed'}
                  onClick={() => {
                    setPairingsView('completed');
                    setFocusedPairingId(null);
                    setCompletedYearFilter('All');
                  }}
                >
                  Completed projects ({completedPairingsCount})
                </TabButton>
              </div>
              <button
                onClick={openNewPairingModal}
                className={cx('px-3 py-2 rounded-xl text-sm', primaryBtnClass(theme, true))}
              >
                New pairing
              </button>
            </div>
            {pairingsView === 'completed' && completedYearOptions.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <TabButton
                  theme={theme}
                  active={completedYearFilter === 'All'}
                  onClick={() => setCompletedYearFilter('All')}
                >
                  All years
                </TabButton>
                {completedYearOptions.map(year => (
                  <TabButton
                    key={year}
                    theme={theme}
                    active={completedYearFilter === year}
                    onClick={() => setCompletedYearFilter(year)}
                  >
                    {year}
                  </TabButton>
                ))}
              </div>
            )}
            <PairingsSection
              snakes={snakes}
              pairings={displayedPairings}
              onDelete={(pid)=>{
                setPairings(ps=>ps.filter(x=>x.id!==pid));
                setFocusedPairingId(prev=>prev===pid?null:prev);
              }}
              onOpenSnake={openSnakeCard}
              onUpdatePairing={handleUpdatePairing}
              focusedPairingId={focusedPairingId}
              onFocusPairing={setFocusedPairingId}
              theme={theme}
              title={pairingsView === 'completed'
                ? `Completed projects (${filteredCompletedCount}${completedYearFilter !== 'All' ? ` • ${completedYearFilter}` : ''})`
                : `Breeding Planner (${activePairingsCount})`}
              emptyMessage={pairingsView === 'completed'
                ? (completedYearFilter === 'All'
                  ? 'No completed projects yet. Hatchlings will land here once the cycle is marked finished.'
                  : `No completed projects recorded for ${completedYearFilter}.`)
                : 'No active pairings yet. Use “New pairing”.'}
              variant="collapsed"
            />
          </div>
        )}

        {tab === "calendar" && (
          <CalendarSection snakes={snakes} pairings={pairings} theme={theme} onOpenPairing={(pid)=>{ const p = pairings.find(x=>x.id===pid); if (p) { setTab('pairings'); setFocusedPairingId(p.id); } }} />
        )}

  {tab === "setup" && (
          <BreederSection
            breederInfo={breederInfo}
            setBreederInfo={setBreederInfo}
            theme={theme}
            onSaved={() => setTab('animals')}
            createBackupPayload={createBackupPayload}
            onRestoreBackup={handleRestoreBackup}
            backupSettings={backupSettings}
            updateBackupSettings={updateBackupSettings}
            autoBackupSnapshot={autoBackupSnapshot}
            onTriggerAutoBackup={runAutoBackup}
            backupVault={backupVault}
            onCreateVaultEntry={addBackupVaultEntry}
            onRenameVaultEntry={renameBackupVaultEntry}
            onDeleteVaultEntry={deleteBackupVaultEntry}
            snakes={snakes}
            pairings={pairings}
            animalExportFields={animalExportFields}
            setAnimalExportFields={setAnimalExportFields}
            pairingExportFields={pairingExportFields}
            setPairingExportFields={setPairingExportFields}
            exportFeedback={exportFeedback}
            setExportFeedback={setExportFeedback}
          />
        )}
      </div>

      {photoGallerySnake && (
        <div
          className={cx("fixed inset-0 flex items-center justify-center p-4 z-[80]", overlayClass(theme))}
          onClick={handleClosePhotoGallery}
        >
          <div
            className="relative w-full max-w-4xl bg-white text-neutral-900 rounded-2xl shadow-xl border border-neutral-200 max-h-[90vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 px-5 pt-5">
              <div>
                <div className="text-base font-semibold">{photoGallerySnake.name || 'Unnamed snake'}</div>
                <div className="text-xs text-neutral-500 mt-1">{photoGallerySnake.id}</div>
                <div className="text-xs text-neutral-500 mt-1">{photoGalleryPhotos.length} photo{photoGalleryPhotos.length === 1 ? '' : 's'} stored</div>
              </div>
              <button
                className="text-sm px-3 py-1.5 border rounded-lg"
                onClick={handleClosePhotoGallery}
              >
                Close
              </button>
            </div>
            <div className="px-5 pb-5 overflow-y-auto max-h-[70vh] mt-4">
              {photoGalleryPhotos.length ? (
                <div className="grid sm:grid-cols-2 gap-4">
                  {photoGalleryPhotos.map((photo) => {
                    const isCover = !!(photoGallerySnake.imageUrl && photo.url === photoGallerySnake.imageUrl);
                    const addedLabel = formatDateTimeForDisplay(photo.addedAt) || '';
                    const sizeLabel = typeof photo.size === 'number' ? formatPhotoSize(photo.size) : '';
                    const fileName = photo.name || `${photoGallerySnake.name || photoGallerySnake.id || 'snake'}-${photo.id}`;
                    return (
                      <div key={photo.id} className="border border-neutral-200 rounded-xl overflow-hidden bg-neutral-50 flex flex-col">
                        <div className="relative bg-black/5">
                          <img
                            src={photo.url}
                            alt={photo.name || `${photoGallerySnake.name || 'Snake'} photo`}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                          {isCover && (
                            <div className="absolute top-2 left-2 text-xs px-2 py-0.5 rounded-full bg-emerald-500 text-white shadow">Cover</div>
                          )}
                        </div>
                        <div className="p-3 flex-1 flex flex-col gap-2 text-sm">
                          <div className="flex items-start justify-between gap-2">
                            <div className="font-medium truncate" title={photo.name || fileName}>{photo.name || 'Untitled photo'}</div>
                          </div>
                          <div className="text-xs text-neutral-500">
                            {photo.source === 'camera' ? 'Captured on device' : 'Uploaded file'}
                            {sizeLabel ? ` • ${sizeLabel}` : ''}
                          </div>
                          {addedLabel && (
                            <div className="text-xs text-neutral-500">Added {addedLabel}</div>
                          )}
                          <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
                            <a
                              href={photo.url}
                              download={fileName}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs px-2 py-1 border rounded-lg hover:bg-neutral-100"
                            >
                              Open
                            </a>
                            <button
                              className="text-xs px-2 py-1 border rounded-lg hover:bg-neutral-100 disabled:opacity-60"
                              onClick={() => handleSetSnakeCoverPhoto(photoGallerySnake.id, photo.id)}
                              disabled={isCover}
                            >
                              {isCover ? 'Current cover' : 'Set as cover'}
                            </button>
                            <button
                              className="text-xs px-2 py-1 border rounded-lg text-rose-600 hover:bg-rose-50"
                              onClick={() => {
                                const ok = window.confirm('Remove this photo?');
                                if (ok) handleRemoveSnakePhoto(photoGallerySnake.id, photo.id);
                              }}
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-sm text-neutral-500">No photos saved for this snake yet. Use the card buttons to add some.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* add animal modal (two-step wizard) */}
  {showAddModal && (
  <div className={cx("fixed inset-0 backdrop-blur-sm flex items-center justify-center p-4 z-50", overlayClass(theme))} onClick={() => setShowAddModal(false)}>
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-xl border overflow-hidden max-h-[92vh]" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b flex items-center justify-between">
              <div className="font-semibold">Add animal</div>
              <button className="text-sm px-2 py-1" onClick={()=>setShowAddModal(false)}>Close</button>
            </div>

            {/* wizard state */}
            <AddAnimalWizard
              newAnimal={newAnimal}
              setNewAnimal={setNewAnimal}
              groups={groups}
              setGroups={setGroups}
              onCancel={()=>setShowAddModal(false)}
              onAdd={addAnimalFromForm}
              theme={theme}
            />
          </div>
        </div>
      )}

      {pairingGuard && (
        <div
          className={cx(
            "fixed inset-0 backdrop-blur-sm flex items-center justify-center p-4 z-50",
            overlayClass(theme)
          )}
          onClick={handlePairingGuardCancel}
        >
          <div
            className="bg-white w-full max-w-md rounded-2xl shadow-xl border p-6 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="text-lg font-semibold text-center">Breeders only</div>
            <p className="text-sm text-neutral-600 text-center">
              Only snakes in the Breeders group can be paired.
            </p>
            <p className="text-xs text-neutral-500 text-center">
              Add
              {' '}
              <span className="font-semibold text-neutral-700">
                {pairingGuard?.snake?.name || pairingGuard?.snake?.id || 'this snake'}
              </span>
              {' '}to Breeders and continue?
            </p>
            <div className="flex justify-end gap-3">
              <button
                className="px-3 py-2 rounded-xl text-sm border"
                onClick={handlePairingGuardCancel}
              >
                Cancel
              </button>
              <button
                className={cx('px-3 py-2 rounded-xl text-sm text-white', primaryBtnClass(theme, true))}
                onClick={handlePairingGuardConfirm}
              >
                Add to Breeders &amp; pair
              </button>
            </div>
          </div>
        </div>
      )}

      {hatchWizard && (() => {
        const total = Array.isArray(hatchWizard.entries) ? hatchWizard.entries.length : 0;
        const safeIndex = total ? Math.min(total - 1, Math.max(0, hatchWizard.currentIndex || 0)) : 0;
        const entry = total ? hatchWizard.entries[safeIndex] : null;
        const pairingName = hatchWizard.context?.pairingName || 'Hatchling';
        const groupName = hatchWizard.context?.groupName || '';
        const isLast = safeIndex === total - 1;
        const canAdvance = entry && String(entry.id || '').trim().length > 0;
        return (
          <div
            className={cx(
              'fixed inset-0 backdrop-blur-sm flex items-center justify-center p-4 z-50',
              overlayClass(theme)
            )}
            onClick={handleWizardCancel}
          >
            <div
              className="bg-white w-full max-w-2xl rounded-2xl shadow-xl border overflow-hidden max-h-[92vh] flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-4 border-b flex items-center justify-between">
                <div>
                  <div className="font-semibold">Log hatchlings</div>
                  <div className="text-xs text-neutral-500 mt-0.5">
                    {total > 0 ? `Hatchling ${safeIndex + 1} of ${total}` : 'No hatchlings to record'}
                  </div>
                </div>
                <button type="button" className="text-sm px-2 py-1" onClick={handleWizardCancel}>Close</button>
              </div>
              <div className="p-4 overflow-auto flex-1">
                {entry ? (
                  <div className="space-y-4">
                    <div className="text-sm text-neutral-600">
                      Pairing: <span className="font-medium text-neutral-800">{pairingName}</span>
                    </div>
                    {groupName && (
                      <div className="text-xs text-neutral-500">
                        New hatchlings will be placed in <span className="font-medium text-neutral-700">{groupName}</span>.
                      </div>
                    )}
                    <div>
                      <label className="text-xs font-medium">Hatchling ID</label>
                      <div className="mt-1 flex gap-2">
                        <input
                          className="flex-1 border rounded-xl px-3 py-2 text-sm"
                          value={entry.id || ''}
                          onChange={e => handleWizardIdChange(safeIndex, e.target.value)}
                        />
                        <button
                          type="button"
                          className={cx('px-3 py-2 rounded-xl text-sm border', entry.autoId ? 'text-neutral-600' : 'text-neutral-700')}
                          onClick={() => handleWizardRegenerateId(safeIndex)}
                        >
                          Regenerate
                        </button>
                      </div>
                      <div className="text-xs text-neutral-500 mt-1">
                        {entry.autoId ? 'Generated automatically based on pairing.' : 'ID locked—edit to override or regenerate.'}
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-medium">Sex</label>
                        <select
                          className="mt-1 w-full border rounded-xl px-3 py-2 text-sm bg-white"
                          value={entry.sex || 'F'}
                          onChange={e => handleWizardSexChange(safeIndex, e.target.value)}
                        >
                          <option value="F">Female</option>
                          <option value="M">Male</option>
                          <option value="U">Unknown</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-medium">Weight (g)</label>
                        <input
                          type="number"
                          min="0"
                          className="mt-1 w-full border rounded-xl px-3 py-2 text-sm"
                          value={entry.weight}
                          onChange={e => handleWizardWeightChange(safeIndex, e.target.value)}
                          placeholder="e.g., 75"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="text-xs font-medium">Morph / het notes</label>
                        <input
                          className="mt-1 w-full border rounded-xl px-3 py-2 text-sm"
                          value={entry.morph || ''}
                          onChange={e => handleWizardMorphChange(safeIndex, e.target.value)}
                          placeholder="e.g., Pastel Clown 66% Het Hypo"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium">Birth date</label>
                        <input
                          type="date"
                          className="mt-1 w-full border rounded-xl px-3 py-2 text-sm"
                          value={entry.birthDate || ''}
                          onChange={e => handleWizardBirthDateChange(safeIndex, e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-neutral-500">No hatchlings to record.</div>
                )}
              </div>
              <div className="p-4 border-t flex items-center justify-between gap-3">
                <button type="button" className="px-3 py-2 rounded-xl text-sm border" onClick={handleWizardCancel}>Cancel</button>
                <div className="flex items-center gap-2">
                  {safeIndex > 0 && (
                    <button type="button" className="px-3 py-2 rounded-xl text-sm border" onClick={handleWizardPrev}>
                      Previous
                    </button>
                  )}
                  {!isLast && (
                    <button
                      type="button"
                      className={cx('px-3 py-2 rounded-xl text-sm text-white', canAdvance ? primaryBtnClass(theme, true) : primaryBtnClass(theme, false))}
                      onClick={handleWizardNext}
                      disabled={!canAdvance}
                    >
                      Next
                    </button>
                  )}
                  {isLast && (
                    <button
                      type="button"
                      className={cx('px-3 py-2 rounded-xl text-sm text-white', canAdvance ? primaryBtnClass(theme, true) : primaryBtnClass(theme, false))}
                      onClick={handleWizardSave}
                      disabled={!canAdvance}
                    >
                      Save hatchlings
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

          {showImportModal && (
            <div className={cx("fixed inset-0 backdrop-blur-sm flex items-center justify-center p-4 z-50", overlayClass(theme))} onClick={() => setShowImportModal(false)}>
              <div className="bg-white w-full max-w-5xl rounded-2xl shadow-xl border overflow-hidden max-h-[92vh]" onClick={e => e.stopPropagation()}>
                <div className="p-4 border-b flex items-center justify-between">
                  <div className="font-semibold">Import animals</div>
                  <button className="text-sm px-2 py-1" onClick={()=>setShowImportModal(false)}>Close</button>
                </div>
                <div className="p-4 overflow-auto max-h-[80vh]">
                  <ImportSection
                    importText={importText}
                    setImportText={setImportText}
                    importPreview={importPreview}
                    setImportPreview={setImportPreview}
                    runImportPreview={runImportPreview}
                    applyImport={applyImport}
                    theme={theme}
                    onCancel={()=>setShowImportModal(false)}
                  />
                </div>
              </div>
            </div>
          )}

      {/* create pairing modal – breeders only, male-first */}
    {showPairingModal && (
  <div className={cx("fixed inset-0 backdrop-blur-sm flex items-center justify-center p-4 z-50", overlayClass(theme))} onClick={() => setShowPairingModal(false)}>
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-xl border overflow-hidden max-h-[92vh]" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b flex items-center justify-between">
              <div className="font-semibold">Create pairing</div>
              <button className="text-sm px-2 py-1" onClick={()=>setShowPairingModal(false)}>Close</button>
            </div>
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[70vh] overflow-auto">
              {(() => {
                const breederMales = males.filter(isBreeder);
                const breederFemales = females.filter(isBreeder);
                return (
                  <>
                    <div>
                      <label className="text-xs font-medium">Male</label>
                      <select className="mt-1 w-full border rounded-xl px-3 py-2 bg-white" value={draft.maleId||""} onChange={e=>setDraft(d=>({...d,maleId:e.target.value}))}>
                        <option value="">Select male</option>
                        {breederMales.map(m=> {
                          const geneticsTokens = combineMorphsAndHetsForDisplay(m.morphs, m.hets);
                          const geneticsLabel = geneticsTokens.join(' ');
                          return <option key={m.id} value={m.id}>{m.name}{geneticsLabel ? ` • ${geneticsLabel}` : ''}</option>;
                        })}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-medium">Female</label>
                      <select className="mt-1 w-full border rounded-xl px-3 py-2 bg-white" value={draft.femaleId||""} onChange={e=>setDraft(d=>({...d,femaleId:e.target.value}))}>
                        <option value="">Select female</option>
                        {breederFemales.map(f=> {
                          const geneticsTokens = combineMorphsAndHetsForDisplay(f.morphs, f.hets);
                          const geneticsLabel = geneticsTokens.join(' ');
                          return <option key={f.id} value={f.id}>{f.name}{geneticsLabel ? ` • ${geneticsLabel}` : ''}</option>;
                        })}
                      </select>
                    </div>
                  </>
                );
              })()}

              {draft.maleId && draft.femaleId && (
                <div className="sm:col-span-2 text-xs text-neutral-500">
                  Pairing label will be saved as {(currentFemale?.name || draft.femaleId)} × {(currentMale?.name || draft.maleId)}.
                </div>
              )}
              <div className="sm:col-span-2">
                <label className="text-xs font-medium">Starting date</label>
                <input type="date" className="mt-1 w-full border rounded-xl px-3 py-2"
                  value={draft.startDate || ""}
                  onChange={e=>setDraft(d=>({...d,startDate:e.target.value}))} />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-medium">Notes</label>
                <textarea className="mt-1 w-full border rounded-xl px-3 py-2" rows={3} value={draft.notes||""} onChange={e=>setDraft(d=>({...d,notes:e.target.value}))} placeholder="Ultrasound size, rotation plan, etc."/>
              </div>
            </div>
            <div className="p-5 border-t flex items-center justify-between">
              <div className="text-xs text-neutral-500">Appointments generate monthly from the start date. Calendar staggers same-male appointments by 3 days.</div>
              <div className="flex gap-2">
                <button className="px-3 py-2 rounded-xl text-sm border" onClick={()=>setShowPairingModal(false)}>Cancel</button>
                <button
                  className={cx("px-3 py-2 rounded-xl text-sm text-white", draft.femaleId && draft.maleId ? primaryBtnClass(theme,true) : primaryBtnClass(theme,false))}
                  disabled={!draft.femaleId || !draft.maleId}
                  onClick={addPairingFromDraft}
                >
                  Add pairing
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* edit snake */}
    {editSnake && editSnakeDraft && (
  <div className={cx("fixed inset-0 backdrop-blur-sm flex items-center justify-center p-4 z-50", overlayClass(theme))}>
          <div className="bg-white w-full max-w-3xl rounded-2xl shadow-xl border max-h-[92vh] flex flex-col" onClick={e=>e.stopPropagation()}>
            <div className="p-5 border-b flex items-center justify-between">
                        <div className="font-semibold">{editSnake.name}</div>
                        <div className="flex items-center gap-2">
                          <button className="px-3 py-2 rounded-xl text-sm border border-rose-200 text-rose-600"
                            onClick={()=>requestDeleteSnake(editSnake)}>
                            Delete
                          </button>
                          <button className={cx('px-3 py-2 rounded-xl text-sm', primaryBtnClass(theme,true))} onClick={async ()=>{ try { await exportSnakeToPdf(editSnakeDraft, breederInfo, theme, pairings); } catch(e){ console.error(e); alert('Export failed'); } }}>Export PDF</button>
                          <button className={cx('px-3 py-2 rounded-xl text-sm', primaryBtnClass(theme,true))}
                            onClick={()=>{
                              const oldId = editSnake.id;
                              const newId = editSnakeDraft.id || oldId;
                              const normalizedSex = ensureSex(editSnakeDraft.sex, ensureSex(editSnake.sex, 'F'));
                              const normalizedGroups = normalizeSingleGroupValue(editSnakeDraft.groups);
                              setSnakes(prev => prev.map(s => s.id === oldId ? ({ ...editSnakeDraft, id: newId, sex: normalizedSex, groups: normalizedGroups }) : s));
                              setPairings(prev => prev.map(p => ({
                                ...p,
                                maleId: p.maleId === oldId ? newId : p.maleId,
                                femaleId: p.femaleId === oldId ? newId : p.femaleId,
                              })));
                              closeSnakeEditor();
                            }}>Save changes</button>
                          <button className={cx('px-3 py-2 rounded-xl text-sm', primaryBtnClass(theme,true))} onClick={closeSnakeEditor}>Cancel</button>
                        </div>
            </div>

            <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-4 overflow-auto min-h-0 flex-1">
              {/* basics */}
              <div className="md:col-span-1 space-y-1">
                <div>
                  <label className="text-xs font-medium">Name</label>
                  <input className="mt-0.5 w-full border rounded-xl px-2 py-1 text-sm"
                    value={editSnakeDraft.name}
                    onChange={e=>setEditSnakeDraft(d=>({...d,name:e.target.value}))}/>
                </div>
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-xs font-medium">ID</label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="text-[11px] px-2 py-1 border rounded-lg text-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={handleGenerateIdForEditSnake}
                        disabled={Boolean((editSnakeDraft.id || '').trim())}
                      >
                        Generate ID
                      </button>
                      <button
                        type="button"
                        className="text-[11px] px-2 py-1 border rounded-lg text-neutral-700"
                        onClick={handleUpdateIdForEditSnake}
                      >
                        Update ID
                      </button>
                    </div>
                  </div>
                  <input className="mt-0.5 w-full border rounded-xl px-2 py-1 text-sm font-mono" value={editSnakeDraft.id}
                    onChange={e=>setEditSnakeDraft(d=>({...d,id:e.target.value}))} />
                  {!((editSnakeDraft.id || '').trim()) && (
                    <div className="mt-0.5 text-[11px] text-neutral-500">Will use your breeder wizard settings the first time you generate.</div>
                  )}
                </div>
                <div>
                  <label className="text-xs font-medium">Sex</label>
                  <select className="mt-0.5 w-full border rounded-xl px-2 py-1 text-sm bg-white"
                    value={editSnakeDraft.sex}
                    onChange={e=>setEditSnakeDraft(d=>({...d,sex:e.target.value}))}>
                    <option value="F">Female</option>
                    <option value="M">Male</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium">Birth date</label>
                  <input type="date" className="mt-0.5 w-full border rounded-xl px-2 py-1 text-sm"
                    value={editSnakeDraft.birthDate || ''}
                    onChange={e=>setEditSnakeDraft(d=>({...d,birthDate:e.target.value}))} />
                  <div className="text-xs text-neutral-500 mt-0.5">{editSnakeDraft.birthDate ? formatDateForDisplay(editSnakeDraft.birthDate) : ''}</div>
                </div>
                <div>
                  <label className="text-xs font-medium">Morphs</label>
                  <input
                    className="mt-0.5 w-full border rounded-xl px-2 py-1 text-sm"
                    value={formatMorphHetForInput(editSnakeDraft.morphs, editSnakeDraft.hets)}
                    onChange={e=>{
                      const { morphs, hets } = splitMorphHetInput(e.target.value);
                      setEditSnakeDraft(d=>({
                        ...d,
                        morphs,
                        hets,
                      }));
                    }}
                    placeholder="e.g., Clown, Pastel, Het Hypo"
                  />
                  <div className="text-[11px] text-neutral-500 mt-0.5">Enter morphs first, then het traits (prefix het traits with “Het”, “Possible”, or a percentage).</div>
                </div>
                <div>
                  <label className="text-xs font-medium">Weight (g)</label>
                  <input type="number" className="mt-1 w-full border rounded-xl px-2 py-1 text-sm"
                    value={editSnakeDraft.weight}
                    onChange={e=>setEditSnakeDraft(d=>({...d,weight:Number(e.target.value)||0}))}/>
                </div>
                
                {/* Image URL field removed per request */}

                {/* group */}
                <div>
                  <label className="text-xs font-medium">Group</label>
                  <select
                    className="mt-1 w-full border rounded-xl px-2 py-1 text-sm bg-white"
                    value={(Array.isArray(editSnakeDraft.groups) && editSnakeDraft.groups[0]) || ''}
                    onChange={e => {
                      const value = e.target.value.trim();
                      setEditSnakeDraft(d => ({
                        ...d,
                        groups: value ? [value] : [],
                      }));
                    }}
                  >
                    <option value="">No group</option>
                    {groups.map(g => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                  <div className="mt-2 border border-dashed border-neutral-200 rounded-xl p-3 bg-white">
                    <AddGroupInline onAdd={(g)=>{
                      if (!g) return;
                      setGroups(prev => prev.includes(g) ? prev : [...prev, g]);
                      setEditSnakeDraft(d=>({...d, groups: [g]}));
                    }} />
                  </div>
                  <div className="text-[11px] text-neutral-500 mt-1">Existing: {groups.join(", ")||"—"}</div>
                </div>
              </div>

              {/* Genetics picker removed from edit modal per user request */}
              <div className="md:col-span-2 space-y-5">
                {/* Re-add logs editor so feeds/weights/sheds/cleanings/meds can be edited */}
                <div className="mt-4 p-2 border rounded-xl bg-neutral-50">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-medium text-sm">Logs</div>
                    <div className="text-xs text-neutral-500">Edit recent feeds, weights, sheds, cleanings, meds</div>
                  </div>
                  <LogsEditor editSnakeDraft={editSnakeDraft} setEditSnakeDraft={setEditSnakeDraft} lastFeedDefaults={lastFeedDefaults} setLastFeedDefaults={setLastFeedDefaults} />
                </div>

                {/* Image panel moved under logs; upload button sits inside the picture area */}
                <div className="mt-4 flex flex-col items-end gap-3">
                  <div style={{width:318, height:318}} className="rounded-lg overflow-hidden border-2 border-neutral-200 relative">
                    {editSnakeDraft.imageUrl ? (
                      <img src={editSnakeDraft.imageUrl} alt={editSnakeDraft.name} className="w-full h-full object-cover object-center" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-sm text-neutral-500 bg-neutral-50">No image</div>
                    )}
                    {editUploadingPhoto && (
                      <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center text-sm text-neutral-600">
                        Saving pictures…
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <input
                      ref={editCameraInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={handleEditCameraInputChange}
                    />
                    <input
                      ref={editUploadInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={handleEditUploadInputChange}
                    />
                    <button
                      className="text-xs px-2 py-1 border rounded-lg"
                      onClick={triggerEditCameraCapture}
                      disabled={editUploadingPhoto || !editSnake?.id}
                    >
                      Take picture
                    </button>
                    <button
                      className="text-xs px-2 py-1 border rounded-lg"
                      onClick={triggerEditUploadPicker}
                      disabled={editUploadingPhoto || !editSnake?.id}
                    >
                      Upload picture
                    </button>
                    <button
                      className="text-xs px-2 py-1 border rounded-lg"
                      onClick={handleEditViewPictures}
                      disabled={!editSnake?.id}
                    >
                      View pictures{editPhotoCount ? ` (${editPhotoCount})` : ''}
                    </button>
                    <button
                      className="text-xs px-2 py-1 border rounded-lg"
                      onClick={() => {
                        setEditSnakeDraft(prev => prev ? ({ ...prev, imageUrl: undefined }) : prev);
                        setEditSnake(prev => prev ? ({ ...prev, imageUrl: undefined }) : prev);
                      }}
                      disabled={!editSnakeDraft?.imageUrl}
                    >
                      Clear cover
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="py-10" />
      {qrFor && (() => {
        const s = snakes.find(x=>x.id===qrFor);
  return <QRModal id={qrFor} name={s?.name} morphs={s?.morphs} hets={s?.hets} dataUrl={qrDataUrl} onClose={() => setQrFor(null)} />;
      })()}
  <ExportQrModal open={showExportModal} onClose={()=>setShowExportModal(false)} snakes={snakes} groups={groups} onGenerate={(list)=>exportQrToPdf(list, breederInfo)} theme={theme} />
          {showScanner && (
            <QrScannerModal
              onClose={() => setShowScanner(false)}
              onFound={(id) => {
                setShowScanner(false);
                const s = snakes.find(x=>x.id===id);
                if (s) { setEditSnake(s); setEditSnakeDraft(initSnakeDraft(s)); }
                else alert(`No snake found with ID: ${id}`);
              }}
            />
          )}
      <ConfirmDeleteSnakeModal
        snake={pendingDeleteSnake}
        onCancel={cancelDeleteSnake}
        onConfirm={confirmDeleteSnake}
        theme={theme}
      />
        <ScrollToTopButton theme={theme} />
    </div>
  );
}

export {
  splitMorphHetInput,
  computeGeneInitialSegment,
  generateSnakeId,
  extractYearFromDateString,
  extractSequenceFromId,
  normalizeBackupSettings,
  backupFrequencyToMs,
  sanitizeSnakeRecord,
  sanitizePairingRecord,
  normalizeBackupSnapshot,
  normalizeBackupFileEntry,
  normalizeBackupVault,
  normalizeExportFieldSelection,
  ANIMAL_EXPORT_FIELD_DEFS,
  DEFAULT_ANIMAL_EXPORT_FIELDS,
  PAIRING_EXPORT_FIELD_DEFS,
  DEFAULT_PAIRING_EXPORT_FIELDS,
  buildAnimalExportDataset,
  buildPairingExportDataset,
};

    function QrScannerModal({ onClose, onFound }) {
      const qrModuleRef = useRef(null);
      const scannerRef = useRef(null);
      const manualInputRef = useRef(null);
      const [manualValue, setManualValue] = useState('');

      const ensureQrModule = useCallback(async () => {
        if (qrModuleRef.current) return qrModuleRef.current;
        if (typeof window === 'undefined') return null;
        let imported = null;
        try {
          imported = await import('html5-qrcode');
        } catch (err) {
          console.warn('Failed to import html5-qrcode via ESM', err);
        }
        const normalized = {
          Html5Qrcode: imported?.Html5Qrcode || imported?.default?.Html5Qrcode || window.Html5Qrcode || null,
          Html5QrcodeScanner: imported?.Html5QrcodeScanner || imported?.default?.Html5QrcodeScanner || window.Html5QrcodeScanner || null,
        };
        if (!normalized.Html5Qrcode && !normalized.Html5QrcodeScanner) {
          return null;
        }
        qrModuleRef.current = normalized;
        return normalized;
      }, []);

      useEffect(() => {
        let isMounted = true;

        const startScanner = async () => {
          const module = await ensureQrModule();
          if (!isMounted) return;
          if (!module) {
            alert('QR scanner library failed to load. Check your connection and reload.');
            return;
          }
          const target = document.getElementById('qr-scan-root');
          if (!target) return;

          const { Html5QrcodeScanner, Html5Qrcode } = module;

          try {
            if (Html5QrcodeScanner) {
              const instance = new Html5QrcodeScanner('qr-scan-root', { fps: 10, qrbox: 250 }, false);
              scannerRef.current = instance;
              instance.render((decoded) => {
                const id = extractSnakeIdFromPayload(decoded);
                if (!id) return;
                if (isMounted) onFound(id);
                scannerRef.current = null;
                instance.clear().catch(() => {});
              }, () => {});
            } else if (Html5Qrcode) {
              const instance = new Html5Qrcode('qr-scan-root');
              scannerRef.current = instance;
              await instance.start(
                { facingMode: { ideal: 'environment' } },
                { fps: 10, qrbox: 250 },
                (decoded) => {
                  const id = extractSnakeIdFromPayload(decoded);
                  if (!id) return;
                  if (isMounted) onFound(id);
                  const current = scannerRef.current;
                  scannerRef.current = null;
                  if (current) {
                    const stopPromise = typeof current.stop === 'function' ? current.stop().catch(() => {}) : Promise.resolve();
                    stopPromise.then(() => {
                      if (typeof current.clear === 'function') current.clear().catch(() => {});
                      if (typeof current.close === 'function') current.close().catch(() => {});
                    });
                  }
                },
                () => {}
              );
            } else {
              throw new Error('html5-qrcode module unavailable');
            }
          } catch (err) {
            console.error('QR importer failed', err);
            if (isMounted) alert('Unable to start QR scanner. Verify camera permissions and try again.');
          }
        };

        startScanner();

        return () => {
          isMounted = false;
          const instance = scannerRef.current;
          scannerRef.current = null;
          if (instance) {
            const tasks = [];
            if (typeof instance.stop === 'function') tasks.push(instance.stop().catch(() => {}));
            if (typeof instance.clear === 'function') tasks.push(instance.clear().catch(() => {}));
            if (typeof instance.close === 'function') tasks.push(instance.close().catch(() => {}));
            if (tasks.length) {
              Promise.allSettled(tasks).catch(() => {});
            }
          }
        };
      }, [ensureQrModule, onFound]);

      const handleFile = async (e) => {
        const f = e.target.files && e.target.files[0];
        if (!f) return;
        if (e.target) e.target.value = '';
        try {
          const module = await ensureQrModule();
          let decodedText = null;

          if (module && module.Html5Qrcode) {
            const { Html5Qrcode } = module;
            try {
              let decodedPayload = null;
              if (typeof Html5Qrcode.scanFileV2 === 'function') {
                decodedPayload = await Html5Qrcode.scanFileV2(f, true);
              } else if (typeof Html5Qrcode.scanFile === 'function') {
                decodedPayload = await Html5Qrcode.scanFile(f, true);
              }
              decodedText = extractDecodedText(decodedPayload);
            } catch (scanErr) {
              console.warn('html5-qrcode file scan failed, will fall back to jsQR', scanErr);
            }
          }

          if (!decodedText) {
            decodedText = await decodeQrFromImageFile(f);
          }

          if (!decodedText) {
            alert('Could not read a QR code from that image. Try a clearer, well-lit photo.');
            return;
          }

          const id = extractSnakeIdFromPayload(decodedText);
          if (!id) {
            alert('Could not parse an ID from that QR code.');
            return;
          }
          onFound(id);
        } catch (err) {
          console.error('file scan failed', err);
          alert('Failed to scan uploaded image');
        }
      };

      const handleManualSubmit = useCallback(() => {
        const value = manualValue.trim();
        if (!value) {
          alert('Scan or paste a QR value first.');
          return;
        }
        const id = extractSnakeIdFromPayload(value);
        if (!id) {
          alert('Scan or paste a QR value first.');
          return;
        }
        setManualValue('');
        onFound(id);
      }, [manualValue, onFound]);

      const handleManualKeyDown = (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleManualSubmit();
        }
      };

      const hasManualValue = manualValue.trim().length > 0;

      return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
          <div className="bg-white p-4 rounded-lg shadow w-full max-w-md" onClick={e=>e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <div className="font-medium text-lg">Scan QR Code</div>
                <div className="text-xs text-neutral-500 mt-1">Point your device camera at a QR code printed from this app. Allow camera access when prompted.</div>
              </div>
              <button className="text-sm px-2 py-1 border rounded" onClick={onClose}>✕</button>
            </div>

            <div className="mt-3">
              <div id="qr-scan-root" className="w-full h-56 rounded-lg border-2 border-dashed border-neutral-200 flex items-center justify-center bg-neutral-50">
                <div className="text-center text-sm text-neutral-500">Align the QR inside the box</div>
              </div>
            </div>

            <div className="mt-3 text-xs text-neutral-500">Tip: For best results, hold the camera steady and ensure the code is well-lit. If your device can't use the camera, upload a photo of the QR below.</div>

            <div className="mt-3 flex items-center gap-2">
              <label className="text-sm">Or upload image:</label>
              <input type="file" accept="image/*" onChange={handleFile} />
            </div>

            <div className="mt-4 border-t border-neutral-200 pt-4">
              <div className="text-sm font-medium">Using a USB / handheld scanner?</div>
              <div className="text-xs text-neutral-500 mt-1">
                Most external QR readers act like keyboards. Click the field below, then trigger your scanner to fill it.
              </div>
              <div className="mt-2 flex flex-col sm:flex-row gap-2">
                <input
                  ref={manualInputRef}
                  type="text"
                  value={manualValue}
                  onChange={(e) => setManualValue(e.target.value)}
                  onKeyDown={handleManualKeyDown}
                  className="flex-1 border rounded-lg px-3 py-2 text-sm font-mono"
                  placeholder="Scan or paste the QR contents here"
                  inputMode="text"
                  autoComplete="off"
                />
                <button
                  type="button"
                  className={cx('px-3 py-2 rounded-lg text-sm border transition-colors', hasManualValue ? 'bg-sky-600 text-white border-sky-600' : 'bg-neutral-100 text-neutral-400 border-neutral-200 cursor-not-allowed')}
                  onClick={handleManualSubmit}
                  disabled={!hasManualValue}
                >
                  Look up
                </button>
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <button className="px-3 py-2 rounded-lg border" onClick={onClose}>Close</button>
            </div>
          </div>
        </div>
      );
    }

// small comps
function ConfirmDeleteSnakeModal({ snake, onCancel, onConfirm, theme = 'blue' }) {
  if (!snake) return null;
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-[70]" onClick={onCancel}>
      <div className="bg-white w-full max-w-sm rounded-2xl shadow-xl border p-5" onClick={e=>e.stopPropagation()}>
        <div className="font-semibold text-lg">Delete {snake.name || 'this snake'}?</div>
        <p className="mt-2 text-sm text-neutral-600 leading-relaxed">
          This removes the animal and detaches any pairings linked to it. Demo animals will return automatically whenever your collection is empty, so you always have something to explore.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button className="px-3 py-2 rounded-xl text-sm border" onClick={onCancel}>Cancel</button>
          <button
            className={cx('px-3 py-2 rounded-xl text-sm text-white', theme === 'dark' ? 'bg-rose-500 hover:bg-rose-600' : 'bg-rose-600 hover:bg-rose-700')}
            onClick={onConfirm}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function themeClasses(theme) {
  if (theme === 'green') return { active: 'bg-emerald-600 text-white border-emerald-600', soft: 'bg-emerald-300' };
  if (theme === 'dark') return { active: 'bg-neutral-800 text-white border-neutral-700', soft: 'bg-neutral-600' };
  return { active: 'bg-sky-600 text-white border-sky-600', soft: 'bg-sky-300' };
}

function primaryBtnClass(theme, filled=true) {
  if (theme === 'green') return filled ? 'bg-emerald-600 text-white' : 'bg-emerald-300 text-white';
  if (theme === 'dark') return filled ? 'bg-neutral-800 text-white' : 'bg-neutral-600 text-white';
  return filled ? 'bg-sky-600 text-white' : 'bg-sky-300 text-white';
}

function overlayClass(theme) {
  if (theme === 'green') return 'bg-emerald-900/20';
  if (theme === 'dark') return 'bg-neutral-900/40';
  return 'bg-sky-900/20';
}

function TabButton({ theme='blue', active, onClick, children }) {
  const cls = themeClasses(theme);
  return (
    <button
      className={cx(
        "px-3 py-1.5 rounded-lg text-sm border",
        active ? cls.active : "bg-white hover:bg-neutral-50"
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Card({ title, children }) {
  return (
    <div className="bg-white border rounded-2xl shadow-sm">
      <div className="px-4 py-3 border-b font-semibold">{title}</div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function Badge({ children }) {
  return <span className="px-2 py-0.5 text-xs rounded-full border bg-neutral-50">{children}</span>;
}

function GroupCheckboxes({
  groups,
  showGroups,
  setShowGroups,
  hiddenGroups,
  setHiddenGroups,
  showUnassigned = true,
  setShowUnassigned
}) {
  const toggleShow = (group) => {
    if (typeof setShowGroups !== 'function' || typeof setHiddenGroups !== 'function') return;
    setShowGroups(prev => {
      const next = new Set(prev || []);
      if (next.has(group)) {
        next.delete(group);
      } else {
        next.add(group);
        setHiddenGroups(prevHide => (prevHide || []).filter(g => g !== group));
      }
      return [...next];
    });
  };

  const toggleHide = (group) => {
    if (typeof setHiddenGroups !== 'function' || typeof setShowGroups !== 'function') return;
    setHiddenGroups(prev => {
      const next = new Set(prev || []);
      if (next.has(group)) {
        next.delete(group);
      } else {
        next.add(group);
        setShowGroups(prevShow => (prevShow || []).filter(g => g !== group));
      }
      return [...next];
    });
  };

  const handleClear = () => {
    if (typeof setShowGroups === 'function') setShowGroups([]);
    if (typeof setHiddenGroups === 'function') setHiddenGroups([]);
  };

  const handleToggleUnassigned = () => {
    if (typeof setShowUnassigned === 'function') {
      setShowUnassigned(prev => !prev);
    }
  };

  const showSet = new Set(showGroups || []);
  const hideSet = new Set(hiddenGroups || []);
  const filtersActive = showSet.size > 0 || hideSet.size > 0;

  return (
    <div className="space-y-2 mb-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <button
          type="button"
          disabled={!filtersActive}
          className={cx(
            'px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors',
            filtersActive
              ? 'bg-white hover:bg-neutral-50 border-neutral-300'
              : 'bg-neutral-100 text-neutral-400 border-neutral-200 cursor-not-allowed'
          )}
          onClick={handleClear}
        >
          Clear filters
        </button>
        <button
          type="button"
          className={cx('px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors', showUnassigned ? 'bg-amber-100 border-amber-300 text-amber-900' : 'bg-white hover:bg-neutral-50 border-neutral-300')}
          onClick={handleToggleUnassigned}
        >
          {showUnassigned ? 'Hide unassigned' : 'Show unassigned'}
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {groups.map(group => {
          const status = showSet.has(group) ? 'show' : hideSet.has(group) ? 'hide' : 'neutral';
          return (
            <div
              key={group}
              className={cx(
                'inline-flex items-center gap-1 text-sm px-2.5 py-1 rounded-lg border transition-colors',
                status === 'show'
                  ? 'bg-emerald-50 border-emerald-400 text-emerald-700'
                  : status === 'hide'
                    ? 'bg-rose-50 border-rose-400 text-rose-700'
                    : 'bg-white border-neutral-300 text-neutral-700'
              )}
            >
              <span className="font-medium mr-0.5">{group}</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => toggleShow(group)}
                  className={cx(
                    'px-1.5 py-0.5 rounded-md border text-[10px] uppercase tracking-wide',
                    status === 'show'
                      ? 'bg-emerald-500 border-emerald-500 text-white'
                      : 'bg-white border-neutral-300 text-neutral-600 hover:bg-neutral-50'
                  )}
                >
                  Show
                </button>
                <button
                  type="button"
                  onClick={() => toggleHide(group)}
                  className={cx(
                    'px-1.5 py-0.5 rounded-md border text-[10px] uppercase tracking-wide',
                    status === 'hide'
                      ? 'bg-rose-500 border-rose-500 text-white'
                      : 'bg-white border-neutral-300 text-neutral-600 hover:bg-neutral-50'
                  )}
                >
                  Hide
                </button>
              </div>
            </div>
          );
        })}
        {!groups.length && <span className="text-xs text-neutral-500">No groups yet.</span>}
      </div>
    </div>
  );
}

function QRModal({ id, name, morphs, hets, dataUrl, onClose }) {
  if (!id) return null;
  const geneticsTokens = combineMorphsAndHetsForDisplay(morphs, hets);
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white p-4 rounded-lg shadow" onClick={e=>e.stopPropagation()}>
        <div className="font-medium mb-2">QR for {name || id}</div>
        <div className="text-sm text-neutral-500 mb-2">ID: <span className="font-mono">{id}</span></div>
        <div className="space-y-1 mb-3">
          {geneticsTokens.length ? <GeneLine label="Genetics" genes={geneticsTokens} size="md" /> : <div className="text-xs text-neutral-500 uppercase tracking-wide">Genetics: -</div>}
        </div>
        {dataUrl ? <img src={dataUrl} className="w-64 h-64" alt={`QR ${id}`} /> : <div className="w-64 h-64 flex items-center justify-center">Generating…</div>}
        <div className="mt-3 flex gap-2">
          {dataUrl && <a className="px-3 py-2 rounded-lg text-sm border" download={`snake-${id}.png`} href={dataUrl}>Download</a>}
          <button className="px-3 py-2 rounded-lg text-sm border" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

function ExportQrModal({ open, onClose, snakes, groups, onGenerate, theme='blue' }) {
  const [mode, setMode] = useState('all'); // all | groups | selected
  const [selectedGroupsLocal, setSelectedGroupsLocal] = useState([]);
  const [selectedSnakesLocal, setSelectedSnakesLocal] = useState([]);

  useEffect(()=>{ if (!open) { setMode('all'); setSelectedGroupsLocal([]); setSelectedSnakesLocal([]); } }, [open]);

  const handleGenerate = async () => {
    let toExport = [];
    if (mode === 'all') toExport = snakes;
    else if (mode === 'groups') {
      toExport = snakes.filter(s => (s.groups||[]).some(g=>selectedGroupsLocal.includes(g)));
    } else {
      toExport = snakes.filter(s => selectedSnakesLocal.includes(s.id));
    }
    onGenerate(toExport);
    onClose();
  };

  return open ? (
    <div className={cx("fixed inset-0 flex items-center justify-center p-4 z-50", overlayClass(theme))} onClick={onClose}>
      <div className="bg-white p-4 rounded-lg shadow w-full max-w-2xl" onClick={e=>e.stopPropagation()}>
        <div className="font-medium mb-2">Export QR to PDF (100mm × 50mm)</div>
        <div className="space-y-3">
          <div>
            <label className="inline-flex items-center gap-2"><input type="radio" checked={mode==='all'} onChange={()=>setMode('all')} /> All snakes</label>
          </div>
          <div>
            <label className="inline-flex items-center gap-2"><input type="radio" checked={mode==='groups'} onChange={()=>setMode('groups')} /> By groups</label>
            {mode==='groups' && (
              <div className="mt-2 flex flex-wrap gap-2">
                {groups.map(g=>{
                  const checked = selectedGroupsLocal.includes(g);
                  return <label key={g} className="inline-flex items-center gap-2 px-2 py-1 border rounded-lg"><input type="checkbox" checked={checked} onChange={e=>{
                    const on = e.target.checked; setSelectedGroupsLocal(prev=>{
                      const set = new Set(prev||[]); on?set.add(g):set.delete(g); return [...set];
                    });
                  }} />{g}</label>;
                })}
              </div>
            )}
          </div>
          <div>
            <label className="inline-flex items-center gap-2"><input type="radio" checked={mode==='selected'} onChange={()=>setMode('selected')} /> Selected snakes</label>
            {mode==='selected' && (
              <div className="mt-2 max-h-40 overflow-auto border rounded p-2">
                {snakes.map(s=>{
                  const checked = selectedSnakesLocal.includes(s.id);
                  return <label key={s.id} className="flex items-center gap-2"><input type="checkbox" checked={checked} onChange={e=>{
                    const on = e.target.checked; setSelectedSnakesLocal(prev=>{
                      const set = new Set(prev||[]); on?set.add(s.id):set.delete(s.id); return [...set];
                    });
                  }} />{s.name} <span className="text-xs text-neutral-500">{s.id}</span></label>;
                })}
              </div>
            )}
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button className="px-3 py-2 rounded-lg border" onClick={onClose}>Cancel</button>
          <button className={cx('px-3 py-2 rounded-lg text-white', primaryBtnClass(theme,true))} onClick={handleGenerate}>Generate PDF</button>
        </div>
      </div>
    </div>
  ) : null;
}

const PT_TO_MM = 0.352778;

function fitTextToWidth(doc, text, maxWidth, maxFontSize = 18, minFontSize = 8) {
  if (!text) return minFontSize;
  let size = maxFontSize;
  while (size >= minFontSize) {
    doc.setFontSize(size);
    if (doc.getTextWidth(text) <= maxWidth) return size;
    size -= 1;
  }
  doc.setFontSize(minFontSize);
  return minFontSize;
}

function estimateLineHeight(fontSize, multiplier = 1.2) {
  return fontSize * PT_TO_MM * multiplier;
}

const canUseCanvas = typeof document !== 'undefined' && typeof document.createElement === 'function';

async function createQrDataUrl(text, logoUrl) {
  const size = 600;
  try {
    if (canUseCanvas) {
      const canvas = document.createElement('canvas');
      await new Promise((resolve, reject) => {
        QRCode.toCanvas(canvas, text, { width: size, margin: 1 }, err => err ? reject(err) : resolve());
      });
      if (logoUrl) {
        try {
          const ctx = canvas.getContext('2d');
          if (ctx) {
            const logo = await loadImageElement(logoUrl);
            const logoRatio = 0.2;
            const logoSize = size * logoRatio;
            const padding = logoSize * 0.25;
            const logoX = (size - logoSize) / 2;
            const logoY = (size - logoSize) / 2;
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(logoX - padding / 2, logoY - padding / 2, logoSize + padding, logoSize + padding);
            ctx.drawImage(logo, logoX, logoY, logoSize, logoSize);
          }
        } catch (logoErr) {
          console.warn('Unable to overlay logo on QR code', logoErr);
        }
      }
      return canvas.toDataURL('image/png');
    }
  } catch (e) {
    console.warn('Falling back to basic QR generation', e);
  }
  return await QRCode.toDataURL(text, { width: size, margin: 1 });
}

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function exportQrToPdf(snakesToExport, breederInfo = {}) {
  const { jsPDF } = await import('jspdf');
  const pageW = 100;
  const pageH = 50;
  const margin = 6;
  const doc = new jsPDF({ unit: 'mm', format: [pageW, pageH], orientation: 'landscape' });

  for (let i = 0; i < snakesToExport.length; i++) {
    const s = snakesToExport[i];
    const url = `${window.location.origin}${window.location.pathname}#snake=${encodeURIComponent(s.id)}`;
    try {
      const dataUrl = await createQrDataUrl(url, breederInfo?.logoUrl);
      const qrSize = Math.min(pageH - margin * 2, 38);
      const qrX = margin;
      const qrY = (pageH - qrSize) / 2;
      doc.addImage(dataUrl, 'PNG', qrX, qrY, qrSize, qrSize);

      const framePadding = 1.5;
      doc.setDrawColor(50);
      doc.setLineWidth(0.3);
      doc.rect(qrX - framePadding, qrY - framePadding, qrSize + framePadding * 2, qrSize + framePadding * 2);

      const textWidth = Math.max(20, pageW - margin - (qrX + qrSize) - 8);
      const nameText = s.name || 'Unnamed';
      const idText = s.id ? `ID: ${s.id}` : '';
  const geneticsTokens = combineMorphsAndHetsForDisplay(s.morphs, s.hets);
  const geneticsText = geneticsTokens.join(', ');

      const nameFont = fitTextToWidth(doc, nameText, textWidth, 18, 10);
      const idFont = 10;
      let geneticsFont = 9;
      const minGeneticsFont = 6;

      doc.setFontSize(nameFont);
      const nameLines = doc.splitTextToSize(nameText, textWidth);
      const nameLineHeight = estimateLineHeight(nameFont, 1);
      const nameHeight = nameLines.length * nameLineHeight;

  const geneticsSections = geneticsText ? [`Genetics: ${geneticsText}`] : [];

      const maxContentHeight = pageH - margin * 2;

      const calculateGeneticsLayout = (fontSize) => {
        doc.setFontSize(fontSize);
        const lines = [];
        geneticsSections.forEach(section => {
          const sectionLines = doc.splitTextToSize(section, textWidth);
          lines.push(...sectionLines);
        });
        const height = lines.length ? lines.length * estimateLineHeight(fontSize, 1) : 0;
        return { lines, height };
      };

      let { lines: geneticsLines, height: geneticsHeight } = calculateGeneticsLayout(geneticsFont);

      const spacingAfterName = 3;
      let spacingAfterId = geneticsLines.length ? 2 : 0;
      const idHeight = idText ? estimateLineHeight(idFont, 1) : 0;
      let totalHeight = nameHeight + spacingAfterName + idHeight + spacingAfterId + geneticsHeight;

      while (totalHeight > maxContentHeight && geneticsFont > minGeneticsFont) {
        geneticsFont -= 1;
        ({ lines: geneticsLines, height: geneticsHeight } = calculateGeneticsLayout(geneticsFont));
        spacingAfterId = geneticsLines.length ? 2 : 0;
        totalHeight = nameHeight + spacingAfterName + idHeight + spacingAfterId + geneticsHeight;
      }

      let textY = (pageH - totalHeight) / 2;
      if (textY < margin) textY = margin;
      const textX = qrX + qrSize + 8;

    try { doc.setFont(undefined, 'bold'); } catch (e) {}
    doc.setFontSize(nameFont);
    doc.text(nameLines, textX, textY, { baseline: 'top' });
    textY += nameHeight + spacingAfterName;

      try { doc.setFont(undefined, 'normal'); } catch (e) {}
      if (idText) {
        doc.setFontSize(idFont);
        doc.text(idText, textX, textY, { baseline: 'top' });
        textY += idHeight + spacingAfterId;
      }

      if (geneticsLines.length) {
        doc.setFontSize(geneticsFont);
        doc.text(geneticsLines, textX, textY, { baseline: 'top' });
      }

    } catch (err) {
      console.error('QR gen failed', err);
    }

    doc.setDrawColor(120);
    doc.setLineWidth(0.4);
    doc.rect(1.5, 1.5, pageW - 3, pageH - 3);

    if (i < snakesToExport.length - 1) doc.addPage([pageW, pageH], 'landscape');
  }

  doc.save('qr-labels.pdf');
}

async function exportSnakeToPdf(snake, breederInfo = {}, theme='blue', pairings = []) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = 210; const pageH = 297; const left = 15; let y = 20;
  const margin = 8;

  const themeColors = { blue: '#1E40AF', green: '#059669', dark: '#374151' };
  const frameColor = themeColors[theme] || themeColors.blue;
  const normalizedSnakeSex = normalizeSexValue(snake?.sex);
  const breedingCyclesByYear = normalizedSnakeSex === 'F' ? getFemaleBreedingCyclesByYear(snake?.id, pairings) : [];

  // helper: convert #rrggbb to rgb object
  function hexToRgb(hex) {
    if (!hex) return { r: 0, g: 0, b: 0 };
    const h = String(hex).replace('#','');
    const bigint = parseInt(h.length === 3 ? h.split('').map(c=>c+c).join('') : h, 16);
    return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 };
  }

  function headerLabel(k) {
    if (!k) return '';
    // replace camelCase/snake-case/underscores with spaces, then Title Case
  const spaced = String(k).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ');
    return spaced.split(/\s+/).map(w => w ? (w.charAt(0).toUpperCase() + w.slice(1)) : '').join(' ');
  }

  // helper to draw the frame and header (logo + breeder info + snake basic header)
  function drawPageDecor(isFirstPage = false) {
    // draw frame
    doc.setDrawColor(frameColor);
    doc.setLineWidth(1.5);
    doc.rect(margin, margin, pageW - margin*2, 297 - margin*2);

    if (isFirstPage) {
      // top area for first page only
      y = 20;
      try {
        if (breederInfo && breederInfo.logoUrl) {
          try { doc.addImage(breederInfo.logoUrl, 'PNG', left, y, 20, 20); } catch(e) { /* ignore */ }
        }
      } catch (e) {}
      const infoX = left + 24;
      doc.setFontSize(14);
      if (breederInfo.businessName) {
        doc.text(breederInfo.businessName, infoX, y + 6);
        doc.setFontSize(12);
        doc.text(breederInfo.name || '', infoX, y + 12);
      } else if (breederInfo.name) {
        doc.text(breederInfo.name, infoX, y + 6);
      }
      doc.setFontSize(10);
      const contact = [];
      if (breederInfo.email) contact.push(breederInfo.email);
      if (breederInfo.phone) contact.push(breederInfo.phone);
      if (contact.length) doc.text(contact.join(' • '), infoX, y + 18);
      // separator: end of header area
      const sepY1 = y + 26;
      doc.setLineWidth(0.6);
      doc.setDrawColor(180);
      doc.line(margin + 4, sepY1, pageW - margin - 4, sepY1);

      // advance y to after separator
      y = sepY1 + 6;

      // snake header (centered, multi-line on first page)
      doc.setFontSize(16); doc.text(snake.name || '', pageW/2, y, { align: 'center' }); y += 10;
      doc.setFontSize(10);
      doc.text(`ID: ${snake.id || ''}`, left, y); doc.text(`Sex: ${snake.sex || ''}`, left + 70, y); doc.text(`Birth date: ${snake.birthDate ? formatDateForDisplay(snake.birthDate) : ''}`, left + 110, y);
      y += 7;
      doc.text(`Weight: ${snake.weight || ''} g`, left, y); doc.text(`Groups: ${(snake.groups||[]).join(', ')}`, left + 70, y);
      y += 8;
  const geneticsTokens = combineMorphsAndHetsForDisplay(snake.morphs, snake.hets);
  const geneticsLine = geneticsTokens.length ? geneticsTokens.join(', ') : '-';
  doc.text(`Genetics: ${geneticsLine}`, left, y);
      y += 8;
      // separator between snake info and data
      const sepY2 = y + 2;
      doc.setLineWidth(0.6);
      doc.setDrawColor(180);
      doc.line(margin + 4, sepY2, pageW - margin - 4, sepY2);
      y = sepY2 + 8;
    } else {
      // subsequent pages: start a bit below the top without additional header content
      y = margin + 18;
    }
  }

  // initialize first page decor
  drawPageDecor(true);

  // Logs summary: render tables for each log type and include a footer row with the count
  const logs = snake.logs || {};
  const usableWidth = pageW - left * 2;

  const bottomLimit = pageH - margin - 6; // leave small margin inside frame
  function ensureSpace(addHeight, onNewPage) {
    if (y + addHeight > bottomLimit) {
      // move to next page so content doesn't overflow the frame
      doc.addPage();
      drawPageDecor(false);
      if (typeof onNewPage === 'function') onNewPage();
      return true;
    }
    return false;
  }

  function drawTable(title, columns, rows, opts = {}) {
  const headerH = 9;
  const cellFontSize = opts.cellFontSize || 10;
  const minRowH = Math.max(4, Math.round((cellFontSize * 0.35278) * 0.8));
  const lineHeight = (cellFontSize * 0.35278) * 1.05; // approximate mm per line (pt -> mm)
    const colCount = columns.length;
    const colWidths = columns.map(c => c.width || (usableWidth / colCount));

    function renderTableTitleAndHeader() {
      // title
      doc.setFontSize(12); doc.text(title, left, y); y += 8;

      // header background + titles
      let x = left;
      const hdr = hexToRgb(frameColor);
      doc.setFillColor(hdr.r, hdr.g, hdr.b);
      // fill the entire header row once so there are no white gaps between columns
      doc.rect(left, y, usableWidth, headerH, 'F');
      for (let i=0;i<colCount;i++) {
        // stroke border (black)
        doc.setDrawColor(0);
        doc.setLineWidth(0.3);
        doc.rect(x, y, colWidths[i], headerH, 'S');
        doc.setFontSize(8);
        doc.setTextColor(255);
        try { doc.setFont(undefined, 'bold'); } catch(e) {}
        const lbl = headerLabel(columns[i].title || columns[i].key || '');
        const centerX = x + (colWidths[i] / 2);
        const centerY = y + (headerH / 2);
        doc.text(String(lbl), centerX, centerY, { align: 'center', baseline: 'middle' });
        try { doc.setFont(undefined, 'normal'); } catch(e) {}
        x += colWidths[i];
      }
      y += headerH;
      doc.setFontSize(cellFontSize); doc.setTextColor(10);
    }

    // initial header (render or page-break as needed)
    const didPage = ensureSpace(10 + headerH, renderTableTitleAndHeader);
    if (!didPage) renderTableTitleAndHeader();

    // render rows with wrapping and dynamic row height
    rows.forEach((r, rowIndex) => {
      // prepare cell lines for this row
      doc.setFontSize(cellFontSize);
      let maxLines = 1;
      const cellLines = [];
      for (let i=0;i<colCount;i++) {
        const key = columns[i].key;
        let val = '';
        if (typeof key === 'function') val = key(r) || '';
        else val = (r && typeof r[key] !== 'undefined') ? r[key] : '';
        let txt = '';
        if (val === null || typeof val === 'undefined') txt = '';
        else if (typeof val === 'boolean') txt = val ? 'Yes' : 'No';
        else if (Array.isArray(val)) txt = val.join(', ');
        else if (typeof val === 'object') txt = JSON.stringify(val);
        else txt = String(val);
        const colKey = (typeof key === 'string') ? key : columns[i].title;
        if (typeof txt === 'string' && (colKey === 'date' || /date$/i.test(String(colKey)))) txt = formatDateForDisplay(txt) || txt;
        const lines = doc.splitTextToSize(txt, Math.max(10, colWidths[i] - 4));
        cellLines.push(lines);
        if (lines.length > maxLines) maxLines = lines.length;
      }
      // compute row height: top/bottom padding 4mm total
      const paddingV = 4;
      const rowH = Math.max(minRowH, Math.ceil(maxLines * lineHeight)) + paddingV;

      // ensure space for this row (and render header on new page if needed)
      ensureSpace(rowH + 2, renderTableTitleAndHeader);

      // draw each cell's border and text (top-aligned)
      let cx = left;
      for (let i=0;i<colCount;i++) {
        const w = colWidths[i];
        // draw cell border
        doc.setDrawColor(0);
        doc.setLineWidth(0.25);
        doc.rect(cx, y, w, rowH, 'S');
        // draw cell text starting at y + 2mm padding
        const lines = cellLines[i] || [''];
        const textX = cx + 3;
        const textY = y + (rowH / 2) - ((lines.length - 1) * lineHeight) / 2;
        // use array form to render wrapped lines, vertically centered
        doc.setFontSize(cellFontSize);
        doc.text(lines, textX, textY);
        cx += w;
      }
      y += rowH;
    });

    // footer with count inside the table (spanning full width)
  // footer: draw boxed footer cell spanning full table width
  const footerH = Math.max(minRowH, Math.ceil(lineHeight)) + 4;
  ensureSpace(footerH + 2, renderTableTitleAndHeader);
  // draw footer box
  doc.setDrawColor(0);
  doc.setLineWidth(0.3);
  doc.rect(left, y, usableWidth, footerH, 'S');
  doc.setFontSize(Math.max(8, cellFontSize));
  // vertically center the text within footer
  const footerTextY = y + 2 + (lineHeight/2);
  doc.text(`Total entries: ${rows.length}`, left + 3, footerTextY);
  y += footerH + 4;

    const spacingAfterTable = typeof opts.spacingAfter === 'number' ? opts.spacingAfter : 0;
    if (spacingAfterTable > 0) {
      const broke = ensureSpace(spacingAfterTable, null);
      if (!broke) y += spacingAfterTable;
    }

  }

  function drawSectionSeparator() {
    const paddingBefore = 2;
    const paddingAfter = 4;
    const needed = paddingBefore + paddingAfter + 1;
    const broke = ensureSpace(needed, null);
    if (broke) return;
    y += paddingBefore;
    doc.setDrawColor(200);
    doc.setLineWidth(0.4);
    doc.line(left, y, left + usableWidth, y);
    y += paddingAfter;
  }

  function drawBreedingCyclesSection(groups) {
    if (!Array.isArray(groups) || !groups.length) return;

    const sectionHeading = () => {
      doc.setFontSize(12);
      doc.text('Breeding cycles', left, y);
      y += 7;
    };

    const renderGroupHeading = (yearLabel) => {
      doc.setFontSize(10);
      doc.text(String(yearLabel), left, y);
      y += 5.5;
    };

    sectionHeading();

    const lineFontSize = 9;
    const indent = 4;
    const cycleLineHeight = estimateLineHeight(lineFontSize, 1.05);

    groups.forEach(group => {
      ensureSpace(6, () => {
        drawPageDecor(false);
        sectionHeading();
      });
      renderGroupHeading(group.year);

      (group.cycles || []).forEach(cycle => {
        const lines = [];
        const pairingLabel = cycle.label || `Pairing ${cycle.id || ''}`;
        lines.push(`• ${pairingLabel}`);

        if (cycle.locks && cycle.locks.length) {
          const lockText = cycle.locks
            .map(lock => lock.display || formatDateTimeForDisplay(lock.iso))
            .filter(Boolean)
            .join(', ');
          if (lockText) lines.push(`   Locks: ${lockText}`);
        }
        if (cycle.ovulationDate) lines.push(`   Ovulation: ${formatDateForDisplay(cycle.ovulationDate)}`);
        if (cycle.preLayDate) lines.push(`   Pre-Lay Shed: ${formatDateForDisplay(cycle.preLayDate)}`);
        if (cycle.clutchDate) lines.push(`   Eggs laid: ${formatDateForDisplay(cycle.clutchDate)}`);
        if (cycle.hatchDate) lines.push(`   Hatched: ${formatDateForDisplay(cycle.hatchDate)}`);
        if (lines.length === 1) lines.push('   No events recorded');

        const wrapped = lines.flatMap(line => doc.splitTextToSize(line, usableWidth - indent));
        const blockHeight = wrapped.length * cycleLineHeight + 2;

        ensureSpace(blockHeight + 2, () => {
          drawPageDecor(false);
          sectionHeading();
          renderGroupHeading(group.year);
        });

        doc.setFontSize(lineFontSize);
        doc.text(wrapped, left + indent, y, { baseline: 'top' });
        y += blockHeight;
      });

      y += 2;
    });
  }

  // Feeds (explicit columns)
  if (breedingCyclesByYear.length) {
    drawBreedingCyclesSection(breedingCyclesByYear);
    drawSectionSeparator();
  }

  const feedsRows = (logs.feeds||[]).slice().reverse();
  const feedsCols = [
    { title: 'Date', key: 'date', width: 26 },
    { title: 'Food', key: 'feed', width: 46 },
    { title: 'Size', key: (r) => {
        if (!r) return '';
        const candidates = [r.size, r.sizeDetail, r.preySize, r.portionSize, r.itemSize];
        const found = candidates.find(v => typeof v === 'string' && v.trim().length) || candidates.find(v => typeof v === 'number');
        if (typeof found === 'number') return `${found}`;
        return found || '';
      }, width: 30 },
    { title: 'Weight', key: (r) => (r && (r.weightGrams || r.grams)) ? `${r.weightGrams || r.grams} g` : '' , width: 24 },
    { title: 'Form', key: (r) => {
        const m = r && (r.method || r.form);
        const md = r && (r.methodDetail || r.formDetail);
        if (!m) return '';
        return m === 'Other' ? (md || 'Other') : m;
      }, width: 36 },
    { title: 'Notes', key: 'notes', width: usableWidth - (26+46+30+24+36) }
  ];
  drawTable('Feed', feedsCols, feedsRows, { cellFontSize: 6, spacingAfter: 0 });
  drawSectionSeparator();

  // Weights
  const weightsRows = (logs.weights||[]).slice().reverse();
  const weightsCols = [
    { title: 'Date', key: 'date', width: 30 },
    { title: 'Grams', key: (r) => (r && typeof r.grams !== 'undefined') ? `${r.grams} g` : '' , width: 30 },
    { title: 'Notes', key: 'notes', width: usableWidth - (30+30) }
  ];
  drawTable('Weights', weightsCols, weightsRows, { cellFontSize: 6, spacingAfter: 0 });
  drawSectionSeparator();

  // Cleanings
  const cleanRows = (logs.cleanings||[]).slice().reverse();
  const cleanCols = [
    { title: 'Date', key: 'date', width: 30 },
    { title: 'Type', key: (r) => (r && r.deep) ? 'Deep cleaning' : 'Quick cleaning', width: 40 },
    { title: 'Notes', key: 'notes', width: usableWidth - (30+40) }
  ];
  drawTable('Cleanings', cleanCols, cleanRows, { cellFontSize: 6, spacingAfter: 0 });
  drawSectionSeparator();

  // Sheds
  const shedsRows = (logs.sheds||[]).slice().reverse();
  const shedsCols = [
    { title: 'Date', key: 'date', width: 30 },
    { title: 'Status', key: (r) => (r && r.complete) ? 'Complete' : 'Incomplete', width: 30 },
    { title: 'Notes', key: 'notes', width: usableWidth - (30+30) }
  ];
  drawTable('Sheds', shedsCols, shedsRows, { cellFontSize: 6, spacingAfter: 0 });
  drawSectionSeparator();

  // Meds
  const medsRows = (logs.meds||[]).slice().reverse();
  const medsCols = [
    { title: 'Date', key: 'date', width: 30 },
    { title: 'Drug', key: 'drug', width: 48 },
    { title: 'Dose', key: (r) => (r && (r.dose || r.dose === 0)) ? `${r.dose} mg` : '', width: 26 },
    { title: 'Notes', key: 'notes', width: usableWidth - (30+48+26) }
  ];
  drawTable('Meds', medsCols, medsRows, { cellFontSize: 6, spacingAfter: 0 });

  // Add page numbers to each page (top-left corner)
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(9);
    // place in top-left inside margin
    doc.text(`Page ${i} / ${totalPages}`, left, 12);
  }

  // Save the file
  const fn = `${snake.id || 'snake'}-${(snake.name||'').replace(/\s+/g,'_')}.pdf`;
  doc.save(fn);
}

async function exportClutchCardToPdf(details = {}) {
  const { jsPDF } = await import('jspdf');
  const pageW = 100;
  const pageH = 50;
  const margin = 6;
  const doc = new jsPDF({ unit: 'mm', format: [pageW, pageH], orientation: 'landscape' });

  const clutchNumberText = details.clutchNumber ? String(details.clutchNumber) : '—';
  const heading = details.label ? details.label : (details.clutchNumber ? `Clutch #${clutchNumberText}` : 'Clutch Card');
  const femaleName = details.femaleName || '—';
  const maleName = details.maleName || '—';
  const normalizeGeneticsLine = (value) => {
    if (value === null || typeof value === 'undefined') return '';
    const text = String(value).trim();
    if (!text || text === '—') return '';
    return text;
  };
  const femaleGeneticsLine = normalizeGeneticsLine(details.femaleGenetics);
  const maleGeneticsLine = normalizeGeneticsLine(details.maleGenetics);

  doc.setDrawColor(80);
  doc.setLineWidth(0.5);
  doc.roundedRect(3, 3, pageW - 6, pageH - 6, 2, 2);

  const headingFont = fitTextToWidth(doc, heading, pageW - margin * 2, 18, 12);
  try { doc.setFont(undefined, 'bold'); } catch (e) {}
  doc.setFontSize(headingFont);
  doc.text(heading, pageW / 2, margin, { align: 'center', baseline: 'top' });
  try { doc.setFont(undefined, 'normal'); } catch (e) {}

  const clutchDate = details.clutchDate || '';
  const estimatedHatch = clutchDate ? addDaysYmd(clutchDate, 59) : '';
  const eggsValue = (() => {
    const raw = details.eggsTotal;
    if (raw === null || typeof raw === 'undefined' || raw === '') return '—';
    if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw);
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return String(parsed);
    return String(raw);
  })();

  const rows = [
    { label: 'Clutch #', value: clutchNumberText },
    { label: 'Date', value: clutchDate ? formatDateForDisplay(clutchDate) : '—' },
    { label: 'Female', value: femaleName, secondary: femaleGeneticsLine },
    { label: 'Male', value: maleName, secondary: maleGeneticsLine },
    { label: 'Eggs', value: eggsValue },
    { label: 'Est. hatch', value: estimatedHatch ? formatDateForDisplay(estimatedHatch) : '—' },
  ];

  const startY = margin + estimateLineHeight(headingFont, 0.9) + 2;
  let y = startY;
  const availableWidth = pageW - margin * 2;
  const bodyFont = 10;
  doc.setFontSize(bodyFont);
  const lineHeight = estimateLineHeight(bodyFont, 1.05);
  const secondaryFont = Math.max(8, bodyFont - 1);

  rows.forEach(row => {
    const line = `${row.label}: ${row.value}`;
    const lines = doc.splitTextToSize(line, availableWidth);
    doc.text(lines, margin, y, { baseline: 'top' });
    y += lines.length * lineHeight;
    if (row.secondary) {
      doc.setFontSize(secondaryFont);
      const secondaryLines = doc.splitTextToSize(`   ${row.secondary}`, availableWidth);
      doc.text(secondaryLines, margin, y, { baseline: 'top' });
      y += secondaryLines.length * estimateLineHeight(secondaryFont, 1.05);
      doc.setFontSize(bodyFont);
    }
  });

  const slugSource = details.label || (details.clutchNumber ? `clutch-${details.clutchNumber}` : 'clutch-card');
  const fileSafe = slugSource
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'clutch-card';
  doc.save(`${fileSafe}.pdf`);
}

function SnakeCard({ s, onEdit, onQuickPair, onDelete, groups = [], setSnakes, setQrFor, pairings = [], onOpenPairing, lastFeedDefaults, setLastFeedDefaults }) {
  const hasEdit = typeof onEdit === "function";
  const hasQuick = typeof onQuickPair === "function";
  const hasDelete = typeof onDelete === "function";
  const [showPairingsModal, setShowPairingsModal] = useState(false);
  const [quickTagOpen, setQuickTagOpen] = useState(null);
  const [quickDraft, setQuickDraft] = useState({ date: localYMD(new Date()), notes: '', grams: 0, feed: 'Mouse', size: 'pinky', sizeDetail: '', form: '', formDetail: '', drug: '', dose: '' });
  const cardRef = useRef(null);
  const geneticsTokens = useMemo(() => combineMorphsAndHetsForDisplay(s?.morphs, s?.hets), [s?.morphs, s?.hets]);
  const normalizedSex = useMemo(() => normalizeSexValue(s?.sex), [s?.sex]);
  const weightHistory = useMemo(() => {
    const entries = Array.isArray(s?.logs?.weights) ? s.logs.weights : [];
    const mapped = entries
      .map((entry, index) => {
        const rawGrams = typeof entry?.grams === 'number'
          ? entry.grams
          : typeof entry?.weightGrams === 'number'
            ? entry.weightGrams
            : typeof entry?.weight === 'number'
              ? entry.weight
              : Number(entry?.grams ?? entry?.weightGrams ?? entry?.weight ?? entry?.value);
        if (!Number.isFinite(rawGrams)) return null;
        const dateInput = entry?.date || entry?.loggedAt || entry?.createdAt || null;
        const parsedYmd = typeof dateInput === 'string' ? parseYmd(dateInput) : null;
        const parsed = parsedYmd || (dateInput ? new Date(dateInput) : null);
        if (!(parsed instanceof Date) || Number.isNaN(parsed.getTime())) return null;
        return {
          grams: rawGrams,
          date: parsed,
          label: formatDateForDisplay(parsed) || parsed.toLocaleDateString(),
          rawDate: dateInput || parsed.toISOString(),
          index,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.date.getTime() - b.date.getTime());
    return mapped.slice(-12);
  }, [s?.logs?.weights]);
  const coverPhotoUrl = useMemo(() => {
    if (s?.imageUrl) return s.imageUrl;
    if (Array.isArray(s?.photos) && s.photos.length) {
      const last = s.photos[s.photos.length - 1];
      return last?.url || null;
    }
    return null;
  }, [s?.imageUrl, s?.photos]);
  const breedingCyclesByYear = useMemo(() => {
    if (normalizedSex !== 'F') return [];
    return getFemaleBreedingCyclesByYear(s?.id, pairings);
  }, [normalizedSex, s?.id, pairings]);

  // map tag text to activity key and defaults
  function tagToActivity(tag) {
    if (!tag) return { key: 'feeds', defaults: {} };
    const t = String(tag).toLowerCase();
    if (t.includes('weight')) return { key: 'weights', defaults: { grams: 0 } };
    if (t.includes('feed') || t.includes('feeding')) return { key: 'feeds', defaults: { feed: 'Mouse', size: 'pinky', grams: 0 } };
    if (t.includes('shed')) return { key: 'sheds', defaults: { complete: true } };
    if (t.includes('clean')) return { key: 'cleanings', defaults: { deep: false } };
    if (t.includes('med')) return { key: 'meds', defaults: { drug: '', dose: '' } };
    // fallback: if tag looks numeric or is common like 'proven' -> feeds by default
    return { key: 'feeds', defaults: {} };
  }

  function openQuickForKey(key, e) {
    e && e.stopPropagation();
    const mapping = { feeds: 'Feed', weights: 'Weight', cleanings: 'Cleaning', sheds: 'Shed', meds: 'Meds' };
    const fakeTag = mapping[key] || key;
    // compute position near the activity grid (place under top area)
    try {
      const card = cardRef.current;
      if (card) {
        card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    } catch (e) {
      // ignore positioning errors
    }
    // prefill based on key; for feeds, prefer shared lastFeedDefaults (do not bring grams)
    const activity = tagToActivity(fakeTag);
    if (activity.key === 'feeds' && lastFeedDefaults) {
      setQuickDraft({
        date: localYMD(new Date()),
        notes: lastFeedDefaults.notes || '',
        grams: activity.defaults.grams || 0,
        feed: lastFeedDefaults.feed || activity.defaults.feed || 'Mouse',
        size: lastFeedDefaults.size || activity.defaults.size || 'pinky',
        sizeDetail: lastFeedDefaults.sizeDetail || '',
        form: lastFeedDefaults.form || activity.defaults.form || '',
        formDetail: lastFeedDefaults.formDetail || '',
        drug: activity.defaults.drug || '',
        dose: activity.defaults.dose || ''
      });
    } else {
      setQuickDraft({ date: localYMD(new Date()), notes: '', grams: activity.defaults.grams || 0, feed: activity.defaults.feed || 'Mouse', size: activity.defaults.size || 'pinky', sizeDetail: activity.defaults.sizeDetail || '', form: activity.defaults.form || '', formDetail: activity.defaults.formDetail || '', drug: activity.defaults.drug || '', dose: activity.defaults.dose || '' });
    }
    setQuickTagOpen(fakeTag);
  }

  function closeQuickAdd() { setQuickTagOpen(null); }

  function submitQuickAdd(tag) {
    if (!setSnakes) { alert('Editing not enabled'); closeQuickAdd(); return; }
    const low = (tag||'').toLowerCase();
    // choose activity bucket
    let key = 'feeds';
    if (low.includes('weight')) key = 'weights';
    else if (low.includes('feed')) key = 'feeds';
    else if (low.includes('shed')) key = 'sheds';
    else if (low.includes('clean')) key = 'cleanings';
    else if (low.includes('med')) key = 'meds';

    const entry = { date: quickDraft.date };
    if (key === 'weights') entry.grams = Number(quickDraft.grams) || 0;
  if (key === 'feeds') {
      entry.feed = quickDraft.feed;
  entry.size = quickDraft.size === 'Other' ? (quickDraft.sizeDetail || '') : quickDraft.size;
      entry.weightGrams = Number(quickDraft.grams) || 0;
      // map form -> method/methodDetail consistent with LogsEditor
      if (quickDraft.form) {
        entry.method = quickDraft.form === 'Other' ? 'Other' : quickDraft.form;
        entry.methodDetail = quickDraft.form === 'Other' ? (quickDraft.formDetail || '') : '';
      } else {
        entry.method = 'Other';
        entry.methodDetail = '';
      }
    }
    if (key === 'meds') { entry.drug = quickDraft.drug; entry.dose = quickDraft.dose; }
    entry.notes = quickDraft.notes || '';

    setSnakes(prev => prev.map(x => x.id === s.id ? ({ ...x, logs: { ...x.logs, [key]: [...(x.logs[key] || []), entry] } }) : x));
    // persist feed defaults (but NOT the weight) so next quick-add will reuse fields
    if (key === 'feeds' && typeof setLastFeedDefaults === 'function') {
      try {
        setLastFeedDefaults({
          feed: quickDraft.feed,
          size: quickDraft.size,
          sizeDetail: quickDraft.sizeDetail || '',
          form: quickDraft.form,
          formDetail: quickDraft.formDetail || '',
          notes: quickDraft.notes || ''
        });
      } catch (e) {
        // ignore
      }
    }
    closeQuickAdd();
  }
  return (
  <div ref={cardRef} className="relative bg-white border rounded-xl p-2 flex flex-col gap-1 min-h-[280px] max-h-[520px] min-w-0 text-sm">
      <div className="flex items-start gap-3">
        {/* thumbnail top-left */}
        <div className="flex-shrink-0">
          {coverPhotoUrl ? (
            <div className="w-12 h-12 rounded-full overflow-hidden border ring-1 ring-white/60 shadow-sm">
              <img
                src={coverPhotoUrl}
                alt={s?.name ? `${s.name} photo` : 'Snake photo'}
                className="w-full h-full object-cover object-center"
                onError={(e)=>{e.currentTarget.style.display='none';}}
              />
            </div>
          ) : (
            <div className="w-12 h-12 rounded-full border bg-neutral-50 flex items-center justify-center text-[11px] text-neutral-400 text-center leading-tight px-1 ring-1 ring-white/60 shadow-sm">No picture</div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-medium text-base truncate">{s.name}</div>
              <div className="text-xs font-mono text-neutral-500 mt-1 truncate">{s.id}</div>
              <div className="text-xs text-neutral-500">{s.birthDate ? formatDateForDisplay(s.birthDate) : ''}</div>
            </div>
            <div className="shrink-0">
              <Badge>{normalizedSex === 'M' ? '♂' : (normalizedSex === 'F' ? '♀' : '•')}</Badge>
            </div>
          </div>
          <div className="mt-1 space-y-1">
            {geneticsTokens.length ? <GeneLine label="Genetics" genes={geneticsTokens} size="sm" /> : <div className="text-[11px] uppercase tracking-wide text-neutral-500">Genetics: -</div>}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-center gap-2">
        {hasEdit && (
          <button className="text-[11px] px-2 py-0.5 border rounded-lg" onClick={() => onEdit(s)}>
            Edit
          </button>
        )}
        {hasQuick && (
          <button className="text-[11px] px-2 py-0.5 border rounded-lg" onClick={() => onQuickPair(s)}>
            Pair
          </button>
        )}
        <button className="text-[11px] px-2 py-0.5 border rounded-lg" onClick={() => { if (typeof setQrFor === 'function') setQrFor(s.id); }}>
          QR
        </button>
        {hasDelete && (
          <button
            className="text-[11px] px-2 py-0.5 border rounded-lg text-rose-600"
            onClick={() => onDelete(s)}
            title="Delete snake"
          >
            Delete
          </button>
        )}
      </div>

  {/* picture moved to thumbnail in header; large inline image removed */}

  {/* main content: scrollable when overflow */}
  <div className="flex-1 overflow-auto">
  {/* recent activity badges: single-line items, two-per-row (half width) */}
      <div className="mt-2 grid grid-cols-2 gap-1">
        {(() => {
          const logs = s.logs || {};
          const lastFeed = logs.feeds && logs.feeds.length ? logs.feeds[logs.feeds.length-1] : null;
          const lastWeight = logs.weights && logs.weights.length ? logs.weights[logs.weights.length-1] : null;
          const lastCleaning = logs.cleanings && logs.cleanings.length ? logs.cleanings[logs.cleanings.length-1] : null;
          const lastShed = logs.sheds && logs.sheds.length ? logs.sheds[logs.sheds.length-1] : null;
          const lastMed = logs.meds && logs.meds.length ? logs.meds[logs.meds.length-1] : null;
          const groupsArr = s.groups || [];

          const ordered = [
            { key: 'feeds', entry: lastFeed },
            { key: 'weights', entry: lastWeight },
            { key: 'cleanings', entry: lastCleaning },
            { key: 'sheds', entry: lastShed },
            { key: 'meds', entry: lastMed },
            { key: 'groups', groups: groupsArr }
          ];

          return ordered.map(a => {
            const k = a.key;
            const date = (a.entry && a.entry.date) || '';
            const labelText = k === 'feeds' ? 'Feed' : k === 'weights' ? 'Weight' : k === 'cleanings' ? 'Cleaning' : k === 'sheds' ? 'Shed' : k === 'meds' ? 'Meds' : 'Group';
            const isClickableActivity = ['feeds','weights','cleanings','sheds','meds'].includes(k);
            const pal = activityPalettes[k] || { bg: '#efefef', border: '#ddd' };
            return (
              <div key={k} onClick={(e)=>{ if (isClickableActivity) { e.stopPropagation(); openQuickForKey(k,e); } }} role={isClickableActivity? 'button': undefined}
                className={cx(isClickableActivity? 'cursor-pointer':'' ,'w-full px-2 py-1 text-[11px] rounded-lg border flex flex-col justify-between gap-1 min-h-[48px]')}
                style={{ backgroundColor: pal.bg, borderColor: pal.border }}>
                  <div className="flex items-center justify-between">
                      <div className="text-[10px] text-neutral-600 font-semibold uppercase">{labelText}</div>
                      <div className="text-[10px] text-neutral-600">{formatDateForDisplay(date) || ' '}</div>
                    </div>
                <div className="min-w-0">
                  {k === 'feeds' ? (() => {
                    if (!a.entry) return <div className="text-sm text-neutral-700">—</div>;
                    const en = a.entry;
                    const kind = en.feed || en.item || 'Feed';
                    const size = en.size ? ` ${en.size}` : '';
                    const grams = (typeof en.weightGrams === 'number' && en.weightGrams > 0) ? ` • ${en.weightGrams} g` : (typeof en.grams === 'number' && en.grams > 0 ? ` • ${en.grams} g` : '');
                    const method = en.method ? ` • ${en.method}${en.methodDetail?` (${en.methodDetail})`:''}` : '';
                    return (
                      <>
                        <div className="font-medium truncate">{kind}{size}{grams}{method}</div>
                        {en.notes ? <div className="text-[11px] text-neutral-700 truncate">{en.notes}</div> : null}
                      </>
                    );
                  })() : null}

                  {k === 'weights' ? (() => {
                    if (!a.entry) return <div className="text-sm text-neutral-700">—</div>;
                    const w = a.entry;
                    return (
                      <>
                        <div className="font-medium">{(typeof w.grams === 'number' ? `${w.grams} g` : `${w.grams || ''}`)}</div>
                        {w.notes ? <div className="text-[11px] text-neutral-700 truncate">{w.notes}</div> : null}
                      </>
                    );
                  })() : null}

                  {k === 'cleanings' ? (() => {
                    if (!a.entry) return <div className="text-sm text-neutral-700">—</div>;
                    const c = a.entry;
                    return (
                      <>
                        <div className="font-medium">Cleaning{c.deep ? ' • deep' : ''}</div>
                        {c.notes ? <div className="text-[11px] text-neutral-700 truncate">{c.notes}</div> : null}
                      </>
                    );
                  })() : null}

                  {k === 'sheds' ? (() => {
                    if (!a.entry) return <div className="text-sm text-neutral-700">—</div>;
                    const sh = a.entry;
                    return (
                      <>
                        <div className="font-medium">Shed{sh.complete ? ' • complete' : ''}</div>
                        {sh.notes ? <div className="text-[11px] text-neutral-700 truncate">{sh.notes}</div> : null}
                      </>
                    );
                  })() : null}

                  {k === 'meds' ? (() => {
                    if (!a.entry) return <div className="text-sm text-neutral-700">—</div>;
                    const m = a.entry;
                    return (
                      <>
                        <div className="font-medium truncate">{m.drug} {m.dose ? `• ${m.dose}` : ''}</div>
                        {m.notes ? <div className="text-[11px] text-neutral-700 truncate">{m.notes}</div> : null}
                      </>
                    );
                  })() : null}

                  {k === 'groups' ? (() => {
                    const gs = a.groups || [];
                    if (!gs.length) return <div className="text-sm text-neutral-700">—</div>;
                    const groupText = gs.join(', ');
                    if (groupText.trim().toLowerCase() === 'group') return <div className="text-sm text-neutral-700">—</div>;
                    return <div className="font-medium truncate">{groupText}</div>;
                  })() : null}

                </div>
                {/* date moved into header */}
              </div>
            );
          });
        })()}
      </div>

      {/* genetics moved to header */}
      {/* weight display removed per user request */}
  {/* birth date moved to header */}
      </div>
      {/* Quick-add popover for activities (feeds, weights, cleanings, sheds, meds) */}
      {quickTagOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onClick={(e) => {
            e.stopPropagation();
            closeQuickAdd();
          }}
        >
          <div
            className="pointer-events-auto w-full max-w-md bg-white border rounded-xl shadow-2xl p-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="text-base font-semibold">Add {quickTagOpen}</div>
              <button
                className="text-sm px-2 py-1 border rounded-lg text-neutral-500 hover:text-neutral-700"
                onClick={(e)=>{ e.stopPropagation(); closeQuickAdd(); }}
              >
                Close
              </button>
            </div>
            <div className="space-y-3 text-sm">
              <div>
                <div className="text-xs text-neutral-500">Date</div>
                <input className="w-full px-2 py-1 border rounded" type="date" value={quickDraft.date} onChange={(e)=>setQuickDraft(d=>({...d, date: e.target.value}))} />
              </div>
              {quickTagOpen.toLowerCase().includes('feed') && (
                <>
                  <div>
                    <div className="text-xs text-neutral-500">Feed type</div>
                    <select className="w-full px-2 py-1 border rounded" value={quickDraft.feed||''} onChange={(e)=>setQuickDraft(d=>({...d, feed: e.target.value, size: (e.target.value === 'Mouse' || e.target.value === 'Rat') ? (d.size||'pinky') : ''}))}>
                      <option value="Mouse">Mouse</option>
                      <option value="Rat">Rat</option>
                      <option value="Chick">Chick</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div>
                    <div className="text-xs text-neutral-500">Size</div>
                    {(quickDraft.feed === 'Mouse' || quickDraft.feed === 'Rat') ? (
                      <select className="w-full px-2 py-1 border rounded" value={quickDraft.size||''} onChange={e=>setQuickDraft(d=>({...d, size: e.target.value}))}>
                        <option value="pinky">pinky</option>
                        <option value="fuzzy">fuzzy</option>
                        <option value="medium">medium</option>
                        <option value="adult">adult</option>
                        <option value="Other">Other</option>
                      </select>
                    ) : (
                      <>
                        <select className="w-full px-2 py-1 border rounded" value={quickDraft.size||''} onChange={e=>setQuickDraft(d=>({...d, size: e.target.value}))}>
                          <option value="">Select</option>
                          <option value="Other">Other</option>
                        </select>
                        {quickDraft.size === 'Other' && (
                          <input className="mt-2 w-full px-2 py-1 border rounded" placeholder="Custom size" value={quickDraft.sizeDetail||''} onChange={e=>setQuickDraft(d=>({...d, sizeDetail: e.target.value}))} />
                        )}
                      </>
                    )}
                    {quickDraft.size === 'Other' && quickDraft.feed !== 'Mouse' && quickDraft.feed !== 'Rat' && (
                      <input className="mt-2 w-full px-2 py-1 border rounded" placeholder="Custom size" value={quickDraft.sizeDetail||''} onChange={e=>setQuickDraft(d=>({...d, sizeDetail: e.target.value}))} />
                    )}
                  </div>
                  <div>
                    <div className="text-xs text-neutral-500">Weight (g)</div>
                    <input className="w-full px-2 py-1 border rounded" type="number" value={quickDraft.grams} onChange={(e)=>setQuickDraft(d=>({...d, grams: e.target.value}))} />
                  </div>
                  <div>
                    <div className="text-xs text-neutral-500">Form</div>
                    <select className="w-full px-2 py-1 border rounded" value={quickDraft.form||''} onChange={(e)=>setQuickDraft(d=>({...d, form: e.target.value}))}>
                      <option value="">Select</option>
                      <option value="Live">Live</option>
                      <option value="Freshly killed">Freshly killed</option>
                      <option value="Frozen/thawed">Frozen/thawed</option>
                      <option value="Other">Other</option>
                    </select>
                    {quickDraft.form === 'Other' && (
                      <input className="mt-2 w-full px-2 py-1 border rounded" placeholder="Method details" value={quickDraft.formDetail||''} onChange={e=>setQuickDraft(d=>({...d, formDetail: e.target.value}))} />
                    )}
                  </div>
                </>
              )}
                      {quickTagOpen.toLowerCase().includes('weight') && (
                        <>
                          <div>
                            <div className="text-xs text-neutral-500">Grams</div>
                            <input className="w-full px-2 py-1 border rounded" type="number" value={quickDraft.grams} onChange={(e)=>setQuickDraft(d=>({...d, grams: e.target.value}))} />
                          </div>
                          <div>
                            <div className="text-xs text-neutral-500">Recent progress</div>
                            <WeightTrendMiniChart data={weightHistory} />
                          </div>
                        </>
                      )}
              {quickTagOpen.toLowerCase().includes('med') && (
                <>
                  <div>
                    <div className="text-xs text-neutral-500">Drug</div>
                    <input className="w-full px-2 py-1 border rounded" value={quickDraft.drug} onChange={(e)=>setQuickDraft(d=>({...d, drug: e.target.value}))} />
                  </div>
                  <div>
                    <div className="text-xs text-neutral-500">Dose</div>
                    <input className="w-full px-2 py-1 border rounded" value={quickDraft.dose} onChange={(e)=>setQuickDraft(d=>({...d, dose: e.target.value}))} />
                  </div>
                </>
              )}
              <div>
                <div className="text-xs text-neutral-500">Notes</div>
                <input className="w-full px-2 py-1 border rounded" value={quickDraft.notes} onChange={(e)=>setQuickDraft(d=>({...d, notes: e.target.value}))} />
              </div>
              <div className="flex items-center justify-end gap-2">
                <button className="px-2 py-1 border rounded" onClick={(e)=>{ e.stopPropagation(); closeQuickAdd(); }}>Cancel</button>
                <button className="px-2 py-1 bg-emerald-500 text-white rounded" onClick={(e)=>{ e.stopPropagation(); submitQuickAdd(quickTagOpen); }}>Add</button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* single-group selector (smaller; limited to ~3 lines) */}
      <div className="mt-2">
        <div className="text-xs text-neutral-500 mb-1">Assign group</div>
  <div className="flex flex-wrap gap-2 text-[11px]">
          {groups.map(g => (
            <label key={g} className="inline-flex items-center gap-1 px-2 py-0.5 border rounded-lg bg-white text-[11px] min-w-0">
              <input type="radio" name={`group-${s.id}`} className="w-3 h-3"
                checked={(s.groups||[]).includes(g)}
                onChange={() => {
                  if (!setSnakes) return;
                  setSnakes(prev => prev.map(x => x.id === s.id ? { ...x, groups: [g] } : x));
                }} />
              <span className="truncate max-w-[8rem]">{g}</span>
            </label>
          ))}
          <label className="inline-flex items-center gap-1 px-2 py-0.5 border rounded-lg bg-white text-[11px]">
            <input type="radio" name={`group-${s.id}`} className="w-3 h-3" checked={!(s.groups||[]).length}
              onChange={() => { if (!setSnakes) return; setSnakes(prev => prev.map(x => x.id === s.id ? { ...x, groups: [] } : x)); }} />
            <span>None</span>
          </label>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <StatusDot status={s.status} />
        <div className="text-xs">{s.status}</div>
      </div>

      {normalizedSex === 'F' && breedingCyclesByYear.length > 0 && (
        <div className="mt-2">
          <div className="text-xs text-neutral-500 mb-1">Breeding cycles</div>
          <div className="flex flex-col gap-1 max-h-40 overflow-auto pr-1">
            {breedingCyclesByYear.map(group => (
              <div key={group.year} className="rounded-lg border bg-neutral-50 p-2 space-y-1">
                <div className="text-[10px] font-semibold uppercase text-neutral-500">{group.year}</div>
                {group.cycles.map(cycle => (
                  <div key={cycle.id} className="rounded-lg border bg-white px-2 py-1 text-[11px] space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium truncate">{cycle.label}</div>
                      {onOpenPairing && cycle.id && (
                        <button
                          className="text-[10px] px-1.5 py-0.5 border rounded-lg"
                          onClick={() => onOpenPairing(cycle.id)}
                        >
                          Open
                        </button>
                      )}
                    </div>
                    <div className="space-y-0.5 text-neutral-700">
                      {cycle.locks && cycle.locks.length ? (
                        <div>
                          <span className="font-semibold text-neutral-600">Locks:</span>{' '}
                          <span>{cycle.locks.map(lock => lock.display || formatDateTimeForDisplay(lock.iso)).filter(Boolean).join(', ')}</span>
                        </div>
                      ) : null}
                      {cycle.ovulationDate ? (
                        <div><span className="font-semibold text-neutral-600">Ovulation:</span> <span>{formatDateForDisplay(cycle.ovulationDate)}</span></div>
                      ) : null}
                      {cycle.preLayDate ? (
                        <div><span className="font-semibold text-neutral-600">Pre-Lay Shed:</span> <span>{formatDateForDisplay(cycle.preLayDate)}</span></div>
                      ) : null}
                      {cycle.clutchDate ? (
                        <div><span className="font-semibold text-neutral-600">Eggs laid:</span> <span>{formatDateForDisplay(cycle.clutchDate)}</span></div>
                      ) : null}
                      {cycle.hatchDate ? (
                        <div><span className="font-semibold text-neutral-600">Hatched:</span> <span>{formatDateForDisplay(cycle.hatchDate)}</span></div>
                      ) : null}
                      {!cycle.locks?.length && !cycle.ovulationDate && !cycle.preLayDate && !cycle.clutchDate && !cycle.hatchDate ? (
                        <div className="text-neutral-500">No cycle events recorded.</div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pairings involving this snake */}
      <div className="mt-2">
        <div className="text-xs text-neutral-500 mb-1">Pairings</div>
        {(() => {
          const myPairings = pairings.filter(p => p.maleId === s.id || p.femaleId === s.id);
          const visible = myPairings.slice(0,3);
          return (
            <div className="flex flex-col gap-1 max-h-36 overflow-auto">
              {visible.map(p => (
                <button key={p.id} className="text-sm text-left px-2 py-1 rounded-lg border hover:bg-neutral-50 min-w-0" onClick={()=> onOpenPairing ? onOpenPairing(p.id) : null}>
                  <div className="font-medium truncate">{p.label || `${p.femaleId} × ${p.maleId}`}</div>
                  <div className="text-xs text-neutral-500">Start: {p.startDate ? formatDateForDisplay(p.startDate) : '—'}</div>
                </button>
              ))}
              {myPairings.length === 0 && (<div className="text-xs text-neutral-500">No pairings</div>)}
              {myPairings.length > 3 && (
                <button className="text-xs mt-1 px-2 py-1 border rounded-lg text-neutral-700" onClick={()=>setShowPairingsModal(true)}>+{myPairings.length - 3} more</button>
              )}
            </div>
          );
        })()}
      </div>
      {showPairingsModal && (
        <PairingsModal
          snake={s}
          pairings={pairings.filter(p => p.maleId === s.id || p.femaleId === s.id)}
          onClose={() => setShowPairingsModal(false)}
          onOpenPairing={(pid) => { setShowPairingsModal(false); if (onOpenPairing) onOpenPairing(pid); }}
        />
      )}
    </div>
  );
}

function WeightTrendMiniChart({ data = [] }) {
  const accent = '#0ea5e9';
  const chartWidth = 320;
  const chartHeight = 140;
  const padding = { top: 18, right: 28, bottom: 32, left: 42 };
  const innerWidth = chartWidth - padding.left - padding.right;
  const innerHeight = chartHeight - padding.top - padding.bottom;
  const gradientId = useMemo(() => `weight-gradient-${Math.random().toString(36).slice(2, 8)}`, []);

  if (!Array.isArray(data) || data.length === 0) {
    return (
      <div className="mt-2 border rounded-lg bg-neutral-50 px-3 py-4 text-xs text-neutral-500">
        No weight history yet. Log a weight to start tracking progress.
      </div>
    );
  }

  const gramsValues = data.map(d => d.grams);
  const minValue = Math.min(...gramsValues);
  const maxValue = Math.max(...gramsValues);
  const range = maxValue - minValue || 1;
  const baselineY = padding.top + innerHeight;
  const formatNumber = (value) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value);

  const pointCoords = data.map((entry, idx) => {
    const ratio = data.length === 1 ? 0.5 : idx / (data.length - 1);
    const x = padding.left + innerWidth * ratio;
    const y = padding.top + innerHeight - ((entry.grams - minValue) / range) * innerHeight;
    return { x, y, grams: entry.grams, label: entry.label || '' };
  });

  const linePath = pointCoords
    .map((pt, idx) => `${idx === 0 ? 'M' : 'L'}${pt.x.toFixed(2)} ${pt.y.toFixed(2)}`)
    .join(' ');

  const areaPath = pointCoords.length > 1
    ? `${linePath} L${pointCoords[pointCoords.length - 1].x.toFixed(2)} ${baselineY.toFixed(2)} L${pointCoords[0].x.toFixed(2)} ${baselineY.toFixed(2)} Z`
    : null;

  const latest = pointCoords[pointCoords.length - 1];
  const first = pointCoords[0];
  const diff = latest.grams - first.grams;
  const diffLabel = `${diff >= 0 ? '+' : ''}${formatNumber(diff)} g`;

  return (
    <div className="mt-2 border rounded-lg bg-neutral-50 p-3">
      <svg
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        role="img"
        aria-label="Weight trend chart"
        className="w-full h-32"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={accent} stopOpacity="0.28" />
            <stop offset="100%" stopColor={accent} stopOpacity="0" />
          </linearGradient>
        </defs>
        <rect
          x={padding.left}
          y={padding.top}
          width={innerWidth}
          height={innerHeight}
          fill="#f8fafc"
          rx={12}
        />
        <line
          x1={padding.left}
          y1={baselineY}
          x2={padding.left + innerWidth}
          y2={baselineY}
          stroke="#e2e8f0"
          strokeDasharray="4 4"
        />
        {areaPath ? (
          <path d={areaPath} fill={`url(#${gradientId})`} />
        ) : null}
        <path
          d={linePath}
          fill="none"
          stroke={accent}
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {pointCoords.map((pt, idx) => (
          <circle
            key={`weight-point-${idx}`}
            cx={pt.x}
            cy={pt.y}
            r={4}
            fill="#fff"
            stroke={accent}
            strokeWidth={2}
          />
        ))}
      </svg>
      <div className="mt-2 text-[11px] text-neutral-600 grid grid-cols-2 gap-y-1">
        <div>
          <span className="font-semibold text-neutral-700">Latest:</span> {formatNumber(latest.grams)} g
        </div>
        <div className="text-right">
          <span className="font-semibold text-neutral-700">Change:</span> {diffLabel}
        </div>
        <div className="col-span-2 text-neutral-500">
          {pointCoords.length > 1 ? `From ${first.label} to ${latest.label}` : `Logged on ${latest.label}`}
        </div>
      </div>
      {pointCoords.length > 1 && (
        <div className="mt-1 flex justify-between text-[10px] uppercase tracking-wide text-neutral-400">
          <span>{data[0].label}</span>
          <span>{data[data.length - 1].label}</span>
        </div>
      )}
    </div>
  );
}

function PairingsModal({ snake, pairings, onClose, onOpenPairing }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white p-4 rounded-lg shadow w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium">Pairings for {snake.name}</div>
            <div className="text-xs text-neutral-500">Click a pairing to open it.</div>
          </div>
          <button className="text-sm px-2 py-1 border rounded" onClick={onClose}>Close</button>
        </div>
        <div className="mt-3 space-y-2 max-h-72 overflow-auto">
          {pairings.length ? pairings.map(p => (
            <div key={p.id} className="p-2 border rounded-lg">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <div className="font-medium truncate">{p.label}</div>
                  <div className="text-xs text-neutral-500">Start: {p.startDate ? formatDateForDisplay(p.startDate) : '—'}</div>
                </div>
                <div className="flex gap-2">
                  <button className="text-xs px-2 py-1 border rounded-lg" onClick={() => onOpenPairing && onOpenPairing(p.id)}>Open</button>
                </div>
              </div>
                  <div className="mt-2 text-xs">
                Appointments:
                <div className="mt-1 space-y-1">
                  {(p.appointments||[]).map(ap => (
                    <div key={ap.id} className="text-[11px] px-2 py-1 rounded border bg-neutral-50">{formatDateForDisplay(ap.date)} {ap.notes ? `• ${ap.notes}` : ''}</div>
                  ))}
                </div>
              </div>
            </div>
          )) : <div className="text-sm text-neutral-500">No pairings</div>}
        </div>
      </div>
    </div>
  );
}

function StatusDot({ status }) {
  const bg = status === "Active" ? "bg-emerald-500" : status === "Hold" ? "bg-amber-500" : "bg-rose-500";
  return <span className={cx("inline-block w-2 h-2 rounded-full", bg)} />;
}

function filterSnakes(list, query, tag) {
  const q = query.trim().toLowerCase();
  return list.filter(s => {
    if (tag !== "all" && !(s.tags || []).includes(tag)) return false;
    if (!q) return true;
    const hay = [s.name, ...s.morphs, ...s.hets, ...(s.tags||[]), ...(s.groups||[])].join(" ").toLowerCase();
    return hay.includes(q);
  });
}

function AddGroupInline({ onAdd }) {
  const [val, setVal] = useState("");
  return (
    <div className="flex gap-2 px-2">
      <input className="flex-1 border rounded-lg px-2 py-1 text-sm" placeholder="Add new group"
        value={val} onChange={e=>setVal(e.target.value)} />
      <button className="text-xs px-2 py-1 border rounded-lg" onClick={()=>{
        const g = val.trim();
        if (!g) return;
        onAdd(g);
        setVal("");
      }}>Add</button>
    </div>
  );
}

// Breeder section for contact and logo
function BreederSection({
  breederInfo,
  setBreederInfo,
  theme = 'blue',
  onSaved,
  createBackupPayload,
  onRestoreBackup,
  backupSettings,
  updateBackupSettings,
  autoBackupSnapshot,
  onTriggerAutoBackup,
  backupVault,
  onCreateVaultEntry,
  onRenameVaultEntry,
  onDeleteVaultEntry,
  snakes,
  pairings,
  animalExportFields,
  setAnimalExportFields,
  pairingExportFields,
  setPairingExportFields,
  exportFeedback,
  setExportFeedback,
}) {
  const info = normalizeBreederInfo(breederInfo);
  const idConfig = useMemo(() => normalizeIdGeneratorConfig(info.idGenerator), [info.idGenerator]);

  const persistBreederInfo = useCallback((updater) => {
    setBreederInfo(prev => {
      const normalizedPrev = normalizeBreederInfo(prev);
      const next = typeof updater === 'function' ? updater(normalizedPrev) : updater;
      return normalizeBreederInfo(next);
    });
  }, [setBreederInfo]);

  const updateIdConfig = useCallback((patch) => {
    persistBreederInfo(prev => {
      const merged = { ...prev.idGenerator, ...(patch || {}) };
      return { ...prev, idGenerator: normalizeIdGeneratorConfig(merged) };
    });
  }, [persistBreederInfo]);

  const handleResetIdConfig = useCallback(() => {
    persistBreederInfo(prev => ({ ...prev, idGenerator: getDefaultIdGeneratorConfig() }));
  }, [persistBreederInfo]);

  const handleTemplateTokenToggle = useCallback((token) => {
    const template = idConfig.template || '';
    const insertion = token === '[-]' ? '[-]' : token;
    const input = templateInputRef.current;
    const captureLastPosition = (start, end) => {
      lastTemplateSelectionRef.current = { start, end };
    };

    if (token !== '[-]' && template.includes(insertion)) {
      const index = template.indexOf(insertion);
      if (index === -1) return;
      const next = `${template.slice(0, index)}${template.slice(index + insertion.length)}`;
      pendingTemplateSelectionRef.current = { start: index, end: index, focus: true };
      captureLastPosition(index, index);
      updateIdConfig({ template: next });
      return;
    }

    let start = template.length;
    let end = template.length;
    if (input && typeof input.selectionStart === 'number' && typeof input.selectionEnd === 'number') {
      start = input.selectionStart;
      end = input.selectionEnd;
    } else if (lastTemplateSelectionRef.current) {
      const { start: lastStart, end: lastEnd } = lastTemplateSelectionRef.current;
      if (typeof lastStart === 'number' && typeof lastEnd === 'number') {
        start = lastStart;
        end = lastEnd;
      }
    }
    const next = `${template.slice(0, start)}${insertion}${template.slice(end)}`;
    const cursor = start + insertion.length;
    pendingTemplateSelectionRef.current = { start: cursor, end: cursor, focus: true };
    captureLastPosition(cursor, cursor);
    updateIdConfig({ template: next });
  }, [idConfig.template, updateIdConfig]);

  const captureTemplateSelection = useCallback(() => {
    const input = templateInputRef.current;
    if (!input) return;
    const start = typeof input.selectionStart === 'number' ? input.selectionStart : input.value.length;
    const end = typeof input.selectionEnd === 'number' ? input.selectionEnd : start;
    lastTemplateSelectionRef.current = { start, end };
  }, []);

  const [setupTab, setSetupTab] = useState('info');
  const [backupFeedback, setBackupFeedback] = useState(null);
  const [restoreFeedback, setRestoreFeedback] = useState(null);
  const restoreInputRef = useRef(null);
  const normalizedBackupSettings = useMemo(() => normalizeBackupSettings(backupSettings), [backupSettings]);
  const vaultEntries = useMemo(() => (Array.isArray(backupVault) ? backupVault : []), [backupVault]);
  const normalizedAnimalExportFields = useMemo(
    () => normalizeExportFieldSelection(animalExportFields, DEFAULT_ANIMAL_EXPORT_FIELDS, ANIMAL_EXPORT_FIELD_DEFS),
    [animalExportFields]
  );
  const normalizedPairingExportFields = useMemo(
    () => normalizeExportFieldSelection(pairingExportFields, DEFAULT_PAIRING_EXPORT_FIELDS, PAIRING_EXPORT_FIELD_DEFS),
    [pairingExportFields]
  );
  const animalFieldSections = useMemo(() => groupFieldDefsBySection(ANIMAL_EXPORT_FIELD_DEFS), []);
  const pairingFieldSections = useMemo(() => groupFieldDefsBySection(PAIRING_EXPORT_FIELD_DEFS), []);
  const animalFieldSet = useMemo(() => new Set(normalizedAnimalExportFields), [normalizedAnimalExportFields]);
  const pairingFieldSet = useMemo(() => new Set(normalizedPairingExportFields), [normalizedPairingExportFields]);
  const vaultLimitValue = typeof normalizedBackupSettings.maxVaultEntries === 'number' && normalizedBackupSettings.maxVaultEntries > 0
    ? String(normalizedBackupSettings.maxVaultEntries)
    : 'unlimited';
  const vaultLimitDescription = normalizedBackupSettings.maxVaultEntries
    ? `Keeping the latest ${normalizedBackupSettings.maxVaultEntries} backups. Oldest entries are pruned automatically.`
    : 'Keeping all backups (no limit).';
  const autoBackupStats = useMemo(() => {
    if (!autoBackupSnapshot || typeof autoBackupSnapshot !== 'object') return null;
    const payload = autoBackupSnapshot.payload || {};
    return {
      snakes: Array.isArray(payload.snakes) ? payload.snakes.length : 0,
      pairings: Array.isArray(payload.pairings) ? payload.pairings.length : 0,
      groups: Array.isArray(payload.groups) ? payload.groups.length : 0,
    };
  }, [autoBackupSnapshot]);
  const lastAutoBackupDisplay = normalizedBackupSettings.lastRun
    ? formatDateTimeForDisplay(normalizedBackupSettings.lastRun)
    : 'Never';
  const manualFeedback = backupFeedback?.context === 'manual' ? backupFeedback : null;
  const autoFeedback = backupFeedback && typeof backupFeedback.context === 'string'
    && backupFeedback.context.startsWith('auto')
    ? backupFeedback
    : null;
  const vaultFeedback = backupFeedback && typeof backupFeedback.context === 'string'
    && backupFeedback.context.startsWith('vault')
    ? backupFeedback
    : null;
  const animalExportFeedback = exportFeedback && exportFeedback.context === 'animals' ? exportFeedback : null;
  const pairingExportFeedback = exportFeedback && exportFeedback.context === 'pairings' ? exportFeedback : null;
  const hasAnimalData = Array.isArray(snakes) && snakes.length > 0;
  const hasPairingData = Array.isArray(pairings) && pairings.length > 0;
  const [previewName, setPreviewName] = useState(() => info.name || info.businessName || BORIS_PREVIEW_DEFAULTS.name);
  const [previewYear, setPreviewYear] = useState(() => BORIS_PREVIEW_DEFAULTS.year);
  const [previewBirthYear, setPreviewBirthYear] = useState(() => BORIS_PREVIEW_DEFAULTS.birthYear);
  const [previewSex, setPreviewSex] = useState(BORIS_PREVIEW_DEFAULTS.sex);
  const [previewSequence, setPreviewSequence] = useState(1);
  const [previewGenes, setPreviewGenes] = useState(() => BORIS_PREVIEW_DEFAULTS.genes || '');
  const templateInputRef = useRef(null);
  const pendingTemplateSelectionRef = useRef(null);
  const lastTemplateSelectionRef = useRef({ start: null, end: null });

  const handleManualBackupDownload = useCallback(() => {
    if (typeof createBackupPayload !== 'function') {
      setBackupFeedback({
        type: 'error',
        message: 'Backup export is unavailable.',
        context: 'manual',
        timestamp: new Date().toISOString(),
      });
      return;
    }
    try {
      const payload = createBackupPayload();
      const serialized = JSON.stringify(payload, null, 2);
      const iso = new Date().toISOString();
      const timestamp = iso.replace(/[:.]/g, '-');
      if (typeof window === 'undefined' || typeof document === 'undefined') {
        throw new Error('Downloads are not supported in this environment.');
      }
      const filename = `breeding-planner-backup-${timestamp}.json`;
      const blob = new Blob([serialized], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setBackupFeedback({
        type: 'success',
        message: `Backup downloaded (${Array.isArray(payload.snakes) ? payload.snakes.length : 0} snakes, ${Array.isArray(payload.pairings) ? payload.pairings.length : 0} pairings).`,
        context: 'manual',
        timestamp: iso,
      });
    } catch (err) {
      console.error(err);
      setBackupFeedback({
        type: 'error',
        message: err?.message || 'Unable to download backup.',
        context: 'manual',
        timestamp: new Date().toISOString(),
      });
    }
  }, [createBackupPayload]);

  const handleSaveBackupToVault = useCallback(() => {
    if (typeof createBackupPayload !== 'function' || typeof onCreateVaultEntry !== 'function') {
      setBackupFeedback({
        type: 'error',
        message: 'Backup vault is unavailable.',
        context: 'vault',
        timestamp: new Date().toISOString(),
      });
      return;
    }
    try {
      const payload = createBackupPayload();
      const nowIso = new Date().toISOString();
      let desiredName = `${'Manual backup'} • ${formatDateTimeForDisplay(nowIso)}`;
      if (typeof window !== 'undefined' && typeof window.prompt === 'function') {
        const prompted = window.prompt('Name this backup file', desiredName);
        if (prompted && prompted.trim()) {
          desiredName = prompted.trim();
        }
      }
      const entry = onCreateVaultEntry(payload, { source: 'manual', name: desiredName, savedAt: nowIso });
      setBackupFeedback({
        type: entry ? 'success' : 'error',
        message: entry ? `Saved “${entry.name}” to the backup vault.` : 'Failed to save backup to the vault.',
        context: 'vault',
        timestamp: nowIso,
      });
    } catch (err) {
      console.error(err);
      setBackupFeedback({
        type: 'error',
        message: err?.message || 'Unable to save the backup to the vault.',
        context: 'vault',
        timestamp: new Date().toISOString(),
      });
    }
  }, [createBackupPayload, onCreateVaultEntry]);

  const handleAutoBackupDownload = useCallback(() => {
    if (!autoBackupSnapshot || !autoBackupSnapshot.payload) {
      setBackupFeedback({
        type: 'error',
        message: 'No automatic backup is available yet.',
        context: 'auto-download',
        timestamp: new Date().toISOString(),
      });
      return;
    }
    try {
      if (typeof window === 'undefined' || typeof document === 'undefined') {
        throw new Error('Downloads are not supported in this environment.');
      }
      const payload = autoBackupSnapshot.payload;
      const serialized = JSON.stringify(payload, null, 2);
      const sourceIso = autoBackupSnapshot.savedAt || new Date().toISOString();
      const timestamp = sourceIso.replace(/[:.]/g, '-');
      const filename = `breeding-planner-auto-backup-${timestamp}.json`;
      const blob = new Blob([serialized], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setBackupFeedback({
        type: 'success',
        message: 'Latest automatic backup downloaded.',
        context: 'auto-download',
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error(err);
      setBackupFeedback({
        type: 'error',
        message: err?.message || 'Unable to download the automatic backup.',
        context: 'auto-download',
        timestamp: new Date().toISOString(),
      });
    }
  }, [autoBackupSnapshot]);

  const handleToggleAnimalField = useCallback((fieldKey) => {
    setAnimalExportFields(prev => {
      const baseline = normalizeExportFieldSelection(prev, DEFAULT_ANIMAL_EXPORT_FIELDS, ANIMAL_EXPORT_FIELD_DEFS);
      if (!fieldKey) return baseline;
      const exists = baseline.includes(fieldKey);
      if (exists) {
        if (baseline.length <= 1) return baseline;
        return baseline.filter(key => key !== fieldKey);
      }
      return [...baseline, fieldKey];
    });
  }, [setAnimalExportFields]);

  const handleSelectAllAnimalFields = useCallback(() => {
    setAnimalExportFields(ANIMAL_EXPORT_FIELD_DEFS.map(def => def.key));
  }, [setAnimalExportFields]);

  const handleResetAnimalFields = useCallback(() => {
    setAnimalExportFields([...DEFAULT_ANIMAL_EXPORT_FIELDS]);
  }, [setAnimalExportFields]);

  const handleTogglePairingField = useCallback((fieldKey) => {
    setPairingExportFields(prev => {
      const baseline = normalizeExportFieldSelection(prev, DEFAULT_PAIRING_EXPORT_FIELDS, PAIRING_EXPORT_FIELD_DEFS);
      if (!fieldKey) return baseline;
      const exists = baseline.includes(fieldKey);
      if (exists) {
        if (baseline.length <= 1) return baseline;
        return baseline.filter(key => key !== fieldKey);
      }
      return [...baseline, fieldKey];
    });
  }, [setPairingExportFields]);

  const handleSelectAllPairingFields = useCallback(() => {
    setPairingExportFields(PAIRING_EXPORT_FIELD_DEFS.map(def => def.key));
  }, [setPairingExportFields]);

  const handleResetPairingFields = useCallback(() => {
    setPairingExportFields([...DEFAULT_PAIRING_EXPORT_FIELDS]);
  }, [setPairingExportFields]);

  const handleAnimalsExportPdf = useCallback(async () => {
    const timestamp = new Date().toISOString();
    try {
      const dataset = buildAnimalExportDataset(snakes, pairings, normalizedAnimalExportFields);
      if (!dataset.columns.length) {
        throw new Error('Select at least one field before exporting.');
      }
      if (!dataset.rows.length) {
        throw new Error('No animals available to export.');
      }
      const safeStamp = timestamp.replace(/[:.]/g, '-');
      await exportDatasetToPdf(dataset, {
        title: 'Animals export',
        subtitle: `${dataset.rows.length} animals • ${dataset.columns.length} fields`,
        fileName: `animals-export-${safeStamp}.pdf`,
      });
      setExportFeedback({
        type: 'success',
        message: `Exported ${dataset.rows.length} animals to PDF.`,
        context: 'animals',
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error('Animals PDF export failed', err);
      setExportFeedback({
        type: 'error',
        message: err?.message || 'Failed to export animals to PDF.',
        context: 'animals',
        timestamp: new Date().toISOString(),
      });
    }
  }, [snakes, pairings, normalizedAnimalExportFields, setExportFeedback]);

  const handleAnimalsExportSheet = useCallback(async () => {
    const timestamp = new Date().toISOString();
    try {
      const dataset = buildAnimalExportDataset(snakes, pairings, normalizedAnimalExportFields);
      if (!dataset.columns.length) {
        throw new Error('Select at least one field before exporting.');
      }
      if (!dataset.rows.length) {
        throw new Error('No animals available to export.');
      }
      const safeStamp = timestamp.replace(/[:.]/g, '-');
      await exportDatasetToXlsx(dataset, {
        fileName: `animals-export-${safeStamp}.xlsx`,
        sheetName: 'Animals',
      });
      setExportFeedback({
        type: 'success',
        message: `Exported ${dataset.rows.length} animals to spreadsheet.`,
        context: 'animals',
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error('Animals sheet export failed', err);
      setExportFeedback({
        type: 'error',
        message: err?.message || 'Failed to export animals to spreadsheet.',
        context: 'animals',
        timestamp: new Date().toISOString(),
      });
    }
  }, [snakes, pairings, normalizedAnimalExportFields, setExportFeedback]);

  const handlePairingsExportPdf = useCallback(async () => {
    const timestamp = new Date().toISOString();
    try {
      const dataset = buildPairingExportDataset(pairings, snakes, normalizedPairingExportFields);
      if (!dataset.columns.length) {
        throw new Error('Select at least one field before exporting.');
      }
      if (!dataset.rows.length) {
        throw new Error('No breeding projects available to export.');
      }
      const safeStamp = timestamp.replace(/[:.]/g, '-');
      await exportDatasetToPdf(dataset, {
        title: 'Breeding projects export',
        subtitle: `${dataset.rows.length} projects • ${dataset.columns.length} fields`,
        fileName: `pairings-export-${safeStamp}.pdf`,
      });
      setExportFeedback({
        type: 'success',
        message: `Exported ${dataset.rows.length} projects to PDF.`,
        context: 'pairings',
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error('Pairings PDF export failed', err);
      setExportFeedback({
        type: 'error',
        message: err?.message || 'Failed to export breeding projects to PDF.',
        context: 'pairings',
        timestamp: new Date().toISOString(),
      });
    }
  }, [pairings, snakes, normalizedPairingExportFields, setExportFeedback]);

  const handlePairingsExportSheet = useCallback(async () => {
    const timestamp = new Date().toISOString();
    try {
      const dataset = buildPairingExportDataset(pairings, snakes, normalizedPairingExportFields);
      if (!dataset.columns.length) {
        throw new Error('Select at least one field before exporting.');
      }
      if (!dataset.rows.length) {
        throw new Error('No breeding projects available to export.');
      }
      const safeStamp = timestamp.replace(/[:.]/g, '-');
      await exportDatasetToXlsx(dataset, {
        fileName: `pairings-export-${safeStamp}.xlsx`,
        sheetName: 'Pairings',
      });
      setExportFeedback({
        type: 'success',
        message: `Exported ${dataset.rows.length} projects to spreadsheet.`,
        context: 'pairings',
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error('Pairings sheet export failed', err);
      setExportFeedback({
        type: 'error',
        message: err?.message || 'Failed to export breeding projects to spreadsheet.',
        context: 'pairings',
        timestamp: new Date().toISOString(),
      });
    }
  }, [pairings, snakes, normalizedPairingExportFields, setExportFeedback]);

  const handleBackupFrequencyChange = useCallback((event) => {
    const nextValue = event?.target?.value || 'off';
    if (typeof updateBackupSettings === 'function') {
      updateBackupSettings({ frequency: nextValue });
    }
  }, [updateBackupSettings]);

  const handleVaultLimitChange = useCallback((event) => {
    if (typeof updateBackupSettings !== 'function') return;
    const rawValue = event?.target?.value;
    if (rawValue === 'unlimited') {
      updateBackupSettings({ maxVaultEntries: 'unlimited' });
      return;
    }
    const parsed = parseInt(rawValue, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      updateBackupSettings({ maxVaultEntries: parsed });
    }
  }, [updateBackupSettings]);

  const handleRunAutoBackupNow = useCallback(() => {
    if (typeof onTriggerAutoBackup !== 'function') {
      setBackupFeedback({
        type: 'error',
        message: 'Automatic backup is unavailable.',
        context: 'auto',
        timestamp: new Date().toISOString(),
      });
      return;
    }
    try {
      onTriggerAutoBackup();
      setBackupFeedback({
        type: 'success',
        message: 'Automatic backup created.',
        context: 'auto',
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error(err);
      setBackupFeedback({
        type: 'error',
        message: err?.message || 'Automatic backup failed.',
        context: 'auto',
        timestamp: new Date().toISOString(),
      });
    }
  }, [onTriggerAutoBackup]);

  const handleDownloadVaultEntry = useCallback((entryId) => {
    const entry = vaultEntries.find(item => item.id === entryId);
    if (!entry) {
      setBackupFeedback({
        type: 'error',
        message: 'Backup file not found.',
        context: 'vault-download',
        timestamp: new Date().toISOString(),
      });
      return;
    }
    try {
      if (typeof window === 'undefined' || typeof document === 'undefined') {
        throw new Error('Downloads are not supported in this environment.');
      }
      const serialized = JSON.stringify(entry.payload, null, 2);
      const fileSafeName = entry.name.replace(/[\\/:*?"<>|]+/g, '-');
      const filename = `${fileSafeName || 'breeding-planner-backup'}-${entry.id}.json`;
      const blob = new Blob([serialized], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setBackupFeedback({
        type: 'success',
        message: `Downloaded “${entry.name}”.`,
        context: 'vault-download',
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error(err);
      setBackupFeedback({
        type: 'error',
        message: err?.message || 'Unable to download the backup.',
        context: 'vault-download',
        timestamp: new Date().toISOString(),
      });
    }
  }, [vaultEntries]);

  const handleRestoreVaultEntry = useCallback((entryId) => {
    const entry = vaultEntries.find(item => item.id === entryId);
    if (!entry) {
      setRestoreFeedback({
        type: 'error',
        message: 'Backup file not found.',
        timestamp: new Date().toISOString(),
      });
      return;
    }
    try {
      if (typeof onRestoreBackup !== 'function') {
        throw new Error('Restore handler is unavailable.');
      }
      onRestoreBackup(entry.payload);
      setRestoreFeedback({
        type: 'success',
        message: `Restored data from “${entry.name}”.`,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error(err);
      setRestoreFeedback({
        type: 'error',
        message: err?.message || 'Failed to restore backup.',
        timestamp: new Date().toISOString(),
      });
    }
  }, [vaultEntries, onRestoreBackup]);

  const handleRenameVaultEntry = useCallback((entryId) => {
    if (typeof onRenameVaultEntry !== 'function') return;
    const entry = vaultEntries.find(item => item.id === entryId);
    if (!entry) return;
    if (typeof window !== 'undefined' && typeof window.prompt === 'function') {
      const next = window.prompt('Rename backup', entry.name);
      if (next && next.trim()) {
        onRenameVaultEntry(entryId, next.trim());
        setBackupFeedback({
          type: 'success',
          message: `Renamed backup to “${next.trim()}”.`,
          context: 'vault-rename',
          timestamp: new Date().toISOString(),
        });
      }
    }
  }, [onRenameVaultEntry, vaultEntries]);

  const handleDeleteVaultEntry = useCallback((entryId) => {
    if (typeof onDeleteVaultEntry !== 'function') return;
    const entry = vaultEntries.find(item => item.id === entryId);
    if (!entry) return;
    let confirmed = true;
    if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
      confirmed = window.confirm(`Delete “${entry.name}”? This cannot be undone.`);
    }
    if (!confirmed) return;
    onDeleteVaultEntry(entryId);
    setBackupFeedback({
      type: 'success',
      message: `Deleted “${entry.name}”.`,
      context: 'vault-delete',
      timestamp: new Date().toISOString(),
    });
  }, [onDeleteVaultEntry, vaultEntries]);

  const handleRestoreFileSelected = useCallback(async (event) => {
    const file = event?.target?.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (typeof onRestoreBackup !== 'function') {
        throw new Error('Restore handler is unavailable.');
      }
      await Promise.resolve(onRestoreBackup(parsed));
      setRestoreFeedback({
        type: 'success',
        message: `Restored data from ${file.name}`,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error(err);
      setRestoreFeedback({
        type: 'error',
        message: err?.message || 'Failed to restore backup.',
        timestamp: new Date().toISOString(),
      });
    } finally {
      if (event?.target) {
        event.target.value = '';
      }
    }
  }, [onRestoreBackup]);

  useEffect(() => {
    const fallback = info.name || info.businessName;
    if (fallback && !previewName) {
      setPreviewName(fallback);
    }
  }, [info.name, info.businessName, previewName]);

  useEffect(() => {
    const pending = pendingTemplateSelectionRef.current;
    if (!pending) return;
    const input = templateInputRef.current;
    if (input) {
      try {
        if (pending.focus) {
          input.focus();
        }
        const valueLength = input.value?.length ?? 0;
        const start = Math.max(0, Math.min(pending.start ?? valueLength, valueLength));
        const end = Math.max(0, Math.min(pending.end ?? valueLength, valueLength));
        input.setSelectionRange(start, end);
        lastTemplateSelectionRef.current = { start, end };
      } catch (err) {
        /* ignore selection errors */
      }
    }
    pendingTemplateSelectionRef.current = null;
  }, [idConfig.template]);

  const previewId = useMemo(() => {
    try {
      const yearNumeric = Number(previewYear);
      const normalizedYear = Number.isFinite(yearNumeric) && yearNumeric > 0 ? yearNumeric : new Date().getFullYear();
  const birthYearNumeric = Number(previewBirthYear);
  const normalizedBirthYear = Number.isFinite(birthYearNumeric) && birthYearNumeric > 0 ? birthYearNumeric : normalizedYear;
      const seqNumeric = Number(previewSequence);
      const normalizedSeq = Number.isFinite(seqNumeric) && seqNumeric > 0 ? seqNumeric : 1;
      const parsed = splitMorphHetInput(previewGenes);
      const morphTokens = parsed.morphs || [];
      const hetTokens = parsed.hets || [];
      const context = buildIdTemplateContext({
        name: previewName,
        rawName: previewName,
        morphs: morphTokens,
        hets: hetTokens,
        year: normalizedYear,
        sex: previewSex,
        birthYear: normalizedBirthYear,
      });
      return buildIdFromTemplateNormalized(idConfig, context, normalizedSeq);
    } catch (err) {
      return 'Template error';
    }
  }, [idConfig, previewName, previewYear, previewBirthYear, previewSex, previewSequence, previewGenes]);

  return (
    <Card title="Setup">
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <TabButton theme={theme} active={setupTab === 'info'} onClick={() => setSetupTab('info')}>Breeder info</TabButton>
  <TabButton theme={theme} active={setupTab === 'id'} onClick={() => setSetupTab('id')}>ID wizard</TabButton>
  <TabButton theme={theme} active={setupTab === 'export'} onClick={() => setSetupTab('export')}>Data exports</TabButton>
  <TabButton theme={theme} active={setupTab === 'backup'} onClick={() => setSetupTab('backup')}>Backups</TabButton>
      </div>

      {setupTab === 'info' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium">Name</label>
              <input
                className="mt-1 w-full border rounded-xl px-3 py-2"
                value={info.name}
                onChange={e => persistBreederInfo(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-medium">Business name</label>
              <input
                className="mt-1 w-full border rounded-xl px-3 py-2"
                value={info.businessName}
                onChange={e => persistBreederInfo(prev => ({ ...prev, businessName: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-medium">Email</label>
              <input
                className="mt-1 w-full border rounded-xl px-3 py-2"
                value={info.email}
                onChange={e => persistBreederInfo(prev => ({ ...prev, email: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-medium">Phone</label>
              <input
                className="mt-1 w-full border rounded-xl px-3 py-2"
                value={info.phone}
                onChange={e => persistBreederInfo(prev => ({ ...prev, phone: e.target.value }))}
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs font-medium">Logo</label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  id="breeder-logo-upload"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async e => {
                    const f = e.target.files && e.target.files[0];
                    if (!f) return;
                    try {
                      const data = await readFileAsDataURL(f);
                      persistBreederInfo(prev => ({ ...prev, logoUrl: data }));
                    } catch (error) {
                      console.error(error);
                    }
                  }}
                />
                <button
                  type="button"
                  className="px-3 py-2 rounded-lg border text-sm"
                  onClick={() => {
                    const el = document.getElementById('breeder-logo-upload');
                    if (el) el.click();
                  }}
                >
                  Upload logo
                </button>
                {info.logoUrl && <img src={info.logoUrl} alt="logo" className="w-20 h-20 object-cover rounded-md border" />}
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              className={cx('px-3 py-2 rounded-lg text-white', primaryBtnClass(theme,true))}
              onClick={() => {
                alert('Breeder info saved locally for this demo');
                if (typeof onSaved === 'function') onSaved();
              }}
            >
              Save
            </button>
          </div>
        </div>
      )}

      {setupTab === 'id' && (
        <div className="border-t pt-4 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="font-semibold text-sm">ID generator wizard</div>
              <div className="text-xs text-neutral-500 mt-1">
                Define how automatic IDs are created when you add animals, generate hatchlings, or import data.
              </div>
            </div>
            <button
              type="button"
              className="text-xs px-2 py-1 border rounded-lg"
              onClick={handleResetIdConfig}
            >
              Reset to default
            </button>
          </div>

          <div>
            <label className="text-xs font-medium">Template</label>
            <input
              className="mt-1 w-full border rounded-xl px-3 py-2 font-mono text-sm"
              ref={templateInputRef}
              value={idConfig.template}
              onChange={e => {
                updateIdConfig({ template: e.target.value });
                captureTemplateSelection();
              }}
              onSelect={captureTemplateSelection}
              onKeyUp={captureTemplateSelection}
              onClick={captureTemplateSelection}
              onFocus={captureTemplateSelection}
              onBlur={captureTemplateSelection}
              placeholder={DEFAULT_ID_GENERATOR_CONFIG.template}
            />
            <div className="mt-1 text-[11px] text-neutral-500">
              Use tokens such as <code>[YROB]</code>, <code>[GEN3]</code>, <code>[SEX]</code>, and <code>[SEQ]</code>. The sequence token is required—well append it automatically if you omit it.
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium">Sequence padding</label>
              <input
                type="number"
                min={1}
                max={6}
                className="mt-1 w-full border rounded-xl px-3 py-2"
                value={idConfig.sequencePadding}
                onChange={e => updateIdConfig({ sequencePadding: parseInt(e.target.value, 10) || 1 })}
              />
              <div className="mt-1 text-[11px] text-neutral-500">Pads the [SEQ] number (e.g., 001).</div>
            </div>
            <div>
              <label className="text-xs font-medium">Letter casing</label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={idConfig.uppercase}
                  onChange={e => updateIdConfig({ uppercase: e.target.checked })}
                />
                <span className="text-sm">Force uppercase output</span>
              </div>
              <div className="mt-1 text-[11px] text-neutral-500">Uncheck to keep mixed case like <em>Ath</em>.</div>
            </div>
            <div>
              <label className="text-xs font-medium">Free text token value</label>
              <input
                className="mt-1 w-full border rounded-xl px-3 py-2"
                value={idConfig.customText}
                onChange={e => updateIdConfig({ customText: e.target.value })}
                placeholder="BREED"
              />
              <div className="mt-1 text-[11px] text-neutral-500">Rendered wherever <code>[TEXT]</code> appears in your template.</div>
            </div>
          </div>

          <div className="border rounded-xl bg-neutral-50 p-4 space-y-3">
            <div className="font-medium text-sm">Live preview</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div>
                <label className="text-xs font-medium">Sample name</label>
                <input
                  className="mt-1 w-full border rounded-xl px-3 py-2"
                  value={previewName}
                  onChange={e => setPreviewName(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-medium">Year</label>
                <input
                  type="number"
                  className="mt-1 w-full border rounded-xl px-3 py-2"
                  value={previewYear}
                  onChange={e => setPreviewYear(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-medium">Birth year</label>
                <input
                  type="number"
                  className="mt-1 w-full border rounded-xl px-3 py-2"
                  value={previewBirthYear}
                  onChange={e => setPreviewBirthYear(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-medium">Sex</label>
                <select
                  className="mt-1 w-full border rounded-xl px-3 py-2 bg-white"
                  value={previewSex}
                  onChange={e => setPreviewSex(e.target.value)}
                >
                  <option value="F">Female</option>
                  <option value="M">Male</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium">Sequence</label>
                <input
                  type="number"
                  min={1}
                  className="mt-1 w-full border rounded-xl px-3 py-2"
                  value={previewSequence}
                  onChange={e => setPreviewSequence(e.target.value)}
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs font-medium">Sample genes</label>
                <input
                  className="mt-1 w-full border rounded-xl px-3 py-2"
                  value={previewGenes}
                  onChange={e => setPreviewGenes(e.target.value)}
                  placeholder="Enchi, Fire, Clown"
                />
                <div className="mt-1 text-[11px] text-neutral-500">Comma, slash, or newline separated list. Each gene contributes a three-letter chunk.</div>
              </div>
            </div>
            <div className="text-sm">
              Example ID: <code className="font-mono text-base font-semibold">{previewId}</code>
            </div>
          </div>

          <div className="space-y-1 text-[11px] text-neutral-600">
            <div className="font-semibold text-neutral-700">Available tokens</div>
            <div className="space-y-1.5">
              {ID_TEMPLATE_TOKENS.map(({ token, description }) => {
                const templateValue = token;
                const hasToken = (idConfig.template || '').includes(templateValue);
                return (
                  <button
                    key={token}
                    type="button"
                    aria-pressed={hasToken}
                    onClick={() => handleTemplateTokenToggle(token)}
                    className={cx(
                      'w-full flex items-center gap-3 rounded-lg border px-2 py-1.5 text-left transition',
                      hasToken
                        ? 'border-blue-500/60 bg-blue-50 text-blue-700 shadow-sm'
                        : 'border-neutral-200 bg-white hover:border-blue-400 hover:bg-blue-50/40'
                    )}
                  >
                    <span className={cx(
                      'font-mono text-[10px] px-1.5 py-0.5 rounded border',
                      hasToken ? 'border-blue-400 bg-white text-blue-700' : 'border-neutral-200 bg-neutral-50 text-neutral-700'
                    )}
                    >
                      {token}
                    </span>
                    <span className="flex-1 text-[11px] sm:text-xs text-neutral-600">{description}</span>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                      {hasToken ? 'Remove' : 'Add'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {setupTab === 'export' && (
        <div className="border-t pt-4 space-y-6">
          <div className="space-y-3">
            <div>
              <div className="font-semibold text-sm">Data exports</div>
              <div className="text-xs text-neutral-500 mt-1">
                Choose the columns to include and download PDF or spreadsheet summaries for animals and breeding projects.
              </div>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="border rounded-xl bg-white p-3 shadow-sm space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div>
                    <div className="font-semibold text-sm">Animals</div>
                    <div className="text-xs text-neutral-500">
                      Selected {normalizedAnimalExportFields.length} of {ANIMAL_EXPORT_FIELD_DEFS.length} fields.
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={cx('px-3 py-2 rounded-lg text-sm text-white', primaryBtnClass(theme, true), (!hasAnimalData ? 'opacity-60 cursor-not-allowed' : ''))}
                      onClick={handleAnimalsExportPdf}
                      disabled={!hasAnimalData}
                    >
                      Export PDF
                    </button>
                    <button
                      type="button"
                      className={cx('px-3 py-2 rounded-lg text-sm border', hasAnimalData ? '' : 'opacity-60 cursor-not-allowed')}
                      onClick={handleAnimalsExportSheet}
                      disabled={!hasAnimalData}
                    >
                      Export sheet (.xlsx)
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-[11px] text-neutral-500">
                  <button type="button" className="underline" onClick={handleSelectAllAnimalFields}>Select all</button>
                  <button type="button" className="underline" onClick={handleResetAnimalFields}>Reset defaults</button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {animalFieldSections.map(section => (
                    <div key={section.section} className="space-y-2">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{section.section}</div>
                      <div className="space-y-1.5">
                        {section.fields.map(field => {
                          const checked = animalFieldSet.has(field.key);
                          return (
                            <label key={field.key} className="flex items-center gap-2 text-sm text-neutral-700">
                              <input
                                type="checkbox"
                                className="w-4 h-4 rounded border-neutral-300"
                                checked={checked}
                                onChange={() => handleToggleAnimalField(field.key)}
                              />
                              <span>{field.label}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                {!hasAnimalData && (
                  <div className="text-[11px] text-neutral-500">Add animals to enable exports.</div>
                )}
                {animalExportFeedback && (
                  <div className={cx('text-xs', animalExportFeedback.type === 'success' ? 'text-emerald-600' : 'text-red-600')}>
                    {animalExportFeedback.message}
                    {animalExportFeedback.timestamp ? ` • ${formatDateTimeForDisplay(animalExportFeedback.timestamp)}` : ''}
                  </div>
                )}
              </div>
              <div className="border rounded-xl bg-white p-3 shadow-sm space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div>
                    <div className="font-semibold text-sm">Breeding projects</div>
                    <div className="text-xs text-neutral-500">
                      Selected {normalizedPairingExportFields.length} of {PAIRING_EXPORT_FIELD_DEFS.length} fields.
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={cx('px-3 py-2 rounded-lg text-sm text-white', primaryBtnClass(theme, true), (!hasPairingData ? 'opacity-60 cursor-not-allowed' : ''))}
                      onClick={handlePairingsExportPdf}
                      disabled={!hasPairingData}
                    >
                      Export PDF
                    </button>
                    <button
                      type="button"
                      className={cx('px-3 py-2 rounded-lg text-sm border', hasPairingData ? '' : 'opacity-60 cursor-not-allowed')}
                      onClick={handlePairingsExportSheet}
                      disabled={!hasPairingData}
                    >
                      Export sheet (.xlsx)
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-[11px] text-neutral-500">
                  <button type="button" className="underline" onClick={handleSelectAllPairingFields}>Select all</button>
                  <button type="button" className="underline" onClick={handleResetPairingFields}>Reset defaults</button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {pairingFieldSections.map(section => (
                    <div key={section.section} className="space-y-2">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{section.section}</div>
                      <div className="space-y-1.5">
                        {section.fields.map(field => {
                          const checked = pairingFieldSet.has(field.key);
                          return (
                            <label key={field.key} className="flex items-center gap-2 text-sm text-neutral-700">
                              <input
                                type="checkbox"
                                className="w-4 h-4 rounded border-neutral-300"
                                checked={checked}
                                onChange={() => handleTogglePairingField(field.key)}
                              />
                              <span>{field.label}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                {!hasPairingData && (
                  <div className="text-[11px] text-neutral-500">Build at least one pairing to enable exports.</div>
                )}
                {pairingExportFeedback && (
                  <div className={cx('text-xs', pairingExportFeedback.type === 'success' ? 'text-emerald-600' : 'text-red-600')}>
                    {pairingExportFeedback.message}
                    {pairingExportFeedback.timestamp ? ` • ${formatDateTimeForDisplay(pairingExportFeedback.timestamp)}` : ''}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {setupTab === 'backup' && (
        <div className="border-t pt-4 space-y-6">
          <div className="space-y-3">
            <div>
              <div className="font-semibold text-sm">Manual backup</div>
              <div className="text-xs text-neutral-500 mt-1">
                Download a JSON snapshot with all animals, pairings, groups, breeder info, and settings.
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                className={cx('px-3 py-2 rounded-lg text-sm text-white', primaryBtnClass(theme, true))}
                onClick={handleManualBackupDownload}
              >
                Download backup (.json)
              </button>
              <button
                type="button"
                className="px-3 py-2 rounded-lg border text-sm"
                onClick={handleSaveBackupToVault}
              >
                Save to vault
              </button>
            </div>
            {manualFeedback && (
              <span className={cx('text-xs', manualFeedback.type === 'success' ? 'text-emerald-600' : 'text-red-600')}>
                {manualFeedback.message}
                {manualFeedback.timestamp ? ` • ${formatDateTimeForDisplay(manualFeedback.timestamp)}` : ''}
              </span>
            )}
          </div>

          <div className="space-y-3 border-t pt-4">
            <div>
              <div className="font-semibold text-sm">Automatic backups</div>
              <div className="text-xs text-neutral-500 mt-1">
                Keep an automatic snapshot while the planner is open in your browser.
              </div>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 text-sm">
              <label className="text-xs font-medium uppercase tracking-wide text-neutral-500">Schedule</label>
              <select
                className="border rounded-lg px-3 py-2 bg-white text-sm"
                value={normalizedBackupSettings.frequency}
                onChange={handleBackupFrequencyChange}
              >
                <option value="off">Off</option>
                <option value="nightly">Every night</option>
                <option value="weekly">Every week</option>
                <option value="monthly">Every month</option>
              </select>
            </div>
            <div className="text-xs text-neutral-500">
              Last automatic backup: {lastAutoBackupDisplay}.
              {autoBackupStats && (autoBackupStats.snakes || autoBackupStats.pairings || autoBackupStats.groups) ? (
                <span>
                  {' '}Includes {autoBackupStats.snakes} snakes, {autoBackupStats.pairings} pairings, {autoBackupStats.groups} groups.
                </span>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={cx('px-3 py-2 rounded-lg text-sm text-white', primaryBtnClass(theme, true))}
                onClick={handleRunAutoBackupNow}
              >
                Run now
              </button>
              <button
                type="button"
                className={cx('px-3 py-2 rounded-lg text-sm border', autoBackupSnapshot ? '' : 'opacity-60 cursor-not-allowed')}
                onClick={handleAutoBackupDownload}
                disabled={!autoBackupSnapshot}
              >
                Download latest snapshot
              </button>
            </div>
            {autoFeedback && (
              <div className={cx('text-xs', autoFeedback.type === 'success' ? 'text-emerald-600' : 'text-red-600')}>
                {autoFeedback.message}
                {autoFeedback.timestamp ? ` • ${formatDateTimeForDisplay(autoFeedback.timestamp)}` : ''}
              </div>
            )}
          </div>

          <div className="space-y-3 border-t pt-4">
            <div>
              <div className="font-semibold text-sm">Backup vault</div>
              <div className="text-xs text-neutral-500 mt-1">
                Stored backups with unique identifiers. Rename, download, restore, or remove them here.
              </div>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-sm">
              <label className="text-xs font-medium uppercase tracking-wide text-neutral-500">Retention limit</label>
              <select
                className="border rounded-lg px-3 py-2 bg-white text-sm w-full sm:w-auto"
                value={vaultLimitValue}
                onChange={handleVaultLimitChange}
              >
                {VAULT_LIMIT_OPTIONS.map(option => {
                  const value = option === 'unlimited' ? 'unlimited' : String(option);
                  const label = option === 'unlimited'
                    ? 'Unlimited (no pruning)'
                    : `Keep last ${option}`;
                  return (
                    <option key={value} value={value}>{label}</option>
                  );
                })}
              </select>
            </div>
            <div className="text-[11px] text-neutral-500">{vaultLimitDescription}</div>
            <div className="text-xs text-neutral-500">
              {vaultEntries.length ? `${vaultEntries.length} backup${vaultEntries.length === 1 ? '' : 's'} saved.` : 'No backups saved yet.'}
            </div>
            {vaultFeedback && (
              <div className={cx('text-xs', vaultFeedback.type === 'success' ? 'text-emerald-600' : 'text-red-600')}>
                {vaultFeedback.message}
                {vaultFeedback.timestamp ? ` • ${formatDateTimeForDisplay(vaultFeedback.timestamp)}` : ''}
              </div>
            )}
            <div className="space-y-2">
              {vaultEntries.length ? vaultEntries.map(entry => {
                const createdDisplay = formatDateTimeForDisplay(entry.createdAt);
                const updatedDisplay = entry.updatedAt && entry.updatedAt !== entry.createdAt
                  ? formatDateTimeForDisplay(entry.updatedAt)
                  : null;
                let approxSizeKb = null;
                try {
                  const serialized = JSON.stringify(entry.payload);
                  approxSizeKb = Math.max(1, Math.ceil(serialized.length / 1024));
                } catch (err) {
                  approxSizeKb = null;
                }
                return (
                  <div key={entry.id} className="border rounded-xl bg-white p-3 shadow-sm space-y-2">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div>
                        <div className="font-medium text-sm text-neutral-800">{entry.name}</div>
                        <div className="text-[11px] text-neutral-500 space-x-2">
                          <span>{entry.source === 'auto' ? 'Auto backup' : 'Manual backup'}</span>
                          <span>Created {createdDisplay}</span>
                          {updatedDisplay && <span>Updated {updatedDisplay}</span>}
                          {approxSizeKb && <span>~{approxSizeKb} KB</span>}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="px-3 py-1.5 rounded-lg border text-xs"
                          onClick={() => handleDownloadVaultEntry(entry.id)}
                        >
                          Download
                        </button>
                        <button
                          type="button"
                          className={cx('px-3 py-1.5 rounded-lg text-xs text-white', primaryBtnClass(theme, true))}
                          onClick={() => handleRestoreVaultEntry(entry.id)}
                        >
                          Restore
                        </button>
                        <button
                          type="button"
                          className="px-3 py-1.5 rounded-lg border text-xs"
                          onClick={() => handleRenameVaultEntry(entry.id)}
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          className="px-3 py-1.5 rounded-lg border text-xs text-red-600"
                          onClick={() => handleDeleteVaultEntry(entry.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                    <div className="text-[10px] text-neutral-400 break-words">
                      ID: {entry.id}
                    </div>
                  </div>
                );
              }) : (
                <div className="text-xs text-neutral-500">Create a manual or automatic backup to populate the vault.</div>
              )}
            </div>
          </div>

          <div className="space-y-3 border-t pt-4">
            <div>
              <div className="font-semibold text-sm">Restore from backup</div>
              <div className="text-xs text-neutral-500 mt-1">
                Upload a JSON backup created by this planner to replace the current data.
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <input
                ref={restoreInputRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={handleRestoreFileSelected}
              />
              <button
                type="button"
                className="px-3 py-2 rounded-lg border text-sm"
                onClick={() => {
                  if (restoreInputRef.current) restoreInputRef.current.click();
                }}
              >
                Choose backup file
              </button>
              <span className="text-xs text-neutral-500">.json files only</span>
            </div>
            {restoreFeedback && (
              <div className={cx('text-xs', restoreFeedback.type === 'success' ? 'text-emerald-600' : 'text-red-600')}>
                {restoreFeedback.message}
                {restoreFeedback.timestamp ? ` • ${formatDateTimeForDisplay(restoreFeedback.timestamp)}` : ''}
              </div>
            )}
            <div className="text-[11px] text-neutral-500">
              Restoring replaces everything in the app. Download a backup first to stay safe.
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

// pairings list
function PairingsSection({
  snakes,
  pairings,
  onDelete,
  onOpenSnake,
  onUpdatePairing,
  theme = 'blue',
  focusedPairingId = null,
  onFocusPairing,
  title,
  emptyMessage = 'No pairings yet. Use “New pairing”.',
  variant = 'default'
}) {
  const handleDelete = typeof onDelete === 'function' ? onDelete : null;
  const openSnake = typeof onOpenSnake === 'function' ? onOpenSnake : null;

  const list = Array.isArray(pairings) ? pairings : [];
  const heading = title || `Breeding Planner (${list.length})`;
  const isCollapsedVariant = variant === 'collapsed';
  const listContainerClass = isCollapsedVariant
    ? 'flex flex-col gap-3'
    : 'space-y-4';

  return (
    <Card title={heading}>
      <div className={listContainerClass}>
        {list.map((p, idx) => (
          <PairingInlineCard
            key={p.id}
            pairing={p}
            pairingNumber={idx + 1}
            snakes={snakes}
            onDelete={handleDelete}
            onOpenSnake={openSnake}
            onUpdatePairing={onUpdatePairing}
            theme={theme}
            isFocused={focusedPairingId === p.id}
            onFocus={onFocusPairing ? () => onFocusPairing(p.id) : undefined}
            variant={variant}
          />
        ))}
        {!list.length && (
          <div className={cx('text-sm text-neutral-500', isCollapsedVariant && 'w-full')}>
            {emptyMessage}
          </div>
        )}
      </div>
    </Card>
  );
}

function PairingInlineCard({
  pairing,
  pairingNumber,
  snakes,
  onDelete,
  onOpenSnake,
  onUpdatePairing,
  theme = 'blue',
  isFocused = false,
  onFocus,
  variant = 'default'
}) {
  const cardRef = useRef(null);
  const [showCalculator, setShowCalculator] = useState(false);
  const [isExpanded, setIsExpanded] = useState(variant !== 'collapsed');

  useEffect(() => {
    if (isFocused && cardRef.current) {
      try {
        cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch (err) {
        /* ignore scroll errors */
      }
    }
  }, [isFocused]);

  useEffect(() => {
    if (isFocused && typeof onFocus === 'function') {
      onFocus();
    }
  }, [isFocused, onFocus]);

  const collapsedVariant = variant === 'collapsed';

  useEffect(() => {
    if (!collapsedVariant) {
      setIsExpanded(true);
    } else {
      setIsExpanded(false);
    }
  }, [collapsedVariant]);

  useEffect(() => {
    if (collapsedVariant && isFocused) {
      setIsExpanded(true);
    }
  }, [collapsedVariant, isFocused]);

  const edit = useMemo(() => withPairingLifecycleDefaults(pairing || {}), [pairing]);
  const femaleSnake = useMemo(() => snakeById(snakes, edit.femaleId), [snakes, edit.femaleId]);
  const maleSnake = useMemo(() => snakeById(snakes, edit.maleId), [snakes, edit.maleId]);

  const femaleName = femaleSnake?.name || edit.femaleId || 'Female';
  const maleName = maleSnake?.name || edit.maleId || 'Male';
  const defaultLabel = `${femaleName} × ${maleName}`;
  const femaleGeneticsTokens = useMemo(() => {
    if (!femaleSnake) return [];
    return combineMorphsAndHetsForDisplay(femaleSnake.morphs, femaleSnake.hets);
  }, [femaleSnake]);
  const maleGeneticsTokens = useMemo(() => {
    if (!maleSnake) return [];
    return combineMorphsAndHetsForDisplay(maleSnake.morphs, maleSnake.hets);
  }, [maleSnake]);
  const femaleGeneticsLine = femaleSnake ? (femaleGeneticsTokens.length ? femaleGeneticsTokens.join(', ') : 'Normal') : '—';
  const maleGeneticsLine = maleSnake ? (maleGeneticsTokens.length ? maleGeneticsTokens.join(', ') : 'Normal') : '—';

  const setEdit = useCallback((updater) => {
    if (typeof onUpdatePairing !== 'function') return;
    onUpdatePairing(pairing.id, updater);
  }, [onUpdatePairing, pairing.id]);

  useEffect(() => {
    setEdit(prev => {
      if (!prev) return prev;
      const current = (prev.label || '').trim();
      const nextLabel = defaultLabel;
      if (!current && prev.label !== nextLabel) {
        return { ...prev, label: nextLabel };
      }
      return prev;
    });
  }, [defaultLabel, setEdit]);

  const labelValue = edit.label || defaultLabel;
  const geneticsOdds = useMemo(() => computePairingGenetics(maleSnake, femaleSnake), [maleSnake, femaleSnake]);
  const hasGeneticsOdds = useMemo(() => {
    if (!geneticsOdds) return false;
    const perGene = Array.isArray(geneticsOdds.perGene) ? geneticsOdds.perGene : [];
    const combined = Array.isArray(geneticsOdds.combined) ? geneticsOdds.combined : [];
    return perGene.length > 0 || combined.length > 0;
  }, [geneticsOdds]);

  useEffect(() => {
    if (!hasGeneticsOdds && showCalculator) {
      setShowCalculator(false);
    }
  }, [hasGeneticsOdds, showCalculator]);

  const hatchlings = useMemo(() => {
    return snakes.filter(s => {
      if (!s) return false;
      const tags = Array.isArray(s.tags) ? s.tags : [];
      const groups = Array.isArray(s.groups) ? s.groups : [];
      const taggedHatchling = tags.includes('hatchling') || groups.some(g => /^hatchlings\b/i.test(g));
      if (!taggedHatchling) return false;
      const pairingMatch = s.pairingId === pairing.id || s?.metadata?.pairingId === pairing.id;
      const parentMatch = (s.damId && s.damId === pairing.femaleId) && (s.sireId && s.sireId === pairing.maleId);
      const nameMatch = typeof s.name === 'string' && labelValue && s.name.includes(labelValue);
      return pairingMatch || parentMatch || nameMatch;
    });
  }, [snakes, pairing, labelValue]);

  const lifecycle = useMemo(() => getBreedingCycleDerived(edit), [edit]);
  const cycleYear = useMemo(() => computeBreedingCycleYear({
    clutchDate: lifecycle.clutchDate,
    preLayDate: lifecycle.preLayDate,
    ovulationDate: lifecycle.ovulationDate,
    hatchDate: lifecycle.hatchDate,
    startDate: edit.startDate || ''
  }), [lifecycle.clutchDate, lifecycle.preLayDate, lifecycle.ovulationDate, lifecycle.hatchDate, edit.startDate]);
  const startDisplay = edit.startDate ? formatDateForDisplay(edit.startDate) : '—';
  const endSource = lifecycle.hatchDate || (edit?.hatch?.recorded ? edit?.hatch?.date : '') || lifecycle.clutchDate || '';
  const endDisplay = endSource ? formatDateForDisplay(endSource) : '—';

  const handleGenerateAppointments = useCallback(() => {
    setEdit(d => {
      const created = genMonthlyAppointments(d.startDate || localYMD(new Date()), 5);
      const next = { ...d, appointments: created };
      next.startDate = (next.appointments && next.appointments[0]) ? next.appointments[0].date : next.startDate;
      return next;
    });
  }, [setEdit]);

  const handleAddAppointment = useCallback(() => {
    setEdit(d => {
      const arr = [...(d.appointments || []), { id: uid(), date: localYMD(new Date()), lockObserved: false, lockLoggedAt: null, notes: '' }];
      return { ...d, appointments: arr, startDate: arr[0]?.date || d.startDate || null };
    });
  }, [setEdit]);

  const handleCreateClutchCard = useCallback(async () => {
    const clutchDate = edit?.clutch?.date;
    if (!clutchDate) {
      alert('Please add a clutch date before generating the clutch card.');
      return;
    }
    let eggsValue = edit?.clutch?.eggsTotal;
    if (eggsValue === '' || typeof eggsValue === 'undefined') {
      eggsValue = null;
    } else if (typeof eggsValue === 'string') {
      const parsed = Number(eggsValue);
      eggsValue = Number.isFinite(parsed) ? parsed : eggsValue;
    }
    try {
      const maleGenetics = maleSnake ? (maleGeneticsTokens.length ? maleGeneticsTokens.join(', ') : 'Normal') : '—';
      const femaleGenetics = femaleSnake ? (femaleGeneticsTokens.length ? femaleGeneticsTokens.join(', ') : 'Normal') : '—';
      await exportClutchCardToPdf({
        clutchNumber: pairingNumber,
        clutchDate,
        femaleName,
        femaleGenetics,
        maleName,
        maleGenetics,
        eggsTotal: eggsValue,
        label: labelValue,
      });
    } catch (err) {
      console.error('Failed to generate clutch card', err);
      alert('Unable to generate clutch card PDF.');
    }
  }, [edit, pairingNumber, femaleName, maleName, femaleGeneticsTokens, maleGeneticsTokens, labelValue, femaleSnake, maleSnake]);

  const cardClasses = cx(
    'border rounded-xl shadow-sm bg-white focus:outline-none w-full p-3',
    isFocused ? 'ring-2 ring-sky-400 ring-offset-1' : 'ring-0'
  );

  if (!isExpanded) {
    return (
      <button
        ref={cardRef}
        type="button"
        className={cx(cardClasses, 'text-left cursor-pointer')}
        onClick={() => {
          setIsExpanded(true);
          if (typeof onFocus === 'function') onFocus();
        }}
  aria-expanded={false}
      >
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500 shrink-0">Clutch #{pairingNumber} • {cycleYear}</div>
            <div className="text-[11px] text-neutral-500 flex items-center gap-1">
              <span className="font-semibold">View details</span>
              <span aria-hidden="true">›</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm text-neutral-800">
            <div className="flex items-center gap-2 min-w-[12rem]">
              <span className="text-[11px] uppercase text-neutral-500 font-semibold">♂ Male</span>
              <span className="font-medium truncate">{maleName}</span>
            </div>
            <div className="flex items-center gap-2 min-w-[12rem]">
              <span className="text-[11px] uppercase text-neutral-500 font-semibold">♀ Female</span>
              <span className="font-medium truncate">{femaleName}</span>
            </div>
            <div className="flex items-center gap-2 min-w-[10rem]">
              <span className="text-[11px] uppercase text-neutral-500 font-semibold">Start</span>
              <span className="font-medium">{startDisplay}</span>
            </div>
            <div className="flex items-center gap-2 min-w-[10rem]">
              <span className="text-[11px] uppercase text-neutral-500 font-semibold">End</span>
              <span className="font-medium">{endDisplay}</span>
            </div>
          </div>
        </div>
      </button>
    );
  }

  return (
    <div ref={cardRef} className={cardClasses} tabIndex={-1}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold leading-tight text-sm sm:text-base">
            <div className="truncate">Clutch #{pairingNumber} • {cycleYear}</div>
          </div>
          <div className="mt-1 text-[11px] text-neutral-600 space-y-1">
            <div>
              <div className="truncate text-[12px] font-medium text-neutral-800 flex items-center gap-1">
                <span className="text-[11px] text-neutral-500">♂</span>
                <span className="truncate">{maleName}</span>
              </div>
              <div className="truncate">{maleGeneticsLine}</div>
            </div>
            <div>
              <div className="truncate text-[12px] font-medium text-neutral-800 flex items-center gap-1">
                <span className="text-[11px] text-neutral-500">♀</span>
                <span className="truncate">{femaleName}</span>
              </div>
              <div className="truncate">{femaleGeneticsLine}</div>
            </div>
          </div>
          <div className="flex gap-1 flex-wrap mt-1">
            {(pairing.goals || []).slice(0, 4).map(g => <Badge key={g}>{g}</Badge>)}
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          {typeof onDelete === 'function' && (
            <button className="text-xs px-2 py-1 border rounded-lg" onClick={() => onDelete(pairing.id)}>Delete</button>
          )}
          {isExpanded && (
            <button
              type="button"
              className="text-xs px-2 py-1 border rounded-lg"
              onClick={() => setIsExpanded(false)}
            >
              Collapse
            </button>
          )}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium">Label</label>
          <input
            className="w-full border rounded-xl px-3 py-2 text-sm"
            value={labelValue}
            onChange={e => setEdit(d => ({ ...d, label: e.target.value }))}
          />
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium">Starting date</label>
          <input
            type="date"
            className="w-full border rounded-xl px-3 py-2 text-sm"
            value={edit.startDate || ''}
            onChange={e => setEdit(d => ({ ...d, startDate: e.target.value }))}
          />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] gap-3 min-w-0">
        <div className="flex flex-col gap-3 min-w-0">
          <div className="border rounded-2xl bg-white shadow-sm p-3 flex flex-col gap-3 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Appointments</div>
              <div className="text-[13px] text-neutral-500">Manage pairing touchpoints</div>
            </div>
            <div className="flex gap-2">
              <button className="text-xs px-2 py-1 border rounded-lg" onClick={handleGenerateAppointments}>Generate 5 months</button>
              <button className="text-xs px-2 py-1 border rounded-lg" onClick={handleAddAppointment}>+ Add appointment</button>
            </div>
          </div>
          <div className="flex-1 flex flex-col gap-2 min-w-0">
            {(edit.appointments || []).map((ap, i) => (
              <div key={ap.id} className="grid grid-cols-1 sm:grid-cols-[minmax(0,150px)_minmax(0,1fr)_auto] gap-2 items-center min-w-0">
                <input
                  type="date"
                  className="border rounded-lg px-2 py-1 text-sm min-w-0"
                  value={ap.date}
                  onChange={e => {
                    const v = e.target.value;
                    setEdit(d => {
                      const arr = [...(d.appointments || [])];
                      arr[i] = { ...arr[i], date: v };
                      return { ...d, appointments: arr };
                    });
                  }}
                />
                <div className="flex flex-col sm:flex-row sm:items-center sm:gap-3 gap-1">
                  <label className="inline-flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      className="w-4 h-4"
                      checked={!!ap.lockObserved}
                      onChange={e => {
                        const v = e.target.checked;
                        setEdit(d => {
                          const arr = [...(d.appointments || [])];
                          const prevAppt = arr[i] || {};
                          let nextNotes = prevAppt.notes || '';
                          let nextLockLoggedAt = prevAppt.lockLoggedAt || null;
                          if (v) {
                            const nowIso = nowIsoString();
                            nextLockLoggedAt = nowIso;
                            nextNotes = appendNoteLine(nextNotes, buildLockLogLine(nowIso));
                          } else {
                            nextLockLoggedAt = null;
                          }
                          arr[i] = { ...prevAppt, lockObserved: v, lockLoggedAt: nextLockLoggedAt, notes: nextNotes };
                          return { ...d, appointments: arr };
                        });
                      }}
                    />
                    Lock
                  </label>
                  <input
                    placeholder="Notes"
                    className="border rounded-lg px-2 py-1 text-xs flex-1 min-w-0"
                    value={ap.notes || ''}
                    onChange={e => {
                      const v = e.target.value;
                      setEdit(d => {
                        const arr = [...(d.appointments || [])];
                        arr[i] = { ...arr[i], notes: v };
                        return { ...d, appointments: arr };
                      });
                    }}
                  />
                </div>
                <button
                  className="text-[11px] px-2 py-1 border rounded-lg"
                  onClick={() => {
                    setEdit(d => {
                      const arr = [...(d.appointments || [])];
                      arr.splice(i, 1);
                      return { ...d, appointments: arr, startDate: arr[0]?.date || d.startDate || null };
                    });
                  }}
                >
                  Remove
                </button>
              </div>
            ))}
            {!(edit.appointments || []).length && <div className="text-xs text-neutral-500">No appointments yet.</div>}
          </div>
          </div>
          <CycleTimersFrame lifecycle={lifecycle} theme={theme} />
        </div>

        <PairingLifecycleEditor edit={edit} setEdit={setEdit} theme={theme} onCreateClutchCard={handleCreateClutchCard} lifecycle={lifecycle} />
      </div>

      <div className="mt-4 flex flex-col gap-2">
        <label className="text-xs font-medium">Notes</label>
        <textarea
          rows={2}
          className="w-full border rounded-xl px-3 py-2 text-sm"
          value={edit.notes || ''}
          onChange={e => setEdit(d => ({ ...d, notes: e.target.value }))}
        />
      </div>

      {hatchlings.length > 0 && (
        <div className="mt-4">
          <div className="text-xs font-medium mb-1">Hatchlings</div>
          <div className="flex flex-wrap gap-1">
            {hatchlings.map(h => (
              <button
                key={h.id}
                type="button"
                className={cx(
                  'px-2 py-0.5 text-xs rounded-full border bg-amber-50 text-amber-900',
                  onOpenSnake ? 'hover:bg-amber-100 transition-colors' : 'cursor-default opacity-80'
                )}
                onClick={onOpenSnake ? () => onOpenSnake(h) : undefined}
                title={h.name || h.id}
              >
                {h.name || h.id}
              </button>
            ))}
          </div>
        </div>
      )}

      {hasGeneticsOdds && (
        <div className="mt-4">
          <div className="border rounded-xl bg-neutral-50">
            <button
              type="button"
              className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-neutral-700"
              onClick={() => setShowCalculator(prev => !prev)}
              aria-expanded={showCalculator}
            >
              <span>Genetics calculator</span>
              <span className="text-[11px] text-neutral-500">{showCalculator ? 'Hide' : 'Show'}</span>
            </button>
            {showCalculator && (
              <div className="border-t px-3 pb-3">
                <PairingGeneticsOdds male={maleSnake} female={femaleSnake} odds={geneticsOdds} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PairingGeneticsOdds({ male, female, odds: providedOdds }) {
  const odds = useMemo(() => {
    if (providedOdds) return providedOdds;
    return computePairingGenetics(male, female);
  }, [providedOdds, male, female]);
  const perGene = odds?.perGene || [];
  const combined = odds?.combined || [];
  if (!perGene.length && !combined.length) return null;
  return (
    <div className="mt-3">
      {perGene.length > 0 && (
        <>
          <div className="text-xs font-medium mb-1">Genetics odds</div>
          <div className="flex flex-col gap-2">
            {perGene.map(item => (
              <div key={item.gene} className="rounded-lg border bg-neutral-50 px-2 py-2">
                <div className="text-xs font-semibold text-neutral-700">{item.gene}</div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {item.outcomes.map(out => (
                    <span
                      key={`${item.gene}-${out.label}`}
                      className="inline-flex items-center gap-1 rounded-full border bg-white px-2 py-0.5 text-[11px]"
                    >
                      <span className="font-semibold">{formatProbabilityPercent(out.probability)}</span>
                      <span>{out.label}</span>
                    </span>
                  ))}
                </div>
                {item.notes ? (
                  <div className="mt-1 text-[10px] text-neutral-500">
                    {item.notes}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </>
      )}
      {combined.length > 0 && (
        <div className="mt-3">
          <div className="text-xs font-medium mb-1">Combined genetics odds</div>
          <div className="flex flex-col gap-1.5">
            {combined.map(item => {
              const breakdownItems = (item.breakdown || []).filter(detail => detail.label && detail.label !== 'Normal');
              return (
                <div key={item.key} className="rounded-lg border bg-white px-2 py-1.5 text-[11px] text-neutral-700">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold text-neutral-900">{formatProbabilityPercent(item.probability)}</span>
                    <span>{item.label}</span>
                  </div>
                  {breakdownItems.length ? (
                    <div className="mt-1 flex flex-wrap gap-1 text-[10px] text-neutral-500">
                      {breakdownItems.map(detail => (
                        <span key={`${item.key}-${detail.gene}`} className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 bg-neutral-50">
                          <span className="font-semibold text-neutral-700">{detail.gene}</span>
                          <span>{detail.label}</span>
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function computePairingGenetics(male, female) {
  if (!male || !female) return { perGene: [], combined: [] };
  const maleProfile = buildSnakeGeneProfile(male);
  const femaleProfile = buildSnakeGeneProfile(female);
  const keys = new Set([...maleProfile.keys(), ...femaleProfile.keys()]);
  const results = [];

  for (const key of keys) {
    const maleEntry = maleProfile.get(key) || null;
    const femaleEntry = femaleProfile.get(key) || null;
    const displayName = maleEntry?.displayName || femaleEntry?.displayName || '';
    if (!displayName || /^normal$/i.test(displayName)) continue;

    const inheritance = resolveGeneInheritanceType(displayName, maleEntry, femaleEntry);
    if (!inheritance) continue;

    let calculation = null;
    if (inheritance === 'Recessive') {
      calculation = calcRecessiveOutcome(displayName, maleEntry, femaleEntry);
    } else if (inheritance === 'Incomplete Dominant' || inheritance === 'Dominant') {
      calculation = calcDominantOutcome(displayName, maleEntry, femaleEntry, inheritance);
    } else {
      continue;
    }

    if (!calculation || !calculation.outcomes || !calculation.outcomes.length) continue;

    const hasMeaningfulOutcome = calculation.outcomes.some(out => out.label !== 'Normal' && out.probability > 0.0001);
    if (!hasMeaningfulOutcome) continue;

    const notesParts = [`Inheritance: ${inheritance}`];
    if (calculation.sireDescriptor) notesParts.push(`Sire: ${calculation.sireDescriptor}`);
    if (calculation.damDescriptor) notesParts.push(`Dam: ${calculation.damDescriptor}`);

    results.push({
      gene: displayName,
      inheritance,
      outcomes: calculation.outcomes,
      notes: notesParts.join(' • ')
    });
  }

  results.sort((a, b) => a.gene.localeCompare(b.gene));
  const combined = buildCombinedOutcomes(results);
  return { perGene: results, combined };
}

function buildCombinedOutcomes(perGeneResults, limit = 12, minProbability = 0.01) {
  if (!Array.isArray(perGeneResults) || !perGeneResults.length) return [];

  let combos = [{
    probability: 1,
    breakdown: [],
    labelParts: [],
    geneOutcomes: []
  }];

  perGeneResults.forEach(gene => {
    const outcomes = Array.isArray(gene.outcomes) && gene.outcomes.length
      ? gene.outcomes
      : [{ label: 'Normal', probability: 1 }];

    const nextMap = new Map();

    combos.forEach(base => {
      outcomes.forEach(outcome => {
        const prob = base.probability * (outcome.probability || 0);
        if (prob <= 0) return;
        const breakdown = [...base.breakdown, { gene: gene.gene, label: outcome.label }];
        const labelParts = outcome.label && outcome.label !== 'Normal'
          ? [...base.labelParts, outcome.label]
          : [...base.labelParts];
        const geneOutcomes = [...base.geneOutcomes, `${gene.gene}:${outcome.label}`];
        const key = geneOutcomes.join('|');
        const existing = nextMap.get(key);
        if (existing) {
          existing.probability += prob;
        } else {
          nextMap.set(key, { probability: prob, breakdown, labelParts, geneOutcomes });
        }
      });
    });

    combos = Array.from(nextMap.values());
    combos.sort((a, b) => b.probability - a.probability);
    if (combos.length > 1024) {
      combos = combos.slice(0, 1024);
    }
  });

  combos.sort((a, b) => b.probability - a.probability);

  const filtered = [];
  combos.forEach(item => {
    if (item.probability >= minProbability || filtered.length < limit) {
      filtered.push(item);
    }
  });

  return filtered.slice(0, limit).map(item => ({
    key: item.geneOutcomes.join('|'),
    label: item.labelParts.length ? item.labelParts.join(' + ') : 'Normal (all genes)',
    probability: item.probability,
    breakdown: item.breakdown
  }));
}

function buildSnakeGeneProfile(snake) {
  const profile = new Map();
  if (!snake) return profile;

  const ensureEntry = (key, displayName) => {
    if (!profile.has(key)) {
      profile.set(key, {
        key,
        displayName: displayName || '',
        group: null,
        visualCount: 0,
        superVisual: false,
        hetCount: 0,
        possibleHetProbabilities: [],
        morphTokens: [],
        hetTokens: []
      });
    }
    const entry = profile.get(key);
    if (displayName) {
      if (!entry.displayName || entry.displayName.length < displayName.length) {
        entry.displayName = displayName;
      }
      if (!entry.group || entry.group === 'Other') {
        const derivedGroup = getGeneDisplayGroup(displayName);
        if (derivedGroup) entry.group = derivedGroup;
      }
    }
    return entry;
  };

  (Array.isArray(snake.morphs) ? snake.morphs : []).forEach(token => {
    const parsed = parseVisualMorphToken(token);
    if (!parsed) return;
    const key = normalizeGeneCandidate(parsed.gene);
    if (!key) return;
    const entry = ensureEntry(key, parsed.displayName);
    entry.visualCount += 1;
    entry.superVisual = entry.superVisual || !!parsed.isSuper;
    entry.morphTokens.push(parsed.original);
  });

  (Array.isArray(snake.hets) ? snake.hets : []).forEach(token => {
    const parsed = parseHetDescriptor(token);
    if (!parsed) return;
    const key = normalizeGeneCandidate(parsed.gene);
    if (!key) return;
    const entry = ensureEntry(key, parsed.displayName);
    entry.hetTokens.push(parsed.original);
    if (parsed.isCertain) {
      entry.hetCount += 1;
    } else {
      entry.possibleHetProbabilities.push(Math.max(0, Math.min(1, parsed.probability)));
    }
    if (!entry.group || entry.group === 'Other') entry.group = 'Recessive';
  });

  return profile;
}

function parseVisualMorphToken(token) {
  if (!token) return null;
  const original = String(token).trim();
  if (!original) return null;
  let working = original;
  let isSuper = false;

  const superMatch = working.match(/^super[\s-]+(.+)$/i);
  if (superMatch && superMatch[1]) {
    isSuper = true;
    working = superMatch[1].trim();
  } else {
    const camelSuper = working.match(/^Super([A-Z].*)$/);
    if (camelSuper && camelSuper[1]) {
      isSuper = true;
      working = camelSuper[1].trim();
    }
  }

  const displayName = working.replace(/\s+/g, ' ').trim();
  if (!displayName) return null;

  return {
    gene: displayName,
    displayName,
    isSuper,
    original
  };
}

function parseHetDescriptor(token) {
  if (!token) return null;
  const original = String(token).trim();
  if (!original) return null;
  let working = original;
  let probability = 1;
  let explicitProbability = false;

  const percentMatch = working.match(/^(\d{1,3})%\s*(.+)$/i);
  if (percentMatch && percentMatch[2]) {
    explicitProbability = true;
    probability = Math.min(1, parseInt(percentMatch[1], 10) / 100);
    working = percentMatch[2].trim();
  }

  if (/^possible\s+/i.test(working)) {
    if (!explicitProbability) probability = Math.min(probability, 0.5);
    working = working.replace(/^possible\s+/i, '').trim();
  } else if (/^probable\s+/i.test(working)) {
    if (!explicitProbability) probability = Math.min(probability, 0.66);
    working = working.replace(/^probable\s+/i, '').trim();
  } else if (/^maybe\s+/i.test(working)) {
    if (!explicitProbability) probability = Math.min(probability, 0.33);
    working = working.replace(/^maybe\s+/i, '').trim();
  }

  working = working.replace(/^het\s+/i, '').trim();
  if (!working) return null;

  const displayName = working;
  const isCertain = probability >= 0.999;

  return {
    gene: working,
    displayName,
    probability,
    isCertain,
    original
  };
}

function resolveGeneInheritanceType(displayName, maleEntry, femaleEntry) {
  const candidates = [maleEntry?.group, femaleEntry?.group, getGeneDisplayGroup(displayName)].filter(Boolean);
  const prioritized = candidates.find(type => type && type !== 'Other');
  if (prioritized) return prioritized;
  const fallback = inferGeneTypeFromEntry(maleEntry) || inferGeneTypeFromEntry(femaleEntry);
  if (fallback) return fallback;
  return candidates[0] || null;
}

function inferGeneTypeFromEntry(entry) {
  if (!entry) return null;
  if ((entry.hetCount || 0) > 0 || (entry.possibleHetProbabilities || []).some(p => p > 0)) return 'Recessive';
  if (entry.superVisual) return 'Incomplete Dominant';
  if ((entry.visualCount || 0) > 0) return 'Incomplete Dominant';
  return null;
}

function getRecessiveParentStates(entry) {
  if (!entry) {
    return { descriptor: 'Normal', states: [{ genotype: 'NN', probability: 1 }] };
  }
  if ((entry.visualCount || 0) > 0) {
    return { descriptor: 'Visual', states: [{ genotype: 'rr', probability: 1 }] };
  }
  if ((entry.hetCount || 0) > 0) {
    return { descriptor: 'Het', states: [{ genotype: 'Nr', probability: 1 }] };
  }
  const possibles = (entry.possibleHetProbabilities || []).filter(p => p > 0);
  if (possibles.length) {
    const best = Math.max(...possibles);
    const clamped = Math.max(0, Math.min(1, best));
    if (clamped >= 0.999) {
      return { descriptor: 'Het (proven)', states: [{ genotype: 'Nr', probability: 1 }] };
    }
    return {
      descriptor: `${formatProbabilityPercent(clamped)} possible het`,
      states: [
        { genotype: 'Nr', probability: clamped },
        { genotype: 'NN', probability: 1 - clamped }
      ]
    };
  }
  return { descriptor: 'Normal', states: [{ genotype: 'NN', probability: 1 }] };
}

function recessiveGametes(genotype) {
  if (genotype === 'rr') return [{ allele: 'r', probability: 1 }];
  if (genotype === 'Nr' || genotype === 'rN') {
    return [
      { allele: 'r', probability: 0.5 },
      { allele: 'N', probability: 0.5 }
    ];
  }
  return [{ allele: 'N', probability: 1 }];
}

function calcRecessiveOutcome(geneName, maleEntry, femaleEntry) {
  const sire = getRecessiveParentStates(maleEntry);
  const dam = getRecessiveParentStates(femaleEntry);
  const outcomes = new Map();

  sire.states.forEach(sireState => {
    dam.states.forEach(damState => {
      const pairingWeight = sireState.probability * damState.probability;
      if (pairingWeight <= 0) return;
      const sireGametes = recessiveGametes(sireState.genotype);
      const damGametes = recessiveGametes(damState.genotype);
      sireGametes.forEach(sGamete => {
        damGametes.forEach(dGamete => {
          const prob = pairingWeight * sGamete.probability * dGamete.probability;
          if (prob <= 0) return;
          const mutatedCount = (sGamete.allele === 'r' ? 1 : 0) + (dGamete.allele === 'r' ? 1 : 0);
          const label = mutatedCount === 2 ? `Visual ${geneName}` : mutatedCount === 1 ? `Het ${geneName}` : 'Normal';
          outcomes.set(label, (outcomes.get(label) || 0) + prob);
        });
      });
    });
  });

  const outcomeList = Array.from(outcomes.entries())
    .map(([label, probability]) => ({ label, probability }))
    .filter(item => item.probability > 0.0001)
    .sort((a, b) => b.probability - a.probability);

  return {
    outcomes: outcomeList,
    sireDescriptor: sire.descriptor,
    damDescriptor: dam.descriptor
  };
}

function getDominantParentStates(entry, inheritance) {
  if (!entry) {
    return { descriptor: 'Normal', states: [{ copies: 0, probability: 1 }] };
  }
  if (entry.superVisual) {
    const descriptor = inheritance === 'Incomplete Dominant' ? 'Super visual' : 'Homozygous visual';
    return { descriptor, states: [{ copies: 2, probability: 1 }] };
  }
  if ((entry.visualCount || 0) > 0) {
    return { descriptor: 'Visual', states: [{ copies: 1, probability: 1 }] };
  }
  if ((entry.hetCount || 0) > 0) {
    return { descriptor: 'Carrier', states: [{ copies: 1, probability: 1 }] };
  }
  const possibles = (entry.possibleHetProbabilities || []).filter(p => p > 0);
  if (possibles.length) {
    const best = Math.max(...possibles);
    const clamped = Math.max(0, Math.min(1, best));
    if (clamped >= 0.999) {
      return { descriptor: 'Visual (likely homozygous)', states: [{ copies: 1, probability: 1 }] };
    }
    return {
      descriptor: `${formatProbabilityPercent(clamped)} possible carrier`,
      states: [
        { copies: 1, probability: clamped },
        { copies: 0, probability: 1 - clamped }
      ]
    };
  }
  return { descriptor: 'Normal', states: [{ copies: 0, probability: 1 }] };
}

function dominantGametes(copyCount) {
  if (copyCount >= 2) return [{ allele: 'A', probability: 1 }];
  if (copyCount >= 1) {
    return [
      { allele: 'A', probability: 0.5 },
      { allele: 'a', probability: 0.5 }
    ];
  }
  return [{ allele: 'a', probability: 1 }];
}

function calcDominantOutcome(geneName, maleEntry, femaleEntry, inheritance) {
  const sire = getDominantParentStates(maleEntry, inheritance);
  const dam = getDominantParentStates(femaleEntry, inheritance);
  const outcomes = new Map();

  sire.states.forEach(sireState => {
    dam.states.forEach(damState => {
      const pairingWeight = sireState.probability * damState.probability;
      if (pairingWeight <= 0) return;
      const sireGametes = dominantGametes(sireState.copies);
      const damGametes = dominantGametes(damState.copies);
      sireGametes.forEach(sGamete => {
        damGametes.forEach(dGamete => {
          const prob = pairingWeight * sGamete.probability * dGamete.probability;
          if (prob <= 0) return;
          const mutatedCount = (sGamete.allele === 'A' ? 1 : 0) + (dGamete.allele === 'A' ? 1 : 0);
          let label;
          if (mutatedCount === 0) {
            label = 'Normal';
          } else if (mutatedCount === 2 && inheritance === 'Incomplete Dominant') {
            label = `Super ${geneName}`;
          } else {
            label = geneName;
          }
          outcomes.set(label, (outcomes.get(label) || 0) + prob);
        });
      });
    });
  });

  const outcomeList = Array.from(outcomes.entries())
    .map(([label, probability]) => ({ label, probability }))
    .filter(item => item.probability > 0.0001)
    .sort((a, b) => b.probability - a.probability);

  return {
    outcomes: outcomeList,
    sireDescriptor: sire.descriptor,
    damDescriptor: dam.descriptor
  };
}

function formatProbabilityPercent(value) {
  if (!Number.isFinite(value) || value <= 0) return '0%';
  if (value >= 0.9995) return '100%';
  const percent = value * 100;
  const rounded = Math.round(percent * 10) / 10;
  if (Number.isInteger(rounded)) {
    return `${rounded}%`;
  }
  return `${rounded.toFixed(1)}%`;
}

function getBreedingCycleDerived(edit = {}) {
  const ovulation = edit?.ovulation || {};
  const preLay = edit?.preLayShed || {};
  const clutch = edit?.clutch || {};
  const hatch = edit?.hatch || {};

  const ovulationObserved = !!ovulation.observed;
  const preLayObserved = !!preLay.observed;
  const clutchRecorded = !!clutch.recorded;
  const hatchedRecorded = !!hatch.recorded;

  const ovulationDate = ovulation.date || '';
  const preLayDate = preLay.date || '';
  const clutchDate = clutch.date || '';
  const hatchScheduledDate = hatch.scheduledDate || '';
  const hatchDate = hatch.date || '';

  const preLayWindowTarget = ovulationDate ? addDaysYmd(ovulationDate, 21) : null;
  const eggLayingTarget = preLayDate ? addDaysYmd(preLayDate, 30) : null;
  const hatchTarget = clutchDate ? addDaysYmd(clutchDate, 60) : null;
  const hatchCountdownTarget = hatchScheduledDate || hatchTarget;

  const eggsTotalRaw = clutch.eggsTotal;
  const fertileEggsRaw = clutch.fertileEggs;
  const clutchSlugsRaw = clutch.slugs;
  const eggsTotalNumber = typeof eggsTotalRaw === 'number' && Number.isFinite(eggsTotalRaw)
    ? Math.max(0, eggsTotalRaw)
    : null;
  const fertileEggsNumber = typeof fertileEggsRaw === 'number' && Number.isFinite(fertileEggsRaw)
    ? Math.max(0, fertileEggsRaw)
    : null;
  const clutchFertileValue = fertileEggsRaw === '' || typeof fertileEggsRaw === 'undefined'
    ? ''
    : String(fertileEggsRaw);
  const clutchSlugsValue = clutchSlugsRaw === '' || typeof clutchSlugsRaw === 'undefined'
    ? ''
    : String(clutchSlugsRaw);
  const clutchTotalValue = eggsTotalRaw === '' || typeof eggsTotalRaw === 'undefined'
    ? ''
    : String(eggsTotalRaw);

  const ovulationCountdownActive = ovulationObserved && !preLayObserved;
  const preLayCountdownActive = preLayObserved && !clutchRecorded;
  const clutchCountdownActive = clutchRecorded && !hatchedRecorded;
  const showPreLayCountdown = ovulationCountdownActive && preLayWindowTarget;
  const showEggCountdown = preLayCountdownActive && eggLayingTarget;
  const showHatchCountdown = clutchCountdownActive && hatchTarget;
  const showScheduledCountdown = !clutchCountdownActive && hatchCountdownTarget && !hatchedRecorded && eggsTotalNumber !== 0;

  const timerQueue = [
    showPreLayCountdown ? { key: 'preLay', label: 'Pre-Lay ETA', targetDate: preLayWindowTarget, totalDays: 21 } : null,
    showEggCountdown ? { key: 'eggLay', label: 'Egg Lay ETA', targetDate: eggLayingTarget, totalDays: 30 } : null,
    showHatchCountdown ? { key: 'hatch', label: 'Hatch ETA', targetDate: hatchTarget, totalDays: 60 } : null,
    showScheduledCountdown ? { key: 'scheduled', label: 'Scheduled Hatch', targetDate: hatchCountdownTarget, totalDays: null } : null,
  ].filter(Boolean);

  const activeTimer = timerQueue.length ? timerQueue[0] : null;

  return {
    ovulationObserved,
    preLayObserved,
    clutchRecorded,
    hatchedRecorded,
    ovulationDate,
    preLayDate,
    clutchDate,
    hatchScheduledDate,
    preLayWindowTarget,
    eggLayingTarget,
    hatchTarget,
    hatchCountdownTarget,
  hatchDate,
    eggsTotalNumber,
    fertileEggsNumber,
    clutchFertileValue,
    clutchTotalValue,
    clutchSlugsValue,
    timerQueue,
    activeTimer,
    hasActiveTimers: timerQueue.length > 0,
  };
}

function isPairingCompleted(pairing) {
  if (!pairing) return false;
  const normalized = withPairingLifecycleDefaults({ ...pairing });
  const derived = getBreedingCycleDerived(normalized);
  return !!derived.hatchedRecorded;
}

function computeBreedingCycleYear({ clutchDate, preLayDate, ovulationDate, hatchDate, startDate }) {
  const candidates = [clutchDate, preLayDate, ovulationDate, hatchDate, startDate];
  for (const value of candidates) {
    if (!value) continue;
    const timestamp = Date.parse(value);
    if (!Number.isNaN(timestamp)) {
      return String(new Date(timestamp).getFullYear());
    }
    const match = String(value).match(/^(\d{4})/);
    if (match) return match[1];
  }
  return 'Unknown';
}

function summarizePairingCycleForFemale(pairing) {
  if (!pairing) return null;
  const normalized = withPairingLifecycleDefaults({ ...pairing });
  const derived = getBreedingCycleDerived(normalized);

  const locks = (normalized.appointments || [])
    .filter(ap => ap && ap.lockObserved && (ap.lockLoggedAt || ap.date))
    .map(ap => {
      const recordedAt = ap.lockLoggedAt || ap.date || '';
      const timestamp = Date.parse(recordedAt);
      const display = formatDateTimeForDisplay(recordedAt) || formatDateForDisplay(ap.date) || '';
      return {
        iso: recordedAt,
        display,
        notes: ap.notes ? String(ap.notes).trim() : '',
        timestamp: Number.isNaN(timestamp) ? null : timestamp,
      };
    })
    .filter(entry => entry.iso)
    .sort((a, b) => {
      const aTs = typeof a.timestamp === 'number' ? a.timestamp : Infinity;
      const bTs = typeof b.timestamp === 'number' ? b.timestamp : Infinity;
      return aTs - bTs;
    })
    .map(({ timestamp, ...rest }) => rest);

  const ovulationDate = derived.ovulationDate || '';
  const preLayDate = derived.preLayDate || '';
  const clutchDate = derived.clutchDate || '';
  const hatchDate = derived.hatchDate || '';

  const hasEvents = locks.length || ovulationDate || preLayDate || clutchDate || hatchDate;
  if (!hasEvents) return null;

  const year = computeBreedingCycleYear({ clutchDate, preLayDate, ovulationDate, hatchDate, startDate: normalized.startDate || '' });
  const primaryDate = clutchDate || preLayDate || ovulationDate || hatchDate || normalized.startDate || '';
  const primaryTimestamp = primaryDate && !Number.isNaN(Date.parse(primaryDate)) ? Date.parse(primaryDate) : null;

  const label = normalized.label || `${normalized.femaleId || 'Female'} × ${normalized.maleId || 'Male'}`;

  return {
    id: normalized.id || `${normalized.femaleId || 'female'}-${normalized.maleId || 'male'}-${year}`,
    label,
    year,
    startDate: normalized.startDate || '',
    locks,
    ovulationDate,
    preLayDate,
    clutchDate,
    hatchDate,
    sortValue: primaryTimestamp,
  };
}

function getFemaleBreedingCyclesByYear(femaleId, pairings = []) {
  if (!femaleId || !Array.isArray(pairings) || !pairings.length) return [];

  const cycles = pairings
    .filter(p => p && p.femaleId === femaleId)
    .map(summarizePairingCycleForFemale)
    .filter(Boolean);

  if (!cycles.length) return [];

  const grouped = new Map();
  cycles.forEach(cycle => {
    const key = cycle.year || 'Unknown';
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(cycle);
  });

  const parseYear = (value) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : -Infinity;
  };

  return Array.from(grouped.entries())
    .sort((a, b) => {
      const yearDiff = parseYear(b[0]) - parseYear(a[0]);
      if (yearDiff !== 0) return yearDiff;
      return String(b[0]).localeCompare(String(a[0]));
    })
    .map(([year, items]) => {
      const sortedCycles = items
        .slice()
        .sort((a, b) => {
          const aVal = typeof a.sortValue === 'number' ? a.sortValue : -Infinity;
          const bVal = typeof b.sortValue === 'number' ? b.sortValue : -Infinity;
          return bVal - aVal;
        })
        .map(({ sortValue, ...rest }) => rest);
      return { year, cycles: sortedCycles };
    });
}

function PairingLifecycleEditor({ edit, setEdit, theme = 'blue', onCreateClutchCard, lifecycle }) {
  const [activeDialog, setActiveDialog] = useState(null);
  const [ovulationDraft, setOvulationDraft] = useState({ date: '', notes: '' });
  const [preLayDraft, setPreLayDraft] = useState({ date: '', notes: '' });
  const [clutchDraft, setClutchDraft] = useState({ fertileEggs: '', slugs: '' });
  const [hatchedDraft, setHatchedDraft] = useState({ date: '', hatchedCount: '', notes: '' });

  const derived = lifecycle || getBreedingCycleDerived(edit);
  const {
    ovulationObserved,
    preLayObserved,
    clutchRecorded,
    hatchedRecorded,
    ovulationDate,
    preLayDate,
    clutchDate,
    preLayWindowTarget,
    eggLayingTarget,
    hatchTarget,
    eggsTotalNumber,
    fertileEggsNumber,
    clutchFertileValue,
    clutchSlugsValue,
  } = derived;

  const totalEggsDisplay = useMemo(() => {
    if (typeof eggsTotalNumber === 'number') return eggsTotalNumber;
    const fertileCount = typeof fertileEggsNumber === 'number'
      ? fertileEggsNumber
      : (() => {
          if (clutchFertileValue === '' || typeof clutchFertileValue === 'undefined') return null;
          const parsed = Number(clutchFertileValue);
          return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
        })();
    const slugCount = (() => {
      if (clutchSlugsValue === '' || typeof clutchSlugsValue === 'undefined') return null;
      const parsed = Number(clutchSlugsValue);
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
    })();
    if (fertileCount === null && slugCount === null) return null;
    return Math.max(0, (fertileCount ?? 0)) + Math.max(0, (slugCount ?? 0));
  }, [eggsTotalNumber, fertileEggsNumber, clutchFertileValue, clutchSlugsValue]);

  const hatchLimitForUi = typeof fertileEggsNumber === 'number'
    ? fertileEggsNumber
    : (typeof eggsTotalNumber === 'number' ? eggsTotalNumber : null);

  const hatchLimitLabel = typeof fertileEggsNumber === 'number' ? 'fertile eggs' : 'eggs laid';

  const canGenerateClutchCard = typeof onCreateClutchCard === 'function' && clutchRecorded && !!clutchDate;

  useEffect(() => {
    if (activeDialog === 'ovulation') {
      setOvulationDraft({
        date: edit?.ovulation?.date || localYMD(new Date()),
        notes: edit?.ovulation?.notes || '',
      });
    }
  }, [activeDialog, edit?.ovulation?.date, edit?.ovulation?.notes]);

  useEffect(() => {
    if (activeDialog === 'preLay') {
      setPreLayDraft({
        date: edit?.preLayShed?.date || localYMD(new Date()),
        notes: edit?.preLayShed?.notes || '',
      });
    }
  }, [activeDialog, edit?.preLayShed?.date, edit?.preLayShed?.notes]);

  useEffect(() => {
    if (activeDialog === 'clutch') {
      setClutchDraft({
        fertileEggs: clutchFertileValue === '' ? '' : clutchFertileValue,
        slugs: clutchSlugsValue === '' ? '0' : clutchSlugsValue,
      });
    }
  }, [activeDialog, clutchFertileValue, clutchSlugsValue]);

  useEffect(() => {
    if (activeDialog === 'hatched') {
      setHatchedDraft({
        date: edit?.hatch?.date || localYMD(new Date()),
        hatchedCount: edit?.hatch?.hatchedCount ? String(edit.hatch.hatchedCount) : '',
        notes: edit?.hatch?.notes || '',
      });
    }
  }, [activeDialog, edit?.hatch]);


  const toggleClutch = useCallback((checked) => {
    setEdit(prev => {
      const next = withPairingLifecycleDefaults({ ...prev });
      if (checked) {
        next.clutch.recorded = true;
        next.clutch.date = next.clutch.date || localYMD(new Date());
        if (!next.hatch.scheduledDate && next.clutch.date) {
          next.hatch.scheduledDate = addDaysYmd(next.clutch.date, 60);
        }
      } else {
        const defaults = pairingLifecycleDefaults();
        next.clutch = { ...defaults.clutch };
        next.hatch = { ...defaults.hatch };
      }
      return next;
    });
  }, [setEdit]);

  const updateClutchField = useCallback((field, rawValue) => {
    setEdit(prev => {
      const next = withPairingLifecycleDefaults({ ...prev });
      next.clutch.recorded = true;
      if (field === 'date') {
        const dateValue = rawValue || '';
        next.clutch.date = dateValue;
        if (!next.hatch.scheduledDate && dateValue) {
          next.hatch.scheduledDate = addDaysYmd(dateValue, 60);
        }
      } else if (field === 'fertileEggs' || field === 'slugs') {
        const inputValue = rawValue ?? '';
        if (inputValue === '') {
          next.clutch[field] = '';
        } else {
          const parsed = Number(inputValue);
          next.clutch[field] = Number.isFinite(parsed) ? Math.max(0, parsed) : next.clutch[field];
        }
        const fertileValue = typeof next.clutch.fertileEggs === 'number' && Number.isFinite(next.clutch.fertileEggs)
          ? Math.max(0, next.clutch.fertileEggs)
          : null;
        const slugValue = typeof next.clutch.slugs === 'number' && Number.isFinite(next.clutch.slugs)
          ? Math.max(0, next.clutch.slugs)
          : null;
        if (fertileValue === null && slugValue === null) {
          next.clutch.eggsTotal = '';
        } else {
          const total = Math.max(0, fertileValue ?? 0) + Math.max(0, slugValue ?? 0);
          next.clutch.eggsTotal = total;
        }
      } else if (field === 'notes') {
        next.clutch.notes = rawValue || '';
      }
      return next;
    });
  }, [setEdit]);

  const clearHatched = useCallback(() => {
    setEdit(prev => {
      const next = withPairingLifecycleDefaults({ ...prev });
      next.hatch = { ...pairingLifecycleDefaults().hatch };
      return next;
    });
  }, [setEdit]);

  const openHatchedDialog = useCallback(() => {
    setActiveDialog('hatched');
  }, [setActiveDialog]);

  const saveClutchDraft = useCallback(() => {
    setEdit(prev => {
      const next = withPairingLifecycleDefaults({ ...prev });
      let fertileValue = Number(clutchDraft.fertileEggs);
      if (!Number.isFinite(fertileValue) || fertileValue < 0) fertileValue = 0;
      let slugsValue = clutchDraft.slugs === '' ? 0 : Number(clutchDraft.slugs);
      if (!Number.isFinite(slugsValue) || slugsValue < 0) slugsValue = 0;
      next.clutch.recorded = true;
      next.clutch.date = next.clutch.date || localYMD(new Date());
      next.clutch.fertileEggs = fertileValue;
      next.clutch.slugs = slugsValue;
      next.clutch.eggsTotal = fertileValue + slugsValue;
      if (!next.hatch.scheduledDate && next.clutch.date) {
        next.hatch.scheduledDate = addDaysYmd(next.clutch.date, 60);
      }
      return next;
    });
    setActiveDialog(null);
  }, [clutchDraft, setEdit, setActiveDialog]);


  const saveOvulationDraft = useCallback(() => {
    setEdit(prev => {
      const next = withPairingLifecycleDefaults({ ...prev });
      next.ovulation.observed = true;
      next.ovulation.date = ovulationDraft.date || '';
      next.ovulation.notes = ovulationDraft.notes || '';
      if (next.ovulation.date) {
        next.appointments = trimAppointmentsAfterOvulation(next.appointments || [], next.ovulation.date);
      }
      if (next.preLayShed.observed && next.preLayShed.date) {
        const delta = diffInDays(next.ovulation.date, next.preLayShed.date);
        next.preLayShed.intervalFromOvulation = Number.isFinite(delta) ? delta : null;
      }
      return next;
    });
    setActiveDialog(null);
  }, [ovulationDraft, setEdit, setActiveDialog]);

  const savePreLayDraft = useCallback(() => {
    setEdit(prev => {
      const next = withPairingLifecycleDefaults({ ...prev });
      next.preLayShed.observed = true;
      next.preLayShed.date = preLayDraft.date || '';
      next.preLayShed.notes = preLayDraft.notes || '';
      const delta = next.ovulation.observed && next.ovulation.date && preLayDraft.date
        ? diffInDays(next.ovulation.date, preLayDraft.date)
        : null;
      next.preLayShed.intervalFromOvulation = Number.isFinite(delta) ? delta : null;
      return next;
    });
    setActiveDialog(null);
  }, [preLayDraft, setEdit, setActiveDialog]);

  const clutchModalConfirmDisabled = useMemo(() => {
    const eggsRaw = clutchDraft.fertileEggs;
    if (eggsRaw === '') return true;
    const eggsValue = Number(eggsRaw);
    if (!Number.isFinite(eggsValue) || eggsValue < 0) return true;
    if (clutchDraft.slugs === '') return false;
    const slugsValue = Number(clutchDraft.slugs);
    if (!Number.isFinite(slugsValue) || slugsValue < 0) return true;
    return false;
  }, [clutchDraft]);

  const clutchDraftTotal = useMemo(() => {
    const fertileRaw = clutchDraft.fertileEggs;
    const slugRaw = clutchDraft.slugs;
    const hasFertile = fertileRaw !== '' && Number.isFinite(Number(fertileRaw));
    const hasSlugs = slugRaw !== '' && Number.isFinite(Number(slugRaw));
    if (!hasFertile && !hasSlugs) return null;
    const fertileCount = hasFertile ? Math.max(0, Number(fertileRaw)) : 0;
    const slugCount = hasSlugs ? Math.max(0, Number(slugRaw)) : 0;
    return fertileCount + slugCount;
  }, [clutchDraft]);

  const saveHatchedDraft = useCallback(() => {
    setEdit(prev => {
      const next = withPairingLifecycleDefaults({ ...prev });
      let safeCount = hatchedDraft.hatchedCount === '' ? 0 : Number(hatchedDraft.hatchedCount);
      if (!Number.isFinite(safeCount) || safeCount < 0) safeCount = 0;
      const hatchLimit = typeof next.clutch.fertileEggs === 'number' && Number.isFinite(next.clutch.fertileEggs)
        ? Math.max(0, next.clutch.fertileEggs)
        : (typeof next.clutch.eggsTotal === 'number' && Number.isFinite(next.clutch.eggsTotal)
          ? Math.max(0, next.clutch.eggsTotal)
          : null);
      if (typeof hatchLimit === 'number') {
        safeCount = Math.min(safeCount, hatchLimit);
      }
      next.hatch = {
        ...next.hatch,
        recorded: true,
        date: hatchedDraft.date,
        hatchedCount: safeCount,
        notes: hatchedDraft.notes || '',
      };
      return next;
    });
    setActiveDialog(null);
  }, [hatchedDraft, setEdit]);

  const tileClass = "rounded-xl border border-neutral-200 bg-white p-2 flex flex-col gap-2 text-[11px] min-w-0 overflow-hidden";

  return (
    <>
      <div className="border rounded-2xl bg-white shadow-sm p-3 flex flex-col gap-3 h-full max-h-[60vh] min-h-0 overflow-hidden">
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Breeding cycle</div>
          <div className="text-[12px] text-neutral-500">Track sheds, clutches, and hatch</div>
        </div>
        <div className="flex flex-col gap-2.5 min-w-0 overflow-auto pr-1">
          <div className="flex flex-col gap-2.5 lg:grid lg:grid-cols-2 lg:gap-2.5 lg:items-stretch">
            <div className={cx(tileClass, 'flex-1 lg:h-full')}>
              <div className="flex-1 text-center space-y-1">
                <div className="text-[12px] font-semibold uppercase tracking-wide text-neutral-500">Ovulation</div>
                <div className="text-neutral-700 text-[13px]">
                  {ovulationDate ? formatDateForDisplay(ovulationDate) : '—'}
                </div>
                {ovulationObserved && edit?.ovulation?.notes ? (
                  <div className="text-[11px] text-neutral-500 leading-snug max-h-12 overflow-hidden mx-auto">
                    {edit.ovulation.notes}
                  </div>
                ) : null}
                {ovulationObserved && preLayWindowTarget && (
                  <div className="text-[11px] text-neutral-500">Pre-lay window {formatDateForDisplay(preLayWindowTarget)}</div>
                )}
              </div>
              <div className="flex flex-wrap justify-center gap-2 mt-2">
                <button className="text-[11px] px-2.5 py-1 border rounded-lg" onClick={()=>setActiveDialog('ovulation')}>
                  {ovulationObserved ? 'Edit details' : 'Log ovulation'}
                </button>
                {ovulationObserved && (
                  <button className="text-[11px] px-2.5 py-1 border rounded-lg" onClick={()=>{
                    setEdit(prev => {
                      const next = withPairingLifecycleDefaults({ ...prev });
                      next.ovulation = { observed: false, date: '', notes: '' };
                      next.preLayShed = { ...pairingLifecycleDefaults().preLayShed };
                      return next;
                    });
                  }}>Clear</button>
                )}
              </div>
            </div>
            <div className={cx(tileClass, 'flex-1 lg:h-full')}>
              <div className="flex-1 text-center space-y-1">
                <div className="text-[12px] font-semibold uppercase tracking-wide text-neutral-500">Pre-Lay Shed</div>
                <div className="text-neutral-700 text-[13px]">
                  {preLayDate ? formatDateForDisplay(preLayDate) : '—'}
                </div>
                {preLayObserved && Number.isFinite(edit?.preLayShed?.intervalFromOvulation) && (
                  <div className="text-[11px] text-neutral-500">
                    {edit.preLayShed.intervalFromOvulation} days after ovulation
                  </div>
                )}
                {preLayObserved && edit?.preLayShed?.notes ? (
                  <div className="text-[11px] text-neutral-500 leading-snug max-h-12 overflow-hidden mx-auto">
                    {edit.preLayShed.notes}
                  </div>
                ) : null}
                {preLayObserved && eggLayingTarget && (
                  <div className="text-[11px] text-neutral-500">Egg window {formatDateForDisplay(eggLayingTarget)}</div>
                )}
              </div>
              <div className="flex flex-wrap justify-center gap-2 mt-2">
                <button className="text-[11px] px-2.5 py-1 border rounded-lg" onClick={()=>setActiveDialog('preLay')} disabled={!ovulationObserved}>
                  {preLayObserved ? 'Edit details' : 'Log pre-lay shed'}
                </button>
                {preLayObserved && (
                  <button className="text-[11px] px-2.5 py-1 border rounded-lg" onClick={()=>{
                    setEdit(prev => {
                      const next = withPairingLifecycleDefaults({ ...prev });
                      next.preLayShed = { ...pairingLifecycleDefaults().preLayShed };
                      return next;
                    });
                  }}>Clear</button>
                )}
              </div>
            </div>
          </div>
          <div className="flex justify-center">
            <div className={cx(tileClass, 'w-full lg:max-w-xl')}>
              <div className="space-y-0.5">
                <div className="font-semibold uppercase tracking-wide text-neutral-500">Clutch &amp; Hatch</div>
                <div className="text-neutral-700 text-[13px]">
                  {clutchRecorded && clutchDate ? `Laid ${formatDateForDisplay(clutchDate)}` : 'No egg laid recorded'}
                </div>
              </div>

              <div className="mt-3 w-full text-left space-y-3">
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Egg laying date</label>
                  <input
                    type="date"
                    className="mt-1 w-full border rounded-xl px-3 py-2 text-xs"
                    value={clutchDate}
                    onChange={e=>updateClutchField('date', e.target.value)}
                    disabled={!clutchRecorded}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Number of fertile eggs</label>
                    <input
                      type="number"
                      min="0"
                      className="mt-1 w-full border rounded-xl px-3 py-2 text-xs"
                      value={clutchFertileValue}
                      onChange={e=>updateClutchField('fertileEggs', e.target.value)}
                      disabled={!clutchRecorded}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Number of slugs</label>
                    <input
                      type="number"
                      min="0"
                      className="mt-1 w-full border rounded-xl px-3 py-2 text-xs"
                      value={clutchSlugsValue}
                      onChange={e=>updateClutchField('slugs', e.target.value)}
                      disabled={!clutchRecorded}
                    />
                  </div>
                </div>
              </div>

              <div className="mt-3 flex flex-col gap-2 items-center text-xs text-neutral-600">
                <div className="text-[11px] text-neutral-500">
                  {clutchRecorded ? 'Egg laid recorded' : 'No egg laid yet'}
                </div>
                <div className="flex items-center gap-2 text-[11px] text-neutral-500">
                  <span>Expected on</span>
                  <span className="text-neutral-700 font-medium">
                    {hatchTarget ? formatDateForDisplay(hatchTarget) : '—'}
                  </span>
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                  {!clutchRecorded && (
                    <button className="text-[11px] px-2.5 py-1 border rounded-lg" onClick={()=>setActiveDialog('clutch')}>
                      Eggs laid
                    </button>
                  )}
                  {clutchRecorded && (
                    <>
                      <button
                        className="text-[11px] px-2.5 py-1 border rounded-lg"
                        onClick={() => onCreateClutchCard?.()}
                        disabled={!canGenerateClutchCard}
                      >
                        Create clutch card
                      </button>
                      {!hatchedRecorded && (
                        <button
                          className="text-[11px] px-2.5 py-1 border rounded-lg"
                          onClick={openHatchedDialog}
                        >
                          Eggs hatched
                        </button>
                      )}
                      <button
                        className="text-[11px] px-2.5 py-1 border rounded-lg text-rose-600 border-rose-300"
                        onClick={() => toggleClutch(false)}
                      >
                        Clear egg record
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 mt-2 flex items-start justify-between gap-3 w-full">
                <div className="space-y-1 text-left">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">Hatched</div>
                  <div className="text-[13px] text-neutral-700">
                    {hatchedRecorded && edit?.hatch?.date ? `Hatched ${formatDateForDisplay(edit.hatch.date)}` : 'Not yet'}
                  </div>
                  {hatchedRecorded && (
                    <div className="text-[11px] text-neutral-500 space-y-1">
                      <div>Hatched count: {edit?.hatch?.hatchedCount || 0}</div>
                      {edit?.hatch?.notes ? <div>Notes: {edit.hatch.notes}</div> : null}
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2">
                  {hatchedRecorded && (
                    <div className="flex flex-col items-end gap-2">
                      <button
                        className="text-[11px] px-2.5 py-1 border rounded-lg"
                        onClick={openHatchedDialog}
                      >
                        View / edit hatch
                      </button>
                      <button
                        className="text-[11px] px-2.5 py-1 border rounded-lg text-rose-600 border-rose-300"
                        onClick={clearHatched}
                      >
                        Clear hatch record
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-2 text-[11px] text-neutral-500">
                Total eggs laid: {typeof totalEggsDisplay === 'number' ? totalEggsDisplay : '—'} (fertile + slugs)
              </div>
            </div>
          </div>
        </div>
      </div>

      {activeDialog === 'ovulation' && (
        <FloatingDialog
          title="Ovulation details"
          theme={theme}
          onClose={() => setActiveDialog(null)}
          onConfirm={saveOvulationDraft}
          disableConfirm={!ovulationDraft.date}
        >
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium">Ovulation date</label>
              <input type="date" className="mt-1 w-full border rounded-xl px-3 py-2" value={ovulationDraft.date} onChange={e=>setOvulationDraft(d=>({...d, date:e.target.value}))} />
            </div>
            <div>
              <label className="text-xs font-medium">Notes</label>
              <textarea rows={3} className="mt-1 w-full border rounded-xl px-3 py-2" value={ovulationDraft.notes} onChange={e=>setOvulationDraft(d=>({...d, notes:e.target.value}))} />
            </div>
          </div>
        </FloatingDialog>
      )}

      {activeDialog === 'preLay' && (
        <FloatingDialog
          title="Pre-Lay shed details"
          theme={theme}
          onClose={() => setActiveDialog(null)}
          onConfirm={savePreLayDraft}
          disableConfirm={!preLayDraft.date}
        >
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium">Pre-Lay shed date</label>
              <input type="date" className="mt-1 w-full border rounded-xl px-3 py-2" value={preLayDraft.date} onChange={e=>setPreLayDraft(d=>({...d, date:e.target.value}))} />
            </div>
            <div>
              <label className="text-xs font-medium">Notes</label>
              <textarea rows={3} className="mt-1 w-full border rounded-xl px-3 py-2" value={preLayDraft.notes} onChange={e=>setPreLayDraft(d=>({...d, notes:e.target.value}))} />
            </div>
          </div>
        </FloatingDialog>
      )}

      {activeDialog === 'clutch' && (
        <FloatingDialog
          title="Log eggs laid"
          theme={theme}
          onClose={() => setActiveDialog(null)}
          onConfirm={saveClutchDraft}
          disableConfirm={clutchModalConfirmDisabled}
        >
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium">Number of fertile eggs</label>
              <input
                type="number"
                min="0"
                className="mt-1 w-full border rounded-xl px-3 py-2"
                value={clutchDraft.fertileEggs}
                onChange={e=>{
                  const raw = e.target.value;
                  if (raw === '') {
                    setClutchDraft(d=>({ ...d, fertileEggs: '' }));
                    return;
                  }
                  let parsed = Number(raw);
                  if (!Number.isFinite(parsed)) return;
                  if (parsed < 0) parsed = 0;
                  setClutchDraft(d=>({ ...d, fertileEggs: String(parsed) }));
                }}
              />
            </div>
            <div>
              <label className="text-xs font-medium">Number of slugs</label>
              <input
                type="number"
                min="0"
                className="mt-1 w-full border rounded-xl px-3 py-2"
                value={clutchDraft.slugs}
                onChange={e=>{
                  const raw = e.target.value;
                  if (raw === '') {
                    setClutchDraft(d=>({ ...d, slugs: '' }));
                    return;
                  }
                  let parsed = Number(raw);
                  if (!Number.isFinite(parsed)) return;
                  if (parsed < 0) parsed = 0;
                  setClutchDraft(d=>({ ...d, slugs: String(parsed) }));
                }}
              />
              <div className="mt-1 text-[11px] text-neutral-500">
                Total eggs laid will be saved as fertile eggs + slugs{typeof clutchDraftTotal === 'number' ? ` = ${clutchDraftTotal}` : ''}.
              </div>
            </div>
          </div>
        </FloatingDialog>
      )}

      {activeDialog === 'hatched' && (
        <FloatingDialog
          title="Hatch details"
          theme={theme}
          onClose={() => setActiveDialog(null)}
          onConfirm={saveHatchedDraft}
          disableConfirm={!hatchedDraft.date}
        >
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium">Hatch date</label>
              <input type="date" className="mt-1 w-full border rounded-xl px-3 py-2" value={hatchedDraft.date} onChange={e=>setHatchedDraft(d=>({...d, date:e.target.value}))} />
            </div>
            <div>
              <label className="text-xs font-medium">Number hatched</label>
              <input
                type="number"
                min="0"
                max={hatchLimitForUi ?? undefined}
                className="mt-1 w-full border rounded-xl px-3 py-2"
                value={hatchedDraft.hatchedCount}
                onChange={e=>{
                  const raw = e.target.value;
                  if (raw === '') {
                    setHatchedDraft(d=>({ ...d, hatchedCount: '' }));
                    return;
                  }
                  let parsed = Number(raw);
                  if (!Number.isFinite(parsed) || parsed < 0) parsed = 0;
                  if (hatchLimitForUi !== null && parsed > hatchLimitForUi) parsed = hatchLimitForUi;
                  setHatchedDraft(d=>({ ...d, hatchedCount: String(parsed) }));
                }}
              />
              {hatchLimitForUi !== null && (
                <div className="mt-1 text-[11px] text-neutral-500">Maximum allowed: {hatchLimitForUi} ({hatchLimitLabel})</div>
              )}
            </div>
            <div>
              <label className="text-xs font-medium">Notes</label>
              <textarea rows={3} className="mt-1 w-full border rounded-xl px-3 py-2" value={hatchedDraft.notes} onChange={e=>setHatchedDraft(d=>({...d, notes:e.target.value}))} />
            </div>
          </div>
        </FloatingDialog>
      )}
    </>
  );
}

function CycleTimersFrame({ lifecycle, theme = 'blue', className }) {
  const timerQueue = lifecycle?.timerQueue || [];
  const hasTimers = timerQueue.length > 0;
  const [now, setNow] = useState(new Date());
  const isCycleComplete = !!lifecycle?.hatchedRecorded;
  const hatchDate = lifecycle?.hatchDate || '';
  const hasLifecycleData = Boolean(
    lifecycle && (
      lifecycle.ovulationObserved ||
      lifecycle.preLayObserved ||
      lifecycle.clutchRecorded ||
      lifecycle.hatchedRecorded ||
      lifecycle.ovulationDate ||
      lifecycle.preLayDate ||
      lifecycle.clutchDate
    )
  );

  useEffect(() => {
    if (hasTimers || isCycleComplete) return undefined;
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, [hasTimers, isCycleComplete]);

  if (!hasTimers && !hasLifecycleData) {
    return null;
  }

  if (isCycleComplete) {
    return (
      <div className={cx("border rounded-2xl bg-white shadow-sm p-4 sm:p-5 flex flex-col gap-4", className)}>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Cycle timers</div>
            <div className="text-sm text-neutral-600">Breeding cycle status</div>
          </div>
        </div>
        <div className="flex flex-col gap-2 text-sm text-neutral-600">
          <div className="font-medium text-neutral-700">This breeding cycle is over.</div>
          {hatchDate ? (
            <div className="text-xs text-neutral-500">Hatched on {formatDateForDisplay(hatchDate)}</div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className={cx("border rounded-2xl bg-white shadow-sm p-4 sm:p-5 flex flex-col gap-4", className)}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Cycle timers</div>
          <div className="text-sm text-neutral-600">Upcoming breeding milestones</div>
        </div>
        {hasTimers && (
          <div className="text-xs text-neutral-500">{timerQueue.length} active</div>
        )}
      </div>
      {hasTimers ? (
        <div className="flex flex-col gap-3">
          {timerQueue.map(timer => (
            <CountdownBadge
              key={timer.key}
              label={timer.label}
              targetDate={timer.targetDate}
              totalDays={typeof timer.totalDays === 'number' ? timer.totalDays : null}
              theme={theme}
              size="lg"
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2 text-sm text-neutral-600">
          <div>No active timers yet. Log ovulation, pre-lay, or clutch events to start tracking milestones.</div>
          <div className="text-xs font-medium text-neutral-500">Current time: {formatDateTimeForDisplay(now)}</div>
        </div>
      )}
    </div>
  );
}

function FloatingDialog({ title, onClose, onConfirm, children, theme = 'blue', confirmLabel = 'Save', disableConfirm = false }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[70]" onClick={onClose}>
      <div className="bg-white w-full max-w-md rounded-2xl shadow-xl border p-5" onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <div className="font-semibold">{title}</div>
          <button className="text-sm px-2 py-1" onClick={onClose}>Close</button>
        </div>
        <div className="space-y-3 max-h-[60vh] overflow-auto pr-1">
          {children}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button className="px-3 py-2 rounded-xl text-sm border" onClick={onClose}>Cancel</button>
          <button className={cx('px-3 py-2 rounded-xl text-sm', primaryBtnClass(theme, true))} onClick={onConfirm} disabled={disableConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

function CountdownBadge({ label, targetDate, totalDays = null, theme = 'blue', size = 'sm' }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!targetDate) return undefined;
    const id = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(id);
  }, [targetDate]);

  if (!targetDate) return null;

  const target = parseYmd(targetDate);
  if (!target) return null;

  const diffMs = target.getTime() - now;
  const overdue = diffMs < 0;
  const remainingLabel = overdue ? `Overdue by ${formatDurationFromMs(-diffMs)}` : `Due in ${formatDurationFromMs(diffMs)}`;

  let progressPercent = null;
  if (totalDays && totalDays > 0) {
    const totalMs = totalDays * 86400000;
    const elapsed = totalMs - diffMs;
    progressPercent = overdue ? 100 : Math.min(100, Math.max(0, (elapsed / totalMs) * 100));
  }

  const themeClass = theme === 'green'
    ? 'bg-emerald-100 border border-emerald-300 text-emerald-700'
    : theme === 'dark'
      ? 'bg-slate-200 border border-slate-400 text-slate-800'
      : 'bg-sky-100 border border-sky-300 text-sky-700';

  const containerSizing = size === 'lg'
    ? 'px-4 py-3 rounded-2xl gap-3 text-sm sm:text-base'
    : 'px-3 py-1.5 rounded-full gap-2 text-xs';

  return (
    <div className={cx('countdown-badge flex flex-wrap items-center font-semibold w-full', containerSizing, themeClass, overdue && 'overdue')}>
      {progressPercent !== null && <span className="countdown-progress" style={{ width: `${progressPercent}%` }} />}
      <span className="break-words leading-tight">{label}</span>
      <span className="break-words leading-tight">{remainingLabel}</span>
      <span className="break-words leading-tight">{formatDateForDisplay(targetDate)}</span>
    </div>
  );
}

function formatDurationFromMs(ms) {
  const absMs = Math.max(0, Math.floor(ms));
  const totalMinutes = Math.round(absMs / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes - days * 60 * 24) / 60);
  const minutes = totalMinutes - days * 60 * 24 - hours * 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${Math.max(minutes, 0)}m`;
}

function trimAppointmentsAfterOvulation(appointments = [], ovulationDate) {
  if (!ovulationDate || !Array.isArray(appointments) || !appointments.length) return appointments;
  const priorCount = appointments.filter(ap => (ap.date || '') <= ovulationDate).length;
  if (priorCount < 3) return appointments;
  return appointments.filter(ap => (ap.date || '') <= ovulationDate);
}

function diffInDays(startYmd, endYmd) {
  const start = parseYmd(startYmd);
  const end = parseYmd(endYmd);
  if (!start || !end) return null;
  const diffMs = end.getTime() - start.getTime();
  return Math.round(diffMs / 86400000);
}

function parseYmd(dateStr) {
  if (!dateStr) return null;
  const [year, month, day] = String(dateStr).split('-').map(Number);
  if (!year || !month || !day) return null;
  const d = new Date(year, month - 1, day, 12);
  if (isNaN(d.getTime())) return null;
  return d;
}

// import tab
function ImportSection({ importText, setImportText, importPreview, setImportPreview, runImportPreview, applyImport, theme='blue', onCancel }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [parsing, setParsing] = useState(false);
  const sheetInputRef = useRef();

  return (
    <Card title="Import snakes from text">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-medium">Paste text exported from the PDF</label>
          <textarea className="mt-1 w-full h-64 border rounded-xl px-3 py-2"
            value={importText} onChange={e=>setImportText(e.target.value.replace(/Ball Python\s*\(Python regius\)/ig, ''))} placeholder="Paste content here..."/>

          <div className="mt-2">
            <label className="text-xs font-medium">Upload PDF</label>
            <div className="flex items-center gap-2 mt-1">
              <input
                id="import-pdf-input"
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={async e => {
                  const f = e.target.files && e.target.files[0];
                  setSelectedFile(f || null);
                  if (!f) return;
                  setParsing(true);
                  try {
                    const txt = await extractPdfText(f);
                    // set textarea immediately
                    setImportText(txt);

                    // try strict 4-line parser first
                    let items = parseFourLineBlocks(txt);
                    if (items && items.length) {
                      const converted = items.map(p => {
                        const sex = ensureSex(p.sex, 'F');
                        return { name: p.name, sex, morphs: p.morphs || [], hets: p.hets || [], previewText: formatParsedPreview({ ...p, sex }) };
                      });
                      setImportPreview(converted);
                      return;
                    }

                    // try single-line parsing (one snake per line)
                    const lines = txt.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
                    const singleLineResults = lines.map(l => parseOneLineSnake(l)).filter(Boolean);
                    if (singleLineResults && singleLineResults.length) {
                      const convertedSingle = singleLineResults.map(p => {
                        const morphs = [];
                        const hets = [];
                        (p.genetics || []).forEach(g => {
                          const low = String(g).toLowerCase();
                          if (/^het\b|\bhet\b|^66%|^50%|possible/i.test(low)) hets.push(g);
                          else morphs.push(g);
                        });
                        const sex = ensureSex(p.gender && p.gender[0], 'F');
                        return {
                          name: p.name,
                          sex,
                          morphs,
                          hets,
                          previewText: formatParsedPreview({ name: p.name, id: p.id || '', sex, morphs, hets })
                        };
                      });
                      setImportPreview(convertedSingle);
                      return;
                    }

                    // try pipe-separated single-line records
                    const pipeParsed = parsePipeSeparatedLines(txt);
                    if (pipeParsed && pipeParsed.length) {
                      const convertedPipe = pipeParsed.map(p => {
                        const sex = ensureSex(p.sex, 'F');
                        return { name: p.name, sex, morphs: p.morphs || [], hets: p.hets || [], previewText: formatParsedPreview({ name: p.name, id: '', sex, morphs: p.morphs, hets: p.hets }) };
                      });
                      setImportPreview(convertedPipe);
                      return;
                    }

                    // fallback to older heuristic parser
                    const fallback = parseReptileBuddyText(txt);
                    setImportPreview(fallback);
                  } catch (err) {
                    console.error('pdf parse failed', err);
                    alert('Failed to parse PDF');
                  } finally {
                    setParsing(false);
                  }
                }}
              />
              <input id="import-sheet-input" ref={sheetInputRef} type="file" accept=".csv,.xlsx,.xls,text/csv" className="hidden" onChange={async e => {
                const f = e.target.files && e.target.files[0];
                if (!f) return;
                setParsing(true);
                try {
                  const name = (f.name || '').toLowerCase();
                  let text = '';
                  if (name.endsWith('.csv') || name.endsWith('.txt')) {
                    text = await f.text();
                  } else if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
                    let XLSX;
                    try {
                      XLSX = await import('xlsx');
                    } catch (err) {
                      console.error('xlsx import failed', err);
                      alert('To import Excel files please install the "xlsx" package: npm install xlsx');
                      return;
                    }
                    const data = await f.arrayBuffer();
                    const workbook = XLSX.read(data, { type: 'array' });
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                    text = XLSX.utils.sheet_to_csv(worksheet);
                  } else {
                    alert('Unsupported file type. Please upload CSV or XLSX.');
                    return;
                  }

                  const rows = parseCsvToRows(text || '');
                  if (!rows || !rows.length) { setImportPreview([]); return; }

                  const { index: headerIndex, hasHeader } = buildHeaderIndex(rows[0] || []);

                  const parseWithHeaders = (row) => {
                    if (!row || !row.length) return null;
                    const cells = row.map(c => (c || '').toString());
                    if (cells.every(cell => !cell.trim())) return null;

                    const single = (key) => {
                      const values = getHeaderValues(cells, headerIndex, key);
                      return values.length ? values[0].trim() : '';
                    };
                    const allTokens = (key) => getHeaderValues(cells, headerIndex, key).flatMap(splitMultiValueCell);

                    const name = single('name');
                    const id = single('id');
                    const sexRaw = single('sex');
                    const statusRaw = single('status');
                    const yearRaw = single('year');
                    const weightRaw = single('weight');
                    const birthRaw = single('birthDate');
                    const notesRaw = single('notes');

                    const geneticTokens = [
                      ...allTokens('genetics'),
                      ...allTokens('morphs')
                    ];
                    const hetTokens = allTokens('hets').map(token => {
                      const trimmed = token.trim();
                      if (!trimmed) return '';
                      const lower = trimmed.toLowerCase();
                      if (lower.includes('het') || /\d+%/.test(lower) || lower.includes('possible')) return trimmed;
                      return `het ${trimmed}`;
                    }).filter(Boolean);

                    const { morphs, hets } = normalizeMorphHetLists([...geneticTokens, ...hetTokens]);

                    const groups = Array.from(new Set(allTokens('groups')));
                    const tags = Array.from(new Set(allTokens('tags')));

                    const sex = ensureSex(sexRaw, 'F');
                    const year = Number(yearRaw);
                    const weight = weightRaw && weightRaw.trim() ? weightRaw : '';
                    const birthDate = normalizeDateInput(birthRaw) || birthRaw || null;
                    const status = statusRaw ? statusRaw.trim() : '';

                    if (!name && !id && !morphs.length && !hets.length && !groups.length && !tags.length) return null;

                    return {
                      name,
                      id,
                      sex,
                      morphs,
                      hets,
                      groups,
                      tags,
                      weight,
                      year: Number.isFinite(year) ? year : undefined,
                      birthDate,
                      status,
                      notes: notesRaw || undefined
                    };
                  };

                  const dataRows = hasHeader ? rows.slice(1) : rows;
                  let parsed = hasHeader ? dataRows.map(parseWithHeaders).filter(Boolean) : [];

                  if (!parsed.length) {
                    // fallback to positional columns (legacy behaviour)
                    let fallbackRows = rows;
                    const first = rows[0].map(c => (c || '').toString().toLowerCase());
                    const looksLikeHeader = first.some(c => c.includes('name') || c.includes('gender') || c.includes('gen'));
                    if (looksLikeHeader) fallbackRows = rows.slice(1);

                    parsed = fallbackRows.map(r => {
                      const cells = r.map(c => (c || '').trim());
                      if (!cells.length || cells.every(cell => !cell)) return null;
                      const name = cells[0] || '';
                      const genderRaw = (cells[1] || '').trim();
                      const geneticsRaw = (cells[2] || '').trim();
                      const groupsRaw = (cells[3] || '').trim();
                      const tagsRaw = (cells[4] || '').trim();
                      const g = genderRaw.toLowerCase();
                      let sex = 'F';
                      if (/^f$/.test(g) || /\bfemale\b/.test(g)) sex = 'F';
                      else if (/^m$/.test(g) || /\bmale\b/.test(g)) sex = 'M';
                      const tokens = geneticsRaw ? geneticsRaw.split(/[,/]/).map(x => x.trim()).filter(Boolean) : [];
                      const normalized = normalizeMorphHetLists(tokens);
                      const groups = groupsRaw ? groupsRaw.split(/[;,|]/).map(x=>x.trim()).filter(Boolean) : [];
                      const tags = tagsRaw ? tagsRaw.split(/[;,|]/).map(x=>x.trim()).filter(Boolean) : [];
                      return (name || normalized.morphs.length || normalized.hets.length || groups.length || tags.length)
                        ? { name, id: '', sex, morphs: normalized.morphs, hets: normalized.hets, groups, tags }
                        : null;
                    }).filter(Boolean);
                  }

                  if (!parsed.length) { setImportPreview([]); return; }

                  const converted = parsed.map(p => {
                    const sex = ensureSex(p.sex, 'F');
                    const previewPayload = { name: p.name, id: p.id || '', sex, morphs: p.morphs || [], hets: p.hets || [] };
                    return {
                      ...p,
                      sex,
                      previewText: formatParsedPreview(previewPayload)
                    };
                  });

                  setImportPreview(converted);
                  setImportText(text);
                } catch (err) {
                  console.error('sheet import error', err);
                  setImportPreview([]);
                } finally {
                  setParsing(false);
                  try { e.target.value = null; } catch (e2) {}
                }
              }} />
              <button className={cx('text-xs px-2 py-1 rounded-lg', primaryBtnClass(theme,true))} onClick={()=>{ const el = document.getElementById('import-pdf-input'); if (el) el.click(); }} disabled={parsing}>{parsing ? 'Parsing…' : 'Upload PDF'}</button>
              <button className={cx('text-xs px-2 py-1 rounded-lg', 'ml-2', primaryBtnClass(theme,true))} onClick={()=>{ const el = document.getElementById('import-sheet-input'); if (el) el.click(); }} disabled={parsing}>{parsing ? 'Parsing…' : 'Upload Sheet'}</button>
              <div className="text-xs text-neutral-500">{selectedFile ? selectedFile.name : 'No file selected'}</div>
            </div>
          </div>

          <div className="mt-3 flex gap-2">
            <button className="px-3 py-2 rounded-xl text-sm border" onClick={runImportPreview}>Preview</button>
            <button className={cx("px-3 py-2 rounded-xl text-sm border", "bg-white")} onClick={() => { setImportText(''); setSelectedFile(null); setImportPreview([]); if (onCancel) onCancel(); }}>
              Cancel
            </button>
            <button className={cx("px-3 py-2 rounded-xl text-sm text-white", importPreview.length?primaryBtnClass(theme,true):primaryBtnClass(theme,false))}
              disabled={!importPreview.length} onClick={applyImport}>
              Import {importPreview.length?`(${importPreview.length})`:''}
            </button>
          </div>
        </div>

        <div>
          <div className="text-xs font-medium">Preview</div>
          <div className="mt-1 border rounded-xl p-2 h-64 overflow-auto bg-neutral-50">
            {!importPreview.length && <div className="text-sm text-neutral-500">Click Preview to see parsed snakes.</div>}
            {importPreview.map((s,i)=> (
              <div key={i} className="text-sm py-1 border-b last:border-b-0">
                {s.previewText ? (
                  <pre className="text-xs whitespace-pre-wrap">{s.previewText}</pre>
                ) : (
                  <>
                    <div className="font-medium">{s.name} <span className="text-xs text-neutral-500">({s.sex})</span></div>
                    {(() => {
                      const geneticsTokens = combineMorphsAndHetsForDisplay(s.morphs, s.hets);
                      return (
                        <div className="space-y-1 mt-1 text-[10px]">
                          {geneticsTokens.length ? (
                            <GeneLine label="Genetics" genes={geneticsTokens} size="xs" />
                          ) : (
                            <div className="text-neutral-500 uppercase tracking-wide">Genetics: -</div>
                          )}
                        </div>
                      );
                    })()}
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
  <div className="text-xs text-neutral-500 mt-3">Row 1 column titles (Name, ID, Gender, Morphs, etc.) are mapped automatically—double-check the preview before importing.</div>
    </Card>
  );
}

  async function extractPdfText(file) {
    const arrayBuffer = await file.arrayBuffer();
    // Pass Uint8Array to pdfjs for better compatibility
    const uint8 = new Uint8Array(arrayBuffer);
    let pdf;
    try {
      pdf = await pdfjsLib.getDocument({ data: uint8 }).promise;
    } catch (err) {
      console.error('pdfjs failed to load document', err);
      throw err;
    }
    let full = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      // Group items by their vertical position so we preserve line breaks
      const items = content.items || [];
      let lines = [];
      let currentY = null;
      let currentLine = '';
      for (const it of items) {
        const txt = it.str || '';
        // transform is [a,b,c,d,e,f] where f is y coordinate in many builds
        const y = (it.transform && typeof it.transform[5] !== 'undefined') ? Math.round(it.transform[5]) : 0;
        if (currentY === null) {
          currentY = y;
          currentLine = txt;
          continue;
        }
        // if vertical position changes by more than threshold, start a new line
        if (Math.abs(y - currentY) > 5) {
          lines.push(currentLine.trim());
          currentLine = txt;
          currentY = y;
        } else {
          // same line — append with a space separator
          currentLine = (currentLine ? currentLine + ' ' : '') + txt;
        }
      }
      if (currentLine) lines.push(currentLine.trim());
      const pageText = lines.join('\n');
      full += pageText + '\n\n';
    }
    return full;
  }

// groups tab
function GroupsSection({ groups, setGroups, snakes, onDeleteGroup, onOpenSnake, theme='blue' }) {
  const [newGroupName, setNewGroupName] = useState("");
  return (
    <Card title="Groups">
      <div className="flex gap-2">
        <input className="flex-1 border rounded-xl px-3 py-2" placeholder="New group name"
          value={newGroupName} onChange={e=>setNewGroupName(e.target.value)} />
        <button className="px-3 py-2 rounded-xl text-sm border"
          onClick={()=>{
            const g = newGroupName.trim();
            if (!g) return;
            setGroups(prev => prev.includes(g) ? prev : [...prev, g]);
            setNewGroupName("");
          }}>Add</button>
      </div>

      <div className="mt-4 space-y-4">
        {groups.map(g=>{
          const snakesInGroup = snakes.filter(s => (s.groups||[]).includes(g));
          return (
            <div key={g} className="p-3 border rounded-lg">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-medium">{g} <span className="text-xs text-neutral-500">({snakesInGroup.length})</span></div>
                  <div className="text-xs text-neutral-500 mt-1">Members</div>
                </div>
                <div className="flex gap-2">
                  <button className="text-xs px-2 py-1 border rounded-lg" onClick={()=>onDeleteGroup(g)}>Delete</button>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {snakesInGroup.length ? snakesInGroup.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => onOpenSnake && onOpenSnake(s)}
                    className="text-sm px-2 py-1 rounded-full border bg-neutral-50 flex items-center gap-2 hover:bg-neutral-100 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-sky-200"
                  >
                    <span className="font-medium">{s.name}</span>
                    {(() => {
                      const normalizedSex = normalizeSexValue(s.sex);
                      const symbol = normalizedSex === 'M' ? '♂' : (normalizedSex === 'F' ? '♀' : '•');
                      return <span className="text-xs text-neutral-500">{symbol}</span>;
                    })()}
                  </button>
                )) : <div className="text-xs text-neutral-500">No snakes in this group.</div>}
              </div>
            </div>
          );
        })}
        {!groups.length && <div className="py-2 text-xs text-neutral-500">No groups yet.</div>}
      </div>

      <div className="mt-4 text-xs text-neutral-500">
        Tip: Edit a snake to assign or change its group.
      </div>
    </Card>
  );
}

// logs editor
function LogsEditor({ editSnakeDraft, setEditSnakeDraft, lastFeedDefaults, setLastFeedDefaults }) {
  const feedsRef = useRef(null);
  const weightsRef = useRef(null);
  const shedsRef = useRef(null);
  const cleaningsRef = useRef(null);
  const medsRef = useRef(null);

  const removeLog = (key, idx) => {
    setEditSnakeDraft(d=>{
      const arr = [...(d.logs[key]||[])];
      arr.splice(idx,1);
      return { ...d, logs: { ...d.logs, [key]: arr } };
    });
  };

  // auto-scroll to bottom when a section grows so latest entries are visible
  useEffect(()=>{ if (feedsRef.current) feedsRef.current.scrollTop = feedsRef.current.scrollHeight; }, [editSnakeDraft.logs.feeds.length]);
  useEffect(()=>{ if (weightsRef.current) weightsRef.current.scrollTop = weightsRef.current.scrollHeight; }, [editSnakeDraft.logs.weights.length]);
  useEffect(()=>{ if (shedsRef.current) shedsRef.current.scrollTop = shedsRef.current.scrollHeight; }, [editSnakeDraft.logs.sheds.length]);
  useEffect(()=>{ if (cleaningsRef.current) cleaningsRef.current.scrollTop = cleaningsRef.current.scrollHeight; }, [editSnakeDraft.logs.cleanings.length]);
  useEffect(()=>{ if (medsRef.current) medsRef.current.scrollTop = medsRef.current.scrollHeight; }, [editSnakeDraft.logs.meds.length]);
  return (
    <>
      {/* Feeds */}
      <section>
        <div className="flex items-center justify-between">
          <div className="font-medium text-sm">Feeds</div>
          <button className="text-xs px-2 py-1 border rounded-lg"
            onClick={()=>{
              const today=localYMD(new Date());
              // use persisted lastFeedDefaults (but never carry forward weight)
              const def = lastFeedDefaults || { feed: 'Mouse', size: '', sizeDetail: '', form: 'Frozen/thawed', formDetail: '', notes: '' };
              const method = def.form || 'Frozen/thawed';
              const methodDetail = def.formDetail || '';
              setEditSnakeDraft(d=>({...d,logs:{...d.logs,feeds:[...d.logs.feeds,{date:today,feed: def.feed || 'Mouse',size: def.size || '',weightGrams:0,method: method,methodDetail: methodDetail,notes: def.notes || ''}]}}));
            }}>+ Add</button>
        </div>
        <div ref={feedsRef} className="mt-2 space-y-2 max-h-40 overflow-auto">
          {editSnakeDraft.logs.feeds.map((x,i)=>(
            <div key={i} className="grid grid-cols-1 sm:grid-cols-6 gap-2 items-center text-xs">
              <input type="date" className="border rounded-lg px-2 py-1 text-xs" value={x.date}
                onChange={e=>updateLog(setEditSnakeDraft,'feeds',i,{date:e.target.value})}/>

              {/* feed type */}
              <select className="border rounded-lg px-2 py-1 text-xs" value={x.feed||''}
                onChange={e=>updateLog(setEditSnakeDraft,'feeds',i,{feed:e.target.value, size: (e.target.value === 'Mouse' || e.target.value === 'Rat') ? (x.size||'pinky') : ''})}>
                <option value="Mouse">Mouse</option>
                <option value="Rat">Rat</option>
                <option value="Chick">Chick</option>
                <option value="Other">Other</option>
              </select>

              {/* size - only relevant for Mouse/Rat */}
              {(x.feed === 'Mouse' || x.feed === 'Rat') ? (
                <select className="border rounded-lg px-2 py-1 text-xs" value={x.size||''}
                  onChange={e=>updateLog(setEditSnakeDraft,'feeds',i,{size:e.target.value})}>
                  <option value="pinky">pinky</option>
                  <option value="fuzzy">fuzzy</option>
                  <option value="medium">medium</option>
                  <option value="adult">adult</option>
                </select>
              ) : (
                <input className="border rounded-lg px-2 py-1 text-xs" placeholder="Size" value={x.size||''} onChange={e=>updateLog(setEditSnakeDraft,'feeds',i,{size:e.target.value})} />
              )}

              {/* weight in grams */}
              <input type="number" className="border rounded-lg px-2 py-1 text-xs w-full" placeholder="g"
                value={typeof x.weightGrams === 'number' ? x.weightGrams : (x.weightGrams || 0)} onChange={e=>updateLog(setEditSnakeDraft,'feeds',i,{weightGrams: Number(e.target.value) || 0})}/>

              {/* method of feed */}
              <div className="flex gap-2">
                <select className="border rounded-lg px-2 py-1 text-xs" value={x.method||''} onChange={e=>updateLog(setEditSnakeDraft,'feeds',i,{method: e.target.value})}>
                  <option value="Live">Live</option>
                  <option value="Freshly killed">Freshly killed</option>
                  <option value="Frozen/thawed">Frozen/thawed</option>
                  <option value="Other">Other</option>
                </select>
                {x.method === 'Other' && (
                  <input className="border rounded-lg px-2 py-1 text-xs" placeholder="Method details" value={x.methodDetail||''} onChange={e=>updateLog(setEditSnakeDraft,'feeds',i,{methodDetail: e.target.value})} />
                )}
              </div>

              <div className="sm:col-span-6">
                <input className="border rounded-lg px-2 py-1 text-xs w-full" placeholder="Notes" value={x.notes||""} onChange={e=>updateLog(setEditSnakeDraft,'feeds',i,{notes:e.target.value})}/>
              </div>

              <div className="sm:col-span-6 text-right">
                <button className="text-xs px-2 py-1 border rounded-lg text-rose-600" onClick={()=>removeLog('feeds', i)}>Delete</button>
              </div>
            </div>
          ))}
          {!editSnakeDraft.logs.feeds.length && <div className="text-xs text-neutral-500">No records.</div>}
        </div>
      </section>

      {/* Weights */}
      <section>
        <div className="flex items-center justify-between">
          <div className="font-medium text-sm">Weights</div>
          <button className="text-xs px-2 py-1 border rounded-lg"
            onClick={()=>{
              const today=localYMD(new Date());
              setEditSnakeDraft(d=>({...d,logs:{...d.logs,weights:[...d.logs.weights,{date:today,grams:0,notes:""}]}}));
            }}>+ Add</button>
        </div>
        <div ref={weightsRef} className="mt-2 space-y-2 max-h-40 overflow-auto">
          {editSnakeDraft.logs.weights.map((x,i)=>(
            <div key={i} className="grid grid-cols-1 md:grid-cols-4 gap-2 items-center">
              <input type="date" className="border rounded-lg px-2 py-1" value={x.date}
                onChange={e=>updateLog(setEditSnakeDraft,"weights",i,{date:e.target.value})}/>
              <input type="number" className="border rounded-lg px-2 py-1" placeholder="grams"
                value={x.grams} onChange={e=>updateLog(setEditSnakeDraft,"weights",i,{grams:Number(e.target.value)||0})}/>
              <input className="border rounded-lg px-2 py-1 md:col-span-2" placeholder="Notes"
                value={x.notes||""} onChange={e=>updateLog(setEditSnakeDraft,"weights",i,{notes:e.target.value})}/>
              <button className="text-xs px-2 py-1 border rounded-lg text-rose-600 md:col-start-5" onClick={()=>removeLog('weights', i)}>Delete</button>
            </div>
          ))}
          {!editSnakeDraft.logs.weights.length && <div className="text-xs text-neutral-500">No records.</div>}
        </div>
      </section>

      {/* Sheds */}
      <section>
        <div className="flex items-center justify-between">
          <div className="font-medium text-sm">Sheds</div>
          <button className="text-xs px-2 py-1 border rounded-lg"
            onClick={() => {
              const today = localYMD(new Date());
              setEditSnakeDraft(d => ({ ...d, logs: { ...d.logs, sheds: [...d.logs.sheds, { date: today, complete: true, notes: '' }] } }));
            }}>+ Add</button>
        </div>
        <div ref={shedsRef} className="mt-2 space-y-2 max-h-40 overflow-auto">
          {editSnakeDraft.logs.sheds.map((x,i)=>(
            <div key={i} className="grid grid-cols-1 md:grid-cols-4 gap-2 items-center">
              <input type="date" className="border rounded-lg px-2 py-1" value={x.date}
                onChange={e=>updateLog(setEditSnakeDraft,'sheds',i,{date:e.target.value})}/>
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" className="w-4 h-4" checked={!!x.complete}
                  onChange={e=>updateLog(setEditSnakeDraft,'sheds',i,{complete:e.target.checked})}/>
                Complete
              </label>
              <input className="border rounded-lg px-2 py-1 md:col-span-2" placeholder="Notes" value={x.notes||''} onChange={e=>updateLog(setEditSnakeDraft,'sheds',i,{notes:e.target.value})} />
              <button className="text-xs px-2 py-1 border rounded-lg text-rose-600 md:col-start-5" onClick={()=>removeLog('sheds', i)}>Delete</button>
            </div>
          ))}
          {!editSnakeDraft.logs.sheds.length && <div className="text-xs text-neutral-500">No records.</div>}
        </div>
      </section>

      {/* Cleanings */}
      <section>
        <div className="flex items-center justify-between">
          <div className="font-medium text-sm">Cleanings</div>
        <button className="text-xs px-2 py-1 border rounded-lg"
            onClick={()=>{
              const today = localYMD(new Date());
              setEditSnakeDraft(d=>({...d,logs:{...d.logs,cleanings:[...d.logs.cleanings,{date:today,deep:false,notes:''}]}}));
            }}>+ Add</button>
        </div>
        <div ref={cleaningsRef} className="mt-2 space-y-2 max-h-40 overflow-auto">
          {editSnakeDraft.logs.cleanings.map((x,i)=>(
            <div key={i} className="grid grid-cols-1 md:grid-cols-4 gap-2 items-center">
              <input type="date" className="border rounded-lg px-2 py-1" value={x.date}
                onChange={e=>updateLog(setEditSnakeDraft,'cleanings',i,{date:e.target.value})}/>
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" className="w-4 h-4" checked={!!x.deep}
                  onChange={e=>updateLog(setEditSnakeDraft,'cleanings',i,{deep:e.target.checked})}/>
                Deep clean
              </label>
              <input className="border rounded-lg px-2 py-1 md:col-span-2" placeholder="Notes" value={x.notes||''} onChange={e=>updateLog(setEditSnakeDraft,'cleanings',i,{notes:e.target.value})} />
              <button className="text-xs px-2 py-1 border rounded-lg text-rose-600 md:col-start-5" onClick={()=>removeLog('cleanings', i)}>Delete</button>
            </div>
          ))}
          {!editSnakeDraft.logs.cleanings.length && <div className="text-xs text-neutral-500">No records.</div>}
        </div>
      </section>

      {/* Meds */}
      <section>
        <div className="flex items-center justify-between">
          <div className="font-medium text-sm">Meds</div>
          <button className="text-xs px-2 py-1 border rounded-lg"
            onClick={()=>{
              const today=localYMD(new Date());
              setEditSnakeDraft(d=>({...d,logs:{...d.logs,meds:[...d.logs.meds,{date:today,drug:"",dose:"",notes:""}]}}));
            }}>+ Add</button>
        </div>
        <div ref={medsRef} className="mt-2 space-y-2 max-h-40 overflow-auto">
          {editSnakeDraft.logs.meds.map((x,i)=>(
            <div key={i} className="grid grid-cols-1 md:grid-cols-5 gap-2 items-center">
              <input type="date" className="border rounded-lg px-2 py-1" value={x.date}
                onChange={e=>updateLog(setEditSnakeDraft,"meds",i,{date:e.target.value})}/>
              <input className="border rounded-lg px-2 py-1" placeholder="Drug"
                value={x.drug||""} onChange={e=>updateLog(setEditSnakeDraft,"meds",i,{drug:e.target.value})}/>
              <input className="border rounded-lg px-2 py-1" placeholder="Dose"
                value={x.dose||""} onChange={e=>updateLog(setEditSnakeDraft,"meds",i,{dose:e.target.value})}/>
              <input className="border rounded-lg px-2 py-1 md:col-span-2" placeholder="Notes"
                value={x.notes||""} onChange={e=>updateLog(setEditSnakeDraft,"meds",i,{notes:e.target.value})}/>
              <button className="text-xs px-2 py-1 border rounded-lg text-rose-600 md:col-start-6" onClick={()=>removeLog('meds', i)}>Delete</button>
            </div>
          ))}
          {!editSnakeDraft.logs.meds.length && <div className="text-xs text-neutral-500">No records.</div>}
        </div>
      </section>
    </>
  );
}

// calendar
function CalendarSection({ snakes, pairings, theme='blue', onOpenPairing }) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0..11
  const [events, setEvents] = useState([]); // {date, maleId, femaleId, pairingId, apptId}
  const [filters, setFilters] = useState({
    feeds: true,
    weights: true,
    cleanings: true,
    sheds: true,
    meds: true,
    breeding: true,
    clutch: true,
  });

  const malesById = useMemo(() => Object.fromEntries(snakes.filter(s=>s.sex==='M').map(m=>[m.id,m])), [snakes]);
  const femalesById = useMemo(() => Object.fromEntries(snakes.filter(s=>s.sex==='F').map(f=>[f.id,f])), [snakes]);

  const grid = buildMonthGrid(year, month);

  const handleToggleFilter = useCallback((key) => {
    setFilters(prev => ({
      ...prev,
      [key]: !prev[key],
    }));
  }, []);

  const filterDefinitions = useMemo(() => ([
    { key: 'feeds', label: 'Feeds' },
    { key: 'weights', label: 'Weights' },
    { key: 'cleanings', label: 'Cleaning' },
    { key: 'sheds', label: 'Sheds' },
    { key: 'meds', label: 'Meds' },
    { key: 'breeding', label: 'Breeding appointments' },
    { key: 'clutch', label: 'Clutch actions' },
  ]), []);

  const adjustMonth = useCallback((delta) => {
    let nextMonth = month + delta;
    let nextYear = year;
    while (nextMonth < 0) {
      nextMonth += 12;
      nextYear -= 1;
    }
    while (nextMonth > 11) {
      nextMonth -= 12;
      nextYear += 1;
    }
    setYear(nextYear);
    setMonth(nextMonth);
  }, [month, year]);

  const adjustYear = useCallback((delta) => {
    setYear(prev => prev + delta);
  }, []);

  // Arrange: for each male, for each same base day in the month, offset 3 days per order.
  const loadAppointmentsIntoCalendar = useCallback(() => {
    const dim = daysInMonth(year, month);
    /** @type {{date:string,maleId:string,femaleId:string,pairingId:string,apptId:string}[]} */
    const newEvents = [];

  /** collect per male, per base-day */
    const perMale = {};
    pairings.forEach(p => {
      (p.appointments||[]).forEach(ap => {
        const d = new Date(ap.date);
        if (d.getFullYear() !== year || d.getMonth() !== month) return;
        if (!perMale[p.maleId]) perMale[p.maleId] = {};
        const baseDay = d.getDate();
        if (!perMale[p.maleId][baseDay]) perMale[p.maleId][baseDay] = [];
        perMale[p.maleId][baseDay].push({
          pairing: p,
          appt: ap,
          femaleName: femalesById[p.femaleId]?.name || p.femaleId
        });
      });
    });

    Object.keys(perMale).forEach(maleId => {
      const buckets = perMale[maleId]; // {baseDay: items[]}
      Object.keys(buckets).map(n=>Number(n)).sort((a,b)=>a-b).forEach(base => {
        // sort deterministically by female name
        const items = buckets[base].sort((a,b)=> (a.femaleName||"").localeCompare(b.femaleName||""));
        // track occupied days for this male/base in this month so we don't collide
        const occupied = new Set();

        // helper to test spacing (min 3 days apart)
        const okSpacing = (cand) => {
          for (const o of occupied) if (Math.abs(o - cand) < 3) return false;
          return true;
        };

        // helper to find a candidate day using offsets [0, +3, -3, +6, -6, ...]
        const findDay = () => {
          return () => {
            const maxTries = 50;
            for (let k=0; k<maxTries; k++) {
              let offset;
              if (k === 0) offset = 0;
              else if (k % 2 === 1) offset = ((k + 1) / 2) * 3; // +3, +6, +9...
              else offset = - (k / 2) * 3; // -3, -6, -9...
              const cand = base + offset;
              if (cand < 1 || cand > dim) continue;
              if (!occupied.has(cand) && okSpacing(cand)) return cand;
            }
            return null;
          };
        };

        const choose = findDay();
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          let chosen = choose();
          // fallback: pick nearest day in month that satisfies spacing
          if (chosen === null) {
            let found = null;
            // search expanding outwards from base
            for (let dist = 0; dist <= dim; dist++) {
              const candidates = [base - dist, base + dist].filter(d => d >= 1 && d <= dim);
              for (const d of candidates) {
                if (!occupied.has(d) && okSpacing(d)) { found = d; break; }
              }
              if (found !== null) break;
            }
            chosen = found;
          }
          // final fallback: pick any unoccupied day
          if (chosen === null) {
            for (let d = 1; d <= dim; d++) {
              if (!occupied.has(d)) { chosen = d; break; }
            }
          }
          // final final fallback: clamp to base
          if (chosen === null) chosen = Math.min(Math.max(base, 1), dim);
          // mark chosen and the next 2 days as occupied for spacing
          occupied.add(chosen);
          if (chosen+1 <= dim) occupied.add(chosen+1);
          if (chosen+2 <= dim) occupied.add(chosen+2);
          // create events for the 3-day appointment span (only include days in this month)
          const baseDate = new Date(year, month, chosen);
          for (let off = 0; off < 3; off++) {
            const dt = new Date(baseDate);
            dt.setDate(dt.getDate() + off);
            if (dt.getFullYear() === year && dt.getMonth() === month) {
              newEvents.push({
                date: localYMD(dt),
                maleId,
                femaleId: item.pairing.femaleId,
                pairingId: item.pairing.id,
                apptId: item.appt.id,
                type: 'pairing',
                spanOffset: off,
                notes: item.appt.notes || '',
                lockObserved: !!item.appt.lockObserved,
                lockLoggedAt: item.appt.lockLoggedAt || null,
              });
            }
          }
        }
      });
    });

    // add lifecycle events (ovulation, pre-lay, clutch, hatch)
    pairings.forEach(p => {
      const pushLifecycleEvent = (rawDate, stage) => {
        if (!rawDate) return;
        const dt = new Date(rawDate);
        if (Number.isNaN(dt.getTime())) return;
        if (dt.getFullYear() !== year || dt.getMonth() !== month) return;
        newEvents.push({
          date: localYMD(dt),
          type: 'clutch',
          stage,
          pairingId: p.id,
          maleId: p.maleId,
          femaleId: p.femaleId,
        });
      };

      if (p?.ovulation?.observed && p?.ovulation?.date) pushLifecycleEvent(p.ovulation.date, 'ovulation');
      if (p?.preLayShed?.observed && p?.preLayShed?.date) pushLifecycleEvent(p.preLayShed.date, 'preLay');
      if (p?.clutch?.recorded && p?.clutch?.date) pushLifecycleEvent(p.clutch.date, 'clutch');
      if (p?.hatch?.recorded && p?.hatch?.date) pushLifecycleEvent(p.hatch.date, 'hatch');
    });

    // add activity events from snake logs (one-day events)
    snakes.forEach(s => {
      const logs = s.logs || {};
      const addLogs = (key) => {
        (logs[key] || []).forEach(entry => {
          try {
            const dt = new Date(entry.date);
            if (dt.getFullYear() === year && dt.getMonth() === month) {
              // attach the original entry so we can show item/grams/notes in calendar
              newEvents.push({ date: localYMD(dt), type: 'activity', activityKey: key, snakeId: s.id, entry: entry });
            }
          } catch(e) { /* ignore invalid dates */ }
        });
      };
      ['feeds','weights','sheds','cleanings','meds'].forEach(addLogs);
    });

    setEvents(newEvents);
  }, [year, month, pairings, femalesById, snakes]);

  useEffect(() => { loadAppointmentsIntoCalendar(); }, [loadAppointmentsIntoCalendar]);

  const filteredEvents = useMemo(() => {
    return events.filter(ev => {
      if (ev.type === 'activity') {
        const key = ev.activityKey;
        if (!key) return true;
        return filters[key] !== false;
      }
      if (ev.type === 'pairing') {
        return filters.breeding !== false;
      }
      if (ev.type === 'clutch') {
        return filters.clutch !== false;
      }
      return true;
    });
  }, [events, filters]);

  const legend = useMemo(()=>{
    const maleIds = Array.from(new Set(filteredEvents.filter(e=>e.type==='pairing').map(e=>e.maleId).filter(Boolean)));
    return maleIds.map(id=>({ id, name: malesById[id]?.name || id, cls: id ? maleColorBg(id, theme) : '' }));
  }, [filteredEvents, malesById, theme]);

  return (
    <div className="bg-white border rounded-2xl shadow-sm">
      <div className="px-4 py-3 border-b flex flex-wrap items-center gap-3">
        <div className="font-semibold mr-2">Monthly calendar</div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="px-2 py-1 border rounded-lg text-xs"
            onClick={() => adjustMonth(-1)}
            aria-label="Previous month"
          >
            ←
          </button>
          <select className="border rounded-lg px-2 py-1 text-sm" value={month} onChange={e=>setMonth(Number(e.target.value))}>
            {Array.from({length:12},(_,i)=>i).map(m=>(
              <option key={m} value={m}>{new Date(2000,m,1).toLocaleString('en',{month:'long'})}</option>
            ))}
          </select>
          <button
            type="button"
            className="px-2 py-1 border rounded-lg text-xs"
            onClick={() => adjustMonth(1)}
            aria-label="Next month"
          >
            →
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="px-2 py-1 border rounded-lg text-xs"
            onClick={() => adjustYear(-1)}
            aria-label="Previous year"
          >
            ←
          </button>
          <input className="border rounded-lg px-2 py-1 w-24" type="number" value={year} onChange={e=>setYear(Number(e.target.value)||year)} />
          <button
            type="button"
            className="px-2 py-1 border rounded-lg text-xs"
            onClick={() => adjustYear(1)}
            aria-label="Next year"
          >
            →
          </button>
        </div>
        <button className={cx('ml-auto px-3 py-2 rounded-xl text-sm', primaryBtnClass(theme,true))} onClick={loadAppointmentsIntoCalendar}>
          Refresh
        </button>
      </div>

      <div className="px-4 py-3 border-b bg-neutral-50">
        <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-700">
          {filterDefinitions.map(filter => (
            <label key={filter.key} className={cx('flex items-center gap-2 rounded-lg border px-2 py-1 bg-white', filters[filter.key] ? 'border-sky-200 shadow-sm' : 'border-neutral-200 opacity-80')}>
              <input
                type="checkbox"
                className="w-4 h-4"
                checked={!!filters[filter.key]}
                onChange={() => handleToggleFilter(filter.key)}
              />
              <span>{filter.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="p-4">
        <div className="grid grid-cols-7 text-xs font-medium text-neutral-500">
          {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=> <div key={d} className="p-2">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-px bg-neutral-200 rounded-lg overflow-hidden">
          {grid.map((cell, i)=> (
            <div key={i} className={cx("min-h[110px] bg-white p-2", cell.current ? "" : "bg-neutral-50")}>
              <div className="text-xs text-neutral-500">{cell.day}</div>
              <div className="mt-1 flex flex-col gap-1">
                {filteredEvents.filter(e=> e.date===ymd(cell.year,cell.month,cell.day)).map((e,idx)=> {
                  if (e.type === 'activity') {
                    const pal = activityPalettes[e.activityKey] || { bg: '#efefef', border: '#ddd' };
                    const s = snakes.find(x=>x.id===e.snakeId);
                            if (e.activityKey === 'feeds' && e.entry) {
                              const en = e.entry;
                              // support legacy item/grams
                              const kind = en.feed || en.item || 'Feed';
                              const size = en.size ? ` ${en.size}` : '';
                              const grams = (typeof en.weightGrams === 'number' && en.weightGrams > 0) ? ` • ${en.weightGrams} g` : (typeof en.grams === 'number' && en.grams > 0 ? ` • ${en.grams} g` : '');
                              const method = en.method ? ` • ${en.method}${en.methodDetail?` (${en.methodDetail})`:''}` : '';
                              return (
                                <div key={idx} className={cx('text-[11px] px-2 py-1 rounded-full border flex items-start gap-2')} style={{ backgroundColor: pal.bg, borderColor: pal.border }}>
                                  <div className="truncate">
                                    <div className="font-medium truncate">{s?.name || e.snakeId} • {kind}{size}{grams}{method}</div>
                                    {en.notes ? <div className="text-[11px] text-neutral-500 truncate">{en.notes}</div> : null}
                                  </div>
                                </div>
                              );
                    }
                    return (
                      <div key={idx} className={cx('text-[11px] px-2 py-0.5 rounded-full border flex items-center gap-2')} style={{ backgroundColor: pal.bg, borderColor: pal.border }}>
                        <span className="font-medium">{s?.name || e.snakeId}</span>
                        <span className="text-xs text-neutral-700">{e.activityKey.replace(/s$/,'')}</span>
                      </div>
                    );
                  }
                  if (e.type === 'clutch') {
                    const p = pairings.find(pp=>pp.id===e.pairingId);
                    const maleName = malesById[e.maleId]?.name || e.maleId;
                    const femaleName = femalesById[e.femaleId]?.name || e.femaleId;
                    const stageLabels = {
                      ovulation: 'Ovulation observed',
                      preLay: 'Pre-lay shed',
                      clutch: 'Clutch laid',
                      hatch: 'Hatch recorded',
                    };
                    const stageStyles = {
                      ovulation: 'border-sky-200 bg-sky-50',
                      preLay: 'border-amber-200 bg-amber-50',
                      clutch: 'border-rose-200 bg-rose-50',
                      hatch: 'border-emerald-200 bg-emerald-50',
                    };
                    let detail = '';
                    if (e.stage === 'clutch') {
                      const eggs = p?.clutch?.eggsTotal;
                      const slugs = p?.clutch?.slugs;
                      const parts = [];
                      if (typeof eggs === 'number' && Number.isFinite(eggs)) parts.push(`Eggs: ${eggs}`);
                      if (typeof slugs === 'number' && Number.isFinite(slugs)) parts.push(`Slugs: ${slugs}`);
                      if (parts.length) detail = parts.join(' • ');
                      else if (p?.clutch?.notes) detail = p.clutch.notes;
                    } else if (e.stage === 'hatch') {
                      const hatchCount = p?.hatch?.hatchedCount;
                      if (typeof hatchCount === 'number' && Number.isFinite(hatchCount)) detail = `Hatched: ${hatchCount}`;
                      else if (p?.hatch?.notes) detail = p.hatch.notes;
                    } else if (e.stage === 'preLay') {
                      if (p?.preLayShed?.intervalFromOvulation && Number.isFinite(p.preLayShed.intervalFromOvulation)) {
                        detail = `${p.preLayShed.intervalFromOvulation} days after ovulation`;
                      } else if (p?.preLayShed?.notes) {
                        detail = p.preLayShed.notes;
                      }
                    } else if (e.stage === 'ovulation') {
                      detail = p?.ovulation?.notes || '';
                    }
                    return (
                      <button
                        key={idx}
                        onClick={()=>{ if (onOpenPairing) onOpenPairing(e.pairingId); }}
                        className={cx('text-xs px-2 py-1 rounded-lg border flex flex-col text-left w-full', stageStyles[e.stage] || 'border-neutral-200 bg-neutral-50')}
                      >
                        <div className="font-medium truncate">{stageLabels[e.stage] || 'Clutch action'}</div>
                        <div className="text-[11px] text-neutral-500 truncate">{maleName} × {femaleName}</div>
                        {detail ? <div className="text-[11px] text-neutral-500 truncate">{detail}</div> : null}
                      </button>
                    );
                  }
                  // pairing span event — show Male × Female and make clickable
                  const p = pairings.find(pp=>pp.id===e.pairingId);
                  const maleName = malesById[e.maleId]?.name || e.maleId;
                  const femaleName = femalesById[e.femaleId]?.name || e.femaleId;
                  const lockLine = (e.spanOffset === 0 && e.lockObserved && e.lockLoggedAt) ? buildLockLogLine(e.lockLoggedAt) : null;
                  let additionalNote = null;
                  if (e.spanOffset === 0 && e.notes) {
                    const lines = e.notes.split('\n').map(l => l.trim()).filter(Boolean);
                    additionalNote = lines.find(line => !lockLine || line !== lockLine) || null;
                  }
                  return (
                    <button key={idx} onClick={()=>{ if (onOpenPairing) onOpenPairing(e.pairingId); }} className={cx("text-xs px-2 py-1 rounded-lg border flex items-center gap-2 text-left w-full", maleColorBorder(e.maleId, theme))}>
                      <span className={cx("inline-block w-2 h-2 rounded-full mr-1 align-middle", maleColorBg(e.maleId, theme))}></span>
                      <div className="truncate">
                        <div className="font-medium truncate">{maleName} × {femaleName}</div>
                        {p?.label ? <div className="text-[11px] text-neutral-500 truncate">{p.label}</div> : null}
                        {lockLine ? <div className="text-[11px] text-emerald-600 truncate">{lockLine}</div> : null}
                        {additionalNote ? <div className="text-[11px] text-neutral-500 truncate">{additionalNote}</div> : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {legend.map(l => (
            <div key={l.id} className="text-xs px-2 py-1 border rounded-lg">
              <span className={cx("inline-block w-2 h-2 rounded-full mr-1 align-middle", l.cls)}></span>
              {l.name}
            </div>
          ))}
          {!legend.length && <div className="text-xs text-neutral-500">No appointments in this view.</div>}
        </div>
      </div>
    </div>
  );
}

// calendar helpers
function daysInMonth(year, month) { return new Date(year, month+1, 0).getDate(); }
function ymd(year, month, day) { return `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`; }
function buildMonthGrid(year, month) {
  const firstWeekday = new Date(year, month, 1).getDay();
  const dim = daysInMonth(year, month);
  const prevMonth = month - 1;
  const prevYear = prevMonth < 0 ? year - 1 : year;
  const prevDim = daysInMonth(prevYear, (prevMonth+12)%12);
  const cells = [];
  for (let i=0; i<firstWeekday; i++) cells.push({ year: prevYear, month: (prevMonth+12)%12, day: prevDim - firstWeekday + 1 + i, current:false });
  for (let d=1; d<=dim; d++) cells.push({ year, month, day: d, current:true });
  const nextMonth = (month+1)%12; const nextYear = nextMonth===0?year+1:year;
  while (cells.length % 7) cells.push({ year: nextYear, month: nextMonth, day: cells.length%7, current:false });
  return cells;
}

// robust male color index: accepts undefined/null and non-string ids
function maleColorIdx(id) {
  const s = (typeof id === 'string' || typeof id === 'number') ? String(id) : '';
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h;
}
// theme-aware palettes for male legend/event colors
const palettes = {
  blue: {
    bg: ["bg-sky-500","bg-sky-600","bg-sky-400","bg-sky-300","bg-sky-700","bg-sky-200"],
    border: ["border-sky-500","border-sky-600","border-sky-400","border-sky-300","border-sky-700","border-sky-200"],
  },
  green: {
    bg: ["bg-emerald-500","bg-emerald-600","bg-emerald-400","bg-emerald-300","bg-emerald-700","bg-emerald-200"],
    border: ["border-emerald-500","border-emerald-600","border-emerald-400","border-emerald-300","border-emerald-700","border-emerald-200"],
  },
  dark: {
    bg: ["bg-neutral-600","bg-neutral-700","bg-neutral-500","bg-neutral-400","bg-neutral-800","bg-neutral-300"],
    border: ["border-neutral-600","border-neutral-700","border-neutral-500","border-neutral-400","border-neutral-800","border-neutral-300"],
  }
};

function maleColorBg(id, theme='blue'){
  const pal = palettes[theme] || palettes.blue;
  return pal.bg[maleColorIdx(id) % pal.bg.length];
}
function maleColorBorder(id, theme='blue'){
  const pal = palettes[theme] || palettes.blue;
  return pal.border[maleColorIdx(id) % pal.border.length];
}

// activity color palette (used for activity badges and calendar dots)
// activity palettes: using explicit hex colors provided by the user
const activityPalettes = {
  feeds: { bg: '#9EB7B8', border: '#9EB7B8' }, // Teal faded 50%
  weights: { bg: '#BBC7B4', border: '#BBC7B4' }, // Muted Green faded 50%
  cleanings: { bg: '#E6B6A0', border: '#E6B6A0' }, // Muted Orange faded 50%
  sheds: { bg: '#ECD1A5', border: '#ECD1A5' }, // Mustard Yellow faded 50%
  meds: { bg: '#DCAD9A', border: '#DCAD9A' }, // Terracotta faded 50%
  groups: { bg: '#FAF5EE', border: '#FAF5EE' }, // Light Beige faded 50%
  pairing: { bg: '#ECB5CE', border: '#ECB5CE' }, // dark oink faded 50%
};

// gene groups database
const GENE_GROUPS = {
  'Recessive': [
  '210 Hypo','Albino','Atomic','Axanthic','Axanthic (GCR)','Axanthic (Jolliff)','Axanthic (MJ)','Axanthic (TSK)','Axanthic (VPI)',
    'Bengal','Black Axanthic','Black Lace','Candy','Caramel Albino','Clown','Cryptic','Desert Ghost','Enhancer','Genetic Stripe',
    'Ghost (Vesper)','Hypo','Lavender Albino','Maple','Metal Flake','Migraine','Monarch','Monsoon','Moray','Orange Crush',
    'Orange Ghost','Paint','Patternless','Piebald','Puzzle','Rainbow','Sahara','Sandstorm','Sunset','Tornado','Tri-stripe',
    'Ultramel','Whitewash','Zebra'
  ],
  'Incomplete Dominant': [
    'Acid','Ajax','Alloy','Ambush','Arcane','Arroyo','Asphalt','Astro','Bald','Bambino','Bamboo','Banana','Bang','Black Head','Black Pastel',
    'Blade','Bongo','Butter','Cafe','Calico','Carbon','Carnivore','Champagne','Chino','Chocolate','Cinder','Cinnamon','Circle','Citron',
    'Coffee','Copper','Creed','Cypress','Dark Viking','Diesel','Disco','Dot','EMG','Enchi','Epic','Exo-lbb','Fire','Flame','FNR Vanilla',
    'Furrow','Fusion','Gaia','Gallium','GeneX','GHI','Glossy','Gobi','Granite','Gravel','Grim','Het Red Axanthic','Hidden Gene Woma',
    'Hieroglyphic','High Intensity OD','Honey','Huffman','Hydra','Jaguar','Java','Jedi','Jolliff Tiger','Jolt','Joppa','Jungle Woma','KRG',
    'Lace','LC Black Magic','Lemonback','Lesser','Mahogany','Mario','Marvel','Mckenzie','Melt','Microscale','Mocha','Mojave','Mosaic','Motley',
    'Mystic','Nanny','Nico','Nr Mandarin','Nyala','Odium','OFY','Orange Dream','Orbit','Panther','Pastel','Peach','Phantom','Phenomenon',
    'Pixel','Quake','Rain','RAR','Raven','Razor','Reaper','Red Gene','Red Stripe','Rhino','Russo','Saar','Sable','Sandblast','Sapphire',
    'Satin','Scaleless Head','Scrambler','Shadow','Sherg','Shrapnel','Shredder','Smuggler','Spark','Special','Specter','Spider','Splatter',
    'Spotnose','Stranger','Striker','Sulfur','Surge','Taronja','The Darkling','Trick','Trident','Trojan','Twister','Vanilla','Vudoo',
    'Web','Woma','Wookie','Wrecking Ball','X-treme Gene','X-tremist','Yellow Belly','Zuwadi'
  ],
  'Dominant': [
    'Adder','AHI','Ashen','Black Belly','Confusion','Congo','Desert','Eramosa','Frost','Gold Blush','Harlequin','Het Daddy','Josie','Leopard',
    'Mordor','Nova','Oriole','Pinstripe','Redhead','Shatter','Splash','Static','Sunrise','Vesper','Zip Belly'
  ],
  'Polygenic': ['Brown Back','Fader','Genetic Black Back','Genetic Reduced'],
  'Other': ['Dinker','Hybrid','Normal','Paradox','RECO','Ringer','Ringer Mark'],
  'Locality': ['Volta']
};

const PRIMARY_GENE_GROUPS = ['Recessive', 'Incomplete Dominant', 'Dominant', 'Other'];

const GENE_ALIASES = {
  'ultramelanistic': 'Ultramel'
};

const RAW_GENE_GROUP_LOOKUP = (() => {
  const map = new Map();
  Object.entries(GENE_GROUPS).forEach(([group, genes]) => {
    genes.forEach(gene => {
      if (!gene) return;
      map.set(String(gene).trim().toLowerCase(), group);
    });
  });
  return map;
})();

const HET_GENE_COLOR_CLASSES = 'bg-violet-200 border border-violet-300 text-violet-800';

const GENE_GROUP_COLOR_CLASSES = {
  'Het': HET_GENE_COLOR_CLASSES,
  'Recessive': 'bg-violet-300 border border-violet-400',
  'Incomplete Dominant': 'bg-rose-300 border border-rose-400',
  'Dominant': 'bg-sky-300 border border-sky-400',
  'Other': 'bg-emerald-300 border border-emerald-400'
};

function normalizeGeneCandidate(raw) {
  if (!raw) return '';
  return String(raw).trim().toLowerCase();
}

function getGeneGroupFromDatabase(rawGene) {
  if (!rawGene) return null;
  const seen = new Set();
  const enqueue = value => {
    if (!value) return;
    const trimmed = String(value).trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
    }
  };

  const original = String(rawGene).trim();
  if (!original) return null;
  enqueue(original);

  const noParens = original.replace(/\(.*?\)/g, '').trim();
  if (noParens && noParens !== original) enqueue(noParens);

  const stripSuper = noParens.replace(/^super[\s-]+/i, '').trim();
  if (stripSuper && stripSuper !== noParens) enqueue(stripSuper);

  const camelSuper = noParens.match(/^super([A-Z].*)$/);
  if (camelSuper && camelSuper[1]) enqueue(camelSuper[1]);

  const aliasExpanded = GENE_ALIASES[noParens.toLowerCase()];
  if (aliasExpanded) enqueue(aliasExpanded);

  const axanthicVariant = original.match(/^\s*axanthic\s*\(([^)]+)\)/i);
  if (axanthicVariant && axanthicVariant[1]) {
    const variantRaw = axanthicVariant[1].replace(/\s+/g, ' ').trim();
    if (variantRaw) {
      const lower = variantRaw.toLowerCase();
      const variantAliases = [
        { match: /tsk/, canonical: 'TSK' },
        { match: /gcr/, canonical: 'GCR' },
        { match: /jol(l|liff)/, canonical: 'Jolliff' },
        { match: /mj/, canonical: 'MJ' },
        { match: /vpi/, canonical: 'VPI' }
      ];
      let canonicalVariant = null;
      for (const { match, canonical } of variantAliases) {
        if (match.test(lower)) {
          canonicalVariant = canonical;
          break;
        }
      }
      if (!canonicalVariant) {
        canonicalVariant = variantRaw.replace(/\s*line$/i, '').trim();
      }
      if (canonicalVariant) {
        enqueue(`Axanthic (${canonicalVariant})`);
      }
      enqueue('Axanthic');
    }
  }

  const stripLeadingHet = stripSuper.replace(/^(?:\d{1,3}%\s+)?(?:pos(?:s?i?a?ble)?\s+)?het\s+/i, '').trim();
  if (stripLeadingHet && stripLeadingHet !== stripSuper) enqueue(stripLeadingHet);

  const stripPercent = stripLeadingHet.replace(/^(?:\d{1,3}%\s*)/i, '').trim();
  if (stripPercent && stripPercent !== stripLeadingHet) enqueue(stripPercent);

  for (const candidate of seen) {
    const alias = GENE_ALIASES[candidate];
    if (alias) enqueue(alias);
  }

  for (const candidate of seen) {
    const key = normalizeGeneCandidate(candidate);
    if (RAW_GENE_GROUP_LOOKUP.has(key)) {
      return RAW_GENE_GROUP_LOOKUP.get(key);
    }
  }
  return null;
}

function normalizePrimaryGeneGroup(group) {
  if (!group) return 'Other';
  if (group === 'Polygenic' || group === 'Locality') return 'Other';
  if (!PRIMARY_GENE_GROUPS.includes(group)) return 'Other';
  return group;
}

function getGeneDisplayGroup(rawGene) {
  const group = getGeneGroupFromDatabase(rawGene);
  return normalizePrimaryGeneGroup(group);
}

function getGeneChipClasses(gene, displayGroup) {
  if (isHetGeneToken(gene)) {
    return GENE_GROUP_COLOR_CLASSES.Het;
  }
  const group = displayGroup || getGeneDisplayGroup(gene);
  return GENE_GROUP_COLOR_CLASSES[group] || GENE_GROUP_COLOR_CLASSES.Other;
}

const GENE_LEGEND_ITEMS = [
  { key: 'Recessive', label: 'Recessive' },
  { key: 'Het', label: 'Het / Possible Het' },
  { key: 'Incomplete Dominant', label: 'Incomplete Dominant' },
  { key: 'Dominant', label: 'Dominant' },
  { key: 'Other', label: 'Other / Polygenic' }
];

const GENE_LINE_SIZE_STYLES = {
  sm: { container: 'text-[11px]', label: 'text-[10px]', chip: 'text-[11px] px-2 py-0.5' },
  md: { container: 'text-sm', label: 'text-[11px]', chip: 'text-xs px-2 py-0.5' },
  xs: { container: 'text-[10px]', label: 'text-[9px]', chip: 'text-[10px] px-1.5 py-0.5' }
};

function GeneLine({ label, genes = [], size = 'sm', className }) {
  const list = Array.isArray(genes) ? genes.filter(Boolean) : [];
  if (!list.length) return null;
  const styles = GENE_LINE_SIZE_STYLES[size] || GENE_LINE_SIZE_STYLES.sm;
  return (
    <div className={cx('flex flex-wrap items-center gap-1 leading-snug', styles.container, className)}>
      <span className={cx('uppercase tracking-wide text-neutral-500 mr-1', styles.label)}>{label}:</span>
      {list.map((gene, idx) => {
        const group = getGeneDisplayGroup(gene);
        const chipClasses = getGeneChipClasses(gene, group);
        return (
          <span
            key={`${label}-${gene}-${idx}`}
            className={cx('inline-flex items-center rounded-md border font-medium break-words', styles.chip, chipClasses)}
          >
            {gene}
          </span>
        );
      })}
    </div>
  );
}

function GeneLegend({ className }) {
  return (
    <div className={cx('flex flex-wrap items-center justify-center gap-3 text-[11px] font-normal', className)}>
      {GENE_LEGEND_ITEMS.map(item => (
        <div key={item.key} className="flex items-center gap-1">
          <span className={cx('inline-block h-3 w-3 rounded-sm', GENE_GROUP_COLOR_CLASSES[item.key])}></span>
          <span className="text-neutral-600 whitespace-nowrap">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

function ScrollToTopButton({ theme = 'blue', className }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function onScroll() {
      setVisible(window.scrollY > 200);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      className={cx(
        'fixed bottom-6 right-6 z-50 rounded-full shadow-lg border backdrop-blur-sm transition-opacity duration-200 flex items-center justify-center h-12 w-12 text-white',
        visible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
        primaryBtnClass(theme, true),
        className
      )}
      aria-label="Scroll to top"
    >
      <span className="text-xl leading-none">↑</span>
    </button>
  );
}

function addDaysYmd(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
