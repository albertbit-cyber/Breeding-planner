import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CHECK_GUIDANCE, getChecksForView, getPreferredView } from './checkGuidance';
import snakeBodyArt from './snakeArt.svg';
import snakeHeadArt from './snakeHeadArt.svg';

// Where to look, drawn on the animal. A list of seven words ("mites, eyes, breathing, condition,
// vent, skin, shed") tells a new breeder nothing about where any of those live; a body with
// numbered markers does.
//
// Two drawings, because one cannot do both jobs. The whole animal from above answers "where along
// the snake", but it is too small at the head to show an eye. The head in profile has a real eye,
// nostril and labial scales, which is what you actually need for the three checks you make with
// your face six inches away. Selecting a check switches to whichever drawing shows it best, and
// the toggle stays there for anyone who wants the other view.
//
// Both illustrations load as images so their path data stays a separately cached asset rather than
// being parsed with the JS bundle. The markers are a transparent SVG layer sharing each drawing's
// exact viewBox, so a coordinate measured against the artwork lands on it at any rendered size.

const ART_VIEWBOX = { width: 2945, height: 1362 };
const ART_SOURCE = { body: snakeBodyArt, head: snakeHeadArt };

export default function SnakeCheckMap({ selectedKey, onSelect, compact = false }) {
  const { t } = useTranslation();
  const [view, setView] = useState(() => getPreferredView(selectedKey) || 'body');
  // Only follow the selection when it actually changes, so a manual toggle is not undone by the
  // re-render it causes.
  const lastSelectionRef = useRef(selectedKey);

  useEffect(() => {
    if (selectedKey === lastSelectionRef.current) return;
    lastSelectionRef.current = selectedKey;
    const preferred = getPreferredView(selectedKey);
    if (preferred) setView(preferred);
  }, [selectedKey]);

  const visible = getChecksForView(view);
  const unmapped = CHECK_GUIDANCE.filter(entry => !entry.point);

  const views = [
    { key: 'body', label: t('quarantine.map.viewBody', { defaultValue: 'Whole body' }) },
    { key: 'head', label: t('quarantine.map.viewHead', { defaultValue: 'Head' }) },
  ];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
          {view === 'head'
            ? t('quarantine.map.headCaption', { defaultValue: 'Head, in profile' })
            : t('quarantine.map.bodyCaption', { defaultValue: 'Whole animal, from above' })}
        </span>
        <div className="flex gap-1">
          {views.map(option => (
            <button
              key={option.key}
              type="button"
              aria-pressed={view === option.key}
              className={`rounded-lg border px-2 py-0.5 text-[10px] font-medium ${
                view === option.key ? 'border-sky-500 bg-sky-500 text-white' : 'bg-white text-neutral-600'
              }`}
              onClick={() => setView(option.key)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="relative w-full" style={{ aspectRatio: `${ART_VIEWBOX.width} / ${ART_VIEWBOX.height}` }}>
        <img
          src={ART_SOURCE[view]}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-contain select-none"
          draggable="false"
        />
        <svg
          viewBox={`0 0 ${ART_VIEWBOX.width} ${ART_VIEWBOX.height}`}
          className="absolute inset-0 h-full w-full"
          role="group"
          aria-label={t('quarantine.map.aria', { defaultValue: 'Snake diagram with check points' })}
        >
          {visible.map(entry => {
            const spot = entry.point[view];
            const [ax, ay] = spot.at;
            const [lx, ly] = spot.label;
            const active = selectedKey === entry.key;
            return (
              <g key={entry.key}>
                <line
                  x1={ax}
                  y1={ay}
                  x2={lx}
                  y2={ly}
                  stroke={active ? '#0369a1' : '#78716c'}
                  strokeWidth={active ? 9 : 6}
                  opacity={active ? 1 : 0.7}
                />
                <circle cx={ax} cy={ay} r="15" fill={active ? '#0369a1' : '#57534e'} />
                <g
                  role="button"
                  tabIndex={0}
                  aria-label={entry.title}
                  aria-pressed={active}
                  className="cursor-pointer"
                  onClick={() => onSelect?.(entry.key)}
                  onKeyDown={event => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onSelect?.(entry.key);
                    }
                  }}
                >
                  {/* Generous invisible hit area — these get tapped with a thumb. */}
                  <circle cx={lx} cy={ly} r="105" fill="transparent" />
                  <circle
                    cx={lx}
                    cy={ly}
                    r="62"
                    fill={active ? '#0ea5e9' : '#ffffff'}
                    stroke={active ? '#0369a1' : '#57534e'}
                    strokeWidth="10"
                  />
                  <text
                    x={lx}
                    y={ly + 22}
                    textAnchor="middle"
                    fontSize="64"
                    fontWeight="700"
                    fill={active ? '#ffffff' : '#44403c'}
                    style={{ pointerEvents: 'none' }}
                  >
                    {entry.point.n}
                  </text>
                </g>
              </g>
            );
          })}
        </svg>
      </div>

      {!compact ? (
        <div className="flex flex-wrap gap-1.5">
          {CHECK_GUIDANCE.filter(entry => entry.point).map(entry => (
            <button
              key={entry.key}
              type="button"
              aria-pressed={selectedKey === entry.key}
              className={`rounded-xl border px-2.5 py-1 text-[11px] font-medium ${
                selectedKey === entry.key ? 'border-sky-500 bg-sky-500 text-white' : 'bg-white text-neutral-600'
              }`}
              onClick={() => onSelect?.(entry.key)}
            >
              <span className="tabular-nums opacity-70">{entry.point.n}</span> {entry.title}
            </button>
          ))}
          {unmapped.map(entry => (
            <button
              key={entry.key}
              type="button"
              aria-pressed={selectedKey === entry.key}
              className={`rounded-xl border border-dashed px-2.5 py-1 text-[11px] font-medium ${
                selectedKey === entry.key ? 'border-sky-500 bg-sky-500 text-white' : 'bg-white text-neutral-600'
              }`}
              onClick={() => onSelect?.(entry.key)}
              title={t('quarantine.map.noPin', { defaultValue: 'Checked in the tub, not on the animal' })}
            >
              {entry.title}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
