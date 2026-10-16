import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { help } from '../../help/help';

const TABS = ['Overview', 'History', 'Health', 'Files'];

// The help topic of each passport tab.
const TAB_HELP = {
  Overview: { helpId: 'tree-passport-overview' },
  History: { helpId: 'tree-passport-history' },
  Health: { helpId: 'tree-passport-health' },
  Files: { helpId: 'tree-passport-files' },
};

const GeneticBadge = ({ label, tone = 'default' }) => {
  const colors = {
    default:  'bg-violet-100 text-violet-700 border-violet-200',
    dominant: 'bg-sky-100    text-sky-700    border-sky-200',
    recessive:'bg-amber-100  text-amber-700  border-amber-200',
    visual:   'bg-emerald-100 text-emerald-700 border-emerald-200',
  };
  return (
    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${colors[tone] || colors.default}`}>
      {label}
    </span>
  );
};

const StatCard = ({ icon, label, value, sub }) => (
  <div className="rounded-xl bg-violet-50/60 border border-violet-100 p-3 flex flex-col gap-1">
    <div className="text-lg">{icon}</div>
    <div className="text-xl font-bold text-violet-700 leading-tight">{value ?? '—'}</div>
    <div className="text-[11px] font-semibold text-neutral-600">{label}</div>
    {sub && <div className="text-[10px] text-neutral-400">{sub}</div>}
  </div>
);

const transferTypeLabel = (t) => ({
  bred: t('familyTree.passport.transfer.bred', { defaultValue: 'Bred' }),
  sale: t('familyTree.passport.transfer.sale', { defaultValue: 'Sold' }),
  gift: t('familyTree.passport.transfer.gift', { defaultValue: 'Gift' }),
  trade: t('familyTree.passport.transfer.trade', { defaultValue: 'Trade' }),
  breeding_loan: t('familyTree.passport.transfer.breedingLoan', { defaultValue: 'Breeding Loan' }),
});

const tabLabel = (t, tabName) => ({
  Overview: t('familyTree.passport.tabs.overview', { defaultValue: 'Overview' }),
  History: t('familyTree.passport.tabs.history', { defaultValue: 'History' }),
  Health: t('familyTree.passport.tabs.health', { defaultValue: 'Health' }),
  Files: t('familyTree.passport.tabs.files', { defaultValue: 'Files' }),
}[tabName] ?? tabName);

const OverviewTab = ({ snake, parents, offspring, clutches, ownershipHistory }) => {
  const { t } = useTranslation();
  return (
  <div className="space-y-4">
    {/* Stats row */}
    <div className="grid grid-cols-2 gap-2">
      <StatCard icon="🐣" label={t('familyTree.passport.parents', { defaultValue: 'Parents' })} value={[parents?.sire, parents?.dam].filter(Boolean).length} sub={t('familyTree.passport.knownParents', { defaultValue: 'known parents' })} />
      <StatCard icon="🐍" label={t('familyTree.passport.offspring', { defaultValue: 'Offspring' })} value={offspring?.length ?? 0} sub={t('familyTree.passport.directOffspring', { defaultValue: 'direct offspring' })} />
      <StatCard icon="🥚" label={t('familyTree.passport.clutches', { defaultValue: 'Clutches' })} value={clutches?.length ?? 0} sub={t('familyTree.passport.clutchesInvolved', { defaultValue: 'clutches involved' })} />
      <StatCard icon="🏠" label={t('familyTree.passport.owners', { defaultValue: 'Owners' })} value={ownershipHistory?.length ?? 0} sub={t('familyTree.passport.ownershipRecords', { defaultValue: 'ownership records' })} />
    </div>

    {/* Genetics */}
    {snake?.genetics?.length > 0 && (
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-widest text-violet-500 mb-2">
          {t('familyTree.passport.genetics', { defaultValue: 'Genetics' })}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {snake.genetics.map(g => (
            <GeneticBadge key={g} label={g} />
          ))}
        </div>
      </div>
    )}

    {/* Parent summary */}
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-widest text-violet-500 mb-2">
        {t('familyTree.passport.parents', { defaultValue: 'Parents' })}
      </div>
      <div className="space-y-2">
        {parents?.sire ? (
          <div className="rounded-xl bg-sky-50 border border-sky-100 p-2.5 flex items-center gap-2">
            <span className="text-sky-500 text-sm font-bold">♂</span>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-neutral-800 truncate">{parents.sire.name}</div>
              <div className="text-[10px] text-neutral-400 font-mono">{parents.sire.globalId || parents.sire.localId}</div>
            </div>
          </div>
        ) : (
          <div className="rounded-xl bg-neutral-50 border border-dashed border-neutral-200 p-2.5 text-xs text-neutral-400">
            {t('familyTree.passport.sireUnknown', { defaultValue: 'Sire unknown' })}
          </div>
        )}
        {parents?.dam ? (
          <div className="rounded-xl bg-pink-50 border border-pink-100 p-2.5 flex items-center gap-2">
            <span className="text-pink-500 text-sm font-bold">♀</span>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-neutral-800 truncate">{parents.dam.name}</div>
              <div className="text-[10px] text-neutral-400 font-mono">{parents.dam.globalId || parents.dam.localId}</div>
            </div>
          </div>
        ) : (
          <div className="rounded-xl bg-neutral-50 border border-dashed border-neutral-200 p-2.5 text-xs text-neutral-400">
            {t('familyTree.passport.damUnknown', { defaultValue: 'Dam unknown' })}
          </div>
        )}
      </div>
    </div>

    {/* Clutch IDs */}
    {clutches?.length > 0 && (
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-widest text-violet-500 mb-2">
          {t('familyTree.passport.clutches', { defaultValue: 'Clutches' })}
        </div>
        <div className="space-y-1.5">
          {clutches.map((c, i) => (
            <div key={c.id || i} className="rounded-xl bg-violet-50 border border-violet-100 px-3 py-2 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-wide font-semibold text-violet-500">{t('familyTree.clutchId', { defaultValue: 'Clutch ID' })}</div>
                <div className="text-xs font-mono font-semibold text-violet-800 truncate"><bdi>{c.displayId || c.id}</bdi></div>
              </div>
              <div className="text-end flex-shrink-0">
                {c.hatchDate && (
                  <div className="text-[10px] text-neutral-400 font-mono">{c.hatchDate}</div>
                )}
                {c.eggCount != null && (
                  <div className="text-[10px] text-neutral-500">{t('familyTree.passport.eggCount', { defaultValue: '{{eggs}} eggs', eggs: c.eggCount })}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    )}

    {/* Offspring list */}
    {offspring?.length > 0 && (
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-widest text-violet-500 mb-2">
          {t('familyTree.passport.offspring', { defaultValue: 'Offspring' })}
        </div>
        <div className="space-y-1 max-h-40 overflow-y-auto">
          {offspring.map(s => (
            <div key={s.id} className="rounded-lg bg-emerald-50 border border-emerald-100 px-2.5 py-2 flex items-center gap-2">
              <span className={s.sex === 'male' ? 'text-sky-500 text-xs' : 'text-pink-500 text-xs'}>
                {s.sex === 'male' ? '♂' : '♀'}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-neutral-800 truncate">{s.name}</div>
                <div className="text-[10px] text-neutral-400 truncate">
                  {(s.genetics || []).slice(0, 2).join(', ')}{s.genetics?.length > 2 ? '…' : ''}
                </div>
              </div>
              <span className={[
                'text-[10px] font-semibold rounded-full px-1.5 py-0.5',
                s.status === 'holdback' ? 'bg-amber-100 text-amber-700' :
                s.status === 'sold'     ? 'bg-neutral-100 text-neutral-500' :
                'bg-emerald-100 text-emerald-700'
              ].join(' ')}>
                {s.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    )}
  </div>
  );
};

const HistoryTab = ({ ownershipHistory }) => {
  const { t } = useTranslation();
  return (
  <div className="space-y-3">
    <div className="text-[10px] font-semibold uppercase tracking-widest text-violet-500">
      {t('familyTree.passport.ownershipHistory', { defaultValue: 'Ownership History' })}
    </div>
    {ownershipHistory?.length > 0 ? (
      <div className="space-y-2">
        {ownershipHistory.map((record, i) => (
          <div key={record.id} className="rounded-xl bg-white border border-violet-100 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-neutral-800 truncate">{record.ownerName}</div>
                <div className="text-[10px] text-neutral-400 font-mono">
                  {record.fromDate}
                  {record.toDate ? ` → ${record.toDate}` : ` → ${t('familyTree.passport.present', { defaultValue: 'Present' })}`}
                </div>
              </div>
              <span className="text-[10px] font-semibold rounded-full bg-violet-100 text-violet-700 px-2 py-0.5 flex-shrink-0">
                {transferTypeLabel(t)[record.transferType] || record.transferType}
              </span>
            </div>
            {i === 0 && (
              <div className="mt-1.5 text-[10px] text-emerald-600 font-semibold">{t('familyTree.passport.currentOwner', { defaultValue: 'Current owner' })}</div>
            )}
          </div>
        ))}
      </div>
    ) : (
      <div className="rounded-xl bg-neutral-50 border border-dashed border-neutral-200 p-4 text-center text-xs text-neutral-400">
        {t('familyTree.passport.noOwnershipRecords', { defaultValue: 'No ownership records' })}
      </div>
    )}
  </div>
  );
};

const ComingSoonTab = ({ label }) => {
  const { t } = useTranslation();
  return (
  <div className="flex flex-col items-center justify-center h-40 gap-3">
    <div className="text-3xl opacity-30">🔬</div>
    <div className="text-sm font-semibold text-neutral-400">{t('familyTree.passport.comingSoon', { defaultValue: '{{label}} coming soon', label })}</div>
    <div className="text-xs text-neutral-400 text-center">
      {t('familyTree.passport.comingSoonHelp', { defaultValue: 'This section will show health records, test results, and documentation.' })}
    </div>
  </div>
  );
};

const PedigreePassportPanel = ({ snake, parents, offspring, clutches, ownershipHistory }) => {
  const { t } = useTranslation();
  const [tab, setTab] = useState('Overview');

  if (!snake) {
    return (
      <div className="ft-right-panel flex items-center justify-center">
        <p className="text-sm text-neutral-400">{t('familyTree.passport.selectSnake', { defaultValue: 'Select a snake to view its passport.' })}</p>
      </div>
    );
  }

  return (
    <div className="ft-right-panel flex flex-col overflow-hidden" {...help('tree-passport')}>
      {/* Panel header */}
      <div className="p-4 border-b border-violet-100 flex-shrink-0">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-violet-500">
          {t('familyTree.passport.title', { defaultValue: 'Pedigree Passport' })}
        </div>
        <div className="mt-1 text-sm font-bold text-neutral-900 truncate">{snake.name}</div>
        <div className="text-[11px] text-neutral-400 font-mono">{snake.globalId || snake.localId}</div>
        {snake.clutchId && (
          <div className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-violet-100 border border-violet-200 px-2 py-0.5">
            <span className="text-[9px] font-semibold uppercase tracking-wide text-violet-500">{t('familyTree.clutchId', { defaultValue: 'Clutch ID' })}</span>
            <span className="text-[10px] font-mono font-semibold text-violet-700"><bdi>{snake.clutchId}</bdi></span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-violet-100 flex-shrink-0 overflow-x-auto">
        {TABS.map(tabName => {
          const entry = TAB_HELP[tabName];
          return (
          <button
            key={tabName}
            type="button"
            onClick={() => setTab(tabName)}
            data-help={entry.helpId}
            className={[
              'px-3 py-2 text-xs font-semibold whitespace-nowrap transition-colors flex-shrink-0',
              tab === tabName
                ? 'border-b-2 border-violet-500 text-violet-700'
                : 'text-neutral-400 hover:text-neutral-600',
            ].join(' ')}
          >
            {tabLabel(t, tabName)}
          </button>
          );
        })}
      </div>

      {/* Tab body */}
      <div className="flex-1 overflow-y-auto p-4">
        {tab === 'Overview' && (
          <OverviewTab
            snake={snake}
            parents={parents}
            offspring={offspring}
            clutches={clutches}
            ownershipHistory={ownershipHistory}
          />
        )}
        {tab === 'History' && <HistoryTab ownershipHistory={ownershipHistory} />}
        {tab === 'Health'  && <ComingSoonTab label={t('familyTree.passport.healthTests', { defaultValue: 'Health & Tests' })} />}
        {tab === 'Files'   && <ComingSoonTab label={t('familyTree.passport.filesDocuments', { defaultValue: 'Files & Documents' })} />}
      </div>
    </div>
  );
};

export default PedigreePassportPanel;
