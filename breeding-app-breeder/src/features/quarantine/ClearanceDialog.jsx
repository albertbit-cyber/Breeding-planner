import React from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { getClearanceChecklist } from '../../services/quarantine';
import { CLEARANCE_LABELS, formatYmd, makeLabeller } from './labels';

// Advisory, never a gate. The unmet items are stated plainly and the confirm button stays live,
// because clearing early is a legitimate decision a breeder is entitled to make — the record just
// remembers that they made it, and what was outstanding at the time.

function detailFor(t, key, item) {
  const detail = item.detail;
  if (item.met) {
    if (key === 'duration' && detail) {
      return t('quarantine.clearance.dayOf', { count: detail.days, defaultValue: 'day {{count}}' });
    }
    if ((key === 'clean-test' || key === 'final-test') && detail?.date) return formatYmd(detail.date);
    if (key === 'weight' && detail) return `${detail.delta >= 0 ? '+' : ''}${detail.delta} g`;
    return '';
  }
  switch (key) {
    case 'duration':
      if (!detail) return t('quarantine.clearance.noPlan', { defaultValue: 'no start date or planned length recorded' });
      return t('quarantine.clearance.remaining', { count: detail.remaining, defaultValue: '{{count}} days still to run' });
    case 'clean-test':
      return t('quarantine.clearance.noCleanTest', { defaultValue: 'no clear result recorded' });
    case 'final-test':
      return t('quarantine.clearance.noRecentTest', { defaultValue: 'nothing clear in the last 30 days' });
    case 'weight':
      return detail
        ? t('quarantine.clearance.lostWeight', { count: Math.abs(detail.delta), defaultValue: 'down {{count}} g since intake' })
        : t('quarantine.clearance.noWeights', { defaultValue: 'no intake weight or check weight recorded' });
    case 'feeding':
      return t('quarantine.clearance.notFeeding', { defaultValue: 'no accepted feed logged in the last 30 days' });
    case 'mites':
      return detail?.since
        ? t('quarantine.clearance.mitesSince', { date: formatYmd(detail.since), defaultValue: 'mites seen since the treatment on {{date}}' })
        : t('quarantine.clearance.mitesSeen', { defaultValue: 'mites seen and no treatment recorded' });
    default:
      return '';
  }
}

export default function ClearanceDialog({ snake, onConfirm, onClose }) {
  const { t } = useTranslation();
  const label = makeLabeller(t);
  if (typeof document === 'undefined') return null;

  const { items, metCount, total } = getClearanceChecklist(snake);
  const unmet = items.filter(item => !item.met);

  return createPortal((
    <div
      className="fixed inset-0 z-[10050] flex items-center justify-center bg-neutral-900/45 backdrop-blur-sm p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border max-h-[92vh] overflow-y-auto"
        onClick={event => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="px-5 py-4 border-b">
          <div className="text-base font-semibold">
            {t('quarantine.clearTitle', { name: snake?.name || snake?.id, defaultValue: 'Clear {{name}} from quarantine?' })}
          </div>
          <div className="text-xs text-neutral-500 mt-0.5">
            {t('quarantine.clearance.metCount', { met: metCount, total, defaultValue: '{{met}} of {{total}} met' })}
          </div>
        </div>

        <ul className="px-5 py-4 flex flex-col gap-2.5">
          {items.map(item => {
            const detail = detailFor(t, item.key, item);
            return (
              <li key={item.key} className="flex items-start gap-2.5">
                <span
                  aria-hidden="true"
                  className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                    item.met ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {item.met ? '✓' : '!'}
                </span>
                <span className="text-sm">
                  <span className={item.met ? 'text-neutral-700' : 'font-medium text-neutral-900'}>
                    {label(CLEARANCE_LABELS, item.key)}
                  </span>
                  {detail ? <span className="block text-[11px] text-neutral-500">{detail}</span> : null}
                </span>
              </li>
            );
          })}
        </ul>

        <div className="px-5 pb-4">
          <p className="text-xs text-neutral-600 bg-neutral-50 border rounded-xl p-3">
            {unmet.length
              ? t('quarantine.clearance.warning', {
                count: unmet.length,
                defaultValue: 'You can clear anyway — the {{count}} unmet items get written into this animal’s quarantine history.',
              })
              : t('quarantine.clearance.allMet', { defaultValue: 'Everything on the list is met.' })}
          </p>
        </div>

        <div className="px-5 py-4 border-t flex flex-wrap justify-end gap-2">
          <button type="button" className="rounded-xl border px-4 py-2 text-sm" onClick={onClose}>
            {t('quarantine.clearance.notYet', { defaultValue: 'Not yet' })}
          </button>
          <button
            type="button"
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
            onClick={() => {
              const note = unmet.length
                ? unmet.map(item => label(CLEARANCE_LABELS, item.key)).join('; ')
                : '';
              onConfirm?.(note ? t('quarantine.clearance.unmetNote', { items: note, defaultValue: 'Cleared with unmet: {{items}}' }) : '');
              onClose?.();
            }}
          >
            {unmet.length
              ? t('quarantine.clearance.clearAnyway', { defaultValue: 'Clear anyway' })
              : t('quarantine.markCleared', { defaultValue: 'Mark cleared' })}
          </button>
        </div>
      </div>
    </div>
  ), document.body);
}
