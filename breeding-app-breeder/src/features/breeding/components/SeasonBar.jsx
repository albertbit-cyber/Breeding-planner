/**
 * The season strip above the Breeding tabs: the current season and when it started, any earlier
 * season still finishing (eggs incubating, hatchlings to register), and "Start new season" for
 * breeders whose season does not begin on the configured date.
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import { isIncubating } from '../domain/pairingView';
import { nextSeasonLabel } from '../domain/season';
import { formatDate } from './format';
import { help } from '../../help/help';

export function SeasonBar({ summaries = [], currentSeason = '', onStartNewSeason, confirm = (message) => window.confirm(message) }) {
  const { t } = useTranslation();
  const current = summaries.find((row) => row.label === currentSeason) || { label: currentSeason, open: 0, startsOn: null };
  const finishing = summaries.filter((row) => !row.isCurrent && row.open > 0);
  const lastEnded = summaries.find((row) => row.ended) || null;
  const next = nextSeasonLabel(currentSeason);

  const start = () => {
    if (!next || !onStartNewSeason) return;
    const ok = confirm(t('breeding.season.startConfirm', {
      defaultValue: 'Start season {{next}} today? Pairings from today on belong to {{next}}. Cycles already running keep their season.',
      next,
    }));
    if (ok) onStartNewSeason();
  };

  return (
    <div className="mt-card border px-3 py-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs" {...help('breeding-season-bar')}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 min-w-0">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">{t('breeding.season.current', { defaultValue: 'Current season' })}</span>
        <span className="text-sm font-semibold tabular-nums">{current.label || '?'}</span>
        <span className="text-neutral-500">
          {current.startsOn ? t('breeding.season.startedOn', { defaultValue: 'since {{date}}', date: formatDate(current.startsOn) }) : ''}
          {' · '}{t('breeding.season.openCount', { defaultValue: '{{count}} open', count: current.open || 0 })}
        </span>
      </div>
      {finishing.map((row) => {
        const incubating = row.cycles.filter(isIncubating).length;
        return (
          <div key={row.label} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 min-w-0">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">{t('breeding.season.finishing', { defaultValue: 'Finishing' })}</span>
            <span className="font-semibold tabular-nums">{row.label}</span>
            <span className="text-neutral-500">
              {t('breeding.season.openCount', { defaultValue: '{{count}} open', count: row.open })}
              {incubating ? ` · ${t('breeding.season.incubatingCount', { defaultValue: 'in the incubator: {{count}}', count: incubating })}` : ''}
            </span>
          </div>
        );
      })}
      {!finishing.length && lastEnded ? (
        <div className="text-neutral-500">{t('breeding.season.lastEnded', { defaultValue: 'Season {{season}} ended {{date}}', season: lastEnded.label, date: formatDate(lastEnded.endedOn) || '?' })}</div>
      ) : null}
      {onStartNewSeason && next ? (
        <button {...help('season-start-new')} type="button" className="ms-auto text-xs px-3 py-1.5 border rounded-lg bg-white hover:bg-neutral-50" onClick={start} title={t('breeding.season.startHint', { defaultValue: 'A new season starts on 1 September by default. Use this if your season starts on a different day.' })}>
          {t('breeding.season.startNew', { defaultValue: 'Start new season' })}
        </button>
      ) : null}
    </div>
  );
}
