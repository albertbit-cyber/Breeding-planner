/** Breeder-chosen review settings per species, with per-female overrides. No default size is suggested. */
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { normalizeBreedingSettings } from '../domain/reviewRules';
import { animalLabel } from './format';

const inputClass = 'border rounded-lg px-2 py-1 text-xs w-24 bg-white';

function RuleFields({ rule = {}, onChange, allowPause = true }) {
  const { t } = useTranslation();
  const set = (key, value) => onChange({ ...rule, [key]: value === '' ? null : value });
  return (
    <div className="flex flex-wrap items-end gap-2 text-xs">
      <label className="flex flex-col gap-0.5"><span className="text-[10px] text-neutral-500">{t('breeding.settings.rangeMin', { defaultValue: 'Review range from (mm)' })}</span><input type="number" min="1" step="0.5" className={inputClass} value={rule.reviewRangeMinMm ?? ''} onChange={(e) => set('reviewRangeMinMm', e.target.value)} /></label>
      <label className="flex flex-col gap-0.5"><span className="text-[10px] text-neutral-500">{t('breeding.settings.rangeMax', { defaultValue: 'to (mm)' })}</span><input type="number" min="1" step="0.5" className={inputClass} value={rule.reviewRangeMaxMm ?? ''} onChange={(e) => set('reviewRangeMaxMm', e.target.value)} /></label>
      <label className="flex flex-col gap-0.5"><span className="text-[10px] text-neutral-500">{t('breeding.settings.scanDays', { defaultValue: 'Scan reminder every (days)' })}</span><input type="number" min="1" step="1" className={inputClass} value={rule.scanReminderDays ?? ''} onChange={(e) => set('scanReminderDays', e.target.value)} /></label>
      {allowPause ? <label className="inline-flex items-center gap-1 pb-1"><input type="checkbox" checked={!!rule.pauseAutomaticReminders} onChange={(e) => set('pauseAutomaticReminders', e.target.checked)} />{t('breeding.settings.pause', { defaultValue: 'Pause scan reminders' })}</label> : null}
    </div>
  );
}

export function BreedingSettingsPanel({ settings, onChange, speciesOptions = [], females = [] }) {
  const { t } = useTranslation();
  const normalized = normalizeBreedingSettings(settings);
  const [femaleId, setFemaleId] = useState('');
  const update = (fn) => onChange((prev) => fn(normalizeBreedingSettings(prev)));
  return (
    <details className="rounded-xl border bg-white">
      <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-neutral-700">{t('breeding.settings.title', { defaultValue: 'Review settings (follicle ranges, scan reminders, forecast threshold)' })}</summary>
      <div className="px-3 pb-3 space-y-3 text-xs">
        <p className="text-neutral-600">{t('breeding.settings.intro', { defaultValue: 'Nothing here is preset. A range you enter turns into a review prompt when a measured ultrasound diameter falls inside it; it is never an automatic decision to pair. Ball python settings stay separate from other species.' })}</p>
        <div className="space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">{t('breeding.settings.bySpecies', { defaultValue: 'Per species' })}</div>
          {speciesOptions.map((species) => (
            <div key={species.id} className="rounded-lg border bg-neutral-50 px-2 py-1.5">
              <div className="font-medium mb-1">{species.name}</div>
              <RuleFields rule={normalized.bySpecies[species.id]} onChange={(rule) => update((prev) => ({ ...prev, bySpecies: { ...prev.bySpecies, [species.id]: rule } }))} />
            </div>
          ))}
        </div>
        <div className="space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">{t('breeding.settings.byFemale', { defaultValue: 'Individual override' })}</div>
          <select className="border rounded-lg px-2 py-1 text-xs bg-white" value={femaleId} onChange={(e) => setFemaleId(e.target.value)} aria-label={t('breeding.field.female', { defaultValue: 'Female' })}>
            <option value="">{t('breeding.field.chooseFemale', { defaultValue: 'Choose a female' })}</option>
            {females.map((f) => <option key={f.id} value={f.id}>{animalLabel(f)}</option>)}
          </select>
          {femaleId ? <RuleFields rule={normalized.byFemale[femaleId]} onChange={(rule) => update((prev) => ({ ...prev, byFemale: { ...prev.byFemale, [femaleId]: rule } }))} /> : null}
          {Object.keys(normalized.byFemale).length ? <div className="text-neutral-500">{t('breeding.settings.overridesCount', { defaultValue: '{{count}} female(s) have overrides.', count: Object.keys(normalized.byFemale).length })}</div> : null}
        </div>
        <label className="flex flex-wrap items-center gap-2">
          <span>{t('breeding.settings.minCycles', { defaultValue: 'Call a history window a forecast from this many completed cycles' })}</span>
          <input type="number" min="1" step="1" className={inputClass} value={normalized.minCyclesForForecast} onChange={(e) => update((prev) => ({ ...prev, minCyclesForForecast: Number(e.target.value) || 3 }))} />
        </label>
        <p className="text-neutral-500">{t('breeding.settings.minCyclesHint', { defaultValue: 'Fewer cycles are shown as descriptive history. The threshold is an implementation choice, not a biological validation.' })}</p>
      </div>
    </details>
  );
}
