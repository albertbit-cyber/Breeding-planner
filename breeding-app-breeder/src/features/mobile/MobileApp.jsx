import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import "./MobileApp.css";
import { useAppearance } from "../../contexts/AppearanceContext.jsx";
import jsQR from "jsqr";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { estimateDataUrlBytes } from "../../utils/imageResize";
import SuggestionsTab from "../suggestions/SuggestionsTab";
import ShedTestTerminalPanel from "../lab/components/ShedTestTerminalPanel.jsx";
import BreederOrderGeneticTestModal from "../lab/components/BreederOrderGeneticTestModal.jsx";
import {
  clearAuthToken,
  fetchBreederSnapshot,
  fetchMobileAnimal,
  fetchMobilePermissions,
  fetchMobileRackMode,
  fetchMobileTasks,
  hasStoredAuthSession,
  login as loginApi,
  logMobileClean,
  logMobileFeed,
  logMobileNote,
  logMobileShed,
  logMobileWater,
  logMobileWeight,
  saveBreederSnapshot,
  syncMobileQueue,
} from "../../shared/apiClient";

// ג”€ג”€ג”€ Storage helpers ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€
const DEVICE_KEY    = "breedingPlannerMobileDeviceId";
const RECENT_KEY    = "breedingPlannerMobileRecentAnimals";
const QUEUE_KEY     = "breedingPlannerMobileSyncQueue";
const MODE_KEY      = "breedingPlannerMobileLastMode"; // terminal | full
const ANIMALS_CACHE = "breedingPlannerMobileAnimalsCache";
const SNAPSHOT_CACHE = "breedingPlannerMobileSnapshotCache";
const LAST_SYNC_KEY = "breedingPlannerMobileLastSync";

