import { describe, expect, it } from 'vitest';
import {
  QUARANTINE_ROOM_NAME,
  findFreeQuarantineSlot,
  findQuarantineRoom,
  getQuarantineHousing,
  indexHousingBySnake,
  isQuarantineRoom,
  quarantineRoomNeedsRack,
} from './quarantineHousing';

const inQ = (id, name) => ({ id, name, status: 'Quarantine', quarantine: { startedAt: '2026-08-01' } });
const settled = (id, name) => ({ id, name, status: 'Active' });

function rack(id, roomId, name, assignments = {}) {
  const slots = [];
  for (let levelIndex = 0; levelIndex < 2; levelIndex += 1) {
    for (let columnIndex = 0; columnIndex < 2; columnIndex += 1) {
      slots.push({ levelIndex, columnIndex, snakeId: assignments[`${levelIndex}-${columnIndex}`] || null });
    }
  }
  return { id, roomId, name, slots };
}

const SPACES = {
  rooms: [
    { id: 'room-main', name: 'Snake Room' },
    { id: 'room-q', name: 'Quarantine' },
  ],
  heatRacks: [
    rack('rack-main', 'room-main', 'Rack 1', { '0-0': 'a', '1-1': 'b' }),
    rack('rack-q', 'room-q', 'Q Rack', { '0-0': 'c' }),
  ],
  terrariums: [
    { id: 'terr-main', roomId: 'room-main', name: 'Display', occupantIds: ['d'] },
  ],
};

describe('recognising the quarantine room', () => {
  it('matches the room by name, whatever the casing', () => {
    expect(isQuarantineRoom({ name: 'Quarantine' })).toBe(true);
    expect(isQuarantineRoom({ name: '  quarantine ' })).toBe(true);
    expect(isQuarantineRoom({ name: 'QUARANTINE' })).toBe(true);
  });

  it('does not match a room that merely mentions it', () => {
    expect(isQuarantineRoom({ name: 'Quarantine Annex' })).toBe(false);
    expect(isQuarantineRoom({ name: 'Snake Room' })).toBe(false);
    expect(isQuarantineRoom(null)).toBe(false);
  });

  it('finds the room in a collection', () => {
    expect(findQuarantineRoom(SPACES.rooms)?.id).toBe('room-q');
    expect(findQuarantineRoom([{ id: 'x', name: 'Shed' }])).toBeNull();
    expect(findQuarantineRoom(undefined)).toBeNull();
  });

  it('uses the constant as the created name', () => {
    expect(QUARANTINE_ROOM_NAME).toBe('Quarantine');
  });
});

describe('indexHousingBySnake', () => {
  it('locates animals in racks and terrariums alike', () => {
    const index = indexHousingBySnake(SPACES);
    expect(index.get('a')).toMatchObject({ kind: 'rack', roomName: 'Snake Room', assetName: 'Rack 1', inQuarantineRoom: false });
    expect(index.get('c')).toMatchObject({ kind: 'rack', roomName: 'Quarantine', inQuarantineRoom: true });
    expect(index.get('d')).toMatchObject({ kind: 'terrarium', assetName: 'Display' });
  });

  it('labels the tub position for a rack slot', () => {
    expect(indexHousingBySnake(SPACES).get('b').slotLabel).toBe('L2·C2');
  });

  // An animal can only be in one tub. If the data says otherwise, report one place, not two.
  it('keeps the first assignment when the data double-books an animal', () => {
    const doubled = {
      ...SPACES,
      heatRacks: [rack('r1', 'room-main', 'First', { '0-0': 'a' }), rack('r2', 'room-main', 'Second', { '0-0': 'a' })],
    };
    expect(indexHousingBySnake(doubled).get('a').assetName).toBe('First');
  });

  it('tolerates empty or missing spaces', () => {
    expect(indexHousingBySnake({}).size).toBe(0);
    expect(indexHousingBySnake(undefined).size).toBe(0);
  });
});

