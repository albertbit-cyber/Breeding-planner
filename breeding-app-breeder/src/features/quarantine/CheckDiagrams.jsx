import React from 'react';

// Schematic drawings, deliberately not photographs. A diagram can exaggerate the one feature that
// matters — a sunken eye, a spinal ridge — in a way a photograph of one particular snake never
// does, and it costs nothing to ship and reads correctly at any size.
//
// Every pair is drawn on the same 120x84 grid so the good and bad versions line up exactly and the
// difference between them is the only thing that moves.

const OK = '#059669';
const BAD = '#dc2626';
const LINE = '#57534e';
const FILL = '#f5f5f4';
const SKIN = '#e7e5e4';

function Frame({ children, title }) {
  return (
    <svg viewBox="0 0 120 84" className="w-full h-auto" role="img" aria-label={title}>
      <title>{title}</title>
      {children}
    </svg>
  );
}

/** Head in profile, reused by the eye, mite and breathing diagrams so they read as one animal. */
function HeadProfile({ children }) {
  return (
    <>
      <path
        d="M12 46 C 18 30, 44 24, 68 28 C 92 32, 108 40, 112 50 C 108 60, 92 66, 68 66 C 44 66, 18 60, 12 46 Z"
        fill={FILL}
        stroke={LINE}
        strokeWidth="1.6"
      />
      <path d="M18 52 C 40 60, 78 62, 108 54" fill="none" stroke={LINE} strokeWidth="0.9" opacity="0.5" />
      {children}
    </>
  );
}

function Label({ x, y, tone, children, anchor = 'middle' }) {
  return (
    <text x={x} y={y} textAnchor={anchor} fontSize="7.5" fontWeight="600" fill={tone}>
      {children}
    </text>
  );
}

