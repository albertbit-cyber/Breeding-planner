import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowSquareOutIcon, StorefrontIcon } from '@phosphor-icons/react';
import { networkApi, errorText } from './networkApi.js';
import { isPermanentKind, shortDate } from './networkFormat.js';
import { AnimalMini, ErrorNote, StatusChip, useConfirm } from './NetworkBits.jsx';

/** What a transfer offer looks like in the conversation, with the answer buttons for whoever answers. */
export function TransferCard({ transfer, meId, onChanged, onCollectionChanged, onOpenAnimal }) {
  const { t, i18n } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmElement, ask] = useConfirm();
  if (!transfer) return null;
  const incoming = transfer.receiverUserId === meId;
  const kindLabel = {
    sale: t('network.transfer.kind.sale', { defaultValue: 'Sale' }),
    gift: t('network.transfer.kind.gift', { defaultValue: 'Gift' }),
    trade: t('network.transfer.kind.trade', { defaultValue: 'Trade' }),
    loan: t('network.transfer.kind.loan', { defaultValue: 'Loan' }),
    split: t('network.transfer.kind.split', { defaultValue: 'Clutch split' }),
  }[transfer.kind] || transfer.kind;

  const act = async (fn, pull) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      onChanged?.();
      if (pull) onCollectionChanged?.();
    } catch (err) {
      setError(errorText(err, t('network.actionFailed', { defaultValue: 'That did not work. Try again.' })));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bn-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'center' }}>
        <span className="bn-card__label">
          {transfer.kind === 'loan'
            ? t('network.transfer.cardLoan', { defaultValue: 'Loan offer' })
            : t('network.transfer.cardTitle', { defaultValue: 'Transfer · {{kind}}', kind: kindLabel })}
        </span>
        <StatusChip status={transfer.status} />
      </div>
      <AnimalMini animal={transfer.animal} />
      {transfer.reason ? <div className="bn-reason">{transfer.reason}</div> : null}
      {transfer.kind === 'loan' && transfer.loanUntil ? (
        <div className="bn-note">{t('network.transfer.loanUntilLine', { defaultValue: 'Until {{date}}', date: shortDate(transfer.loanUntil, i18n.language) })}</div>
      ) : null}
      {transfer.status === 'pending' ? (
        <p className="bn-note">
          {incoming
            ? isPermanentKind(transfer.kind)
              ? t('network.transfer.incomingPermanent', { defaultValue: 'Accept and the full record is copied into your collection.' })
              : t('network.transfer.incomingLoan', { defaultValue: 'Accept and a borrowed copy comes to your collection until the loan ends.' })
            : t('network.transfer.outgoingPending', { defaultValue: 'Nothing moves until they accept.' })}
        </p>
      ) : null}
      {transfer.status === 'pending' && incoming ? (
        <div className="bn-row-actions">
          <button type="button" className="bn-btn bn-btn--primary bn-btn--sm" disabled={busy} onClick={() => act(() => networkApi.respondTransfer(transfer.id, 'accept'), true)}>
            {t('network.transfer.accept', { defaultValue: 'Accept' })}
          </button>
          <button type="button" className="bn-btn bn-btn--ghost bn-btn--sm" disabled={busy} onClick={() => act(() => networkApi.respondTransfer(transfer.id, 'decline'))}>
            {t('network.transfer.decline', { defaultValue: 'Decline' })}
          </button>
        </div>
      ) : null}
      {transfer.status === 'pending' && !incoming ? (
        <div className="bn-row-actions">
          <button type="button" className="bn-btn bn-btn--ghost bn-btn--sm" disabled={busy} onClick={() => act(() => networkApi.respondTransfer(transfer.id, 'cancel'))}>
            {t('network.transfer.cancelOffer', { defaultValue: 'Cancel offer' })}
          </button>
        </div>
      ) : null}
      {transfer.status === 'accepted' && transfer.kind === 'loan' ? (
        <div className="bn-row-actions">
          <button
            type="button"
            className="bn-btn bn-btn--quiet bn-btn--sm"
            disabled={busy}
            onClick={async () => {
              const answer = await ask({
                title: t('network.transfer.endLoanTitle', { defaultValue: 'End the loan of {{animal}}?', animal: transfer.animal?.name || '' }),
                body: t('network.transfer.endLoanBody', { defaultValue: "The borrowed copy moves to the borrower's archive. The owner's record gets its old status back, plus the weights, feeds, sheds and medications logged during the loan." }),
                confirmLabel: t('network.transfer.endLoan', { defaultValue: 'End loan' }),
                note: true,
                noteLabel: t('network.transfer.returnNote', { defaultValue: 'Note on the record (optional)' }),
              });
              if (!answer.ok) return;
              act(() => networkApi.returnLoan(transfer.id, answer.note), true);
            }}
          >
            {t('network.transfer.endLoan', { defaultValue: 'End loan' })}
          </button>
        </div>
      ) : null}
      {transfer.status === 'accepted' && incoming ? (
        <div className="bn-success" role="status">
          {transfer.kind === 'loan'
            ? t('network.transfer.receivedLoan', { defaultValue: '{{animal}} is in your collection as borrowed, until the loan ends.', animal: transfer.animal?.name || '' })
            : t('network.transfer.received', { defaultValue: '{{animal}} is in your collection, with its record.', animal: transfer.animal?.name || '' })}
        </div>
      ) : null}
      {transfer.status === 'accepted' && onOpenAnimal && (incoming ? transfer.receiverAppAnimalId : transfer.animal?.appAnimalId) ? (
        <button
          type="button"
          className="bn-btn bn-btn--quiet bn-btn--sm"
          style={{ alignSelf: 'flex-start' }}
          onClick={() => onOpenAnimal(incoming ? transfer.receiverAppAnimalId : transfer.animal.appAnimalId)}
        >
          {t('network.transfer.openRecord', { defaultValue: 'Open record' })}
        </button>
      ) : null}
      <ErrorNote error={error} />
      {confirmElement}
    </div>
  );
}

