import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { getAllGenes, getGeneDatabaseGeneration } from '../genetics/geneDatabase';

const GENE_TYPE_META = {
  recessive:            { label: 'R',   bg: 'bg-purple-100', text: 'text-purple-700', title: 'Recessive' },
  incomplete_dominant:  { label: 'Co',  bg: 'bg-blue-100',   text: 'text-blue-700',   title: 'Codominant' },
  dominant:             { label: 'D',   bg: 'bg-green-100',  text: 'text-green-700',  title: 'Dominant' },
  polygenic:            { label: 'P',   bg: 'bg-gray-100',   text: 'text-gray-500',   title: 'Polygenic' },
  locality:             { label: 'L',   bg: 'bg-amber-100',  text: 'text-amber-700',  title: 'Locality' },
  physical:             { label: 'Ph',  bg: 'bg-gray-100',   text: 'text-gray-500',   title: 'Physical trait' },
  other:                { label: '?',   bg: 'bg-gray-100',   text: 'text-gray-500',   title: 'Other / unclassified' },
};

const HEALTH_ICONS = {
  wobble:       { icon: '⚠', title: 'Neurological wobble', color: 'text-amber-500' },
  lethal_super: { icon: '☠', title: 'Homozygous/super form is lethal', color: 'text-red-600' },
  infertility:  { icon: '⚠', title: 'Fertility/reproduction issues', color: 'text-orange-500' },
  kinking:      { icon: '⚠', title: 'Kinking or duckbill deformity risk in super form', color: 'text-orange-500' },
};

function TypeBadge({ type }) {
  const meta = GENE_TYPE_META[type] || GENE_TYPE_META.other;
  return (
    <span
      className={`inline-flex items-center justify-center w-6 h-5 rounded text-[10px] font-bold shrink-0 ${meta.bg} ${meta.text}`}
      title={meta.title}
    >
      {meta.label}
    </span>
  );
}

function HealthIcons({ flags = [] }) {
  if (!flags || !flags.length) return null;
  const unique = [...new Set(flags)];
  return (
    <span className="flex items-center gap-0.5 ml-1">
      {unique.map(flag => {
        const h = HEALTH_ICONS[flag];
        if (!h) return null;
        return (
          <span key={flag} className={`text-[11px] ${h.color}`} title={h.title}>
            {h.icon}
          </span>
        );
      })}
    </span>
  );
}

function scoreMatch(gene, query) {
  const q = query.toLowerCase();
  const name = gene.geneName.toLowerCase();
  if (name === q) return 0;
  if (name.startsWith(q)) return 1;
  if (name.includes(q)) return 2;
  for (const alias of gene.aliases) {
    const a = alias.toLowerCase();
    if (a === q) return 3;
    if (a.startsWith(q)) return 4;
    if (a.includes(q)) return 5;
  }
  for (const s of gene.shorthand) {
    if (s.toLowerCase() === q) return 3;
  }
  return 99;
}

const HET_STRIP_RE = /^(?:\d{1,3}%\s*)?(?:(?:pos(?:s?i?a?ble)?|probable|maybe|ph)\s+)?het\s+/i;
const PCT_STRIP_RE = /^(\d{1,3})%\s+/i;
const POS_STRIP_RE = /^(?:pos(?:s?i?a?ble)?|probable|maybe|ph)\s+/i;
const SUPER_STRIP_RE = /^super[\s-]+/i;

// Typing a qualifier is never required -- every form a gene can take is already its own
// row in the dropdown. But a keeper who types "66 clown" or "super pastel" out of habit
// should land on the row they meant, so a recognised qualifier simply preselects it.
function detectVariant(raw) {
  const r = raw.trim();
  if (SUPER_STRIP_RE.test(r)) return 'super';
  const pct = PCT_STRIP_RE.exec(r);
  if (pct) {
    if (pct[1] === '66') return 'het66';
    if (pct[1] === '50') return 'het50';
    return 'het';
  }
  if (POS_STRIP_RE.test(r)) return 'possibleAny';
  if (HET_STRIP_RE.test(r)) return 'het';
  return null;
}

// "possible" means the possible-het row on a recessive and the possible-visual row on
// everything else, so it resolves against whichever the matched gene actually offers.
const VARIANT_PREFERENCE = {
  super:       ['super'],
  het:         ['het'],
  het66:       ['het66'],
  het50:       ['het50'],
  possibleAny: ['hetPossible', 'possible'],
};