const DIAGRAMS = {
  eyes: {
    normal: (
      <HeadProfile>
        <circle cx="42" cy="44" r="9" fill="#fff" stroke={LINE} strokeWidth="1.4" />
        <circle cx="42" cy="44" r="4" fill={LINE} />
        <circle cx="39" cy="41" r="1.8" fill="#fff" />
        <Label x="42" y="76" tone={OK}>Full, clear, round</Label>
      </HeadProfile>
    ),
    concerning: (
      <HeadProfile>
        <circle cx="42" cy="44" r="9" fill="#e7e5e4" stroke={LINE} strokeWidth="1.4" />
        <circle cx="42" cy="44" r="6.5" fill="#d6d3d1" />
        <path d="M34 38 C 38 41, 46 41, 50 38" fill="none" stroke={BAD} strokeWidth="1.1" />
        <path d="M34 50 C 38 47, 46 47, 50 50" fill="none" stroke={BAD} strokeWidth="1.1" />
        <Label x="42" y="76" tone={BAD}>Sunken, wrinkled, cloudy</Label>
      </HeadProfile>
    ),
  },

  mites: {
    normal: (
      <HeadProfile>
        <circle cx="42" cy="44" r="9" fill="#fff" stroke={LINE} strokeWidth="1.4" />
        <circle cx="42" cy="44" r="4" fill={LINE} />
        {[0, 1, 2].map(row => (
          <path
            key={row}
            d={`M62 ${36 + row * 8} C 76 ${34 + row * 8}, 92 ${36 + row * 8}, 104 ${40 + row * 8}`}
            fill="none"
            stroke={LINE}
            strokeWidth="0.8"
            opacity="0.45"
          />
        ))}
        <Label x="60" y="76" tone={OK}>Clean scale seams</Label>
      </HeadProfile>
    ),
    concerning: (
      <HeadProfile>
        <circle cx="42" cy="44" r="9" fill="#fff" stroke={LINE} strokeWidth="1.4" />
        <circle cx="42" cy="44" r="4" fill={LINE} />
        {[0, 1, 2].map(row => (
          <path
            key={row}
            d={`M62 ${36 + row * 8} C 76 ${34 + row * 8}, 92 ${36 + row * 8}, 104 ${40 + row * 8}`}
            fill="none"
            stroke={LINE}
            strokeWidth="0.8"
            opacity="0.45"
          />
        ))}
        {[[35, 36], [49, 37], [51, 51], [34, 50], [42, 34], [70, 39], [84, 44], [95, 49], [76, 52], [90, 56]].map(([cx, cy], index) => (
          <circle key={index} cx={cx} cy={cy} r="1.7" fill={BAD} />
        ))}
        <circle cx="42" cy="44" r="12" fill="none" stroke={BAD} strokeWidth="1" strokeDasharray="2 2" />
        <Label x="60" y="76" tone={BAD}>Specks at eye rim and seams</Label>
      </HeadProfile>
    ),
  },

  breathing: {
    normal: (
      <HeadProfile>
        <circle cx="42" cy="42" r="7" fill="#fff" stroke={LINE} strokeWidth="1.3" />
        <circle cx="42" cy="42" r="3" fill={LINE} />
        <path d="M14 50 C 40 58, 80 60, 110 52" fill="none" stroke={LINE} strokeWidth="1.5" />
        <circle cx="18" cy="43" r="1.4" fill={LINE} />
        <Label x="60" y="76" tone={OK}>Mouth closed, silent</Label>
      </HeadProfile>
    ),
    concerning: (
      <>
        <path
          d="M12 44 C 18 30, 44 24, 68 28 C 92 32, 108 38, 112 46 L 60 50 C 40 50, 20 48, 12 44 Z"
          fill={FILL}
          stroke={LINE}
          strokeWidth="1.6"
        />
        <path
          d="M14 54 C 24 62, 50 68, 74 68 C 94 68, 108 62, 112 56 L 60 52 C 40 52, 22 52, 14 54 Z"
          fill={FILL}
          stroke={LINE}
          strokeWidth="1.6"
        />
        <circle cx="42" cy="38" r="6" fill="#fff" stroke={LINE} strokeWidth="1.2" />
        <circle cx="42" cy="38" r="2.6" fill={LINE} />
        <circle cx="17" cy="41" r="3.4" fill="none" stroke={BAD} strokeWidth="1.3" />
        <circle cx="21" cy="36" r="2.2" fill="none" stroke={BAD} strokeWidth="1.1" />
        <Label x="60" y="80" tone={BAD}>Gaping, bubbles at nostril</Label>
      </>
    ),
  },

  condition: {
    normal: (
      <>
        <ellipse cx="60" cy="42" rx="30" ry="24" fill={SKIN} stroke={LINE} strokeWidth="1.6" />
        <path d="M60 18 L 60 24" stroke={LINE} strokeWidth="1.4" />
        <path d="M40 60 C 50 66, 70 66, 80 60" fill="none" stroke={LINE} strokeWidth="0.9" opacity="0.5" />
        <Label x="60" y="78" tone={OK}>Rounded in section</Label>
      </>
    ),
    concerning: (
      <>
        <path d="M60 16 C 78 34, 88 52, 84 62 C 72 68, 48 68, 36 62 C 32 52, 42 34, 60 16 Z" fill={SKIN} stroke={LINE} strokeWidth="1.6" />
        <path d="M60 16 L 60 26" stroke={BAD} strokeWidth="2" />
        <path d="M50 22 L 60 14 L 70 22" fill="none" stroke={BAD} strokeWidth="1.4" />
        <Label x="60" y="78" tone={BAD}>Spine ridged, triangular</Label>
      </>
    ),
  },

  vent: {
    normal: (
      <>
        <path d="M8 30 C 40 22, 80 22, 112 30 L 112 54 C 80 62, 40 62, 8 54 Z" fill={FILL} stroke={LINE} strokeWidth="1.5" />
        {[0, 1, 2, 3, 4, 5].map(index => (
          <path key={index} d={`M${18 + index * 16} 26 C ${20 + index * 16} 40, ${20 + index * 16} 44, ${18 + index * 16} 58`} stroke={LINE} strokeWidth="0.7" opacity="0.4" fill="none" />
        ))}
        <path d="M46 42 L 74 42" stroke={LINE} strokeWidth="2.2" strokeLinecap="round" />
        <Label x="60" y="76" tone={OK}>Flat, clean, closed</Label>
      </>
    ),
    concerning: (
      <>
        <path d="M8 30 C 40 22, 80 22, 112 30 L 112 54 C 80 62, 40 62, 8 54 Z" fill={FILL} stroke={LINE} strokeWidth="1.5" />
        <ellipse cx="60" cy="42" rx="20" ry="12" fill="#fecaca" stroke={BAD} strokeWidth="1.3" />
        <path d="M48 42 C 54 38, 66 46, 72 42" stroke={BAD} strokeWidth="2.2" strokeLinecap="round" fill="none" />
        <path d="M78 48 C 86 52, 94 50, 100 54" stroke="#a16207" strokeWidth="1.6" strokeLinecap="round" fill="none" />
        <Label x="60" y="76" tone={BAD}>Swollen, smeared</Label>
      </>
    ),
  },

  skin: {
    normal: (
      <>
        <rect x="10" y="22" width="100" height="40" rx="6" fill={FILL} stroke={LINE} strokeWidth="1.4" />
        {[0, 1, 2, 3].map(row => (
          <path
            key={row}
            d={`M12 ${28 + row * 10} C 40 ${24 + row * 10}, 80 ${32 + row * 10}, 108 ${28 + row * 10}`}
            fill="none"
            stroke={LINE}
            strokeWidth="0.8"
            opacity="0.45"
          />
        ))}
        <Label x="60" y="76" tone={OK}>Even, intact scales</Label>
      </>
    ),
    concerning: (
      <>
        <rect x="10" y="22" width="100" height="40" rx="6" fill={FILL} stroke={LINE} strokeWidth="1.4" />
        {[0, 1, 2, 3].map(row => (
          <path
            key={row}
            d={`M12 ${28 + row * 10} C 40 ${24 + row * 10}, 80 ${32 + row * 10}, 108 ${28 + row * 10}`}
            fill="none"
            stroke={LINE}
            strokeWidth="0.8"
            opacity="0.45"
          />
        ))}
        <path d="M26 30 C 40 26, 48 40, 38 50 C 28 54, 20 44, 26 30 Z" fill="#fde68a" stroke="#a16207" strokeWidth="1.2" />
        <ellipse cx="80" cy="42" rx="11" ry="8" fill="#fecaca" stroke={BAD} strokeWidth="1.3" />
        <ellipse cx="80" cy="42" rx="4.5" ry="3" fill={BAD} opacity="0.55" />
        <Label x="60" y="76" tone={BAD}>Retained shed, lesion</Label>
      </>
    ),
  },

  shed: {
    normal: (
      <>
        <path d="M14 54 C 30 26, 56 66, 74 38 C 86 20, 100 30, 108 26" fill="none" stroke={LINE} strokeWidth="7" strokeLinecap="round" opacity="0.35" />
        <path d="M14 54 C 30 26, 56 66, 74 38 C 86 20, 100 30, 108 26" fill="none" stroke={LINE} strokeWidth="1" strokeDasharray="3 2" />
        <circle cx="18" cy="50" r="3.2" fill="none" stroke={OK} strokeWidth="1.3" />
        <circle cx="25" cy="45" r="3.2" fill="none" stroke={OK} strokeWidth="1.3" />
        <Label x="60" y="76" tone={OK}>One piece, both eye caps</Label>
      </>
    ),
    concerning: (
      <>
        <path d="M14 54 C 24 36, 34 44, 40 40" fill="none" stroke={LINE} strokeWidth="7" strokeLinecap="round" opacity="0.35" />
        <path d="M52 52 C 60 40, 66 50, 72 42" fill="none" stroke={LINE} strokeWidth="7" strokeLinecap="round" opacity="0.35" />
        <path d="M84 40 C 92 30, 100 34, 106 28" fill="none" stroke={LINE} strokeWidth="7" strokeLinecap="round" opacity="0.35" />
        <path d="M100 30 L 108 24" stroke={BAD} strokeWidth="2.4" strokeLinecap="round" />
        <path d="M42 30 L 50 22 M 50 30 L 42 22" stroke={BAD} strokeWidth="1.6" strokeLinecap="round" />
        <Label x="60" y="76" tone={BAD}>Fragments, caps retained</Label>
      </>
    ),
  },

  stool: {
    normal: (
      <>
        <ellipse cx="44" cy="46" rx="18" ry="11" fill="#78716c" stroke={LINE} strokeWidth="1.3" />
        <ellipse cx="78" cy="44" rx="12" ry="9" fill="#fafaf9" stroke={LINE} strokeWidth="1.3" />
        <Label x="44" y="70" tone={OK}>Formed</Label>
        <Label x="78" y="70" tone={OK}>Firm urate</Label>
      </>
    ),
    concerning: (
      <>
        <path d="M22 50 C 34 38, 48 56, 62 46 C 72 40, 80 52, 92 46 C 96 50, 88 58, 74 58 C 54 60, 30 60, 22 50 Z" fill="#a8a29e" stroke={BAD} strokeWidth="1.3" />
        <ellipse cx="84" cy="34" rx="9" ry="6" fill="#fef08a" stroke="#a16207" strokeWidth="1.2" />
        <Label x="56" y="72" tone={BAD}>Watery, yellow urate</Label>
      </>
    ),
  },
};

export function hasDiagram(key) {
  return Boolean(DIAGRAMS[key]);
}

/** Side-by-side comparison. The whole point is that the two frames differ in exactly one way. */
export default function CheckDiagram({ checkKey, normalLabel = 'Normal', concerningLabel = 'Worth acting on' }) {
  const pair = DIAGRAMS[checkKey];
  if (!pair) return null;
  return (
    <div className="grid grid-cols-2 gap-2">
      <figure className="m-0 rounded-xl border border-emerald-200 bg-emerald-50/40 p-2">
        <figcaption className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">{normalLabel}</figcaption>
        <Frame title={`${checkKey} — ${normalLabel}`}>{pair.normal}</Frame>
      </figure>
      <figure className="m-0 rounded-xl border border-rose-200 bg-rose-50/40 p-2">
        <figcaption className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-rose-700">{concerningLabel}</figcaption>
        <Frame title={`${checkKey} — ${concerningLabel}`}>{pair.concerning}</Frame>
      </figure>
    </div>
  );
}