/** A snake card someone shared. Opens the keeper's own record when it is theirs. */
export function AnimalShareCard({ animal, mine, ownsAnimal, onOpenAnimal }) {
  const { t } = useTranslation();
  if (!animal) return null;
  return (
    <div className="bn-card">
      <span className="bn-card__label">{t('network.card.snake', { defaultValue: 'Snake card' })}</span>
      <AnimalMini animal={animal} />
      {mine && ownsAnimal && onOpenAnimal ? (
        <button type="button" className="bn-linkbtn" style={{ alignSelf: 'flex-start', fontSize: '0.8rem' }} onClick={() => onOpenAnimal(animal.appAnimalId)}>
          {t('network.card.open', { defaultValue: 'Open record' })}
        </button>
      ) : null}
    </div>
  );
}

export function ListingCard({ listing }) {
  const { t } = useTranslation();
  if (!listing) return null;
  const price = listing.price != null && Number.isFinite(Number(listing.price))
    ? `${Number(listing.price).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${listing.currency || ''}`.trim()
    : null;
  return (
    <a className="bn-card" href={listing.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
      <span className="bn-card__label" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
        <StorefrontIcon size={14} aria-hidden="true" /> {t('network.card.listing', { defaultValue: 'Serpentora Market' })}
      </span>
      <div className="bn-animal">
        {listing.imageUrl ? <img className="bn-animal__photo" src={listing.imageUrl} alt="" loading="lazy" /> : <span className="bn-animal__photo" aria-hidden="true"><StorefrontIcon size={20} /></span>}
        <div style={{ minWidth: 0 }}>
          <div className="bn-animal__name">{listing.title}</div>
          {price ? <div className="bn-animal__genes">{price}</div> : null}
          <div className="bn-animal__id" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            {t('network.card.openListing', { defaultValue: 'Open listing' })} <ArrowSquareOutIcon size={12} aria-hidden="true" />
          </div>
        </div>
      </div>
    </a>
  );
}
