// Pure helpers behind the Field screen: what is due, what matches a search, where an animal
// lives, and the exact log entry a quick action writes. Kept free of React so they can be
// tested on their own and so the entry shapes stay identical to the ones the desktop editor
// writes (feeds, weights, sheds, cleanings in `snake.logs`).

import { isOutOfCollection } from "../animals/archive.js";

const text = (value) => String(value ?? "").trim();

// Archived (sold, died, given away) and removed snakes are not worked on in the field. The
// archive module owns that rule, so the Field tab and the desktop lists cannot disagree.
export const isRetired = (snake) => isOutOfCollection(snake);

export const sexLetter = (snake) => {
  const raw = text(snake?.sex).toLowerCase();
  if (raw === "m" || raw === "male") return "M";
  if (raw === "f" || raw === "female") return "F";
  return "";
};

const list = (value) => (Array.isArray(value) ? value.map(text).filter(Boolean) : []);

export const geneticsText = (snake = {}) => {
  const explicit = text(snake.genetics);
  if (explicit) return explicit;
  const parts = [];
  const morphs = list(snake.morphs);
  const hets = list(snake.hets);
  const possibleHets = list(snake.possibleHets);
  if (morphs.length) parts.push(morphs.join(", "));
  if (hets.length) parts.push(`het ${hets.join(", ")}`);
  if (possibleHets.length) parts.push(`possible het ${possibleHets.join(", ")}`);
  return parts.join(" | ");
};

export const snakeImage = (snake = {}) => {
  const direct = text(snake.imageUrl);
  if (direct) return direct;
  const photos = Array.isArray(snake.photos) ? snake.photos : [];
  const last = photos[photos.length - 1];
  return text(last?.url || last?.dataUrl);
};

export const localToday = (now = new Date()) => {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const daysBetween = (fromYmd, toYmd) => {
  const from = new Date(`${fromYmd}T12:00:00`);
  const to = new Date(`${toYmd}T12:00:00`);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime())) return 0;
  return Math.round((to.getTime() - from.getTime()) / 86400000);
};

// Feeds due today or earlier, overdue first, then by name. `getNextFeedCycleEvent` is the
// desktop helper (it needs a feeder profile with an interval and an accepted feed).
export const dueFeeds = (snakes, getNextFeedCycleEvent, today = localToday()) => {
  const rows = [];
  (Array.isArray(snakes) ? snakes : []).forEach((snake) => {
    if (!snake || snake.isDemo || isRetired(snake)) return;
    let event = null;
    try {
      event = typeof getNextFeedCycleEvent === "function" ? getNextFeedCycleEvent(snake) : null;
    } catch {
      event = null;
    }
    if (!event?.date || event.date > today) return;
    rows.push({ snake, dueDate: event.date, overdueDays: daysBetween(event.date, today) });
  });
  rows.sort((a, b) => b.overdueDays - a.overdueDays || text(a.snake.name).localeCompare(text(b.snake.name)));
  return rows;
};

export const searchSnakes = (snakes, query, limit = 30) => {
  const q = text(query).toLowerCase();
  if (!q) return [];
  const hits = [];
  for (const snake of Array.isArray(snakes) ? snakes : []) {
    if (!snake || snake.isDemo || isRetired(snake)) continue;
    const blob = [snake.name, snake.id, geneticsText(snake), snake.species, ...list(snake.groups), ...list(snake.tags)]
      .map((v) => text(v).toLowerCase())
      .join(" ");
    if (blob.includes(q)) {
      hits.push(snake);
      if (hits.length >= limit) break;
    }
  }
  return hits;
};

// rooms / heatRacks / terrariums are the planner's spaces. A rack slot holds `snakeId`.
export const buildLocationIndex = ({ rooms = [], heatRacks = [], terrariums = [] } = {}) => {
  const roomName = new Map((Array.isArray(rooms) ? rooms : []).map((room) => [text(room?.id), text(room?.name || room?.label)]));
  const index = new Map();
  (Array.isArray(heatRacks) ? heatRacks : []).forEach((rack) => {
    const rackLabel = text(rack?.name || rack?.label);
    const room = roomName.get(text(rack?.roomId)) || "";
    (Array.isArray(rack?.slots) ? rack.slots : []).forEach((slot, index_) => {
      const snakeId = text(slot?.snakeId || slot?.animalId);
      if (!snakeId) return;
      const level = Number(slot?.levelIndex);
      const column = Number(slot?.columnIndex);
      const slotLabel = text(slot?.label) || (Number.isFinite(level) && Number.isFinite(column) ? `L${level + 1}-${column + 1}` : `#${index_ + 1}`);
      index.set(snakeId, [room, rackLabel, slotLabel].filter(Boolean).join(" / "));
    });
  });
  (Array.isArray(terrariums) ? terrariums : []).forEach((terrarium) => {
    const label = text(terrarium?.name || terrarium?.label);
    const room = roomName.get(text(terrarium?.roomId)) || "";
    (Array.isArray(terrarium?.occupantIds) ? terrarium.occupantIds : []).forEach((id) => {
      const snakeId = text(id);
      if (snakeId && !index.has(snakeId)) index.set(snakeId, [room, label].filter(Boolean).join(" / "));
    });
  });
  return index;
};

export const QUICK_LOG_TYPES = ["feed", "weight", "shed", "clean"];

export const LOG_BUCKET = { feed: "feeds", weight: "weights", shed: "sheds", clean: "cleanings" };

const newId = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `log-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`);

// Returns { key, entry } or throws with a message to show in the sheet.
export const buildQuickLogEntry = (type, form = {}, { today = localToday() } = {}) => {
  const date = text(form.date) || today;
  const notes = text(form.notes);
  const id = newId();
  if (type === "feed") {
    const feed = text(form.feed);
    if (!feed) throw new Error("Pick what was offered.");
    const size = text(form.size);
    const grams = Number(form.weightGrams);
    return {
      key: "feeds",
      entry: {
        id,
        date,
        feed,
        size: size === "Other" ? text(form.sizeDetail) : size,
        weightGrams: Number.isFinite(grams) && grams > 0 ? grams : 0,
        method: text(form.method) || "Other",
        methodDetail: "",
        refused: form.refused === true,
        notes,
      },
    };
  }
  if (type === "weight") {
    const grams = Number(form.grams);
    if (!Number.isFinite(grams) || grams <= 0) throw new Error("Enter the weight in grams.");
    return { key: "weights", entry: { id, date, grams, notes } };
  }
  if (type === "shed") {
    return { key: "sheds", entry: { id, date, complete: form.complete !== false, notes } };
  }
  if (type === "clean") {
    return { key: "cleanings", entry: { id, date, notes } };
  }
  throw new Error("Unknown log type.");
};

export const appendLog = (snake, key, entry) => ({
  ...snake,
  logs: { ...(snake?.logs || {}), [key]: [...((snake?.logs || {})[key] || []), entry] },
});

export const removeLog = (snake, key, entryId) => ({
  ...snake,
  logs: { ...(snake?.logs || {}), [key]: ((snake?.logs || {})[key] || []).filter((entry) => entry?.id !== entryId) },
});

export const RECENT_LIMIT = 8;

export const pushRecent = (ids, id, limit = RECENT_LIMIT) => {
  const clean = text(id);
  if (!clean) return Array.isArray(ids) ? ids : [];
  return [clean, ...(Array.isArray(ids) ? ids : []).filter((x) => x !== clean)].slice(0, limit);
};
