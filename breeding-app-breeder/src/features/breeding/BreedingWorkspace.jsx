/**
 * Hosts Active pairing (the open breeding cards, with the follicle overview one switch away) and
 * Completed pairing (closed cards by season), owns the quick-entry dialogs and the rack-walk
 * ("save and next female") sequence, and translates dialog submissions into actions.
 * App.jsx gives it state and setters; the domain stays in ./domain.
 */
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BreedingCardsSection } from './components/BreedingCardsSection';
import { CompletedCyclesSection } from './components/CompletedCyclesSection';
import { FollicleOverviewSection } from './components/FollicleOverviewSection';
import {
  BreedingDialog,
  QuickPairingDialog,
  LockObservationDialog,
  FollicleExamDialog,
  MilestoneDialog,
  ClutchDialog,
  HatchingDialog,
  LogHatchDialog,
  CloseCycleDialog,
  PlannedPairingDialog,
  SireAssignmentDialog,
} from './components/BreedingDialogs';
import { formatDate, animalName } from './components/format';
import { help } from '../help/help';
import { toYmd, todayYmd } from './domain/dates';
import { upcomingPairings } from './domain/pairingPlan';

function EditSessionDialog({ cycle, session, snakesById, onSubmit, onClose }) {
  const { t } = useTranslation();
  const [introductionDate, setIntroductionDate] = useState(session.introductionDate || '');
  const [introductionTime, setIntroductionTime] = useState(session.introductionTime || '');
  const [removalDate, setRemovalDate] = useState(session.removalDate || '');
  const [removalTime, setRemovalTime] = useState(session.removalTime || '');
  const [notes, setNotes] = useState(session.notes || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const inputClass = 'w-full border rounded-xl px-3 py-2 text-sm bg-white';
  const save = async () => {
    setBusy(true); setError(null);
    try {
      await onSubmit({ introductionDate, introductionTime: introductionTime || null, removalDate: removalDate || null, removalTime: removalTime || null, notes });
      onClose();
    } catch (err) { setError(err?.message || String(err)); } finally { setBusy(false); }
  };
  return (
    <BreedingDialog titleProps={help('dlg-edit-session')} title={t('breeding.sessionDialog.title', { defaultValue: 'Correct a pairing session' })} subtitle={`${animalName(snakesById.get(session.maleId), session.maleId)} · ${cycle.seasonLabel}`} onClose={onClose} onConfirm={save} busy={busy} error={error}>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1" {...help('bfield-pairing-date')}><span className="text-xs font-medium">{t('breeding.field.pairingDate', { defaultValue: 'Pairing date (introduction)' })}</span><input type="date" className={inputClass} value={introductionDate} onChange={(e) => setIntroductionDate(e.target.value)} /></label>
        <label className="flex flex-col gap-1" {...help('bfield-more-details')}><span className="text-xs font-medium">{t('breeding.field.introductionTime', { defaultValue: 'Introduction time' })}</span><input type="time" className={inputClass} value={introductionTime} onChange={(e) => setIntroductionTime(e.target.value)} /></label>
        <label className="flex flex-col gap-1" {...help('bfield-more-details')}><span className="text-xs font-medium">{t('breeding.field.removalDate', { defaultValue: 'Removal date' })}</span><input type="date" className={inputClass} value={removalDate} onChange={(e) => setRemovalDate(e.target.value)} /></label>
        <label className="flex flex-col gap-1" {...help('bfield-more-details')}><span className="text-xs font-medium">{t('breeding.field.removalTime', { defaultValue: 'Removal time' })}</span><input type="time" className={inputClass} value={removalTime} onChange={(e) => setRemovalTime(e.target.value)} /></label>
      </div>
      <label className="flex flex-col gap-1" {...help('bfield-notes')}><span className="text-xs font-medium">{t('breeding.field.notes', { defaultValue: 'Notes (optional)' })}</span><textarea className={inputClass} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
      <div className="text-[11px] text-neutral-500">{t('breeding.sessionDialog.hint', { defaultValue: 'Lock records on this session keep their own dates. Changing the male is not possible here: record a new session instead so history stays attributable.' })}</div>
    </BreedingDialog>
  );
}

export function BreedingWorkspace({
  view = 'active',
  cycles,
  exams,
  settings,
  actions,
  snakes = [],
  females = [],
  males = [],
  snakesById,
  geneticsTokensFor,
  locationFor,
  onOpenSnake,
  focusedCycleId,
  onFocusCycle,
  onCreateHatchlings,
  showAppAlert,
  onAttachFiles = null,
  speciesOptions = [],
  searchQuery = '',
  scopedFemaleIds = null,
  dialogRequest = null,
  onDialogRequestHandled = null,
  currentSeason = '',
  seasonSummaries = [],
}) {
  const { t } = useTranslation();
  const [dialog, setDialog] = useState(null);
  const [activeMode, setActiveMode] = useState('cards');
  // Follicle exams belong to the breeding project: only females with an open card are offered.
  const femalesWithOpenCard = React.useMemo(() => {
    const open = new Set(cycles.filter((c) => c && !c.deletedAt && c.status !== 'closed').map((c) => c.femaleId));
    return females.filter((f) => open.has(f.id));
  }, [cycles, females]);
  const [batchIndex, setBatchIndex] = useState(0);

  const openDialog = useCallback((request) => {
    setBatchIndex(0);
    setDialog(request);
  }, []);

  // A request coming from outside (the animal editor, a deep link) opens the same dialogs.
  React.useEffect(() => {
    if (!dialogRequest) return;
    openDialog(dialogRequest);
    onDialogRequestHandled?.();
  }, [dialogRequest, openDialog, onDialogRequestHandled]);

  const closeDialog = useCallback(() => setDialog(null), []);
  const cycleById = useCallback((id) => cycles.find((c) => c?.id === id) || null, [cycles]);

  const notifyFollowUp = useCallback((result) => {
    const followUp = result?.followUp;
    if (!followUp?.proposal) return;
    const { proposal } = followUp;
    if (proposal.kind === 'create' || proposal.kind === 'update') {
      showAppAlert?.(t('breeding.notice.proposalCreated', { defaultValue: 'Next pairing proposed for {{date}} (one calendar month after the observed lock). Move or skip it on the card.', date: formatDate(proposal.date) }));
    } else if (proposal.kind === 'suppressed' && proposal.reason === 'historical') {
      showAppAlert?.(t('breeding.notice.historical', { defaultValue: 'This lock is in the past, so no reminder was created automatically. Use "Plan pairing" on the card if you want a next date.' }));
    } else if (proposal.kind === 'reuse' && proposal.keptManualDate) {
      showAppAlert?.(t('breeding.notice.keptManual', { defaultValue: 'A planned pairing you adjusted yourself already exists; its date was kept.' }));
    }
  }, [showAppAlert, t]);

  const batchFor = (request) => {
    const ids = request?.batchFemaleIds;
    if (!Array.isArray(ids) || ids.length < 2) return null;
    const nextFemaleId = ids[batchIndex + 1] || null;
    return {
      nextFemaleId,
      onNext: () => {
        if (!nextFemaleId) return;
        setBatchIndex((i) => i + 1);
        setDialog((prev) => ({ ...prev, femaleId: nextFemaleId, defaultMaleId: null }));
      },
    };
  };

  const renderDialog = () => {
    if (!dialog) return null;
    const cycle = dialog.cycleId ? cycleById(dialog.cycleId) : null;
    switch (dialog.kind) {
      case 'pairing': {
        const fem = dialog.femaleId || null;
        const femaleCycle = cycle || (fem ? cycles.find((c) => c?.femaleId === fem && c.status !== 'closed') : null);
        return (
          <QuickPairingDialog
            femaleId={fem}
            females={females}
            males={males}
            defaultMaleId={dialog.defaultMaleId || femaleCycle?.males?.[femaleCycle.males.length - 1]?.maleId || null}
            seasonLabel={femaleCycle?.seasonLabel || ''}
            newCardSeasonLabel={femaleCycle ? '' : currentSeason}
            batch={batchFor(dialog)}
            onClose={closeDialog}
            onSubmit={(input) => {
              const result = actions.recordPairing({ ...input, introductionDate: dialog.defaultDate && !input.introductionDate ? dialog.defaultDate : input.introductionDate });
              notifyFollowUp(result);
              if (result.created) onFocusCycle?.(result.cycle.id);
              return result;
            }}
          />
        );
      }
      case 'lock':
        return cycle ? (
          <LockObservationDialog
            cycle={cycle}
            sessions={cycle.sessions}
            snakesById={snakesById}
            defaultSessionId={dialog.sessionId || null}
            onClose={closeDialog}
            onSubmit={(input) => { const result = actions.addLock(cycle.id, input.sessionId, input); notifyFollowUp(result); return result; }}
          />
        ) : null;
      case 'exam': {
        const exam = dialog.examId ? exams.find((e) => e?.id === dialog.examId) || null : null;
        return (
          <FollicleExamDialog
            femaleId={exam?.femaleId || dialog.femaleId || null}
            females={exam ? females : femalesWithOpenCard}
            exam={exam}
            batch={batchFor(dialog)}
            onAttach={onAttachFiles}
            onClose={closeDialog}
            onSubmit={(input) => actions.saveExam(input)}
          />
        );
      }
      case 'milestone': {
        const event = dialog.eventId && cycle ? cycle.events.find((e) => e.id === dialog.eventId) || null : null;
        return cycle ? (
          <MilestoneDialog
            cycle={cycle}
            event={event}
            defaultType={dialog.defaultType || 'ovulation'}
            onClose={closeDialog}
            onSubmit={(input) => {
              const result = actions.recordMilestone(cycle.id, input);
              return result;
            }}
          />
        ) : null;
      }
      case 'clutch':
        return cycle ? <ClutchDialog cycle={cycle} onClose={closeDialog} onSubmit={(input) => actions.updateClutch(cycle.id, input)} /> : null;
      case 'hatching':
        return cycle ? (
          <HatchingDialog
            cycle={cycle}
            mode={dialog.mode || 'partial'}
            onClose={closeDialog}
            onSubmit={(input) => (dialog.mode === 'complete' ? actions.completeHatching(cycle.id, input) : actions.recordHatching(cycle.id, input))}
          />
        ) : null;
      case 'logHatch':
        return cycle ? (
          <LogHatchDialog
            cycle={cycle}
            onClose={closeDialog}
            onSubmit={(input) => {
              const updated = actions.completeHatching(cycle.id, input);
              // The hatchlings become animals right away; that completes the cycle.
              if (updated && updated.status !== 'closed' && (updated.clutch?.hatchlingsRecorded || 0) > 0) onCreateHatchlings?.(updated);
              return updated;
            }}
          />
        ) : null;
      case 'close':
        return cycle ? <CloseCycleDialog cycle={cycle} onClose={closeDialog} onSubmit={(input) => actions.closeCycle(cycle.id, input)} /> : null;
      case 'planned':
        return cycle ? <PlannedPairingDialog cycle={cycle} males={males} onClose={closeDialog} onSubmit={(input) => actions.addPlannedPairing(cycle.id, input)} /> : null;
      case 'reschedule': {
        const planned = cycle?.plannedPairings.find((p) => p.id === dialog.plannedId) || null;
        return cycle && planned ? <PlannedPairingDialog cycle={cycle} males={males} planned={planned} onClose={closeDialog} onSubmit={(input) => actions.reschedulePlanned(cycle.id, planned.id, input.date)} /> : null;
      }
      case 'editSession': {
        const session = cycle?.sessions.find((s) => s.id === dialog.sessionId) || null;
        return cycle && session ? <EditSessionDialog cycle={cycle} session={session} snakesById={snakesById} onClose={closeDialog} onSubmit={(patch) => actions.updateSession(cycle.id, session.id, patch)} /> : null;
      }
      case 'sire': {
        const offspring = cycle?.offspring.find((o) => o.animalId === dialog.animalId) || null;
        return cycle && offspring ? <SireAssignmentDialog cycle={cycle} offspring={offspring} snakesById={snakesById} onClose={closeDialog} onSubmit={(input) => actions.assignSire(cycle.id, offspring.animalId, input)} /> : null;
      }
      default:
        return null;
    }
  };

  const shared = { cycles, exams, settings, snakesById, geneticsTokensFor, females, males, actions, openDialog, onOpenSnake, locationFor, searchQuery };

  const modeButton = (key, label) => (
    <button
      type="button"
      aria-pressed={activeMode === key}
      {...help('breeding-mode')}
      className={`text-xs px-3 py-1.5 rounded-lg border ${activeMode === key ? 'font-semibold bg-white' : 'bg-transparent text-neutral-600 hover:bg-white'}`}
      style={activeMode === key ? { borderColor: 'var(--sk-primary, #0284c7)', color: 'var(--sk-primary, #0284c7)' } : undefined}
      onClick={() => setActiveMode(key)}
    >
      {label}
    </button>
  );

  return (
    <>
      {view === 'completed' ? (
        <CompletedCyclesSection
          {...shared}
          focusedCycleId={focusedCycleId}
          onFocusCycle={onFocusCycle}
          onCreateHatchlings={onCreateHatchlings}
          showAppAlert={showAppAlert}
          scopedFemaleIds={scopedFemaleIds}
          seasonSummaries={seasonSummaries}
        />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t('breeding.active.modeLabel', { defaultValue: 'Show' })}>
            {modeButton('cards', t('breeding.active.modeCards', { defaultValue: 'Breeding cards' }))}
            {modeButton('follicles', t('breeding.active.modeFollicles', { defaultValue: 'Follicle overview' }))}
          </div>
          {activeMode === 'follicles' ? (
            <FollicleOverviewSection
              {...shared}
              females={femalesWithOpenCard}
              onSettingsChange={actions.updateSettings}
              onOpenCycle={(cycleId) => { setActiveMode('cards'); onFocusCycle?.(cycleId); }}
              speciesOptions={speciesOptions}
            />
          ) : (
            <BreedingCardsSection
              {...shared}
              focusedCycleId={focusedCycleId}
              onFocusCycle={onFocusCycle}
              onCreateHatchlings={onCreateHatchlings}
              showAppAlert={showAppAlert}
              scopedFemaleIds={scopedFemaleIds}
              currentSeason={currentSeason}
            />
          )}
        </div>
      )}
      {renderDialog()}
    </>
  );
}