// Extract the animal ID from a full QR URL (e.g. https://…#snake=<id>) or
// return the raw value when it's already a plain ID.
const parseQrValue = (raw) => {
  try {
    const match = String(raw || "").match(/#snake=([^&\s]+)/);
    return match ? decodeURIComponent(match[1]) : raw.trim();
  } catch {
    return String(raw || "").trim();
  }
};

const getDeviceId = () => {
  try {
    const stored = localStorage.getItem(DEVICE_KEY);
    if (stored) return stored;
    const next = `mobile-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    localStorage.setItem(DEVICE_KEY, next);
    return next;
  } catch {
    return `mobile-${Date.now()}`;
  }
};

const readJson = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const writeJson = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
};

const scopedStorageKey = (baseKey, user = {}) => {
  const identity = String(user?.id || user?.email || "anonymous").trim().toLowerCase();
  const safeIdentity = identity.replace(/[^a-z0-9@._-]+/g, "_");
  return `${baseKey}:${safeIdentity || "anonymous"}`;
};

// ג”€ג”€ג”€ Tiny utilities ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€
const cap = (s) => String(s || "").replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const fmtSyncTime = (iso, t) => {
  if (!iso) return t("mobile.sync.never", { defaultValue: "Never" });
  try {
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    if (diff < 60000) return t("mobile.sync.justNow", { defaultValue: "Just now" });
    if (diff < 3600000) return t("mobile.sync.minutesAgo", { n: Math.floor(diff / 60000), defaultValue: "{{n}}m ago" });
    const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    if (diff < 86400000) return t("mobile.sync.todayAt", { time, defaultValue: "Today at {{time}}" });
    const date = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    return t("mobile.sync.dateAt", { date, time, defaultValue: "{{date}} at {{time}}" });
  } catch { return t("mobile.sync.unknown", { defaultValue: "Unknown" }); }
};
// Visible label for a quick-action type key (the key itself stays English for logic).
const quickActionLabel = (type, t) => {
  if (type === "feed") return t("mobile.actions.feed", { defaultValue: "Feed" });
  if (type === "weight") return t("mobile.actions.weight", { defaultValue: "Weight" });
  if (type === "shed") return t("mobile.actions.shed", { defaultValue: "Shed" });
  if (type === "clean") return t("mobile.actions.clean", { defaultValue: "Clean" });
  if (type === "water") return t("mobile.actions.water", { defaultValue: "Water" });
  if (type === "note") return t("mobile.actions.note", { defaultValue: "Note" });
  return cap(type);
};

const logoSrc = `${process.env.PUBLIC_URL || ""}/app-icons/icon_512x512.png`;

const asArray = (value) => (Array.isArray(value) ? value : []);
const isObject = (value) => !!value && typeof value === "object" && !Array.isArray(value);
const compactText = (...values) => values
  .flatMap((value) => (Array.isArray(value) ? value : [value]))
  .map((value) => String(value ?? "").trim())
  .filter(Boolean);

const firstText = (...values) => compactText(...values)[0] || "";
const joinText = (value) => compactText(value).join(", ");

const animalIdentity = (animal) => firstText(animal?.id, animal?.appAnimalId, animal?.animalId, animal?.snakeId);

const animalLocationParts = (animal = {}) => {
  const location = isObject(animal.location) ? animal.location : {};
  const space = isObject(animal.space) ? animal.space : {};
  return compactText(
    firstText(animal.roomName, animal.room, location.roomName, location.room, space.roomName, space.room),
    firstText(animal.rackName, animal.rack, animal.heatRackName, animal.heatRack, location.rackName, location.rack, space.rackName, space.rack),
    firstText(animal.tubName, animal.tub, animal.tubLabel, animal.slotLabel, location.tubName, location.tub, space.tubName, space.tub)
  );
};

const locationText = (animal) => animalLocationParts(animal).join(" / ");

const formatGeneticsText = (animal = {}) => {
  const explicit = firstText(animal.genetics, animal.morphHetText, animal.morphsText);
  if (explicit) return explicit;
  const morphs = joinText(animal.morphs);
  const hets = joinText(animal.hets);
  const possibleHets = joinText(animal.possibleHets);
  return compactText(
    morphs,
    hets ? `het ${hets}` : "",
    possibleHets ? `possible het ${possibleHets}` : ""
  ).join(" | ");
};

const ymdFromDate = (value) => {
  if (!value) return "";
  const raw = String(value);
  const datePart = raw.slice(0, 10);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(datePart)
    ? new Date(`${datePart}T12:00:00`)
    : new Date(raw);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : "";
};

const addDaysYmd = (ymd, days) => {
  const date = ymdFromDate(ymd);
  if (!date) return "";
  const parsed = new Date(`${date}T12:00:00`);
  parsed.setDate(parsed.getDate() + Number(days || 0));
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : "";
};

const entryDateValue = (entry = {}) => firstText(entry.date, entry.fedAt, entry.loggedAt, entry.createdAt, entry.updatedAt, entry.addedAt);
const entryTime = (entry = {}) => {
  const ymd = ymdFromDate(entryDateValue(entry));
  if (ymd) return new Date(`${ymd}T12:00:00`).getTime();
  const parsed = Date.parse(entryDateValue(entry));
  return Number.isFinite(parsed) ? parsed : 0;
};

const latestLogEntry = (entries = [], predicate = null) => {
  return asArray(entries)
    .filter((entry) => isObject(entry) && (!predicate || predicate(entry)))
    .sort((a, b) => entryTime(b) - entryTime(a) || recordTimestamp(b) - recordTimestamp(a))[0] || null;
};

const isRefusedFeed = (entry = {}) => (
  entry.refused === true || String(entry.result || entry.status || entry.outcome || "").toLowerCase() === "refused"
);

const normalizeFeederProfile = (animal = {}) => {
  const source = isObject(animal.feederProfile)
    ? animal.feederProfile
    : isObject(animal.feedCycle)
      ? animal.feedCycle
      : isObject(animal.feeder)
        ? animal.feeder
        : {};
  const latestFeed = latestLogEntry(animal?.logs?.feeds, (entry) => !isRefusedFeed(entry));
  const quantity = Number(source.quantity ?? source.count ?? source.items ?? 1);
  const weightGrams = Number(source.weightGrams ?? source.grams ?? source.preyWeightGrams ?? latestFeed?.weightGrams ?? latestFeed?.grams);
  const intervalDays = Number(source.intervalDays ?? source.feedIntervalDays ?? source.feedingIntervalDays ?? source.interval ?? "");
  const rawType = firstText(source.feedType, source.foodType, source.feed, latestFeed?.feed, latestFeed?.food);
  return {
    feedType: rawType.toUpperCase() === "ASF" ? "SF" : rawType,
    sizeClass: firstText(source.sizeClass, source.size, source.preySize, latestFeed?.size, latestFeed?.sizeDetail),
    weightGrams: Number.isFinite(weightGrams) && weightGrams > 0 ? weightGrams : "",
    quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
    intervalDays: Number.isFinite(intervalDays) && intervalDays > 0 ? Math.round(intervalDays) : "",
    notes: firstText(source.notes),
  };
};

const getNextFeedCycle = (animal = {}) => {
  const profile = normalizeFeederProfile(animal);
  if (!profile.intervalDays) return null;
  const latestFeed = latestLogEntry(animal?.logs?.feeds, (entry) => !isRefusedFeed(entry));
  const lastFeedDate = latestFeed ? ymdFromDate(entryDateValue(latestFeed)) : "";
  if (!lastFeedDate) return null;
  const nextFeedDate = addDaysYmd(lastFeedDate, profile.intervalDays);
  return nextFeedDate ? { profile, latestFeed, lastFeedDate, nextFeedDate } : null;
};

const isFeedDue = (animal = {}) => {
  const cycle = getNextFeedCycle(animal);
  return !!cycle && cycle.nextFeedDate <= new Date().toISOString().slice(0, 10);
};

const sexMatchesFilter = (animal, filter) => {
  if (!filter) return true;
  const sex = String(animal?.sex || "").trim().toLowerCase();
  if (filter === "Male") return sex === "male" || sex === "m";
  if (filter === "Female") return sex === "female" || sex === "f";
  return sex === String(filter).toLowerCase();
};

const animalSearchBlob = (animal = {}) => compactText(
  animal.name,
  animalIdentity(animal),
  animal.sex,
  animal.status,
  animal.species,
  formatGeneticsText(animal),
  animal.groups,
  animal.tags,
  animalLocationParts(animal)
).join(" ").toLowerCase();

const recordIdentity = (record, fallbackPrefix, index) => {
  if (!record || typeof record !== "object") return `${fallbackPrefix}:${index}`;
  return String(
    record.id ||
    record.appAnimalId ||
    record.animalId ||
    record.snakeId ||
    record.pairingId ||
    record.uuid ||
    `${fallbackPrefix}:${index}`
  );
};

const readRecordTime = (value) => {
  if (!value) return 0;
  const time = Date.parse(String(value));
  return Number.isFinite(time) ? time : 0;
};

const recordTimestamp = (record) => {
  if (!record || typeof record !== "object") return 0;
  const metadata = record.metadata && typeof record.metadata === "object" ? record.metadata : {};
  return Math.max(
    readRecordTime(record.updatedAt),
    readRecordTime(record.modifiedAt),
    readRecordTime(record.lastModifiedAt),
    readRecordTime(record.createdAt),
    readRecordTime(metadata.updatedAt),
    readRecordTime(metadata.modifiedAt),
    readRecordTime(metadata.backendUpdatedAt),
    readRecordTime(metadata.backendCreatedAt)
  );
};

const markRecordUpdated = (record, at = new Date().toISOString()) => {
  const metadata = record?.metadata && typeof record.metadata === "object" ? record.metadata : {};
  return {
    ...record,
    updatedAt: at,
    metadata: {
      ...metadata,
      updatedAt: at,
    },
  };
};

const mergeStringList = (...values) => {
  const merged = [];
  const seen = new Set();
  values.flatMap((value) => (Array.isArray(value) ? value : [])).forEach((item) => {
    const text = String(item || "").trim();
    if (!text) return;
    const key = text.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(text);
  });
  return merged;
};

const entryIdentity = (entry, label, index) => {
  if (!entry || typeof entry !== "object") return `${label}:blank:${index}`;
  const explicit = [
    entry.id,
    entry.logId,
    entry.uuid,
    entry.createdAt && `${entry.createdAt}:${entry.actionType || label}`,
    entry.addedAt && `${entry.addedAt}:${entry.source || label}`,
  ].map((value) => String(value || "").trim()).find(Boolean);
  if (explicit) return explicit;
  return [
    label,
    entry.date || "",
    entry.time || "",
    entry.result || entry.outcome || "",
    entry.feed || entry.food || entry.prey || "",
    entry.size || entry.weight || entry.grams || "",
    entry.notes || entry.note || "",
  ].map((part) => String(part || "").trim()).join("|") || `${label}:${index}`;
};

const mergeEntryArrays = (localEntries, backendEntries, label) => {
  const rows = [
    ...(Array.isArray(backendEntries) ? backendEntries : []),
    ...(Array.isArray(localEntries) ? localEntries : []),
  ].filter((entry) => entry && typeof entry === "object");
  const merged = new Map();
  rows.forEach((entry, index) => {
    const key = entryIdentity(entry, label, index);
    const current = merged.get(key);
    if (!current || recordTimestamp(entry) >= recordTimestamp(current)) {
      merged.set(key, current ? { ...current, ...entry } : entry);
    }
  });
  return Array.from(merged.values()).sort((a, b) => recordTimestamp(b) - recordTimestamp(a));
};

const mergeLogs = (localLogs, backendLogs) => {
  const local = localLogs && typeof localLogs === "object" ? localLogs : {};
  const backend = backendLogs && typeof backendLogs === "object" ? backendLogs : {};
  const keys = Array.from(new Set([
    "feeds",
    "weights",
    "sheds",
    "cleanings",
    "meds",
    "water",
    "notes",
    "health",
    ...Object.keys(local),
    ...Object.keys(backend),
  ]));
  return keys.reduce((acc, key) => {
    acc[key] = mergeEntryArrays(local[key], backend[key], key);
    return acc;
  }, {});
};

const mergeAnimalRecord = (localAnimal, backendAnimal) => {
  if (!localAnimal) return backendAnimal;
  if (!backendAnimal) return localAnimal;
  // A saved record replaces a demo with the same id whole; merged, it kept isDemo and was hidden.
  if (isDemoAnimal(localAnimal) && !isDemoAnimal(backendAnimal)) return backendAnimal;
  const localTime = recordTimestamp(localAnimal);
  const backendTime = recordTimestamp(backendAnimal);
  const base = localTime >= backendTime ? localAnimal : backendAnimal;
  const other = localTime >= backendTime ? backendAnimal : localAnimal;
  return {
    ...other,
    ...base,
    morphs: mergeStringList(other.morphs, base.morphs),
    hets: mergeStringList(other.hets, base.hets),
    possibleHets: mergeStringList(other.possibleHets, base.possibleHets),
    tags: mergeStringList(other.tags, base.tags),
    groups: mergeStringList(other.groups, base.groups),
    photos: mergeEntryArrays(other.photos, base.photos, "photo"),
    logs: mergeLogs(other.logs, base.logs),
  };
};

const mergePairingRecord = (localPairing, backendPairing) => {
  if (!localPairing) return backendPairing;
  if (!backendPairing) return localPairing;
  const localTime = recordTimestamp(localPairing);
  const backendTime = recordTimestamp(backendPairing);
  const base = localTime >= backendTime ? localPairing : backendPairing;
  const other = localTime >= backendTime ? backendPairing : localPairing;
  return {
    ...other,
    ...base,
    goals: mergeStringList(other.goals, base.goals),
    tags: mergeStringList(other.tags, base.tags),
    locks: mergeEntryArrays(other.locks, base.locks, "locks"),
    lockLogs: mergeEntryArrays(other.lockLogs, base.lockLogs, "lockLogs"),
    appointments: mergeEntryArrays(other.appointments, base.appointments, "appointments"),
    mobileOvulationLogs: mergeEntryArrays(other.mobileOvulationLogs, base.mobileOvulationLogs, "mobileOvulationLogs"),
    mobilePreLayShedLogs: mergeEntryArrays(other.mobilePreLayShedLogs, base.mobilePreLayShedLogs, "mobilePreLayShedLogs"),
    mobileClutchLogs: mergeEntryArrays(other.mobileClutchLogs, base.mobileClutchLogs, "mobileClutchLogs"),
    mobileHatchLogs: mergeEntryArrays(other.mobileHatchLogs, base.mobileHatchLogs, "mobileHatchLogs"),
    logs: mergeLogs(other.logs, base.logs),
  };
};

const mergeSnapshotList = (localItems, backendItems, fallbackPrefix, mergeRecord) => {
  const merged = new Map();
  const order = [];
  const add = (record, source, sourceIndex) => {
    if (!record || typeof record !== "object") return;
    const key = recordIdentity(record, fallbackPrefix, sourceIndex);
    const current = merged.get(key);
    if (!current) {
      merged.set(key, record);
      order.push(key);
      return;
    }
    if (typeof mergeRecord === "function") {
      merged.set(key, source === "local" ? mergeRecord(record, current) : mergeRecord(current, record));
      return;
    }
    if (recordTimestamp(record) >= recordTimestamp(current)) {
      merged.set(key, record);
    }
  };
  (Array.isArray(backendItems) ? backendItems : []).forEach((record, index) => add(record, "backend", index));
  (Array.isArray(localItems) ? localItems : []).forEach((record, index) => add(record, "local", index));
  return order.map((key) => merged.get(key));
};

const isDemoAnimal = (animal) => !!animal && typeof animal === "object" && animal.isDemo === true;

const demoAnimalIds = (animals = []) => new Set(
  (Array.isArray(animals) ? animals : [])
    .filter(isDemoAnimal)
    .map((animal) => String(animal.id || animal.appAnimalId || animal.animalId || "").trim())
    .filter(Boolean)
);

const filterDemoPairings = (pairings = [], demoIds = new Set()) => (
  (Array.isArray(pairings) ? pairings : []).filter((pairing) => {
    if (!pairing || typeof pairing !== "object" || pairing.isDemo === true) return false;
    const maleId = String(pairing.maleId || pairing.maleAnimalAppId || "").trim();
    const femaleId = String(pairing.femaleId || pairing.femaleAnimalAppId || "").trim();
    return !demoIds.has(maleId) && !demoIds.has(femaleId);
  })
);

const normalizeMobilePlannerState = (state = null) => {
  if (!isObject(state)) return null;
  const normalized = {
    ...state,
    rooms: asArray(state.rooms).filter(isObject),
    heatRacks: asArray(state.heatRacks || state.racks).filter(isObject),
    terrariums: asArray(state.terrariums).filter(isObject),
    spaces: asArray(state.spaces).filter(isObject),
    groups: asArray(state.groups).map((item) => String(item || "").trim()).filter(Boolean),
  };
  return normalized;
};

const extractMobilePlannerState = (snapshot = {}) => {
  if (isObject(snapshot?.plannerState)) return normalizeMobilePlannerState(snapshot.plannerState);
  if (asArray(snapshot?.rooms).length || asArray(snapshot?.heatRacks).length || asArray(snapshot?.terrariums).length || asArray(snapshot?.spaces).length) {
    return normalizeMobilePlannerState({
      rooms: snapshot.rooms,
      heatRacks: snapshot.heatRacks,
      terrariums: snapshot.terrariums,
      spaces: snapshot.spaces,
      groups: snapshot.groups,
    });
  }
  return null;
};

const hasPlannerSpaces = (plannerState) => (
  !!plannerState && (
    asArray(plannerState.rooms).length > 0 ||
    asArray(plannerState.heatRacks).length > 0 ||
    asArray(plannerState.terrariums).length > 0 ||
    asArray(plannerState.spaces).length > 0
  )
);

const normalizeMobileSnapshot = (snapshot = {}) => {
  const animals = Array.isArray(snapshot?.animals)
    ? snapshot.animals
    : Array.isArray(snapshot?.snakes)
      ? snapshot.snakes
      : [];
  const demoIds = demoAnimalIds(animals);
  return {
    animals: animals.filter((animal) => !isDemoAnimal(animal)),
    pairings: filterDemoPairings(snapshot?.pairings, demoIds),
    // Breeding cards travel with the snapshot read-only here; the desktop app owns their edits.
    breedingCycles: Array.isArray(snapshot?.breedingCycles) ? snapshot.breedingCycles.filter((c) => c && !c.deletedAt && !demoIds.has(c.femaleId)) : [],
    plannerState: extractMobilePlannerState(snapshot),
  };
};

const mergeMobileSnapshot = (localSnapshot = {}, backendSnapshot = {}) => normalizeMobileSnapshot({
  animals: mergeSnapshotList(
    localSnapshot.animals || localSnapshot.snakes,
    backendSnapshot.animals || backendSnapshot.snakes,
    "animal",
    mergeAnimalRecord
  ),
  pairings: mergeSnapshotList(localSnapshot.pairings, backendSnapshot.pairings, "pairing", mergePairingRecord),
  breedingCycles: backendSnapshot.breedingCycles || localSnapshot.breedingCycles || [],
  plannerState: backendSnapshot.plannerState || localSnapshot.plannerState,
});

const animalMapByIdentity = (animals = []) => {
  const map = new Map();
  asArray(animals).forEach((animal) => {
    compactText(animal?.id, animal?.appAnimalId, animal?.animalId, animal?.snakeId).forEach((key) => {
      map.set(key, animal);
    });
  });
  return map;
};

const rackSlotLabel = (slot = {}, index = 0, t) => {
  const explicit = firstText(slot.label, slot.name, slot.tub, slot.tubLabel, slot.position);
  if (explicit) return explicit;
  const level = Number(slot.levelIndex);
  const column = Number(slot.columnIndex);
  if (Number.isFinite(level) && Number.isFinite(column)) return `L${level + 1}-${column + 1}`;
  return t("mobile.rack.tubNumber", { n: index + 1, defaultValue: "Tub {{n}}" });
};

const defaultRackSlots = (rack = {}) => {
  const columns = Math.max(1, Number(rack.columns) || Number(rack.cols) || 1);
  const levels = Math.max(1, Number(rack.levels) || Number(rack.rows) || 1);
  const slots = [];
  for (let levelIndex = 0; levelIndex < levels; levelIndex += 1) {
    for (let columnIndex = 0; columnIndex < columns; columnIndex += 1) {
      slots.push({ levelIndex, columnIndex, snakeId: null });
    }
  }
  return slots;
};

const makeTubRow = (slot, index, animalsById, t) => {
  const animalId = firstText(slot?.snakeId, slot?.animalId, slot?.appAnimalId);
  const occupant = animalId ? animalsById.get(animalId) : null;
  return {
    tub: rackSlotLabel(slot, index, t),
    animalId,
    name: occupant?.name || animalId || "",
    feedingDue: occupant ? isFeedDue(occupant) : false,
    alert: occupant ? String(occupant.status || "").toLowerCase().includes("quarantine") : false,
  };
};

const buildRackDataFromAnimalLocations = (animals = [], t) => {
  const roomMap = new Map();
  asArray(animals).forEach((animal) => {
    const [roomName, rackName, tubName] = animalLocationParts(animal);
    if (!roomName && !rackName && !tubName) return;
    const resolvedRoom = roomName || t("mobile.rack.unassignedRoom", { defaultValue: "Unassigned room" });
    const resolvedRack = rackName || t("mobile.rack.looseHousing", { defaultValue: "Loose housing" });
    if (!roomMap.has(resolvedRoom)) roomMap.set(resolvedRoom, new Map());
    const rackMap = roomMap.get(resolvedRoom);
    if (!rackMap.has(resolvedRack)) rackMap.set(resolvedRack, []);
    rackMap.get(resolvedRack).push({
      tub: tubName || t("mobile.rack.openTub", { defaultValue: "Open" }),
      animalId: animalIdentity(animal),
      name: animal.name || animalIdentity(animal),
      feedingDue: isFeedDue(animal),
      alert: String(animal.status || "").toLowerCase().includes("quarantine"),
    });
  });
  return {
    rooms: Array.from(roomMap.entries()).map(([roomName, rackMap]) => ({
      roomName,
      racks: Array.from(rackMap.entries()).map(([rackName, tubs]) => ({ rackName, tubs })),
    })),
  };
};

const buildRackDataFromPlannerState = (plannerState, animals = [], t) => {
  const state = normalizeMobilePlannerState(plannerState);
  if (!hasPlannerSpaces(state)) return buildRackDataFromAnimalLocations(animals, t);
  const terrariumFallback = t("mobile.rack.terrarium", { defaultValue: "Terrarium" });

  const animalsById = animalMapByIdentity(animals);
  if (!asArray(state.rooms).length && asArray(state.spaces).length) {
    const legacyRooms = asArray(state.spaces).map((room) => {
      const racks = asArray(room.racks).map((rack) => ({
        rackName: firstText(rack.name, rack.type, rack.tubSize) || t("mobile.rack.rack", { defaultValue: "Rack" }),
        tubs: defaultRackSlots({
          columns: rack.cols,
          rows: rack.rows,
        }).map((slot, index) => makeTubRow(slot, index, animalsById, t)),
      }));
      const terrariums = asArray(room.terrariums).map((terrarium) => ({
        rackName: t("mobile.rack.terrariumName", { name: firstText(terrarium.name, terrarium.type) || terrariumFallback, defaultValue: "{{name}} (Terrarium)" }),
        tubs: Array.from({ length: Math.max(1, Number(terrarium.capacity) || Number(terrarium.occupants) || 1) }).map((_, index) => ({
          tub: t("mobile.rack.animalNumber", { n: index + 1, defaultValue: "Animal {{n}}" }),
          animalId: "",
          name: "",
          feedingDue: false,
          alert: false,
        })),
      }));
      return {
        roomName: firstText(room.name, room.label) || t("mobile.rack.room", { defaultValue: "Room" }),
        racks: [...racks, ...terrariums],
      };
    }).filter((room) => room.racks.length);
    const fallback = buildRackDataFromAnimalLocations(animals, t);
    return { rooms: [...legacyRooms, ...asArray(fallback.rooms)] };
  }

  const rooms = asArray(state.rooms);
  const racks = asArray(state.heatRacks);
  const terrariums = asArray(state.terrariums);

  const roomRows = rooms.map((room) => {
    const roomId = firstText(room.id, room.roomId);
    const roomName = firstText(room.name, room.label) || t("mobile.rack.room", { defaultValue: "Room" });
    const rackRows = racks
      .filter((rack) => firstText(rack.roomId) === roomId)
      .map((rack) => {
        const sourceSlots = asArray(rack.slots).length ? asArray(rack.slots) : defaultRackSlots(rack);
        return {
          rackName: firstText(rack.name, rack.label, rack.type) || t("mobile.rack.rack", { defaultValue: "Rack" }),
          tubs: sourceSlots.map((slot, index) => makeTubRow(slot, index, animalsById, t)),
        };
      });

    const terrariumRows = terrariums
      .filter((terrarium) => firstText(terrarium.roomId) === roomId)
      .map((terrarium) => {
        const occupantIds = asArray(terrarium.occupantIds).map((value) => String(value || "").trim()).filter(Boolean);
        const capacity = Math.max(1, Number(terrarium.capacity) || occupantIds.length || 1);
        const tubs = Array.from({ length: capacity }).map((_, index) => {
          const animalId = occupantIds[index] || "";
          const occupant = animalId ? animalsById.get(animalId) : null;
          return {
            tub: t("mobile.rack.animalNumber", { n: index + 1, defaultValue: "Animal {{n}}" }),
            animalId,
            name: occupant?.name || animalId || "",
            feedingDue: occupant ? isFeedDue(occupant) : false,
            alert: occupant ? String(occupant.status || "").toLowerCase().includes("quarantine") : false,
          };
        });
        return {
          rackName: t("mobile.rack.terrariumName", { name: firstText(terrarium.name, terrarium.label) || terrariumFallback, defaultValue: "{{name}} (Terrarium)" }),
          tubs,
        };
      });

    return { roomName, racks: [...rackRows, ...terrariumRows] };
  }).filter((room) => room.racks.length);

  const fallback = buildRackDataFromAnimalLocations(animals, t);
  return { rooms: [...roomRows, ...asArray(fallback.rooms)] };
};

const upsertSnapshotRecord = (records, updated, fallbackPrefix) => {
  const list = Array.isArray(records) ? [...records] : [];
  const updatedKey = recordIdentity(updated, fallbackPrefix, 0);
  const index = list.findIndex((record, idx) => recordIdentity(record, fallbackPrefix, idx) === updatedKey);
  if (index >= 0) list[index] = updated; else list.push(updated);
  return list;
};

// ג”€ג”€ג”€ Small shared components ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€
function Toast({ msg, onDismiss }) {
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(onDismiss, 3200);
    return () => clearTimeout(t);
  }, [msg, onDismiss]);
  if (!msg) return null;
  return (
    <div className="mbl-toast" role="alert" onClick={onDismiss}>
      {msg}
    </div>
  );
}

function Spinner() {
  const { t } = useTranslation();
  return <div className="mbl-spinner" aria-label={t("mobile.common.loading", { defaultValue: "Loading" })} />;
}

function OfflineBanner({ online, queued, onSync }) {
  const { t } = useTranslation();
  if (online && !queued) return null;
  return (
    <div className={`mbl-offline-bar ${online ? "" : "is-offline"}`}>
      <span>{online ? t("mobile.sync.updatesPending", { count: queued, defaultValue: "{{count}} updates pending sync", defaultValue_one: "{{count}} update pending sync" }) : t("mobile.sync.offline", { defaultValue: "Offline" })}</span>
      {online && queued > 0 && (
        <button type="button" onClick={onSync}>{t("mobile.sync.syncNow", { defaultValue: "Sync now" })}</button>
      )}
    </div>
  );
}

function ActionSheet({ title, onClose, children }) {
  const { t } = useTranslation();
  return (
    <div className="mbl-sheet-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="mbl-sheet">
        <div className="mbl-sheet-handle" />
        <div className="mbl-sheet-head">
          <h2>{title}</h2>
          <button type="button" className="mbl-icon-btn" onClick={onClose} aria-label={t("mobile.common.close", { defaultValue: "Close" })}>✕</button>
        </div>
        <div className="mbl-sheet-body">{children}</div>
      </div>
    </div>
  );
}

// ג”€ג”€ג”€ LOGIN SCREEN ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€
function LoginScreen({ onLogin }) {
  const { t } = useTranslation();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!email.trim() || !password.trim()) { setError(t("mobile.login.missingCredentials", { defaultValue: "Enter email and password." })); return; }
    setBusy(true);
    try {
      const result = await loginApi({ email: email.trim().toLowerCase(), password });
      onLogin(result?.user || {});
    } catch (err) {
      setError(err instanceof Error ? err.message : t("mobile.login.failed", { defaultValue: "Login failed. Check your credentials." }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mbl-login-shell">
      <div className="mbl-login-card">
        <img src={logoSrc} alt="Serpentora" className="mbl-login-logo" />
        <h1 className="mbl-login-title">Serpentora</h1>
        <p className="mbl-login-tagline">{t("mobile.login.tagline", { defaultValue: "Complete Reptile Management App" })}</p>
        <p className="mbl-login-sub">{t("mobile.login.subtitle", { defaultValue: "Sign in to sync with your desktop account" })}</p>
        <form className="mbl-login-form" onSubmit={submit}>
          <label className="mbl-field">
            <span>{t("mobile.login.email", { defaultValue: "Email" })}</span>
            <input
              type="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("mobile.login.emailPlaceholder", { defaultValue: "you@example.com" })}
              disabled={busy}
            />
          </label>
          <label className="mbl-field">
            <span>{t("mobile.login.password", { defaultValue: "Password" })}</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              disabled={busy}
            />
          </label>
          {error && <p className="mbl-login-error">{error}</p>}
          <button type="submit" className="mbl-btn mbl-btn--sk-primary mbl-btn--wide" disabled={busy}>
            {busy ? <Spinner /> : t("mobile.login.signIn", { defaultValue: "Sign in" })}
          </button>
        </form>
      </div>
    </div>
  );
}

// ג”€ג”€ג”€ MODE SELECT SCREEN ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€
function ModeSelectScreen({ user, onMode, onSignOut }) {
  const { t } = useTranslation();
  const displayName = user?.fullName || user?.displayName || user?.email || t("mobile.mode.defaultName", { defaultValue: "Keeper" });
  return (
    <div className="mbl-mode-shell">
      <div className="mbl-mode-header">
        <img src={logoSrc} alt="" className="mbl-mode-logo" />
        <p className="mbl-mode-greeting">{t("mobile.mode.greeting", { name: displayName, defaultValue: "Hi, {{name}}" })}</p>
        <button type="button" className="mbl-text-btn mbl-mode-signout" onClick={onSignOut}>
          {t("mobile.common.signOut", { defaultValue: "Sign out" })}
        </button>
      </div>

      <div className="mbl-mode-cards">
        <button
          type="button"
          className="mbl-mode-card mbl-mode-card--terminal"
          onClick={() => onMode("terminal")}
        >
          <span className="mbl-mode-icon">⬛</span>
          <strong>{t("mobile.mode.terminalTitle", { defaultValue: "Terminal" })}</strong>
          <span>{t("mobile.mode.terminalDescription", { defaultValue: "Scan a QR code to instantly open and update any snake card. Fast rack workflow." })}</span>
        </button>

        <button
          type="button"
          className="mbl-mode-card mbl-mode-card--full"
          onClick={() => onMode("full")}
        >
          <span className="mbl-mode-icon">≡</span>
          <strong>{t("mobile.mode.fullTitle", { defaultValue: "Full Access" })}</strong>
          <span>{t("mobile.mode.fullDescription", { defaultValue: "Animals, pairings, tasks, rack mode and more — full desktop features on mobile." })}</span>
        </button>
      </div>
    </div>
  );
}

// ג”€ג”€ג”€ QR SCANNER (shared by both modes) ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€
function QRScanner({ onScan, onError }) {
  const videoRef  = useRef(null);
  const activeRef = useRef(false);
  const canvasRef = useRef(null);
  const { t } = useTranslation();

  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) { onError(t("mobile.scan.cameraUnavailable", { defaultValue: "Camera not available." })); return; }
    let stream;
    let timer;
    activeRef.current = true;

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } } })
      .then((s) => {
        stream = s;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = s;

        if ("BarcodeDetector" in window) {
          // Use native BarcodeDetector when available
          const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
          const tick = async () => {
            if (!activeRef.current || !videoRef.current) return;
            try {
              const codes = await detector.detect(videoRef.current);
              const val = codes?.[0]?.rawValue;
              if (val) { activeRef.current = false; onScan(val); return; }
            } catch {}
            timer = setTimeout(tick, 500);
          };
          timer = setTimeout(tick, 800);
        } else {
          // Fallback: jsQR canvas scan loop
          if (!canvasRef.current) canvasRef.current = document.createElement("canvas");
          const canvas = canvasRef.current;
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          const tick = () => {
            if (!activeRef.current || !videoRef.current) return;
            const v = videoRef.current;
            if (v.readyState >= 2 && v.videoWidth > 0) {
              canvas.width  = v.videoWidth;
              canvas.height = v.videoHeight;
              ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
              const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const code = jsQR(imgData.data, imgData.width, imgData.height, { inversionAttempts: "dontInvert" });
              if (code?.data) { activeRef.current = false; onScan(code.data); return; }
            }
            timer = requestAnimationFrame(tick);
          };
          timer = requestAnimationFrame(tick);
        }
      })
      .catch(() => onError(t("mobile.scan.cameraDenied", { defaultValue: "Camera access denied. Use manual entry below." })));

    return () => {
      activeRef.current = false;
      clearTimeout(timer);
      cancelAnimationFrame(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [onScan, onError, t]);

  return (
    <div className="mbl-camera-box">
      <video ref={videoRef} autoPlay playsInline muted className="mbl-camera-video" />
      <div className="mbl-camera-frame" />
    </div>
  );
}

// ג”€ג”€ג”€ ANIMAL EDIT FORM (full edit, used by Terminal mode) ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€
function AnimalEditForm({ animal, onSave, onCancel, busy }) {
  const [draft, setDraft] = useState(() => ({
    name: animal?.name || "",
    sex: animal?.sex || "",
    genetics: animal?.genetics || "",
    status: animal?.status || "",
    room: animal?.room || "",
    rack: animal?.rack || "",
    tub: animal?.tub || "",
    weight: animal?.weight || "",
    notes: animal?.notes || "",
    dob: animal?.dob || "",
    species: animal?.species || "",
    price: animal?.price || "",
    acquisitionDate: animal?.acquisitionDate || "",
  }));

  const { t } = useTranslation();
  const set = (field) => (e) => setDraft((prev) => ({ ...prev, [field]: e.target.value }));

  const fields = [
    { key: "name",            label: t("mobile.edit.name", { defaultValue: "Name" }),                 type: "text" },
    { key: "sex",             label: t("mobile.edit.sex", { defaultValue: "Sex" }),                   type: "select", opts: ["", "Male", "Female", "Unknown"] },
    { key: "genetics",        label: t("mobile.edit.genetics", { defaultValue: "Genetics / Morph" }), type: "text" },
    { key: "status",          label: t("mobile.edit.status", { defaultValue: "Status" }),             type: "select", opts: ["", "Active", "For sale", "Sold", "Deceased", "Quarantine"] },
    { key: "species",         label: t("mobile.edit.species", { defaultValue: "Species" }),           type: "text" },
    { key: "dob",             label: t("mobile.edit.dob", { defaultValue: "Date of birth" }),         type: "date" },
    { key: "weight",          label: t("mobile.edit.weight", { defaultValue: "Weight (g)" }),         type: "number" },
    { key: "acquisitionDate", label: t("mobile.edit.acquired", { defaultValue: "Acquired" }),         type: "date" },
    { key: "price",           label: t("mobile.edit.price", { defaultValue: "Price" }),               type: "text" },
    { key: "room",            label: t("mobile.edit.room", { defaultValue: "Room" }),                 type: "text" },
    { key: "rack",            label: t("mobile.edit.rack", { defaultValue: "Rack" }),                 type: "text" },
    { key: "tub",             label: t("mobile.edit.tub", { defaultValue: "Tub / Enclosure" }),       type: "text" },
    { key: "notes",           label: t("mobile.edit.notes", { defaultValue: "Notes" }),               type: "textarea" },
  ];

  // Option values stay in English (they are stored data); only the visible text is translated.
  const optionLabels = {
    "": t("mobile.edit.notSet", { defaultValue: "— not set —" }),
    Male: t("mobile.edit.sexMale", { defaultValue: "Male" }),
    Female: t("mobile.edit.sexFemale", { defaultValue: "Female" }),
    Unknown: t("mobile.edit.sexUnknown", { defaultValue: "Unknown" }),
    Active: t("mobile.edit.statusActive", { defaultValue: "Active" }),
    "For sale": t("mobile.edit.statusForSale", { defaultValue: "For sale" }),
    Sold: t("mobile.edit.statusSold", { defaultValue: "Sold" }),
    Deceased: t("mobile.edit.statusDeceased", { defaultValue: "Deceased" }),
    Quarantine: t("mobile.edit.statusQuarantine", { defaultValue: "Quarantine" }),
  };

  return (
    <form className="mbl-edit-form" onSubmit={(e) => { e.preventDefault(); onSave(draft); }}>
      {fields.map(({ key, label, type, opts }) => (
        <label key={key} className="mbl-field">
          <span>{label}</span>
          {type === "select" ? (
            <select value={draft[key]} onChange={set(key)}>
              {opts.map((o) => <option key={o} value={o}>{optionLabels[o] ?? o}</option>)}
            </select>
          ) : type === "textarea" ? (
            <textarea rows={3} value={draft[key]} onChange={set(key)} />
          ) : (
            <input type={type} value={draft[key]} onChange={set(key)}
              inputMode={type === "number" ? "numeric" : undefined} />
          )}
        </label>
      ))}
      <div className="mbl-edit-actions">
        <button type="button" className="mbl-btn" onClick={onCancel} disabled={busy}>{t("mobile.common.cancel", { defaultValue: "Cancel" })}</button>
        <button type="submit" className="mbl-btn mbl-btn--sk-primary" disabled={busy}>
          {busy ? <Spinner /> : t("mobile.edit.saveChanges", { defaultValue: "Save changes" })}
        </button>
      </div>
    </form>
  );
}

// ג”€ג”€ג”€ QUICK ACTION MODALS ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€
function FeedModal({ animal, onSave, onClose }) {
  const [food, setFood]     = useState("Rat pup");
  const [result, setResult] = useState("ate");
  const { t } = useTranslation();
  const resultLabels = {
    ate: t("mobile.feed.ate", { defaultValue: "Ate" }),
    refused: t("mobile.feed.refused", { defaultValue: "Refused" }),
  };
  return (
    <ActionSheet title={t("mobile.feed.title", { defaultValue: "Feed" })} onClose={onClose}>
      <label className="mbl-field"><span>{t("mobile.feed.food", { defaultValue: "Food" })}</span>
        <input value={food} onChange={(e) => setFood(e.target.value)} />
      </label>
      <div className="mbl-seg">
        {["ate", "refused"].map((v) => (
          <button key={v} type="button" className={result === v ? "is-active" : ""}
            onClick={() => setResult(v)}>{resultLabels[v] || cap(v)}</button>
        ))}
      </div>
      <button type="button" className="mbl-btn mbl-btn--sk-primary mbl-btn--wide"
        onClick={() => onSave({ animalId: animal.appAnimalId, food, result })}>
        {t("mobile.feed.save", { defaultValue: "Save feed" })}
      </button>
    </ActionSheet>
  );
}

function WeightModal({ animal, onSave, onClose }) {
  const [grams, setGrams] = useState(animal?.weight || "");
  const { t } = useTranslation();
  return (
    <ActionSheet title={t("mobile.weight.title", { defaultValue: "Weight" })} onClose={onClose}>
      <label className="mbl-field"><span>{t("mobile.weight.grams", { defaultValue: "Grams" })}</span>
        <input type="number" inputMode="numeric" value={grams}
          onChange={(e) => setGrams(e.target.value)} />
      </label>
      <button type="button" className="mbl-btn mbl-btn--sk-primary mbl-btn--wide"
        onClick={() => onSave({ animalId: animal.appAnimalId, grams })}>
        {t("mobile.weight.save", { defaultValue: "Save weight" })}
      </button>
    </ActionSheet>
  );
}

function ShedModal({ animal, onSave, onClose }) {
  const [result, setResult] = useState("complete");
  const { t } = useTranslation();
  return (
    <ActionSheet title={t("mobile.shed.title", { defaultValue: "Shed" })} onClose={onClose}>
      <div className="mbl-seg">
        {["complete", "bad"].map((v) => (
          <button key={v} type="button" className={result === v ? "is-active" : ""}
            onClick={() => setResult(v)}>{v === "bad" ? t("mobile.shed.bad", { defaultValue: "Bad shed" }) : t("mobile.shed.complete", { defaultValue: "Complete" })}</button>
        ))}
      </div>
      <button type="button" className="mbl-btn mbl-btn--sk-primary mbl-btn--wide"
        onClick={() => onSave({ animalId: animal.appAnimalId, result })}>
        {t("mobile.shed.save", { defaultValue: "Save shed" })}
      </button>
    </ActionSheet>
  );
}

function NoteModal({ animal, onSave, onClose }) {
  const [note, setNote] = useState("");
  const { t } = useTranslation();
  const startVoice = () => {
    const R = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!R) return;
    const r = new R();
    r.onresult = (e) => setNote((p) => `${p} ${e.results?.[0]?.[0]?.transcript || ""}`.trim());
    r.start();
  };
  return (
    <ActionSheet title={t("mobile.note.title", { defaultValue: "Note" })} onClose={onClose}>
      <textarea className="mbl-note-area" rows={5} value={note}
        onChange={(e) => setNote(e.target.value)} placeholder={t("mobile.note.placeholder", { defaultValue: "Type or use voice…" })} />
      <div className="mbl-edit-actions">
        <button type="button" className="mbl-btn" onClick={startVoice}>{t("mobile.note.voice", { defaultValue: "🎤 Voice" })}</button>
        <button type="button" className="mbl-btn mbl-btn--sk-primary"
          onClick={() => onSave({ animalId: animal.appAnimalId, note })}>
          {t("mobile.note.save", { defaultValue: "Save note" })}
        </button>
      </div>
    </ActionSheet>
  );
}

// ג”€ג”€ג”€ PHOTO MODAL ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€
function PhotoModal({ animal, onTakePhoto, onSetIcon, onDeletePhoto, onClose, busy }) {
  const photos = Array.isArray(animal?.photos) ? [...animal.photos].reverse() : [];
  const currentIcon = animal?.imageUrl;
  const { t } = useTranslation();
  return (
    <ActionSheet title={t("mobile.photos.title", { defaultValue: "Photos" })} onClose={onClose}>
      <button type="button" className="mbl-btn mbl-btn--sk-primary mbl-btn--wide" onClick={onTakePhoto} disabled={busy}>
        {busy ? <Spinner /> : t("mobile.photos.takePhoto", { defaultValue: "📷 Take Photo" })}
      </button>
      {photos.length > 0 ? (
        <div className="mbl-photo-grid">
          {photos.map((photo) => (
            <div key={photo.id} className="mbl-photo-item">
              <img src={photo.url} alt="" className="mbl-photo-thumb" />
              <div className="mbl-photo-btns">
                <button
                  type="button"
                  className={`mbl-btn mbl-btn--sm ${currentIcon === photo.url ? "mbl-btn--icon-active" : ""}`}
                  onClick={() => onSetIcon(photo.url)}
                  disabled={busy || currentIcon === photo.url}
                >
                  {currentIcon === photo.url ? t("mobile.photos.currentIcon", { defaultValue: "✓ Icon" }) : t("mobile.photos.setAsIcon", { defaultValue: "Set as icon" })}
                </button>
                <button type="button" className="mbl-btn mbl-btn--sm mbl-btn--danger"
                  onClick={() => onDeletePhoto(photo.id)} disabled={busy}>
                  {t("mobile.photos.delete", { defaultValue: "Delete" })}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mbl-empty">{t("mobile.photos.empty", { defaultValue: "No photos yet. Tap above to take one." })}</p>
      )}
    </ActionSheet>
  );
}

// ג”€ג”€ג”€ ANIMAL CARD ROW (shared between flat list and groups view) ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€
function AnimalCardRow({ animal, onOpen }) {
  const statusKey = (animal.status || "").toLowerCase().replace(/\s+/g, "-");
  const genetics = formatGeneticsText(animal);
  return (
    <button
      type="button"
      className="mbl-animal-card"
      onClick={() => onOpen(animal.id || animal.appAnimalId)}
    >
      <div className="mbl-animal-card-avatar">
        {animal.imageUrl
          ? <img src={animal.imageUrl} alt="" className="mbl-animal-card-img" />
          : <div className="mbl-animal-card-initial">{String(animal.name || "?").slice(0, 1)}</div>}
      </div>
      <div className="mbl-animal-card-body">
        <div className="mbl-animal-card-row1">
          <strong className="mbl-animal-card-name"><bdi>{animal.name || animal.id}</bdi></strong>
          {animal.status && <span className={`mbl-status-badge mbl-status--${statusKey}`}>{animal.status}</span>}
        </div>
        {genetics && <div className="mbl-animal-card-genetics">{genetics}</div>}
        <div className="mbl-animal-card-row3">
          {animal.sex && <span className="mbl-sex-badge">{animal.sex}</span>}
          {locationText(animal) && <span className="mbl-animal-card-loc">📍 {locationText(animal)}</span>}
        </div>
      </div>
      <span className="mbl-animal-card-chevron">›</span>
    </button>
  );
}

// ג”€ג”€ג”€ FULL SCREEN PANEL (Breeding Advisor / Lab tests) ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€
function FullScreenPanel({ title, onClose, children }) {
  const { t } = useTranslation();
  return (
    <section className="mbl-profile">
      <div className="mbl-profile-topbar">
        <button type="button" className="mbl-back-btn" onClick={onClose}>{t("mobile.common.back", { defaultValue: "← Back" })}</button>
        <span className="mbl-profile-topbar-name">{title}</span>
        <div style={{ width: 56 }} />
      </div>
      <div style={{ paddingTop: "0.5rem" }}>{children}</div>
    </section>
  );
}

// ג”€ג”€ג”€ BREEDING CYCLE HELPERS ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€
const bpUid = () =>
  `bp-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;

const addDays = (ds, n) => {
  try {
    const d = new Date(`${ds}T12:00:00`);
    if (isNaN(d)) return null;
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  } catch { return null; }
};

const fmtDate = (ds) => {
  if (!ds) return "—";
  try {
    const ymd = ymdFromDate(ds) || String(ds).slice(0, 10);
    return new Date(`${ymd}T12:00:00`).toLocaleDateString(undefined, {
      month: "short", day: "numeric", year: "numeric",
    });
  } catch { return ds; }
};

// Sort a log array newest-first (by loggedAt)
const sortLogs = (arr) =>
  [...(arr || [])].sort((a, b) => (b.loggedAt || "").localeCompare(a.loggedAt || ""));

// Write the most-recent mobile log entry back into the compat fields the desktop reads
const syncCompatFields = (pairing) => {
  const ov = sortLogs(pairing.mobileOvulationLogs)[0];
  const pl = sortLogs(pairing.mobilePreLayShedLogs)[0];
  const cl = sortLogs(pairing.mobileClutchLogs)[0];
  const ha = sortLogs(pairing.mobileHatchLogs)[0];
  return {
    ...pairing,
    ovulation:  ov ? { observed: true, date: ov.date, notes: ov.notes || "" }
                   : pairing.ovulation,
    preLayShed: pl ? { observed: true, date: pl.date, notes: pl.notes || "" }
                   : pairing.preLayShed,
    clutch:     cl ? { recorded: true, date: cl.date, eggsTotal: cl.eggsTotal || "",
                       fertileEggs: cl.fertileEggs || "", slugs: cl.slugs || "",
                       notes: cl.notes || "" }
                   : pairing.clutch,
    hatch:      ha ? { recorded: true, date: ha.date, hatchedCount: ha.hatchedCount || 0,
                       notes: ha.notes || "", scheduledDate: pairing.hatch?.scheduledDate || "" }
                   : pairing.hatch,
  };
};

// ג”€ג”€ג”€ CYCLE STAGE LOG FORM ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€
function CycleStageForm({ stageKey, onSave, onCancel, busy }) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate]               = useState(today);
  const [notes, setNotes]             = useState("");
  const [eggsTotal, setEggsTotal]     = useState("");
  const [fertileEggs, setFertileEggs] = useState("");
  const [slugs, setSlugs]             = useState("");
  const [hatchedCount, setHatchedCount] = useState("");
  const { t } = useTranslation();

  const STAGE_LABELS = {
    ovulation: t("mobile.cycle.ovulation", { defaultValue: "Ovulation" }), preLayShed: t("mobile.cycle.preLayShed", { defaultValue: "Pre-lay Shed" }),
    clutch: t("mobile.cycle.clutch", { defaultValue: "Lay / Clutch" }), hatch: t("mobile.cycle.hatch", { defaultValue: "Hatch" }),
  };

  const save = () => {
    if (!date) return;
    const entry = { id: bpUid(), date, notes: notes.trim(), loggedAt: new Date().toISOString() };
    if (stageKey === "clutch") {
      entry.eggsTotal = eggsTotal;
      entry.fertileEggs = fertileEggs;
      entry.slugs = slugs;
    }
    if (stageKey === "hatch") { entry.hatchedCount = Number(hatchedCount) || 0; }
    onSave(entry);
  };

  return (
    <div className="mbl-cs-form">
      <label className="mbl-field">
        <span>{t("mobile.cycle.dateObserved", { defaultValue: "Date observed" })}</span>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      {stageKey === "clutch" && (
        <>
          <label className="mbl-field">
            <span>{t("mobile.cycle.totalEggs", { defaultValue: "Total eggs" })}</span>
            <input type="number" inputMode="numeric" value={eggsTotal}
              onChange={(e) => setEggsTotal(e.target.value)} placeholder="—" />
          </label>
          <label className="mbl-field">
            <span>{t("mobile.cycle.fertileEggs", { defaultValue: "Fertile eggs" })}</span>
            <input type="number" inputMode="numeric" value={fertileEggs}
              onChange={(e) => setFertileEggs(e.target.value)} placeholder="—" />
          </label>
          <label className="mbl-field">
            <span>{t("mobile.cycle.slugs", { defaultValue: "Slugs" })}</span>
            <input type="number" inputMode="numeric" value={slugs}
              onChange={(e) => setSlugs(e.target.value)} placeholder="—" />
          </label>
        </>
      )}
      {stageKey === "hatch" && (
        <label className="mbl-field">
          <span>{t("mobile.cycle.hatchlings", { defaultValue: "Hatchlings" })}</span>
          <input type="number" inputMode="numeric" value={hatchedCount}
            onChange={(e) => setHatchedCount(e.target.value)} placeholder="—" />
        </label>
      )}
      <label className="mbl-field">
        <span>{t("mobile.cycle.notes", { defaultValue: "Notes" })}</span>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("mobile.cycle.optional", { defaultValue: "Optional" })} />
      </label>
      <div className="mbl-edit-actions">
        <button type="button" className="mbl-btn" onClick={onCancel} disabled={busy}>
          {t("mobile.common.cancel", { defaultValue: "Cancel" })}
        </button>
        <button type="button" className="mbl-btn mbl-btn--sk-primary"
          onClick={save} disabled={busy || !date}>
          {busy ? <Spinner /> : t("mobile.cycle.logStage", { stage: STAGE_LABELS[stageKey], defaultValue: "Log {{stage}}" })}
        </button>
      </div>
    </div>
  );
}

