import { prisma } from "../lib/prisma";
import { HttpError } from "../utils/errors";
import type { AuthenticatedUser } from "../types/auth";
import { canAccessFeature } from "./subscriptionService";

const db = prisma as any;

const MOBILE_FEATURES = [
  "mobile.scan",
  "mobile.profile",
  "mobile.quick_feed",
  "mobile.quick_weight",
  "mobile.quick_shed",
  "mobile.quick_clean",
  "mobile.quick_water",
  "mobile.notes",
  "mobile.photos",
  "mobile.tasks",
  "mobile.rack_mode",
  "mobile.communication",
  "mobile.lab",
  "mobile.sales",
  "mobile.offline_sync",
  "marketplace.create_listing",
  "communication.telegram",
  "lab.orders",
  "sales.for_sale",
];

const ACTION_FEATURES: Record<string, string> = {
  feed: "mobile.quick_feed",
  weight: "mobile.quick_weight",
  shed: "mobile.quick_shed",
  clean: "mobile.quick_clean",
  water: "mobile.quick_water",
  note: "mobile.notes",
  health: "animals.health_logs",
  photo: "mobile.photos",
  lab: "mobile.lab",
  pairing: "breeding.pairings",
  sale: "mobile.sales",
};

const text = (value: unknown, max = 2000): string => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

const asRecord = (value: unknown): Record<string, any> => (
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {}
);

