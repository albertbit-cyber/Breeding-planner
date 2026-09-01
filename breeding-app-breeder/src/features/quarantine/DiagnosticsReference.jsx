import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DIAGNOSTIC_LABS,
  QUARANTINE_TESTS,
  SAMPLE_TYPES,
  TEST_TIERS,
  getLabsOfferingTest,
} from './diagnostics';
import { CHECK_GUIDANCE, getGuidance } from './checkGuidance';
import CheckDiagram from './CheckDiagrams';
import SnakeCheckMap from './SnakeCheckMap';
import { DISCLAIMER_LINE, translateTuple } from './labels';

// A reference shelf, not a shop. The app never recommends a test or quotes a price — it lists what
// exists, what each one actually rules in or out, and where samples can be sent, so a breeder can
// walk into a vet appointment knowing the vocabulary.

const TIER_ORDER = ['baseline', 'molecular', 'targeted'];

const TIER_CLASSES = {
  baseline: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  molecular: 'border-sky-200 bg-sky-50 text-sky-700',
  targeted: 'border-amber-200 bg-amber-50 text-amber-700',
};

function TestRow({ test, expanded, onToggle }) {
  const { t } = useTranslation();
  const labs = useMemo(() => getLabsOfferingTest(test.key), [test.key]);
  return (
    <div className="border-t border-neutral-100 first:border-t-0">
      <button
        type="button"
        className="w-full text-left px-3 py-2.5 flex items-start justify-between gap-3 hover:bg-neutral-50"
        aria-expanded={expanded}
        onClick={onToggle}
      >
        <span className="min-w-0">
          <span className="block text-sm font-medium text-neutral-900">{test.name}</span>
          <span className="block text-[11px] text-neutral-500 truncate">{test.detects}</span>
        </span>
        <span className="shrink-0 flex items-center gap-2">
          <span className="hidden sm:inline text-[11px] text-neutral-400">{test.turnaround}</span>
          <span aria-hidden="true" className="text-neutral-400 text-xs">{expanded ? '▲' : '▼'}</span>
        </span>
      </button>
      {expanded ? (
        <div className="px-3 pb-3 pt-0 grid gap-2 text-[11px] text-neutral-600">
          <div className="grid sm:grid-cols-3 gap-2">
            <div>
              <div className="font-semibold text-neutral-500 uppercase tracking-wide text-[10px]">
                {t('quarantine.diag.method', { defaultValue: 'Method' })}
              </div>
              <div>{test.method}</div>
            </div>
            <div>
              <div className="font-semibold text-neutral-500 uppercase tracking-wide text-[10px]">
                {t('quarantine.diag.sample', { defaultValue: 'Sample' })}
              </div>
              <div>{test.samples.map(key => SAMPLE_TYPES[key]).filter(Boolean).join(', ') || '—'}</div>
            </div>
            <div>
              <div className="font-semibold text-neutral-500 uppercase tracking-wide text-[10px]">
                {t('quarantine.diag.typicalTiming', { defaultValue: 'Typically run' })}
              </div>
              <div>{test.whenTypical}</div>
            </div>
          </div>
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-2 text-amber-900">
            <span className="font-semibold">{t('quarantine.diag.limitation', { defaultValue: 'Worth knowing' })}: </span>
            {test.limitation}
          </div>
          {labs.length ? (
            <div>
              <span className="font-semibold text-neutral-500 uppercase tracking-wide text-[10px]">
                {t('quarantine.diag.offeredBy', { defaultValue: 'Offered by' })}
              </span>
              <span className="block">{labs.map(lab => lab.name).join(' · ')}</span>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function BodyGuide() {
  const { t } = useTranslation();
  const [activeKey, setActiveKey] = useState(CHECK_GUIDANCE[0].key);
  const guidance = getGuidance(activeKey);

  return (
    <div className="p-3 flex flex-col gap-3">
      <p className="text-[11px] text-neutral-500">
        {t('quarantine.guide.mapIntro', {
          defaultValue: 'Tap a point on the animal to see how to check it and what normal looks like.',
        })}
      </p>
      <SnakeCheckMap selectedKey={activeKey} onSelect={setActiveKey} />

      {guidance ? (
        <div className="flex flex-col gap-3 rounded-xl border bg-neutral-50 p-3">
          <div>
            <h4 className="text-sm font-semibold">{guidance.title}</h4>
            <p className="mt-0.5 text-xs text-neutral-700">{guidance.lookFor}</p>
          </div>

          <CheckDiagram
            checkKey={activeKey}
            normalLabel={t('quarantine.guide.normal', { defaultValue: 'Normal' })}
            concerningLabel={t('quarantine.guide.concerning', { defaultValue: 'Worth acting on' })}
          />

          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 mb-1">
              {t('quarantine.guide.howTo', { defaultValue: 'How to check' })}
            </div>
            <ol className="list-decimal pl-4 flex flex-col gap-1 text-[11px] text-neutral-700">
              {guidance.howTo.map((step, index) => <li key={index}>{step}</li>)}
            </ol>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-2.5">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700 mb-0.5">
                {t('quarantine.guide.normal', { defaultValue: 'Normal' })}
              </div>
              <p className="text-[11px] text-emerald-900">{guidance.normal}</p>
            </div>
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-2.5">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-rose-700 mb-0.5">
                {t('quarantine.guide.concerning', { defaultValue: 'Worth acting on' })}
              </div>
              <p className="text-[11px] text-rose-900">{guidance.concerning}</p>
            </div>
          </div>

          {guidance.note ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-[11px] text-amber-900">{guidance.note}</p>
          ) : null}
        </div>
      ) : null}

      <p className="text-[10px] text-neutral-400">
        {t('quarantine.guide.schematic', { defaultValue: 'Drawings are schematic, not photographs.' })}{' '}
        {translateTuple(t, DISCLAIMER_LINE)}
      </p>
    </div>
  );
}

export default function DiagnosticsReference() {
  const { t } = useTranslation();
  const [view, setView] = useState('body');
  const [expandedKey, setExpandedKey] = useState(null);

  return (
    <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">
            {t('quarantine.diag.title', { defaultValue: 'What to check, tests & laboratories' })}
          </h3>
          <p className="text-[11px] text-neutral-500 mt-0.5 max-w-prose">
            {t('quarantine.diag.subtitle', {
              defaultValue: 'Reference only. Nothing here is medical advice — it is the vocabulary for a conversation with a reptile vet.',
            })}
          </p>
        </div>
        <div className="flex gap-1.5">
          {[
            { key: 'body', label: t('quarantine.diag.tabBody', { defaultValue: 'What to check' }) },
            { key: 'tests', label: t('quarantine.diag.tabTests', { defaultValue: 'Tests' }) },
            { key: 'labs', label: t('quarantine.diag.tabLabs', { defaultValue: 'Laboratories' }) },
          ].map(tab => (
            <button
              key={tab.key}
              type="button"
              aria-pressed={view === tab.key}
              className={`rounded-xl border px-3 py-1.5 text-xs font-medium ${
                view === tab.key ? 'border-sky-500 bg-sky-500 text-white' : 'bg-white text-neutral-600'
              }`}
              onClick={() => setView(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {view === 'body' ? <BodyGuide /> : null}

      {view === 'tests' ? (
        <div className="flex flex-col">
          {TIER_ORDER.map(tier => {
            const tests = QUARANTINE_TESTS.filter(test => test.tier === tier);
            if (!tests.length) return null;
            return (
              <div key={tier}>
                <div className="px-3 py-2 bg-neutral-50 border-y border-neutral-100 flex flex-wrap items-center gap-2">
                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${TIER_CLASSES[tier]}`}>
                    {TEST_TIERS[tier].label}
                  </span>
                  <span className="text-[11px] text-neutral-500">{TEST_TIERS[tier].note}</span>
                </div>
                {tests.map(test => (
                  <TestRow
                    key={test.key}
                    test={test}
                    expanded={expandedKey === test.key}
                    onToggle={() => setExpandedKey(prev => (prev === test.key ? null : test.key))}
                  />
                ))}
              </div>
            );
          })}
        </div>
      ) : null}

      {view === 'labs' ? (
        <div className="flex flex-col">
          {DIAGNOSTIC_LABS.map(lab => (
            <div key={lab.key} className="px-3 py-3 border-t border-neutral-100 first:border-t-0">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <a
                  href={lab.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-sm font-medium text-sky-700 hover:underline"
                >
                  {lab.name}
                </a>
                <span className="text-[11px] text-neutral-500">{lab.region}</span>
              </div>
              <p className="mt-1 text-[11px] text-neutral-600">{lab.note}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span
                  className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                    lab.direct
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-neutral-200 bg-neutral-50 text-neutral-600'
                  }`}
                >
                  {lab.direct
                    ? t('quarantine.diag.directOk', { defaultValue: 'Accepts keeper submissions' })
                    : t('quarantine.diag.viaVet', { defaultValue: 'Submit through a vet' })}
                </span>
              </div>
            </div>
          ))}
          <p className="px-3 py-3 text-[11px] text-neutral-500 border-t border-neutral-100">
            {t('quarantine.diag.labDisclaimer', {
              defaultValue: 'Not an exhaustive list and not an endorsement. Availability, sample requirements and shipping rules change — confirm with the laboratory before sending anything.',
            })}{' '}
            {translateTuple(t, DISCLAIMER_LINE)}
          </p>
        </div>
      ) : null}
    </div>
  );
}
