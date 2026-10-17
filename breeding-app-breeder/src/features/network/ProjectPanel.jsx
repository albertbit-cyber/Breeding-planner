import React, { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CaretDownIcon, CaretUpIcon, EggIcon } from '@phosphor-icons/react';
import { networkApi, errorText } from './networkApi.js';
import { SPLIT_METHODS, describeSplit, partnerShareCount, personName, projectAnimals, shortDate } from './networkFormat.js';
import { AnimalMini, AnimalSelect, ErrorNote, Handle, StatusChip, useConfirm } from './NetworkBits.jsx';

/**
 * A joint project, pinned above its conversation: who brings what, where the female's cycle
 * stands (read from the keeper's breeding card), the split being negotiated, and -- for the
 * keeper -- the hatchlings to send. Everything here is the server's view; both breeders see the
 * same panel from their own side.
 */
export default function ProjectPanel({ projectId, animals, onChanged, onCollectionChanged, refreshKey }) {
  const { t, i18n } = useTranslation();
  const [project, setProject] = useState(null);
  // A finished project starts folded: its outcome is history, the conversation is what is live.
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmElement, ask] = useConfirm();

  const load = useCallback(async () => {
    try {
      const res = await networkApi.project(projectId);
      setProject(res?.project || null);
    } catch (err) {
      setError(errorText(err, t('network.project.loadFailed', { defaultValue: 'The project could not be loaded.' })));
    }
  }, [projectId, t]);

  useEffect(() => { load(); }, [load, refreshKey]);

  /** Runs an action; resolves true when it worked, so a form only clears what was really sent. */
  const run = async (fn, { pull = false } = {}) => {
    setBusy(true);
    setError('');
    try {
      const res = await fn();
      if (res?.project) setProject(res.project);
      else await load();
      onChanged?.();
      if (pull) onCollectionChanged?.();
      return true;
    } catch (err) {
      setError(errorText(err, t('network.actionFailed', { defaultValue: 'That did not work. Try again.' })));
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (!project) {
    return error ? <div className="bn-project"><div className="bn-project__body" style={{ paddingTop: '0.85rem' }}><ErrorNote error={error} /></div></div> : null;
  }

  const maleOwner = personName(project.male?.owner) || t('network.project.maleOwner', { defaultValue: 'Male owner' });
  const keeper = personName(project.keeper) || t('network.project.keeper', { defaultValue: 'Keeper' });
  const role = project.viewerRole;
  const isOpen = open === null ? project.status !== 'completed' && project.status !== 'cancelled' && project.status !== 'declined' : open;
  const sent = (project.hatchlings || []).filter((h) => h.share);
  const kept = (project.hatchlings || []).filter((h) => !h.share);
  const nextStep = nextStepFor(project, role, t);

  const confirmClose = async () => {
    const answer = await ask({
      title: t('network.project.completeTitle', { defaultValue: 'Close {{title}}?', title: project.title }),
      body: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {!project.splitTerms ? (
            <div className="bn-warning">{t('network.project.noSplitWarning', { defaultValue: 'No split was agreed. Closing records the project without one.' })}</div>
          ) : null}
          <ul className="bn-outcome">
            <li><strong>{kept.length}</strong> {t('network.project.outcomeKept', { defaultValue: 'stay with {{who}}', who: keeper })}</li>
            <li><strong>{sent.length}</strong> {t('network.project.outcomeSent', { defaultValue: 'sent to {{who}}', who: maleOwner })}</li>
          </ul>
          <p className="bn-note" style={{ fontSize: '0.86rem' }}>
            {t('network.project.completeConfirm', { defaultValue: 'Close the project? Hatchlings not sent stay with the keeper, and every hatchling gets both parents and both breeders written on its record.' })}
          </p>
        </div>
      ),
      confirmLabel: t('network.project.complete', { defaultValue: 'Close project' }),
    });
    if (answer.ok) run(() => networkApi.completeProject(project.id), { pull: true });
  };

  const confirmCancel = async () => {
    const answer = await ask({
      title: t('network.project.cancelTitle', { defaultValue: 'Cancel {{title}}?', title: project.title }),
      body: t('network.project.cancelConfirm', { defaultValue: 'Cancel the project? The partner record moves to the keeper\'s archive.' }),
      confirmLabel: t('network.project.cancel', { defaultValue: 'Cancel project' }),
      danger: true,
    });
    if (answer.ok) run(() => networkApi.cancelProject(project.id), { pull: true });
  };

  return (
    <section className="bn-project" aria-label={project.title}>
      <button type="button" className="bn-project__head" onClick={() => setOpen(!isOpen)} aria-expanded={isOpen}>
        <EggIcon size={18} aria-hidden="true" />
        <span className="bn-project__title">{project.title}</span>
        <StatusChip status={project.status} />
        {isOpen ? <CaretUpIcon size={16} aria-hidden="true" /> : <CaretDownIcon size={16} aria-hidden="true" />}
      </button>
      {!isOpen && project.status === 'completed' ? (
        <p className="bn-note" style={{ padding: '0 0.85rem 0.75rem' }}>
          {t('network.project.outcomeLine', { defaultValue: 'Closed. {{kept}} stayed with {{keeper}}, {{sent}} went to {{male}}.', kept: kept.length, sent: sent.length, keeper, male: maleOwner })}
        </p>
      ) : null}
      {isOpen ? (
        <div className="bn-project__body">
          {nextStep ? <div className="bn-next" role="status">{nextStep}</div> : null}
          <div className="bn-pair">
            <Side
              role={t('network.project.sire', { defaultValue: 'Sire' })}
              owner={project.male?.owner}
              animal={project.male?.animal}
              waiting={t('network.project.waitingMale', { defaultValue: 'The male is chosen when the invitation is accepted.' })}
            />
            <Side
              role={t('network.project.damKeeper', { defaultValue: 'Dam · keeper & incubator' })}
              owner={project.female?.owner}
              animal={project.female?.animal}
              waiting={t('network.project.waitingFemale', { defaultValue: 'The female is chosen when the invitation is accepted.' })}
            />
          </div>

          {project.status === 'proposed' ? (
            <Invitation project={project} animals={animals} busy={busy} onAnswer={(action, appAnimalId) => run(() => networkApi.respondProject(project.id, action, appAnimalId), { pull: action === 'accept' })} onCancel={() => run(() => networkApi.cancelProject(project.id))} />
          ) : null}

          {project.status !== 'proposed' ? <Progress project={project} role={role} locale={i18n.language} /> : null}

          {['active', 'completed'].includes(project.status) ? (
            <Split project={project} maleOwner={maleOwner} keeper={keeper} busy={busy} run={run} />
          ) : null}

          {['active', 'completed'].includes(project.status) && project.hatchlings?.length ? (
            <Hatchlings project={project} role={role} maleOwner={maleOwner} busy={busy} run={run} />
          ) : null}

          {project.status === 'active' ? (
            <div className="bn-row-actions">
              <button
                type="button"
                className="bn-btn bn-btn--quiet bn-btn--sm"
                disabled={busy}
                onClick={confirmClose}
              >
                {t('network.project.complete', { defaultValue: 'Close project' })}
              </button>
              {!project.transfers?.some((tr) => tr.status === 'accepted') ? (
                <button
                  type="button"
                  className="bn-btn bn-btn--danger bn-btn--sm"
                  disabled={busy}
                  onClick={confirmCancel}
                >
                  {t('network.project.cancel', { defaultValue: 'Cancel project' })}
                </button>
              ) : null}
            </div>
          ) : null}
          <ErrorNote error={error} />
        </div>
      ) : null}
      {confirmElement}
    </section>
  );
}

