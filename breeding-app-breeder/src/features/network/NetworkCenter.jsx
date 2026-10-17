import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowsLeftRightIcon, ChatsCircleIcon, EggIcon, PencilSimpleIcon, PlusIcon } from '@phosphor-icons/react';
import { hasStoredAuthSession } from '../../shared/apiClient';
import { errorCode, errorText, networkApi } from './networkApi.js';
import { animalCardOf, personName, shortTime } from './networkFormat.js';
import { Avatar, ErrorNote, Handle, NetworkDialog, PersonPicker, StatusChip, eventText } from './NetworkBits.jsx';
import { TransferCard } from './MessageCards.jsx';
import HandleSetup from './HandleSetup.jsx';
import ThreadView from './ThreadView.jsx';
import TransferDialog from './TransferDialog.jsx';
import ProjectDialog from './ProjectDialog.jsx';
import './network.css';

/**
 * Messages: talk to other breeders, hand animals over, and run joint projects.
 *
 * Left, the lists (inbox, requests, projects, transfers); right, the open conversation. On a
 * phone one pane shows at a time. `intent` lets other screens open it ready to act: share a
 * snake, transfer it, or start a project with it.
 */
export default function NetworkCenter({ animals, onCollectionChanged, onOpenAnimal, intent = null, onIntentHandled, onSummaryChanged }) {
  const { t, i18n } = useTranslation();
  const [me, setMe] = useState(undefined);
  const [meError, setMeError] = useState('');
  const [tab, setTab] = useState('inbox');
  const [showIgnored, setShowIgnored] = useState(false);
  const [threads, setThreads] = useState(null);
  const [projects, setProjects] = useState(null);
  const [transfers, setTransfers] = useState(null);
  const [counts, setCounts] = useState({ requests: 0, incomingTransfers: 0, projectInvites: 0, unreadThreads: 0 });
  const [activeThread, setActiveThread] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [editingHandle, setEditingHandle] = useState(false);
  const [listError, setListError] = useState('');
  const signedIn = hasStoredAuthSession();

  const loadMe = useCallback(async () => {
    if (!hasStoredAuthSession()) {
      setMe(null);
      return;
    }
    try {
      const res = await networkApi.me();
      setMe(res?.me || null);
      setMeError('');
    } catch (err) {
      setMe(null);
      setMeError(errorText(err, t('network.unavailable', { defaultValue: 'Messages need a connection to Serpentora. Check that you are signed in and online.' })));
    }
  }, [t]);

  useEffect(() => { loadMe(); }, [loadMe]);

  const loadLists = useCallback(async () => {
    if (!me?.handle) return;
    try {
      const box = tab === 'requests' ? (showIgnored ? 'ignored' : 'requests') : 'inbox';
      const [summary, list] = await Promise.all([
        networkApi.summary(),
        tab === 'projects' ? networkApi.projects() : tab === 'transfers' ? networkApi.transfers() : networkApi.threads(box),
      ]);
      setCounts({
        requests: summary?.requests || 0,
        incomingTransfers: summary?.incomingTransfers || 0,
        projectInvites: summary?.projectInvites || 0,
        unreadThreads: summary?.unreadThreads || 0,
      });
      if (tab === 'projects') setProjects(list?.projects || []);
      else if (tab === 'transfers') setTransfers(list?.transfers || []);
      else setThreads(list?.threads || []);
      setListError('');
      onSummaryChanged?.();
    } catch (err) {
      setListError(errorText(err, t('network.listFailed', { defaultValue: 'The list could not be loaded.' })));
    }
  }, [me?.handle, tab, showIgnored, onSummaryChanged, t]);

  useEffect(() => {
    loadLists();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') loadLists();
    }, 30_000);
    return () => clearInterval(timer);
  }, [loadLists]);

  // Another screen asked for something: open the matching dialog once.
  useEffect(() => {
    if (!intent || !me?.handle) return;
    if (intent.type === 'transfer') setDialog({ type: 'transfer', animalId: intent.animalId });
    else if (intent.type === 'project') setDialog({ type: 'project', animalId: intent.animalId });
    else if (intent.type === 'share') setDialog({ type: 'share', animalId: intent.animalId });
    else if (intent.type === 'thread' && intent.threadId) setActiveThread(intent.threadId);
    onIntentHandled?.();
  }, [intent, me?.handle, onIntentHandled]);

  const openThread = (id) => {
    setActiveThread(id);
  };

  const afterAction = useCallback((threadId) => {
    setDialog(null);
    if (threadId) setActiveThread(threadId);
    loadLists();
  }, [loadLists]);

  if (!signedIn || me === null) {
    return (
      <div className="bn-panel bn-empty" style={{ maxWidth: '34rem', margin: '2rem auto' }}>
        <strong>{t('network.title', { defaultValue: 'Messages' })}</strong>
        {meError || t('network.signedOut', { defaultValue: 'Sign in to your Serpentora account to talk to other breeders, hand animals over and run joint projects.' })}
        {meError ? <div style={{ marginBlockStart: '0.75rem' }}><button type="button" className="bn-btn bn-btn--ghost bn-btn--sm" onClick={loadMe}>{t('network.retry', { defaultValue: 'Try again' })}</button></div> : null}
      </div>
    );
  }
  if (me === undefined) {
    return <div className="bn-empty">{t('network.loading', { defaultValue: 'Loading…' })}</div>;
  }
  if (!me.handle || editingHandle) {
    return (
      <HandleSetup
        current={me.handle}
        onCancel={me.handle ? () => setEditingHandle(false) : null}
        onDone={(next) => { setMe(next); setEditingHandle(false); }}
      />
    );
  }

  const tabs = [
    { key: 'inbox', label: t('network.tabs.inbox', { defaultValue: 'Inbox' }), count: counts.unreadThreads },
    { key: 'requests', label: t('network.tabs.requests', { defaultValue: 'Requests' }), count: counts.requests },
    { key: 'projects', label: t('network.tabs.projects', { defaultValue: 'Projects' }), count: counts.projectInvites },
    { key: 'transfers', label: t('network.tabs.transfers', { defaultValue: 'Transfers' }), count: counts.incomingTransfers },
  ];

  return (
    <div className="bn-shell" data-pane={activeThread ? 'thread' : 'list'}>
      <aside className="bn-panel bn-sidebar" aria-label={t('network.title', { defaultValue: 'Messages' })}>
        <div className="bn-sidebar__head">
          <div className="bn-me">
            <span>{t('network.youAre', { defaultValue: 'You are' })} <strong><Handle handle={me.handle} /></strong></span>
            <button type="button" className="bn-btn bn-btn--ghost bn-btn--icon" onClick={() => setEditingHandle(true)} aria-label={t('network.handle.changeTitle', { defaultValue: 'Change your handle' })}>
              <PencilSimpleIcon size={14} />
            </button>
          </div>
          <div className="bn-actions">
            <button type="button" className="bn-btn bn-btn--primary bn-btn--sm" onClick={() => setDialog({ type: 'message' })}>
              <PlusIcon size={14} aria-hidden="true" />{t('network.newMessage', { defaultValue: 'New message' })}
            </button>
            <button type="button" className="bn-btn bn-btn--ghost bn-btn--sm" onClick={() => setDialog({ type: 'transfer' })}>
              <ArrowsLeftRightIcon size={14} aria-hidden="true" />{t('network.transferShort', { defaultValue: 'Transfer' })}
            </button>
            <button type="button" className="bn-btn bn-btn--ghost bn-btn--sm" onClick={() => setDialog({ type: 'project' })}>
              <EggIcon size={14} aria-hidden="true" />{t('network.projectShort', { defaultValue: 'Joint project' })}
            </button>
          </div>
        </div>
        <div className="bn-tabs" role="group" aria-label={t('network.title', { defaultValue: 'Messages' })}>
          {tabs.map((item) => (
            <button key={item.key} type="button" className="bn-tab" aria-pressed={tab === item.key} onClick={() => { setTab(item.key); setShowIgnored(false); }}>
              {item.label}
              {item.count ? <span className="bn-count">{item.count}</span> : null}
            </button>
          ))}
        </div>
        <ErrorNote error={listError} />
        {tab === 'inbox' || tab === 'requests' ? (
          <ThreadList
            threads={threads}
            activeThread={activeThread}
            onOpen={openThread}
            locale={i18n.language}
            empty={tab === 'requests'
              ? (showIgnored
                ? t('network.empty.ignored', { defaultValue: 'Nothing ignored.' })
                : t('network.empty.requests', { defaultValue: 'No message requests. When someone you have not talked to writes, it waits here until you accept, ignore or block.' }))
              : t('network.empty.inbox', { defaultValue: 'No conversations yet. Ask a breeder for their @handle and send them a message.' })}
            footer={tab === 'requests' ? (
              <button type="button" className="bn-linkbtn" style={{ margin: '0.6rem auto', display: 'block', fontSize: '0.8rem' }} onClick={() => setShowIgnored((v) => !v)}>
                {showIgnored ? t('network.showRequests', { defaultValue: 'Back to requests' }) : t('network.showIgnored', { defaultValue: 'Show ignored conversations' })}
              </button>
            ) : null}
          />
        ) : null}
        {tab === 'projects' ? (
          <ProjectList projects={projects} activeThread={activeThread} onOpen={openThread} />
        ) : null}
        {tab === 'transfers' ? (
          <TransferList transfers={transfers} me={me} onOpen={openThread} onChanged={loadLists} onCollectionChanged={onCollectionChanged} onOpenAnimal={onOpenAnimal} />
        ) : null}
      </aside>
      <main className="bn-panel bn-main" style={{ minWidth: 0 }}>
        {activeThread ? (
          <ThreadView
            key={activeThread}
            threadId={activeThread}
            me={me}
            animals={animals}
            onBack={() => setActiveThread(null)}
            onChanged={loadLists}
            onCollectionChanged={onCollectionChanged}
            onOpenAnimal={onOpenAnimal}
            onStartTransfer={(person) => setDialog({ type: 'transfer', person })}
            onStartProject={(person) => setDialog({ type: 'project', person })}
          />
        ) : (
          <div className="bn-empty" style={{ paddingTop: '4rem' }}>
            <ChatsCircleIcon size={40} aria-hidden="true" style={{ color: 'var(--sk-text-subtle)', display: 'block', margin: '0 auto 0.75rem' }} />
            <strong>{t('network.pickThread', { defaultValue: 'Pick a conversation' })}</strong>
            {t('network.pickThreadHint', { defaultValue: 'Send snake cards and marketplace links, hand animals over with their whole record, or breed together in a joint project.' })}
          </div>
        )}
      </main>

      {dialog?.type === 'message' || dialog?.type === 'share' ? (
        <NewMessageDialog
          onClose={() => setDialog(null)}
          onDone={(threadId) => afterAction(threadId)}
          shareAnimal={dialog.type === 'share' ? (animals || []).find((a) => a.id === dialog.animalId) || null : null}
        />
      ) : null}
      {dialog?.type === 'transfer' ? (
        <TransferDialog
          animals={animals}
          presetAnimalId={dialog.animalId || ''}
          presetPerson={dialog.person || null}
          onClose={() => setDialog(null)}
          onDone={(transfer) => afterAction(transfer?.threadId)}
        />
      ) : null}
      {dialog?.type === 'project' ? (
        <ProjectDialog
          animals={animals}
          presetAnimalId={dialog.animalId || ''}
          presetPerson={dialog.person || null}
          onClose={() => setDialog(null)}
          onDone={(project) => { setTab('projects'); afterAction(project?.threadId); }}
        />
      ) : null}
    </div>
  );
}

