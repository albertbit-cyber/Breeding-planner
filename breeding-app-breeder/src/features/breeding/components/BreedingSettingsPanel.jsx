/** Breeder-chosen review settings per species, with per-female overrides. No default size is suggested. */
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { normalizeBreedingSettings } from '../domain/reviewRules';
import { animalLabel } from './format';
import { help } from '../../help/help';

const inputClass = 'border rounded-lg px-2 py-1 text-xs w-24 bg-white';

function RuleFields({ rule = {}, onChange, allowPause = true }) {
  const { t } = useTranslation();
  const set = (key, value) => onChange({ ...rule, [key]: value === '' ? null : value });
  return (
    <div className="flex flex-wrap items-end gap-2 text-xs">
      <label {...help('settings-review-range')} className="flex flex-col gap-0.5"><span className="text-[10px] text-neutral-500">{t('breeding.settings.rangeMin', { defaultValue: 'Review range from (mm)' })}</span><input type="number" min="1" step="0.5" className={inputClass} value={rule.reviewRangeMinMm ?? ''} onChange={(e) => set('reviewRangeMinMm', e.target.value)} /></label>
      <label {...help('settings-review-range')} className="flex flex-col gap-0.5"><span className="text-[10px] text-neutral-500">{t('breeding.settings.rangeMax', { defaultValue: 'to (mm)' })}</span><input type="number" min="1" step="0.5" className={inputClass} value={rule.reviewRangeMaxMm ?? ''} onChange={(e) => set('reviewRangeMaxMm', e.target.value)} /></label>
      <label {...help('settings-scan-days')} className="flex flex-col gap-0.5"><span className="text-[10px] text-neutral-500">{t('breeding.settings.scanDays', { defaultValue: 'Scan reminder every (days)' })}</span><input type="number" min="1" step="1" className={inputClass} value={rule.scanReminderDays ?? ''} onChange={(e) => set('scanReminderDays', e.target.value)} /></label>
      {allowPause ? <label className="inline-flex items-center gap-1 pb-1"><input {...help('settings-pause-reminders')} type="checkbox" checked={!!rule.pauseAutomaticReminders} onChange={(e) => set('pauseAutomaticReminders', e.target.checked)} />{t('breeding.settings.pause', { defaultValue: 'Pause scan reminders' })}</label> : null}
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
      <summary {...help('breeding-settings')} className="cursor-pointer px-3 py-2 text-xs font-semibold text-neutral-700">{t('breeding.settings.titleWithSeason', { defaultValue: 'Breeding settings (season start, follicle ranges, scan reminders, forecast threshold)' })}</summary>
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
          <select {...help('settings-female-override')} className="border rounded-lg px-2 py-1 text-xs bg-white" value={femaleId} onChange={(e) => setFemaleId(e.target.value)} aria-label={t('breeding.field.female', { defaultValue: 'Female' })}>
            <option value="">{t('breeding.field.chooseFemale', { defaultValue: 'Choose a female' })}</option>
            {females.map((f) => <option key={f.id} value={f.id}>{animalLabel(f)}</option>)}
          </select>
          {femaleId ? <RuleFields rule={normalized.byFemale[femaleId]} onChange={(rule) => update((prev) => ({ ...prev, byFemale: { ...prev.byFemale, [femaleId]: rule } }))} /> : null}
          {Object.keys(normalized.byFemale).length ? <div className="text-neutral-500">{t('breeding.settings.overridesCount', { defaultValue: '{{count}} female(s) have overrides.', count: Object.keys(normalized.byFemale).length })}</div> : null}
        </div>
        <div className="space-y-1">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">{t('breeding.settings.seasonTitle', { defaultValue: 'Breeding season' })}</div>
          <div className="flex flex-wrap items-center gap-2">
            <span>{t('breeding.settings.seasonStart', { defaultValue: 'A new season starts on' })}</span>
            <input {...help('settings-season-start')}
              type="number"
              min="1"
              max="31"
              step="1"
              className="border rounded-lg px-2 py-1 text-xs w-16 bg-white"
              aria-label={t('breeding.settings.seasonStartDay', { defaultValue: 'Day' })}
              value={normalized.seasons.startDay}
              onChange={(e) => update((prev) => ({ ...prev, seasons: { ...prev.seasons, startDay: Number(e.target.value) || 1 } }))}
            />
            <select {...help('settings-season-start')}
              className="border rounded-lg px-2 py-1 text-xs bg-white"
              aria-label={t('breeding.settings.seasonStartMonth', { defaultValue: 'Month' })}
              value={normalized.seasons.startMonth}
              onChange={(e) => update((prev) => ({ ...prev, seasons: { ...prev.seasons, startMonth: Number(e.target.value) } }))}
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
                <option key={month} value={month}>{new Date(2001, month - 1, 1).toLocaleString(undefined, { month: 'long' })}</option>
              ))}
            </select>
          </div>
          <p className="text-neutral-500">{t('breeding.settings.seasonHint', { defaultValue: 'A cycle belongs to the season its first pairing falls in. "Start new season" on the Breeding page starts the next season early or late for one year without changing this date.' })}</p>
        </div>
        <label className="flex flex-wrap items-center gap-2" {...help('settings-min-cycles')}>
          <span>{t('breeding.settings.minCycles', { defaultValue: 'Call a history window a forecast from this many completed cycles' })}</span>
          <input type="number" min="1" step="1" className={inputClass} value={normalized.minCyclesForForecast} onChange={(e) => update((prev) => ({ ...prev, minCyclesForForecast: Number(e.target.value) || 3 }))} />
        </label>
        <p className="text-neutral-500">{t('breeding.settings.minCyclesHint', { defaultValue: 'Fewer cycles are shown as descriptive history. The threshold is an implementation choice, not a biological validation.' })}</p>
      </div>
    </details>
  );
}
