import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ARCHIVE_REASONS, getArchiveRecord } from './archive';
import { archiveLabels, formatRecordDate, formatRecordPrice } from './archiveRecord';
import { formatSexCode } from './animalTextList';
import { help } from '../help/help';
import PhotoImg from '../../components/PhotoImg.jsx';

const text = (value) => (value === undefined || value === null ? '' : String(value).trim());

/**
 * The Archive view of the Animals tab: every snake that left the collection, newest exit first,
 * filterable by reason, year and a free search. Rows open the read-only record.
 */
export default function ArchiveList({ animals = [], locale, onOpen }) {
  const { t } = useTranslation();
  const labels = useMemo(() => archiveLabels(t), [t]);
  const [reason, setReason] = useState('all');
  const [year, setYear] = useState('all');
  const [query, setQuery] = useState('');

  const entries = useMemo(() => animals
    .map(animal => ({ animal, record: getArchiveRecord(animal) }))
    .filter(entry => entry.record)
    .sort((a, b) => (
      text(b.record.date).localeCompare(text(a.record.date))
      || text(a.animal.name).localeCompare(text(b.animal.name))
    )), [animals]);

  const years = useMemo(() => {
    const set = new Set(entries.map(e => e.record.date.slice(0, 4)).filter(Boolean));
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [entries]);

  const reasonCounts = useMemo(() => {
    const counts = {};
    entries.forEach((e) => { counts[e.record.reason] = (counts[e.record.reason] || 0) + 1; });
    return counts;
  }, [entries]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return entries.filter(({ animal, record }) => {
      if (reason !== 'all' && record.reason !== reason) return false;
      if (year === 'none' && record.date) return false;
      if (year !== 'all' && year !== 'none' && !record.date.startsWith(year)) return false;
      if (!needle) return true;
      const haystack = [
        animal.name, animal.id, record.counterpartyName,
        ...(Array.isArray(animal.morphs) ? animal.morphs : []),
        ...(Array.isArray(animal.hets) ? animal.hets : []),
      ].map(text).join(' ').toLowerCase();
      return haystack.includes(needle);
    });
  }, [entries, reason, year, query]);

  if (!entries.length) {
    return (
      <div className="archive-empty rounded-2xl border p-6 text-center">
        <p className="font-medium">{t('archive.list.emptyTitle', { defaultValue: 'The archive is empty' })}</p>
        <p className="mt-1 text-sm text-neutral-600 max-w-md mx-auto">
          {t('archive.list.emptyBody', { defaultValue: 'Snakes you sell, lose or give away land here with their full record. Open a snake and choose "Move to archive".' })}
        </p>
      </div>
    );
  }

  return (
    <div className="archive-list flex flex-col gap-3">
      <div className="archive-list__filters flex flex-wrap items-center gap-2">
        <div className="archive-list__reasons flex flex-wrap gap-1" role="group" aria-label={labels.reason}>
          <button type="button" {...help('archive-filter-reason')} className={`archive-chip ${reason === 'all' ? 'archive-chip--selected' : ''}`} aria-pressed={reason === 'all'} onClick={() => setReason('all')}>
            {t('archive.list.allReasons', { defaultValue: 'All' })} <span className="archive-chip__count">{entries.length}</span>
          </button>
          {ARCHIVE_REASONS.filter(r => reasonCounts[r]).map(r => (
            <button key={r} type="button" {...help('archive-filter-reason')} className={`archive-chip ${reason === r ? 'archive-chip--selected' : ''}`} aria-pressed={reason === r} onClick={() => setReason(r)}>
              {labels.reasons[r]} <span className="archive-chip__count">{reasonCounts[r]}</span>
            </button>
          ))}
        </div>
        <select {...help('archive-filter-year')} className="border rounded-xl px-3 py-2 bg-white text-sm" value={year} onChange={e => setYear(e.target.value)} aria-label={t('archive.list.year', { defaultValue: 'Year' })}>
          <option value="all">{t('archive.list.allYears', { defaultValue: 'All years' })}</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
          {entries.some(e => !e.record.date) && <option value="none">{labels.dateNotRecorded}</option>}
        </select>
        <input
          {...help('archive-search')}
          type="search"
          className="border rounded-xl px-3 py-2 bg-white text-sm flex-1 min-w-[10rem]"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={t('archive.list.search', { defaultValue: 'Search name, ID, genetics, buyer' })}
          aria-label={t('archive.list.search', { defaultValue: 'Search name, ID, genetics, buyer' })}
        />
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-neutral-600 py-4">{t('archive.list.noMatch', { defaultValue: 'No archived snake matches these filters.' })}</p>
      ) : (
        <ul className="archive-list__rows rounded-2xl border overflow-hidden">
          {visible.map(({ animal, record }) => {
            const photo = (Array.isArray(animal.photos) && animal.photos[0]?.url) || text(animal.imageUrl);
            const genetics = [...(animal.morphs || []), ...(animal.hets || []).map(h => (/^het/i.test(h) ? h : `het ${h}`))].join(', ');
            const detail = [
              record.counterpartyName,
              record.reason === 'sold' ? formatRecordPrice(record.price, record.currency) : '',
              record.reason === 'died' ? record.causeOfDeath : '',
            ].filter(Boolean).join(' · ');
            return (
              <li key={animal.id}>
                <button type="button" {...help('archive-open')} className="archive-list__row w-full text-left" onClick={() => onOpen(animal)}>
                  {photo
                    ? <PhotoImg src={photo} variant="thumb" alt="" className="archive-list__thumb" loading="lazy" />
                    : <span className="archive-list__thumb archive-list__thumb--empty" aria-hidden="true">{formatSexCode(animal.sex)}</span>}
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium truncate">{animal.name || animal.id}</span>
                    <span className="archive-list__meta text-xs text-neutral-500">{[animal.name ? animal.id : '', formatSexCode(animal.sex), genetics].filter(Boolean).join(' · ')}</span>
                  </span>
                  <span className="archive-list__exit text-right shrink-0">
                    <span className={`archive-reason-badge archive-reason-badge--${record.reason}`}>{labels.reasons[record.reason]}</span>
                    <span className="block text-xs text-neutral-500 mt-1">{record.date ? formatRecordDate(record.date, locale) : labels.dateNotRecorded}</span>
                    {detail && <span className="archive-list__detail block text-xs text-neutral-600 truncate">{detail}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
