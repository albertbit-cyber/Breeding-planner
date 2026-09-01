import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { getSpeciesById } from '../../../genetics/speciesRegistry';

/**
 * The mandatory stop between reading a MorphMarket file and writing animals.
 *
 * Every count on this screen is computed from the file in hand -- nothing here is a fixed
 * number from a sample export. Rows that collide with the collection start on Skip and stay
 * there unless the keeper says otherwise: an import must never quietly overwrite an animal.
 */

const STATUS_STYLES = {
  ready: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  conflict: 'bg-sky-50 text-sky-700 border-sky-200',
  error: 'bg-rose-50 text-rose-700 border-rose-200',
  skipped: 'bg-neutral-100 text-neutral-500 border-neutral-200',
};

function speciesLabel(speciesId) {
  return getSpeciesById(speciesId)?.name || speciesId || '';
}

function Chip({ label, value }) {
  return (
    <div className="px-2.5 py-1.5 rounded-lg border bg-white">
      <div className="text-sm font-semibold leading-none">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-neutral-500 mt-1">{label}</div>
    </div>
  );
}

export default function MorphMarketImportReview({
  plan,
  onChangeResolution,
  onConfirm,
  onCancel,
  busy = false,
  result = null,
  primaryButtonClass = 'appearance-btn appearance-btn--filled',
}) {
  const { t } = useTranslation();
  const rows = Array.isArray(plan?.rows) ? plan.rows : [];
  const summary = plan?.summary || null;

  const statusLabels = {
    ready: t('ui.animals.import.morphmarket.status.ready', { defaultValue: 'Ready' }),
    warning: t('ui.animals.import.morphmarket.status.warning', { defaultValue: 'Warning' }),
    conflict: t('ui.animals.import.morphmarket.status.conflict', { defaultValue: 'Conflict' }),
    error: t('ui.animals.import.morphmarket.status.error', { defaultValue: 'Error' }),
    skipped: t('ui.animals.import.morphmarket.status.skipped', { defaultValue: 'Skipped' }),
  };

  // What the confirm button is actually about to do, recomputed as the keeper resolves rows.
  const pending = useMemo(() => {
    let create = 0;
    let update = 0;
    let skip = 0;
    rows.forEach(row => {
      if (row.status === 'error') return;
      if (row.resolution === 'skip') { skip += 1; return; }
      if (row.conflictWithId) {
        if (row.resolution === 'update') update += 1;
        else skip += 1;
        return;
      }
      create += 1;
    });
    return { create, update, skip };
  }, [rows]);

  if (result) {
    return (
      <div className="space-y-4">
        <div className="text-base font-semibold">
          {t('ui.animals.import.morphmarket.completeTitle', { defaultValue: 'Import complete' })}
        </div>
        <div className="flex flex-wrap gap-2">
          <Chip
            label={t('ui.animals.import.morphmarket.imported', { defaultValue: 'Imported' })}
            value={result.created}
          />
          <Chip
            label={t('ui.animals.import.morphmarket.updated', { defaultValue: 'Updated' })}
            value={result.updated}
          />
          <Chip
            label={t('ui.animals.import.morphmarket.skipped', { defaultValue: 'Skipped' })}
            value={result.skipped}
          />
          <Chip
            label={t('ui.animals.import.morphmarket.failed', { defaultValue: 'Failed' })}
            value={result.failed}
          />
        </div>
        <button
          type="button"
          className={`px-3 py-2 rounded-xl text-sm ${primaryButtonClass}`}
          onClick={onCancel}
        >
          {t('ui.animals.import.morphmarket.viewAnimals', { defaultValue: 'View imported animals' })}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="text-base font-semibold">
          {t('ui.animals.import.morphmarket.detected', {
            count: summary?.total || 0,
            defaultValue: '{{count}} animals detected from MorphMarket',
          })}
        </div>
        <div className="text-xs text-neutral-500 mt-1">
          {t('ui.animals.import.morphmarket.reviewHint', {
            defaultValue: 'Columns were mapped automatically. Nothing is saved until you confirm.',
          })}
        </div>
      </div>

      {summary && (
        <div className="flex flex-wrap gap-2">
          {summary.bySpecies.map(entry => (
            <Chip key={entry.speciesId} label={speciesLabel(entry.speciesId)} value={entry.count} />
          ))}
          <Chip label={t('ui.animals.import.morphmarket.male', { defaultValue: 'Male' })} value={summary.male} />
          <Chip label={t('ui.animals.import.morphmarket.female', { defaultValue: 'Female' })} value={summary.female} />
          <Chip label={t('ui.animals.import.morphmarket.unknownSex', { defaultValue: 'Unknown sex' })} value={summary.unknownSex} />
          <Chip label={t('ui.animals.import.morphmarket.missingDob', { defaultValue: 'Missing DOB' })} value={summary.missingDob} />
          <Chip label={t('ui.animals.import.morphmarket.missingWeight', { defaultValue: 'Missing weight' })} value={summary.missingWeight} />
          <Chip label={t('ui.animals.import.morphmarket.missingId', { defaultValue: 'Missing animal ID' })} value={summary.missingAnimalId} />
          {summary.conflicts > 0 && (
            <Chip label={t('ui.animals.import.morphmarket.conflicts', { defaultValue: 'Conflicts' })} value={summary.conflicts} />
          )}
          {summary.errors > 0 && (
            <Chip label={t('ui.animals.import.morphmarket.errors', { defaultValue: 'Errors' })} value={summary.errors} />
          )}
        </div>
      )}

      <div className="border rounded-xl overflow-auto max-h-[46vh] divide-y">
        {rows.map(row => {
          const effectiveStatus = row.status !== 'error' && row.resolution === 'skip' ? 'skipped' : row.status;
          const notes = [...row.errors, ...row.warnings];
          return (
            <div key={row.rowNumber} className="p-3 flex flex-wrap items-start gap-3">
              <div className="text-[11px] text-neutral-400 w-8 pt-0.5">{row.rowNumber}</div>
              <div className="min-w-[14rem] flex-1">
                <div className="text-sm font-medium">
                  {row.raw.title || t('ui.animals.import.morphmarket.untitled', { defaultValue: '(no title)' })}
                </div>
                <div className="text-[11px] text-neutral-500 mt-0.5">
                  {[
                    row.raw.animalId,
                    row.animal ? speciesLabel(row.animal.species) : row.raw.category,
                    row.animal?.sex,
                    row.animal?.birthDate,
                    row.animal?.weight != null ? `${row.animal.weight} g` : null,
                    row.animal?.price ? `${row.animal.price}` : null,
                  ].filter(Boolean).join('  ·  ')}
                </div>
                {row.animal && (row.animal.morphs.length > 0 || row.animal.hets.length > 0) && (
                  <div className="text-[11px] text-neutral-600 mt-1">
                    {[...row.animal.morphs, ...row.animal.hets].join(', ')}
                  </div>
                )}
                {notes.length > 0 && (
                  <ul className="mt-1 space-y-0.5">
                    {notes.map((note, index) => (
                      <li key={`${note.code}-${index}`} className="text-[11px] text-neutral-500">
                        {t(`ui.animals.import.morphmarket.notes.${note.code}`, { defaultValue: note.message })}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="flex items-center gap-2">
                <span className={`text-[10px] uppercase tracking-wide px-2 py-1 rounded-lg border ${STATUS_STYLES[effectiveStatus]}`}>
                  {statusLabels[effectiveStatus]}
                </span>
                {row.conflictWithId && (
                  <select
                    className="text-xs border rounded-lg px-2 py-1 bg-white"
                    value={row.resolution === 'update' ? 'update' : 'skip'}
                    onChange={event => onChangeResolution?.(row.rowNumber, event.target.value)}
                  >
                    <option value="skip">{t('ui.animals.import.morphmarket.resolveSkip', { defaultValue: 'Skip' })}</option>
                    <option value="update">{t('ui.animals.import.morphmarket.resolveUpdate', { defaultValue: 'Update existing' })}</option>
                  </select>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={`px-3 py-2 rounded-xl text-sm ${primaryButtonClass} disabled:opacity-50`}
          disabled={busy || pending.create + pending.update === 0}
          onClick={onConfirm}
        >
          {t('ui.animals.import.morphmarket.confirm', {
            count: pending.create + pending.update,
            defaultValue: 'Import {{count}} animals',
          })}
        </button>
        <button type="button" className="px-3 py-2 rounded-xl text-sm border bg-white" onClick={onCancel}>
          {t('common.cancel', { defaultValue: 'Cancel' })}
        </button>
        <div className="text-[11px] text-neutral-500">
          {t('ui.animals.import.morphmarket.pendingSummary', {
            create: pending.create,
            update: pending.update,
            skip: pending.skip,
            defaultValue: '{{create}} new · {{update}} updated · {{skip}} skipped',
          })}
        </div>
      </div>
    </div>
  );
}
