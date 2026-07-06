import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppearance } from "../../contexts/AppearanceContext.jsx";
import jsQR from "jsqr";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import SuggestionsTab from "../suggestions/SuggestionsTab";
import ShedTestTerminalPanel from "../lab/components/ShedTestTerminalPanel.jsx";
import BreederOrderGeneticTestModal from "../lab/components/BreederOrderGeneticTestModal.jsx";
import {
  clearAuthToken,
  fetchBreederSnapshot,
  fetchMobileAnimal,
  fetchMobileCommunication,
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
  scanMobileQr,
  syncMobileQueue,
} from "../../shared/apiClient";

// ג”€ג”€ג”€ Storage helpers ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€
const DEVICE_KEY    = "breedingPlannerMobileDeviceId";
const RECENT_KEY    = "breedingPlannerMobileRecentAnimals";
const QUEUE_KEY     = "breedingPlannerMobileSyncQueue";
const MODE_KEY      = "breedingPlannerMobileLastMode"; // terminal | full
const ANIMALS_CACHE = "breedingPlannerMobileAnimalsCache";
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

// ג”€ג”€ג”€ Tiny utilities ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€
const cap = (s) => String(s || "").replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const fmtSyncTime = (iso) => {
  if (!iso) return "Never";
  try {
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    if (diff < 60000) return "Just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    if (diff < 86400000) return `Today at ${time}`;
    return `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })} at ${time}`;
  } catch { return "Unknown"; }
};
const first = (arr) => (Array.isArray(arr) && arr.length ? arr[0] : null);
const locationText = (a) => [a?.room, a?.rack, a?.tub].filter(Boolean).join(" / ") || "";
const logoSrc = `${process.env.PUBLIC_URL || ""}/app-icons/icon_512x512.png`;

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
});

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
  return <div className="mbl-spinner" aria-label="Loading" />;
}

function OfflineBanner({ online, queued, onSync }) {
  if (online && !queued) return null;
  return (
    <div className={`mbl-offline-bar ${online ? "" : "is-offline"}`}>
      <span>{online ? `${queued} update${queued === 1 ? "" : "s"} pending sync` : "Offline"}</span>
      {online && queued > 0 && (
        <button type="button" onClick={onSync}>Sync now</button>
      )}
    </div>
  );
}

function ActionSheet({ title, onClose, children }) {
  return (
    <div className="mbl-sheet-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="mbl-sheet">
        <div className="mbl-sheet-handle" />
        <div className="mbl-sheet-head">
          <h2>{title}</h2>
          <button type="button" className="mbl-icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="mbl-sheet-body">{children}</div>
      </div>
    </div>
  );
}

