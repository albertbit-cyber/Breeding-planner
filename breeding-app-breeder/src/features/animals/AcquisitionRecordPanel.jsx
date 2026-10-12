import React from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Where an animal bought on Serpentora Market came from, and the record that
 * came with it.
 *
 * The sale writes `acquiredFrom`, `geneticClaims`, `certificates` and
 * `lineage` onto the buyer's copy (breeding-app-backend marketplaceSaleService).
 * Each genetic claim keeps the provenance it had in the seller's hands, and
 * each certificate carries the code the public /verify page checks, so the
 * buyer can confirm a test without taking anyone's word for it.
 *
 * Renders nothing for an animal that was not bought there.
 */

const PROVENANCE_STYLES = {
  lab_confirmed: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  predicted: 'bg-violet-50 text-violet-800 border-violet-200 italic',
  observed: 'bg-rose-50 text-rose-800 border-rose-200',
};

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function provenanceLabel(claim, t) {
  if (claim.provenance === 'lab_confirmed') {
    return claim.lab?.certificateNumber
      ? t('acquisition.labConfirmedCert', { defaultValue: 'Lab-confirmed, certificate {{number}}', number: claim.lab.certificateNumber })
      : t('acquisition.labConfirmed', { defaultValue: 'Lab-confirmed' });
  }
  if (claim.provenance === 'predicted') {
    return claim.percent && claim.percent < 100
      ? t('acquisition.predictedPercent', { defaultValue: 'Predicted from the pairing, {{percent}}% odds', percent: claim.percent })
      : t('acquisition.predicted', { defaultValue: 'Predicted from the pairing, not tested' });
  }
  return t('acquisition.observed', { defaultValue: 'Observed by the seller, not tested' });
}

export function AcquisitionRecordPanel({ snake }) {
  const { t } = useTranslation();
  const from = snake?.acquiredFrom;
  if (!from || from.source !== 'serpentora_marketplace') return null;

  const claims = Array.isArray(snake.geneticClaims) ? snake.geneticClaims : [];
  const certificates = Array.isArray(snake.certificates) ? snake.certificates : [];
  const parents = Array.isArray(snake.lineage?.parents) ? snake.lineage.parents : [];

  return (
    <div className="p-3 border rounded-xl bg-white" data-testid="acquisition-record">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
        <div className="font-medium text-sm">
          {t('acquisition.title', { defaultValue: 'Acquired from {{seller}}', seller: from.sellerName || t('acquisition.aSeller', { defaultValue: 'a seller' }) })}
        </div>
        <div className="text-xs text-neutral-500">
          {[
            t('acquisition.viaMarket', { defaultValue: 'Serpentora Market' }),
            formatDate(from.acquiredAt),
            from.sellerAnimalId ? t('acquisition.theirId', { defaultValue: "seller's ID {{id}}", id: from.sellerAnimalId }) : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </div>
      </div>

      {claims.length ? (
        <ul className="space-y-1 mb-3">
          {claims.map((claim, index) => (
            <li key={`${claim.label}-${index}`} className="flex flex-wrap items-center gap-2 text-xs">
              <span className={`px-2 py-0.5 rounded-md border ${PROVENANCE_STYLES[claim.provenance] || PROVENANCE_STYLES.observed}`}>
                {claim.label}
              </span>
              <span className="text-neutral-600">{provenanceLabel(claim, t)}</span>
              {claim.labDisagrees && claim.lab ? (
                <span className="text-rose-700">
                  {t('acquisition.labDisagrees', { defaultValue: 'certificate reads "{{result}}"', result: claim.lab.result })}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {certificates.length ? (
        <div className="border-t pt-2 mb-2">
          <div className="text-xs font-medium text-neutral-700 mb-1">
            {t('acquisition.certificates', { defaultValue: 'Lab certificates that came with this animal' })}
          </div>
          {certificates.map((certificate) => (
            <div key={certificate.certificateNumber} className="flex flex-wrap items-center justify-between gap-2 text-xs py-1">
              <span>
                <span className="font-semibold">{certificate.certificateNumber}</span>
                {certificate.labName ? <span className="text-neutral-500"> · {certificate.labName}</span> : null}
                <br />
                <span className="text-neutral-500">{t('acquisition.code', { defaultValue: 'Verification code' })}: </span>
                <span className="font-mono break-all">{certificate.verificationCode}</span>
              </span>
              {certificate.verifyUrl ? (
                <a className="underline text-sky-700" href={certificate.verifyUrl} target="_blank" rel="noreferrer">
                  {t('acquisition.verify', { defaultValue: 'Check this certificate' })}
                </a>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {parents.length || snake.lineage?.clutchId ? (
        <div className="text-xs text-neutral-600">
          {t('acquisition.lineage', { defaultValue: 'Lineage as recorded by the seller' })}:{' '}
          {[
            snake.lineage?.clutchId ? t('acquisition.clutch', { defaultValue: 'clutch {{id}}', id: snake.lineage.clutchId }) : null,
            ...parents.map((parent) => `${parent.role}: ${parent.label}`),
          ]
            .filter(Boolean)
            .join(' · ')}
        </div>
      ) : null}
    </div>
  );
}

export default AcquisitionRecordPanel;
