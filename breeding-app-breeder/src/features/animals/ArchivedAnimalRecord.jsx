import React, { useEffect, useMemo, useRef, useState } from 'react';
import useDialogFocus from './useDialogFocus';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { archiveLabels, exitDetailRows, formatRecordDate, formatArchiveRecordText } from './archiveRecord';

const FEEDS_SHOWN = 12;

const fill = (template, values) => template.replace(/\{\{(\w+)\}\}/g, (_, name) => (values[name] === undefined ? '' : String(values[name])));

async function copyText(value) {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const area = document.createElement('textarea');
  area.value = value;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  document.execCommand('copy');
  document.body.removeChild(area);
}

function Section({ title, children, action = null }) {
  return (
    <section className="archive-record__section">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="archive-record__heading">{title}</h3>
        {action}
      </div>
      <div className="mt-2">{children}</div>
    </section>
  );
}

/**
 * An archived snake's record. Reads only, except for the parts the archive keeps open: the exit
 * details (through `onEditExit`), erasing the buyer's contact, dated notes, returning the snake
 * and deleting it for good.
 */
export default function ArchivedAnimalRecord({
  data,
  locale,
  onClose,
  onEditExit,
  onEraseContact,
  onAddNote,
  onReturn,
  onDelete,
  onDownloadPdf,
  onOpenAnimal,
  showAppAlert,
  showAppConfirm,
}) {
  const { t } = useTranslation();
  const labels = useMemo(() => archiveLabels(t), [t]);
  const [noteDraft, setNoteDraft] = useState('');
  const [noteError, setNoteError] = useState('');
  const [returning, setReturning] = useState(false);
  const [returnDate, setReturnDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [returnNote, setReturnNote] = useState('');
  const [returnError, setReturnError] = useState('');
  const [allFeeds, setAllFeeds] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [pdfBusy, setPdfBusy] = useState(false);
  const dialogRef = useDialogFocus(onClose, { active: Boolean(data), initialFocus: '.archive-record__close' });
  const returnRef = useRef(null);
  // The return form opens at the bottom of a long record: bring it into view and put the
  // cursor in its first field, so the button is never hunted for below the fold.
  useEffect(() => {
    if (!returning || !returnRef.current) return;
    returnRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    returnRef.current.querySelector('input')?.focus({ preventScroll: true });
  }, [returning]);

  if (!data || typeof document === 'undefined') return null;
  const d = (value) => formatRecordDate(value, locale);
  const a = data.animal;
  const exit = data.exit;
  const rows = exitDetailRows(exit, labels, { locale });
  const hasContact = Boolean(exit.counterpartyName || exit.counterpartyContact);
  const feeds = allFeeds ? data.feeds : data.feeds.slice(0, FEEDS_SHOWN);

  const flash = (message) => {
    setFeedback(message);
    window.setTimeout(() => setFeedback(''), 2400);
  };

  const handleCopy = async () => {
    try {
      await copyText(formatArchiveRecordText(data, labels, { locale }));
      flash(t('archive.record.copied', { defaultValue: 'Record copied' }));
    } catch (_) {
      showAppAlert?.(t('archive.record.copyFailed', { defaultValue: 'The record could not be copied.' }));
    }
  };

  const handlePdf = async () => {
    if (pdfBusy) return;
    setPdfBusy(true);
    try {
      await onDownloadPdf();
    } catch (err) {
      console.error('Archive PDF failed', err);
      showAppAlert?.(t('archive.record.pdfFailed', { defaultValue: 'The PDF could not be created.' }));
    } finally {
      setPdfBusy(false);
    }
  };

  const handleAddNote = () => {
    try {
      onAddNote(noteDraft);
      setNoteDraft('');
      setNoteError('');
    } catch (err) {
      setNoteError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleErase = async () => {
    const ok = showAppConfirm
      ? await showAppConfirm(t('archive.record.eraseConfirm', { defaultValue: 'Erase the buyer or recipient name and contact from this record? This cannot be undone. The rest of the record stays.' }), {
        title: t('archive.record.eraseTitle', { defaultValue: 'Erase buyer contact?' }),
        confirmLabel: t('archive.record.eraseConfirmLabel', { defaultValue: 'Erase contact' }),
        tone: 'danger',
      })
      : window.confirm(t('archive.record.eraseConfirm', { defaultValue: 'Erase the buyer or recipient name and contact from this record? This cannot be undone. The rest of the record stays.' }));
    if (ok) onEraseContact();
  };

  const handleReturn = (event) => {
    event.preventDefault();
    try {
      onReturn({ date: returnDate, note: returnNote });
    } catch (err) {
      setReturnError(err instanceof Error ? err.message : String(err));
    }
  };

  const reasonLabel = labels.reasons[exit.reason] || exit.reason;

  return createPortal((
    <div className="sk-scrim fixed inset-0 flex items-stretch sm:items-center justify-center sm:p-4 z-[10025]" onClick={onClose}>
      <div
        ref={dialogRef}
        className="archive-record relative bg-white w-full sm:max-w-3xl sm:rounded-2xl shadow-2xl border flex flex-col max-h-[100dvh] sm:max-h-[92vh]"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="archive-record-title"
      >
        <header className="archive-record__header flex gap-4 p-5 border-b">
          {a.photo ? (
            <img src={a.photo} alt="" className="archive-record__photo" />
          ) : (
            <div className="archive-record__photo archive-record__photo--empty" aria-hidden="true">{a.sexCode}</div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`archive-reason-badge archive-reason-badge--${exit.reason}`}>{reasonLabel}</span>
              <span className="text-xs text-neutral-500">{exit.date ? d(exit.date) : labels.dateNotRecorded}</span>
            </div>
            <h2 id="archive-record-title" className="mt-1 text-xl font-semibold leading-tight break-words">{a.name || a.id}</h2>
            <p className="text-sm text-neutral-600">
              {[a.name && a.id ? a.id : '', `${a.sexCode} ${labels.sex[a.sex] || ''}`.trim(), a.species].filter(Boolean).join(' · ')}
            </p>
            {a.genetics && <p className="mt-1 text-sm font-medium break-words">{a.genetics}</p>}
            <p className="mt-1 text-xs text-neutral-500">
              {[
                a.birthDate ? `${labels.hatched} ${d(a.birthDate)}` : '',
                a.sire || a.dam ? `${labels.parents}: ${[a.sire?.name, a.dam?.name].filter(Boolean).join(' × ')}` : '',
                data.lastWeight ? `${labels.lastWeight}\u00a0${data.lastWeight.grams}\u00a0g` : '',
              ].filter(Boolean).join(' · ')}
            </p>
          </div>
          <button type="button" className="archive-record__close self-start text-sm px-2 py-1" onClick={onClose} aria-label={t('common.close', { defaultValue: 'Close' })}>
            ✕
          </button>
        </header>

        <div className="archive-record__actions flex flex-wrap gap-2 px-5 py-3 border-b">
          <button type="button" className="px-3 py-2 rounded-xl text-sm appearance-btn appearance-btn--filled" onClick={handlePdf} disabled={pdfBusy}>
            {pdfBusy ? t('archive.record.pdfBusy', { defaultValue: 'Preparing PDF…' }) : t('archive.record.downloadPdf', { defaultValue: 'Download PDF' })}
          </button>
          <button type="button" className="px-3 py-2 rounded-xl text-sm border" onClick={handleCopy}>
            {t('archive.record.copyText', { defaultValue: 'Copy as text' })}
          </button>
          <span className="text-sm text-neutral-600 self-center" role="status" aria-live="polite">{feedback}</span>
        </div>

        <div className="archive-record__body overflow-y-auto px-5 py-4 flex flex-col gap-6">
          <Section
            title={labels.exit}
            action={(
              <button type="button" className="archive-record__link text-sm" onClick={onEditExit}>
                {t('archive.record.editDetails', { defaultValue: 'Correct details' })}
              </button>
            )}
          >
            <dl className="archive-record__pairs">
              {rows.map(row => (
                <React.Fragment key={row.label}>
                  <dt>{row.label}</dt>
                  <dd className={row.missing ? 'text-neutral-500' : ''}>{row.value}</dd>
                </React.Fragment>
              ))}
            </dl>
            {!exit.recorded && (
              <p className="mt-2 text-xs text-neutral-500">
                {t('archive.record.sweptIn', { defaultValue: 'Moved here automatically because its status was {{status}}. Use "Correct details" to record the date and who it went to.', status: reasonLabel })}
              </p>
            )}
            {exit.erasedContactAt && (
              <p className="mt-2 text-xs text-neutral-500">{fill(labels.contactErased, { date: d(exit.erasedContactAt) })}</p>
            )}
            {hasContact && (
              <button type="button" className="archive-record__link archive-record__link--small mt-1" onClick={handleErase}>
                {t('archive.record.eraseContact', { defaultValue: 'Erase buyer contact' })}
              </button>
            )}
          </Section>

          <Section title={labels.notes}>
            {exit.notes.length > 0 && (
              <ol className="archive-record__notes">
                {exit.notes.map(note => (
                  <li key={note.id}>
                    <span className="text-xs text-neutral-500">{d(note.at)}</span>
                    <p className="text-sm whitespace-pre-wrap break-words">{note.text}</p>
                  </li>
                ))}
              </ol>
            )}
            <div className="mt-2 flex flex-col sm:flex-row gap-2">
              <textarea
                className="border rounded-xl px-3 py-2 bg-white text-sm flex-1"
                rows={2}
                value={noteDraft}
                onChange={e => setNoteDraft(e.target.value)}
                maxLength={4000}
                placeholder={t('archive.record.notePlaceholder', { defaultValue: 'Add a dated note: a necropsy result, news from the buyer…' })}
                aria-label={t('archive.record.addNote', { defaultValue: 'Add note' })}
              />
              <button type="button" className="px-3 py-2 rounded-xl text-sm border self-start sm:self-end" onClick={handleAddNote} disabled={!noteDraft.trim()}>
                {t('archive.record.addNote', { defaultValue: 'Add note' })}
              </button>
            </div>
            <p className="mt-1 text-xs text-neutral-500">{t('archive.record.notesPermanent', { defaultValue: 'Notes are kept as written; they cannot be edited or removed.' })}</p>
            {noteError && <p className="text-sm text-red-700" role="alert">{noteError}</p>}
          </Section>

          {data.previous.length > 0 && (
            <Section title={labels.previousPeriods}>
              <ul className="flex flex-col gap-1 text-sm">
                {data.previous.map((period, index) => (
                  <li key={`${period.archivedAt}-${index}`}>
                    {labels.reasons[period.reason] || period.reason}, {period.date ? d(period.date) : labels.dateNotRecorded}
                    {' → '}{fill(labels.returned, { date: d(period.returnDate) })}
                    {period.returnNote && <span className="text-neutral-500"> · {period.returnNote}</span>}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section title={labels.breeding}>
            {data.pairings.length === 0 ? (
              <p className="text-sm text-neutral-500">{labels.noBreeding}</p>
            ) : (
              <ul className="archive-record__list">
                {data.pairings.map(p => (
                  <li key={p.id}>
                    <div className="text-sm">
                      <span className="font-medium">{p.year}</span>{' '}
                      {onOpenAnimal && p.partnerId ? (
                        <button type="button" className="archive-record__link" onClick={() => onOpenAnimal(p.partnerId)}>{fill(labels.pairedWith, { name: p.partnerName })}</button>
                      ) : fill(labels.pairedWith, { name: p.partnerName })}
                    </div>
                    <div className="text-xs text-neutral-600">
                      {[
                        p.clutchRecorded ? fill(labels.clutch, { date: d(p.clutchDate), eggs: p.eggs, fertile: p.fertile }) : '',
                        p.hatched !== null ? fill(labels.hatchedCount, { count: p.hatched }) : '',
                        labels.closure[p.completionReason] || '',
                        p.completed ? '' : labels.stillOpen,
                      ].filter(Boolean).join(' · ')}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {data.offspring.length > 0 && (
              <p className="mt-2 text-sm">
                <span className="text-neutral-600">{labels.offspring}: </span>
                {data.offspring.map((o, index) => (
                  <React.Fragment key={o.id}>
                    {index > 0 && ', '}
                    {onOpenAnimal ? (
                      <button type="button" className="archive-record__link" onClick={() => onOpenAnimal(o.id)}>{o.name}</button>
                    ) : o.name}
                    {o.left && <span className="text-neutral-500"> ({labels.reasons[o.left] || labels.archivedMarker})</span>}
                  </React.Fragment>
                ))}
              </p>
            )}
          </Section>

          <Section title={labels.feeding}>
            {data.feeds.length === 0 ? (
              <p className="text-sm text-neutral-500">{labels.noFeeds}</p>
            ) : (
              <>
                <p className="text-xs text-neutral-600">{fill(labels.feedingSummary, { count: data.feedTotals.count, refused: data.feedTotals.refused })}</p>
                <table className="archive-record__table mt-2">
                  <caption className="sr-only">{labels.feeding}</caption>
                  <thead className="sr-only">
                    <tr>
                      <th scope="col">{labels.date}</th>
                      <th scope="col">{t('archive.record.food', { defaultValue: 'Food' })}</th>
                      <th scope="col">{t('archive.record.feedWeight', { defaultValue: 'Prey weight' })}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {feeds.map((feed, index) => (
                      <tr key={`${feed.date}-${index}`}>
                        <td className="text-neutral-500 whitespace-nowrap">{d(feed.date)}</td>
                        <td className={feed.refused ? 'archive-record__refused' : ''}>{feed.refused ? labels.refused : feed.food}</td>
                        <td className="text-right whitespace-nowrap">{feed.grams ? `${feed.grams} g` : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {data.feeds.length > FEEDS_SHOWN && (
                  <button type="button" className="archive-record__link mt-2 text-sm" onClick={() => setAllFeeds(v => !v)}>
                    {allFeeds
                      ? t('archive.record.showFewerFeeds', { defaultValue: 'Show fewer' })
                      : t('archive.record.showAllFeeds', { defaultValue: 'Show all {{count}} feeds', count: data.feeds.length })}
                  </button>
                )}
              </>
            )}
          </Section>

          {data.weights.length > 0 && (
            <Section title={labels.weights}>
              <ul className="archive-record__weights">
                {data.weights.map((w, index) => (
                  <li key={`${w.date}-${index}`}>
                    <span className="text-neutral-500">{d(w.date)}</span> <strong>{w.grams} g</strong>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section title={t('archive.record.manage', { defaultValue: 'Manage' })}>
            {!returning ? (
              <div className="flex flex-col items-start gap-4">
                <button type="button" className="px-3 py-2 rounded-xl text-sm border" onClick={() => setReturning(true)}>
                  {t('archive.record.returnAction', { defaultValue: 'Returned to the collection…' })}
                </button>
                {/* Permanent deletion is the rarest and least reversible action here, so it is
                    the quietest: a danger-coloured text button, set apart, not a filled one. */}
                <div className="archive-record__danger-zone">
                  <button type="button" className="archive-record__delete" onClick={onDelete}>
                    {t('archive.record.deleteAction', { defaultValue: 'Delete permanently' })}
                  </button>
                </div>
              </div>
            ) : (
              <form ref={returnRef} className="archive-record__return flex flex-col gap-2" onSubmit={handleReturn}>
                <p className="text-sm text-neutral-600">
                  {t('archive.record.returnLead', { defaultValue: 'For a buyback, a returned sale, or an animal found again. The time it spent away stays on its record.' })}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-[10rem_minmax(0,1fr)] gap-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium">{t('archive.record.returnDate', { defaultValue: 'Returned on' })}</span>
                    <input type="date" className="border rounded-xl px-3 py-2 bg-white text-sm" value={returnDate} onChange={e => setReturnDate(e.target.value)} required />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium">{labels.note}</span>
                    <input className="border rounded-xl px-3 py-2 bg-white text-sm" value={returnNote} onChange={e => setReturnNote(e.target.value)} maxLength={4000} />
                  </label>
                </div>
                {returnError && <p className="text-sm text-red-700" role="alert">{returnError}</p>}
                <div className="flex gap-2">
                  <button type="button" className="px-3 py-2 rounded-xl text-sm border" onClick={() => setReturning(false)}>{t('common.cancel', { defaultValue: 'Cancel' })}</button>
                  <button type="submit" className="px-3 py-2 rounded-xl text-sm appearance-btn appearance-btn--filled">{t('archive.record.returnConfirm', { defaultValue: 'Return to collection' })}</button>
                </div>
              </form>
            )}
          </Section>
        </div>
      </div>
    </div>
  ), document.body);
}