function preferredIndex(options, variant) {
  if (!variant || !options.length) return 0;
  for (const wanted of VARIANT_PREFERENCE[variant] || []) {
    const idx = options.findIndex(o => o.variant === wanted);
    if (idx >= 0) return idx;
  }
  return 0;
}

function stripQualifier(raw) {
  return raw.trim()
    .replace(SUPER_STRIP_RE, '')
    .replace(HET_STRIP_RE, '')
    .replace(PCT_STRIP_RE, '')
    .replace(POS_STRIP_RE, '')
    .trim();
}

function collectMatches(allGenes, q) {
  const results = [];
  for (const gene of allGenes) {
    const s = scoreMatch(gene, q);
    if (s < 99) {
      const matchedAlias = s >= 3
        ? (gene.aliases.find(a => a.toLowerCase().includes(q)) || null)
        : null;
      results.push({ gene, score: s, matchedAlias });
    }
  }
  return results
    .sort((a, b) => a.score - b.score || a.gene.geneName.localeCompare(b.gene.geneName))
    .slice(0, 8);
}

function searchGenes(allGenes, query) {
  const raw = query.toLowerCase().trim();
  if (!raw) return [];
  const cleaned = stripQualifier(raw);
  const results = cleaned ? collectMatches(allGenes, cleaned) : [];
  // A gene whose own name opens with a word we treat as a qualifier would be stripped
  // down to nothing findable, so fall back to the untouched query rather than go blank.
  if (results.length || cleaned === raw) return results;
  return collectMatches(allGenes, raw);
}

const HET_VARIANTS = [
  { variant: 'het',         prefix: 'Het' },
  { variant: 'het66',       prefix: '66% Het' },
  { variant: 'het50',       prefix: '50% Het' },
  { variant: 'hetPossible', prefix: 'Possible Het' },
];

const HET_VARIANT_KEYS = new Set(HET_VARIANTS.map(v => v.variant));

/**
 * Super forms read "Super <Gene>", with the trade name appended when the database knows
 * one -- "Super Spotnose (Powerball)". The genetic name has to lead: Blue-Eyed Leucistic
 * is the super of Mojave, Lesser, Butter AND Phantom alike, so the nickname on its own
 * could never tell punnett.ts which allele the animal is actually carrying.
 *
 * Genes whose super form is lethal -- Spider, Champagne, Hidden Gene Woma -- are never
 * offered one. No keeper can hold that animal, so it must not be selectable. Those three
 * also carry hasSuperForm: false today, but the health flag is what the rule reads: a
 * later data correction flipping that boolean must not quietly put the row back.
 */
export function superLabelFor(gene) {
  if (!gene.hasSuperForm) return null;
  if ((gene.healthFlags || []).includes('lethal_super')) return null;
  const plain = `Super ${gene.geneName}`;
  const nickname = (gene.superGeneName || '').trim();
  if (!nickname || nickname.toLowerCase() === plain.toLowerCase()) return plain;
  return `${plain} (${nickname})`;
}

/**
 * Expands each matched gene into the forms it can actually take, plain form first so that
 * typing a name and pressing Enter records the animal as you would read it off the label:
 *
 *   recessive        visual, het, 66% het, 50% het, possible het
 *   co-dominant      single gene, super (where one exists), possible
 *   everything else  the gene, possible
 *
 * A super form gets no "possible" row of its own. "Possible" records that the keeper is
 * unsure the gene is there at all, and punnett.ts keeps it out of predictions entirely.
 */
function buildOptions(results) {
  const options = [];
  for (const { gene, matchedAlias } of results) {
    const rows = [{ variant: 'visual', token: gene.geneName }];

    if (gene.geneType === 'recessive') {
      for (const v of HET_VARIANTS) {
        rows.push({ variant: v.variant, token: `${v.prefix} ${gene.geneName}` });
      }
    } else {
      if (gene.geneType === 'incomplete_dominant') {
        const superLabel = superLabelFor(gene);
        if (superLabel) rows.push({ variant: 'super', token: superLabel });
      }
      rows.push({ variant: 'possible', token: `Possible ${gene.geneName}` });
    }

    rows.forEach((row, i) => {
      options.push({
        ...row,
        gene,
        matchedAlias,
        label: row.token,
        isHet: HET_VARIANT_KEYS.has(row.variant),
        // Aliases, health icons and complex names ride on the first row of each gene
        // only -- repeating them down every form of the same gene is just noise.
        showMeta: i === 0,
      });
    });
  }
  return options;
}