function ThreadList({ threads, activeThread, onOpen, empty, footer, locale }) {
  const { t } = useTranslation();
  if (threads === null) return <div className="bn-empty">{t('network.loading', { defaultValue: 'Loading…' })}</div>;
  return (
    <>
      {threads.length ? (
        <ul className="bn-list">
          {threads.map((thread) => (
            <li key={thread.id}>
              <button
                type="button"
                className={`bn-row${thread.unread ? ' bn-row--unread' : ''}`}
                aria-current={activeThread === thread.id ? 'true' : undefined}
                onClick={() => onOpen(thread.id)}
              >
                <Avatar person={thread.other} />
                <span style={{ minWidth: 0 }}>
                  <span className="bn-row__title" style={{ display: 'block' }}>
                    {thread.project ? `${thread.project.title} · ` : ''}{personName(thread.other)}
                  </span>
                  <span className="bn-row__sub" style={{ display: 'block' }}>
                    {thread.lastMessage?.mine ? `${t('network.you', { defaultValue: 'You' })}: ` : ''}
                    {eventText(thread.lastMessage?.event, t, thread.lastMessage?.body || '')}
                  </span>
                </span>
                <span className="bn-row__meta">
                  <span>{shortTime(thread.lastMessageAt, locale)}</span>
                  {thread.unread ? <span className="bn-count">{thread.unread}</span> : null}
                  {!thread.unread && thread.project ? <StatusChip status={thread.project.status} /> : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="bn-empty">{empty}</div>
      )}
      {footer}
    </>
  );
}

function ProjectList({ projects, activeThread, onOpen }) {
  const { t } = useTranslation();
  if (projects === null) return <div className="bn-empty">{t('network.loading', { defaultValue: 'Loading…' })}</div>;
  if (!projects.length) {
    return <div className="bn-empty">{t('network.empty.projects', { defaultValue: 'No joint projects yet. Start one to breed your male with another breeder\'s female, or the other way round.' })}</div>;
  }
  return (
    <ul className="bn-list">
      {projects.map((project) => (
        <li key={project.id}>
          <button type="button" className="bn-row" aria-current={activeThread === project.threadId ? 'true' : undefined} onClick={() => onOpen(project.threadId)}>
            <span className="bn-avatar" aria-hidden="true"><EggIcon size={16} /></span>
            <span style={{ minWidth: 0 }}>
              <span className="bn-row__title" style={{ display: 'block' }}>{project.title}</span>
              <span className="bn-row__sub" style={{ display: 'block' }}>
                {[project.male?.name, project.female?.name].filter(Boolean).join(' × ')}
                {project.other ? <> · <Handle handle={project.other.handle} /></> : null}
              </span>
            </span>
            <span className="bn-row__meta">
              <StatusChip status={project.status} />
              {project.waitingOnMe ? <span className="bn-count">1</span> : null}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function TransferList({ transfers, me, onOpen, onChanged, onCollectionChanged, onOpenAnimal }) {
  const { t } = useTranslation();
  if (transfers === null) return <div className="bn-empty">{t('network.loading', { defaultValue: 'Loading…' })}</div>;
  if (!transfers.length) {
    return <div className="bn-empty">{t('network.empty.transfers', { defaultValue: 'No transfers yet. Animals you send or receive, and loans, show here.' })}</div>;
  }
  // Waiting on you first, then running loans, then the rest.
  const rank = (row) => (row.status === 'pending' && row.direction === 'incoming' ? 0 : row.status === 'pending' ? 1 : row.kind === 'loan' && row.status === 'accepted' ? 2 : 3);
  const sorted = [...transfers].sort((a, b) => rank(a) - rank(b));
  return (
    <ul className="bn-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '0.6rem' }}>
      {sorted.map((transfer) => {
        const other = transfer.direction === 'incoming' ? transfer.sender : transfer.receiver;
        return (
          <li key={transfer.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            <div className="bn-me">
              <span>
                <bdi>
                  {transfer.direction === 'incoming'
                    ? t('network.transfer.from', { defaultValue: 'From @{{handle}}', handle: other?.handle })
                    : t('network.transfer.toWho', { defaultValue: 'To @{{handle}}', handle: other?.handle })}
                </bdi>
              </span>
              {transfer.threadId ? (
                <button type="button" className="bn-linkbtn" style={{ fontSize: '0.78rem' }} onClick={() => onOpen(transfer.threadId)}>
                  {t('network.transfer.openConversation', { defaultValue: 'Conversation' })}
                </button>
              ) : null}
            </div>
            <TransferCard transfer={transfer} meId={me?.id} onChanged={onChanged} onCollectionChanged={onCollectionChanged} onOpenAnimal={onOpenAnimal} />
          </li>
        );
      })}
    </ul>
  );
}

function NewMessageDialog({ onClose, onDone, shareAnimal }) {
  const { t } = useTranslation();
  const [person, setPerson] = useState(null);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    if (!person || (!body.trim() && !shareAnimal)) return;
    setBusy(true);
    setError('');
    try {
      const res = await networkApi.startThread({
        handle: person.handle,
        kind: shareAnimal ? 'animal' : 'text',
        body: body.trim(),
        attachment: shareAnimal ? { animal: animalCardOf(shareAnimal) } : undefined,
      });
      onDone?.(res?.threadId);
    } catch (err) {
      setError(errorCode(err) === 'request_cap'
        ? t('network.thread.capReached', { defaultValue: 'Wait until they accept your message request before you write more.' })
        : errorText(err, t('network.thread.sendFailed', { defaultValue: 'The message was not sent.' })));
    } finally {
      setBusy(false);
    }
  };
  return (
    <NetworkDialog
      title={shareAnimal ? t('network.shareTitle', { defaultValue: 'Share {{name}}', name: shareAnimal.name || shareAnimal.id }) : t('network.newMessage', { defaultValue: 'New message' })}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="bn-btn bn-btn--ghost" onClick={onClose}>{t('network.cancel', { defaultValue: 'Cancel' })}</button>
          <button type="button" className="bn-btn bn-btn--primary" disabled={!person || (!body.trim() && !shareAnimal) || busy} onClick={submit}>
            {busy ? t('network.sending', { defaultValue: 'Sending…' }) : t('network.thread.send', { defaultValue: 'Send' })}
          </button>
        </>
      )}
    >
      <PersonPicker value={person} onPick={setPerson} />
      <textarea className="bn-input" rows={4} maxLength={4000} value={body} onChange={(event) => setBody(event.target.value)} placeholder={t('network.thread.placeholder', { defaultValue: 'Write a message' })} aria-label={t('network.thread.placeholder', { defaultValue: 'Write a message' })} />
      <small className="bn-note">{t('network.requestNote', { defaultValue: 'If you have not talked before, your message arrives as a request. They can read it, then accept, ignore or block.' })}</small>
      <ErrorNote error={error} />
    </NetworkDialog>
  );
}
