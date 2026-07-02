import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { getAllGenes } from '../genetics/geneDatabase';

const GENE_TYPE_META = {
  recessive:            { label: 'R',   bg: 'bg-purple-100', text: 'text-purple-700', title: 'Recessive' },
  incomplete_dominant:  { label: 'Co',  bg: 'bg-blue-100',   text: 'text-blue-700',   title: 'Codominant' },
  dominant:             { label: 'D',   bg: 'bg-green-100',  text: 'text-green-700',  title: 'Dominant' },
  polygenic:            { label: 'P',   bg: 'bg-gray-100',   text: 'text-gray-500',   title: 'Polygenic / Other' },
};

const HEALTH_ICONS = {
  wobble:       { icon: '⚠', title: 'Neurological wobble', color: 'text-amber-500' },
  lethal_super: { icon: '☠', title: 'Homozygous/super form is lethal', color: 'text-red-600' },
  infertility:  { icon: '⚠', title: 'Fertility/reproduction issues', color: 'text-orange-500' },
  kinking:      { icon: '⚠', title: 'Kinking or duckbill deformity risk in super form', color: 'text-orange-500' },
};

function TypeBadge({ type }) {
  const meta = GENE_TYPE_META[type] || GENE_TYPE_META.incomplete_dominant;
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

function searchGenes(allGenes, query) {
  if (!query || query.length < 1) return [];
  const q = query.toLowerCase().trim();
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
    .slice(0, 12);
}

/**
 * GeneAutocomplete
 *
 * Props:
 *   morphs: string[]           – current visual gene tokens
 *   hets: string[]             – current het tokens (may include "Het X", "50% X", "Possible X")
 *   onChange({ morphs, hets }) – called whenever the selection changes
 *   disabled?: boolean
 *   placeholder?: string
 */
export default function GeneAutocomplete({ morphs = [], hets = [], onChange, disabled = false, placeholder }) {
  const allGenes = useMemo(() => getAllGenes(), []);
  const [inputValue, setInputValue] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [hetMode, setHetMode] = useState(false);
  const [hetQualifier, setHetQualifier] = useState('');
  const [qualOpen, setQualOpen] = useState(false);

  const inputRef = useRef(null);
  const dropdownRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    const results = searchGenes(allGenes, inputValue);
    setSuggestions(results);
    setActiveIdx(0);
    setOpen(results.length > 0 && inputValue.trim().length > 0);
  }, [inputValue, allGenes]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
        setQualOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const buildToken = useCallback((geneName) => {
    if (!hetMode) return geneName;
    const qualifier = hetQualifier.trim();
    if (!qualifier) return `Het ${geneName}`;
    return `${qualifier} ${geneName}`;
  }, [hetMode, hetQualifier]);

  const selectGene = useCallback((gene) => {
    const token = buildToken(gene.geneName);
    const nextMorphs = hetMode ? morphs : [...morphs, gene.geneName];
    const nextHets = hetMode ? [...hets, token] : hets;
    onChange({ morphs: nextMorphs, hets: nextHets });
    setInputValue('');
    setOpen(false);
    inputRef.current?.focus();
  }, [buildToken, hetMode, morphs, hets, onChange]);

  const removeMorph = useCallback((token) => {
    onChange({ morphs: morphs.filter(m => m !== token), hets });
  }, [morphs, hets, onChange]);

  const removeHet = useCallback((token) => {
    onChange({ morphs, hets: hets.filter(h => h !== token) });
  }, [morphs, hets, onChange]);

  const handleKeyDown = useCallback((e) => {
    if (!open || !suggestions.length) {
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
      setActiveIdx(i => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (suggestions[activeIdx]) selectGene(suggestions[activeIdx].gene);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }, [open, suggestions, activeIdx, selectGene, inputValue, hets, morphs, removeHet, removeMorph]);

  const toggleHetMode = useCallback(() => {
    setHetMode(m => !m);
    setHetQualifier('');
    setQualOpen(false);
    inputRef.current?.focus();
  }, []);

  const HET_QUALIFIERS = ['Het', '50%', '66%', 'Possible'];

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

        <div className="flex items-center gap-1 flex-1 min-w-32">
          <div className="relative flex items-center">
            <button
              type="button"
              onClick={toggleHetMode}
              className={`px-2 py-0.5 rounded-l text-[11px] font-semibold leading-tight border transition-colors ${
                hetMode
                  ? 'bg-sky-500 text-white border-sky-500'
                  : 'bg-neutral-100 text-neutral-600 border-neutral-200 hover:bg-neutral-200'
              }`}
              title={hetMode ? 'Adding as het — click to switch to visual' : 'Adding as visual — click to switch to het'}
            >
              {hetMode ? 'Het' : 'Visual'}
            </button>
            {hetMode && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setQualOpen(q => !q)}
                  className="px-1.5 py-0.5 bg-sky-400 text-white text-[10px] font-medium border-l border-sky-600 rounded-r hover:bg-sky-500 leading-tight"
                  title="Het qualifier (50%, 66%, Possible, etc.)"
                >
                  {hetQualifier || '…'}
                </button>
                {qualOpen && (
                  <div className="absolute top-full left-0 mt-1 z-50 bg-white border rounded-lg shadow-lg min-w-20 text-xs overflow-hidden">
                    <button
                      type="button"
                      className="block w-full text-left px-3 py-1.5 hover:bg-neutral-50 text-neutral-600"
                      onClick={() => { setHetQualifier(''); setQualOpen(false); inputRef.current?.focus(); }}
                    >
                      Het (plain)
                    </button>
                    {HET_QUALIFIERS.filter(q => q !== 'Het').map(q => (
                      <button
                        key={q}
                        type="button"
                        className="block w-full text-left px-3 py-1.5 hover:bg-neutral-50 text-neutral-600"
                        onClick={() => { setHetQualifier(q); setQualOpen(false); inputRef.current?.focus(); }}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => { if (suggestions.length && inputValue.trim()) setOpen(true); }}
            placeholder={placeholder || (hetMode ? 'Search het gene…' : 'Search gene…')}
            className="flex-1 outline-none text-sm px-1 bg-transparent min-w-24"
            disabled={disabled}
            autoComplete="off"
          />
        </div>
      </div>

      {open && suggestions.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 mt-1 w-full bg-white border border-neutral-200 rounded-xl shadow-lg max-h-72 overflow-y-auto"
          role="listbox"
        >
          {suggestions.map(({ gene, matchedAlias }, idx) => (
            <button
              key={gene.geneName}
              type="button"
              role="option"
              aria-selected={idx === activeIdx}
              onMouseEnter={() => setActiveIdx(idx)}
              onClick={() => selectGene(gene)}
              className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors ${
                idx === activeIdx ? 'bg-blue-50' : 'hover:bg-neutral-50'
              }`}
            >
              <TypeBadge type={gene.geneType} />
              <span className="text-sm font-medium text-neutral-800 truncate">
                {gene.geneName}
              </span>
              {matchedAlias && (
                <span className="text-xs text-neutral-400 shrink-0">
                  ({matchedAlias})
                </span>
              )}
              <HealthIcons flags={gene.healthFlags} />
              {gene.complex && (
                <span className="text-[10px] text-neutral-400 ml-auto shrink-0 truncate max-w-28" title={gene.complex}>
                  {gene.complex}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