// ג”€ג”€ג”€ LOGIN SCREEN ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€
function LoginScreen({ onLogin }) {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!email.trim() || !password.trim()) { setError("Enter email and password."); return; }
    setBusy(true);
    try {
      const result = await loginApi({ email: email.trim().toLowerCase(), password });
      onLogin(result?.user || {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed. Check your credentials.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mbl-login-shell">
      <div className="mbl-login-card">
        <img src={logoSrc} alt="Breeding Planner" className="mbl-login-logo" />
        <h1 className="mbl-login-title">Breeding Planner</h1>
        <p className="mbl-login-sub">Sign in to sync with your desktop account</p>
        <form className="mbl-login-form" onSubmit={submit}>
          <label className="mbl-field">
            <span>Email</span>
            <input
              type="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              disabled={busy}
            />
          </label>
          <label className="mbl-field">
            <span>Password</span>
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
          <button type="submit" className="mbl-btn mbl-btn--primary mbl-btn--wide" disabled={busy}>
            {busy ? <Spinner /> : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ג”€ג”€ג”€ MODE SELECT SCREEN ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€
function ModeSelectScreen({ user, onMode, onSignOut }) {
  const displayName = user?.fullName || user?.displayName || user?.email || "Keeper";
  return (
    <div className="mbl-mode-shell">
      <div className="mbl-mode-header">
        <img src={logoSrc} alt="" className="mbl-mode-logo" />
        <p className="mbl-mode-greeting">Hi, {displayName}</p>
        <button type="button" className="mbl-text-btn mbl-mode-signout" onClick={onSignOut}>
          Sign out
        </button>
      </div>

      <div className="mbl-mode-cards">
        <button
          type="button"
          className="mbl-mode-card mbl-mode-card--terminal"
          onClick={() => onMode("terminal")}
        >
          <span className="mbl-mode-icon">⬛</span>
          <strong>Terminal</strong>
          <span>Scan a QR code to instantly open and update any snake card. Fast rack workflow.</span>
        </button>

        <button
          type="button"
          className="mbl-mode-card mbl-mode-card--full"
          onClick={() => onMode("full")}
        >
          <span className="mbl-mode-icon">≡</span>
          <strong>Full Access</strong>
          <span>Animals, pairings, tasks, rack mode and more — full desktop features on mobile.</span>
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

  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) { onError("Camera not available."); return; }
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
      .catch(() => onError("Camera access denied. Use manual entry below."));

    return () => {
      activeRef.current = false;
      clearTimeout(timer);
      cancelAnimationFrame(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onScan, onError]);

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

  const set = (field) => (e) => setDraft((prev) => ({ ...prev, [field]: e.target.value }));

  const fields = [
    { key: "name",            label: "Name",             type: "text" },
    { key: "sex",             label: "Sex",              type: "select", opts: ["", "Male", "Female", "Unknown"] },
    { key: "genetics",        label: "Genetics / Morph", type: "text" },
    { key: "status",          label: "Status",           type: "select", opts: ["", "Active", "For Sale", "Sold", "Deceased", "Quarantine"] },
    { key: "species",         label: "Species",          type: "text" },
    { key: "dob",             label: "Date of birth",    type: "date" },
    { key: "weight",          label: "Weight (g)",       type: "number" },
    { key: "acquisitionDate", label: "Acquired",         type: "date" },
    { key: "price",           label: "Price",            type: "text" },
    { key: "room",            label: "Room",             type: "text" },
    { key: "rack",            label: "Rack",             type: "text" },
    { key: "tub",             label: "Tub / Enclosure",  type: "text" },
    { key: "notes",           label: "Notes",            type: "textarea" },
  ];

  return (
    <form className="mbl-edit-form" onSubmit={(e) => { e.preventDefault(); onSave(draft); }}>
      {fields.map(({ key, label, type, opts }) => (
        <label key={key} className="mbl-field">
          <span>{label}</span>
          {type === "select" ? (
            <select value={draft[key]} onChange={set(key)}>
              {opts.map((o) => <option key={o} value={o}>{o || "— not set —"}</option>)}
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
        <button type="button" className="mbl-btn" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="submit" className="mbl-btn mbl-btn--primary" disabled={busy}>
          {busy ? <Spinner /> : "Save changes"}
        </button>
      </div>
    </form>
  );
}

// ג”€ג”€ג”€ QUICK ACTION MODALS ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€
function FeedModal({ animal, onSave, onClose }) {
  const [food, setFood]     = useState("Rat pup");
  const [result, setResult] = useState("ate");
  return (
    <ActionSheet title="Feed" onClose={onClose}>
      <label className="mbl-field"><span>Food</span>
        <input value={food} onChange={(e) => setFood(e.target.value)} />
      </label>
      <div className="mbl-seg">
        {["ate", "refused"].map((v) => (
          <button key={v} type="button" className={result === v ? "is-active" : ""}
            onClick={() => setResult(v)}>{cap(v)}</button>
        ))}
      </div>
      <button type="button" className="mbl-btn mbl-btn--primary mbl-btn--wide"
        onClick={() => onSave({ animalId: animal.appAnimalId, food, result })}>
        Save feed
      </button>
    </ActionSheet>
  );
}

function WeightModal({ animal, onSave, onClose }) {
  const [grams, setGrams] = useState(animal?.weight || "");
  return (
    <ActionSheet title="Weight" onClose={onClose}>
      <label className="mbl-field"><span>Grams</span>
        <input type="number" inputMode="numeric" value={grams}
          onChange={(e) => setGrams(e.target.value)} />
      </label>
      <button type="button" className="mbl-btn mbl-btn--primary mbl-btn--wide"
        onClick={() => onSave({ animalId: animal.appAnimalId, grams })}>
        Save weight
      </button>
    </ActionSheet>
  );
}

function ShedModal({ animal, onSave, onClose }) {
  const [result, setResult] = useState("complete");
  return (
    <ActionSheet title="Shed" onClose={onClose}>
      <div className="mbl-seg">
        {["complete", "bad"].map((v) => (
          <button key={v} type="button" className={result === v ? "is-active" : ""}
            onClick={() => setResult(v)}>{v === "bad" ? "Bad shed" : "Complete"}</button>
        ))}
      </div>
      <button type="button" className="mbl-btn mbl-btn--primary mbl-btn--wide"
        onClick={() => onSave({ animalId: animal.appAnimalId, result })}>
        Save shed
      </button>
    </ActionSheet>
  );
}

function NoteModal({ animal, onSave, onClose }) {
  const [note, setNote] = useState("");
  const startVoice = () => {
    const R = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!R) return;
    const r = new R();
    r.onresult = (e) => setNote((p) => `${p} ${e.results?.[0]?.[0]?.transcript || ""}`.trim());
    r.start();
  };
  return (
    <ActionSheet title="Note" onClose={onClose}>
      <textarea className="mbl-note-area" rows={5} value={note}
        onChange={(e) => setNote(e.target.value)} placeholder="Type or use voice…" />
      <div className="mbl-edit-actions">
        <button type="button" className="mbl-btn" onClick={startVoice}>🎤 Voice</button>
        <button type="button" className="mbl-btn mbl-btn--primary"
          onClick={() => onSave({ animalId: animal.appAnimalId, note })}>
          Save note
        </button>
      </div>
    </ActionSheet>
  );
}

// ג”€ג”€ג”€ PHOTO MODAL ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€
function PhotoModal({ animal, onTakePhoto, onSetIcon, onDeletePhoto, onClose, busy }) {
  const photos = Array.isArray(animal?.photos) ? [...animal.photos].reverse() : [];
  const currentIcon = animal?.imageUrl;
  return (
    <ActionSheet title="Photos" onClose={onClose}>
      <button type="button" className="mbl-btn mbl-btn--primary mbl-btn--wide" onClick={onTakePhoto} disabled={busy}>
        {busy ? <Spinner /> : "📷 Take Photo"}
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
                  {currentIcon === photo.url ? "✓ Icon" : "Set as icon"}
                </button>
                <button type="button" className="mbl-btn mbl-btn--sm mbl-btn--danger"
                  onClick={() => onDeletePhoto(photo.id)} disabled={busy}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mbl-empty">No photos yet. Tap above to take one.</p>
      )}
    </ActionSheet>
  );
}

// ג”€ג”€ג”€ ANIMAL CARD ROW (shared between flat list and groups view) ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€
function AnimalCardRow({ animal, onOpen }) {
  const statusKey = (animal.status || "").toLowerCase().replace(/\s+/g, "-");
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
          <strong className="mbl-animal-card-name">{animal.name || animal.id}</strong>
          {animal.status && <span className={`mbl-status-badge mbl-status--${statusKey}`}>{animal.status}</span>}
        </div>
        {animal.genetics && <div className="mbl-animal-card-genetics">{animal.genetics}</div>}
        <div className="mbl-animal-card-row3">
          {animal.sex && <span className="mbl-sex-badge">{animal.sex}</span>}
          {locationText(animal) && <span className="mbl-animal-card-loc">📍 {locationText(animal)}</span>}
        </div>
      </div>
      <span className="mbl-animal-card-chevron">›</span>
    </button>
  );
}

// ג”€ג”€ג”€ FULL SCREEN PANEL (Breeding Advisor / Shed Test Terminal) ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€
function FullScreenPanel({ title, onClose, children }) {
  return (
    <section className="mbl-profile">
      <div className="mbl-profile-topbar">
        <button type="button" className="mbl-back-btn" onClick={onClose}>← Back</button>
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
    return new Date(`${ds}T12:00:00`).toLocaleDateString(undefined, {
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

  const STAGE_LABELS = {
    ovulation: "Ovulation", preLayShed: "Pre-lay Shed",
    clutch: "Lay / Clutch", hatch: "Hatch",
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
        <span>Date observed</span>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      {stageKey === "clutch" && (
        <>
          <label className="mbl-field">
            <span>Total eggs</span>
            <input type="number" inputMode="numeric" value={eggsTotal}
              onChange={(e) => setEggsTotal(e.target.value)} placeholder="—" />
          </label>
          <label className="mbl-field">
            <span>Fertile eggs</span>
            <input type="number" inputMode="numeric" value={fertileEggs}
              onChange={(e) => setFertileEggs(e.target.value)} placeholder="—" />
          </label>
          <label className="mbl-field">
            <span>Slugs</span>
            <input type="number" inputMode="numeric" value={slugs}
              onChange={(e) => setSlugs(e.target.value)} placeholder="—" />
          </label>
        </>
      )}
      {stageKey === "hatch" && (
        <label className="mbl-field">
          <span>Hatchlings</span>
          <input type="number" inputMode="numeric" value={hatchedCount}
            onChange={(e) => setHatchedCount(e.target.value)} placeholder="—" />
        </label>
      )}
      <label className="mbl-field">
        <span>Notes</span>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
      </label>
      <div className="mbl-edit-actions">
        <button type="button" className="mbl-btn" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="button" className="mbl-btn mbl-btn--primary"
          onClick={save} disabled={busy || !date}>
          {busy ? <Spinner /> : `Log ${STAGE_LABELS[stageKey]}`}
        </button>
      </div>
    </div>
  );
}

// ג”€ג”€ג”€ PAIRING SECTION (one pairing, all 4 stages) ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€
function PairingSection({ pairing, isFemale, partnerName, onSavePairing }) {
  const [openStage, setOpenStage] = useState(null);
  const [saving, setSaving]       = useState(false);

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
  const ovCd = latestOv?.date ? `Expected pre-lay shed: ${fmtDate(addDays(latestOv.date, 14))} – ${fmtDate(addDays(latestOv.date, 28))}` : null;
  const plCd = latestPl?.date ? `Expected lay: ${fmtDate(addDays(latestPl.date, 14))} – ${fmtDate(addDays(latestPl.date, 28))}` : null;
  const clCd = latestCl?.date ? `Expected hatch: ${fmtDate(addDays(latestCl.date, 55))} – ${fmtDate(addDays(latestCl.date, 65))}` : null;

  const stages = [
    { key: "ovulation",  label: "Ovulation",    logs: ovLogs, latest: latestOv, countdown: ovCd },
    { key: "preLayShed", label: "Pre-lay Shed",  logs: plLogs, latest: latestPl, countdown: plCd },
    { key: "clutch",     label: "Lay / Clutch",  logs: clLogs, latest: latestCl, countdown: clCd },
    { key: "hatch",      label: "Hatch",          logs: haLogs, latest: latestHa, countdown: null },
  ];

  const statusCls = `mbl-bp-status--${(pairing.status || "unknown").toLowerCase().replace(/\s+/g, "-")}`;

  return (
    <div className="mbl-bp-card">
      <div className="mbl-bp-header">
        <div>
          <strong>{pairing.label || `Pairing ${(pairing.id || "").slice(-6)}`}</strong>
          <small className="mbl-bp-meta">
            {isFemale ? "Female" : "Male"} · Partner: {partnerName}
          </small>
        </div>
        <span className={`mbl-bp-status ${statusCls}`}>{pairing.status || "Unknown"}</span>
      </div>

      <div className="mbl-bp-stages">
        {stages.map(({ key, label, logs, latest, countdown }) => (
          <div key={key} className="mbl-cs">
            <button type="button" className="mbl-cs-header" onClick={() => toggle(key)}>
              <div className="mbl-cs-title">
                <strong>{label}</strong>
                {latest
                  ? <span className="mbl-cs-latest">{fmtDate(latest.date)}</span>
                  : <span className="mbl-cs-none">Not logged</span>}
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
                    <div className="mbl-cs-history-label">History</div>
                    {logs.map((entry, i) => (
                      <div key={entry.id || `${key}-${i}`}
                        className={`mbl-cs-entry ${i === 0 ? "is-latest" : ""}`}>
                        <div className="mbl-cs-entry-row">
                          <span className="mbl-cs-entry-date">{fmtDate(entry.date)}</span>
                          {i === 0 && <span className="mbl-cs-tag">Latest</span>}
                        </div>
                        {(entry.eggsTotal || entry.fertileEggs || entry.slugs) && (
                          <div className="mbl-cs-entry-detail">
                            {entry.eggsTotal   && <span>{entry.eggsTotal} eggs</span>}
                            {entry.fertileEggs && <span>{entry.fertileEggs} fertile</span>}
                            {entry.slugs       && <span>{entry.slugs} slugs</span>}
                          </div>
                        )}
                        {entry.hatchedCount > 0 && (
                          <div className="mbl-cs-entry-detail">
                            <span>{entry.hatchedCount} hatchlings</span>
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
function BreedingPanel({ animal, pairings, allAnimals, onSavePairing }) {
  const animalId = animal?.id || animal?.appAnimalId;
  const related  = useMemo(
    () => (pairings || []).filter((p) => p.femaleId === animalId || p.maleId === animalId),
    [pairings, animalId]
  );
  const animalMap = useMemo(
    () => new Map((allAnimals || []).map((a) => [a.id, a])),
    [allAnimals]
  );

  if (!related.length) {
    return <p className="mbl-empty">No pairings found for this animal.</p>;
  }

  return (
    <div className="mbl-breeding-list">
      {related.map((pairing) => {
        const isFemale    = pairing.femaleId === animalId;
        const partnerId   = isFemale ? pairing.maleId : pairing.femaleId;
        const partnerName = animalMap.get(partnerId)?.name || partnerId || "Unknown";
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

function AnimalProfile({ animal, permissions, pairings, allAnimals, onQuickAction, onTakePhoto, onSetIcon, onDeletePhoto, onSavePairing, onBack }) {
  const [subtab, setSubtab]         = useState("overview");
  const [photoBusy, setPhotoBusy]   = useState(false);
  const [orderTestOpen, setOrderTestOpen] = useState(false);
  const logs = animal?.logs || {};
  const latestFeed   = first(logs.feeds);
  const latestWeight = first(logs.weights);
  const latestShed   = first(logs.sheds);

  const handleTakePhoto = async () => {
    setPhotoBusy(true);
    try { await onTakePhoto(); } finally { setPhotoBusy(false); }
  };

  const quickActions = [
    { label: "Feed",       icon: "🍗", action: "feed"       },
    { label: "Weight",     icon: "⚖", action: "weight"     },
    { label: "Shed",       icon: "🐍", action: "shed"       },
    { label: "Clean",      icon: "🧹", action: "clean"      },
    { label: "Water",      icon: "💧", action: "water"      },
    { label: "Note",       icon: "📝", action: "note"       },
    { label: "Photo",      icon: "📷", action: "photo"      },
    { label: "Order Test", icon: "🧬", action: "order-test" },
  ];

  const statusColor = STATUS_COLORS[(animal?.status || "").toLowerCase()] || "gray";

  return (
    <section className="mbl-profile">
      <div className="mbl-profile-topbar">
        <button type="button" className="mbl-back-btn" onClick={onBack}>← Back</button>
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
          {animal.genetics && <p className="mbl-profile-genetics">{animal.genetics}</p>}
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
        {["overview", "logs", "photos", "breeding"].map((t) => (
          <button key={t} type="button" className={subtab === t ? "is-active" : ""} onClick={() => setSubtab(t)}>
            {cap(t)}
          </button>
        ))}
      </div>

      {subtab === "overview" && (
        <div className="mbl-overview-section">
          <div className="mbl-data-grid">
            <div className="mbl-data-card">
              <span>Last feed</span>
              <strong>{latestFeed ? `${latestFeed.result || "fed"} · ${latestFeed.food || ""}` : "—"}</strong>
            </div>
            <div className="mbl-data-card">
              <span>Weight</span>
              <strong>{latestWeight ? `${latestWeight.grams ?? animal.weight} g` : `${animal.weight || "—"} g`}</strong>
            </div>
            <div className="mbl-data-card">
              <span>Last shed</span>
              <strong>{latestShed ? latestShed.result || latestShed.date : "—"}</strong>
            </div>
            <div className="mbl-data-card">
              <span>Breeding</span>
              <strong>{animal.breeding?.pairingStatus || "No pairing"}</strong>
            </div>
          </div>
          <div className="mbl-info-list">
            {animal.species         && <div className="mbl-info-row"><span>Species</span><strong>{animal.species}</strong></div>}
            {animal.dob             && <div className="mbl-info-row"><span>Date of birth</span><strong>{fmtDate(animal.dob)}</strong></div>}
            {animal.acquisitionDate && <div className="mbl-info-row"><span>Acquired</span><strong>{fmtDate(animal.acquisitionDate)}</strong></div>}
            {animal.price           && <div className="mbl-info-row"><span>Price</span><strong>{animal.price}</strong></div>}
            {animal.lab?.orderStatus && <div className="mbl-info-row"><span>Lab order</span><strong>{animal.lab.orderStatus}</strong></div>}
            {animal.notes           && <div className="mbl-info-row mbl-info-row--full"><span>Notes</span><p>{animal.notes}</p></div>}
          </div>
        </div>
      )}

      {subtab === "logs" && (
        <div className="mbl-log-list">
          {[
            ...(logs.feeds   || []).map((e) => ({ ...e, type: "Feed",   typeIcon: "🍗" })),
            ...(logs.weights || []).map((e) => ({ ...e, type: "Weight", typeIcon: "⚖" })),
            ...(logs.sheds   || []).map((e) => ({ ...e, type: "Shed",   typeIcon: "🐍" })),
            ...(logs.notes   || []).map((e) => ({ ...e, type: "Note",   typeIcon: "📝" })),
          ]
            .sort((a, b) => String(b.createdAt || b.date || "").localeCompare(String(a.createdAt || a.date || "")))
            .slice(0, 50)
            .map((entry) => (
              <div key={entry.id || `${entry.type}-${entry.createdAt}`} className="mbl-log-row">
                <span className="mbl-log-type-icon">{entry.typeIcon}</span>
                <div className="mbl-log-body">
                  <strong>{entry.type}</strong>
                  <span>{entry.note || entry.result || entry.food || (entry.grams ? `${entry.grams} g` : "") || "Saved"}</span>
                </div>
                <small>{String(entry.createdAt || entry.date || "").slice(0, 10)}</small>
              </div>
            ))}
          {!Object.values(logs).flat().length && <p className="mbl-empty">No logs yet.</p>}
        </div>
      )}

      {subtab === "photos" && (
        <div className="mbl-photo-panel">
          <button type="button" className="mbl-btn mbl-btn--primary mbl-btn--wide" onClick={handleTakePhoto} disabled={photoBusy}>
            {photoBusy ? <Spinner /> : "📷 Take Photo"}
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
                      {animal.imageUrl === photo.url ? "✓ Icon" : "Set icon"}
                    </button>
                    <button type="button" className="mbl-btn mbl-btn--sm mbl-btn--danger"
                      onClick={() => onDeletePhoto(photo.id)} disabled={photoBusy}>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mbl-empty">No photos yet. Tap above to take one.</p>
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

  useEffect(() => { writeJson(RECENT_KEY, recent); }, [recent]);

  // Warm up the local cache (animals + pairings) so QR lookups bypass the tier-gated /mobile/scan
  useEffect(() => {
    fetchBreederSnapshot()
      .then((snap) => {
        const normalizedSnapshot = normalizeMobileSnapshot(snap);
        setLocalAnimals(normalizedSnapshot.animals);
        setPairings(normalizedSnapshot.pairings);
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
      (a) => a.id === animalId || a.appAnimalId === animalId
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
        pushToast("No animal found for this QR code.");
      }
    } catch {
      pushToast("Animal not found. Make sure the snapshot is synced.");
    } finally {
      setBusy(false);
    }
  }, [localAnimals, pushToast]);

  const handleManual = (e) => { e.preventDefault(); resolveAnimal(manual); setManual(""); };

  // ג”€ג”€ Shared snapshot helper ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€
  const updateAnimalInSnapshot = useCallback(async (updated) => {
    const snap = normalizeMobileSnapshot(await fetchBreederSnapshot().catch(() => ({ animals: [], pairings: [] })));
    const changed = markRecordUpdated(updated);
    const list = mergeSnapshotList([changed], snap?.animals, "animal", mergeAnimalRecord);
    const savedSnapshot = normalizeMobileSnapshot(await saveBreederSnapshot({ ...snap, animals: list }));
    const changedKey = recordIdentity(changed, "animal", 0);
    const savedAnimal = savedSnapshot.animals.find((record, index) => recordIdentity(record, "animal", index) === changedKey) || changed;
    setAnimal(savedAnimal);
    setLocalAnimals((prev) => upsertSnapshotRecord(prev, savedAnimal, "animal"));
  }, []);

  // ג”€ג”€ Pairing save handler ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€
  const handleSavePairing = useCallback(async (updatedPairing) => {
    const snap  = normalizeMobileSnapshot(await fetchBreederSnapshot().catch(() => ({ animals: [], pairings: [] })));
    const changed = markRecordUpdated(updatedPairing);
    const pairs = mergeSnapshotList([changed], snap?.pairings, "pairing", mergePairingRecord);
    const savedSnapshot = normalizeMobileSnapshot(await saveBreederSnapshot({ ...snap, pairings: pairs }));
    setPairings(savedSnapshot.pairings.length || !pairs.length ? savedSnapshot.pairings : [...pairs]);
  }, []);

  // ג”€ג”€ Photo handlers ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€
  const handleTakePhoto = useCallback(async () => {
    if (!animal) return;
    setPhotoBusy(true);
    try {
      const result = await Camera.getPhoto({
        quality: 85,
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
      };
      const updated = { ...animal, photos: [...(animal.photos || []), newPhoto] };
      await updateAnimalInSnapshot(updated);
      pushToast("Photo saved.");
    } catch (err) {
      if (!String(err?.message || "").toLowerCase().includes("cancel")) {
        pushToast("Could not take photo.");
      }
    } finally {
      setPhotoBusy(false);
    }
  }, [animal, updateAnimalInSnapshot, pushToast]);

  const handleSetIcon = useCallback(async (photoUrl) => {
    if (!animal) return;
    setPhotoBusy(true);
    try {
      await updateAnimalInSnapshot({ ...animal, imageUrl: photoUrl });
      pushToast("Icon updated.");
    } catch {
      pushToast("Could not update icon.");
    } finally {
      setPhotoBusy(false);
    }
  }, [animal, updateAnimalInSnapshot, pushToast]);

  const handleDeletePhoto = useCallback(async (photoId) => {
    if (!animal) return;
    setPhotoBusy(true);
    try {
      const remaining = (animal.photos || []).filter((p) => p.id !== photoId);
      const nextIcon  = remaining.some((p) => p.url === animal.imageUrl)
        ? animal.imageUrl
        : (remaining.length ? remaining[remaining.length - 1].url : undefined);
      await updateAnimalInSnapshot({ ...animal, photos: remaining, imageUrl: nextIcon });
      pushToast("Photo deleted.");
    } catch {
      pushToast("Could not delete photo.");
    } finally {
      setPhotoBusy(false);
    }
  }, [animal, updateAnimalInSnapshot, pushToast]);

  const saveEdit = useCallback(async (draft) => {
    setEditBusy(true);
    try {
      const snapshot = normalizeMobileSnapshot(await fetchBreederSnapshot().catch(() => ({ animals: [], pairings: [] })));
      const merged = markRecordUpdated({ ...animal, ...draft });
      const animals = mergeSnapshotList([merged], snapshot.animals, "animal", mergeAnimalRecord);
      const savedSnapshot = normalizeMobileSnapshot(await saveBreederSnapshot({ ...snapshot, animals }));
      const mergedKey = recordIdentity(merged, "animal", 0);
      const savedAnimal = savedSnapshot.animals.find((record, index) => recordIdentity(record, "animal", index) === mergedKey) || merged;
      setAnimal(savedAnimal);
      pushToast("Changes saved.");
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setEditBusy(false);
    }
  }, [animal, pushToast]);

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
      pushToast(`${cap(type)} saved.`);
      setModal(null);
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "Save failed.");
    }
  }, [pushToast]);

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
        <button type="button" className="mbl-text-btn" onClick={onSwitchMode}>⇄ Switch mode</button>
        <span className="mbl-terminal-badge">TERMINAL</span>
        <button type="button" className="mbl-text-btn" onClick={onSignOut}>Sign out</button>
      </div>

      <Toast msg={toast} onDismiss={dismissToast} />

      {screen === "scan" && (
        <div className="mbl-terminal-scan">
          <div className="mbl-terminal-hero">
            <h1>Scan QR</h1>
            <p>Point at an animal QR to open its card</p>
          </div>

          {busy ? <div className="mbl-loading"><Spinner /><span>Looking up animal…</span></div>
            : <QRScanner onScan={resolveAnimal} onError={pushToast} />}

          <form className="mbl-manual-row" onSubmit={handleManual}>
            <input value={manual} onChange={(e) => setManual(e.target.value)}
              placeholder="Or paste QR value / animal ID" disabled={busy} />
            <button type="submit" className="mbl-btn mbl-btn--primary" disabled={busy || !manual.trim()}>
              Open
            </button>
          </form>

          {recent.length > 0 && (
            <div className="mbl-recent-section">
              <h2>Recent</h2>
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
              ← Back to scan
            </button>
            <span>{animal.name || animal.appAnimalId}</span>
          </div>

          <div className="mbl-card-identity">
            {animal.imageUrl
              ? <img src={animal.imageUrl} alt="" className="mbl-avatar mbl-avatar-lg" />
              : <div className="mbl-avatar-placeholder mbl-avatar-lg">{String(animal.name || "?").slice(0, 1)}</div>}
            <div>
              <h2>{animal.name}</h2>
              <p>{animal.sex || "—"} · {animal.genetics || "No genetics"}</p>
              <small>{locationText(animal) || "No location"}</small>
            </div>
          </div>

          <div className="mbl-quick-actions mbl-quick-actions--card">
            {[["Feed","feed"],["Weight","weight"],["Shed","shed"],["Clean","clean"],["Water","water"],["Note","note"],["📷","photo"]].map(
              ([label, type]) => (
                <button key={type} type="button" className="mbl-quick-btn"
                  onClick={() => type === "photo" ? setPhotoModal(true) : startModal(type)}>
                  {label}
                </button>
              )
            )}
          </div>

          <div className="mbl-subtabs">
            {[["edit","Edit card"],["breeding","Breeding"]].map(([k, lbl]) => (
              <button key={k} type="button" className={cardTab === k ? "is-active" : ""} onClick={() => setCardTab(k)}>
                {lbl}
              </button>
            ))}
          </div>

          {cardTab === "edit" && (
            <AnimalEditForm animal={animal} onSave={saveEdit} onCancel={() => { setScreen("scan"); setAnimal(null); }} busy={editBusy} />
          )}
          {cardTab === "breeding" && (
            <BreedingPanel animal={animal} pairings={pairings} allAnimals={localAnimals} onSavePairing={handleSavePairing} />
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
  return (
    <div className={`mbl-task-card ${isDue ? "mbl-task-card--due" : ""}`}>
      <div className="mbl-task-card-icon">{TASK_ICONS[task.type] || "✓"}</div>
      <div className="mbl-task-info">
        <strong>{task.type}</strong>
        <span>{animal?.name || task.animalId}</span>
        <small>{[task.location, task.dueStatus].filter(Boolean).join(" · ") || "—"}</small>
      </div>
      <div className="mbl-task-btns">
        <button type="button" className="mbl-btn mbl-btn--sm mbl-btn--primary" onClick={() => onComplete(task, "done")}>Done</button>
        {task.type === "Feed" && (
          <button type="button" className="mbl-btn mbl-btn--sm" onClick={() => onComplete(task, "refused")}>Refused</button>
        )}
        <button type="button" className="mbl-btn mbl-btn--sm" onClick={() => onOpen(task.animalId)}>Open</button>
      </div>
    </div>
  );
}

// ג”€ג”€ג”€ FULL MODE ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€
function FullMode({ onSwitchMode, onSignOut, deviceId, user }) {
  const { appearanceState, updateAppearance } = useAppearance();
  const [tab, setTab]              = useState("animals");
  const [animals, setAnimals]          = useState([]);
  const [pairings, setPairings]        = useState([]);
  const [tasks, setTasks]              = useState([]);
  const [rackData, setRackData]        = useState({ rooms: [] });
  const [permissions, setPerms]        = useState({});
  const [animal, setAnimal]            = useState(null);
  const [modal, setModal]              = useState(null);
  const [scanOpen, setScanOpen]        = useState(false);
  const [photoBusy, setPhotoBusy]      = useState(false);
  const [online, setOnline]            = useState(() => navigator.onLine !== false);
  const [queue, setQueue]              = useState(() => readJson(QUEUE_KEY, []));
  const [lastSyncAt, setLastSyncAt]    = useState(() => { try { return localStorage.getItem(LAST_SYNC_KEY) || ""; } catch { return ""; } });
  const [recent, setRecent]            = useState(() => readJson(RECENT_KEY, []));
  const [search, setSearch]            = useState("");
  const [sexFilter, setSexFilter]      = useState("");
  const [expandedPairing, setExpandedPairing] = useState(null);
  const [toast, setToast]              = useState("");
  const [loading, setLoading]          = useState(true);
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
      const [permData, taskData, snapshot] = await Promise.all([
        fetchMobilePermissions({ deviceId, platform: "android" }),
        fetchMobileTasks().catch(() => ({ tasks: [] })),
        fetchBreederSnapshot().catch(() => ({ animals: [], pairings: [] })),
      ]);
      setPerms(permData?.permissions || {});
      setTasks(Array.isArray(taskData?.tasks) ? taskData.tasks : []);
      const normalizedSnapshot = normalizeMobileSnapshot(snapshot);
      setAnimals(normalizedSnapshot.animals);
      setPairings(normalizedSnapshot.pairings);
      recordSync();
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "Failed to load data.");
    } finally {
      setLoading(false);
    }
  }, [deviceId, pushToast, recordSync]);

  const pushToCloud = useCallback(async () => {
    if (!online) { pushToast("Cannot push while offline."); return; }
    try {
      const latest = await fetchBreederSnapshot().catch(() => ({ animals: [], pairings: [] }));
      const merged = mergeMobileSnapshot({ animals, pairings }, latest);
      const savedSnapshot = normalizeMobileSnapshot(await saveBreederSnapshot(merged));
      setAnimals(savedSnapshot.animals);
      setPairings(savedSnapshot.pairings);
      recordSync();
      pushToast("Data merged to cloud.");
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "Push failed.");
    }
  }, [online, animals, pairings, recordSync, pushToast]);

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
    if (tab === "rack") fetchMobileRackMode().then(setRackData).catch(() => {});
  }, [tab]);

  const openAnimal = useCallback(async (raw) => {
    if (!raw) return;
    setScanOpen(false);
    const animalId = parseQrValue(raw);
    const local = animals.find((a) => a.id === animalId || a.appAnimalId === animalId);
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
        pushToast("No animal found for this QR code.");
      }
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "Scan failed.");
    }
  }, [animals, pushToast]);

  const logActions = { feed: logMobileFeed, weight: logMobileWeight, shed: logMobileShed, note: logMobileNote, clean: logMobileClean, water: logMobileWater };

  const doQuickAction = useCallback(async (type, payload) => {
    const api = logActions[type];
    if (!api) return;
    if (!online) {
      setQueue((prev) => [...prev, { id: `q-${Date.now()}`, actionType: type, payload, deviceId }]);
      setModal(null);
      pushToast("Saved offline — will sync when online.");
      return;
    }
    try {
      const res = await api(payload);
      if (res?.animal) setAnimal(res.animal);
      setModal(null);
      pushToast(`${cap(type)} saved.`);
      await refresh();
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "Save failed.");
    }
  }, [online, deviceId, refresh, pushToast]);

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
      pushToast("Offline updates synced.");
      await refresh();
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "Sync failed.");
    }
  };

  const completeTask = async (task, result) => {
    const type = { Feed: "feed", Water: "water", Clean: "clean" }[task.type] || "note";
    await doQuickAction(type, { animalId: task.animalId, result, note: `${task.type} ${result}` });
  };

  // ג”€ג”€ Photo helpers (Full mode) ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€
  const updateAnimalInSnapshot = useCallback(async (updated) => {
    const snap = normalizeMobileSnapshot(await fetchBreederSnapshot().catch(() => ({ animals: [], pairings: [] })));
    const changed = markRecordUpdated(updated);
    const list = mergeSnapshotList([changed], snap?.animals, "animal", mergeAnimalRecord);
    const savedSnapshot = normalizeMobileSnapshot(await saveBreederSnapshot({ ...snap, animals: list }));
    const changedKey = recordIdentity(changed, "animal", 0);
    const savedAnimal = savedSnapshot.animals.find((record, index) => recordIdentity(record, "animal", index) === changedKey) || changed;
    setAnimal(savedAnimal);
    setAnimals((prev) => upsertSnapshotRecord(prev, savedAnimal, "animal"));
  }, []);

  // ג”€ג”€ Pairing save handler ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€
  const handleSavePairing = useCallback(async (updatedPairing) => {
    const snap  = normalizeMobileSnapshot(await fetchBreederSnapshot().catch(() => ({ animals: [], pairings: [] })));
    const changed = markRecordUpdated(updatedPairing);
    const pairs = mergeSnapshotList([changed], snap?.pairings, "pairing", mergePairingRecord);
    const savedSnapshot = normalizeMobileSnapshot(await saveBreederSnapshot({ ...snap, pairings: pairs }));
    setPairings(savedSnapshot.pairings.length || !pairs.length ? savedSnapshot.pairings : [...pairs]);
  }, []);

  const handleTakePhoto = useCallback(async () => {
    if (!animal) return;
    setPhotoBusy(true);
    try {
      const result = await Camera.getPhoto({
        quality: 85,
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
      };
      await updateAnimalInSnapshot({ ...animal, photos: [...(animal.photos || []), newPhoto] });
      pushToast("Photo saved.");
    } catch (err) {
      if (!String(err?.message || "").toLowerCase().includes("cancel")) {
        pushToast("Could not take photo.");
      }
    } finally {
      setPhotoBusy(false);
    }
  }, [animal, updateAnimalInSnapshot, pushToast]);

  const handleSetIcon = useCallback(async (photoUrl) => {
    if (!animal) return;
    setPhotoBusy(true);
    try {
      await updateAnimalInSnapshot({ ...animal, imageUrl: photoUrl });
      pushToast("Icon updated.");
    } catch { pushToast("Could not update icon."); }
    finally { setPhotoBusy(false); }
  }, [animal, updateAnimalInSnapshot, pushToast]);

  const handleDeletePhoto = useCallback(async (photoId) => {
    if (!animal) return;
    setPhotoBusy(true);
    try {
      const remaining = (animal.photos || []).filter((p) => p.id !== photoId);
      const nextIcon  = remaining.some((p) => p.url === animal.imageUrl)
        ? animal.imageUrl
        : (remaining.length ? remaining[remaining.length - 1].url : undefined);
      await updateAnimalInSnapshot({ ...animal, photos: remaining, imageUrl: nextIcon });
      pushToast("Photo deleted.");
    } catch { pushToast("Could not delete photo."); }
    finally { setPhotoBusy(false); }
  }, [animal, updateAnimalInSnapshot, pushToast]);

  const animalMap = useMemo(
    () => new Map(animals.map((a) => [a.id || a.appAnimalId, a])),
    [animals]
  );

  const filteredAnimals = useMemo(() => {
    let list = animals;
    if (sexFilter && sexFilter !== "groups") list = list.filter((a) => a.sex === sexFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((a) =>
        [a.name, a.genetics, a.sex, a.status, a.appAnimalId, a.id].some((v) => String(v || "").toLowerCase().includes(q))
      );
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

  const navTabs = [
    { key: "animals",  label: "Animals",  icon: "🐍" },
    { key: "breeding", label: "Breeding", icon: "♥"  },
    { key: "tasks",    label: "Tasks",    icon: "✓"  },
    { key: "rack",     label: "Rack",     icon: "⬛" },
    { key: "more",     label: "More",     icon: "≡"  },
  ];

  const switchTab = (key) => { setAnimal(null); setExpandedPairing(null); setMorePanel(null); setTab(key); };

  return (
    <div className="mbl-shell">
      <OfflineBanner online={online} queued={queue.length} onSync={runSync} />

      <div className="mbl-full-topbar">
        <span className="mbl-full-title">Breeding Planner</span>
        <div className="mbl-topbar-actions">
          {!online && <span className="mbl-topbar-offline">Offline</span>}
          <button type="button" className="mbl-topbar-qr-btn" onClick={() => setScanOpen(true)} aria-label="Scan QR">▣</button>
        </div>
      </div>

      <Toast msg={toast} onDismiss={dismissToast} />

      {/* ג”€ג”€ QR scan overlay ג”€ג”€ */}
      {scanOpen && (
        <ActionSheet title="Scan QR code" onClose={() => setScanOpen(false)}>
          <QRScanner onScan={openAnimal} onError={(e) => { pushToast(e); setScanOpen(false); }} />
          <form className="mbl-manual-row" onSubmit={(e) => { e.preventDefault(); const v = e.target.elements.qr.value.trim(); if (v) { openAnimal(v); e.target.reset(); } }}>
            <input name="qr" placeholder="Or paste QR / animal ID" />
            <button type="submit" className="mbl-btn mbl-btn--primary">Open</button>
          </form>
          {recent.length > 0 && (
            <>
              <div className="mbl-section-label">Recent</div>
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
        {loading && <div className="mbl-loading"><Spinner /><span>Loading…</span></div>}

        {/* ג”€ג”€ ANIMALS TAB ג”€ג”€ */}
        {/* Full-screen feature panels */}
        {!loading && morePanel === "advisor" && (
          <FullScreenPanel title="Breeding Advisor" onClose={() => setMorePanel(null)}>
            <SuggestionsTab
              males={advisorMales}
              females={advisorFemales}
              requireAvailableForBreeding={false}
              requireMatureForBreeding={false}
            />
          </FullScreenPanel>
        )}

        {!loading && morePanel === "shed-test" && (
          <FullScreenPanel title="Shed Test Terminal" onClose={() => setMorePanel(null)}>
            <ShedTestTerminalPanel
              snakes={animals}
              onBatchSubmitted={() => pushToast("Batch submitted.")}
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
                    placeholder="Search by name, morph, location…"
                    className="mbl-search-input"
                  />
                  <div className="mbl-filter-chips">
                    {[["", "All"], ["Male", "Male"], ["Female", "Female"], ["groups", "Groups"]].map(([val, label]) => (
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
                    ? <p className="mbl-empty">No animals yet.</p>
                    : groupedAnimals.map(([groupName, groupList]) => {
                        const visible = search.trim()
                          ? groupList.filter((a) => {
                              const q = search.toLowerCase();
                              return [a.name, a.genetics, a.sex, a.status, a.appAnimalId, a.id]
                                .some((v) => String(v || "").toLowerCase().includes(q));
                            })
                          : groupList;
                        if (!visible.length) return null;
                        return (
                          <React.Fragment key={groupName}>
                            <div className="mbl-section-label">{groupName} ({visible.length})</div>
                            {visible.map((a) => <AnimalCardRow key={a.id || a.appAnimalId} animal={a} onOpen={openAnimal} />)}
                          </React.Fragment>
                        );
                      })
                ) : (
                  /* Flat list view */
                  <>
                    <div className="mbl-section-label">{filteredAnimals.length} animal{filteredAnimals.length !== 1 ? "s" : ""}</div>
                    {filteredAnimals.map((a) => <AnimalCardRow key={a.id || a.appAnimalId} animal={a} onOpen={openAnimal} />)}
                    {!filteredAnimals.length && <p className="mbl-empty">No animals found.</p>}
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* ג”€ג”€ BREEDING TAB ג”€ג”€ */}
        {!loading && !morePanel && tab === "breeding" && (
          <div className="mbl-screen">
            <div className="mbl-section-label">{pairings.length} pairing{pairings.length !== 1 ? "s" : ""}</div>
            {pairings.length === 0 && <p className="mbl-empty">No pairings yet. Create pairings in the desktop app.</p>}
            {pairings.map((pairing) => {
              const female      = animalMap.get(pairing.femaleId);
              const male        = animalMap.get(pairing.maleId);
              const femaleName  = female?.name || pairing.femaleId || "Female";
              const maleName    = male?.name   || pairing.maleId   || "Male";
              const isExpanded  = expandedPairing === pairing.id;
              const statusCls   = `mbl-bp-status mbl-bp-status--${(pairing.status || "unknown").toLowerCase().replace(/\s+/g, "-")}`;
              const stages = [
                { key: "ovulation",  label: "Ov",   done: !!(pairing.ovulation?.date  || pairing.mobileOvulationLogs?.length)  },
                { key: "preLayShed", label: "Shed",  done: !!(pairing.preLayShed?.date || pairing.mobilePreLayShedLogs?.length) },
                { key: "clutch",     label: "Lay",   done: !!(pairing.clutch?.date     || pairing.mobileClutchLogs?.length)     },
                { key: "hatch",      label: "Hatch", done: !!(pairing.hatch?.date      || pairing.mobileHatchLogs?.length)      },
              ];
              return (
                <div key={pairing.id} className="mbl-pairing-card">
                  <button type="button" className="mbl-pairing-card-header"
                    onClick={() => setExpandedPairing(isExpanded ? null : pairing.id)}>
                    <div className="mbl-pairing-animals">
                      <div className="mbl-pairing-animal-chip">
                        <span className="mbl-pairing-dot mbl-pairing-dot--f">F</span>
                        <span>{femaleName}</span>
                      </div>
                      <span className="mbl-pairing-x">ֳ—</span>
                      <div className="mbl-pairing-animal-chip">
                        <span className="mbl-pairing-dot mbl-pairing-dot--m">M</span>
                        <span>{maleName}</span>
                      </div>
                    </div>
                    <div className="mbl-pairing-header-right">
                      <span className={statusCls}>{pairing.status || "Unknown"}</span>
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
            {tasks.length === 0 && <p className="mbl-empty">No tasks for today. 🎉</p>}
            {taskGroups.overdue.length > 0 && (
              <>
                <div className="mbl-section-label mbl-section-label--danger">⚠ Overdue ({taskGroups.overdue.length})</div>
                {taskGroups.overdue.map((t) => <TaskCard key={t.id} task={t} animalMap={animalMap} onComplete={completeTask} onOpen={openAnimal} />)}
              </>
            )}
            {taskGroups.today.length > 0 && (
              <>
                <div className="mbl-section-label">Today ({taskGroups.today.length})</div>
                {taskGroups.today.map((t) => <TaskCard key={t.id} task={t} animalMap={animalMap} onComplete={completeTask} onOpen={openAnimal} />)}
              </>
            )}
            {taskGroups.other.length > 0 && (
              <>
                <div className="mbl-section-label">Upcoming ({taskGroups.other.length})</div>
                {taskGroups.other.map((t) => <TaskCard key={t.id} task={t} animalMap={animalMap} onComplete={completeTask} onOpen={openAnimal} />)}
              </>
            )}
          </div>
        )}

        {/* ג”€ג”€ RACK TAB ג”€ג”€ */}
        {!loading && !morePanel && tab === "rack" && (
          <div className="mbl-screen">
            <div className="mbl-section-label">Spaces / Rack view</div>
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
                          <small>{tub.name || (tub.animalId ? "···" : "Empty")}</small>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ))}
            {!rackData.rooms?.length && <p className="mbl-empty">No rack data. Configure spaces in the desktop app.</p>}
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
                <strong>{user?.fullName || user?.displayName || "Breeder"}</strong>
                {user?.email && <span>{user.email}</span>}
              </div>
            </div>

            {/* Quick access */}
            <div className="mbl-more-section">
              <div className="mbl-section-label">Quick access</div>
              <div className="mbl-more-quick-grid">
                <button type="button" className="mbl-more-quick-card" onClick={() => setScanOpen(true)}>
                  <span>▣</span><strong>Scan QR</strong>
                </button>
                <button type="button" className="mbl-more-quick-card" onClick={() => switchTab("rack")}>
                  <span>⬛</span><strong>Rack view</strong>
                </button>
                <button type="button" className="mbl-more-quick-card" onClick={() => switchTab("breeding")}>
                  <span>♥</span><strong>Breeding</strong>
                </button>
                <button type="button" className="mbl-more-quick-card" onClick={() => switchTab("tasks")}>
                  <span>✓</span><strong>Tasks</strong>
                </button>
              </div>
            </div>

            {/* Tools */}
            <div className="mbl-more-section">
              <div className="mbl-section-label">Tools</div>
              <div className="mbl-settings-list">
                <button type="button" className="mbl-settings-row mbl-settings-row--btn" onClick={() => setMorePanel("advisor")}>
                  <span>🧬 Breeding Advisor</span>
                  <span className="mbl-settings-chevron">›</span>
                </button>
                <button type="button" className="mbl-settings-row mbl-settings-row--btn" onClick={() => setMorePanel("shed-test")}>
                  <span>🔬 Shed Test Terminal</span>
                  <span className="mbl-settings-chevron">›</span>
                </button>
              </div>
            </div>

            {/* Appearance */}
            <div className="mbl-more-section">
              <div className="mbl-section-label">Appearance</div>
              <div className="mbl-settings-list">
                <div className="mbl-settings-row mbl-settings-row--stacked">
                  <span>Theme</span>
                  <div className="mbl-seg">
                    {["system", "light", "dark"].map((mode) => (
                      <button key={mode} type="button"
                        className={appearanceState.themeMode === mode ? "is-active" : ""}
                        onClick={() => updateAppearance({ themeMode: mode })}>
                        {mode === "system" ? "Auto" : cap(mode)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Cloud & Sync */}
            <div className="mbl-more-section">
              <div className="mbl-section-label">Cloud & sync</div>
              <div className="mbl-settings-list">
                <div className="mbl-settings-row">
                  <span>Status</span>
                  <span className={`mbl-settings-badge ${online ? "mbl-settings-badge--green" : "mbl-settings-badge--red"}`}>
                    {online ? "Online" : "Offline"}
                  </span>
                </div>
                <div className="mbl-settings-row">
                  <span>Last synced</span>
                  <span className="mbl-settings-muted">{fmtSyncTime(lastSyncAt)}</span>
                </div>
                {queue.length > 0 && (
                  <div className="mbl-settings-row">
                    <span>{queue.length} pending action{queue.length !== 1 ? "s" : ""}</span>
                    <button type="button" className="mbl-text-btn mbl-text-btn--sm" onClick={runSync}>Sync now</button>
                  </div>
                )}
                <button type="button" className="mbl-settings-row mbl-settings-row--btn" onClick={refresh}>
                  <span>Pull from cloud</span>
                  <span className="mbl-settings-chevron">›</span>
                </button>
                <button type="button" className="mbl-settings-row mbl-settings-row--btn" onClick={pushToCloud} disabled={!online}>
                  <span style={{ opacity: online ? 1 : 0.45 }}>Push to cloud</span>
                  <span className="mbl-settings-chevron">›</span>
                </button>
              </div>
            </div>

            {/* Devices */}
            <div className="mbl-more-section">
              <div className="mbl-section-label">Devices</div>
              <div className="mbl-settings-list">
                <div className="mbl-settings-row mbl-settings-row--col">
                  <span>This device ID</span>
                  <span className="mbl-device-id">{deviceId}</span>
                </div>
              </div>
              <p className="mbl-settings-hint">
                Sign in with the same account on any device to access your data. All devices sync through the cloud automatically.
              </p>
            </div>

            {/* Account */}
            <div className="mbl-more-section">
              <div className="mbl-section-label">Account</div>
              <div className="mbl-settings-list">
                <button type="button" className="mbl-settings-row mbl-settings-row--btn" onClick={onSwitchMode}>
                  <span>Switch to Terminal mode</span>
                  <span className="mbl-settings-chevron">›</span>
                </button>
                <button type="button" className="mbl-settings-row mbl-settings-row--btn mbl-settings-row--danger" onClick={onSignOut}>
                  <span>Sign out</span>
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
      fullName:    backendUser?.fullName    || "",
      displayName: backendUser?.displayName || backendUser?.fullName || "",
      email:       backendUser?.email       || "",
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
