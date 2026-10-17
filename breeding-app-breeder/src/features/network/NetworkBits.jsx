import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { ImageIcon, MagnifyingGlassIcon, XIcon } from '@phosphor-icons/react';
import { networkApi } from './networkApi.js';
import { cleanHandleInput, genesLine, initialsOf, personName } from './networkFormat.js';

export function Avatar({ person }) {
  return <span className="bn-avatar" aria-hidden="true">{initialsOf(person)}</span>;
}

export function StatusChip({ status }) {
  const { t } = useTranslation();
  if (!status) return null;
  const labels = {
    pending: t('network.status.pending', { defaultValue: 'Waiting' }),
    accepted: t('network.status.accepted', { defaultValue: 'Accepted' }),
    declined: t('network.status.declined', { defaultValue: 'Declined' }),
    cancelled: t('network.status.cancelled', { defaultValue: 'Cancelled' }),
    returned: t('network.status.returned', { defaultValue: 'Returned' }),
    proposed: t('network.status.proposed', { defaultValue: 'Invited' }),
    active: t('network.status.active', { defaultValue: 'Active' }),
    completed: t('network.status.completed', { defaultValue: 'Completed' }),
    open: t('network.status.open', { defaultValue: 'Open' }),
    rejected: t('network.status.rejected', { defaultValue: 'Turned down' }),
    superseded: t('network.status.superseded', { defaultValue: 'Replaced' }),
  };
  return <span className={`bn-chip bn-chip--${status === 'open' ? 'pending' : status}`}>{labels[status] || status}</span>;
}

/** A snake as a small card: photo, name, genes, ID. */
export function AnimalMini({ animal, extra = null }) {
  if (!animal) return null;
  const genes = genesLine(animal);
  return (
    <div className="bn-animal">
      {animal.imageUrl ? (
        <img className="bn-animal__photo" src={animal.imageUrl} alt="" loading="lazy" />
      ) : (
        <span className="bn-animal__photo" aria-hidden="true"><ImageIcon size={20} /></span>
      )}
      <div style={{ minWidth: 0 }}>
        <div className="bn-animal__name">{animal.name || animal.appAnimalId}</div>
        {genes ? <div className="bn-animal__genes">{genes}</div> : null}
        <div className="bn-animal__id">
          <bdi>{animal.appAnimalId}</bdi>
          {animal.sex ? ` · ${animal.sex}` : ''}
          {animal.year ? ` · ${animal.year}` : ''}
        </div>
        {extra}
      </div>
    </div>
  );
}

/** A modal sheet: centred on desktop, from the bottom on a phone. Escape and the scrim close it. */
export function NetworkDialog({ title, onClose, children, footer = null, labelledBy }) {
  const { t } = useTranslation();
  const generated = useId();
  const titleId = labelledBy || `bn-dialog-${generated}`;
  const panelRef = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    const first = panelRef.current?.querySelector('input, select, textarea, button:not([data-close])');
    first?.focus?.();
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose?.();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [onClose]);
  return createPortal(
    <div className="bn-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="bn-dialog__scrim sk-scrim" onClick={onClose} />
      <div className="bn-dialog__panel" ref={panelRef}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <h2 className="bn-dialog__title" id={titleId} style={{ flex: 1 }}>{title}</h2>
          <button type="button" className="bn-btn bn-btn--ghost bn-btn--icon" data-close onClick={onClose} aria-label={t('network.close', { defaultValue: 'Close' })}>
            <XIcon size={16} />
          </button>
        </div>
        {children}
        {footer ? <div className="bn-row-actions" style={{ justifyContent: 'flex-end' }}>{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

/** Find a breeder by handle. Calls onPick(person) with the chosen one. */
export function PersonPicker({ value, onPick, label }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [people, setPeople] = useState([]);
  const [searching, setSearching] = useState(false);
  const inputId = useId();

  useEffect(() => {
    const q = cleanHandleInput(query);
    if (q.length < 2) {
      setPeople([]);
      return undefined;
    }
    let live = true;
    setSearching(true);
    const timer = setTimeout(() => {
      networkApi.people(q)
        .then((res) => { if (live) setPeople(Array.isArray(res?.people) ? res.people : []); })
        .catch(() => { if (live) setPeople([]); })
        .finally(() => { if (live) setSearching(false); });
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query]);

  if (value) {
    return (
      <div className="bn-field">
        <span>{label || t('network.people.to', { defaultValue: 'To' })}</span>
        <div className="bn-picked">
          <Avatar person={value} />
          <div>
            <div style={{ fontWeight: 600 }}>{personName(value)}</div>
            <div className="bn-thread__handle">@{value.handle}</div>
          </div>
          <button type="button" className="bn-btn bn-btn--ghost bn-btn--sm" onClick={() => onPick(null)}>
            {t('network.people.change', { defaultValue: 'Change' })}
          </button>
        </div>
      </div>
    );
  }
  const q = cleanHandleInput(query);
  return (
    <div className="bn-field">
      <label htmlFor={inputId}>{label || t('network.people.to', { defaultValue: 'To' })}</label>
      <div style={{ position: 'relative' }}>
        <input
          id={inputId}
          className="bn-input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('network.people.placeholder', { defaultValue: '@handle' })}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          style={{ paddingInlineStart: '2rem' }}
        />
        <MagnifyingGlassIcon size={16} style={{ position: 'absolute', insetInlineStart: '0.6rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--sk-text-muted)' }} aria-hidden="true" />
      </div>
      <small>{t('network.people.hint', { defaultValue: 'Breeders are found by their @handle only. Ask them for it.' })}</small>
      {q.length >= 2 && !searching && !people.length ? (
        <small>{t('network.people.none', { defaultValue: 'Nobody uses a handle starting with @{{q}}.', q })}</small>
      ) : null}
      {people.length ? (
        <ul className="bn-people">
          {people.map((person) => (
            <li key={person.id}>
              <button type="button" onClick={() => { onPick(person); setQuery(''); }}>
                <Avatar person={person} />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontWeight: 600 }}>{personName(person)}</span>
                  <span className="bn-thread__handle">@{person.handle}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** A select of the keeper's own animals. */
export function AnimalSelect({ animals, value, onChange, label, hint, emptyText }) {
  const { t } = useTranslation();
  const id = useId();
  return (
    <div className="bn-field">
      <label htmlFor={id}>{label}</label>
      {animals.length ? (
        <select id={id} className="bn-input" value={value || ''} onChange={(event) => onChange(event.target.value)}>
          <option value="">{t('network.animal.choose', { defaultValue: 'Choose an animal' })}</option>
          {animals.map((animal) => (
            <option key={animal.id} value={animal.id}>
              {`${animal.name || animal.id} (${animal.id})${animal.sex ? ` · ${animal.sex}` : ''}`}
            </option>
          ))}
        </select>
      ) : (
        <small>{emptyText}</small>
      )}
      {hint ? <small>{hint}</small> : null}
    </div>
  );
}

export function ErrorNote({ error }) {
  if (!error) return null;
  return <div className="bn-error" role="alert">{error}</div>;
}
