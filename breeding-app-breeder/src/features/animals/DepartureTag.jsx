import React from 'react';
import { useTranslation } from 'react-i18next';
import { departureOf } from './archive';
import { archiveLabels } from './archiveRecord';

/**
 * The small "Died" / "Sold" mark next to a snake that has left the collection, wherever it is
 * still named: a pairing, a clutch, a pedigree. Renders nothing for a snake still kept.
 */
export default function DepartureTag({ animal, departure: given = null, className = '' }) {
  const { t } = useTranslation();
  const departure = given || departureOf(animal);
  if (!departure) return null;
  const label = archiveLabels(t).reasons[departure.reason] || departure.reason;
  return (
    <span
      className={`archive-departure-tag ${className}`}
      title={departure.kind === 'removed'
        ? t('archive.removed.label', { defaultValue: 'No longer in the collection' })
        : label}
    >
      {departure.reason === 'died' ? `† ${label}` : label}
    </span>
  );
}
