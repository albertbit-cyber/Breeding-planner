import React from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowsLeftRightIcon, EggIcon, ShareNetworkIcon } from '@phosphor-icons/react';
import { isOutOfCollection } from '../animals/archive.js';
import { normalizeSexValue } from '../animals/animalSex.js';
import { isForeignRecord, isLentOut, shortDate } from './networkFormat.js';
import './network.css';

const who = (handle, name) => (handle ? `@${handle}${name && name !== `@${handle}` ? ` (${name})` : ''}` : name || '');

/**
 * What the network wrote onto this snake's card: the transfer that brought it or took it away and
 * the reason given, a loan in either direction, a partner record from a joint project, and the
 * project's parents and incubator on a hatchling. Plus the actions that start from a snake.
 */
export default function NetworkRecordPanel({ snake, onOpenNetwork }) {
  const { t, i18n } = useTranslation();
  if (!snake) return null;
  const locale = i18n.language;
  const rows = [];

  const received = snake.transfer?.role === 'received' ? snake.transfer : null;
  if (received) {
    const kindLabel = {
      sale: t('network.transfer.kind.sale', { defaultValue: 'Sale' }),
      gift: t('network.transfer.kind.gift', { defaultValue: 'Gift' }),
      trade: t('network.transfer.kind.trade', { defaultValue: 'Trade' }),
      loan: t('network.transfer.kind.loan', { defaultValue: 'Loan' }),
      split: t('network.transfer.kind.split', { defaultValue: 'Clutch split' }),
    }[received.kind] || received.kind;
    rows.push([
      received.kind === 'loan' ? t('network.record.borrowedFrom', { defaultValue: 'Borrowed from' }) : t('network.record.receivedFrom', { defaultValue: 'Received from' }),
      `${who(received.fromHandle, received.fromName)} · ${kindLabel} · ${shortDate(received.at, locale)}`,
    ]);
    if (received.reason) rows.push([t('network.record.reason', { defaultValue: 'Reason' }), received.reason]);
    if (received.fromAnimalId) rows.push([t('network.record.theirId', { defaultValue: 'Their ID' }), received.fromAnimalId]);
  }
  if (snake.loan?.role === 'borrowed') {
    rows.push([
      t('network.record.loanStatus', { defaultValue: 'Loan' }),
      snake.loan.returnedAt
        ? t('network.record.loanReturned', { defaultValue: 'Returned {{date}}', date: shortDate(snake.loan.returnedAt, locale) })
        : snake.loan.until
          ? t('network.record.loanUntil', { defaultValue: 'Until {{date}}. It belongs to {{owner}}.', date: shortDate(snake.loan.until, locale), owner: who(snake.loan.ownerHandle, snake.loan.ownerName) })
          : t('network.record.loanOpen', { defaultValue: 'Open-ended. It belongs to {{owner}}.', owner: who(snake.loan.ownerHandle, snake.loan.ownerName) }),
    ]);
  }
  if (snake.loanedTo && isLentOut(snake)) {
    rows.push([
      t('network.record.lentTo', { defaultValue: 'On loan to' }),
      `${who(snake.loanedTo.toHandle, snake.loanedTo.toName)} · ${shortDate(snake.loanedTo.since, locale)}${snake.loanedTo.until ? ` → ${shortDate(snake.loanedTo.until, locale)}` : ''}`,
    ]);
    if (snake.loanedTo.reason) rows.push([t('network.record.reason', { defaultValue: 'Reason' }), snake.loanedTo.reason]);
  }
  if (snake.transferredTo) {
    rows.push([
      t('network.record.transferredTo', { defaultValue: 'Transferred to' }),
      `${who(snake.transferredTo.toHandle, snake.transferredTo.toName)} · ${shortDate(snake.transferredTo.at, locale)}`,
    ]);
    if (snake.transferredTo.reason) rows.push([t('network.record.reason', { defaultValue: 'Reason' }), snake.transferredTo.reason]);
  }
  if (snake.partnerRecord) {
    rows.push([
      t('network.record.partner', { defaultValue: 'Partner record' }),
      t('network.record.partnerText', {
        defaultValue: 'Belongs to {{owner}}: their male for the joint project "{{project}}". Read-only here, and it moves to your archive when the project ends.',
        owner: who(snake.partnerRecord.ownerHandle, snake.partnerRecord.ownerName),
        project: snake.partnerRecord.projectTitle || '',
      }),
    ]);
  }
  const jp = snake.jointProject;
  if (jp) {
    rows.push([t('network.record.project', { defaultValue: 'Joint project' }), jp.title || '']);
    rows.push([t('network.record.sire', { defaultValue: 'Sire' }), `${jp.sire?.name || '–'}${jp.sire?.ownerHandle ? ` · ${t('network.record.from', { defaultValue: 'from {{who}}', who: who(jp.sire.ownerHandle, jp.sire.ownerName) })}` : ''}`]);
    rows.push([t('network.record.dam', { defaultValue: 'Dam' }), `${jp.dam?.name || '–'}${jp.dam?.ownerHandle ? ` · ${t('network.record.from', { defaultValue: 'from {{who}}', who: who(jp.dam.ownerHandle, jp.dam.ownerName) })}` : ''}`]);
    if (jp.incubatedBy?.handle) rows.push([t('network.record.incubated', { defaultValue: 'Incubated by' }), who(jp.incubatedBy.handle, jp.incubatedBy.name)]);
    if (jp.split) rows.push([t('network.record.split', { defaultValue: 'Split' }), jp.split]);
  }

  const canAct = onOpenNetwork && !isOutOfCollection(snake) && !isForeignRecord(snake) && !isLentOut(snake) && snake.isDemo !== true;
  const sexed = ['M', 'F'].includes(normalizeSexValue(snake.sex));
  if (!rows.length && !canAct) return null;

  return (
    <div className="bn-record" data-help="record-network">
      <div className="bn-card__label">{t('network.record.title', { defaultValue: 'Breeder network' })}</div>
      {rows.length ? (
        <dl>
          {rows.map(([label, value], index) => (
            <React.Fragment key={`${label}-${index}`}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </React.Fragment>
          ))}
        </dl>
      ) : null}
      {canAct ? (
        <div className="bn-row-actions">
          <button type="button" className="bn-btn bn-btn--ghost bn-btn--sm" onClick={() => onOpenNetwork({ type: 'share', animalId: snake.id })}>
            <ShareNetworkIcon size={14} aria-hidden="true" />{t('network.record.share', { defaultValue: 'Send snake card' })}
          </button>
          <button type="button" className="bn-btn bn-btn--ghost bn-btn--sm" onClick={() => onOpenNetwork({ type: 'transfer', animalId: snake.id })}>
            <ArrowsLeftRightIcon size={14} aria-hidden="true" />{t('network.record.transfer', { defaultValue: 'Transfer or lend' })}
          </button>
          {sexed ? (
            <button type="button" className="bn-btn bn-btn--ghost bn-btn--sm" onClick={() => onOpenNetwork({ type: 'project', animalId: snake.id })}>
              <EggIcon size={14} aria-hidden="true" />{t('network.record.project', { defaultValue: 'Joint project' })}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
