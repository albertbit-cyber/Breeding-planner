import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  findFreeQuarantineSlot,
  findQuarantineRoom,
  getQuarantineHousing,
  quarantineRoomNeedsRack,
} from '../../services/quarantineHousing';

// Separation is the one principle of quarantine a records app can genuinely enforce help with,
// because it already knows which tub every animal sits in. So it says plainly when an animal
// marked as quarantined is still housed in the middle of the collection.
//
// It reports rather than acts. Moving an animal between tubs in the app without the animal
// actually moving would make the records lie about where a real snake is, and someone would go
// looking in the wrong room. The move is one deliberate tap.

export default function HousingPanel({ snakes = [], spaces = {}, onMoveToQuarantine, onOpenSpaces }) {
  const { t } = useTranslation();
  const housing = getQuarantineHousing(snakes, spaces);
  if (!housing.quarantined) return null;

  const room = findQuarantineRoom(spaces.rooms);
  const freeSlot = findFreeQuarantineSlot(spaces);
  const needsRack = quarantineRoomNeedsRack(spaces);
  const { conflicts, separated, unhoused } = housing;

  const allSeparated = !conflicts.length && !unhoused.length;

  return (
    <div className={`rounded-2xl border p-3 shadow-sm ${conflicts.length ? 'border-rose-200 bg-rose-50' : 'border-neutral-200 bg-white'}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className={`text-sm font-semibold ${conflicts.length ? 'text-rose-900' : 'text-neutral-900'}`}>
            {t('quarantine.housing.title', { defaultValue: 'Where they are housed' })}
          </h3>
          <p className={`mt-0.5 text-[11px] ${conflicts.length ? 'text-rose-800' : 'text-neutral-500'}`}>
            {allSeparated
              ? t('quarantine.housing.allClear', {
                count: separated.length,
                defaultValue: 'All {{count}} in the Quarantine room. Keep servicing it last.',
              })
              : t('quarantine.housing.summary', {
                separated: separated.length,
                total: housing.quarantined,
                defaultValue: '{{separated}} of {{total}} are in the Quarantine room.',
              })}
          </p>
        </div>
        {room ? (
          <button type="button" className="rounded-xl border bg-white px-3 py-1.5 text-xs" onClick={onOpenSpaces}>
            {t('quarantine.housing.openSpaces', { defaultValue: 'Open Spaces' })}
          </button>
        ) : null}
      </div>

      {conflicts.length ? (
        <ul className="mt-2 flex flex-col gap-1.5">
          {conflicts.map(({ snake, location }) => (
            <li key={snake.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-rose-200 bg-white px-2.5 py-1.5">
              <span className="min-w-0 text-[11px]">
                <span className="font-medium text-neutral-900">{snake.name || snake.id}</span>
                <span className="text-neutral-500">
                  {' — '}
                  {location.assetName || t('quarantine.housing.unnamedAsset', { defaultValue: 'unnamed' })}
                  {location.slotLabel ? ` ${location.slotLabel}` : ''}
                  {location.roomName ? ` · ${location.roomName}` : ''}
                </span>
              </span>
              {freeSlot ? (
                <button
                  type="button"
                  className="shrink-0 rounded-lg bg-rose-600 px-2.5 py-1 text-[11px] font-semibold text-white"
                  onClick={() => onMoveToQuarantine?.(snake, freeSlot)}
                >
                  {t('quarantine.housing.move', { slot: freeSlot.slotLabel, defaultValue: 'Move to {{slot}}' })}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {unhoused.length ? (
        <p className="mt-2 text-[11px] text-neutral-500">
          {t('quarantine.housing.unhoused', {
            count: unhoused.length,
            defaultValue: '{{count}} not assigned to a tub yet.',
          })}
        </p>
      ) : null}

      {needsRack ? (
        <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-900">
          {t('quarantine.housing.needsRack', {
            defaultValue: 'The Quarantine room is empty — add a rack or terrarium to it in Spaces before you can move anyone in.',
          })}
        </p>
      ) : null}

      {conflicts.length && !freeSlot && !needsRack ? (
        <p className="mt-2 text-[11px] text-neutral-500">
          {t('quarantine.housing.roomFull', {
            defaultValue: 'The Quarantine room has no free tub. Add space to it in Spaces.',
          })}
        </p>
      ) : null}
    </div>
  );
}
