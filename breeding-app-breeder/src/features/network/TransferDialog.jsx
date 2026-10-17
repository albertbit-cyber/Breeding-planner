import React, { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { networkApi, errorText } from './networkApi.js';
import { TRANSFER_KINDS, isPermanentKind, personName, transferableAnimals } from './networkFormat.js';
import { AnimalSelect, ErrorNote, NetworkDialog, PersonPicker } from './NetworkBits.jsx';

/**
 * Offering an animal to another breeder. The reason is required: it is written onto both
 * animals' cards. The receiver gets a copy once they accept; what happens to the keeper's own
 * animal depends on the kind, and the dialog says which before anything is sent.
 */
export default function TransferDialog({ animals, presetAnimalId = '', presetPerson = null, onClose, onDone }) {
  const { t } = useTranslation();
  const reasonId = useId();
  const untilId = useId();
  const options = useMemo(() => transferableAnimals(animals), [animals]);
  const [person, setPerson] = useState(presetPerson);
  const [animalId, setAnimalId] = useState(options.some((a) => a.id === presetAnimalId) ? presetAnimalId : '');
  const [kind, setKind] = useState('sale');
  const [reason, setReason] = useState('');
  const [loanUntil, setLoanUntil] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const animal = options.find((a) => a.id === animalId) || null;

  const kindLabels = {
    sale: t('network.transfer.kind.sale', { defaultValue: 'Sale' }),
    gift: t('network.transfer.kind.gift', { defaultValue: 'Gift' }),
    trade: t('network.transfer.kind.trade', { defaultValue: 'Trade' }),
    loan: t('network.transfer.kind.loan', { defaultValue: 'Loan' }),
  };

  const consequence = isPermanentKind(kind)
    ? t('network.transfer.permanent', {
        defaultValue: 'Permanent. When {{who}} accepts, they get a copy of the full record and {{animal}} moves to your archive, with them as the new owner and your reason as the note.',
        who: person ? personName(person) : t('network.transfer.theReceiver', { defaultValue: 'the receiver' }),
        animal: animal?.name || t('network.transfer.theAnimal', { defaultValue: 'the animal' }),
      })
    : t('network.transfer.temporary', {
        defaultValue: 'Temporary. {{animal}} stays in your collection as On loan; {{who}} gets a copy marked as borrowed. When the loan ends, their copy goes to their archive and the weights and feeds they logged come back to your record.',
        who: person ? personName(person) : t('network.transfer.theReceiver', { defaultValue: 'the receiver' }),
        animal: animal?.name || t('network.transfer.theAnimal', { defaultValue: 'the animal' }),
      });

  const ready = person && animal && reason.trim().length >= 3;

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    setError('');
    try {
      const res = await networkApi.createTransfer({
        handle: person.handle,
        appAnimalId: animal.id,
        kind,
        reason: reason.trim(),
        loanUntil: kind === 'loan' && loanUntil ? loanUntil : undefined,
      });
      onDone?.(res?.transfer || null);
    } catch (err) {
      setError(errorText(err, t('network.transfer.failed', { defaultValue: 'The offer could not be sent.' })));
    } finally {
      setBusy(false);
    }
  };

  return (
    <NetworkDialog
      title={t('network.transfer.title', { defaultValue: 'Transfer an animal' })}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="bn-btn bn-btn--ghost" onClick={onClose}>{t('network.cancel', { defaultValue: 'Cancel' })}</button>
          <button type="button" className="bn-btn bn-btn--primary" onClick={submit} disabled={!ready || busy}>
            {busy ? t('network.sending', { defaultValue: 'Sending…' }) : t('network.transfer.send', { defaultValue: 'Send offer' })}
          </button>
        </>
      )}
    >
      <PersonPicker value={person} onPick={setPerson} label={t('network.transfer.to', { defaultValue: 'To' })} />
      <AnimalSelect
        animals={options}
        value={animalId}
        onChange={setAnimalId}
        label={t('network.transfer.animal', { defaultValue: 'Animal' })}
        emptyText={t('network.transfer.noAnimals', { defaultValue: 'No animal in your collection can be transferred. Archived, lent and borrowed animals cannot.' })}
      />
      <div className="bn-field" role="group" aria-label={t('network.transfer.kindLabel', { defaultValue: 'Kind of transfer' })}>
        <span>{t('network.transfer.kindLabel', { defaultValue: 'Kind of transfer' })}</span>
        <div className="bn-choices">
          {TRANSFER_KINDS.map((value) => (
            <button key={value} type="button" className="bn-choice" aria-pressed={kind === value} onClick={() => setKind(value)}>
              {kindLabels[value]}
            </button>
          ))}
        </div>
        <small>{consequence}</small>
      </div>
      {kind === 'loan' ? (
        <div className="bn-field">
          <label htmlFor={untilId}>{t('network.transfer.until', { defaultValue: 'Loan until (optional)' })}</label>
          <input id={untilId} type="date" className="bn-input" value={loanUntil} onChange={(event) => setLoanUntil(event.target.value)} />
        </div>
      ) : null}
      <div className="bn-field">
        <label htmlFor={reasonId}>{t('network.transfer.reason', { defaultValue: 'Reason for the transfer' })}</label>
        <textarea
          id={reasonId}
          className="bn-input"
          rows={3}
          maxLength={1000}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder={t('network.transfer.reasonPlaceholder', { defaultValue: 'e.g. Sold at the Hamm show, paid in cash' })}
        />
        <small>{t('network.transfer.reasonHint', { defaultValue: 'Required. It is written on the snake card in both collections.' })}</small>
      </div>
      <ErrorNote error={error} />
    </NetworkDialog>
  );
}
