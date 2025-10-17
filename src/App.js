import React, { useMemo, useState, useEffect, useCallback, useRef } from "react";
import QRCode from 'qrcode';
import * as pdfjsLib from 'pdfjs-dist/build/pdf';
// use the CDN worker by version
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

// --- lightweight helpers (placeholders if full implementations aren't present) ---
const cap = s => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : '');

function pairingLifecycleDefaults() {
  return {
    ovulation: { observed: false, date: '', notes: '' },
    preLayShed: { observed: false, date: '', notes: '', intervalFromOvulation: null },
    clutch: { recorded: false, date: '', eggsTotal: '', slugs: '', notes: '' },
    hatch: { scheduledDate: '', recorded: false, date: '', hatchedCount: 0, notes: '' }
  };
}
const cx = (...parts) => parts.flat().filter(Boolean).join(' ');
const uid = (prefix='id') => `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random()*10000).toString(36)}`;
const localYMD = (d = new Date()) => {
  const y = d.getFullYear(); const m = String(d.getMonth()+1).padStart(2,'0'); const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
};
const PENDING_ANIMAL_VIEW_KEY = 'breedingPlannerPendingAnimalView';
const STORAGE_KEYS = {
  snakes: 'breedingPlannerSnakes',
  pairings: 'breedingPlannerPairings',
  groups: 'breedingPlannerGroups',
  breeder: 'breedingPlannerBreederInfo'
};

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

const seedPairings = [];
const DEFAULT_GROUPS = ["Breeders", "Holdbacks", "Hatchlings 2024", "Hatchlings 2025"];

function createFreshSnakes() {
  return seedSnakes.map(s => ({
    ...s,
    morphs: [...(s.morphs || [])],
    hets: [...(s.hets || [])],
    tags: [...(s.tags || [])],
    groups: normalizeSingleGroupValue(s.groups),
    logs: cloneLogs(s.logs),
  }));
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
  hatch.hatchedCount = Number(hatch.hatchedCount || 0);
  if (!Number.isFinite(hatch.hatchedCount) || hatch.hatchedCount < 0) hatch.hatchedCount = 0;
  clutch.eggsTotal = clutch.eggsTotal === '' || clutch.eggsTotal === null || typeof clutch.eggsTotal === 'undefined' ? '' : Number(clutch.eggsTotal);
  clutch.slugs = clutch.slugs === '' || clutch.slugs === null || typeof clutch.slugs === 'undefined' ? '' : Number(clutch.slugs);
  if (typeof clutch.eggsTotal === 'number' && Number.isFinite(clutch.eggsTotal)) {
    const eggsLimit = Math.max(0, clutch.eggsTotal);
    hatch.hatchedCount = Math.min(Math.max(0, hatch.hatchedCount), eggsLimit);
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

function buildNameCode(name) {
  const cleaned = (name || '').replace(/[^a-zA-Z]/g, '').toUpperCase();
  if (!cleaned) return 'XXX';
  if (cleaned.length >= 3) return cleaned.slice(0, 3);
  return (cleaned + 'XXX').slice(0, 3);
}

function initSnakeDraft(s) {
  if (!s) return { name:'', sex:'F', morphs:[], hets:[], tags:[], groups:[], logs: cloneLogs() };
  return {
    ...s,
    sex: ensureSex(s.sex, 'F'),
    morphs: s.morphs || [],
    hets: s.hets || [],
    tags: s.tags || [],
    groups: normalizeSingleGroupValue(s.groups),
    logs: cloneLogs(s.logs)
  };
}

function createEmptyNewAnimalDraft() {
  return {
    name: "",
    sex: "F",
    morphHetInput: "",
    morphs: [],
    hets: [],
    weight: "",
    year: "",
    birthDate: "",
    imageUrl: "",
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
  if (/^1[\s\.:/]*0$/.test(value)) return 'M';
  if (/^0[\s\.:/]*1$/.test(value)) return 'F';
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

  const qualifierMatch = working.match(/^(pos(?:sible)?|possible|probable|maybe|ph)\b\s*(.*)$/i);
  if (qualifierMatch) {
    const qualifierWord = qualifierMatch[1].toLowerCase();
    const qualifierLookup = {
      pos: 'Possible',
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
  if (/(^|\s)(pos(?:sible)?|probable|maybe|ph)(\s|$)/i.test(lower)) return true;
  if (/\d{1,3}%/.test(lower)) return true;
  return false;
}

function normalizeHetInputToken(token) {
  if (!token) return null;
  let working = String(token).replace(/\s+/g, ' ').trim();
  if (!working) return null;

  let percent = '';
  const percentMatch = working.match(/^(\d{1,3}%)(?:\s+)(.*)$/i);
  if (percentMatch) {
    percent = percentMatch[1].toUpperCase();
    working = percentMatch[2].trim();
  }

  let qualifier = '';
  const qualifierMatch = working.match(/^(pos(?:sible)?|possible|probable|maybe|ph)(?:\s+)(.*)$/i);
  if (qualifierMatch) {
    qualifier = qualifierMatch[1].toLowerCase();
    working = qualifierMatch[2].trim();
  }

  working = working.replace(/\bhet\b/gi, '').trim();

  const qualifierText = qualifier === 'pos' || qualifier === 'ph'
    ? 'Possible'
    : qualifier === 'possible'
      ? 'Possible'
      : qualifier === 'probable'
        ? 'Probable'
        : qualifier === 'maybe'
          ? 'Maybe'
          : '';

  const parts = [];
  if (qualifierText) parts.push(qualifierText);
  if (working) parts.push(working);
  let result = parts.join(' ').trim();
  if (percent) result = `${percent} ${result}`.trim();
  return result || null;
}

function splitMorphHetInput(value) {
  const tokens = String(value || '')
    .split(',')
    .map(token => token.trim())
    .filter(Boolean);

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
    out.push({ id: uid('ap'), date: localYMD(d), notes: '' });
  }
  return out;
}

function readFileAsDataURL(file) {
  return new Promise((res, rej) => {
    const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file);
  });
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
          } else if (/possible/i.test(anno)) {
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
      } else if (/possible/i.test(anno)) {
        hets.push(`${gene} (possible)`);
      } else {
        hets.push(`${gene} (${anno})`);
      }
    }
    out.push({ name, id, sex, morphs, hets });
  }
  return out;
}

function convertParsedToSnake(p) {
  // p: { name, id?, sex, morphs, hets, year? }
  const sex = ensureSex(p.sex, 'F');
  // normalize tokens possibly present in morphs/hets/genetics
  const combined = [
    ...(Array.isArray(p.morphs) ? p.morphs : (p.morphs ? [String(p.morphs)] : [])),
    ...(Array.isArray(p.hets) ? p.hets : (p.hets ? [String(p.hets)] : [])),
    ...(Array.isArray(p.genetics) ? p.genetics : (p.genetics ? [String(p.genetics)] : []))
  ];
  const norm = normalizeMorphHetLists(combined);

  const providedIdRaw = (p.id || '').toString().trim();
  const existingIds = Array.isArray(p.__existingIds) ? p.__existingIds : [];
  const existingIdSet = new Set(existingIds.map(id => String(id)));

  let yearVal = Number(p.year);
  if (!Number.isFinite(yearVal) || yearVal <= 0) yearVal = new Date().getFullYear();
  let nameForId = p.name || '';
  let hadYear = false;
  if (p.name) {
    const m = String(p.name).trim().match(/^(20\d{2})\b[\s\-:\/]*(.*)$/);
    if (m) {
      hadYear = true;
      yearVal = Number(m[1]) || yearVal;
      nameForId = (m[2] || '').trim() || nameForId;
    }
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
    existingIds,
    suffixNum,
    { hadYear, originalRawName: String(p.name || ''), hets: norm.hets }
  );

  const weightValue = Number(p.weight);
  const weight = Number.isFinite(weightValue) ? weightValue : 0;
  const birthDate = normalizeDateInput(p.birthDate || p.hatchDate || p.birthdate || null);
  const rawGroups = Array.isArray(p.groups) ? p.groups : splitMultiValueCell(p.groups);
  const groups = rawGroups.map(g => String(g).trim()).filter(Boolean);
  const rawTags = Array.isArray(p.tags) ? p.tags : splitMultiValueCell(p.tags);
  const tags = rawTags.map(t => String(t).trim()).filter(Boolean);
  const status = String(p.status || 'Active').trim() || 'Active';
  const notes = typeof p.notes === 'string' ? p.notes.trim() : '';
  const imageUrl = p.imageUrl ? String(p.imageUrl) : undefined;

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
    imageUrl,
    logs: { feeds:[], weights:[], sheds:[], cleanings:[], meds:[] }
  };
}

// extract numeric suffix from an id like Prefix-4
function extractSuffixNumberFromId(id) {
  if (!id) return null;
  const m = String(id).match(/-(\d+)$/);
  return m ? Number(m[1]) : null;
}