/** The one thing this breeder can do next, said plainly at the top of the panel. */
function nextStepFor(project, role, t) {
  const otherHandle = role === 'keeper' ? project.male?.owner?.handle : project.keeper?.handle || project.proposedBy?.handle;
  if (project.status === 'proposed') {
    return role === 'invited'
      ? t('network.next.join', { defaultValue: 'Choose your animal below to join, or decline.' })
      : t('network.next.waitJoin', { defaultValue: 'Waiting for @{{handle}} to answer the invitation.', handle: project.invited?.handle || '' });
  }
  if (project.status !== 'active') return null;
  const open = (project.proposals || []).find((p) => p.status === 'open');
  if (open && !open.mine) return t('network.next.answerSplit', { defaultValue: 'Answer the split @{{handle}} proposed.', handle: otherHandle || '' });
  if (open && open.mine) return t('network.next.waitSplit', { defaultValue: 'Waiting for @{{handle}} to answer your split proposal.', handle: otherHandle || '' });
  if (!project.splitTerms) return t('network.next.proposeSplit', { defaultValue: 'Agree how the clutch is split: propose terms below.' });
  if (!project.progress) {
    return role === 'keeper'
      ? t('network.next.keeperCard', { defaultValue: 'Put the partner male on her breeding card to start the cycle.' })
      : t('network.next.waitCard', { defaultValue: 'Waiting for @{{handle}} to start the breeding card.', handle: otherHandle || '' });
  }
  const unsent = (project.hatchlings || []).filter((h) => !h.share).length;
  if (role === 'keeper' && unsent && project.hatchlings.length) return t('network.next.sendShares', { defaultValue: 'Send the partner their hatchlings, then close the project.' });
  const pending = (project.hatchlings || []).some((h) => h.share?.status === 'pending');
  if (pending && role !== 'keeper') return t('network.next.acceptShares', { defaultValue: 'Hatchlings are waiting for you under Transfers.' });
  return null;
}