/**
 * Calendar entries derived from breeding cards and examinations, for CalendarSection. Ticked
 * pairings and observed locks are records and always show. A planned pairing shows only while it
 * is still ahead: once its date passes unticked it drops off instead of turning overdue.
 */
export function buildBreedingCalendarEvents({ cycles = [], exams = [], year, month, today = todayYmd() }) {
  const inMonth = (date) => {
    const ymd = toYmd(date);
    if (!ymd) return false;
    const [y, m] = ymd.split('-').map(Number);
    return y === year && m - 1 === month;
  };
  const events = [];
  cycles.filter((c) => c && !c.deletedAt).forEach((cycle) => {
    cycle.sessions.forEach((session) => {
      if (inMonth(session.introductionDate)) events.push({ date: session.introductionDate, type: 'breedingCard', kind: 'pairing_session', cycleId: cycle.id, femaleId: cycle.femaleId, maleId: session.maleId, certainty: 'recorded' });
      session.locks.forEach((lock) => {
        if (lock.status === 'observed' && inMonth(lock.observationDate)) events.push({ date: lock.observationDate, type: 'breedingCard', kind: 'lock_observed', cycleId: cycle.id, femaleId: cycle.femaleId, maleId: session.maleId, certainty: 'recorded' });
      });
    });
    upcomingPairings(cycle, { today }).forEach((row) => {
      if (inMonth(row.plannedDate)) events.push({ date: row.plannedDate, type: 'breedingCard', kind: 'planned_pairing', cycleId: cycle.id, femaleId: cycle.femaleId, maleId: row.maleId, certainty: 'planned' });
    });
    cycle.events.forEach((event) => {
      if (inMonth(event.date)) events.push({ date: event.date, type: 'breedingCard', kind: event.type, cycleId: cycle.id, femaleId: cycle.femaleId, certainty: event.certainty === 'suspected' ? 'suspected' : event.precision === 'estimated' ? 'estimated' : 'recorded' });
    });
  });
  exams.filter((e) => e && !e.deletedAt).forEach((exam) => {
    if (inMonth(exam.date)) events.push({ date: exam.date, type: 'breedingCard', kind: 'follicle_exam', cycleId: exam.cycleId, femaleId: exam.femaleId, examId: exam.id, valueMm: exam.largestDiameterMm, isEstimate: exam.largestIsEstimate, certainty: 'recorded' });
    if (exam.nextReviewDate && inMonth(exam.nextReviewDate)) events.push({ date: exam.nextReviewDate, type: 'breedingCard', kind: 'scan_review', cycleId: exam.cycleId, femaleId: exam.femaleId, examId: exam.id, certainty: 'planned' });
  });
  return events;
}
