import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeftIcon,
  ArrowsLeftRightIcon,
  DotsThreeIcon,
  EggIcon,
  ImageIcon,
  PaperclipIcon,
  PaperPlaneRightIcon,
  StorefrontIcon,
} from '@phosphor-icons/react';
import { errorCode, errorText, marketplaceListingUrl, networkApi } from './networkApi.js';
import { animalCardOf, personName, shortTime, transferableAnimals } from './networkFormat.js';
import { AnimalSelect, Avatar, ErrorNote, Handle, NetworkDialog, StatusChip, eventText, useConfirm } from './NetworkBits.jsx';
import { AnimalShareCard, ListingCard, TransferCard } from './MessageCards.jsx';
import ProjectPanel from './ProjectPanel.jsx';

const POLL_MS = 10_000;

/** Closes a small popover on Escape or a click outside it. */
function useDismiss(ref, open, close) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') close(); };
    const onDown = (event) => { if (ref.current && !ref.current.contains(event.target)) close(); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [ref, open, close]);
}

/** Enter sends on a keyboard; on a touch keyboard Enter is a new line and the button sends. */
const enterSends = () => typeof window === 'undefined' || !window.matchMedia || !window.matchMedia('(pointer: coarse)').matches;

/**
 * One conversation. Polls while it is open (there is no push channel yet), marks itself read,
 * and shows a message request as exactly that: the message, then accept, ignore or block.
 */
