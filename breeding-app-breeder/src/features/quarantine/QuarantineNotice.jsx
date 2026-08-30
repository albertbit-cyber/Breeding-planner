import React from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

// The one place in this feature that says out loud what it cannot do.
//
// Two modes, same words: `intake` interrupts an animal on its way into quarantine and confirms
// through to creating it, `reference` is the same text opened deliberately from the quarantine
// tab. Neither blocks anything -- intake has a single button that carries on.

export default function QuarantineNotice({ mode = 'intake', onConfirm, onClose }) {
  const { t } = useTranslation();
  if (typeof document === 'undefined') return null;

  const isIntake = mode === 'intake';
  const dismiss = () => (isIntake ? onConfirm?.() : onClose?.());

  return createPortal((
    <div
      className="fixed inset-0 z-[10070] flex items-end sm:items-center justify-center bg-neutral-900/55 backdrop-blur-sm p-0 sm:p-4"
      onClick={isIntake ? undefined : onClose}
      role="presentation"
    >
      <div
        className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl border max-h-[92vh] overflow-y-auto"
        onClick={event => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="quarantine-notice-title"
      >
        <div className="px-5 pt-5 pb-4 flex flex-col gap-3">
          <h2 id="quarantine-notice-title" className="text-base font-semibold">
            {isIntake
              ? t('quarantine.notice.title', { defaultValue: 'Before you start' })
              : t('quarantine.notice.referenceTitle', { defaultValue: 'About quarantine records' })}
          </h2>

          <p className="text-sm font-semibold text-neutral-900">
            {t('quarantine.notice.lede', {
              defaultValue: 'Quarantine records what you see. It might not tell you what it means.',
            })}
          </p>

          <p className="text-sm text-neutral-700">
            {t('quarantine.notice.body', {
              defaultValue: 'One sign can have several very different causes, and the obvious answer might be the wrong one. If something concerning shows up, it is always recommended to seek a veterinarian who specialises in reptiles rather than work it out yourself.',
            })}
          </p>

          <ul className="flex flex-col gap-1.5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <li className="flex gap-2">
              <span aria-hidden="true" className="text-amber-600">•</span>
              <span>
                {t('quarantine.notice.pointVet', {
                  defaultValue: 'Line up a vet who specialises in reptiles — not the same as a general small-animal practice.',
                })}
              </span>
            </li>
            <li className="flex gap-2">
              <span aria-hidden="true" className="text-amber-600">•</span>
              <span>
                {t('quarantine.notice.pointTest', {
                  defaultValue: 'Plan at least one faecal test as part of every quarantine.',
                })}
              </span>
            </li>
          </ul>

          <p className="text-sm text-neutral-700">
            {t('quarantine.notice.closing', {
              defaultValue: 'Testing early is what makes the rest of this worth doing.',
            })}
          </p>
        </div>

        <div className="px-5 pb-5">
          <button
            type="button"
            className="w-full rounded-xl bg-sky-500 px-4 py-3 text-sm font-semibold text-white"
            onClick={dismiss}
            autoFocus
          >
            {isIntake
              ? t('quarantine.notice.confirm', { defaultValue: 'Start quarantine' })
              : t('common.close', { defaultValue: 'Close' })}
          </button>
        </div>
      </div>
    </div>
  ), document.body);
}
