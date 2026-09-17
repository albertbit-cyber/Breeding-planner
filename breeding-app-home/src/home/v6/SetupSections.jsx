import React from 'react';
import {
  AGAINST,
  EXPORTS,
  FEATURES,
  ID_PREVIEW,
  ID_TOKENS,
  LANGUAGES,
  SETTINGS,
  SPECIES_CHIPS,
  STEPS,
} from './data.js';
import { SectionHead } from './ProductSections.jsx';
import { lookButtonStyles, useLook } from './useLook.js';

/* Sections № 07, № 09 and № 12, plus the species library and the full feature
 * inventory. The appearance blocks re-skin the page you are reading, which is
 * the point: both themes are real product settings. */

const TOKEN_COLUMNS = '.85fr 1.6fr';

function IdTokens() {
  return (
    <div
      className="v6-stack"
      style={{ '--gap': '10px', maxWidth: 680, borderTop: '1px solid var(--rule)', paddingTop: 18 }}
    >
      <span className="v6-label v6-label--tight">ID GENERATOR — BUILDING BLOCKS</span>
      {ID_TOKENS.map((t) => (
        <div
          key={t.token}
          style={{
            display: 'grid',
            gridTemplateColumns: TOKEN_COLUMNS,
            gap: 16,
            padding: '5px 0',
            borderBottom: '1px solid var(--rule)',
            alignItems: 'baseline',
          }}
        >
          <span className="v6-mono" style={{ fontSize: 10.5, color: 'var(--accent)' }}>
            {t.token}
          </span>
          <span style={{ fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.35 }}>{t.produces}</span>
        </div>
      ))}
      <div
        style={{ display: 'grid', gridTemplateColumns: TOKEN_COLUMNS, gap: 16, padding: '8px 0', alignItems: 'baseline' }}
      >
        <span className="v6-label" style={{ fontSize: 9, letterSpacing: '.16em' }}>
          PREVIEW
        </span>
        <span
          className="v6-mono"
          style={{
            fontSize: 12,
            letterSpacing: '.04em',
            background: 'var(--accent-quiet)',
            border: '1px solid var(--accent-strong)',
            borderRadius: 'var(--pill)',
            padding: '6px 12px',
            justifySelf: 'start',
            color: 'var(--accent)',
          }}
        >
          {ID_PREVIEW}
        </span>
      </div>
    </div>
  );
}