const parseQrCode = (rawValue: unknown): string => {
  const raw = text(rawValue, 2000);
  if (!raw) throw new HttpError(400, "QR code is required.");
  try {
    const parsed = JSON.parse(raw);
    const fromJson = text(parsed?.animalId || parsed?.appAnimalId || parsed?.id || parsed?.snakeId || parsed?.t, 200);
    if (fromJson) return fromJson;
  } catch {
    // Plain QR strings are valid.
  }
  try {
    const url = new URL(raw);
    const hash = url.hash.replace(/^#/, "");
    const hashParams = new URLSearchParams(hash.includes("?") ? hash.split("?")[1] : hash);
    const queryParams = url.searchParams;
    const fromUrl = text(queryParams.get("animal") || queryParams.get("snake") || queryParams.get("id") || hashParams.get("snake") || hashParams.get("animal"), 200);
    if (fromUrl) return fromUrl;
    const hashSnake = hash.match(/(?:^|\/|=)(snake|animal)[=/]([^/?#&]+)/i);
    if (hashSnake?.[2]) return decodeURIComponent(hashSnake[2]);
  } catch {
    // Not a URL.
  }
  const hashMatch = raw.match(/[#?&](?:snake|animal|id)=([^&]+)/i);
  if (hashMatch?.[1]) return decodeURIComponent(hashMatch[1]);
  return raw.replace(/^snake[:=/]/i, "").replace(/^animal[:=/]/i, "").trim();
};

const normalizeAnimal = (row: any) => {
  const payload = asRecord(row?.payload);
  const logs = asRecord(payload.logs);
  const location = asRecord(payload.location);
  const photos = Array.isArray(payload.photos) ? payload.photos : [];
  const imageUrl = text(payload.imageUrl || payload.photoUrl || photos[photos.length - 1]?.url, 3000);
  const morphs = Array.isArray(payload.morphs) ? payload.morphs : [];
  const hets = Array.isArray(payload.hets) ? payload.hets : [];
  return {
    id: row.id,
    appAnimalId: row.appAnimalId,
    name: payload.name || row.name || row.appAnimalId,
    sex: payload.sex || row.sex || "",
    genetics: payload.genetics || [...morphs, ...hets.map((item: string) => `het ${item}`)].filter(Boolean).join(", "),
    status: payload.status || row.status || "",
    imageUrl,
    weight: payload.weight || "",
    room: payload.room || location.room || "",
    rack: payload.rack || location.rack || "",
    tub: payload.tub || location.tub || payload.tubNumber || "",
    tags: Array.isArray(payload.tags) ? payload.tags : [],
    badges: [
      payload.feedingStatus || "",
      payload.shedStatus || "",
      payload.paired ? "paired" : "",
      payload.gravid ? "gravid" : "",
      payload.forSale || payload.marketplacePublished ? "for sale" : "",
      payload.quarantine ? "quarantine" : "",
      payload.healthAlert ? "health alert" : "",
    ].filter(Boolean),
    logs: {
      feeds: Array.isArray(logs.feeds) ? logs.feeds : [],
      weights: Array.isArray(logs.weights) ? logs.weights : [],
      sheds: Array.isArray(logs.sheds) ? logs.sheds : [],
      cleanings: Array.isArray(logs.cleanings) ? logs.cleanings : [],
      water: Array.isArray(logs.water) ? logs.water : [],
      notes: Array.isArray(logs.notes) ? logs.notes : [],
      health: Array.isArray(logs.health) ? logs.health : [],
    },
    breeding: {
      pairingStatus: payload.pairingStatus || "",
      currentPairing: payload.currentPairing || "",
      clutchId: payload.clutchId || "",
    },
    lab: {
      orderStatus: payload.labStatus || "",
      latestResult: payload.labResult || "",
      certificateUrl: payload.labCertificateUrl || "",
    },
    sales: {
      listingStatus: payload.marketplacePublished ? "published" : payload.saleStatus || "",
      price: payload.price || payload.salePrice || "",
      buyer: payload.buyerName || "",
      reservation: payload.reservationStatus || "",
    },
    updatedAt: row.updatedAt,
  };
};

const findAnimalByQr = async (userId: string, qrCode: string) => {
  const appAnimalId = parseQrCode(qrCode);
  const row = await db.animal.findFirst({
    where: {
      ownerId: userId,
      OR: [
        { appAnimalId },
        { id: appAnimalId },
        { name: { equals: appAnimalId, mode: "insensitive" } },
      ],
    },
  });
  if (!row) throw new HttpError(404, "No animal was found for this QR code.");
  return row;
};

const recentEntry = (items: any[], field = "date") => {
  const item = [...items].sort((a, b) => String(b?.[field] || b?.createdAt || "").localeCompare(String(a?.[field] || a?.createdAt || "")))[0];
  return item || null;
};

const daysSince = (value: unknown): number | null => {
  const raw = text(value, 80);
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return Math.floor((Date.now() - date.getTime()) / 86_400_000);
};

const ensureAccess = async (actor: AuthenticatedUser, featureKey: string) => {
  const access = await canAccessFeature(actor, featureKey);
  if (!access.allowed) throw new HttpError(403, access.reason || "Feature access denied.");
  return access;
};

const updateDeviceSession = async (actor: AuthenticatedUser, payload: Record<string, unknown>) => {
  const deviceId = text(payload.deviceId, 160);
  if (!deviceId || !db.userDeviceSession) return null;
  return db.userDeviceSession.upsert({
    where: { userId_deviceId: { userId: actor.id, deviceId } },
    update: {
      deviceName: text(payload.deviceName, 160) || null,
      platform: text(payload.platform, 80) || null,
      pushToken: text(payload.pushToken, 2000) || null,
      lastSeenAt: new Date(),
    },
    create: {
      userId: actor.id,
      deviceId,
      deviceName: text(payload.deviceName, 160) || null,
      platform: text(payload.platform, 80) || null,
      pushToken: text(payload.pushToken, 2000) || null,
      lastSeenAt: new Date(),
    },
  });
};

export const getMobilePermissions = async (actor: AuthenticatedUser, payload: Record<string, unknown> = {}) => {
  await updateDeviceSession(actor, payload);
  const entries = await Promise.all(MOBILE_FEATURES.map(async (featureKey) => ({
    featureKey,
    access: await canAccessFeature(actor, featureKey),
  })));
  const scanAccess = entries.find((entry) => entry.featureKey === "mobile.scan")?.access;
  const currentAccess = entries.find((entry) => entry.access.currentTier)?.access;
  return {
    plan: scanAccess?.tier || currentAccess?.currentTier || "Current plan",
    permissions: Object.fromEntries(entries.map((entry) => [entry.featureKey, entry.access])),
  };
};

export const scanMobileQr = async (actor: AuthenticatedUser, qrCode: string, metadata: Record<string, unknown> = {}) => {
  await ensureAccess(actor, "mobile.scan");
  const animal = await findAnimalByQr(actor.id, qrCode);
  await db.mobileScanLog?.create({
    data: {
      userId: actor.id,
      animalId: animal.id,
      qrCode,
      targetType: "animal",
      resultStatus: "opened",
      metadataJson: metadata,
    },
  });
  return { targetType: "animal", animal: normalizeAnimal(animal) };
};

export const getMobileAnimal = async (actor: AuthenticatedUser, qrCode: string) => {
  await ensureAccess(actor, "mobile.profile");
  const animal = await findAnimalByQr(actor.id, qrCode);
  return { animal: normalizeAnimal(animal) };
};

const appendAnimalLog = async (actor: AuthenticatedUser, actionType: string, payload: Record<string, unknown>) => {
  await ensureAccess(actor, ACTION_FEATURES[actionType] || "mobile.profile");
  const animalId = text(payload.animalId || payload.appAnimalId || payload.qrCode, 240);
  const animal = await findAnimalByQr(actor.id, animalId);
  const animalPayload = { ...asRecord(animal.payload) };
  const logs = { ...asRecord(animalPayload.logs) };
  const now = new Date().toISOString();
  const entry = { ...payload, id: `mobile-${actionType}-${Date.now()}`, actionType, createdAt: now, date: text(payload.date, 80) || now.slice(0, 10) };
  const logKey = actionType === "feed" ? "feeds" : actionType === "weight" ? "weights" : actionType === "shed" ? "sheds" : actionType === "clean" ? "cleanings" : actionType === "water" ? "water" : actionType === "note" ? "notes" : actionType;
  logs[logKey] = [entry, ...(Array.isArray(logs[logKey]) ? logs[logKey] : [])].slice(0, 500);
  if (actionType === "weight") animalPayload.weight = Number(payload.grams || payload.weight || payload.weightGrams || 0) || animalPayload.weight;
  if (actionType === "feed") animalPayload.feedingStatus = payload.result === "refused" ? "refused" : "fed";
  if (actionType === "shed") animalPayload.shedStatus = payload.result === "bad" ? "bad shed" : "shed complete";
  animalPayload.logs = logs;
  const updated = await db.animal.update({
    where: { id: animal.id },
    data: {
      payload: animalPayload,
      name: text(animalPayload.name, 200) || animal.name,
      sex: text(animalPayload.sex, 40) || animal.sex,
      status: text(animalPayload.status, 80) || animal.status,
    },
  });
  return { animal: normalizeAnimal(updated), log: entry };
};

export const logMobileAction = appendAnimalLog;

export const getTodayMobileTasks = async (actor: AuthenticatedUser) => {
  await ensureAccess(actor, "mobile.tasks");
  const rows = await db.animal.findMany({ where: { ownerId: actor.id }, orderBy: { updatedAt: "desc" }, take: 200 });
  const tasks: any[] = [];
  for (const row of rows) {
    const animal = normalizeAnimal(row);
    const lastFeed = recentEntry(animal.logs.feeds);
    const lastWater = recentEntry(animal.logs.water);
    const lastClean = recentEntry(animal.logs.cleanings);
    const lastShed = recentEntry(animal.logs.sheds);
    const feedDays = daysSince(lastFeed?.date || lastFeed?.createdAt);
    const waterDays = daysSince(lastWater?.date || lastWater?.createdAt);
    const cleanDays = daysSince(lastClean?.date || lastClean?.createdAt);
    const shedDays = daysSince(lastShed?.date || lastShed?.createdAt);
    const base = { animalId: animal.appAnimalId, name: animal.name, location: [animal.room, animal.rack, animal.tub].filter(Boolean).join(" / ") };
    if (feedDays === null || feedDays >= 7) tasks.push({ ...base, id: `feed-${animal.appAnimalId}`, type: "Feed", dueStatus: feedDays === null ? "no record" : `${feedDays} days` });
    if (waterDays === null || waterDays >= 3) tasks.push({ ...base, id: `water-${animal.appAnimalId}`, type: "Water", dueStatus: waterDays === null ? "no record" : `${waterDays} days` });
    if (cleanDays === null || cleanDays >= 14) tasks.push({ ...base, id: `clean-${animal.appAnimalId}`, type: "Clean", dueStatus: cleanDays === null ? "no record" : `${cleanDays} days` });
    if (shedDays !== null && shedDays >= 35) tasks.push({ ...base, id: `shed-${animal.appAnimalId}`, type: "Shed check", dueStatus: `${shedDays} days` });
    if (animal.badges.includes("health alert")) tasks.unshift({ ...base, id: `health-${animal.appAnimalId}`, type: "Health alert", dueStatus: "now" });
  }
  return { tasks: tasks.slice(0, 80) };
};

export const getRackMode = async (actor: AuthenticatedUser) => {
  await ensureAccess(actor, "mobile.rack_mode");
  const rows = await db.animal.findMany({ where: { ownerId: actor.id }, orderBy: [{ appAnimalId: "asc" }] });
  const animals = rows.map(normalizeAnimal);
  const rooms = new Map<string, Map<string, any[]>>();
  for (const animal of animals) {
    const room = animal.room || "Unassigned room";
    const rack = animal.rack || "Unassigned rack";
    if (!rooms.has(room)) rooms.set(room, new Map());
    if (!rooms.get(room)!.has(rack)) rooms.get(room)!.set(rack, []);
    rooms.get(room)!.get(rack)!.push(animal);
  }
  return {
    rooms: Array.from(rooms.entries()).map(([roomName, racks]) => ({
      roomName,
      racks: Array.from(racks.entries()).map(([rackName, rackAnimals]) => ({
        rackName,
        tubs: rackAnimals.map((animal) => ({
          tub: animal.tub || animal.appAnimalId,
          animalId: animal.appAnimalId,
          name: animal.name,
          occupied: true,
          alert: animal.badges.includes("health alert"),
          feedingDue: !recentEntry(animal.logs.feeds) || (daysSince(recentEntry(animal.logs.feeds)?.date) || 0) >= 7,
          cleaningDue: !recentEntry(animal.logs.cleanings) || (daysSince(recentEntry(animal.logs.cleanings)?.date) || 0) >= 14,
          shed: animal.badges.includes("shedding"),
          paired: animal.badges.includes("paired"),
        })),
      })),
    })),
  };
};

export const getMobileCommunication = async (actor: AuthenticatedUser) => {
  await ensureAccess(actor, "mobile.communication");
  const notifications = await db.notification.findMany({ where: { recipientId: actor.id }, orderBy: { createdAt: "desc" }, take: 30 }).catch(() => []);
  return {
    telegram: { connected: false, status: "Not connected" },
    pendingConfirmations: notifications.filter((item: any) => /confirm|telegram|command/i.test(`${item.type} ${item.title}`)).map((item: any) => ({
      id: item.id,
      originalMessage: item.message,
      interpretedAction: item.title,
      targetAnimal: asRecord(item.metadata).animalId || "",
      status: item.readAt ? "read" : "pending",
    })),
    activity: notifications.map((item: any) => ({ id: item.id, title: item.title, message: item.message, createdAt: item.createdAt, readAt: item.readAt })),
  };
};

export const syncMobileQueue = async (actor: AuthenticatedUser, payload: Record<string, unknown>) => {
  await ensureAccess(actor, "mobile.offline_sync");
  await updateDeviceSession(actor, payload);
  const actions = Array.isArray(payload.actions) ? payload.actions : [];
  const results = [];
  for (const action of actions) {
    const record = asRecord(action);
    const actionType = text(record.actionType || record.type, 80);
    const queue = await db.mobileSyncQueue?.create({
      data: {
        userId: actor.id,
        deviceId: text(payload.deviceId || record.deviceId, 160) || null,
        actionType,
        payloadJson: record,
        status: "queued",
      },
    });
    try {
      const applied = await appendAnimalLog(actor, actionType, asRecord(record.payload || record));
      if (queue) await db.mobileSyncQueue.update({ where: { id: queue.id }, data: { status: "processed", processedAt: new Date() } });
      results.push({ id: record.id || queue?.id, status: "processed", animal: applied.animal });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Sync action failed.";
      if (queue) await db.mobileSyncQueue.update({ where: { id: queue.id }, data: { status: "failed", errorMessage: message } });
      results.push({ id: record.id || queue?.id, status: "failed", message });
    }
  }
  return { processed: results.length, results };
};