export default function ThreadView({ threadId, me, animals, onBack, onChanged, onCollectionChanged, onOpenAnimal, onStartTransfer, onStartProject }) {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [picker, setPicker] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [notice, setNotice] = useState('');
  const [announce, setAnnounce] = useState('');
  const [confirmElement, ask] = useConfirm();
  const listRef = useRef(null);
  const lastIdRef = useRef(null);
  const moreRef = useRef(null);
  const attachRef = useRef(null);
  useDismiss(moreRef, menuOpen, useCallback(() => setMenuOpen(false), []));
  useDismiss(attachRef, attachOpen, useCallback(() => setAttachOpen(false), []));
  const ownIds = useMemo(() => new Set((animals || []).map((a) => a.id)), [animals]);

  const load = useCallback(async ({ quiet = false } = {}) => {
    try {
      const res = await networkApi.thread(threadId);
      setData(res);
      if (!quiet) setError('');
      const newest = res?.messages?.[res.messages.length - 1]?.id || null;
      if (newest && newest !== lastIdRef.current) {
        const firstLoad = lastIdRef.current === null;
        // Tell a screen reader about a message that arrived while the thread was open.
        const latest = res.messages[res.messages.length - 1];
        if (!firstLoad && latest && !latest.mine && latest.sender) {
          setAnnounce(t('network.thread.newFrom', { defaultValue: 'New message from {{name}}', name: personName(latest.sender) }));
        }
        lastIdRef.current = newest;
        networkApi.markRead(threadId).then(() => onChanged?.()).catch(() => {});
        // A project opens on its panel; a conversation opens on its newest message, and follows new ones.
        if (!(firstLoad && res?.thread?.projectId)) {
          requestAnimationFrame(() => {
            const el = listRef.current;
            if (el) el.scrollTop = el.scrollHeight;
          });
        }
      }
    } catch (err) {
      if (!quiet) setError(errorText(err, t('network.thread.loadFailed', { defaultValue: 'The conversation could not be loaded.' })));
    }
  }, [threadId, onChanged, t]);

  useEffect(() => {
    lastIdRef.current = null;
    setData(null);
    load();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') load({ quiet: true });
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  const refresh = useCallback(() => {
    load({ quiet: true });
    setRefreshKey((k) => k + 1);
    onChanged?.();
  }, [load, onChanged]);

  const send = async (payload) => {
    setSending(true);
    setError('');
    try {
      await networkApi.send(threadId, payload);
      await load({ quiet: true });
      onChanged?.();
      return true;
    } catch (err) {
      setError(errorCode(err) === 'request_cap'
        ? t('network.thread.capReached', { defaultValue: 'Wait until they accept your message request before you write more.' })
        : errorText(err, t('network.thread.sendFailed', { defaultValue: 'The message was not sent.' })));
      return false;
    } finally {
      setSending(false);
    }
  };

  const submitText = async (event) => {
    event?.preventDefault?.();
    const body = draft.trim();
    if (!body || sending) return;
    if (await send({ kind: 'text', body })) setDraft('');
  };

  const setStatus = async (status) => {
    try {
      await networkApi.setThreadStatus(threadId, status);
      await load({ quiet: true });
      onChanged?.();
      if (status === 'ignored') onBack?.();
    } catch (err) {
      setError(errorText(err, t('network.actionFailed', { defaultValue: 'That did not work. Try again.' })));
    }
  };

  const block = async () => {
    const other = data?.thread?.other;
    if (!other) return;
    const answer = await ask({
      title: t('network.thread.blockTitle', { defaultValue: 'Block {{name}}?', name: personName(other) }),
      body: t('network.thread.blockConfirm', { defaultValue: 'Block {{name}}? They can no longer message you, send you animals or invite you to projects, here or on the marketplace.', name: personName(other) }),
      confirmLabel: t('network.thread.block', { defaultValue: 'Block' }),
      danger: true,
    });
    if (!answer.ok) return;
    try {
      await networkApi.block(other.id);
      onChanged?.();
      onBack?.();
    } catch (err) {
      setError(errorText(err, t('network.actionFailed', { defaultValue: 'That did not work. Try again.' })));
    }
  };

  const unblock = async () => {
    const other = data?.thread?.other;
    if (!other) return;
    try {
      await networkApi.unblock(other.id);
      await load({ quiet: true });
    } catch (err) {
      setError(errorText(err, t('network.actionFailed', { defaultValue: 'That did not work. Try again.' })));
    }
  };

  const report = async (message) => {
    const answer = await ask({
      title: t('network.thread.reportTitle', { defaultValue: 'Report this message' }),
      body: t('network.thread.reportPrompt', { defaultValue: 'Report this message to the Serpentora team. What is wrong with it?' }),
      confirmLabel: t('network.thread.reportSend', { defaultValue: 'Send report' }),
      note: true,
      noteLabel: t('network.thread.reportNote', { defaultValue: 'What is wrong (optional)' }),
    });
    if (!answer.ok) return;
    try {
      await networkApi.report(message.id, 'user_report', answer.note);
      setNotice(t('network.thread.reported', { defaultValue: 'Thank you. The team will look at it.' }));
    } catch (err) {
      setError(errorText(err, t('network.actionFailed', { defaultValue: 'That did not work. Try again.' })));
    }
  };

  const thread = data?.thread;
  const other = thread?.other;
  const isRequest = thread?.status === 'request';
  const isIgnored = thread?.status === 'ignored';
  const blocked = thread?.blocked;
  const othersWrote = (data?.messages || []).some((m) => !m.mine && m.sender);

  return (
    <div className="bn-thread">
      <div className="bn-thread__head">
        <button type="button" className="bn-btn bn-btn--ghost bn-btn--icon bn-back" onClick={onBack} aria-label={t('network.back', { defaultValue: 'Back' })}>
          <ArrowLeftIcon size={18} />
        </button>
        {other ? <Avatar person={other} /> : null}
        <div className="bn-thread__who">
          <div className="bn-thread__name">{other ? personName(other) : '…'}</div>
          {other?.handle ? <div className="bn-thread__handle"><Handle handle={other.handle} /></div> : null}
        </div>
        <div className="bn-attach" ref={moreRef}>
          <button type="button" className="bn-btn bn-btn--ghost bn-btn--icon" onClick={() => setMenuOpen((v) => !v)} aria-expanded={menuOpen} aria-label={t('network.thread.more', { defaultValue: 'More' })}>
            <DotsThreeIcon size={18} />
          </button>
          {menuOpen ? (
            <div className="bn-menu" style={{ insetBlockEnd: 'auto', insetBlockStart: 'calc(100% + 0.4rem)', insetInlineStart: 'auto', insetInlineEnd: 0 }}>
              {thread?.status !== 'ignored' ? (
                <button type="button" onClick={() => { setMenuOpen(false); setStatus('ignored'); }}>{t('network.thread.ignore', { defaultValue: 'Ignore conversation' })}</button>
              ) : (
                <button type="button" onClick={() => { setMenuOpen(false); setStatus('accepted'); }}>{t('network.thread.restore', { defaultValue: 'Move back to inbox' })}</button>
              )}
              {blocked === 'by_me' ? (
                <button type="button" onClick={() => { setMenuOpen(false); unblock(); }}>{t('network.thread.unblock', { defaultValue: 'Unblock' })}</button>
              ) : (
                <button type="button" onClick={() => { setMenuOpen(false); block(); }}>{t('network.thread.block', { defaultValue: 'Block' })}</button>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {isRequest && othersWrote ? (
        <div className="bn-request" role="status">
          <p>{t('network.thread.requestBanner', { defaultValue: '{{name}} wrote to you for the first time. They will not know you have read it until you reply or accept.', name: personName(other) })}</p>
          <div className="bn-row-actions">
            <button type="button" className="bn-btn bn-btn--primary bn-btn--sm" onClick={() => setStatus('accepted')}>{t('network.thread.accept', { defaultValue: 'Accept' })}</button>
            <button type="button" className="bn-btn bn-btn--ghost bn-btn--sm" onClick={() => setStatus('ignored')}>{t('network.thread.ignoreShort', { defaultValue: 'Ignore' })}</button>
            <button type="button" className="bn-btn bn-btn--danger bn-btn--sm" onClick={block}>{t('network.thread.block', { defaultValue: 'Block' })}</button>
          </div>
        </div>
      ) : null}
      {isIgnored ? <div className="bn-request" role="status"><p>{t('network.thread.ignoredBanner', { defaultValue: 'You ignored this conversation. Nothing from it notifies you.' })}</p></div> : null}

      <div className="bn-messages" ref={listRef}>
        {/* In the scroll, so a long project never squeezes the conversation or gets cut off. */}
        {thread?.projectId ? (
          <ProjectPanel projectId={thread.projectId} animals={animals} onChanged={refresh} onCollectionChanged={onCollectionChanged} refreshKey={refreshKey} />
        ) : null}
        {!data && !error ? <div className="bn-empty">{t('network.loading', { defaultValue: 'Loading…' })}</div> : null}
        {(data?.messages || []).map((message) => {
          if (message.kind === 'system' || !message.sender) {
            return <div key={message.id} className="bn-system">{eventText(message.attachment?.event, t, message.body)}</div>;
          }
          const a = message.attachment || {};
          let content;
          if (message.kind === 'transfer') {
            content = (
              <TransferCard
                transfer={a.transfer}
                meId={me?.id}
                onChanged={refresh}
                onCollectionChanged={onCollectionChanged}
                onOpenAnimal={onOpenAnimal}
              />
            );
          } else if (message.kind === 'animal') {
            content = <><AnimalShareCard animal={a.animal} mine={message.mine} ownsAnimal={ownIds.has(a.animal?.appAnimalId)} onOpenAnimal={onOpenAnimal} />{message.body ? <div className="bn-bubble">{message.body}</div> : null}</>;
          } else if (message.kind === 'listing') {
            content = <><ListingCard listing={a.listing} />{message.body ? <div className="bn-bubble">{message.body}</div> : null}</>;
          } else if (message.kind === 'split') {
            content = (
              <div className="bn-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                  <span className="bn-card__label">{t('network.split.proposalCard', { defaultValue: 'Split proposal' })}</span>
                  <StatusChip status={a.proposal?.status} />
                </div>
                <div>{message.body}</div>
              </div>
            );
          } else if (message.kind === 'project') {
            content = (
              <div className="bn-card">
                <span className="bn-card__label" style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}><EggIcon size={14} aria-hidden="true" />{t('network.project.cardLabel', { defaultValue: 'Joint project' })}</span>
                <div style={{ fontWeight: 600 }}>{a.project?.title}</div>
                {message.body ? <div className="bn-reason">{message.body}</div> : null}
              </div>
            );
          } else {
            content = <div className="bn-bubble">{message.deleted ? t('network.thread.deleted', { defaultValue: 'Message removed' }) : message.body}</div>;
          }
          return (
            <div key={message.id} className={`bn-msg${message.mine ? ' bn-msg--mine' : ''}`}>
              {content}
              <div className="bn-msg__time">
                <span>{shortTime(message.createdAt, i18n.language)}</span>
                {!message.mine ? (
                  <button
                    type="button"
                    className="bn-linkbtn"
                    onClick={() => report(message)}
                    aria-label={t('network.thread.reportFrom', { defaultValue: 'Report message from {{name}}', name: personName(message.sender) })}
                  >
                    {t('network.thread.report', { defaultValue: 'Report' })}
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
        {data && !data.messages?.length ? <div className="bn-empty">{t('network.thread.empty', { defaultValue: 'No messages yet.' })}</div> : null}
      </div>

      <ErrorNote error={error} />
      {notice ? <div className="bn-success" role="status" style={{ margin: '0 1rem 0.5rem' }}>{notice}</div> : null}
      <div className="bn-sr-only" aria-live="polite">{announce}</div>
      {confirmElement}
      {blocked === 'by_them' ? (
        <div className="bn-system" style={{ padding: '0.75rem' }}>{t('network.thread.notAccepting', { defaultValue: 'This breeder is not accepting messages from you.' })}</div>
      ) : blocked === 'by_me' ? (
        <div className="bn-system" style={{ padding: '0.75rem' }}>{t('network.thread.youBlocked', { defaultValue: 'You blocked this breeder. Unblock them to write again.' })}</div>
      ) : (
        <form className="bn-composer" onSubmit={submitText}>
          <div className="bn-attach" ref={attachRef}>
            <button type="button" className="bn-btn bn-btn--ghost bn-btn--icon" onClick={() => setAttachOpen((v) => !v)} aria-expanded={attachOpen} aria-label={t('network.thread.attach', { defaultValue: 'Attach' })}>
              <PaperclipIcon size={18} />
            </button>
            {attachOpen ? (
              <div className="bn-menu">
                <button type="button" onClick={() => { setAttachOpen(false); setPicker('animal'); }}><ImageIcon size={16} aria-hidden="true" />{t('network.thread.shareSnake', { defaultValue: 'Snake card' })}</button>
                <button type="button" onClick={() => { setAttachOpen(false); setPicker('listing'); }}><StorefrontIcon size={16} aria-hidden="true" />{t('network.thread.shareListing', { defaultValue: 'Marketplace link' })}</button>
                {thread?.kind === 'direct' ? (
                  <>
                    <button type="button" onClick={() => { setAttachOpen(false); onStartTransfer?.(other); }}><ArrowsLeftRightIcon size={16} aria-hidden="true" />{t('network.thread.transfer', { defaultValue: 'Transfer an animal' })}</button>
                    <button type="button" onClick={() => { setAttachOpen(false); onStartProject?.(other); }}><EggIcon size={16} aria-hidden="true" />{t('network.thread.project', { defaultValue: 'Start a joint project' })}</button>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
          <textarea
            className="bn-input"
            rows={1}
            value={draft}
            maxLength={4000}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && enterSends()) submitText(event);
            }}
            placeholder={t('network.thread.placeholder', { defaultValue: 'Write a message' })}
            aria-label={t('network.thread.placeholder', { defaultValue: 'Write a message' })}
          />
          <button type="submit" className="bn-btn bn-btn--primary bn-btn--icon" disabled={!draft.trim() || sending} aria-label={t('network.thread.send', { defaultValue: 'Send' })}>
            <PaperPlaneRightIcon size={18} />
          </button>
        </form>
      )}

      {picker === 'animal' ? (
        <SnakeCardPicker animals={animals} onClose={() => setPicker(null)} onSend={async (animal, body) => { if (await send({ kind: 'animal', body, attachment: { animal: animalCardOf(animal) } })) setPicker(null); }} />
      ) : null}
      {picker === 'listing' ? (
        <ListingPicker onClose={() => setPicker(null)} onSend={async (listing, body) => { if (await send({ kind: 'listing', body, attachment: { listing } })) setPicker(null); }} />
      ) : null}
    </div>
  );
}

function SnakeCardPicker({ animals, onClose, onSend }) {
  const { t } = useTranslation();
  const options = useMemo(() => transferableAnimals(animals), [animals]);
  const [animalId, setAnimalId] = useState('');
  const [body, setBody] = useState('');
  const animal = options.find((a) => a.id === animalId) || null;
  return (
    <NetworkDialog
      title={t('network.thread.shareSnakeTitle', { defaultValue: 'Share a snake card' })}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="bn-btn bn-btn--ghost" onClick={onClose}>{t('network.cancel', { defaultValue: 'Cancel' })}</button>
          <button type="button" className="bn-btn bn-btn--primary" disabled={!animal} onClick={() => onSend(animal, body.trim())}>{t('network.thread.send', { defaultValue: 'Send' })}</button>
        </>
      )}
    >
      <p className="bn-note">{t('network.thread.shareSnakeHint', { defaultValue: 'They see the name, ID, genetics and main photo. Notes, prices and logs stay private.' })}</p>
      <AnimalSelect animals={options} value={animalId} onChange={setAnimalId} label={t('network.transfer.animal', { defaultValue: 'Animal' })} emptyText={t('network.thread.noSnakes', { defaultValue: 'No animals in your collection yet.' })} />
      <textarea className="bn-input" rows={2} value={body} maxLength={4000} onChange={(event) => setBody(event.target.value)} placeholder={t('network.thread.addNote', { defaultValue: 'Add a note (optional)' })} aria-label={t('network.thread.addNote', { defaultValue: 'Add a note (optional)' })} />
    </NetworkDialog>
  );
}

function ListingPicker({ onClose, onSend }) {
  const { t } = useTranslation();
  const [listings, setListings] = useState(null);
  const [selected, setSelected] = useState('');
  const [url, setUrl] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    networkApi.myListings()
      // Only listings a stranger can open: a draft's link would be a dead page for them.
      .then((rows) => setListings(rows.filter((row) => row && row.id && ['available', 'reserved', 'sold'].includes(String(row.status || '')))))
      .catch(() => setListings([]));
  }, []);
  const chosen = (listings || []).find((row) => row.id === selected) || null;
  const pasted = url.trim();
  const valid = chosen || /^https?:\/\/\S+$/i.test(pasted);
  const submit = () => {
    if (!valid) {
      setError(t('network.thread.listingInvalid', { defaultValue: 'Choose one of your listings or paste a link that starts with https://' }));
      return;
    }
    const listing = chosen
      ? {
          id: chosen.id,
          url: marketplaceListingUrl(chosen.id),
          title: chosen.title || chosen.name || chosen.id,
          price: chosen.price ?? null,
          currency: chosen.currency || null,
          imageUrl: chosen.imageUrl || chosen.images?.[0]?.imageUrl || null,
        }
      : { url: pasted, title: pasted };
    onSend(listing, body.trim());
  };
  return (
    <NetworkDialog
      title={t('network.thread.shareListingTitle', { defaultValue: 'Share a marketplace link' })}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="bn-btn bn-btn--ghost" onClick={onClose}>{t('network.cancel', { defaultValue: 'Cancel' })}</button>
          <button type="button" className="bn-btn bn-btn--primary" onClick={submit}>{t('network.thread.send', { defaultValue: 'Send' })}</button>
        </>
      )}
    >
      <div className="bn-field">
        <span>{t('network.thread.yourListings', { defaultValue: 'Your listings' })}</span>
        {listings === null ? <small>{t('network.loading', { defaultValue: 'Loading…' })}</small> : null}
        {listings && !listings.length ? <small>{t('network.thread.noListings', { defaultValue: 'You have no listings on the marketplace. You can still paste any marketplace link below.' })}</small> : null}
        {listings && listings.length ? (
          <select className="bn-input" value={selected} onChange={(event) => { setSelected(event.target.value); setError(''); }}>
            <option value="">{t('network.thread.pickListing', { defaultValue: 'Choose a listing' })}</option>
            {listings.map((row) => <option key={row.id} value={row.id}>{row.title || row.name || row.id}</option>)}
          </select>
        ) : null}
      </div>
      {!chosen ? (
        <div className="bn-field">
          <span>{t('network.thread.orPaste', { defaultValue: 'Or paste a link' })}</span>
          <input className="bn-input" type="url" value={url} onChange={(event) => { setUrl(event.target.value); setError(''); }} placeholder="https://" />
        </div>
      ) : null}
      <textarea className="bn-input" rows={2} value={body} maxLength={4000} onChange={(event) => setBody(event.target.value)} placeholder={t('network.thread.addNote', { defaultValue: 'Add a note (optional)' })} aria-label={t('network.thread.addNote', { defaultValue: 'Add a note (optional)' })} />
      <ErrorNote error={error} />
    </NetworkDialog>
  );
}