function ExportFormats() {
  return (
    <div className="v6-stack" style={{ '--gap': '10px', borderTop: '1px solid var(--rule)', paddingTop: 18 }}>
      <span className="v6-label v6-label--tight">EXPORT FORMATS</span>
      <div className="v6-grid" style={{ '--min': '220px', '--gap': '12px' }}>
        {EXPORTS.map((e) => (
          <div
            key={e.name}
            className="v6-stack"
            style={{
              '--gap': '6px',
              border: '1px solid var(--rule)',
              borderRadius: 'var(--r-sm)',
              padding: '14px 16px',
            }}
          >
            <span
              style={{ fontFamily: 'var(--display)', fontWeight: 'var(--dwb)', fontSize: 20, lineHeight: 1.1 }}
            >
              {e.name}
            </span>
            <span style={{ fontSize: 14.5, color: 'var(--ink-2)', lineHeight: 1.45 }}>{e.body}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** The two skins as swatch buttons, shown inside Settings § 06. */
function SkinPicker() {
  const { isLight, setDark, setLight } = useLook();
  const styles = lookButtonStyles(isLight);

  const swatch = (bands) => (
    <span
      style={{
        display: 'flex',
        height: 30,
        width: 70,
        borderRadius: 8,
        overflow: 'hidden',
        border: '1px solid var(--rule-strong)',
      }}
    >
      {bands.map(([flex, background]) => (
        <span key={background} style={{ flex, background }} />
      ))}
    </span>
  );

  const button = (onClick, style, bands, name, kind) => (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={kind === 'LIGHT' ? isLight : !isLight}
      style={{
        border: '1px solid',
        borderRadius: 'var(--r-sm)',
        padding: '14px 18px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        textAlign: 'left',
        ...style,
      }}
    >
      {swatch(bands)}
      <span className="v6-stack" style={{ '--gap': '2px' }}>
        <span style={{ fontFamily: 'var(--display)', fontWeight: 'var(--dwb)', fontSize: 17 }}>{name}</span>
        <span className="v6-mono" style={{ fontSize: 9.5, letterSpacing: '.12em' }}>
          {kind}
        </span>
      </span>
    </button>
  );

  return (
    <div className="v6-stack" style={{ '--gap': '12px', borderTop: '1px solid var(--rule)', paddingTop: 18 }}>
      <div className="v6-split" style={{ gap: 14 }}>
        <span className="v6-label v6-label--tight">TWO OF SIXTEEN SKINS — LIVE ON THIS PAGE</span>
        <span style={{ fontSize: 15, color: 'var(--ink-3)' }}>
          Pick one. The site you are reading re-skins with it.
        </span>
      </div>
      <div className="v6-cluster">
        {button(
          setDark,
          styles.dark,
          [
            [1.4, '#04100e'],
            [1, '#0d3d33'],
            [0.8, '#38e8a0'],
            [0.5, '#4cc9f0'],
          ],
          'Jungle Glass',
          'DARK'
        )}
        {button(
          setLight,
          styles.light,
          [
            [1.4, '#fffaf0'],
            [1, '#f2ecff'],
            [0.8, '#6c4cf5'],
            [0.5, '#c6f24e'],
          ],
          'Hatchling',
          'LIGHT'
        )}
      </div>
      <span className="v6-note">
        A preset carries colour, type and geometry together here; in the app they are separate
        settings, so switching never moves the layout. Your choice is remembered on this device.
      </span>
    </div>
  );
}

function Languages() {
  return (
    <div className="v6-stack" style={{ '--gap': '12px', borderTop: '1px solid var(--rule)', paddingTop: 18 }}>
      <span className="v6-label v6-label--tight">TEN LANGUAGES, INCLUDING RIGHT-TO-LEFT</span>
      <div className="v6-cluster" style={{ '--gap': '8px' }}>
        {LANGUAGES.map((l) => (
          <span key={l} className="v6-chip">
            {l}
          </span>
        ))}
      </div>
      <span className="v6-note">
        One exception, stated plainly: the Quarantine section is wired for translation but its
        strings aren’t translated yet.
      </span>
    </div>
  );
}

function Settings() {
  return (
    <section id="setup" className="v6-wrap v6-section">
      <SectionHead
        eyebrow="№ 07 · Settings & setup"
        title="Settings that do the work for you."
        aside={
          <>
            Settings is where the app learns how <em>you</em> run your collection — your identity,
            your naming conventions, your morph vocabulary — and applies it automatically everywhere
            else.
          </>
        }
      />

      <div className="v6-stack" style={{ '--gap': '16px' }}>
        {SETTINGS.map((s) => (
          <div key={s.n} className="v6-panel v6-panel--lg v6-stack" style={{ '--gap': '22px' }}>
            <div className="v6-grid" style={{ '--min': '280px', '--gap': '24px', alignItems: 'start' }}>
              <div className="v6-stack" style={{ '--gap': '8px' }}>
                <span className="v6-label v6-label--tight v6-label--accent" style={{ letterSpacing: '.14em' }}>
                  {s.n}
                </span>
                <span
                  style={{
                    fontFamily: 'var(--display)',
                    fontWeight: 'var(--dwb)',
                    fontSize: 28,
                    lineHeight: 1.08,
                    letterSpacing: 'var(--tight)',
                  }}
                >
                  {s.title}
                </span>
                <span style={{ fontSize: 16, lineHeight: 1.45, color: 'var(--ink-3)' }}>{s.kicker}</span>
              </div>
              <div className="v6-stack" style={{ '--gap': '10px' }}>
                <span style={{ fontSize: 16.5, lineHeight: 1.6, color: 'var(--ink-2)' }}>{s.body}</span>
                <span className="v6-angle">{s.angle}</span>
              </div>
            </div>

            {s.showTokens && <IdTokens />}
            {s.showExports && <ExportFormats />}
            {s.showAppearance && <SkinPicker />}
            {s.showLanguages && <Languages />}
          </div>
        ))}
      </div>
    </section>
  );
}

function Appearance() {
  const { isLight, lookName, setDark, setLight } = useLook();
  const styles = lookButtonStyles(isLight);

  return (
    <section id="appearance" className="v6-wrap v6-section">
      <div
        style={{
          background: 'var(--band)',
          border: 'var(--border)',
          borderRadius: 'var(--r-lg)',
          padding: 36,
          boxShadow: 'var(--shadow)',
        }}
      >
        <div className="v6-grid" style={{ '--min': '300px', '--gap': '36px', alignItems: 'center' }}>
          <div className="v6-stack" style={{ '--gap': '15px' }}>
            <span className="v6-eyebrow">№ 12 · Appearance</span>
            <h2 className="v6-h2" style={{ fontSize: 'clamp(32px, 4vw, 42px)' }}>
              The app should look the way you want
            </h2>
            <p className="v6-copy" style={{ fontSize: 17.5, lineHeight: 1.65, maxWidth: '46ch' }}>
              Light or dark, six typefaces, four text sizes, three densities and three border styles
              — plus direct control over primary, accent, background, card and text colours, a
              reduced-motion toggle and a visually-impaired preset. Save your own combinations as
              named presets.
            </p>
            <p className="v6-note" style={{ fontSize: 16, lineHeight: 1.6, maxWidth: '46ch' }}>
              This whole page runs on the same two themes. Switch it and see.
            </p>
            <div className="v6-cluster">
              <button
                type="button"
                onClick={setDark}
                aria-pressed={!isLight}
                className="v6-btn v6-btn--sm"
                style={{ border: '1px solid', backdropFilter: 'none', ...styles.dark }}
              >
                Jungle Glass · dark
              </button>
              <button
                type="button"
                onClick={setLight}
                aria-pressed={isLight}
                className="v6-btn v6-btn--sm"
                style={{ border: '1px solid', backdropFilter: 'none', ...styles.light }}
              >
                Hatchling · light
              </button>
            </div>
          </div>

          <div className="v6-panel v6-stack" style={{ '--gap': '14px', padding: 20 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                borderBottom: '1px solid var(--rule)',
                paddingBottom: 12,
              }}
            >
              <span className="v6-label v6-label--tight">SETTINGS · APPEARANCE</span>
              <span className="v6-mono" style={{ fontSize: 10.5, color: 'var(--accent)' }}>
                {lookName}
              </span>
            </div>

            <div className="v6-stack" style={{ '--gap': '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 15.5, color: 'var(--ink-2)' }}>Theme</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <span className="v6-chip v6-chip--on" style={{ fontSize: 10, padding: '5px 10px' }}>
                    {lookName}
                  </span>
                  <span
                    className="v6-chip v6-chip--quiet"
                    style={{ fontSize: 10, padding: '5px 10px', color: 'var(--ink-3)' }}
                  >
                    System
                  </span>
                </div>
              </div>
              {[
                ['Text size', 'Comfortable', 'var(--ink)'],
                ['Density', 'Regular', 'var(--ink)'],
                ['Reduced motion', 'Off', 'var(--ink-3)'],
              ].map(([label, value, color]) => (
                <div
                  key={label}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}
                >
                  <span style={{ fontSize: 15.5, color: 'var(--ink-2)' }}>{label}</span>
                  <span className="v6-mono" style={{ color }}>
                    {value}
                  </span>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 9, borderTop: '1px solid var(--rule)', paddingTop: 14 }}>
              {[
                ['PRIMARY', { background: 'var(--cta-bg)' }],
                ['ACCENT', { background: 'var(--accent-quiet)', border: '1px solid var(--accent-strong)' }],
                ['SURFACE', { background: 'var(--panel-2)', border: '1px solid var(--rule-strong)' }],
              ].map(([label, style]) => (
                <div key={label} className="v6-stack" style={{ '--gap': '6px', flex: 1 }}>
                  <div style={{ height: 34, borderRadius: 'var(--r-sm)', ...style }} />
                  <span
                    className="v6-mono"
                    style={{ fontSize: 9.5, color: 'var(--ink-2)', letterSpacing: '.1em' }}
                  >
                    {label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function SpeciesLibrary() {
  return (
    <section className="v6-wrap v6-section v6-stack" style={{ '--gap': '20px' }}>
      <div className="v6-split" style={{ alignItems: 'flex-end', gap: 14 }}>
        <h2 className="v6-h2" style={{ fontSize: 'clamp(32px, 4vw, 42px)' }}>
          Knowledge that travels with the animal
        </h2>
        <span className="v6-eyebrow" style={{ letterSpacing: '.16em' }}>
          Species library
        </span>
      </div>
      <div className="v6-cluster" style={{ '--gap': '11px' }}>
        {SPECIES_CHIPS.map((s, i) => (
          <span key={s} className={`v6-chip v6-chip--lg${i === 0 ? ' v6-chip--on' : ''}`}>
            {s}
          </span>
        ))}
        <span className="v6-chip v6-chip--lg v6-chip--dashed">+ 15 more</span>
      </div>
    </section>
  );
}

function FeatureInventory() {
  return (
    <section id="features" className="v6-wrap v6-section">
      <div className="v6-split" style={{ alignItems: 'flex-end', gap: 14, marginBottom: 22 }}>
        <h2 className="v6-h2" style={{ fontSize: 'clamp(32px, 4vw, 42px)' }}>
          Everything in the box
        </h2>
        <span className="v6-eyebrow" style={{ letterSpacing: '.16em' }}>
          Feature inventory
        </span>
      </div>
      <div className="v6-grid" style={{ '--min': '250px' }}>
        {FEATURES.map((f) => (
          <div key={f.n} className="v6-panel v6-stack" style={{ '--gap': '7px', padding: 20 }}>
            <span className="v6-label v6-label--tight v6-label--accent" style={{ letterSpacing: '.14em' }}>
              {f.n}
            </span>
            <span
              style={{ fontFamily: 'var(--display)', fontWeight: 'var(--dwb)', fontSize: 20, lineHeight: 1.15 }}
            >
              {f.title}
            </span>
            <span style={{ fontSize: 15.5, lineHeight: 1.5, color: 'var(--ink-2)' }}>{f.body}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section id="how" className="v6-wrap v6-section">
      <SectionHead
        eyebrow="№ 09 · How it works"
        title="Up and running in minutes."
        aside="Then three things a spreadsheet will never do for you."
      />

      <div className="v6-grid" style={{ '--min': '260px', marginBottom: 22 }}>
        {STEPS.map((s) => (
          <div key={s.n} className="v6-panel v6-stack" style={{ '--gap': '10px' }}>
            <span className="v6-figure" style={{ fontSize: 40, lineHeight: 1 }}>
              {s.n}
            </span>
            <span
              style={{ fontFamily: 'var(--display)', fontWeight: 'var(--dwb)', fontSize: 22, lineHeight: 1.1 }}
            >
              {s.title}
            </span>
            <span style={{ fontSize: 15.5, lineHeight: 1.55, color: 'var(--ink-2)' }}>{s.body}</span>
          </div>
        ))}
      </div>

      <div className="v6-grid" style={{ '--min': '260px' }}>
        {AGAINST.map((a) => (
          <div key={a} style={{ borderLeft: '3px solid var(--accent-strong)', padding: '6px 0 6px 18px' }}>
            <span
              style={{ fontFamily: 'var(--display)', fontWeight: 'var(--dw)', fontSize: 21, lineHeight: 1.3 }}
            >
              {a}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function SetupSections() {
  return (
    <>
      <Settings />
      <Appearance />
      <SpeciesLibrary />
      <FeatureInventory />
      <HowItWorks />
    </>
  );
}