describe('getQuarantineHousing', () => {
  it('separates animals housed in quarantine from those housed with the collection', () => {
    const snakes = [inQ('a', 'Kaa'), inQ('c', 'Runa'), settled('b', 'Nyx')];
    const housing = getQuarantineHousing(snakes, SPACES);
    expect(housing.quarantined).toBe(2);
    expect(housing.conflicts.map(entry => entry.snake.id)).toEqual(['a']);
    expect(housing.separated.map(entry => entry.snake.id)).toEqual(['c']);
  });

  it('reports where a conflicting animal actually is, so it can be found', () => {
    const housing = getQuarantineHousing([inQ('a', 'Kaa')], SPACES);
    expect(housing.conflicts[0].location).toMatchObject({ roomName: 'Snake Room', assetName: 'Rack 1', slotLabel: 'L1·C1' });
  });

  it('counts a quarantined animal in a shared terrarium as a conflict', () => {
    const housing = getQuarantineHousing([inQ('d', 'Ash')], SPACES);
    expect(housing.conflicts[0].location.kind).toBe('terrarium');
  });

  it('lists quarantined animals with no assignment separately from conflicts', () => {
    const housing = getQuarantineHousing([inQ('zz', 'New')], SPACES);
    expect(housing.conflicts).toHaveLength(0);
    expect(housing.unhoused.map(entry => entry.snake.id)).toEqual(['zz']);
  });

  // Animals that are not in quarantine are none of this module's business.
  it('ignores settled animals entirely', () => {
    expect(getQuarantineHousing([settled('a', 'Kaa')], SPACES).quarantined).toBe(0);
  });

  it('treats every quarantined animal as unhoused when there are no spaces at all', () => {
    const housing = getQuarantineHousing([inQ('a', 'Kaa')], {});
    expect(housing.unhoused).toHaveLength(1);
    expect(housing.conflicts).toHaveLength(0);
  });
});

describe('findFreeQuarantineSlot', () => {
  it('finds the first empty tub in the quarantine room', () => {
    expect(findFreeQuarantineSlot(SPACES)).toMatchObject({ rackId: 'rack-q', levelIndex: 0, columnIndex: 1 });
  });

  it('returns null when there is no quarantine room', () => {
    expect(findFreeQuarantineSlot({ rooms: [{ id: 'r', name: 'Snake Room' }] })).toBeNull();
  });

  it('returns null when the quarantine rack is full, rather than a wrong slot', () => {
    const full = {
      ...SPACES,
      heatRacks: [rack('rack-q', 'room-q', 'Q Rack', { '0-0': 'c', '0-1': 'e', '1-0': 'f', '1-1': 'g' })],
    };
    expect(findFreeQuarantineSlot(full)).toBeNull();
  });

  it('never offers a slot in a room that is not the quarantine room', () => {
    const noQuarantineRack = { ...SPACES, heatRacks: [rack('rack-main', 'room-main', 'Rack 1')] };
    expect(findFreeQuarantineSlot(noQuarantineRack)).toBeNull();
  });
});

describe('quarantineRoomNeedsRack', () => {
  it('is true for an empty quarantine room', () => {
    expect(quarantineRoomNeedsRack({ rooms: [{ id: 'room-q', name: 'Quarantine' }] })).toBe(true);
  });

  it('is false once the room holds a rack or a terrarium', () => {
    expect(quarantineRoomNeedsRack(SPACES)).toBe(false);
    expect(quarantineRoomNeedsRack({
      rooms: [{ id: 'room-q', name: 'Quarantine' }],
      terrariums: [{ id: 't', roomId: 'room-q', occupantIds: [] }],
    })).toBe(false);
  });

  it('is false when there is no quarantine room to furnish', () => {
    expect(quarantineRoomNeedsRack({ rooms: [] })).toBe(false);
  });
});