// Generate snake id in form YYXxx-N where YY are last two digits of year, Xxx first 3 letters of name (capitalized), N is sequence number
function generateSnakeId(name, year, existingSnakesOrIds = [], preferredNumber = null, opts = {}) {
  const { hadYear = false, originalRawName = '', hets = [] } = opts || {};
  // normalize existing ids list
  const existingIds = Array.isArray(existingSnakesOrIds) ? existingSnakesOrIds.map(x=>typeof x==='string'?x:(x && x.id?x.id:String(x))).filter(Boolean) : [];

  // Year-based behavior (keep legacy YYxxx-N format)
  if (hadYear || (String(year || '').length === 4 && /^20\d{2}$/.test(String(year)))) {
    const y = Number(year) || new Date().getFullYear();
    const yy = String(y).slice(-2);
    const nm = String(name || '');
    // support 'First X Second' pattern
    const crossMatch = nm.match(/^\s*([^xX]+?)\s*[xX]\s*([^xX]+?)\s*$/);
    let prefixBody;
    if (crossMatch) {
      const a = String(crossMatch[1] || '').replace(/[^A-Za-z]/g,'');
      const b = String(crossMatch[2] || '').replace(/[^A-Za-z]/g,'');
      const a3 = (a.length >= 3) ? a.slice(0,3) : a.padEnd(3, 'X');
      const b3 = (b.length >= 3) ? b.slice(0,3) : b.padEnd(3, 'X');
      const styledA = a3.charAt(0).toUpperCase() + a3.slice(1).toLowerCase();
      const styledB = b3.charAt(0).toUpperCase() + b3.slice(1).toLowerCase();
      prefixBody = `${styledA}X${styledB}`;
    } else {
      const letters = nm.replace(/[^A-Za-z]/g,'');
      const first3 = (letters.length >= 3) ? letters.slice(0,3) : letters.padEnd(3, 'X');
      prefixBody = first3.charAt(0).toUpperCase() + first3.slice(1).toLowerCase();
    }
    const prefix = `${yy}${prefixBody}`;
    if (preferredNumber && Number.isFinite(preferredNumber)) return `${prefix}-${preferredNumber}`;
    let max = 0;
    for (const id of existingIds) {
      if (!id.startsWith(prefix + '-')) continue;
      const n = extractSuffixNumberFromId(id);
      if (n && n > max) max = n;
    }
    const next = max + 1 || 1;
    return `${prefix}-${next}`;
  }

  // Non-year format: build compact id from 3-letter chunks of each word + optional parentheses chunk + concatenated het segments
  const raw = String(originalRawName || name || '').trim();
  // capture and keep parentheses only if present at start
  let paren = '';
  const pm = raw.match(/^\s*\(([^)]+)\)/);
  let body = raw;
  if (pm) {
    const inside = pm[1].replace(/[^A-Za-z]/g,'');
    const a3 = (inside.length >= 3) ? inside.slice(0,3) : inside.padEnd(3,'X');
    paren = `(${a3.charAt(0).toUpperCase() + a3.slice(1).toLowerCase()})`;
    body = body.replace(/^\s*\([^)]*\)\s*/, '');
  }

  // build name chunk: take first 3 letters of each word, capitalized first letter
  const words = body.split(/\s+/).filter(Boolean);
  const nameChunk = words.map(w=>{
    const letters = String(w).replace(/[^A-Za-z]/g,'');
    const three = (letters.length >= 3) ? letters.slice(0,3) : letters.padEnd(3,'X');
    return three.charAt(0).toUpperCase() + three.slice(1).toLowerCase();
  }).join('');

  // genetics/hets: concatenate each het segment. For '50% clown' => '50%Hclo', for plain 'Clown' het => 'Hclo'
  const hetSegments = [];
  for (const h of (hets || [])) {
    const hh = String(h).trim();
    const pct = hh.match(/^(\d+)%\s*(.*)$/);
    if (pct) {
      const num = pct[1];
      const gene = (pct[2] || '').replace(/[^A-Za-z]/g,'').slice(0,3).toLowerCase();
      hetSegments.push(`${num}%H${gene}`);
      continue;
    }
    // handle 'Gene (possible)'
    const poss = hh.match(/^(.+?)\s*\(possible\)$/i);
    let geneName = hh;
    if (poss) geneName = poss[1];
    geneName = geneName.replace(/[^A-Za-z]/g,'').slice(0,3).toLowerCase();
    if (geneName) hetSegments.push(`H${geneName}`);
  }
  const geneticsChunk = hetSegments.join('');

  const prefixBody = `${paren}${nameChunk}${geneticsChunk}`;
  if (preferredNumber && Number.isFinite(preferredNumber)) return `${prefixBody}-${preferredNumber}`;
  let maxNum = 0;
  for (const id of existingIds) {
    if (!id.startsWith(prefixBody + '-')) continue;
    const n = extractSuffixNumberFromId(id);
    if (n && n > maxNum) maxNum = n;
  }
  const nextNum = maxNum + 1 || 1;
  return `${prefixBody}-${nextNum}`;
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
    if (/\bpossible\b/i.test(low)) {
      const gene = raw.replace(/\bpossible\b/ig,'').replace(/[()]/g,'').trim();
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
  return {
    morphs: uniqueGeneTokens(morphs.map(m=>m.trim()).filter(Boolean)),
    hets: uniqueGeneTokens(hets.map(h=>h.trim()).filter(Boolean))
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
  geneticsPart = geneticsPart.replace(/^[\s\-\:]+/, '').trim();

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
    if (/possible/i.test(tag)) return `Possible het ${gene}`;
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
  if (/possible/i.test(tag)) return `Possible het ${gene}`;
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
  const [animalView, setAnimalView] = useState('males');
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
    const fallback = { name: '', businessName: '', email: '', phone: '', logoUrl: '' };
    return stored && typeof stored === 'object' ? { ...fallback, ...stored } : fallback;
  });
  const [showAddModal, setShowAddModal] = useState(false);
  const [newAnimal, setNewAnimal] = useState(createEmptyNewAnimalDraft);
  const [importText, setImportText] = useState("");
  const [importPreview, setImportPreview] = useState([]);
  const [showImportModal, setShowImportModal] = useState(false);
  const [returnToGroupsAfterEdit, setReturnToGroupsAfterEdit] = useState(false);
  const [showUnassigned, setShowUnassigned] = useState(true);
  const [pairingGuard, setPairingGuard] = useState(null);

  useEffect(() => { saveStoredJson(STORAGE_KEYS.breeder, breederInfo); }, [breederInfo]);

  useEffect(() => {
    try {
      const storedView = window.localStorage.getItem(PENDING_ANIMAL_VIEW_KEY);
      if (storedView && (storedView === 'males' || storedView === 'females' || storedView === 'groups')) {
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

  // edit pairing
  const [editId, setEditId] = useState(null);
  const [edit, setEdit] = useState(null);

  // edit snake
  const [editSnake, setEditSnake] = useState(null);
  const [editSnakeDraft, setEditSnakeDraft] = useState(null);
  const [qrFor, setQrFor] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [pendingDeleteSnake, setPendingDeleteSnake] = useState(null);

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

  const females = useMemo(() => snakes.filter(isFemaleSnake), [snakes]);
  const males   = useMemo(() => snakes.filter(isMaleSnake), [snakes]);

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
  if (p) { setTab('pairings'); setEditId(p.id); setEdit(withPairingLifecycleDefaults(p)); }
    }
  }, [pairings]);

  // generate QR data url when requested
  useEffect(()=>{
    if (!qrFor) { setQrDataUrl(null); return; }
    const url = `${window.location.origin}${window.location.pathname}#snake=${encodeURIComponent(qrFor)}`;
    QRCode.toDataURL(url, { width: 300 }).then(dataUrl => setQrDataUrl(dataUrl)).catch(()=>setQrDataUrl(null));
  }, [qrFor]);


  const filteredFemales = useMemo(() => {
    let base = snakes.filter(isFemaleSnake);
    base = filterSnakes(base, query, tag);
    if (statusFilter === 'active') base = base.filter(s => s.status === 'Active');
    if (statusFilter === 'inactive') base = base.filter(s => s.status !== 'Active');

    const hasShowGroups = Array.isArray(showGroups) && showGroups.length > 0;
    const hasHiddenGroups = Array.isArray(hiddenGroups) && hiddenGroups.length > 0;

    if (hasShowGroups || hasHiddenGroups) {
      base = base.filter(s => {
        const memberships = s.groups || [];
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
      base = base.filter(s => (s.groups && s.groups.length));
    }

    return base;
  }, [snakes, query, tag, groupFilter, showGroups, hiddenGroups, statusFilter, showUnassigned]);

  const filteredMales = useMemo(() => {
    let base = snakes.filter(isMaleSnake);
    base = filterSnakes(base, query, tag);
    if (statusFilter === 'active') base = base.filter(s => s.status === 'Active');
    if (statusFilter === 'inactive') base = base.filter(s => s.status !== 'Active');

    const hasShowGroups = Array.isArray(showGroups) && showGroups.length > 0;
    const hasHiddenGroups = Array.isArray(hiddenGroups) && hiddenGroups.length > 0;

    if (hasShowGroups || hasHiddenGroups) {
      base = base.filter(s => {
        const memberships = s.groups || [];
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
      base = base.filter(s => (s.groups && s.groups.length));
    }

    return base;
  }, [snakes, query, tag, groupFilter, showGroups, hiddenGroups, statusFilter, showUnassigned]);

  const activeAnimalList = useMemo(() => {
  if (animalView === "females") return filteredFemales.filter(isFemaleSnake);
  if (animalView === "males") return filteredMales.filter(isMaleSnake);
    return [];
  }, [animalView, filteredMales, filteredFemales]);
  const activeAnimalLabel = animalView === "females" ? "Females"
    : animalView === "groups" ? "Groups"
    : "Males";

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

  function openNewPairingModal() {
    setDraft({
      maleId: "",
      femaleId: "",
      goals: [],
      notes: "",
      startDate: localYMD(new Date())
    });
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
    const existingIds = snakes.map(s => s.id);
    const generatedId = generateSnakeId(newAnimal.name, Number(newAnimal.year) || new Date().getFullYear(), existingIds);
    const morphList = Array.isArray(newAnimal.morphs)
      ? newAnimal.morphs.map(s => String(s).trim()).filter(Boolean)
      : splitMorphHetInput(newAnimal.morphHetInput || '').morphs;
    const hetList = Array.isArray(newAnimal.hets)
      ? newAnimal.hets.map(s => String(s).trim()).filter(Boolean)
      : splitMorphHetInput(newAnimal.morphHetInput || '').hets;
  const groupList = normalizeSingleGroupValue(newAnimal.groups);
    const snake = {
      id: generatedId,
      name: newAnimal.name.trim() || (sex === "F" ? "New Female" : "New Male"),
      sex,
      morphs: morphList,
      hets:   hetList,
      weight: Number(newAnimal.weight) || 0,
      year:   Number(newAnimal.year)   || new Date().getFullYear(),
      birthDate: newAnimal.birthDate || null,
      tags:   [],
      groups: groupList,
      status: "Active",
      imageUrl: newAnimal.imageUrl?.trim() || undefined,
      logs: cloneLogs(newAnimal.logs),
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
      const converted = convertParsedToSnake({ ...preview, __existingIds: existingIds });
      const sex = ensureSex(converted.sex, 'F');
      const nameKey = (converted.name || '').trim().toLowerCase();
      const compositeKey = `${nameKey}|${sex}`;
      if (existingKeySet.has(compositeKey)) continue;
      existingKeySet.add(compositeKey);
      existingIds.push(converted.id);
      const normalizedGroups = normalizeSingleGroupValue(
        (converted.groups || []).map(normalizeImportedGroup).filter(Boolean)
      );
  normalizedToAdd.push({ ...converted, sex, groups: normalizedGroups, isDemo: false });
    }

    if (!normalizedToAdd.length) {
      setImportText("");
      setImportPreview([]);
      setTab("animals");
      setAnimalView("males");
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
    setAnimalView("males");
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
  }

  const addHatchlingsForPairing = useCallback((pairing, count, hatchedDate, existingCount = 0) => {
    if (!count || count <= 0) return;
    const hatchedOn = hatchedDate || localYMD(new Date());
    const parsed = parseYmd(hatchedOn) || new Date();
    const year = parsed.getFullYear() || new Date().getFullYear();
    const groupName = `Hatchlings ${year}`;
    const sire = snakeById(snakes, pairing?.maleId);
    const dam = snakeById(snakes, pairing?.femaleId);
    const sireCode = buildNameCode(sire?.name || pairing?.maleId);
    const damCode = buildNameCode(dam?.name || pairing?.femaleId);
    const baseId = `${year}${sireCode}X${damCode}`;
    const existingIds = new Set(snakes.map(s => s.id));
    const created = [];

    for (let idx = 0; idx < count; idx++) {
      let sequence = existingCount + idx + 1;
      let candidateId = `${baseId}-${sequence}`;
      while (existingIds.has(candidateId)) {
        sequence += 1;
        candidateId = `${baseId}-${sequence}`;
      }
      existingIds.add(candidateId);
      created.push({
        id: candidateId,
        name: `Hatchling ${sequence} (${dam?.name || 'Dam'} × ${sire?.name || 'Sire'})`,
        sex: 'F',
        morphs: [],
        hets: [],
        weight: '',
        year,
        birthDate: hatchedOn,
        pairingId: pairing?.id || null,
        sireId: pairing?.maleId || null,
        damId: pairing?.femaleId || null,
        tags: ['hatchling'],
        groups: [groupName],
        status: 'Active',
        imageUrl: undefined,
        logs: { feeds: [], weights: [], sheds: [], cleanings: [], meds: [] },
        isDemo: false,
      });
    }

    if (!created.length) return;

    setSnakes(prev => {
      const base = prev.filter(s => !s.isDemo);
      return [...base, ...created];
    });
    setGroups(prev => prev.includes(groupName) ? prev : [...prev, groupName]);

    if (typeof window !== 'undefined' && typeof window.alert === 'function') {
      window.alert(`${created.length} hatchlings added to ${groupName}.`);
    }
  }, [snakes, setSnakes, setGroups]);

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
              <span className="text-xs px-2 py-1 rounded-full bg-neutral-100 border ml-3">prototype</span>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <TabButton theme={theme} active={tab==="animals"} onClick={()=>setTab("animals")}>Animals</TabButton>
            <TabButton theme={theme} active={tab==="pairings"} onClick={()=>setTab("pairings")}>Breeding Planner</TabButton>
            <TabButton theme={theme} active={tab==="calendar"} onClick={()=>setTab("calendar")}>Calendar</TabButton>
            <TabButton theme={theme} active={tab==="breeder"} onClick={()=>setTab("breeder")}>Breeder</TabButton>

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
                <TabButton theme={theme} active={animalView === "males"} onClick={()=>handleAnimalViewTabChange("males")}>Males</TabButton>
                <TabButton theme={theme} active={animalView === "females"} onClick={()=>handleAnimalViewTabChange("females")}>Females</TabButton>
                <TabButton theme={theme} active={animalView === "groups"} onClick={()=>handleAnimalViewTabChange("groups")}>Groups</TabButton>
              </div>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <button onClick={()=>setShowExportModal(true)} className={cx('px-3 py-2 rounded-xl text-sm', primaryBtnClass(theme,true))}>Export QR</button>
                <button onClick={()=>setShowScanner(true)} className={cx('px-3 py-2 rounded-xl text-sm', primaryBtnClass(theme,true))}>Scan QR</button>
                <button onClick={() => setShowAddModal(true)} className={cx('px-3 py-2 rounded-xl text-sm', primaryBtnClass(theme,true))}>+ Add animal</button>
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
                      onOpenPairing={(pid)=>{ const p = pairings.find(x=>x.id===pid); if (p) { setEditId(p.id); setEdit(withPairingLifecycleDefaults(p)); setTab('pairings'); } }}
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
            <div className="flex justify-end">
              <button
                onClick={openNewPairingModal}
                className={cx('px-3 py-2 rounded-xl text-sm', primaryBtnClass(theme, true))}
              >
                New pairing
              </button>
            </div>
            <PairingsSection
              snakes={snakes}
              pairings={pairings}
              onEdit={(p)=>{ setEditId(p.id); setEdit(withPairingLifecycleDefaults(p)); }}
              onDelete={(pid)=>setPairings(ps=>ps.filter(x=>x.id!==pid))}
              onOpenSnake={openSnakeCard}
            />
          </div>
        )}

        {tab === "calendar" && (
          <CalendarSection snakes={snakes} pairings={pairings} theme={theme} onOpenPairing={(pid)=>{ const p = pairings.find(x=>x.id===pid); if (p) { setEditId(p.id); setEdit(withPairingLifecycleDefaults(p)); setTab('pairings'); } }} />
        )}

        {tab === "breeder" && (
          <BreederSection
            breederInfo={breederInfo}
            setBreederInfo={setBreederInfo}
            theme={theme}
            onSaved={() => setTab('animals')}
          />
        )}
      </div>

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

      {/* edit pairing */}
      {edit && editId && (() => {
        const idx = pairings.findIndex(p => p.id === editId);
        const pairingNumber = idx >= 0 ? idx + 1 : null;
        return (
          <EditPairingModal
            edit={edit}
            setEdit={setEdit}
            pairingNumber={pairingNumber}
            onClose={()=>{ setEdit(null); setEditId(null); }}
            onSave={()=>{
              const prevPairing = pairings.find(p => p.id === editId) || null;
              const normalized = withPairingLifecycleDefaults({ ...edit, appointments: edit.appointments || [] });
              setPairings(prev => prev.map(p => p.id===editId ? {
                ...p,
                label: normalized.label || p.label,
                startDate: normalized.startDate || null,
                lockObserved: !!normalized.lockObserved,
                goals: normalized.goals || [],
                notes: normalized.notes || "",
                appointments: normalized.appointments || [],
                ovulation: normalized.ovulation,
                preLayShed: normalized.preLayShed,
                clutch: normalized.clutch,
                hatch: normalized.hatch,
              } : p));

              const previousCount = prevPairing?.hatch?.hatchedCount || 0;
              const newCount = normalized.hatch.recorded ? Number(normalized.hatch.hatchedCount || 0) : 0;
              const delta = normalized.hatch.recorded ? Math.max(0, newCount - previousCount) : 0;
              if (delta > 0) {
                addHatchlingsForPairing({ ...prevPairing, ...normalized }, delta, normalized.hatch.date, previousCount);
              }
              setEdit(null); setEditId(null);
            }}
            theme={theme}
            snakes={snakes}
          />
        );
      })()}

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
                          <button className={cx('px-3 py-2 rounded-xl text-sm', primaryBtnClass(theme,true))} onClick={async ()=>{ try { await exportSnakeToPdf(editSnakeDraft, breederInfo, theme); } catch(e){ console.error(e); alert('Export failed'); } }}>Export PDF</button>
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
                  <label className="text-xs font-medium">ID</label>
                  <input className="mt-0.5 w-full border rounded-xl px-2 py-1 text-sm font-mono" value={editSnakeDraft.id}
                    onChange={e=>setEditSnakeDraft(d=>({...d,id:e.target.value}))} />
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
                  <LogsEditor editSnakeDraft={editSnakeDraft} setEditSnakeDraft={setEditSnakeDraft} />
                </div>

                {/* Image panel moved under logs; upload button sits inside the picture area */}
                <div className="mt-4 flex justify-end">
                  <div style={{width:318, height:318}} className="rounded-lg overflow-hidden border-2 border-neutral-200 relative">
                    {editSnakeDraft.imageUrl ? (
                      <img src={editSnakeDraft.imageUrl} alt={editSnakeDraft.name} className="w-full h-full object-cover object-center" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-sm text-neutral-500 bg-neutral-50">No image</div>
                    )}
                    <input id="edit-image-upload" type="file" accept="image/*" className="hidden" onChange={async e=>{
                      const f = e.target.files && e.target.files[0];
                      if (!f) return;
                      try {
                        const data = await readFileAsDataURL(f);
                        setEditSnakeDraft(d=>({...d, imageUrl: data}));
                      } catch(e){ console.error(e); }
                    }} />
                    <div className="absolute left-2 bottom-2 flex gap-2">
                      <button className="text-xs px-2 py-1 bg-white/80 backdrop-blur-sm border rounded" onClick={()=>{ const el = document.getElementById('edit-image-upload'); if (el) el.click(); }}>Upload</button>
                      <button className="text-xs px-2 py-1 bg-white/80 backdrop-blur-sm border rounded" onClick={()=>setEditSnakeDraft(d=>({...d, imageUrl: undefined}))}>Remove</button>
                    </div>
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

    function QrScannerModal({ onClose, onFound }) {
      useEffect(()=>{
        let scanner = null;
        let mounted = true;
        (async ()=>{
          try {
            const target = document.getElementById('qr-scan-root');
            if (!target) return;
            // Use global UMD build (served from public/index.html). Do NOT dynamic-import to avoid bundling.
            const mod = (typeof window !== 'undefined' && (window.Html5QrcodeScanner || window.Html5Qrcode)) ? window : null;
            if (!mod) { alert('QR scanner library not loaded. Ensure the CDN script is present.'); return; }
            if (mod.Html5QrcodeScanner) {
              scanner = new mod.Html5QrcodeScanner('qr-scan-root', { fps: 10, qrbox: 250 }, false);
              scanner.render((decoded) => {
                const m = decoded.match(/#?snake=?(.*)/);
                const id = m ? decodeURIComponent(m[1]) : decoded;
                if (mounted) onFound(id);
                scanner.clear().catch(()=>{});
              }, () => {});
            } else if (mod.Html5Qrcode) {
              scanner = new mod.Html5Qrcode('qr-scan-root');
              await scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: 250 }, (decoded) => {
                const m = decoded.match(/#?snake=?(.*)/);
                const id = m ? decodeURIComponent(m[1]) : decoded;
                if (mounted) onFound(id);
                scanner.stop().catch(()=>{});
              });
            } else {
              console.warn('html5-qrcode API not found on window');
            }
          } catch(err) { console.error('QR importer failed', err); /* don't spam user */ }
        })();
        return ()=>{ mounted=false; if (scanner && scanner.clear) scanner.clear().catch(()=>{}); };
      }, [onFound]);

      const handleFile = async (e) => {
        const f = e.target.files && e.target.files[0];
        if (!f) return;
        try {
          // Use global Html5Qrcode for file-scan as UMD is provided via CDN
          const mod = (typeof window !== 'undefined' && window.Html5Qrcode) ? window : null;
          if (!mod || !mod.Html5Qrcode) { alert('File-scan not available. Ensure the CDN script is present.'); return; }
          if (mod.Html5Qrcode.scanFileV2) {
            const decoded = await mod.Html5Qrcode.scanFileV2(f, true);
            const m = decoded.match(/#?snake=?(.*)/);
            const id = m ? decodeURIComponent(m[1]) : decoded;
            onFound(id);
          } else if (mod.Html5Qrcode.scanFile) {
            const decoded = await mod.Html5Qrcode.scanFile(f);
            const m = decoded.match(/#?snake=?(.*)/);
            const id = m ? decodeURIComponent(m[1]) : decoded;
            onFound(id);
          } else {
            alert('File-scan not supported in this build.');
          }
        } catch (err) { console.error('file scan failed', err); alert('Failed to scan uploaded image'); }
      };

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

async function exportSnakeToPdf(snake, breederInfo = {}, theme='blue') {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = 210; const pageH = 297; const left = 15; let y = 20;
  const margin = 8;

  const themeColors = { blue: '#1E40AF', green: '#059669', dark: '#374151' };
  const frameColor = themeColors[theme] || themeColors.blue;

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
    const spaced = String(k).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_\-]+/g, ' ');
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

  // compute columns dynamically from rows: union of keys, ordered by preferred list
  function computeColumnsFromRows(rows, preferredOrder=[]) {
    const keySet = new Set();
    (rows || []).forEach(r => { if (r && typeof r === 'object') Object.keys(r).forEach(k => keySet.add(k)); });
    let keys = Array.from(keySet);
    // if no keys found, fallback to some sensible defaults
    if (!keys.length) {
      keys = ['date', 'notes'];
    }
    // Order keys: put preferred first in order if present
    const ordered = [];
    for (const p of preferredOrder) if (keySet.has(p)) { ordered.push(p); keySet.delete(p); }
    // then remaining keys alphabetically
    const rest = Array.from(keySet).sort();
    const finalKeys = [...ordered, ...rest];

    // compute widths: give some default widths for common fields, remaining equally share leftover
    const widths = {};
    const reserved = {};
    const total = usableWidth;
    // reserve widths
    finalKeys.forEach(k => {
      if (/date$/i.test(k) || k === 'date') { widths[k] = 30; reserved[k] = 30; }
      else if (/weight|grams|weightGrams/i.test(k)) { widths[k] = 30; reserved[k] = 30; }
      else if (k === 'feed' || k === 'drug' || k === 'item') { widths[k] = 50; reserved[k] = 50; }
      else if (k === 'size' || k === 'dose') { widths[k] = 30; reserved[k] = 30; }
    });
    const reservedTotal = Object.values(reserved).reduce((a,b)=>a+b,0);
    const remainingKeys = finalKeys.filter(k => typeof widths[k] === 'undefined');
    const remainingWidth = Math.max(usableWidth - reservedTotal, 40);
    const defaultWidth = Math.floor(remainingWidth / Math.max(1, remainingKeys.length));
    remainingKeys.forEach(k => widths[k] = defaultWidth);

    return finalKeys.map(k => ({ title: k, key: k, width: widths[k] }));
  }

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

  // Feeds (explicit columns)
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

function SnakeCard({ s, onEdit, onQuickPair, onDelete, groups = [], setSnakes, setQrFor, pairings = [], onOpenPairing }) {
  const hasEdit = typeof onEdit === "function";
  const hasQuick = typeof onQuickPair === "function";
  const hasDelete = typeof onDelete === "function";
  const [showPairingsModal, setShowPairingsModal] = useState(false);
  const [quickTagOpen, setQuickTagOpen] = useState(null);
  const [quickDraft, setQuickDraft] = useState({ date: localYMD(new Date()), notes: '', grams: 0, feed: 'Mouse', size: 'pinky', sizeDetail: '', form: '', formDetail: '', drug: '', dose: '' });
  const [quickTagPos, setQuickTagPos] = useState({ left: null, top: null });
  const cardRef = useRef(null);
  const geneticsTokens = useMemo(() => combineMorphsAndHetsForDisplay(s?.morphs, s?.hets), [s?.morphs, s?.hets]);

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
      const c = card.getBoundingClientRect();
      const left = 16; const top = 72;
      setQuickTagPos({ left, top });
    } catch(e) { setQuickTagPos({ left: null, top: null }); }
    // prefill based on key
    const activity = tagToActivity(fakeTag);
    setQuickDraft({ date: localYMD(new Date()), notes: '', grams: activity.defaults.grams || 0, feed: activity.defaults.feed || 'Mouse', size: activity.defaults.size || 'pinky', sizeDetail: activity.defaults.sizeDetail || '', form: activity.defaults.form || '', formDetail: activity.defaults.formDetail || '', drug: activity.defaults.drug || '', dose: activity.defaults.dose || '' });
    setQuickTagOpen(fakeTag);
  }

  function closeQuickAdd() { setQuickTagOpen(null); setQuickTagPos({ left: null, top: null }); }

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
    closeQuickAdd();
  }
  return (
  <div ref={cardRef} className="relative bg-white border rounded-xl p-2 flex flex-col gap-1 min-h-[280px] max-h-[520px] min-w-0 text-sm">
      <div className="flex items-start gap-3">
        {/* thumbnail top-left */}
        <div className="flex-shrink-0">
          {s.imageUrl ? (
            <div className="w-12 h-12 rounded-full overflow-hidden border ring-1 ring-white/60 shadow-sm">
              <img src={s.imageUrl} alt={s.name} className="w-full h-full object-cover object-center" onError={(e)=>{e.currentTarget.style.display='none'}} />
            </div>
          ) : (
            <div className="w-12 h-12 rounded-full border bg-neutral-50 flex items-center justify-center text-xs text-neutral-400 ring-1 ring-white/60 shadow-sm">No</div>
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
              {(() => {
                const normalizedSex = normalizeSexValue(s.sex);
                const symbol = normalizedSex === 'M' ? '♂' : (normalizedSex === 'F' ? '♀' : '•');
                return <Badge>{symbol}</Badge>;
              })()}
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
        <div className="fixed inset-0 z-50 pointer-events-none">
          <div style={{ left: quickTagPos.left || 24, top: quickTagPos.top || 96 }} className="pointer-events-auto absolute bg-white border rounded-lg p-3 shadow-md w-80">
            <div className="flex items-center justify-between mb-2">
              <div className="font-medium">Add {quickTagOpen}</div>
              <button className="text-sm text-neutral-500" onClick={(e)=>{ e.stopPropagation(); closeQuickAdd(); }}>✕</button>
            </div>
            <div className="space-y-2 text-sm">
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
                <div>
                  <div className="text-xs text-neutral-500">Grams</div>
                  <input className="w-full px-2 py-1 border rounded" type="number" value={quickDraft.grams} onChange={(e)=>setQuickDraft(d=>({...d, grams: e.target.value}))} />
                </div>
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
function BreederSection({ breederInfo, setBreederInfo, theme='blue', onSaved }) {
  return (
    <Card title="Breeder information">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-medium">Name</label>
          <input className="mt-1 w-full border rounded-xl px-3 py-2" value={breederInfo.name} onChange={e=>setBreederInfo({...breederInfo, name: e.target.value})} />
        </div>
        <div>
          <label className="text-xs font-medium">Business name</label>
          <input className="mt-1 w-full border rounded-xl px-3 py-2" value={breederInfo.businessName} onChange={e=>setBreederInfo({...breederInfo, businessName: e.target.value})} />
        </div>
        <div>
          <label className="text-xs font-medium">Email</label>
          <input className="mt-1 w-full border rounded-xl px-3 py-2" value={breederInfo.email} onChange={e=>setBreederInfo({...breederInfo, email: e.target.value})} />
        </div>
        <div>
          <label className="text-xs font-medium">Phone</label>
          <input className="mt-1 w-full border rounded-xl px-3 py-2" value={breederInfo.phone} onChange={e=>setBreederInfo({...breederInfo, phone: e.target.value})} />
        </div>
        <div className="md:col-span-2">
          <label className="text-xs font-medium">Logo</label>
          <div className="mt-1 flex items-center gap-2">
            <input id="breeder-logo-upload" type="file" accept="image/*" className="hidden" onChange={async e=>{
              const f = e.target.files && e.target.files[0]; if (!f) return;
              try { const data = await readFileAsDataURL(f); setBreederInfo({...breederInfo, logoUrl: data}); } catch(e){ console.error(e); }
            }} />
            <button className="px-3 py-2 rounded-lg border text-sm" onClick={()=>{ const el = document.getElementById('breeder-logo-upload'); if (el) el.click(); }}>Upload logo</button>
            {breederInfo.logoUrl && <img src={breederInfo.logoUrl} alt="logo" className="w-20 h-20 object-cover rounded-md border" />}
          </div>
        </div>
      </div>
      <div className="mt-4 flex justify-end">
        <button
          className={cx('px-3 py-2 rounded-lg text-white', primaryBtnClass(theme,true))}
          onClick={()=>{
            alert('Breeder info saved locally for this demo');
            if (typeof onSaved === 'function') onSaved();
          }}
        >
          Save
        </button>
      </div>
    </Card>
  );
}

// pairings list
function PairingsSection({ snakes, pairings, onEdit, onDelete, onOpenSnake }) {
  const openSnake = typeof onOpenSnake === 'function' ? onOpenSnake : null;
  return (
    <Card title={`Breeding Planner (${pairings.length})`}>
      <div className="space-y-3">
        {pairings.map((p, idx) => {
          const f = snakeById(snakes, p.femaleId);
          const m = snakeById(snakes, p.maleId);
          const femaleName = f?.name || p.femaleId || 'Female';
          const maleName = m?.name || p.maleId || 'Male';
          const pairingNames = `${femaleName} × ${maleName}`;
          const displayLabel = (p.label || '').trim() || pairingNames;
          const clutchNumber = idx + 1;
          const femaleGeneticsTokens = f ? combineMorphsAndHetsForDisplay(f?.morphs, f?.hets) : [];
          const maleGeneticsTokens = m ? combineMorphsAndHetsForDisplay(m?.morphs, m?.hets) : [];
          const femaleGeneticsLine = f ? (femaleGeneticsTokens.length ? femaleGeneticsTokens.join(', ') : 'Normal') : '—';
          const maleGeneticsLine = m ? (maleGeneticsTokens.length ? maleGeneticsTokens.join(', ') : 'Normal') : '—';
          const hatchlings = snakes.filter(s => {
            if (!s) return false;
            const tags = Array.isArray(s.tags) ? s.tags : [];
            const groups = Array.isArray(s.groups) ? s.groups : [];
            const taggedHatchling = tags.includes('hatchling') || groups.some(g => /^hatchlings\b/i.test(g));
            if (!taggedHatchling) return false;
            const pairingMatch = s.pairingId === p.id || s?.metadata?.pairingId === p.id;
            const parentMatch = (s.damId && s.damId === p.femaleId) && (s.sireId && s.sireId === p.maleId);
            const nameMatch = typeof s.name === 'string' && pairingNames && s.name.includes(pairingNames);
            return pairingMatch || parentMatch || nameMatch;
          });
          return (
            <div key={p.id} className="border rounded-xl p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold leading-tight text-sm sm:text-base" title={displayLabel}>
                    <div className="truncate">Clutch #{clutchNumber}</div>
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
                    {p.goals.slice(0,4).map(g => <Badge key={g}>{g}</Badge>)}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button className="text-xs px-2 py-1 border rounded-lg" onClick={()=>onEdit(p)}>Edit</button>
                  <button className="text-xs px-2 py-1 border rounded-lg" onClick={()=>onDelete(p.id)}>Delete</button>
                </div>
              </div>

              {hatchlings.length > 0 && (
                <div className="mt-3">
                  <div className="text-xs font-medium mb-1">Hatchlings</div>
                  <div className="flex flex-wrap gap-1">
                    {hatchlings.map(h => (
                      <button
                        key={h.id}
                        type="button"
                        className={cx(
                          'px-2 py-0.5 text-xs rounded-full border bg-amber-50 text-amber-900',
                          openSnake ? 'hover:bg-amber-100 transition-colors' : 'cursor-default opacity-80'
                        )}
                        onClick={openSnake ? () => openSnake(h) : undefined}
                        title={h.name || h.id}
                      >
                        {h.name || h.id}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-3">
                <div className="text-xs font-medium mb-1">Appointments</div>
                <div className="flex flex-col gap-1">
                  {(p.appointments||[]).map(ap=>{
                    const end = addDaysYmd(ap.date, 2);
                    return (
                      <div key={ap.id} className="text-xs px-2 py-1 rounded-lg border bg-neutral-50">
                        {formatDateForDisplay(ap.date)} → {formatDateForDisplay(end)} {ap.notes ? `• ${ap.notes}` : ""}
                      </div>
                    );
                  })}
                  {!(p.appointments||[]).length && <div className="text-xs text-neutral-500">None</div>}
                </div>
              </div>

              <LifecycleSummary pairing={p} />

              {m && f && (
                <PairingGeneticsOdds male={m} female={f} />
              )}
            </div>
          );
        })}
        {!pairings.length && <div className="text-sm text-neutral-500">No pairings yet. Use “New pairing”.</div>}
      </div>
    </Card>
  );
}

function PairingGeneticsOdds({ male, female }) {
  const odds = useMemo(() => computePairingGenetics(male, female), [male, female]);
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

function LifecycleSummary({ pairing }) {
  const data = withPairingLifecycleDefaults(pairing || {});
  const ovulationDate = data.ovulation.date || '';
  const preLayDate = data.preLayShed.date || '';
  const clutchDate = data.clutch.date || '';
  const hatchScheduledDate = data.hatch.scheduledDate || '';

  const preLayTarget = ovulationDate ? addDaysYmd(ovulationDate, 21) : null;
  const eggTarget = preLayDate ? addDaysYmd(preLayDate, 30) : null;
  const hatchTarget = clutchDate ? addDaysYmd(clutchDate, 60) : null;
  const hatchCountdownTarget = data.hatch.recorded ? null : (hatchScheduledDate || hatchTarget);

  const ovulationCountdownActive = data.ovulation.observed && !data.preLayShed.observed;
  const preLayCountdownActive = data.preLayShed.observed && !data.clutch.recorded;
  const clutchCountdownActive = data.clutch.recorded && !data.hatch.recorded;

  return (
    <div className="mt-3 border-t pt-3">
      <div className="text-xs font-medium mb-1">Lifecycle</div>
      <div className="flex flex-col gap-1 text-xs text-neutral-600">
  <div>Ovulation: {ovulationDate ? formatDateForDisplay(ovulationDate) : '—'}</div>
  <div>Pre-Lay Shed: {preLayDate ? formatDateForDisplay(preLayDate) : '—'}</div>
        <div>Clutch: {data.clutch.recorded && clutchDate ? `Laid ${formatDateForDisplay(clutchDate)} (${data.clutch.eggsTotal === '' ? '-' : data.clutch.eggsTotal} eggs, ${data.clutch.slugs === '' ? '-' : data.clutch.slugs} slugs)` : 'No clutch yet'}</div>
        <div>Hatching: {data.hatch.recorded && data.hatch.date ? `Hatched ${formatDateForDisplay(data.hatch.date)} (${data.hatch.hatchedCount || 0})` : hatchScheduledDate ? `Expected ${formatDateForDisplay(hatchScheduledDate)}` : 'Not scheduled'}</div>
      </div>
      <div className="flex flex-wrap gap-2 mt-2">
        {ovulationCountdownActive && preLayTarget && <CountdownBadge label="Pre-Lay ETA" targetDate={preLayTarget} totalDays={21} />}
        {preLayCountdownActive && eggTarget && <CountdownBadge label="Egg Window" targetDate={eggTarget} totalDays={30} />}
        {clutchCountdownActive && hatchTarget && <CountdownBadge label="Hatch ETA" targetDate={hatchTarget} totalDays={60} />}
        {!clutchCountdownActive && hatchCountdownTarget && !data.hatch.recorded && <CountdownBadge label="Hatch ETA" targetDate={hatchCountdownTarget} />}
      </div>
    </div>
  );
}

// edit pairing modal
function EditPairingModal({ edit, setEdit, onClose, onSave, pairingNumber = null, theme='blue', snakes = [] }) {
  const femaleSnake = useMemo(() => snakeById(snakes, edit?.femaleId), [snakes, edit?.femaleId]);
  const maleSnake = useMemo(() => snakeById(snakes, edit?.maleId), [snakes, edit?.maleId]);
  const defaultLabel = useMemo(() => {
    const femaleName = femaleSnake?.name || edit?.femaleId || 'Female';
    const maleName = maleSnake?.name || edit?.maleId || 'Male';
    return `${femaleName} × ${maleName}`;
  }, [femaleSnake, maleSnake, edit?.femaleId, edit?.maleId]);

  useEffect(() => {
    setEdit(prev => {
      if (!prev) return prev;
      const current = (prev.label || '').trim();
      if (!current) {
        if (prev.label === defaultLabel) return prev;
        return { ...prev, label: defaultLabel };
      }
      return prev;
    });
  }, [defaultLabel, setEdit]);

  const pairingTitle = pairingNumber ? `Pairing #${pairingNumber}` : 'Edit pairing';
  const labelValue = edit?.label || defaultLabel || '';
  const femaleDisplayName = femaleSnake?.name || edit?.femaleId || 'Unassigned female';
  const maleDisplayName = maleSnake?.name || edit?.maleId || 'Unassigned male';

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
      const maleGeneticsTokens = maleSnake ? combineMorphsAndHetsForDisplay(maleSnake.morphs, maleSnake.hets) : [];
      const femaleGeneticsTokens = femaleSnake ? combineMorphsAndHetsForDisplay(femaleSnake.morphs, femaleSnake.hets) : [];
      const maleGenetics = maleSnake ? (maleGeneticsTokens.length ? maleGeneticsTokens.join(', ') : 'Normal') : '—';
      const femaleGenetics = femaleSnake ? (femaleGeneticsTokens.length ? femaleGeneticsTokens.join(', ') : 'Normal') : '—';
      await exportClutchCardToPdf({
        clutchNumber: pairingNumber,
        clutchDate,
        femaleName: femaleDisplayName,
        femaleGenetics,
        maleName: maleDisplayName,
        maleGenetics,
        eggsTotal: eggsValue,
        label: labelValue,
      });
    } catch (err) {
      console.error('Failed to generate clutch card', err);
      alert('Unable to generate clutch card PDF.');
    }
  }, [edit, pairingNumber, femaleDisplayName, femaleSnake, maleDisplayName, maleSnake, labelValue]);
  return (
  <div className={cx("fixed inset-0 backdrop-blur-sm flex items-center justify-center p-4 z-50", overlayClass(theme))} onClick={onClose}>
      <div className="bg-white w-full max-w-4xl rounded-2xl shadow-xl border max-h-[92vh] flex flex-col" onClick={e=>e.stopPropagation()}>
        <div className="px-4 py-2.5 border-b flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1 min-w-0">
            <div className="text-[11px] uppercase tracking-wide text-neutral-500 font-medium">{pairingTitle}</div>
            <input
              className="border rounded-xl px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-sky-400"
              value={labelValue}
              onChange={e=>setEdit(d=>({...d,label:e.target.value}))}
            />
            <div className="text-[11px] text-neutral-500 truncate">{femaleDisplayName} × {maleDisplayName}</div>
          </div>
          <button className="self-start sm:self-center text-sm px-2 py-1" onClick={onClose}>Close</button>
        </div>

        <div className="flex-1 overflow-auto px-4 pb-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium">Starting date</label>
            <input type="date" className="mt-1 w-full border rounded-xl px-3 py-2"
              value={edit.startDate||""} onChange={e=>setEdit(d=>({...d,startDate:e.target.value}))}/>
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-medium">Notes</label>
            <textarea rows={2} className="mt-1 w-full border rounded-xl px-3 py-2"
              value={edit.notes||""}
              onChange={e=>setEdit(d=>({...d,notes:e.target.value}))}/>
          </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] gap-3 min-w-0">
            <div className="border rounded-2xl bg-white shadow-sm p-3 flex flex-col gap-3 min-w-0">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Appointments</div>
                  <div className="text-[13px] text-neutral-500">Manage pairing touchpoints</div>
                </div>
                <div className="flex gap-2">
                  <button
                    className="text-xs px-2 py-1 border rounded-lg"
                    onClick={()=>{
                      const created = genMonthlyAppointments(edit.startDate || localYMD(new Date()), 5);
                      setEdit(d=>{
                        const next = {...d, appointments: created};
                        next.startDate = (next.appointments && next.appointments[0]) ? next.appointments[0].date : null;
                        return next;
                      });
                    }}>
                    Generate 5 months
                  </button>
                  <button
                    className="text-xs px-2 py-1 border rounded-lg"
                    onClick={()=>{
                      setEdit(d=>{
                        const arr = [...(d.appointments||[]), {id:uid(), date:localYMD(new Date()), lockObserved:false, notes:""}];
                        return {...d, appointments:arr, startDate: arr[0]?.date || null};
                      });
                    }}>
                    + Add appointment
                  </button>
                </div>
              </div>
              <div className="flex-1 flex flex-col gap-2 min-w-0">
                {(edit.appointments||[]).map((ap, i)=>(
                  <div key={ap.id} className="grid grid-cols-1 sm:grid-cols-[minmax(0,150px)_minmax(0,1fr)_auto] gap-2 items-center min-w-0">
                    <input type="date" className="border rounded-lg px-2 py-1 text-sm min-w-0"
                      value={ap.date}
                      onChange={e=>{
                        const v=e.target.value;
                        setEdit(d=>{
                          const arr=[...(d.appointments||[])];
                          arr[i]={...arr[i], date:v};
                          return {...d, appointments:arr};
                        });
                      }}/>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:gap-3 gap-1">
                      <label className="inline-flex items-center gap-2 text-xs">
                        <input type="checkbox" className="w-4 h-4"
                          checked={!!ap.lockObserved}
                          onChange={e=>{
                            const v=e.target.checked;
                            setEdit(d=>{
                              const arr=[...(d.appointments||[])];
                              arr[i]={...arr[i], lockObserved:v};
                              return {...d, appointments:arr};
                            });
                          }}/>
                        Lock
                      </label>
                      <input placeholder="Notes" className="border rounded-lg px-2 py-1 text-xs flex-1 min-w-0"
                        value={ap.notes||""}
                        onChange={e=>{
                          const v=e.target.value;
                          setEdit(d=>{
                            const arr=[...(d.appointments||[])];
                            arr[i]={...arr[i], notes:v};
                            return {...d, appointments:arr};
                          });
                        }}/>
                    </div>
                    <button className="text-[11px] px-2 py-1 border rounded-lg"
                      onClick={()=>{
                        setEdit(d=>{
                          const arr=[...(d.appointments||[])];
                          arr.splice(i,1);
                          return {...d, appointments:arr, startDate: arr[0]?.date || null};
                        });
                      }}>
                      Remove
                    </button>
                  </div>
                ))}
                {!(edit.appointments||[]).length && <div className="text-xs text-neutral-500">No appointments yet.</div>}
              </div>
            </div>

            <PairingLifecycleEditor edit={edit} setEdit={setEdit} theme={theme} onCreateClutchCard={handleCreateClutchCard} />
          </div>
        </div>

        <div className="px-4 py-3 border-t flex items-center justify-end gap-2">
          <button className="px-3 py-2 rounded-xl text-sm border" onClick={onClose}>Cancel</button>
          <button className={cx('px-3 py-2 rounded-xl text-sm', primaryBtnClass(theme,true))} onClick={onSave}>Save changes</button>
        </div>
      </div>
    </div>
  );
}

function PairingLifecycleEditor({ edit, setEdit, theme = 'blue', onCreateClutchCard }) {
  const [activeDialog, setActiveDialog] = useState(null);
  const [ovulationDraft, setOvulationDraft] = useState({ date: '', notes: '' });
  const [preLayDraft, setPreLayDraft] = useState({ date: '', notes: '' });
  const [clutchDraft, setClutchDraft] = useState({ date: '', eggsTotal: '', slugs: '', notes: '' });
  const [hatchedDraft, setHatchedDraft] = useState({ date: '', hatchedCount: '', notes: '' });

  const ovulationObserved = !!edit?.ovulation?.observed;
  const preLayObserved = !!edit?.preLayShed?.observed;
  const clutchRecorded = !!edit?.clutch?.recorded;
  const hatchedRecorded = !!edit?.hatch?.recorded;

  const ovulationDate = edit?.ovulation?.date || '';
  const preLayDate = edit?.preLayShed?.date || '';
  const clutchDate = edit?.clutch?.date || '';
  const hatchScheduledDate = edit?.hatch?.scheduledDate || '';

  const preLayWindowTarget = ovulationDate ? addDaysYmd(ovulationDate, 21) : null;
  const eggLayingTarget = preLayDate ? addDaysYmd(preLayDate, 30) : null;
  const hatchTarget = clutchDate ? addDaysYmd(clutchDate, 60) : null;
  const hatchCountdownTarget = hatchScheduledDate || hatchTarget;
  const eggsTotalNumber = typeof edit?.clutch?.eggsTotal === 'number' && Number.isFinite(edit.clutch.eggsTotal)
    ? Math.max(0, edit.clutch.eggsTotal)
    : null;

  const ovulationCountdownActive = ovulationObserved && !preLayObserved;
  const preLayCountdownActive = preLayObserved && !clutchRecorded;
  const clutchCountdownActive = clutchRecorded && !hatchedRecorded;
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
        date: clutchDate || localYMD(new Date()),
        eggsTotal: edit?.clutch?.eggsTotal === '' || typeof edit?.clutch?.eggsTotal === 'undefined' ? '' : String(edit.clutch.eggsTotal),
        slugs: edit?.clutch?.slugs === '' || typeof edit?.clutch?.slugs === 'undefined' ? '' : String(edit.clutch.slugs),
        notes: edit?.clutch?.notes || '',
      });
    }
  }, [activeDialog, clutchDate, edit?.clutch]);

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
        next.clutch = { ...pairingLifecycleDefaults().clutch };
      }
      return next;
    });
    if (checked) {
      setActiveDialog('clutch');
    }
  }, [setEdit, setActiveDialog]);

  const toggleHatched = useCallback((checked) => {
    setEdit(prev => {
      const next = withPairingLifecycleDefaults({ ...prev });
      if (checked) {
        next.hatch.recorded = true;
        next.hatch.date = next.hatch.date || localYMD(new Date());
      } else {
        next.hatch = { ...pairingLifecycleDefaults().hatch };
      }
      return next;
    });
    if (checked) setActiveDialog('hatched');
  }, [setEdit, setActiveDialog]);


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
      const delta = next.ovulation.observed && next.ovulation.date && preLayDraft.date ? diffInDays(next.ovulation.date, preLayDraft.date) : null;
      next.preLayShed.intervalFromOvulation = Number.isFinite(delta) ? delta : null;
      return next;
    });
    setActiveDialog(null);
  }, [preLayDraft, setEdit, setActiveDialog]);

  const saveClutchDraft = useCallback(() => {
    setEdit(prev => {
      const next = withPairingLifecycleDefaults({ ...prev });
      next.clutch = {
        recorded: true,
        date: clutchDraft.date,
        eggsTotal: clutchDraft.eggsTotal === '' ? '' : Number(clutchDraft.eggsTotal),
        slugs: clutchDraft.slugs === '' ? '' : Number(clutchDraft.slugs),
        notes: clutchDraft.notes || '',
      };
      if (!next.hatch.scheduledDate && clutchDraft.date) {
        next.hatch.scheduledDate = addDaysYmd(clutchDraft.date, 60);
      }
      return next;
    });
    setActiveDialog(null);
  }, [clutchDraft, setEdit]);

  const saveHatchedDraft = useCallback(() => {
    setEdit(prev => {
      const next = withPairingLifecycleDefaults({ ...prev });
      let safeCount = hatchedDraft.hatchedCount === '' ? 0 : Number(hatchedDraft.hatchedCount);
      if (!Number.isFinite(safeCount) || safeCount < 0) safeCount = 0;
      if (typeof next.clutch.eggsTotal === 'number' && Number.isFinite(next.clutch.eggsTotal)) {
        safeCount = Math.min(safeCount, Math.max(0, next.clutch.eggsTotal));
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
  const showPreLayCountdown = ovulationCountdownActive && preLayWindowTarget;
  const showEggCountdown = preLayCountdownActive && eggLayingTarget;
  const showHatchCountdown = clutchCountdownActive && hatchTarget;
  const showScheduledCountdown = !clutchCountdownActive && hatchCountdownTarget && !hatchedRecorded;

  const timerQueue = [
    showPreLayCountdown ? { key: 'preLay', label: 'Pre-Lay ETA', targetDate: preLayWindowTarget, totalDays: 21 } : null,
    showEggCountdown ? { key: 'eggLay', label: 'Egg Lay ETA', targetDate: eggLayingTarget, totalDays: 30 } : null,
    showHatchCountdown ? { key: 'hatch', label: 'Hatch ETA', targetDate: hatchTarget, totalDays: 60 } : null,
    showScheduledCountdown ? { key: 'scheduled', label: 'Scheduled Hatch', targetDate: hatchCountdownTarget, totalDays: null } : null,
  ].filter(Boolean);

  const activeTimer = timerQueue.length ? timerQueue[0] : null;
  const hasActiveTimers = !!activeTimer;

  return (
    <>
      <div className="border rounded-2xl bg-white shadow-sm p-3 flex flex-col gap-3 h-full max-h-[60vh] min-h-0 overflow-hidden">
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Lifecycle</div>
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
            <div className={cx(tileClass, 'w-full lg:max-w-xl text-center items-center')}>
              <div className="space-y-0.5">
                <div className="font-semibold uppercase tracking-wide text-neutral-500">Clutch &amp; Hatch</div>
                <div className="text-neutral-700 text-[13px]">
                  {clutchRecorded && clutchDate ? `Laid ${formatDateForDisplay(clutchDate)}` : 'No egg laid recorded'}
                </div>
                {clutchRecorded && (
                  <div className="text-[11px] text-neutral-500 space-y-0.5">
                    <div className="flex items-center gap-2 justify-center">
                      <span>Eggs: {edit?.clutch?.eggsTotal === '' ? '-' : edit.clutch.eggsTotal}</span>
                      <span className="text-neutral-300">•</span>
                      <span>Slugs: {edit?.clutch?.slugs === '' ? '-' : edit.clutch.slugs}</span>
                    </div>
                    {edit?.clutch?.notes ? <div>Notes: {edit.clutch.notes}</div> : null}
                  </div>
                )}
              </div>
              <div className="mt-2 flex flex-col gap-2 items-center">
                <label className="inline-flex items-center gap-2 text-xs">
                  <input type="checkbox" className="w-4 h-4" checked={clutchRecorded} onChange={e=>toggleClutch(e.target.checked)} />
                  <span>Egg laid</span>
                </label>
                <div className="flex items-center gap-2 text-[11px] text-neutral-500">
                  <span>Expected on</span>
                  <span className="text-neutral-700 font-medium">
                    {hatchTarget ? formatDateForDisplay(hatchTarget) : '—'}
                  </span>
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                  <button className="text-[11px] px-2.5 py-1 border rounded-lg" onClick={()=>setActiveDialog('clutch')}>
                    {clutchRecorded ? 'Edit egg laid details' : 'Log egg laid'}
                  </button>
                  {clutchRecorded && (
                    <button
                      className="text-[11px] px-2.5 py-1 border rounded-lg"
                      onClick={() => onCreateClutchCard?.()}
                      disabled={!canGenerateClutchCard}
                    >
                      Create clutch card
                    </button>
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
                <div className="flex flex-col items-end gap-1">
                  <label className="inline-flex items-center gap-2 text-xs">
                    <input type="checkbox" className="w-4 h-4" checked={hatchedRecorded} onChange={e=>toggleHatched(e.target.checked)} />
                    <span>Hatched</span>
                  </label>
                  {hatchedRecorded && (
                    <button className="text-[11px] px-2 py-1 border rounded-lg" onClick={()=>setActiveDialog('hatched')}>
                      Edit hatch
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className={tileClass}>
            <div className="font-semibold uppercase tracking-wide text-neutral-500">Timers</div>
            <div className="flex flex-col gap-1.5">
              {hasActiveTimers ? (
                <CountdownBadge
                  key={activeTimer.key}
                  label={activeTimer.label}
                  targetDate={activeTimer.targetDate}
                  totalDays={typeof activeTimer.totalDays === 'number' ? activeTimer.totalDays : null}
                  theme={theme}
                />
              ) : (
                <div className="text-[11px] text-neutral-500">No active timers yet.</div>
              )}
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
          title="Clutch details"
          theme={theme}
          onClose={() => setActiveDialog(null)}
          onConfirm={saveClutchDraft}
          disableConfirm={!clutchDraft.date}
        >
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium">Date of egg laying</label>
              <input type="date" className="mt-1 w-full border rounded-xl px-3 py-2" value={clutchDraft.date} onChange={e=>setClutchDraft(d=>({...d, date:e.target.value}))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium">Number of eggs</label>
                <input type="number" min="0" className="mt-1 w-full border rounded-xl px-3 py-2" value={clutchDraft.eggsTotal} onChange={e=>setClutchDraft(d=>({...d, eggsTotal:e.target.value}))} />
              </div>
              <div>
                <label className="text-xs font-medium">Number of slugs</label>
                <input type="number" min="0" className="mt-1 w-full border rounded-xl px-3 py-2" value={clutchDraft.slugs} onChange={e=>setClutchDraft(d=>({...d, slugs:e.target.value}))} />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium">Notes</label>
              <textarea rows={3} className="mt-1 w-full border rounded-xl px-3 py-2" value={clutchDraft.notes} onChange={e=>setClutchDraft(d=>({...d, notes:e.target.value}))} />
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
                max={eggsTotalNumber ?? undefined}
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
                  if (eggsTotalNumber !== null && parsed > eggsTotalNumber) parsed = eggsTotalNumber;
                  setHatchedDraft(d=>({ ...d, hatchedCount: String(parsed) }));
                }}
              />
              {eggsTotalNumber !== null && (
                <div className="mt-1 text-[11px] text-neutral-500">Maximum allowed: {eggsTotalNumber} (eggs laid)</div>
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

function CountdownBadge({ label, targetDate, totalDays = null, theme = 'blue' }) {
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

  return (
    <div className={cx('countdown-badge flex flex-wrap items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold w-full', themeClass, overdue && 'overdue')}>
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
function LogsEditor({ editSnakeDraft, setEditSnakeDraft }) {
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
              // structured feed entry: feed type, size (for mice/rats), weightGrams, method, methodDetail, notes
              setEditSnakeDraft(d=>({...d,logs:{...d.logs,feeds:[...d.logs.feeds,{date:today,feed:'Mouse',size:'',weightGrams:0,method:'Frozen/thawed',methodDetail:'',notes:''}]}}));
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

  const malesById = useMemo(() => Object.fromEntries(snakes.filter(s=>s.sex==='M').map(m=>[m.id,m])), [snakes]);
  const femalesById = useMemo(() => Object.fromEntries(snakes.filter(s=>s.sex==='F').map(f=>[f.id,f])), [snakes]);

  const grid = buildMonthGrid(year, month);

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
              });
            }
          }
        }
      });
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

  const legend = useMemo(()=>{
    const maleIds = Array.from(new Set(events.map(e=>e.maleId).filter(Boolean)));
    return maleIds.map(id=>({ id, name: malesById[id]?.name || id, cls: id ? maleColorBg(id, theme) : '' }));
  }, [events, malesById, theme]);

  return (
    <div className="bg-white border rounded-2xl shadow-sm">
      <div className="px-4 py-3 border-b flex items-center gap-3">
        <div className="font-semibold">Monthly calendar</div>
        <select className="border rounded-lg px-2 py-1" value={month} onChange={e=>setMonth(Number(e.target.value))}>
          {Array.from({length:12},(_,i)=>i).map(m=>(
            <option key={m} value={m}>{new Date(2000,m,1).toLocaleString('en',{month:'long'})}</option>
          ))}
        </select>
        <input className="border rounded-lg px-2 py-1 w-24" type="number" value={year} onChange={e=>setYear(Number(e.target.value)||year)} />
        <button className={cx('ml-auto px-3 py-2 rounded-xl text-sm', primaryBtnClass(theme,true))} onClick={loadAppointmentsIntoCalendar}>
          Refresh
        </button>
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
                {events.filter(e=> e.date===ymd(cell.year,cell.month,cell.day)).map((e,idx)=> {
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
                  // pairing span event — show Male × Female and make clickable
                  const p = pairings.find(pp=>pp.id===e.pairingId);
                  const maleName = malesById[e.maleId]?.name || e.maleId;
                  const femaleName = femalesById[e.femaleId]?.name || e.femaleId;
                  return (
                    <button key={idx} onClick={()=>{ if (onOpenPairing) onOpenPairing(e.pairingId); }} className={cx("text-xs px-2 py-1 rounded-lg border flex items-center gap-2 text-left w-full", maleColorBorder(e.maleId, theme))}>
                      <span className={cx("inline-block w-2 h-2 rounded-full mr-1 align-middle", maleColorBg(e.maleId, theme))}></span>
                      <div className="truncate">
                        <div className="font-medium truncate">{maleName} × {femaleName}</div>
                        <div className="text-[11px] text-neutral-500">{p?.label || ''}</div>
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

const GENE_GROUP_COLOR_CLASSES = {
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

  const stripLeadingHet = stripSuper.replace(/^(?:\d{1,3}%\s+)?(?:pos(?:sible)?\s+)?het\s+/i, '').trim();
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

function getGeneChipClasses(displayGroup) {
  return GENE_GROUP_COLOR_CLASSES[displayGroup] || GENE_GROUP_COLOR_CLASSES.Other;
}

const GENE_LEGEND_ITEMS = [
  { key: 'Recessive', label: 'Recessive' },
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
        const chipClasses = getGeneChipClasses(group);
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