function Side({ role, owner, animal, waiting }) {
  return (
    <div className="bn-side">
      <div className="bn-side__role">
        <span>{role}</span>
        {owner ? <span style={{ textTransform: 'none', letterSpacing: 0 }}><Handle handle={owner.handle} /></span> : null}
      </div>
      {animal ? <AnimalMini animal={animal} /> : <p className="bn-note">{waiting}</p>}
    </div>
  );
}

function Invitation({ project, animals, busy, onAnswer, onCancel }) {
  const { t } = useTranslation();
  const needed = project.male?.animal ? 'F' : 'M';
  const options = useMemo(() => projectAnimals(animals, needed), [animals, needed]);
  const [animalId, setAnimalId] = useState('');
  // While proposed, only the proposer has a side, so the invitee is the one with no role yet.
  if (project.viewerRole !== 'invited') {
    return (
      <div className="bn-row-actions" style={{ alignItems: 'center' }}>
        <p className="bn-note" style={{ flex: 1 }}>
          {t('network.project.waitingAnswer', { defaultValue: 'Waiting for @{{handle}} to answer and choose their animal.', handle: project.invited?.handle })}
        </p>
        <button type="button" className="bn-btn bn-btn--ghost bn-btn--sm" disabled={busy} onClick={onCancel}>{t('network.project.withdraw', { defaultValue: 'Withdraw' })}</button>
      </div>
    );
  }
  return (
    <div className="bn-side">
      <AnimalSelect
        animals={options}
        value={animalId}
        onChange={setAnimalId}
        label={needed === 'F' ? t('network.project.chooseFemale', { defaultValue: 'Your female' }) : t('network.project.chooseMale', { defaultValue: 'Your male' })}
        emptyText={needed === 'F'
          ? t('network.project.noFemale', { defaultValue: 'You have no sexed female in your collection.' })
          : t('network.project.noMale', { defaultValue: 'You have no sexed male in your collection.' })}
        hint={needed === 'F'
          ? t('network.project.youKeep', { defaultValue: 'You keep her through her cycle and incubate. A read-only partner record of their male comes to your collection: put him on her breeding card.' })
          : t('network.project.theyKeep', { defaultValue: 'They keep their female and incubate. A read-only partner record of your male goes to their collection.' })}
      />
      <div className="bn-row-actions">
        <button type="button" className="bn-btn bn-btn--primary bn-btn--sm" disabled={!animalId || busy} onClick={() => onAnswer('accept', animalId)}>
          {t('network.project.accept', { defaultValue: 'Join the project' })}
        </button>
        <button type="button" className="bn-btn bn-btn--ghost bn-btn--sm" disabled={busy} onClick={() => onAnswer('decline')}>
          {t('network.project.decline', { defaultValue: 'Decline' })}
        </button>
      </div>
    </div>
  );
}