// ג”€ג”€ג”€ PAIRING SECTION (one pairing, all 4 stages) ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€
function PairingSection({ pairing, isFemale, partnerName, onSavePairing }) {
  const [openStage, setOpenStage] = useState(null);
  const [saving, setSaving]       = useState(false);
  const { t } = useTranslation();

  const ovLogs = useMemo(() => sortLogs(pairing.mobileOvulationLogs),  [pairing.mobileOvulationLogs]);
  const plLogs = useMemo(() => sortLogs(pairing.mobilePreLayShedLogs), [pairing.mobilePreLayShedLogs]);
  const clLogs = useMemo(() => sortLogs(pairing.mobileClutchLogs),     [pairing.mobileClutchLogs]);
  const haLogs = useMemo(() => sortLogs(pairing.mobileHatchLogs),      [pairing.mobileHatchLogs]);

  // Fall back to compat fields so animals entered on desktop are visible immediately
  const latestOv = ovLogs[0] ?? (pairing.ovulation?.date  ? { date: pairing.ovulation.date,  notes: pairing.ovulation.notes  } : null);
  const latestPl = plLogs[0] ?? (pairing.preLayShed?.date ? { date: pairing.preLayShed.date, notes: pairing.preLayShed.notes } : null);
  const latestCl = clLogs[0] ?? (pairing.clutch?.date     ? { date: pairing.clutch.date,     eggsTotal: pairing.clutch.eggsTotal, fertileEggs: pairing.clutch.fertileEggs, slugs: pairing.clutch.slugs, notes: pairing.clutch.notes } : null);
  const latestHa = haLogs[0] ?? (pairing.hatch?.date      ? { date: pairing.hatch.date,      hatchedCount: pairing.hatch.hatchedCount, notes: pairing.hatch.notes } : null);

  const toggle = (key) => setOpenStage((prev) => (prev === key ? null : key));

  const handleAddEntry = async (stageKey, entry) => {
    setSaving(true);
    const KEY_MAP = {
      ovulation:  "mobileOvulationLogs",
      preLayShed: "mobilePreLayShedLogs",
      clutch:     "mobileClutchLogs",
      hatch:      "mobileHatchLogs",
    };
    try {
      const arrKey  = KEY_MAP[stageKey];
      const updated = { ...pairing, [arrKey]: [...(pairing[arrKey] || []), entry] };
      await onSavePairing(syncCompatFields(updated));
      setOpenStage(null);
    } finally {
      setSaving(false);
    }
  };

  // Countdown strings from most-recent logged date per stage
  const ovCd = latestOv?.date ? t("mobile.cycle.expectedPreLayShed", { from: fmtDate(addDays(latestOv.date, 14)), to: fmtDate(addDays(latestOv.date, 28)), defaultValue: "Expected pre-lay shed: {{from}} – {{to}}" }) : null;
  const plCd = latestPl?.date ? t("mobile.cycle.expectedLay", { from: fmtDate(addDays(latestPl.date, 14)), to: fmtDate(addDays(latestPl.date, 28)), defaultValue: "Expected lay: {{from}} – {{to}}" }) : null;
  const clCd = latestCl?.date ? t("mobile.cycle.expectedHatch", { from: fmtDate(addDays(latestCl.date, 55)), to: fmtDate(addDays(latestCl.date, 65)), defaultValue: "Expected hatch: {{from}} – {{to}}" }) : null;

  const stages = [
    { key: "ovulation",  label: t("mobile.cycle.ovulation", { defaultValue: "Ovulation" }),    logs: ovLogs, latest: latestOv, countdown: ovCd },
    { key: "preLayShed", label: t("mobile.cycle.preLayShed", { defaultValue: "Pre-lay Shed" }), logs: plLogs, latest: latestPl, countdown: plCd },
    { key: "clutch",     label: t("mobile.cycle.clutch", { defaultValue: "Lay / Clutch" }),     logs: clLogs, latest: latestCl, countdown: clCd },
    { key: "hatch",      label: t("mobile.cycle.hatch", { defaultValue: "Hatch" }),             logs: haLogs, latest: latestHa, countdown: null },
  ];

  const statusCls = `mbl-bp-status--${(pairing.status || "unknown").toLowerCase().replace(/\s+/g, "-")}`;

  return (
    <div className="mbl-bp-card">
      <div className="mbl-bp-header">
        <div>
          <strong>{pairing.label || t("mobile.pairing.fallbackLabel", { id: (pairing.id || "").slice(-6), defaultValue: "Pairing {{id}}" })}</strong>
          <small className="mbl-bp-meta">
            {isFemale ? t("mobile.pairing.female", { defaultValue: "Female" }) : t("mobile.pairing.male", { defaultValue: "Male" })} · {t("mobile.pairing.partner", { name: partnerName, defaultValue: "Partner: {{name}}" })}
          </small>
        </div>
        <span className={`mbl-bp-status ${statusCls}`}>{pairing.status || t("mobile.pairing.unknownStatus", { defaultValue: "Unknown" })}</span>
      </div>

      <div className="mbl-bp-stages">
        {stages.map(({ key, label, logs, latest, countdown }) => (
          <div key={key} className="mbl-cs">
            <button type="button" className="mbl-cs-header" onClick={() => toggle(key)}>
              <div className="mbl-cs-title">
                <strong>{label}</strong>
                {latest
                  ? <span className="mbl-cs-latest">{fmtDate(latest.date)}</span>
                  : <span className="mbl-cs-none">{t("mobile.cycle.notLogged", { defaultValue: "Not logged" })}</span>}
              </div>
              <div className="mbl-cs-right">
                {logs.length > 0 && <span className="mbl-cs-badge">{logs.length}</span>}
                <span>{openStage === key ? "▲" : "▼"}</span>
              </div>
            </button>

            {countdown && <div className="mbl-cs-countdown">{countdown}</div>}

            {openStage === key && (
              <div className="mbl-cs-body">
                <CycleStageForm
                  stageKey={key}
                  onSave={(entry) => handleAddEntry(key, entry)}
                  onCancel={() => setOpenStage(null)}
                  busy={saving}
                />
                {logs.length > 0 && (
                  <div className="mbl-cs-history">
                    <div className="mbl-cs-history-label">{t("mobile.cycle.history", { defaultValue: "History" })}</div>
                    {logs.map((entry, i) => (
                      <div key={entry.id || `${key}-${i}`}
                        className={`mbl-cs-entry ${i === 0 ? "is-latest" : ""}`}>
                        <div className="mbl-cs-entry-row">
                          <span className="mbl-cs-entry-date">{fmtDate(entry.date)}</span>
                          {i === 0 && <span className="mbl-cs-tag">{t("mobile.cycle.latest", { defaultValue: "Latest" })}</span>}
                        </div>
                        {(entry.eggsTotal || entry.fertileEggs || entry.slugs) && (
                          <div className="mbl-cs-entry-detail">
                            {entry.eggsTotal   && <span>{t("mobile.cycle.eggsCount", { n: entry.eggsTotal, defaultValue: "{{n}} eggs" })}</span>}
                            {entry.fertileEggs && <span>{t("mobile.cycle.fertileCount", { n: entry.fertileEggs, defaultValue: "{{n}} fertile" })}</span>}
                            {entry.slugs       && <span>{t("mobile.cycle.slugsCount", { n: entry.slugs, defaultValue: "{{n}} slugs" })}</span>}
                          </div>
                        )}
                        {entry.hatchedCount > 0 && (
                          <div className="mbl-cs-entry-detail">
                            <span>{t("mobile.cycle.hatchlingsCount", { n: entry.hatchedCount, defaultValue: "{{n}} hatchlings" })}</span>
                          </div>
                        )}
                        {entry.notes && (
                          <div className="mbl-cs-entry-notes">{entry.notes}</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ג”€ג”€ג”€ BREEDING PANEL ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€
function BreedingCardSummary({ cycle, animalMap }) {
  const { t } = useTranslation();
  const sessions = (cycle.sessions || []).filter((s) => s.introductionDate).length;
  const locks = (cycle.sessions || []).reduce((n, s) => n + (s.locks || []).filter((l) => l.status === "observed" && l.observationDate).length, 0);
  const pending = (cycle.plannedPairings || []).filter((p) => p.status === "pending" && p.date).sort((a, b) => String(a.date).localeCompare(String(b.date)))[0];
  const males = (cycle.males || []).map((m) => animalMap.get(m.maleId)?.name || m.maleId).join(", ");
  return (
    <div className="mbl-bp-card">
      <div className="mbl-bp-header">
        <div>
          <strong>{t("mobile.breedingCard.title", { season: cycle.seasonLabel || "", defaultValue: "Breeding card {{season}}" })}</strong>
          <small className="mbl-bp-meta">{t("mobile.breedingCard.males", { males: males || "—", defaultValue: "Males: {{males}}" })}</small>
        </div>
        <span className={`mbl-bp-status mbl-bp-status--${cycle.status || "active"}`}>{cycle.status}</span>
      </div>
      <div className="mbl-cs-entry-detail">
        <span>{t("mobile.breedingCard.sessions", { n: sessions, defaultValue: "{{n}} sessions" })}</span>
        <span>{t("mobile.breedingCard.locks", { n: locks, defaultValue: "{{n}} observed locks" })}</span>
        {pending ? <span>{t("mobile.breedingCard.nextPlanned", { date: fmtDate(pending.date), defaultValue: "Next planned pairing {{date}}" })}</span> : null}
      </div>
      <div className="mbl-cs-entry-notes">{t("mobile.breedingCard.editHint", { defaultValue: "Record sessions, locks and scans in the full app; this view is read-only." })}</div>
    </div>
  );
}

function BreedingPanel({ animal, pairings, allAnimals, onSavePairing, breedingCycles = [] }) {
  const animalId = animal?.id || animal?.appAnimalId;
  const related  = useMemo(
    () => (pairings || []).filter((p) => p.femaleId === animalId || p.maleId === animalId),
    [pairings, animalId]
  );
  const animalMap = useMemo(
    () => new Map((allAnimals || []).map((a) => [a.id, a])),
    [allAnimals]
  );
  const { t } = useTranslation();

  const cards = useMemo(
    () => (breedingCycles || []).filter((c) => c && (c.femaleId === animalId || (c.males || []).some((m) => m.maleId === animalId))),
    [breedingCycles, animalId]
  );

  if (!related.length && !cards.length) {
    return <p className="mbl-empty">{t("mobile.breeding.noPairingsForAnimal", { defaultValue: "No pairings found for this animal." })}</p>;
  }

  return (
    <div className="mbl-breeding-list">
      {cards.map((cycle) => <BreedingCardSummary key={cycle.id} cycle={cycle} animalMap={animalMap} />)}
      {related.map((pairing) => {
        const isFemale    = pairing.femaleId === animalId;
        const partnerId   = isFemale ? pairing.maleId : pairing.femaleId;
        const partnerName = animalMap.get(partnerId)?.name || partnerId || t("mobile.breeding.unknownPartner", { defaultValue: "Unknown" });
        return (
          <PairingSection
            key={pairing.id}
            pairing={pairing}
            isFemale={isFemale}
            partnerName={partnerName}
            onSavePairing={onSavePairing}
          />
        );
      })}
    </div>
  );
}

// ג”€ג”€ג”€ ANIMAL PROFILE CARD (Full mode) ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€
const STATUS_COLORS = { "active": "green", "for sale": "blue", "sold": "gray", "deceased": "red", "quarantine": "orange" };

const LOG_META = {
  feeds: { label: "Feed", icon: "F" },
  weights: { label: "Weight", icon: "W" },
  sheds: { label: "Shed", icon: "S" },
  cleanings: { label: "Clean", icon: "C" },
  meds: { label: "Medication", icon: "M" },
  water: { label: "Water", icon: "H2O" },
  notes: { label: "Note", icon: "N" },
  health: { label: "Health", icon: "H" },
};

const displayValue = (value, t) => {
  if (Array.isArray(value)) return joinText(value);
  if (value === true) return t("mobile.common.yes", { defaultValue: "Yes" });
  if (value === false) return t("mobile.common.no", { defaultValue: "No" });
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value.trim();
  return "";
};

function InfoRows({ rows = [] }) {
  const { t } = useTranslation();
  const visible = rows
    .map((row) => ({ ...row, value: displayValue(row.value, t) }))
    .filter((row) => row.value);
  if (!visible.length) return null;
  return (
    <div className="mbl-info-list">
      {visible.map((row) => (
        <div key={row.label} className={`mbl-info-row ${row.full ? "mbl-info-row--full" : ""}`}>
          <span>{row.label}</span>
          {row.full ? <p>{row.value}</p> : <strong>{row.value}</strong>}
        </div>
      ))}
    </div>
  );
}

function DetailSection({ title, rows }) {
  return (
    <section className="mbl-detail-section">
      <div className="mbl-detail-heading">{title}</div>
      <InfoRows rows={rows} />
    </section>
  );
}

const formatWeight = (value, t) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? `${number} g` : displayValue(value, t);
};

const formatDateValue = (value) => (firstText(value) ? fmtDate(value) : "");

const feederSummary = (profile) => {
  const weight = profile.weightGrams ? `${profile.weightGrams} g` : "";
  return compactText(
    profile.quantity ? `${profile.quantity}x` : "",
    profile.feedType,
    profile.sizeClass,
    weight
  ).join(" ");
};

const animalDetailSections = (animal = {}, t) => {
  const breeder = isObject(animal.breeder) ? animal.breeder : {};
  const sale = isObject(animal.sale) ? animal.sale : {};
  const lab = isObject(animal.lab) ? animal.lab : {};
  return [
    {
      title: t("mobile.details.identitySection", { defaultValue: "Identity" }),
      rows: [
        { label: t("mobile.details.animalId", { defaultValue: "Animal ID" }), value: animalIdentity(animal) },
        { label: t("mobile.details.name", { defaultValue: "Name" }), value: animal.name },
        { label: t("mobile.details.sex", { defaultValue: "Sex" }), value: animal.sex },
        { label: t("mobile.details.status", { defaultValue: "Status" }), value: animal.status },
        { label: t("mobile.details.species", { defaultValue: "Species" }), value: animal.species },
        { label: t("mobile.details.year", { defaultValue: "Year" }), value: animal.year || animal.hatchYear || animal.birthYear },
        { label: t("mobile.details.dateOfBirth", { defaultValue: "Date of birth" }), value: formatDateValue(animal.dob || animal.birthDate || animal.hatchDate) },
        { label: t("mobile.details.weight", { defaultValue: "Weight" }), value: formatWeight(animal.weight || animal.weightGrams, t) },
      ],
    },
    {
      title: t("mobile.details.geneticsSection", { defaultValue: "Genetics" }),
      rows: [
        { label: t("mobile.details.genetics", { defaultValue: "Genetics" }), value: formatGeneticsText(animal) },
        { label: t("mobile.details.morphs", { defaultValue: "Morphs" }), value: animal.morphs },
        { label: t("mobile.details.hets", { defaultValue: "Hets" }), value: animal.hets },
        { label: t("mobile.details.possibleHets", { defaultValue: "Possible hets" }), value: animal.possibleHets },
        { label: t("mobile.details.line", { defaultValue: "Line" }), value: firstText(animal.line, animal.bloodline, animal.project) },
      ],
    },
    {
      title: t("mobile.details.locationSection", { defaultValue: "Location" }),
      rows: [
        { label: t("mobile.details.location", { defaultValue: "Location" }), value: locationText(animal) },
        { label: t("mobile.details.room", { defaultValue: "Room" }), value: firstText(animal.roomName, animal.room, animal.location?.roomName, animal.location?.room) },
        { label: t("mobile.details.rack", { defaultValue: "Rack" }), value: firstText(animal.rackName, animal.rack, animal.heatRackName, animal.heatRack, animal.location?.rackName, animal.location?.rack) },
        { label: t("mobile.details.tub", { defaultValue: "Tub" }), value: firstText(animal.tubName, animal.tub, animal.tubLabel, animal.slotLabel, animal.location?.tubName, animal.location?.tub) },
      ],
    },
    {
      title: t("mobile.details.groupsSection", { defaultValue: "Groups" }),
      rows: [
        { label: t("mobile.details.groups", { defaultValue: "Groups" }), value: animal.groups },
        { label: t("mobile.details.tags", { defaultValue: "Tags" }), value: animal.tags },
      ],
    },
    {
      title: t("mobile.details.lineageSection", { defaultValue: "Lineage" }),
      rows: [
        { label: t("mobile.details.sire", { defaultValue: "Sire" }), value: firstText(animal.sireName, animal.sireId, animal.fatherName, animal.fatherId) },
        { label: t("mobile.details.dam", { defaultValue: "Dam" }), value: firstText(animal.damName, animal.damId, animal.motherName, animal.motherId) },
        { label: t("mobile.details.breeder", { defaultValue: "Breeder" }), value: firstText(animal.breederName, breeder.name) },
        { label: t("mobile.details.source", { defaultValue: "Source" }), value: firstText(animal.source, animal.origin) },
      ],
    },
    {
      title: t("mobile.details.acquisitionAndSaleSection", { defaultValue: "Acquisition & sale" }),
      rows: [
        { label: t("mobile.details.acquired", { defaultValue: "Acquired" }), value: formatDateValue(animal.acquisitionDate || animal.acquiredAt || animal.purchaseDate) },
        { label: t("mobile.details.price", { defaultValue: "Price" }), value: firstText(animal.price, animal.purchasePrice) },
        { label: t("mobile.details.currency", { defaultValue: "Currency" }), value: firstText(animal.currency, sale.currency) },
        { label: t("mobile.details.forSale", { defaultValue: "For sale" }), value: animal.forSale },
        { label: t("mobile.details.saleStatus", { defaultValue: "Sale status" }), value: firstText(sale.status, animal.saleStatus, animal.marketplaceStatus) },
      ],
    },
    {
      title: t("mobile.details.labAndMarketplaceSection", { defaultValue: "Lab & marketplace" }),
      rows: [
        { label: t("mobile.details.labOrder", { defaultValue: "Lab order" }), value: firstText(lab.orderStatus, animal.labOrderStatus, animal.testOrderStatus) },
        { label: t("mobile.details.labResult", { defaultValue: "Lab result" }), value: firstText(lab.resultStatus, animal.labResultStatus, animal.testResultStatus) },
        { label: t("mobile.details.listing", { defaultValue: "Listing" }), value: firstText(animal.listingStatus, animal.marketplaceListingStatus) },
        { label: t("mobile.details.publicContact", { defaultValue: "Public contact" }), value: firstText(animal.publicContactEmail, animal.contactEmail) },
      ],
    },
    {
      title: t("mobile.details.notesSection", { defaultValue: "Notes" }),
      rows: [
        { label: t("mobile.details.notes", { defaultValue: "Notes" }), value: animal.notes, full: true },
      ],
    },
  ];
};

const flattenLogs = (logs = {}) => Object.entries(isObject(logs) ? logs : {}).flatMap(([key, entries]) => (
  asArray(entries)
    .filter(isObject)
    .map((entry, index) => ({
      ...entry,
      logKey: key,
      type: LOG_META[key]?.label || cap(key),
      typeIcon: LOG_META[key]?.icon || cap(key).slice(0, 1),
      sortTime: entryTime(entry) || recordTimestamp(entry),
      rowKey: entry.id || entry.logId || `${key}-${entryDateValue(entry)}-${index}`,
    }))
));

const logEntrySummary = (entry = {}, t) => {
  if (entry.logKey === "feeds") {
    return compactText(entry.result || entry.status || t("mobile.logs.fed", { defaultValue: "fed" }), entry.feed || entry.food, entry.size || entry.sizeDetail, entry.grams ? `${entry.grams} g` : "").join(" | ");
  }
  if (entry.logKey === "weights") return formatWeight(entry.grams || entry.weight || entry.weightGrams, t);
  if (entry.logKey === "meds") return compactText(entry.medication, entry.dose, entry.note || entry.notes).join(" | ");
  return firstText(entry.note, entry.notes, entry.result, entry.status, entry.outcome, entry.description) || t("mobile.logs.saved", { defaultValue: "Saved" });
};

function AnimalProfile({ animal, permissions, pairings, allAnimals, onQuickAction, onTakePhoto, onSetIcon, onDeletePhoto, onSavePairing, onBack }) {
  const [subtab, setSubtab]         = useState("overview");
  const [photoBusy, setPhotoBusy]   = useState(false);
  const [orderTestOpen, setOrderTestOpen] = useState(false);
  const { t } = useTranslation();
  const logs = animal?.logs || {};
  const latestFeed   = latestLogEntry(logs.feeds);
  const latestWeight = latestLogEntry(logs.weights);
  const latestShed   = latestLogEntry(logs.sheds);
  const feederProfile = normalizeFeederProfile(animal);
  const feedCycle = getNextFeedCycle(animal);
  const detailSections = animalDetailSections(animal, t);
  const logTypeLabels = {
    feeds: t("mobile.logs.typeFeed", { defaultValue: "Feed" }),
    weights: t("mobile.logs.typeWeight", { defaultValue: "Weight" }),
    sheds: t("mobile.logs.typeShed", { defaultValue: "Shed" }),
    cleanings: t("mobile.logs.typeClean", { defaultValue: "Clean" }),
    meds: t("mobile.logs.typeMedication", { defaultValue: "Medication" }),
    water: t("mobile.logs.typeWater", { defaultValue: "Water" }),
    notes: t("mobile.logs.typeNote", { defaultValue: "Note" }),
    health: t("mobile.logs.typeHealth", { defaultValue: "Health" }),
  };
  const logRows = flattenLogs(logs).sort((a, b) => (b.sortTime || 0) - (a.sortTime || 0)).slice(0, 80);
  const genetics = formatGeneticsText(animal);

  const handleTakePhoto = async () => {
    setPhotoBusy(true);
    try { await onTakePhoto(); } finally { setPhotoBusy(false); }
  };

  const quickActions = [
    { label: t("mobile.actions.feed", { defaultValue: "Feed" }),            icon: "🍗", action: "feed"       },
    { label: t("mobile.actions.weight", { defaultValue: "Weight" }),        icon: "⚖", action: "weight"     },
    { label: t("mobile.actions.shed", { defaultValue: "Shed" }),            icon: "🐍", action: "shed"       },
    { label: t("mobile.actions.clean", { defaultValue: "Clean" }),          icon: "🧹", action: "clean"      },
    { label: t("mobile.actions.water", { defaultValue: "Water" }),          icon: "💧", action: "water"      },
    { label: t("mobile.actions.note", { defaultValue: "Note" }),            icon: "📝", action: "note"       },
    { label: t("mobile.actions.photo", { defaultValue: "Photo" }),          icon: "📷", action: "photo"      },
    { label: t("mobile.actions.orderTest", { defaultValue: "Order Test" }), icon: "🧬", action: "order-test" },
  ];

  const statusColor = STATUS_COLORS[(animal?.status || "").toLowerCase()] || "gray";

  return (
    <section className="mbl-profile">
      <div className="mbl-profile-topbar">
        <button type="button" className="mbl-back-btn" onClick={onBack}>{t("mobile.common.back", { defaultValue: "← Back" })}</button>
        <span className="mbl-profile-topbar-name">{animal.name || animal.appAnimalId}</span>
        <div style={{ width: 56 }} />
      </div>

      <div className="mbl-profile-hero">
        <div className="mbl-profile-hero-img">
          {animal.imageUrl
            ? <img src={animal.imageUrl} alt="" className="mbl-avatar mbl-avatar--profile" />
            : <div className="mbl-avatar-placeholder mbl-avatar--profile">{String(animal.name || "?").slice(0, 1)}</div>}
        </div>
        <div className="mbl-profile-hero-text">
          <h1>{animal.name || animal.appAnimalId}</h1>
          <div className="mbl-profile-pills">
            {animal.sex    && <span className="mbl-pill mbl-pill--sex">{animal.sex}</span>}
            {animal.status && <span className={`mbl-pill mbl-pill--status mbl-pill--${statusColor}`}>{animal.status}</span>}
          </div>
          {genetics && <p className="mbl-profile-genetics">{genetics}</p>}
          {locationText(animal) && <small className="mbl-profile-location">📍 {locationText(animal)}</small>}
        </div>
      </div>

      <div className="mbl-quick-actions mbl-quick-actions--icon">
        {quickActions.map(({ label, icon, action }) => (
          <button key={action} type="button" className="mbl-quick-btn mbl-quick-btn--icon"
            onClick={() => {
              if (action === "photo") { setSubtab("photos"); return; }
              if (action === "order-test") { setOrderTestOpen(true); return; }
              onQuickAction(action);
            }}>
            <span className="mbl-quick-icon">{icon}</span>
            <span className="mbl-quick-label">{label}</span>
          </button>
        ))}
      </div>

      <div className="mbl-subtabs mbl-subtabs--scroll">
        {[
          ["overview", t("mobile.profile.tabOverview", { defaultValue: "Overview" })],
          ["feed", t("mobile.profile.tabFeedCycle", { defaultValue: "Feed Cycle" })],
          ["details", t("mobile.profile.tabDetails", { defaultValue: "Details" })],
          ["logs", t("mobile.profile.tabLogs", { defaultValue: "Logs" })],
          ["photos", t("mobile.profile.tabPhotos", { defaultValue: "Photos" })],
          ["breeding", t("mobile.profile.tabBreeding", { defaultValue: "Breeding" })],
        ].map(([tabKey, label]) => (
          <button key={tabKey} type="button" className={subtab === tabKey ? "is-active" : ""} onClick={() => setSubtab(tabKey)}>
            {label}
          </button>
        ))}
      </div>

      {subtab === "overview" && (
        <div className="mbl-overview-section">
          <div className="mbl-data-grid">
            <div className="mbl-data-card">
              <span>{t("mobile.profile.lastFeed", { defaultValue: "Last feed" })}</span>
              <strong>{latestFeed ? compactText(latestFeed.result || latestFeed.status || t("mobile.logs.fed", { defaultValue: "fed" }), latestFeed.feed || latestFeed.food, latestFeed.size || latestFeed.sizeDetail).join(" | ") : t("mobile.profile.noFeedLog", { defaultValue: "No feed log" })}</strong>
            </div>
            <div className="mbl-data-card">
              <span>{t("mobile.profile.weight", { defaultValue: "Weight" })}</span>
              <strong>{formatWeight(latestWeight?.grams ?? latestWeight?.weight ?? animal.weight ?? animal.weightGrams, t) || t("mobile.profile.noWeight", { defaultValue: "No weight" })}</strong>
            </div>
            <div className="mbl-data-card">
              <span>{t("mobile.profile.lastShed", { defaultValue: "Last shed" })}</span>
              <strong>{latestShed ? (latestShed.result || formatDateValue(entryDateValue(latestShed))) : t("mobile.profile.noShedLog", { defaultValue: "No shed log" })}</strong>
            </div>
            <div className="mbl-data-card">
              <span>{t("mobile.profile.nextFeed", { defaultValue: "Next feed" })}</span>
              <strong>{feedCycle ? fmtDate(feedCycle.nextFeedDate) : t("mobile.profile.setIntervalAfterFeed", { defaultValue: "Set interval after feed" })}</strong>
            </div>
          </div>
          <InfoRows rows={[
            { label: t("mobile.profile.feeder", { defaultValue: "Feeder" }), value: feederSummary(feederProfile) },
            { label: t("mobile.profile.feedInterval", { defaultValue: "Feed interval" }), value: feederProfile.intervalDays ? t("mobile.profile.everyNDays", { n: feederProfile.intervalDays, defaultValue: "Every {{n}} days" }) : "" },
            { label: t("mobile.profile.species", { defaultValue: "Species" }), value: animal.species },
            { label: t("mobile.profile.dateOfBirth", { defaultValue: "Date of birth" }), value: formatDateValue(animal.dob || animal.birthDate || animal.hatchDate) },
            { label: t("mobile.profile.acquired", { defaultValue: "Acquired" }), value: formatDateValue(animal.acquisitionDate || animal.acquiredAt || animal.purchaseDate) },
            { label: t("mobile.profile.price", { defaultValue: "Price" }), value: animal.price },
            { label: t("mobile.profile.breeding", { defaultValue: "Breeding" }), value: animal.breeding?.pairingStatus || "" },
            { label: t("mobile.profile.labOrder", { defaultValue: "Lab order" }), value: animal.lab?.orderStatus },
            { label: t("mobile.profile.notes", { defaultValue: "Notes" }), value: animal.notes, full: true },
          ]} />
        </div>
      )}

      {subtab === "feed" && (
        <div className="mbl-feed-section">
          <div className="mbl-feed-card">
            <div>
              <span>{t("mobile.feedCycle.title", { defaultValue: "Feed Cycle" })}</span>
              <strong>{feederSummary(feederProfile) || t("mobile.feedCycle.noFeeder", { defaultValue: "No feeder selected" })}</strong>
            </div>
            {isFeedDue(animal) && <em>{t("mobile.feedCycle.due", { defaultValue: "Due" })}</em>}
          </div>
          <InfoRows rows={[
            { label: t("mobile.feedCycle.foodType", { defaultValue: "Food type" }), value: feederProfile.feedType },
            { label: t("mobile.feedCycle.size", { defaultValue: "Size" }), value: feederProfile.sizeClass },
            { label: t("mobile.feedCycle.weightClass", { defaultValue: "Weight class" }), value: feederProfile.weightGrams ? `${feederProfile.weightGrams} g` : "" },
            { label: t("mobile.feedCycle.quantity", { defaultValue: "Quantity" }), value: feederProfile.quantity },
            { label: t("mobile.feedCycle.interval", { defaultValue: "Interval" }), value: feederProfile.intervalDays ? t("mobile.profile.everyNDays", { n: feederProfile.intervalDays, defaultValue: "Every {{n}} days" }) : "" },
            { label: t("mobile.feedCycle.lastAcceptedFeed", { defaultValue: "Last accepted feed" }), value: feedCycle?.lastFeedDate ? fmtDate(feedCycle.lastFeedDate) : "" },
            { label: t("mobile.feedCycle.nextFeeding", { defaultValue: "Next feeding" }), value: feedCycle?.nextFeedDate ? fmtDate(feedCycle.nextFeedDate) : "" },
            { label: t("mobile.feedCycle.notes", { defaultValue: "Notes" }), value: feederProfile.notes, full: true },
          ]} />
          {!feedCycle && (
            <p className="mbl-settings-hint">
              {t("mobile.feedCycle.remindersHint", { defaultValue: "Feeding reminders start after this snake has both a feeding interval and an accepted feed log." })}
            </p>
          )}
        </div>
      )}

      {subtab === "details" && (
        <div className="mbl-detail-list">
          {detailSections.map((section) => <DetailSection key={section.title} title={section.title} rows={section.rows} />)}
        </div>
      )}

      {subtab === "logs" && (
        <div className="mbl-log-list">
          {logRows
            .map((entry) => (
              <div key={entry.rowKey} className="mbl-log-row">
                <span className="mbl-log-type-icon">{entry.typeIcon}</span>
                <div className="mbl-log-body">
                  <strong>{logTypeLabels[entry.logKey] || entry.type}</strong>
                  <span>{logEntrySummary(entry, t)}</span>
                </div>
                <small>{formatDateValue(entryDateValue(entry))}</small>
              </div>
            ))}
          {!logRows.length && <p className="mbl-empty">{t("mobile.logs.empty", { defaultValue: "No logs yet." })}</p>}
        </div>
      )}

      {subtab === "photos" && (
        <div className="mbl-photo-panel">
          <button type="button" className="mbl-btn mbl-btn--sk-primary mbl-btn--wide" onClick={handleTakePhoto} disabled={photoBusy}>
            {photoBusy ? <Spinner /> : t("mobile.photos.takePhoto", { defaultValue: "📷 Take Photo" })}
          </button>
          {(animal.photos || []).length > 0 ? (
            <div className="mbl-photo-grid">
              {[...(animal.photos || [])].reverse().map((photo) => (
                <div key={photo.id} className="mbl-photo-item">
                  <img src={photo.url} alt="" className="mbl-photo-thumb" />
                  <div className="mbl-photo-btns">
                    <button type="button"
                      className={`mbl-btn mbl-btn--sm ${animal.imageUrl === photo.url ? "mbl-btn--icon-active" : ""}`}
                      onClick={() => onSetIcon(photo.url)}
                      disabled={photoBusy || animal.imageUrl === photo.url}>
                      {animal.imageUrl === photo.url ? t("mobile.photos.currentIcon", { defaultValue: "✓ Icon" }) : t("mobile.photos.setIcon", { defaultValue: "Set icon" })}
                    </button>
                    <button type="button" className="mbl-btn mbl-btn--sm mbl-btn--danger"
                      onClick={() => onDeletePhoto(photo.id)} disabled={photoBusy}>
                      {t("mobile.photos.delete", { defaultValue: "Delete" })}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mbl-empty">{t("mobile.photos.empty", { defaultValue: "No photos yet. Tap above to take one." })}</p>
          )}
        </div>
      )}

      {subtab === "breeding" && (
        <BreedingPanel animal={animal} pairings={pairings || []} allAnimals={allAnimals || []} onSavePairing={onSavePairing} />
      )}

      <BreederOrderGeneticTestModal
        open={orderTestOpen}
        snake={animal}
        onClose={() => setOrderTestOpen(false)}
      />
    </section>
  );
}

// ג”€ג”€ג”€ TERMINAL MODE ג”€ן¿½ן¿½ן¿½ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ן¿½ן¿½ן¿½ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ן¿½ן¿½ן¿½ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€
function TerminalMode({ onSwitchMode, onSignOut, deviceId }) {
  const [screen, setScreen]       = useState("scan");  // scan | card
  const [animal, setAnimal]       = useState(null);
  const [manual, setManual]       = useState("");
  const [busy, setBusy]           = useState(false);
  const [toast, setToast]         = useState("");
  const [editBusy, setEditBusy]   = useState(false);
  const [modal, setModal]         = useState(null);
  const [photoModal, setPhotoModal]   = useState(false);
  const [photoBusy, setPhotoBusy]     = useState(false);
  const [cardTab, setCardTab]         = useState("edit"); // edit | breeding
  const [recent, setRecent]       = useState(() => readJson(RECENT_KEY, []));
  const [localAnimals, setLocalAnimals] = useState(() => normalizeMobileSnapshot({ animals: readJson(ANIMALS_CACHE, []) }).animals);
  const [pairings, setPairings]   = useState([]);
  const [breedingCycles, setBreedingCycles] = useState([]);
  const { t } = useTranslation();

  useEffect(() => { writeJson(RECENT_KEY, recent); }, [recent]);

  // Warm up the local cache (animals + pairings) so QR lookups bypass the tier-gated /mobile/scan
  useEffect(() => {
    fetchBreederSnapshot()
      .then((snap) => {
        const normalizedSnapshot = normalizeMobileSnapshot(snap);
        setLocalAnimals(normalizedSnapshot.animals);
        setPairings(normalizedSnapshot.pairings);
        setBreedingCycles(normalizedSnapshot.breedingCycles || []);
        writeJson(ANIMALS_CACHE, normalizedSnapshot.animals);
      })
      .catch(() => {});
  }, []);

  const pushToast = useCallback((msg) => setToast(msg), []);
  const dismissToast = useCallback(() => setToast(""), []);

  const resolveAnimal = useCallback(async (raw) => {
    if (!raw?.trim()) return;
    // Parse the animal ID out of the full QR URL (e.g. https://…#snake=<id>)
    const animalId = parseQrValue(raw);

    // Try local lookup first — no backend tier check needed
    const local = localAnimals.find(
      (a) => compactText(a.id, a.appAnimalId, a.animalId, a.snakeId).includes(animalId)
    );
    if (local) {
      setAnimal(local);
      setRecent((prev) => [local, ...prev.filter((a) => a.appAnimalId !== local.appAnimalId)].slice(0, 10));
      setScreen("card");
      return;
    }

    // Fall back to backend (handles cases where cache is stale / empty)
    setBusy(true);
    try {
      const res = await fetchMobileAnimal(animalId);
      if (res?.animal) {
        setAnimal(res.animal);
        setRecent((prev) => [res.animal, ...prev.filter((a) => a.appAnimalId !== res.animal.appAnimalId)].slice(0, 10));
        setScreen("card");
      } else {
        pushToast(t("mobile.toast.noAnimalForQr", { defaultValue: "No animal found for this QR code." }));
      }
    } catch {
      pushToast(t("mobile.toast.animalNotFoundSync", { defaultValue: "Animal not found. Make sure the snapshot is synced." }));
    } finally {
      setBusy(false);
    }
  }, [localAnimals, pushToast, t]);

  const handleManual = (e) => { e.preventDefault(); resolveAnimal(manual); setManual(""); };

  // ג”€ג”€ Shared snapshot helper ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€
  const updateAnimalInSnapshot = useCallback(async (updated) => {
    const snap = normalizeMobileSnapshot(await fetchBreederSnapshot());
    const changed = markRecordUpdated(updated);
    const list = mergeSnapshotList([changed], snap?.animals, "animal", mergeAnimalRecord);
    const savedSnapshot = normalizeMobileSnapshot(await saveBreederSnapshot({ ...snap, animals: list }));
    // saveBreederSnapshot strips embedded (data:) photos before the request body is built, so the
    // echoed response won't carry them back — reconcile with the pre-send local list to keep photos.
    const reconciledAnimals = mergeSnapshotList(list, savedSnapshot.animals, "animal", mergeAnimalRecord);
    const changedKey = recordIdentity(changed, "animal", 0);
    const savedAnimal = reconciledAnimals.find((record, index) => recordIdentity(record, "animal", index) === changedKey) || changed;
    setAnimal(savedAnimal);
    setLocalAnimals((prev) => upsertSnapshotRecord(prev, savedAnimal, "animal"));
  }, []);

  // ג”€ג”€ Pairing save handler ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€
  const handleSavePairing = useCallback(async (updatedPairing) => {
    const snap  = normalizeMobileSnapshot(await fetchBreederSnapshot());
    const changed = markRecordUpdated(updatedPairing);
    const pairs = mergeSnapshotList([changed], snap?.pairings, "pairing", mergePairingRecord);
    const savedSnapshot = normalizeMobileSnapshot(await saveBreederSnapshot({ ...snap, pairings: pairs }));
    const reconciledPairings = mergeSnapshotList(pairs, savedSnapshot.pairings, "pairing", mergePairingRecord);
    setPairings(reconciledPairings.length || !pairs.length ? reconciledPairings : [...pairs]);
  }, []);

  // ג”€ג”€ Photo handlers ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€
  const handleTakePhoto = useCallback(async () => {
    if (!animal) return;
    setPhotoBusy(true);
    try {
      // Capacitor downscales natively before the bytes ever reach JS, which is far cheaper than
      // doing it on a canvas here. `width` caps the long edge the same way PHOTO_PRESET does, and
      // correctOrientation bakes in the EXIF rotation so photos are not stored sideways.
      const result = await Camera.getPhoto({
        quality: 82,
        width: 1600,
        correctOrientation: true,
        allowEditing: false,
        resultType: CameraResultType.Base64,
        source: CameraSource.Camera,
      });
      const dataUrl  = `data:image/${result.format || "jpeg"};base64,${result.base64String}`;
      const newPhoto = {
        id: `photo-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`,
        url: dataUrl,
        addedAt: new Date().toISOString(),
        source: "camera",
        type: `image/${result.format || "jpeg"}`,
        size: estimateDataUrlBytes(dataUrl),
      };
      const updated = { ...animal, photos: [...(animal.photos || []), newPhoto] };
      await updateAnimalInSnapshot(updated);
      pushToast(t("mobile.toast.photoSaved", { defaultValue: "Photo saved." }));
    } catch (err) {
      if (!String(err?.message || "").toLowerCase().includes("cancel")) {
        pushToast(t("mobile.toast.photoFailed", { defaultValue: "Could not take photo." }));
      }
    } finally {
      setPhotoBusy(false);
    }
  }, [animal, updateAnimalInSnapshot, pushToast, t]);

  const handleSetIcon = useCallback(async (photoUrl) => {
    if (!animal) return;
    setPhotoBusy(true);
    try {
      await updateAnimalInSnapshot({ ...animal, imageUrl: photoUrl });
      pushToast(t("mobile.toast.iconUpdated", { defaultValue: "Icon updated." }));
    } catch {
      pushToast(t("mobile.toast.iconFailed", { defaultValue: "Could not update icon." }));
    } finally {
      setPhotoBusy(false);
    }
  }, [animal, updateAnimalInSnapshot, pushToast, t]);

  const handleDeletePhoto = useCallback(async (photoId) => {
    if (!animal) return;
    setPhotoBusy(true);
    try {
      const remaining = (animal.photos || []).filter((p) => p.id !== photoId);
      const nextIcon  = remaining.some((p) => p.url === animal.imageUrl)
        ? animal.imageUrl
        : (remaining.length ? remaining[remaining.length - 1].url : undefined);
      await updateAnimalInSnapshot({ ...animal, photos: remaining, imageUrl: nextIcon });
      pushToast(t("mobile.toast.photoDeleted", { defaultValue: "Photo deleted." }));
    } catch {
      pushToast(t("mobile.toast.photoDeleteFailed", { defaultValue: "Could not delete photo." }));
    } finally {
      setPhotoBusy(false);
    }
  }, [animal, updateAnimalInSnapshot, pushToast, t]);

  const saveEdit = useCallback(async (draft) => {
    setEditBusy(true);
    try {
      const snapshot = normalizeMobileSnapshot(await fetchBreederSnapshot());
      const merged = markRecordUpdated({ ...animal, ...draft });
      const animals = mergeSnapshotList([merged], snapshot.animals, "animal", mergeAnimalRecord);
      const savedSnapshot = normalizeMobileSnapshot(await saveBreederSnapshot({ ...snapshot, animals }));
      const reconciledAnimals = mergeSnapshotList(animals, savedSnapshot.animals, "animal", mergeAnimalRecord);
      const mergedKey = recordIdentity(merged, "animal", 0);
      const savedAnimal = reconciledAnimals.find((record, index) => recordIdentity(record, "animal", index) === mergedKey) || merged;
      setAnimal(savedAnimal);
      pushToast(t("mobile.toast.changesSaved", { defaultValue: "Changes saved." }));
    } catch (err) {
      pushToast(err instanceof Error ? err.message : t("mobile.toast.saveFailed", { defaultValue: "Save failed." }));
    } finally {
      setEditBusy(false);
    }
  }, [animal, pushToast, t]);

  const logActions = {
    feed:   logMobileFeed,
    weight: logMobileWeight,
    shed:   logMobileShed,
    note:   logMobileNote,
    clean:  logMobileClean,
    water:  logMobileWater,
  };

  const doQuickAction = useCallback(async (type, payload) => {
    const api = logActions[type];
    if (!api) return;
    try {
      const res = await api(payload);
      if (res?.animal) setAnimal(res.animal);
      pushToast(t("mobile.toast.actionSaved", { action: quickActionLabel(type, t), defaultValue: "{{action}} saved." }));
      setModal(null);
    } catch (err) {
      pushToast(err instanceof Error ? err.message : t("mobile.toast.saveFailed", { defaultValue: "Save failed." }));
    }
  }, [pushToast, t]);

  const startModal = (type) => {
    if (type === "clean" || type === "water") {
      doQuickAction(type, { animalId: animal.appAnimalId });
      return;
    }
    setModal(type);
  };

  return (
    <div className="mbl-shell">
      <div className="mbl-terminal-topbar">
        <button type="button" className="mbl-text-btn" onClick={onSwitchMode}>{t("mobile.terminal.switchMode", { defaultValue: "⇄ Switch mode" })}</button>
        <span className="mbl-terminal-badge">{t("mobile.terminal.badge", { defaultValue: "TERMINAL" })}</span>
        <button type="button" className="mbl-text-btn" onClick={onSignOut}>{t("mobile.common.signOut", { defaultValue: "Sign out" })}</button>
      </div>

      <Toast msg={toast} onDismiss={dismissToast} />

      {screen === "scan" && (
        <div className="mbl-terminal-scan">
          <div className="mbl-terminal-hero">
            <h1>{t("mobile.terminal.scanTitle", { defaultValue: "Scan QR" })}</h1>
            <p>{t("mobile.terminal.scanHint", { defaultValue: "Point at an animal QR to open its card" })}</p>
          </div>

          {busy ? <div className="mbl-loading"><Spinner /><span>{t("mobile.terminal.lookingUp", { defaultValue: "Looking up animal…" })}</span></div>
            : <QRScanner onScan={resolveAnimal} onError={pushToast} />}

          <form className="mbl-manual-row" onSubmit={handleManual}>
            <input value={manual} onChange={(e) => setManual(e.target.value)}
              placeholder={t("mobile.terminal.manualPlaceholder", { defaultValue: "Or paste QR value / animal ID" })} disabled={busy} />
            <button type="submit" className="mbl-btn mbl-btn--sk-primary" disabled={busy || !manual.trim()}>
              {t("mobile.common.open", { defaultValue: "Open" })}
            </button>
          </form>

          {recent.length > 0 && (
            <div className="mbl-recent-section">
              <h2>{t("mobile.common.recent", { defaultValue: "Recent" })}</h2>
              {recent.slice(0, 6).map((a) => (
                <button key={a.appAnimalId} type="button" className="mbl-animal-row"
                  onClick={() => resolveAnimal(a.appAnimalId)}>
                  <div className="mbl-avatar-sm">{String(a.name || "?").slice(0, 1)}</div>
                  <div>
                    <strong>{a.name || a.appAnimalId}</strong>
                    <small>{locationText(a)}</small>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {screen === "card" && animal && (
        <div className="mbl-terminal-card">
          <div className="mbl-card-topbar">
            <button type="button" className="mbl-back-btn" onClick={() => { setScreen("scan"); setAnimal(null); setCardTab("edit"); }}>
              {t("mobile.terminal.backToScan", { defaultValue: "← Back to scan" })}
            </button>
            <span>{animal.name || animal.appAnimalId}</span>
          </div>

          <div className="mbl-card-identity">
            {animal.imageUrl
              ? <img src={animal.imageUrl} alt="" className="mbl-avatar mbl-avatar-lg" />
              : <div className="mbl-avatar-placeholder mbl-avatar-lg">{String(animal.name || "?").slice(0, 1)}</div>}
            <div>
              <h2>{animal.name}</h2>
              <p>{animal.sex || "—"} · {formatGeneticsText(animal) || t("mobile.terminal.noGenetics", { defaultValue: "No genetics" })}</p>
              <small>{locationText(animal) || t("mobile.terminal.noLocation", { defaultValue: "No location" })}</small>
            </div>
          </div>

          <div className="mbl-quick-actions mbl-quick-actions--card">
            {[[t("mobile.actions.feed", { defaultValue: "Feed" }),"feed"],[t("mobile.actions.weight", { defaultValue: "Weight" }),"weight"],[t("mobile.actions.shed", { defaultValue: "Shed" }),"shed"],[t("mobile.actions.clean", { defaultValue: "Clean" }),"clean"],[t("mobile.actions.water", { defaultValue: "Water" }),"water"],[t("mobile.actions.note", { defaultValue: "Note" }),"note"],["📷","photo"]].map(
              ([label, type]) => (
                <button key={type} type="button" className="mbl-quick-btn"
                  onClick={() => type === "photo" ? setPhotoModal(true) : startModal(type)}>
                  {label}
                </button>
              )
            )}
          </div>

          <div className="mbl-subtabs">
            {[["edit",t("mobile.terminal.tabEditCard", { defaultValue: "Edit card" })],["breeding",t("mobile.terminal.tabBreeding", { defaultValue: "Breeding" })]].map(([k, lbl]) => (
              <button key={k} type="button" className={cardTab === k ? "is-active" : ""} onClick={() => setCardTab(k)}>
                {lbl}
              </button>
            ))}
          </div>

          {cardTab === "edit" && (
            <AnimalEditForm animal={animal} onSave={saveEdit} onCancel={() => { setScreen("scan"); setAnimal(null); }} busy={editBusy} />
          )}
          {cardTab === "breeding" && (
            <BreedingPanel animal={animal} pairings={pairings} allAnimals={localAnimals} onSavePairing={handleSavePairing} breedingCycles={breedingCycles} />
          )}
        </div>
      )}

      {modal === "feed"   && <FeedModal   animal={animal} onSave={(p) => doQuickAction("feed", p)}   onClose={() => setModal(null)} />}
      {modal === "weight" && <WeightModal animal={animal} onSave={(p) => doQuickAction("weight", p)} onClose={() => setModal(null)} />}
      {modal === "shed"   && <ShedModal   animal={animal} onSave={(p) => doQuickAction("shed", p)}   onClose={() => setModal(null)} />}
      {modal === "note"   && <NoteModal   animal={animal} onSave={(p) => doQuickAction("note", p)}   onClose={() => setModal(null)} />}
      {photoModal && animal && (
        <PhotoModal
          animal={animal}
          onTakePhoto={handleTakePhoto}
          onSetIcon={handleSetIcon}
          onDeletePhoto={handleDeletePhoto}
          onClose={() => setPhotoModal(false)}
          busy={photoBusy}
        />
      )}
    </div>
  );
}

// ג”€ג”€ג”€ TASK CARD ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€
const TASK_ICONS = { Feed: "🍗", Water: "💧", Clean: "🧹", Shed: "🐍", Weight: "⚖" };

function TaskCard({ task, animalMap, onComplete, onOpen }) {
  const animal = animalMap?.get(task.animalId);
  const isDue = String(task.dueStatus || "").toLowerCase().includes("due");
  const { t } = useTranslation();
  return (
    <div className={`mbl-task-card ${isDue ? "mbl-task-card--due" : ""}`}>
      <div className="mbl-task-card-icon">{TASK_ICONS[task.type] || "✓"}</div>
      <div className="mbl-task-info">
        <strong>{task.type}</strong>
        <span>{animal?.name || task.animalId}</span>
        <small>{[task.location, task.dueStatus].filter(Boolean).join(" · ") || "—"}</small>
      </div>
      <div className="mbl-task-btns">
        <button type="button" className="mbl-btn mbl-btn--sm mbl-btn--sk-primary" onClick={() => onComplete(task, "done")}>{t("mobile.tasks.done", { defaultValue: "Done" })}</button>
        {task.type === "Feed" && (
          <button type="button" className="mbl-btn mbl-btn--sm" onClick={() => onComplete(task, "refused")}>{t("mobile.tasks.refused", { defaultValue: "Refused" })}</button>
        )}
        <button type="button" className="mbl-btn mbl-btn--sm" onClick={() => onOpen(task.animalId)}>{t("mobile.common.open", { defaultValue: "Open" })}</button>
      </div>
    </div>
  );
}

// ג”€ג”€ג”€ FULL MODE ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€
const PUSH_NOT_SAVED_MESSAGE = "Sync failed — your data was NOT saved to the cloud. Will retry when online.";

function FullMode({ onSwitchMode, onSignOut, deviceId, user }) {
  const { appearanceState, updateAppearance } = useAppearance();
  const { t } = useTranslation();
  const snapshotCacheKey = useMemo(() => scopedStorageKey(SNAPSHOT_CACHE, user), [user]);
  const cachedSnapshot = useMemo(
    () => normalizeMobileSnapshot(readJson(snapshotCacheKey, {})),
    [snapshotCacheKey]
  );
  const [tab, setTab]              = useState("animals");
  const [animals, setAnimals]          = useState(() => cachedSnapshot.animals);
  const [pairings, setPairings]        = useState(() => cachedSnapshot.pairings);
  const [plannerState, setPlannerState] = useState(() => cachedSnapshot.plannerState);
  const [tasks, setTasks]              = useState([]);
  const [rackData, setRackData]        = useState({ rooms: [] });
  const [permissions, setPerms]        = useState({});
  const [animal, setAnimal]            = useState(null);
  const [modal, setModal]              = useState(null);
  const [scanOpen, setScanOpen]        = useState(false);
  const [, setPhotoBusy]              = useState(false);
  const [online, setOnline]            = useState(() => navigator.onLine !== false);
  const [queue, setQueue]              = useState(() => readJson(QUEUE_KEY, []));
  const [lastSyncAt, setLastSyncAt]    = useState(() => { try { return localStorage.getItem(LAST_SYNC_KEY) || ""; } catch { return ""; } });
  const [recent, setRecent]            = useState(() => readJson(RECENT_KEY, []));
  const [search, setSearch]            = useState("");
  const [sexFilter, setSexFilter]      = useState("");
  const [expandedPairing, setExpandedPairing] = useState(null);
  const [toast, setToast]              = useState("");
  const [loading, setLoading]          = useState(true);
  const [snapshotError, setSnapshotError] = useState("");
  const [morePanel, setMorePanel]      = useState(null); // null | "advisor" | "shed-test"

  const pushToast = useCallback((msg) => setToast(msg), []);
  const dismissToast = useCallback(() => setToast(""), []);

  useEffect(() => { writeJson(QUEUE_KEY, queue); }, [queue]);
  useEffect(() => { writeJson(RECENT_KEY, recent); }, [recent]);

  const recordSync = useCallback(() => {
    const nowIso = new Date().toISOString();
    setLastSyncAt(nowIso);
    try { localStorage.setItem(LAST_SYNC_KEY, nowIso); } catch {}
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [permResult, taskResult, snapshotResult] = await Promise.allSettled([
        fetchMobilePermissions({ deviceId, platform: "android" }),
        fetchMobileTasks().catch(() => ({ tasks: [] })),
        fetchBreederSnapshot(),
      ]);

      if (permResult.status === "fulfilled") {
        setPerms(permResult.value?.permissions || {});
      }
      if (taskResult.status === "fulfilled") {
        setTasks(Array.isArray(taskResult.value?.tasks) ? taskResult.value.tasks : []);
      }
      if (snapshotResult.status === "rejected") {
        throw snapshotResult.reason;
      }

      const normalizedSnapshot = normalizeMobileSnapshot(snapshotResult.value);
      setAnimals(normalizedSnapshot.animals);
      setPairings(normalizedSnapshot.pairings);
      setPlannerState(normalizedSnapshot.plannerState);
      setRackData(buildRackDataFromPlannerState(normalizedSnapshot.plannerState, normalizedSnapshot.animals, t));
      writeJson(snapshotCacheKey, normalizedSnapshot);
      writeJson(ANIMALS_CACHE, normalizedSnapshot.animals);
      setSnapshotError("");
      recordSync();
    } catch (err) {
      const message = err instanceof Error ? err.message : t("mobile.toast.loadFailed", { defaultValue: "Failed to load data." });
      setSnapshotError(message);
      pushToast(message);
    } finally {
      setLoading(false);
    }
  }, [deviceId, pushToast, recordSync, snapshotCacheKey, t]);

  const pushToCloud = useCallback(async () => {
    if (!online) { pushToast(t("mobile.toast.cannotPushOffline", { defaultValue: "Cannot push while offline." })); return; }
    let latest;
    try {
      latest = await fetchBreederSnapshot();
    } catch (err) {
      // The English sentinel stays in state because the Retry button checks it; it is translated at render.
      setSnapshotError(PUSH_NOT_SAVED_MESSAGE);
      pushToast(t("mobile.sync.pushNotSaved", { defaultValue: "Sync failed — your data was NOT saved to the cloud. Will retry when online." }));
      return;
    }
    try {
      const merged = mergeMobileSnapshot({ animals, pairings, plannerState }, latest);
      const savedSnapshot = normalizeMobileSnapshot(await saveBreederSnapshot(merged));
      // saveBreederSnapshot strips embedded (data:) photos before sending, so the echoed response
      // won't carry them — reconcile with the pre-send local merge to keep photos in local storage.
      const reconciledAnimals = mergeSnapshotList(merged.animals, savedSnapshot.animals, "animal", mergeAnimalRecord);
      const reconciledPairings = mergeSnapshotList(merged.pairings, savedSnapshot.pairings, "pairing", mergePairingRecord);
      const reconciledSnapshot = { ...savedSnapshot, animals: reconciledAnimals, pairings: reconciledPairings };
      setAnimals(reconciledAnimals);
      setPairings(reconciledPairings);
      setPlannerState(savedSnapshot.plannerState);
      setRackData(buildRackDataFromPlannerState(savedSnapshot.plannerState, reconciledAnimals, t));
      writeJson(snapshotCacheKey, reconciledSnapshot);
      writeJson(ANIMALS_CACHE, reconciledAnimals);
      setSnapshotError("");
      recordSync();
      pushToast(t("mobile.toast.mergedToCloud", { defaultValue: "Data merged to cloud." }));
    } catch (err) {
      const message = err instanceof Error ? err.message : t("mobile.toast.pushFailed", { defaultValue: "Push failed." });
      setSnapshotError(message);
      pushToast(message);
    }
  }, [online, animals, pairings, plannerState, recordSync, pushToast, snapshotCacheKey, t]);

  useEffect(() => {
    refresh();
    const onOnline  = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online",  onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online",  onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [refresh]);

  useEffect(() => {
    if (tab !== "rack") return;
    if (hasPlannerSpaces(plannerState)) {
      setRackData(buildRackDataFromPlannerState(plannerState, animals, t));
      return;
    }
    fetchMobileRackMode().then(setRackData).catch(() => {
      setRackData(buildRackDataFromAnimalLocations(animals, t));
    });
  }, [tab, plannerState, animals, t]);

  useEffect(() => {
    if (!online) return undefined;
    const refreshWhenVisible = () => {
      if (!document.hidden) refresh();
    };
    const timer = window.setInterval(refreshWhenVisible, 60000);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [online, refresh]);

  const openAnimal = useCallback(async (raw) => {
    if (!raw) return;
    setScanOpen(false);
    const animalId = parseQrValue(raw);
    const local = animals.find((a) => compactText(a.id, a.appAnimalId, a.animalId, a.snakeId).includes(animalId));
    if (local) {
      setAnimal(local);
      setRecent((prev) => [local, ...prev.filter((a) => a.appAnimalId !== local.appAnimalId)].slice(0, 10));
      setTab("animals");
      return;
    }
    try {
      const res = await fetchMobileAnimal(animalId);
      if (res?.animal) {
        setAnimal(res.animal);
        setRecent((prev) => [res.animal, ...prev.filter((a) => a.appAnimalId !== res.animal.appAnimalId)].slice(0, 10));
        setTab("animals");
      } else {
        pushToast(t("mobile.toast.noAnimalForQr", { defaultValue: "No animal found for this QR code." }));
      }
    } catch (err) {
      pushToast(err instanceof Error ? err.message : t("mobile.toast.scanFailed", { defaultValue: "Scan failed." }));
    }
  }, [animals, pushToast, t]);

  const logActions = { feed: logMobileFeed, weight: logMobileWeight, shed: logMobileShed, note: logMobileNote, clean: logMobileClean, water: logMobileWater };

  const doQuickAction = useCallback(async (type, payload) => {
    const api = logActions[type];
    if (!api) return;
    if (!online) {
      setQueue((prev) => [...prev, { id: `q-${Date.now()}`, actionType: type, payload, deviceId }]);
      setModal(null);
      pushToast(t("mobile.toast.savedOffline", { defaultValue: "Saved offline — will sync when online." }));
      return;
    }
    try {
      const res = await api(payload);
      if (res?.animal) setAnimal(res.animal);
      setModal(null);
      pushToast(t("mobile.toast.actionSaved", { action: quickActionLabel(type, t), defaultValue: "{{action}} saved." }));
      await refresh();
    } catch (err) {
      pushToast(err instanceof Error ? err.message : t("mobile.toast.saveFailed", { defaultValue: "Save failed." }));
    }
  }, [online, deviceId, refresh, pushToast, t]);

  const startModal = (type) => {
    if ((type === "clean" || type === "water") && animal?.appAnimalId) {
      doQuickAction(type, { animalId: animal.appAnimalId }); return;
    }
    setModal(type);
  };

  const runSync = async () => {
    if (!queue.length) return;
    try {
      await syncMobileQueue({ deviceId, actions: queue });
      setQueue([]);
      pushToast(t("mobile.toast.offlineSynced", { defaultValue: "Offline updates synced." }));
      await refresh();
    } catch (err) {
      pushToast(err instanceof Error ? err.message : t("mobile.toast.syncFailed", { defaultValue: "Sync failed." }));
    }
  };

  const syncCloudDatabase = async () => {
    if (queue.length) {
      await runSync();
    }
    await pushToCloud();
  };

  useEffect(() => {
    if (!online || !queue.length) return;
    runSync();
  }, [online, queue.length]);

  const completeTask = async (task, result) => {
    const type = { Feed: "feed", Water: "water", Clean: "clean" }[task.type] || "note";
    await doQuickAction(type, { animalId: task.animalId, result, note: `${task.type} ${result}` });
  };

  // ג”€ג”€ Photo helpers (Full mode) ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€
  const updateAnimalInSnapshot = useCallback(async (updated) => {
    const snap = normalizeMobileSnapshot(await fetchBreederSnapshot());
    const changed = markRecordUpdated(updated);
    const list = mergeSnapshotList([changed], snap?.animals, "animal", mergeAnimalRecord);
    const savedSnapshot = normalizeMobileSnapshot(await saveBreederSnapshot({ ...snap, animals: list }));
    // saveBreederSnapshot strips embedded (data:) photos before the request body is built, so the
    // echoed response won't carry them back — reconcile with the pre-send local list to keep photos.
    const reconciledAnimals = mergeSnapshotList(list, savedSnapshot.animals, "animal", mergeAnimalRecord);
    const changedKey = recordIdentity(changed, "animal", 0);
    const savedAnimal = reconciledAnimals.find((record, index) => recordIdentity(record, "animal", index) === changedKey) || changed;
    const reconciledSnapshot = { ...savedSnapshot, animals: reconciledAnimals };
    setAnimal(savedAnimal);
    setAnimals((prev) => upsertSnapshotRecord(prev, savedAnimal, "animal"));
    setPlannerState(savedSnapshot.plannerState);
    setRackData(buildRackDataFromPlannerState(savedSnapshot.plannerState, reconciledAnimals, t));
    writeJson(snapshotCacheKey, reconciledSnapshot);
    writeJson(ANIMALS_CACHE, reconciledAnimals);
  }, [snapshotCacheKey, t]);

  // ג”€ג”€ Pairing save handler ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€
  const handleSavePairing = useCallback(async (updatedPairing) => {
    const snap  = normalizeMobileSnapshot(await fetchBreederSnapshot());
    const changed = markRecordUpdated(updatedPairing);
    const pairs = mergeSnapshotList([changed], snap?.pairings, "pairing", mergePairingRecord);
    const savedSnapshot = normalizeMobileSnapshot(await saveBreederSnapshot({ ...snap, pairings: pairs }));
    const reconciledPairings = mergeSnapshotList(pairs, savedSnapshot.pairings, "pairing", mergePairingRecord);
    setPairings(reconciledPairings.length || !pairs.length ? reconciledPairings : [...pairs]);
    setPlannerState(savedSnapshot.plannerState);
    writeJson(snapshotCacheKey, { ...savedSnapshot, pairings: reconciledPairings });
  }, [snapshotCacheKey]);

  const handleTakePhoto = useCallback(async () => {
    if (!animal) return;
    setPhotoBusy(true);
    try {
      // Capacitor downscales natively before the bytes ever reach JS, which is far cheaper than
      // doing it on a canvas here. `width` caps the long edge the same way PHOTO_PRESET does, and
      // correctOrientation bakes in the EXIF rotation so photos are not stored sideways.
      const result = await Camera.getPhoto({
        quality: 82,
        width: 1600,
        correctOrientation: true,
        allowEditing: false,
        resultType: CameraResultType.Base64,
        source: CameraSource.Camera,
      });
      const dataUrl  = `data:image/${result.format || "jpeg"};base64,${result.base64String}`;
      const newPhoto = {
        id: `photo-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`,
        url: dataUrl,
        addedAt: new Date().toISOString(),
        source: "camera",
        type: `image/${result.format || "jpeg"}`,
        size: estimateDataUrlBytes(dataUrl),
      };
      await updateAnimalInSnapshot({ ...animal, photos: [...(animal.photos || []), newPhoto] });
      pushToast(t("mobile.toast.photoSaved", { defaultValue: "Photo saved." }));
    } catch (err) {
      if (!String(err?.message || "").toLowerCase().includes("cancel")) {
        pushToast(t("mobile.toast.photoFailed", { defaultValue: "Could not take photo." }));
      }
    } finally {
      setPhotoBusy(false);
    }
  }, [animal, updateAnimalInSnapshot, pushToast, t]);

  const handleSetIcon = useCallback(async (photoUrl) => {
    if (!animal) return;
    setPhotoBusy(true);
    try {
      await updateAnimalInSnapshot({ ...animal, imageUrl: photoUrl });
      pushToast(t("mobile.toast.iconUpdated", { defaultValue: "Icon updated." }));
    } catch { pushToast(t("mobile.toast.iconFailed", { defaultValue: "Could not update icon." })); }
    finally { setPhotoBusy(false); }
  }, [animal, updateAnimalInSnapshot, pushToast, t]);

  const handleDeletePhoto = useCallback(async (photoId) => {
    if (!animal) return;
    setPhotoBusy(true);
    try {
      const remaining = (animal.photos || []).filter((p) => p.id !== photoId);
      const nextIcon  = remaining.some((p) => p.url === animal.imageUrl)
        ? animal.imageUrl
        : (remaining.length ? remaining[remaining.length - 1].url : undefined);
      await updateAnimalInSnapshot({ ...animal, photos: remaining, imageUrl: nextIcon });
      pushToast(t("mobile.toast.photoDeleted", { defaultValue: "Photo deleted." }));
    } catch { pushToast(t("mobile.toast.photoDeleteFailed", { defaultValue: "Could not delete photo." })); }
    finally { setPhotoBusy(false); }
  }, [animal, updateAnimalInSnapshot, pushToast, t]);

  const animalMap = useMemo(
    () => animalMapByIdentity(animals),
    [animals]
  );

  const filteredAnimals = useMemo(() => {
    let list = animals;
    if (sexFilter && sexFilter !== "groups") list = list.filter((a) => sexMatchesFilter(a, sexFilter));
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((a) => animalSearchBlob(a).includes(q));
    }
    return list;
  }, [animals, search, sexFilter]);

  const groupedAnimals = useMemo(() => {
    const map = new Map();
    animals.forEach((a) => {
      const gs = Array.isArray(a.groups) && a.groups.length ? a.groups : ["Ungrouped"];
      gs.forEach((g) => {
        if (!map.has(g)) map.set(g, []);
        map.get(g).push(a);
      });
    });
    return [...map.entries()].sort(([a], [b]) => {
      if (a === "Ungrouped") return 1;
      if (b === "Ungrouped") return -1;
      return a.localeCompare(b);
    });
  }, [animals]);

  const advisorMales = useMemo(
    () => animals.filter((a) => { const s = String(a.sex || "").toLowerCase(); return s === "male" || s === "m"; }),
    [animals]
  );
  const advisorFemales = useMemo(
    () => animals.filter((a) => { const s = String(a.sex || "").toLowerCase(); return s === "female" || s === "f"; }),
    [animals]
  );

  const taskGroups = useMemo(() => {
    const overdue = tasks.filter((t) => String(t.dueStatus || "").toLowerCase().includes("overdue"));
    const today   = tasks.filter((t) => { const s = String(t.dueStatus || "").toLowerCase(); return !s.includes("overdue") && (s.includes("today") || s.includes("due")); });
    const other   = tasks.filter((t) => { const s = String(t.dueStatus || "").toLowerCase(); return !s.includes("overdue") && !s.includes("today") && !s.includes("due"); });
    return { overdue, today, other };
  }, [tasks]);

  const spacesSummary = useMemo(() => {
    const state = normalizeMobilePlannerState(plannerState) || {};
    return {
      rooms: asArray(state.rooms).length,
      racks: asArray(state.heatRacks).length,
      terrariums: asArray(state.terrariums).length,
      groups: asArray(state.groups).length || groupedAnimals.filter(([name]) => name !== "Ungrouped").length,
    };
  }, [plannerState, groupedAnimals]);

  const dataSummary = useMemo(() => ({
    animals: animals.length,
    pairings: pairings.length,
    feedCycles: animals.filter((item) => normalizeFeederProfile(item).intervalDays).length,
    photos: animals.reduce((sum, item) => sum + asArray(item.photos).length, 0),
    logs: animals.reduce((sum, item) => sum + flattenLogs(item.logs).length, 0),
  }), [animals, pairings]);

  const navTabs = [
    { key: "animals",  label: t("mobile.nav.animals", { defaultValue: "Animals" }),   icon: "🐍" },
    { key: "breeding", label: t("mobile.nav.breeding", { defaultValue: "Breeding" }), icon: "♥"  },
    { key: "tasks",    label: t("mobile.nav.tasks", { defaultValue: "Tasks" }),       icon: "✓"  },
    { key: "rack",     label: t("mobile.nav.rack", { defaultValue: "Rack" }),         icon: "⬛" },
    { key: "more",     label: t("mobile.nav.more", { defaultValue: "More" }),         icon: "≡"  },
  ];

  const thisAccountLabel = t("mobile.animals.thisAccount", { defaultValue: "this account" });

  const switchTab = (key) => { setAnimal(null); setExpandedPairing(null); setMorePanel(null); setTab(key); };

  return (
    <div className="mbl-shell">
      <OfflineBanner online={online} queued={queue.length} onSync={runSync} />

      <div className="mbl-full-topbar">
        <span className="mbl-full-title">Serpentora</span>
        <div className="mbl-topbar-actions">
          {lastSyncAt && online && (
            <span className="mbl-topbar-sync-time" title={lastSyncAt}>
              {fmtSyncTime(lastSyncAt, t)}
            </span>
          )}
          {!online && <span className="mbl-topbar-offline">{t("mobile.sync.offline", { defaultValue: "Offline" })}</span>}
          <button type="button" className="mbl-topbar-qr-btn" onClick={() => setScanOpen(true)} aria-label={t("mobile.scan.scanQr", { defaultValue: "Scan QR" })}>▣</button>
        </div>
      </div>

      {snapshotError && (
        <div className="mbl-sync-error mbl-sync-error--global" role="alert">
          <strong>{t("mobile.sync.errorTitle", { defaultValue: "Sync error" })}</strong>
          <span>{snapshotError === PUSH_NOT_SAVED_MESSAGE ? t("mobile.sync.pushNotSaved", { defaultValue: "Sync failed — your data was NOT saved to the cloud. Will retry when online." }) : snapshotError}</span>
          <button type="button" className="mbl-text-btn mbl-text-btn--sm" onClick={snapshotError.includes("NOT saved") ? pushToCloud : refresh}>
            {t("mobile.sync.retry", { defaultValue: "Retry" })}
          </button>
        </div>
      )}

      <Toast msg={toast} onDismiss={dismissToast} />

      {/* ג”€ג”€ QR scan overlay ג”€ג”€ */}
      {scanOpen && (
        <ActionSheet title={t("mobile.scan.sheetTitle", { defaultValue: "Scan QR code" })} onClose={() => setScanOpen(false)}>
          <QRScanner onScan={openAnimal} onError={(e) => { pushToast(e); setScanOpen(false); }} />
          <form className="mbl-manual-row" onSubmit={(e) => { e.preventDefault(); const v = e.target.elements.qr.value.trim(); if (v) { openAnimal(v); e.target.reset(); } }}>
            <input name="qr" placeholder={t("mobile.scan.manualPlaceholder", { defaultValue: "Or paste QR / animal ID" })} />
            <button type="submit" className="mbl-btn mbl-btn--sk-primary">{t("mobile.common.open", { defaultValue: "Open" })}</button>
          </form>
          {recent.length > 0 && (
            <>
              <div className="mbl-section-label">{t("mobile.common.recent", { defaultValue: "Recent" })}</div>
              {recent.slice(0, 4).map((a) => (
                <button key={a.appAnimalId} type="button" className="mbl-animal-row" onClick={() => openAnimal(a.appAnimalId)}>
                  <div className="mbl-avatar-sm">{String(a.name || "?").slice(0, 1)}</div>
                  <div><strong>{a.name || a.appAnimalId}</strong><small>{locationText(a)}</small></div>
                </button>
              ))}
            </>
          )}
        </ActionSheet>
      )}

      <div className="mbl-full-body">
        {loading && <div className="mbl-loading"><Spinner /><span>{t("mobile.common.loadingEllipsis", { defaultValue: "Loading…" })}</span></div>}

        {/* ג”€ג”€ ANIMALS TAB ג”€ג”€ */}
        {/* Full-screen feature panels */}
        {!loading && morePanel === "advisor" && (
          <FullScreenPanel title={t("mobile.more.breedingAdvisorTitle", { defaultValue: "Breeding Advisor" })} onClose={() => setMorePanel(null)}>
            <SuggestionsTab
              males={advisorMales}
              females={advisorFemales}
              requireAvailableForBreeding={false}
              requireMatureForBreeding={false}
            />
          </FullScreenPanel>
        )}

        {!loading && morePanel === "shed-test" && (
          <FullScreenPanel title={t("mobile.more.shedTestTitle", { defaultValue: "Lab tests" })} onClose={() => setMorePanel(null)}>
            <ShedTestTerminalPanel
              snakes={animals}
              onBatchSubmitted={() => pushToast(t("mobile.toast.batchSubmitted", { defaultValue: "Batch submitted." }))}
            />
          </FullScreenPanel>
        )}

        {!loading && !morePanel && tab === "animals" && (
          <div className="mbl-screen">
            {animal ? (
              <AnimalProfile
                animal={animal}
                permissions={permissions}
                pairings={pairings}
                allAnimals={animals}
                onQuickAction={startModal}
                onTakePhoto={handleTakePhoto}
                onSetIcon={handleSetIcon}
                onDeletePhoto={handleDeletePhoto}
                onSavePairing={handleSavePairing}
                onBack={() => setAnimal(null)}
              />
            ) : (
              <>
                <div className="mbl-animals-header">
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t("mobile.animals.searchPlaceholder", { defaultValue: "Search by name, morph, location…" })}
                    className="mbl-search-input"
                  />
                  <div className="mbl-filter-chips">
                    {[["", t("mobile.animals.filterAll", { defaultValue: "All" })], ["Male", t("mobile.animals.filterMale", { defaultValue: "Male" })], ["Female", t("mobile.animals.filterFemale", { defaultValue: "Female" })], ["groups", t("mobile.animals.filterGroups", { defaultValue: "Groups" })]].map(([val, label]) => (
                      <button key={val || "all"} type="button"
                        className={`mbl-chip ${sexFilter === val ? "is-active" : ""}`}
                        onClick={() => setSexFilter(val)}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Groups view */}
                {sexFilter === "groups" ? (
                  groupedAnimals.length === 0
                    ? (
                      <p className="mbl-empty">
                        {t("mobile.animals.emptyCloud", { account: user?.email || thisAccountLabel, defaultValue: "No animals are saved in the cloud for {{account}}. Sync the desktop app with the same account, then tap Refresh from cloud." })}
                      </p>
                    )
                    : groupedAnimals.map(([groupName, groupList]) => {
                        const visible = search.trim()
                          ? groupList.filter((a) => {
                              const q = search.toLowerCase();
                              return animalSearchBlob(a).includes(q);
                            })
                          : groupList;
                        if (!visible.length) return null;
                        return (
                          <React.Fragment key={groupName}>
                            <div className="mbl-section-label">{groupName === "Ungrouped" ? t("mobile.animals.ungrouped", { defaultValue: "Ungrouped" }) : groupName} ({visible.length})</div>
                            {visible.map((a) => <AnimalCardRow key={a.id || a.appAnimalId} animal={a} onOpen={openAnimal} />)}
                          </React.Fragment>
                        );
                      })
                ) : (
                  /* Flat list view */
                  <>
                    <div className="mbl-section-label">{t("mobile.animals.count", { count: filteredAnimals.length, defaultValue: "{{count}} animals", defaultValue_one: "{{count}} animal" })}</div>
                    {filteredAnimals.map((a) => <AnimalCardRow key={a.id || a.appAnimalId} animal={a} onOpen={openAnimal} />)}
                    {!filteredAnimals.length && <p className="mbl-empty">{t("mobile.animals.noneFound", { defaultValue: "No animals found." })}</p>}
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* ג”€ג”€ BREEDING TAB ג”€ג”€ */}
        {!loading && !morePanel && tab === "breeding" && (
          <div className="mbl-screen">
            <div className="mbl-section-label">{t("mobile.breeding.pairingCount", { count: pairings.length, defaultValue: "{{count}} pairings", defaultValue_one: "{{count}} pairing" })}</div>
            {pairings.length === 0 && <p className="mbl-empty">{t("mobile.breeding.noPairings", { defaultValue: "No pairings yet. Create pairings in the desktop app." })}</p>}
            {pairings.map((pairing) => {
              const female      = animalMap.get(pairing.femaleId);
              const male        = animalMap.get(pairing.maleId);
              const femaleName  = female?.name || pairing.femaleId || t("mobile.breeding.female", { defaultValue: "Female" });
              const maleName    = male?.name   || pairing.maleId   || t("mobile.breeding.male", { defaultValue: "Male" });
              const isExpanded  = expandedPairing === pairing.id;
              const statusCls   = `mbl-bp-status mbl-bp-status--${(pairing.status || "unknown").toLowerCase().replace(/\s+/g, "-")}`;
              const stages = [
                { key: "ovulation",  label: t("mobile.breeding.stageOv", { defaultValue: "Ov" }),       done: !!(pairing.ovulation?.date  || pairing.mobileOvulationLogs?.length)  },
                { key: "preLayShed", label: t("mobile.breeding.stageShed", { defaultValue: "Shed" }),   done: !!(pairing.preLayShed?.date || pairing.mobilePreLayShedLogs?.length) },
                { key: "clutch",     label: t("mobile.breeding.stageLay", { defaultValue: "Lay" }),     done: !!(pairing.clutch?.date     || pairing.mobileClutchLogs?.length)     },
                { key: "hatch",      label: t("mobile.breeding.stageHatch", { defaultValue: "Hatch" }), done: !!(pairing.hatch?.date      || pairing.mobileHatchLogs?.length)      },
              ];
              return (
                <div key={pairing.id} className="mbl-pairing-card">
                  <button type="button" className="mbl-pairing-card-header"
                    onClick={() => setExpandedPairing(isExpanded ? null : pairing.id)}>
                    <div className="mbl-pairing-animals">
                      <div className="mbl-pairing-animal-chip">
                        <span className="mbl-pairing-dot mbl-pairing-dot--f">{t("mobile.breeding.femaleShort", { defaultValue: "F" })}</span>
                        <span>{femaleName}</span>
                      </div>
                      <span className="mbl-pairing-x">ֳ—</span>
                      <div className="mbl-pairing-animal-chip">
                        <span className="mbl-pairing-dot mbl-pairing-dot--m">{t("mobile.breeding.maleShort", { defaultValue: "M" })}</span>
                        <span>{maleName}</span>
                      </div>
                    </div>
                    <div className="mbl-pairing-header-right">
                      <span className={statusCls}>{pairing.status || t("mobile.pairing.unknownStatus", { defaultValue: "Unknown" })}</span>
                      <span className="mbl-pairing-chevron">{isExpanded ? "▲" : "▼"}</span>
                    </div>
                  </button>
                  <div className="mbl-pairing-progress">
                    {stages.map((s, i) => (
                      <React.Fragment key={s.key}>
                        <div className={`mbl-stage-pip ${s.done ? "is-done" : ""}`}>
                          <div className="mbl-stage-pip-dot" />
                          <span>{s.label}</span>
                        </div>
                        {i < stages.length - 1 && <div className={`mbl-stage-line ${s.done ? "is-done" : ""}`} />}
                      </React.Fragment>
                    ))}
                  </div>
                  {isExpanded && (
                    <div className="mbl-pairing-body">
                      <PairingSection
                        pairing={pairing}
                        isFemale={true}
                        partnerName={maleName}
                        onSavePairing={handleSavePairing}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ג”€ג”€ TASKS TAB ג”€ג”€ */}
        {!loading && !morePanel && tab === "tasks" && (
          <div className="mbl-screen">
            {tasks.length === 0 && <p className="mbl-empty">{t("mobile.tasks.empty", { defaultValue: "No tasks for today. 🎉" })}</p>}
            {taskGroups.overdue.length > 0 && (
              <>
                <div className="mbl-section-label mbl-section-label--danger">{t("mobile.tasks.overdue", { n: taskGroups.overdue.length, defaultValue: "⚠ Overdue ({{n}})" })}</div>
                {taskGroups.overdue.map((task) => <TaskCard key={task.id} task={task} animalMap={animalMap} onComplete={completeTask} onOpen={openAnimal} />)}
              </>
            )}
            {taskGroups.today.length > 0 && (
              <>
                <div className="mbl-section-label">{t("mobile.tasks.today", { n: taskGroups.today.length, defaultValue: "Today ({{n}})" })}</div>
                {taskGroups.today.map((task) => <TaskCard key={task.id} task={task} animalMap={animalMap} onComplete={completeTask} onOpen={openAnimal} />)}
              </>
            )}
            {taskGroups.other.length > 0 && (
              <>
                <div className="mbl-section-label">{t("mobile.tasks.upcoming", { n: taskGroups.other.length, defaultValue: "Upcoming ({{n}})" })}</div>
                {taskGroups.other.map((task) => <TaskCard key={task.id} task={task} animalMap={animalMap} onComplete={completeTask} onOpen={openAnimal} />)}
              </>
            )}
          </div>
        )}

        {/* ג”€ג”€ RACK TAB ג”€ג”€ */}
        {!loading && !morePanel && tab === "rack" && (
          <div className="mbl-screen">
            <div className="mbl-section-label">{t("mobile.rack.title", { defaultValue: "Spaces / Rack view" })}</div>
            {(rackData.rooms || []).map((room) => (
              <div key={room.roomName} className="mbl-rack-room">
                <h2>{room.roomName}</h2>
                {(room.racks || []).map((rack) => (
                  <div key={rack.rackName} className="mbl-rack">
                    <h3>{rack.rackName}</h3>
                    <div className="mbl-rack-grid">
                      {(rack.tubs || []).map((tub) => (
                        <button key={`${rack.rackName}-${tub.tub}`} type="button"
                          className={`mbl-tub ${tub.alert ? "is-alert" : ""} ${tub.feedingDue ? "is-feed" : ""} ${!tub.animalId ? "is-empty" : ""}`}
                          onClick={() => tub.animalId && openAnimal(tub.animalId)}>
                          <strong>{tub.tub}</strong>
                          <small>{tub.name || (tub.animalId ? "···" : t("mobile.rack.empty", { defaultValue: "Empty" }))}</small>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ))}
            {!rackData.rooms?.length && <p className="mbl-empty">{t("mobile.rack.noData", { defaultValue: "No rack data. Configure spaces in the desktop app." })}</p>}
          </div>
        )}

        {/* ג”€ג”€ MORE TAB ג”€ג”€ */}
        {!loading && !morePanel && tab === "more" && (
          <div className="mbl-screen mbl-settings-screen">

            {/* Profile card */}
            <div className="mbl-profile-card">
              <div className="mbl-profile-card-avatar">
                {String(user?.fullName || user?.displayName || user?.email || "?").slice(0, 1).toUpperCase()}
              </div>
              <div className="mbl-profile-card-info">
                <strong>{user?.fullName || user?.displayName || t("mobile.more.defaultName", { defaultValue: "Breeder" })}</strong>
                {user?.email && <span>{user.email}</span>}
              </div>
            </div>

            {/* Quick access */}
            <div className="mbl-more-section">
              <div className="mbl-section-label">{t("mobile.more.quickAccess", { defaultValue: "Quick access" })}</div>
              <div className="mbl-more-quick-grid">
                <button type="button" className="mbl-more-quick-card" onClick={() => setScanOpen(true)}>
                  <span>▣</span><strong>{t("mobile.scan.scanQr", { defaultValue: "Scan QR" })}</strong>
                </button>
                <button type="button" className="mbl-more-quick-card" onClick={() => switchTab("rack")}>
                  <span>⬛</span><strong>{t("mobile.more.rackView", { defaultValue: "Rack view" })}</strong>
                </button>
                <button type="button" className="mbl-more-quick-card" onClick={() => switchTab("breeding")}>
                  <span>♥</span><strong>{t("mobile.nav.breeding", { defaultValue: "Breeding" })}</strong>
                </button>
                <button type="button" className="mbl-more-quick-card" onClick={() => switchTab("tasks")}>
                  <span>✓</span><strong>{t("mobile.nav.tasks", { defaultValue: "Tasks" })}</strong>
                </button>
              </div>
            </div>

            {/* Collection data */}
            <div className="mbl-more-section">
              <div className="mbl-section-label">{t("mobile.more.collectionData", { defaultValue: "Collection data" })}</div>
              <div className="mbl-summary-grid">
                <div><span>{t("mobile.more.summaryAnimals", { defaultValue: "Animals" })}</span><strong>{dataSummary.animals}</strong></div>
                <div><span>{t("mobile.more.summaryPairings", { defaultValue: "Pairings" })}</span><strong>{dataSummary.pairings}</strong></div>
                <div><span>{t("mobile.more.summaryRooms", { defaultValue: "Rooms" })}</span><strong>{spacesSummary.rooms}</strong></div>
                <div><span>{t("mobile.more.summaryRacks", { defaultValue: "Racks" })}</span><strong>{spacesSummary.racks}</strong></div>
                <div><span>{t("mobile.more.summaryTerrariums", { defaultValue: "Terrariums" })}</span><strong>{spacesSummary.terrariums}</strong></div>
                <div><span>{t("mobile.more.summaryFeedCycles", { defaultValue: "Feed cycles" })}</span><strong>{dataSummary.feedCycles}</strong></div>
                <div><span>{t("mobile.more.summaryPhotos", { defaultValue: "Photos" })}</span><strong>{dataSummary.photos}</strong></div>
                <div><span>{t("mobile.more.summaryLogs", { defaultValue: "Logs" })}</span><strong>{dataSummary.logs}</strong></div>
              </div>
            </div>

            {/* Tools */}
            <div className="mbl-more-section">
              <div className="mbl-section-label">{t("mobile.more.tools", { defaultValue: "Tools" })}</div>
              <div className="mbl-settings-list">
                <button type="button" className="mbl-settings-row mbl-settings-row--btn" onClick={() => setMorePanel("advisor")}>
                  <span>{t("mobile.more.breedingAdvisorRow", { defaultValue: "🧬 Breeding Advisor" })}</span>
                  <span className="mbl-settings-chevron">›</span>
                </button>
                <button type="button" className="mbl-settings-row mbl-settings-row--btn" onClick={() => setMorePanel("shed-test")}>
                  <span>{t("mobile.more.shedTestRow", { defaultValue: "🔬 Lab tests" })}</span>
                  <span className="mbl-settings-chevron">›</span>
                </button>
              </div>
            </div>

            {/* Appearance */}
            <div className="mbl-more-section">
              <div className="mbl-section-label">{t("mobile.more.appearance", { defaultValue: "Appearance" })}</div>
              <div className="mbl-settings-list">
                <div className="mbl-settings-row mbl-settings-row--stacked">
                  <span>{t("mobile.more.theme", { defaultValue: "Theme" })}</span>
                  <div className="mbl-seg">
                    {["system", "light", "dark"].map((mode) => (
                      <button key={mode} type="button"
                        className={appearanceState.themeMode === mode ? "is-active" : ""}
                        onClick={() => updateAppearance({ themeMode: mode })}>
                        {mode === "system" ? t("mobile.more.themeAuto", { defaultValue: "Auto" }) : mode === "light" ? t("mobile.more.themeLight", { defaultValue: "Light" }) : t("mobile.more.themeDark", { defaultValue: "Dark" })}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Cloud & Sync */}
            <div className="mbl-more-section">
              <div className="mbl-section-label">{t("mobile.more.cloudSync", { defaultValue: "Cloud & sync" })}</div>
              <div className="mbl-settings-list">
                <div className="mbl-settings-row">
                  <span>{t("mobile.more.status", { defaultValue: "Status" })}</span>
                  <span className={`mbl-settings-badge ${online ? "mbl-settings-badge--green" : "mbl-settings-badge--red"}`}>
                    {online ? t("mobile.sync.online", { defaultValue: "Online" }) : t("mobile.sync.offline", { defaultValue: "Offline" })}
                  </span>
                </div>
                <div className="mbl-settings-row">
                  <span>{t("mobile.more.lastSynced", { defaultValue: "Last synced" })}</span>
                  <span className="mbl-settings-muted">{fmtSyncTime(lastSyncAt, t)}</span>
                </div>
                <div className="mbl-settings-row">
                  <span>{t("mobile.more.autoSync", { defaultValue: "Auto sync" })}</span>
                  <span className="mbl-settings-muted">{t("mobile.more.autoSyncValue", { defaultValue: "On while signed in" })}</span>
                </div>
                <div className="mbl-settings-row">
                  <span>{t("mobile.more.syncedSpaces", { defaultValue: "Synced spaces" })}</span>
                  <span className="mbl-settings-muted">{t("mobile.more.syncedSpacesValue", { rooms: spacesSummary.rooms, racks: spacesSummary.racks, defaultValue: "{{rooms}} rooms / {{racks}} racks" })}</span>
                </div>
                {queue.length > 0 && (
                  <div className="mbl-settings-row">
                    <span>{t("mobile.more.pendingActions", { count: queue.length, defaultValue: "{{count}} pending actions", defaultValue_one: "{{count}} pending action" })}</span>
                    <button type="button" className="mbl-text-btn mbl-text-btn--sm" onClick={runSync}>{t("mobile.sync.syncNow", { defaultValue: "Sync now" })}</button>
                  </div>
                )}
                <button type="button" className="mbl-settings-row mbl-settings-row--btn" onClick={syncCloudDatabase} disabled={!online}>
                  <span style={{ opacity: online ? 1 : 0.45 }}>{t("mobile.more.syncCloudDatabase", { defaultValue: "Sync cloud database" })}</span>
                  <span className="mbl-settings-chevron">›</span>
                </button>
                <button type="button" className="mbl-settings-row mbl-settings-row--btn" onClick={refresh}>
                  <span>{t("mobile.more.refreshFromCloud", { defaultValue: "Refresh from cloud" })}</span>
                  <span className="mbl-settings-chevron">›</span>
                </button>
              </div>
            </div>

            {/* Devices */}
            <div className="mbl-more-section">
              <div className="mbl-section-label">{t("mobile.more.devices", { defaultValue: "Devices" })}</div>
              <div className="mbl-settings-list">
                <div className="mbl-settings-row mbl-settings-row--col">
                  <span>{t("mobile.more.thisDeviceId", { defaultValue: "This device ID" })}</span>
                  <span className="mbl-device-id">{deviceId}</span>
                </div>
              </div>
              <p className="mbl-settings-hint">
                {t("mobile.more.devicesHint", { defaultValue: "Sign in with the same account on any device to access your data. All devices sync through the cloud automatically." })}
              </p>
            </div>

            {/* Account */}
            <div className="mbl-more-section">
              <div className="mbl-section-label">{t("mobile.more.account", { defaultValue: "Account" })}</div>
              <div className="mbl-settings-list">
                <button type="button" className="mbl-settings-row mbl-settings-row--btn" onClick={onSwitchMode}>
                  <span>{t("mobile.more.switchToTerminal", { defaultValue: "Switch to Terminal mode" })}</span>
                  <span className="mbl-settings-chevron">›</span>
                </button>
                <button type="button" className="mbl-settings-row mbl-settings-row--btn mbl-settings-row--danger" onClick={onSignOut}>
                  <span>{t("mobile.common.signOut", { defaultValue: "Sign out" })}</span>
                  <span className="mbl-settings-chevron">›</span>
                </button>
              </div>
            </div>

          </div>
        )}
      </div>

      {animal && modal === "feed"   && <FeedModal   animal={animal} onSave={(p) => doQuickAction("feed",   p)} onClose={() => setModal(null)} />}
      {animal && modal === "weight" && <WeightModal animal={animal} onSave={(p) => doQuickAction("weight", p)} onClose={() => setModal(null)} />}
      {animal && modal === "shed"   && <ShedModal   animal={animal} onSave={(p) => doQuickAction("shed",   p)} onClose={() => setModal(null)} />}
      {animal && modal === "note"   && <NoteModal   animal={animal} onSave={(p) => doQuickAction("note",   p)} onClose={() => setModal(null)} />}

      <nav className="mbl-bottom-nav">
        {navTabs.map(({ key, label, icon }) => (
          <button key={key} type="button"
            className={`mbl-nav-btn ${tab === key ? "is-active" : ""}`}
            onClick={() => switchTab(key)}>
            <span className="mbl-nav-icon">{icon}</span>
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

// ג”€ג”€ג”€ ROOT ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€
const AUTH_SESSION_KEY = "breedingPlannerBreederAuthSession";

const loadSession = () => {
  try {
    if (!hasStoredAuthSession("breeder")) return null;
    const raw = localStorage.getItem(AUTH_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.isAuthenticated ? (parsed.profile || {}) : null;
  } catch {
    return null;
  }
};

export default function MobileApp() {
  const [user, setUser]   = useState(() => loadSession());
  const [mode, setMode]   = useState(null); // null = select screen
  const deviceId = useMemo(getDeviceId, []);

  const handleLogin = useCallback((backendUser) => {
    const profile = {
      id:          backendUser?.id          || "",
      fullName:    backendUser?.fullName    || "",
      displayName: backendUser?.displayName || backendUser?.fullName || "",
      email:       backendUser?.email       || "",
      role:        backendUser?.role        || "",
    };
    setUser(profile);
    setMode(null);
  }, []);

  const handleSignOut = useCallback(() => {
    clearAuthToken("breeder");
    try { localStorage.removeItem(AUTH_SESSION_KEY); } catch {}
    setUser(null);
    setMode(null);
  }, []);

  const handleMode = useCallback((chosen) => {
    setMode(chosen);
    try { localStorage.setItem(MODE_KEY, chosen); } catch {}
  }, []);

  const handleSwitchMode = useCallback(() => setMode(null), []);

  if (!user) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  if (!mode) {
    return <ModeSelectScreen user={user} onMode={handleMode} onSignOut={handleSignOut} />;
  }

  if (mode === "terminal") {
    return <TerminalMode onSwitchMode={handleSwitchMode} onSignOut={handleSignOut} deviceId={deviceId} />;
  }

  return <FullMode onSwitchMode={handleSwitchMode} onSignOut={handleSignOut} deviceId={deviceId} user={user} />;
}