/**
 * GeneAutocomplete
 *
 * Props:
 *   morphs: string[]           – current visual gene tokens
 *   hets: string[]             – current het tokens ("Het X", "66% Het X", "Possible Het X")
 *   onChange({ morphs, hets }) – called whenever the selection changes
 *   disabled?: boolean
 *   placeholder?: string
 */
export default function GeneAutocomplete({ morphs = [], hets = [], onChange, disabled = false, placeholder }) {
  const allGenes = useMemo(() => getAllGenes(), [getGeneDatabaseGeneration()]);
  const [inputValue, setInputValue] = useState('');
  const [options, setOptions] = useState([]);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);

  const inputRef = useRef(null);
  const dropdownRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    const results = searchGenes(allGenes, inputValue);
    const opts = buildOptions(results);
    setOptions(opts);
    setActiveIdx(preferredIndex(opts, detectVariant(inputValue)));
    setOpen(opts.length > 0 && inputValue.trim().length > 0);
  }, [inputValue, allGenes]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectOption = useCallback((option) => {
    const nextMorphs = option.isHet ? morphs : [...morphs, option.token];
    const nextHets = option.isHet ? [...hets, option.token] : hets;
    onChange({ morphs: nextMorphs, hets: nextHets });
    setInputValue('');
    setOpen(false);
    inputRef.current?.focus();
  }, [morphs, hets, onChange]);

  const removeMorph = useCallback((token) => {
    onChange({ morphs: morphs.filter(m => m !== token), hets });
  }, [morphs, hets, onChange]);

  const removeHet = useCallback((token) => {
    onChange({ morphs, hets: hets.filter(h => h !== token) });
  }, [morphs, hets, onChange]);

  const handleKeyDown = useCallback((e) => {
    if (!open || !options.length) {
      if (e.key === 'Backspace' && !inputValue) {
        if (hets.length) {
          removeHet(hets[hets.length - 1]);
        } else if (morphs.length) {
          removeMorph(morphs[morphs.length - 1]);
        }
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx(i => Math.min(i + 1, options.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (options[activeIdx]) selectOption(options[activeIdx]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }, [open, options, activeIdx, selectOption, inputValue, hets, morphs, removeHet, removeMorph]);

  return (
    <div ref={containerRef} className="relative">
      <div
        className={`flex flex-wrap gap-1 min-h-10 px-2 py-1.5 border rounded-xl bg-white transition-colors ${disabled ? 'opacity-50 pointer-events-none' : 'focus-within:border-blue-400'}`}
      >
        {morphs.map((token) => (
          <span
            key={token}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-100 text-violet-800 text-xs font-medium"
          >
            {token}
            <button
              type="button"
              onClick={() => removeMorph(token)}
              className="text-violet-500 hover:text-violet-800 leading-none"
              aria-label={`Remove ${token}`}
            >
              ×
            </button>
          </span>
        ))}
        {hets.map((token) => (
          <span
            key={token}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 text-xs font-medium"
          >
            {token}
            <button
              type="button"
              onClick={() => removeHet(token)}
              className="text-sky-500 hover:text-sky-800 leading-none"
              aria-label={`Remove ${token}`}
            >
              ×
            </button>
          </span>
        ))}

        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (options.length && inputValue.trim()) setOpen(true); }}
          placeholder={placeholder || 'Search gene…'}
          className="flex-1 outline-none text-sm px-1 bg-transparent min-w-32"
          disabled={disabled}
          autoComplete="off"
        />
      </div>

      {open && options.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 mt-1 w-full bg-white border border-neutral-200 rounded-xl shadow-lg max-h-72 overflow-y-auto"
          role="listbox"
        >
          {options.map((option, idx) => (
            <button
              key={`${option.gene.geneName}-${option.variant}`}
              type="button"
              role="option"
              aria-selected={idx === activeIdx}
              onMouseEnter={() => setActiveIdx(idx)}
              onClick={() => selectOption(option)}
              className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors ${
                idx === activeIdx ? 'bg-blue-50' : 'hover:bg-neutral-50'
              }`}
            >
              <TypeBadge type={option.gene.geneType} />
              <span className="text-sm font-medium text-neutral-800 truncate">
                {option.label}
              </span>
              {option.showMeta && option.matchedAlias && (
                <span className="text-xs text-neutral-400 shrink-0">
                  ({option.matchedAlias})
                </span>
              )}
              {option.showMeta && <HealthIcons flags={option.gene.healthFlags} />}
              {option.showMeta && option.gene.complex && (
                <span className="text-[10px] text-neutral-400 ml-auto shrink-0 truncate max-w-28" title={option.gene.complex}>
                  {option.gene.complex}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