function Progress({ project, role, locale }) {
  const { t } = useTranslation();
  const p = project.progress;
  if (!p) {
    if (project.status !== 'active') return null;
    return (
      <p className="bn-note">
        {role === 'keeper'
          ? t('network.project.noCardKeeper', { defaultValue: 'Open {{female}}\'s breeding card and add {{male}} (the partner record) as the male. The cycle then shows here for both of you.', female: project.female?.animal?.name, male: project.male?.animal?.name })
          : t('network.project.noCardPartner', { defaultValue: 'Waiting for @{{handle}} to put the pair on a breeding card. The cycle shows here once they do.', handle: project.keeper?.handle })}
      </p>
    );
  }
  const steps = [
    { done: p.sessions > 0, label: t('network.project.step.paired', { defaultValue: 'Paired' }), value: p.locks ? t('network.project.locks', { defaultValue: 'Locks: {{n}}', n: p.locks }) : p.sessions ? t('network.project.sessions', { defaultValue: 'Introductions: {{n}}', n: p.sessions }) : '–' },
    { done: Boolean(p.ovulationDate), label: t('network.project.step.ovulation', { defaultValue: 'Ovulation' }), value: shortDate(p.ovulationDate, locale) || '–' },
    { done: Boolean(p.eggLayingDate), label: t('network.project.step.eggs', { defaultValue: 'Eggs laid' }), value: p.eggLayingDate ? `${shortDate(p.eggLayingDate, locale)}${p.eggsTotal != null ? ` · ${p.eggsTotal}` : ''}` : '–' },
    { done: Boolean(p.firstHatchDate || p.hatchlingsRecorded), label: t('network.project.step.hatched', { defaultValue: 'Hatched' }), value: p.hatchlingsRecorded != null ? t('network.project.hatchlingCount', { defaultValue: 'Hatchlings: {{n}}', n: p.hatchlingsRecorded }) : '–' },
  ];
  return (
    <div>
      <p className="bn-section-title">{t('network.project.cycle', { defaultValue: 'The cycle, from the keeper\'s breeding card' })}</p>
      <ol className="bn-steps">
        {steps.map((step) => (
          <li key={step.label} className={`bn-step${step.done ? ' bn-step--done' : ''}`}>
            {step.label}
            <strong>{step.value}</strong>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Split({ project, maleOwner, keeper, busy, run }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const openProposal = project.proposals?.find((p) => p.status === 'open') || null;
  const shareCount = partnerShareCount(project.splitTerms, project.hatchlings?.length || project.progress?.hatchlingsRecorded);
  return (
    <div>
      <p className="bn-section-title">{t('network.split.title', { defaultValue: 'Split of the clutch' })}</p>
      {project.splitTerms ? (
        <p className="bn-reason">
          {describeSplit(project.splitTerms, maleOwner, keeper, t)}
          {shareCount != null ? ` ${t('network.split.forThisClutch', { defaultValue: 'For this clutch: {{n}} to {{male}}.', n: shareCount, male: maleOwner })}` : ''}
        </p>
      ) : (
        <p className="bn-note">
          {project.status === 'completed'
            ? t('network.split.noneClosed', { defaultValue: 'Closed without an agreed split.' })
            : t('network.split.none', { defaultValue: 'No split agreed yet. Talk it over below, then one of you proposes terms and the other accepts.' })}
        </p>
      )}
      {openProposal ? (
        <div className="bn-card" style={{ marginBlockStart: '0.5rem' }}>
          <div className="bn-card__label">{openProposal.mine ? t('network.split.yourProposal', { defaultValue: 'Your proposal' }) : t('network.split.theirProposal', { defaultValue: 'Their proposal' })}</div>
          <div>{describeSplit(openProposal.terms, maleOwner, keeper, t)}</div>
          {!openProposal.mine && project.status === 'active' ? (
            <div className="bn-row-actions">
              <button type="button" className="bn-btn bn-btn--primary bn-btn--sm" disabled={busy} onClick={() => run(() => networkApi.respondSplit(openProposal.id, 'accept'))}>{t('network.split.accept', { defaultValue: 'Accept split' })}</button>
              <button type="button" className="bn-btn bn-btn--ghost bn-btn--sm" disabled={busy} onClick={() => run(() => networkApi.respondSplit(openProposal.id, 'reject'))}>{t('network.split.reject', { defaultValue: 'Turn down' })}</button>
              <button type="button" className="bn-btn bn-btn--ghost bn-btn--sm" disabled={busy} onClick={() => setEditing(true)}>{t('network.split.counter', { defaultValue: 'Counter-propose' })}</button>
            </div>
          ) : null}
        </div>
      ) : null}
      {project.status === 'active' && !editing && !(openProposal && !openProposal.mine) ? (
        <button type="button" className="bn-btn bn-btn--quiet bn-btn--sm" style={{ marginBlockStart: '0.5rem' }} onClick={() => setEditing(true)}>
          {project.splitTerms || openProposal ? t('network.split.proposeNew', { defaultValue: 'Propose different terms' }) : t('network.split.propose', { defaultValue: 'Propose a split' })}
        </button>
      ) : null}
      {editing ? (
        <SplitForm
          maleOwner={maleOwner}
          keeper={keeper}
          busy={busy}
          onCancel={() => setEditing(false)}
          onSubmit={async (terms) => {
            if (await run(() => networkApi.proposeSplit(project.id, terms))) setEditing(false);
          }}
        />
      ) : null}
    </div>
  );
}

function SplitForm({ maleOwner, keeper, busy, onSubmit, onCancel }) {
  const { t } = useTranslation();
  const shareId = useId();
  const noteId = useId();
  const [method, setMethod] = useState('alternate_picks');
  const [firstPick, setFirstPick] = useState('male_owner');
  const [share, setShare] = useState('50');
  const [note, setNote] = useState('');
  const labels = {
    alternate_picks: t('network.split.method.alternate', { defaultValue: 'Alternate picks' }),
    percentage: t('network.split.method.percentage', { defaultValue: 'Percentage' }),
    fixed_count: t('network.split.method.count', { defaultValue: 'Number of hatchlings' }),
    custom: t('network.split.method.custom', { defaultValue: 'Own terms' }),
  };
  const terms = {
    method,
    firstPick: method === 'alternate_picks' ? firstPick : null,
    maleOwnerShare: method === 'percentage' || method === 'fixed_count' ? Number(share) : null,
    note: note.trim() || null,
  };
  const valid = method === 'custom' ? Boolean(terms.note) : method === 'alternate_picks' ? true : Number.isFinite(terms.maleOwnerShare) && terms.maleOwnerShare >= 0 && (method !== 'percentage' || terms.maleOwnerShare <= 100);
  return (
    <div className="bn-side" style={{ marginBlockStart: '0.5rem' }}>
      <div className="bn-choices">
        {SPLIT_METHODS.map((value) => (
          <button key={value} type="button" className="bn-choice" aria-pressed={method === value} onClick={() => setMethod(value)}>{labels[value]}</button>
        ))}
      </div>
      {method === 'alternate_picks' ? (
        <div className="bn-choices">
          <button type="button" className="bn-choice" aria-pressed={firstPick === 'male_owner'} onClick={() => setFirstPick('male_owner')}>{t('network.split.firstPick', { defaultValue: '{{who}} picks first', who: maleOwner })}</button>
          <button type="button" className="bn-choice" aria-pressed={firstPick === 'female_owner'} onClick={() => setFirstPick('female_owner')}>{t('network.split.firstPick', { defaultValue: '{{who}} picks first', who: keeper })}</button>
        </div>
      ) : null}
      {method === 'percentage' || method === 'fixed_count' ? (
        <div className="bn-field">
          <label htmlFor={shareId}>
            {method === 'percentage'
              ? t('network.split.sharePercent', { defaultValue: '{{who}}\'s share (%)', who: maleOwner })
              : t('network.split.shareCount', { defaultValue: 'Hatchlings for {{who}}', who: maleOwner })}
          </label>
          <input id={shareId} type="number" min="0" max={method === 'percentage' ? 100 : 200} className="bn-input" value={share} onChange={(event) => setShare(event.target.value)} />
        </div>
      ) : null}
      <div className="bn-field">
        <label htmlFor={noteId}>{method === 'custom' ? t('network.split.terms', { defaultValue: 'Terms' }) : t('network.split.noteLabel', { defaultValue: 'Note (optional)' })}</label>
        <textarea id={noteId} rows={2} className="bn-input" maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)} placeholder={t('network.split.notePlaceholder', { defaultValue: 'e.g. Holdback of the best female for the keeper' })} />
      </div>
      <p className="bn-note">{describeSplit(terms, maleOwner, keeper, t)}</p>
      <div className="bn-row-actions">
        <button type="button" className="bn-btn bn-btn--primary bn-btn--sm" disabled={!valid || busy} onClick={() => onSubmit(terms)}>{t('network.split.send', { defaultValue: 'Send proposal' })}</button>
        <button type="button" className="bn-btn bn-btn--ghost bn-btn--sm" onClick={onCancel}>{t('network.cancel', { defaultValue: 'Cancel' })}</button>
      </div>
    </div>
  );
}

function Hatchlings({ project, role, maleOwner, busy, run }) {
  const { t } = useTranslation();
  const [picked, setPicked] = useState(() => new Set());
  const canSend = role === 'keeper' && project.status === 'active';
  const toggle = (id) => setPicked((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  return (
    <div>
      <p className="bn-section-title">{t('network.project.hatchlings', { defaultValue: 'Hatchlings' })}</p>
      <ul className="bn-hatchlings">
        {project.hatchlings.map((h) => {
          const share = h.share;
          const free = !share;
          return (
            <li key={h.appAnimalId} className="bn-hatchling">
              {canSend && free ? (
                <label className="bn-hatchling__pick">
                  <input type="checkbox" checked={picked.has(h.appAnimalId)} onChange={() => toggle(h.appAnimalId)} aria-label={t('network.project.pickHatchling', { defaultValue: 'Send {{name}} to {{who}}', name: h.name, who: maleOwner })} />
                </label>
              ) : null}
              <span><bdi>{h.appAnimalId}</bdi>{h.name && h.name !== h.appAnimalId ? ` · ${h.name}` : ''}{h.sex ? ` · ${h.sex}` : ''}</span>
              {share ? (
                <>
                  <span className="bn-thread__handle">{t('network.project.toPartner', { defaultValue: 'to {{who}}', who: maleOwner })}</span>
                  <StatusChip status={share.status} />
                </>
              ) : (
                <span className="bn-thread__handle">{t('network.project.withKeeper', { defaultValue: 'with the keeper' })}</span>
              )}
            </li>
          );
        })}
      </ul>
      {canSend ? (
        <div className="bn-row-actions" style={{ marginBlockStart: '0.5rem' }}>
          <button
            type="button"
            className="bn-btn bn-btn--primary bn-btn--sm"
            disabled={!picked.size || busy}
            onClick={async () => {
              if (await run(() => networkApi.offerShares(project.id, Array.from(picked)), { pull: false })) setPicked(new Set());
            }}
          >
            {picked.size
              ? t('network.project.sendShares', { defaultValue: 'Send to {{who}} ({{n}})', n: picked.size, who: maleOwner })
              : t('network.project.sendPick', { defaultValue: 'Pick hatchlings to send' })}
          </button>
          <p className="bn-note" style={{ flex: '1 1 12rem' }}>
            {t('network.project.sendHint', { defaultValue: 'Each one is a transfer they accept. Sent hatchlings move to your archive and arrive with both parents named.' })}
          </p>
        </div>
      ) : null}
    </div>
  );
}
