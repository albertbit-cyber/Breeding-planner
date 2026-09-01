// Where quarantined animals actually live.
//
// Real separation is the part of quarantine that a records app can genuinely help with: it already
// knows which rack every animal sits in, so it can notice when an animal you have marked as
// quarantined is still housed in the middle of the collection -- which is the single most common
// way quarantine quietly fails.
//
// What it does NOT do is move animals on its own. A slot assignment is the breeder's record of
// where a real animal physically is; silently rewriting it would make the app claim a snake is in
// a room it is not in, and someone would go looking. So this module reports, and the move is one
// deliberate tap that changes both the record and, presumably, the tub.

import { isInQuarantine } from './quarantine';

export const QUARANTINE_ROOM_NAME = 'Quarantine';

export function isQuarantineRoom(room) {
  return String(room?.name || '').trim().toLowerCase() === QUARANTINE_ROOM_NAME.toLowerCase();
}

export function findQuarantineRoom(rooms = []) {
  return (Array.isArray(rooms) ? rooms : []).find(isQuarantineRoom) || null;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function slotLabel(slot) {
  const level = Number(slot?.levelIndex);
  const column = Number(slot?.columnIndex);
  if (!Number.isFinite(level) || !Number.isFinite(column)) return '';
  return `L${level + 1}·C${column + 1}`;
}

/**
 * Every housing assignment in the collection, keyed by animal id. An animal can only sensibly be
 * in one place, so the first assignment found wins and later duplicates are ignored.
 */
export function indexHousingBySnake(spaces = {}) {
  const rooms = asArray(spaces.rooms);
  const roomsById = new Map(rooms.map(room => [room.id, room]));
  const index = new Map();

  asArray(spaces.heatRacks).forEach(rack => {
    const room = roomsById.get(rack?.roomId) || null;
    asArray(rack?.slots).forEach(slot => {
      const snakeId = String(slot?.snakeId || '').trim();
      if (!snakeId || index.has(snakeId)) return;
      index.set(snakeId, {
        kind: 'rack',
        roomId: room?.id || null,
        roomName: room?.name || '',
        assetId: rack?.id || null,
        assetName: rack?.name || '',
        slot: { levelIndex: slot.levelIndex, columnIndex: slot.columnIndex },
        slotLabel: slotLabel(slot),
        inQuarantineRoom: isQuarantineRoom(room),
      });
    });
  });

  asArray(spaces.terrariums).forEach(terrarium => {
    const room = roomsById.get(terrarium?.roomId) || null;
    asArray(terrarium?.occupantIds).forEach(rawId => {
      const snakeId = String(rawId || '').trim();
      if (!snakeId || index.has(snakeId)) return;
      index.set(snakeId, {
        kind: 'terrarium',
        roomId: room?.id || null,
        roomName: room?.name || '',
        assetId: terrarium?.id || null,
        assetName: terrarium?.name || '',
        slot: null,
        slotLabel: '',
        inQuarantineRoom: isQuarantineRoom(room),
      });
    });
  });

  return index;
}

/** Quarantined animals housed somewhere other than the quarantine room, plus the unhoused ones. */
export function getQuarantineHousing(snakes = [], spaces = {}) {
  const index = indexHousingBySnake(spaces);
  const quarantined = asArray(snakes).filter(isInQuarantine);

  const separated = [];
  const conflicts = [];
  const unhoused = [];

  quarantined.forEach(snake => {
    const location = index.get(String(snake?.id || '').trim()) || null;
    if (!location) {
      unhoused.push({ snake, location: null });
      return;
    }
    if (location.inQuarantineRoom) separated.push({ snake, location });
    else conflicts.push({ snake, location });
  });

  return { quarantined: quarantined.length, separated, conflicts, unhoused };
}

/**
 * A free tub in the quarantine room, so "move it there" can be one tap rather than a hunt. Returns
 * null when the room has no rack yet, which the UI turns into an offer to add one.
 */
export function findFreeQuarantineSlot(spaces = {}) {
  const room = findQuarantineRoom(asArray(spaces.rooms));
  if (!room) return null;
  const racks = asArray(spaces.heatRacks).filter(rack => rack?.roomId === room.id);
  for (const rack of racks) {
    const free = asArray(rack.slots).find(slot => !String(slot?.snakeId || '').trim());
    if (free) {
      return {
        roomId: room.id,
        rackId: rack.id,
        rackName: rack.name || '',
        levelIndex: free.levelIndex,
        columnIndex: free.columnIndex,
        slotLabel: slotLabel(free),
      };
    }
  }
  return null;
}

/** True when the quarantine room exists but has nowhere to actually put an animal. */
export function quarantineRoomNeedsRack(spaces = {}) {
  const room = findQuarantineRoom(asArray(spaces.rooms));
  if (!room) return false;
  const hasRack = asArray(spaces.heatRacks).some(rack => rack?.roomId === room.id);
  const hasTerrarium = asArray(spaces.terrariums).some(item => item?.roomId === room.id);
  return !hasRack && !hasTerrarium;
}
