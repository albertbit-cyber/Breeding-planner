import React, { useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { departureOf } from './archive';
import { archiveLabels, formatRecordDate } from './archiveRecord';
import { formatSexCode } from './animalTextList';
import useDialogFocus from './useDialogFocus';
import { help } from '../help/help';
import PhotoImg from '../../components/PhotoImg.jsx';
import { DialogHelpButton } from '../help/ui/HelpButton';

const text = (value) => (value === undefined || value === null ? '' : String(value).trim());

/**
 * The small card a deleted snake leaves behind: photo, ID, name, why and when it left, its
 * pairings, its parents and its offspring. Nothing on it can be edited; it exists so the
 * snake can still be named and followed from the pairings and pedigrees it belongs to.
 */
export default function RemovedAnimalCard({ animal, animals = [], pairings = [], locale, onClose, onOpenAnimal, onOpenPairing }) {
  const { t } = useTranslation();
  const labels = useMemo(() => archiveLabels(t), [t]);
  const dialogRef = useDialogFocus(onClose, { active: Boolean(animal), initialFocus: '.archive-record__close' });

  const byId = useMemo(() => new Map((Array.isArray(animals) ? animals : []).filter(Boolean).map(a => [a.id, a])), [animals]);
  const departure = departureOf(animal);
  const linkedPairings = useMemo(() => (Array.isArray(pairings) ? pairings : [])
    .filter(p => p && !p.deletedAt && animal && (p.femaleId === animal.id || p.maleId === animal.id))
    .map((p) => {
      const partnerId = p.femaleId === animal.id ? p.maleId : p.femaleId;
      const partner = byId.get(partnerId);
      return {
        id: p.id,
        year: text(p.cycleYear) || text(p.startDate).slice(0, 4),
        partnerId,
        partnerName: text(partner?.name) || text(partnerId),
        partnerLeft: departureOf(partner),
      };
    })
    .sort((a, b) => b.year.localeCompare(a.year)), [animal, byId, pairings]);
  const offspring = useMemo(() => (Array.isArray(animals) ? animals : [])
    .filter(a => a && animal && a.id !== animal.id && (text(a.sireId) === animal.id || text(a.damId) === animal.id)), [animal, animals]);

  if (!animal || typeof document === 'undefined') return null;
  const photo = (Array.isArray(animal.photos) && animal.photos[0]?.url) || text(animal.imageUrl);
  const sire = text(animal.sireId) ? (byId.get(animal.sireId) || { id: animal.sireId }) : null;
  const dam = text(animal.damId) ? (byId.get(animal.damId) || { id: animal.damId }) : null;
  const reasonLabel = departure ? `${departure.reason === 'died' ? '† ' : ''}${labels.reasons[departure.reason] || departure.reason}` : '';

  const AnimalLink = ({ target }) => {
    const left = departureOf(target);
    const name = text(target?.name) || text(target?.id);
    const content = (
      <>
        {name}
        {left && <span className="archive-departure-tag ms-1">{left.reason === 'died' ? '† ' : ''}{labels.reasons[left.reason]}</span>}
      </>
    );
    return onOpenAnimal && byId.has(target?.id)
      ? <button type="button" className="archive-record__link" onClick={() => onOpenAnimal(target.id)}>{content}</button>
      : <span>{content}</span>;
  };

  return createPortal((
    <div className="sk-scrim fixed inset-0 flex items-end sm:items-center justify-center sm:p-4 z-[10025]" onClick={onClose}>
      <div
        ref={dialogRef}
        className="archive-record removed-card relative bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl border max-h-[92vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        data-dialog="removed-animal"
        aria-labelledby="removed-card-title"
      >
        <header className="relative flex gap-4 p-5 pe-14 border-b">
          <DialogHelpButton className="help-dialog-corner" />
          {photo ? (
            <PhotoImg src={photo} alt="" className="archive-record__photo removed-card__photo" />
          ) : (
            <div className="archive-record__photo archive-record__photo--empty removed-card__photo" aria-hidden="true">{formatSexCode(animal.sex)}</div>
          )}
          <div className="min-w-0 flex-1">
            <span className="removed-card__label">
              {t('archive.removed.label', { defaultValue: 'No longer in the collection' })}
            </span>
            <h2 id="removed-card-title" className="mt-1 text-xl font-semibold leading-tight break-words" {...help('archive-removed-card')}>{animal.name || animal.id}</h2>
            <p className="text-sm text-neutral-600"><bdi>{animal.id}</bdi> · {formatSexCode(animal.sex)}</p>
            <p className="mt-1 text-sm">
              <span className={`archive-reason-badge archive-reason-badge--${departure?.reason || 'other'}`}>{reasonLabel}</span>
              {departure?.date && <span className="ms-2 text-xs text-neutral-500">{formatRecordDate(departure.date, locale)}</span>}
            </p>
          </div>
          <button type="button" className="archive-record__close self-start text-sm" {...help('app-dialog-close')} onClick={onClose} aria-label={t('common.close', { defaultValue: 'Close' })}>✕</button>
        </header>

        <div className="px-5 py-4 flex flex-col gap-5">
          <section className="archive-record__section">
            <h3 className="archive-record__heading">{labels.parents}</h3>
            {sire || dam ? (
              <dl className="archive-record__pairs mt-2">
                <dt>{t('archive.removed.sire', { defaultValue: 'Sire' })}</dt>
                <dd>{sire ? <AnimalLink target={sire} /> : labels.notRecorded}</dd>
                <dt>{t('archive.removed.dam', { defaultValue: 'Dam' })}</dt>
                <dd>{dam ? <AnimalLink target={dam} /> : labels.notRecorded}</dd>
              </dl>
            ) : <p className="mt-2 text-sm text-neutral-500">{labels.notRecorded}</p>}
          </section>

          <section className="archive-record__section">
            <h3 className="archive-record__heading">{t('archive.removed.pairings', { defaultValue: 'Pairings' })}</h3>
            {linkedPairings.length ? (
              <ul className="archive-record__list mt-2">
                {linkedPairings.map(p => (
                  <li key={p.id} className="text-sm flex flex-wrap items-baseline gap-x-2">
                    {onOpenPairing ? (
                      <button type="button" className="archive-record__link" onClick={() => onOpenPairing(p.id)}>
                        {[p.year, t('archive.record.pairedWith', { defaultValue: 'with {{name}}', name: p.partnerName })].filter(Boolean).join(' ')}
                      </button>
                    ) : <span>{[p.year, t('archive.record.pairedWith', { defaultValue: 'with {{name}}', name: p.partnerName })].filter(Boolean).join(' ')}</span>}
                    {p.partnerLeft && <span className="archive-departure-tag">{p.partnerLeft.reason === 'died' ? '† ' : ''}{labels.reasons[p.partnerLeft.reason]}</span>}
                  </li>
                ))}
              </ul>
            ) : <p className="mt-2 text-sm text-neutral-500">{labels.noBreeding}</p>}
          </section>

          <section className="archive-record__section">
            <h3 className="archive-record__heading">{t('archive.removed.offspring', { defaultValue: 'Offspring' })}</h3>
            {offspring.length ? (
              <ul className="removed-card__offspring mt-2">
                {offspring.map(o => <li key={o.id}><AnimalLink target={o} /></li>)}
              </ul>
            ) : <p className="mt-2 text-sm text-neutral-500">{t('archive.removed.noOffspring', { defaultValue: 'No offspring on file.' })}</p>}
          </section>

          <p className="text-xs text-neutral-500">
            {t('archive.removed.explain', { defaultValue: 'This snake was deleted. Its records were erased; this card keeps its place in your pairings, clutches and pedigrees.' })}
          </p>
        </div>
      </div>
    </div>
  ), document.body);
}
