import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import jsQR from "jsqr";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
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

// ─── Storage helpers ─────────────────────────────────────────────────────────
const DEVICE_KEY    = "breedingPlannerMobileDeviceId";
const RECENT_KEY    = "breedingPlannerMobileRecentAnimals";
const QUEUE_KEY     = "breedingPlannerMobileSyncQueue";
const MODE_KEY      = "breedingPlannerMobileLastMode"; // terminal | full
const ANIMALS_CACHE = "breedingPlannerMobileAnimalsCache";

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

// ─── Tiny utilities ──────────────────────────────────────────────────────────
const cap = (s) => String(s || "").replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const first = (arr) => (Array.isArray(arr) && arr.length ? arr[0] : null);
const locationText = (a) => [a?.room, a?.rack, a?.tub].filter(Boolean).join(" / ") || "";
const logoSrc = `${process.env.PUBLIC_URL || ""}/app-icons/icon_512x512.png`;

// ─── Small shared components ─────────────────────────────────────────────────
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

// ─── LOGIN SCREEN ─────────────────────────────────────────────────────────────
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

// ─── MODE SELECT SCREEN ───────────────────────────────────────────────────────
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
          <span className="mbl-mode-icon">☰</span>
          <strong>Full Access</strong>
          <span>Animals, pairings, tasks, rack mode and more — full desktop features on mobile.</span>
        </button>
      </div>
    </div>
  );
}

// ─── QR SCANNER (shared by both modes) ───────────────────────────────────────
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

// ─── ANIMAL EDIT FORM (full edit, used by Terminal mode) ─────────────────────
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

// ─── QUICK ACTION MODALS ──────────────────────────────────────────────────────
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

// ─── PHOTO MODAL ─────────────────────────────────────────────────────────────
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

// ─── BREEDING CYCLE HELPERS ───────────────────────────────────────────────────
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

// ─── CYCLE STAGE LOG FORM ─────────────────────────────────────────────────────
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

// ─── PAIRING SECTION (one pairing, all 4 stages) ─────────────────────────────
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

// ─── BREEDING PANEL ───────────────────────────────────────────────────────────
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

// ─── ANIMAL PROFILE CARD (Full mode) ─────────────────────────────────────────
function AnimalProfile({ animal, permissions, pairings, allAnimals, onQuickAction, onTakePhoto, onSetIcon, onDeletePhoto, onSavePairing, onBack }) {
  const [subtab, setSubtab]   = useState("overview");
  const [photoBusy, setPhotoBusy] = useState(false);
  const logs = animal?.logs || {};
  const latestFeed   = first(logs.feeds);
  const latestWeight = first(logs.weights);
  const latestShed   = first(logs.sheds);

  const handleTakePhoto = async () => {
    setPhotoBusy(true);
    try { await onTakePhoto(); } finally { setPhotoBusy(false); }
  };

  const quickActions = [
    ["Feed",   "feed"],
    ["Weight", "weight"],
    ["Shed",   "shed"],
    ["Clean",  "clean"],
    ["Water",  "water"],
    ["Note",   "note"],
    ["📷",     "photo"],
  ];

  return (
    <section className="mbl-profile">
      <div className="mbl-profile-topbar">
        <button type="button" className="mbl-back-btn" onClick={onBack}>← Back</button>
        <span>{animal.name || animal.appAnimalId}</span>
      </div>
      <div className="mbl-profile-hero">
        {animal.imageUrl
          ? <img src={animal.imageUrl} alt="" className="mbl-avatar" />
          : <div className="mbl-avatar-placeholder">{String(animal.name || "?").slice(0, 1)}</div>}
        <div className="mbl-profile-hero-text">
          <h1>{animal.name}</h1>
          <p>{animal.sex || "Unknown sex"} · {animal.genetics || "Genetics not set"}</p>
          <small>{locationText(animal) || "No location"}</small>
        </div>
      </div>

      <div className="mbl-quick-actions">
        {quickActions.map(([label, action]) => (
          <button key={action} type="button" className="mbl-quick-btn"
            onClick={() => action === "photo" ? setSubtab("photos") : onQuickAction(action)}>
            {label}
          </button>
        ))}
      </div>

      <div className="mbl-subtabs">
        {["overview", "logs", "photos", "breeding"].map((t) => (
          <button key={t} type="button" className={subtab === t ? "is-active" : ""} onClick={() => setSubtab(t)}>
            {cap(t)}
          </button>
        ))}
      </div>

      {subtab === "overview" && (
        <div className="mbl-data-grid">
          <div className="mbl-data-card"><span>Last feed</span><strong>{latestFeed ? `${latestFeed.result || "fed"} ${latestFeed.food || ""}` : "—"}</strong></div>
          <div className="mbl-data-card"><span>Weight</span><strong>{latestWeight ? `${latestWeight.grams ?? animal.weight} g` : `${animal.weight || "—"} g`}</strong></div>
          <div className="mbl-data-card"><span>Last shed</span><strong>{latestShed ? latestShed.result || latestShed.date : "—"}</strong></div>
          <div className="mbl-data-card"><span>Breeding</span><strong>{animal.breeding?.pairingStatus || "No active pairing"}</strong></div>
          <div className="mbl-data-card"><span>Status</span><strong>{animal.status || "—"}</strong></div>
          <div className="mbl-data-card"><span>Lab</span><strong>{animal.lab?.orderStatus || "No order"}</strong></div>
        </div>
      )}

      {subtab === "logs" && (
        <div className="mbl-log-list">
          {[
            ...(logs.feeds   || []).map((e) => ({ ...e, type: "Feed" })),
            ...(logs.weights || []).map((e) => ({ ...e, type: "Weight" })),
            ...(logs.sheds   || []).map((e) => ({ ...e, type: "Shed" })),
            ...(logs.notes   || []).map((e) => ({ ...e, type: "Note" })),
          ]
            .sort((a, b) => String(b.createdAt || b.date || "").localeCompare(String(a.createdAt || a.date || "")))
            .slice(0, 40)
            .map((entry) => (
              <div key={entry.id || `${entry.type}-${entry.createdAt}`} className="mbl-log-row">
                <strong>{entry.type}</strong>
                <span>{entry.note || entry.result || entry.food || `${entry.grams || ""}g` || "Saved"}</span>
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
                      {animal.imageUrl === photo.url ? "✓ Icon" : "Set as icon"}
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
    </section>
  );
}

// ─── TERMINAL MODE ────────────────────────────────────────────────────────────
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
  const [localAnimals, setLocalAnimals] = useState(() => readJson(ANIMALS_CACHE, []));
  const [pairings, setPairings]   = useState([]);

  useEffect(() => { writeJson(RECENT_KEY, recent); }, [recent]);

  // Warm up the local cache (animals + pairings) so QR lookups bypass the tier-gated /mobile/scan
  useEffect(() => {
    fetchBreederSnapshot()
      .then((snap) => {
        const list  = Array.isArray(snap?.animals)  ? snap.animals  : [];
        const pairs = Array.isArray(snap?.pairings) ? snap.pairings : [];
        setLocalAnimals(list);
        setPairings(pairs);
        writeJson(ANIMALS_CACHE, list);
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

  // ── Shared snapshot helper ─────────────────────────────────────────────────
  const updateAnimalInSnapshot = useCallback(async (updated) => {
    const snap = await fetchBreederSnapshot().catch(() => ({ animals: [], pairings: [] }));
    const list = Array.isArray(snap?.animals) ? snap.animals : [];
    const idx  = list.findIndex((a) => a.id === updated.id || a.appAnimalId === updated.appAnimalId);
    if (idx >= 0) list[idx] = updated; else list.push(updated);
    await saveBreederSnapshot({ ...snap, animals: list });
    setAnimal(updated);
    setLocalAnimals((prev) => prev.map((a) => a.id === updated.id ? updated : a));
  }, []);

  // ── Pairing save handler ───────────────────────────────────────────────────
  const handleSavePairing = useCallback(async (updatedPairing) => {
    const snap  = await fetchBreederSnapshot().catch(() => ({ animals: [], pairings: [] }));
    const pairs = Array.isArray(snap?.pairings) ? snap.pairings : [];
    const idx   = pairs.findIndex((p) => p.id === updatedPairing.id);
    if (idx >= 0) pairs[idx] = updatedPairing; else pairs.push(updatedPairing);
    await saveBreederSnapshot({ ...snap, pairings: pairs });
    setPairings([...pairs]);
  }, []);

  // ── Photo handlers ─────────────────────────────────────────────────────────
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
      const snapshot = await fetchBreederSnapshot().catch(() => ({ animals: [], pairings: [] }));
      const animals = Array.isArray(snapshot.animals) ? snapshot.animals : [];
      const idx = animals.findIndex((a) => (a.id || a.appAnimalId) === (animal.id || animal.appAnimalId));
      const merged = { ...animal, ...draft };
      if (idx >= 0) animals[idx] = merged; else animals.push(merged);
      await saveBreederSnapshot({ ...snapshot, animals });
      setAnimal(merged);
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

// ─── FULL MODE ────────────────────────────────────────────────────────────────
function FullMode({ onSwitchMode, onSignOut, deviceId }) {
  const [tab, setTab]              = useState("scan");
  const [animals, setAnimals]      = useState([]);
  const [pairings, setPairings]    = useState([]);
  const [tasks, setTasks]          = useState([]);
  const [rackData, setRackData]    = useState({ rooms: [] });
  const [comms, setComms]          = useState(null);
  const [permissions, setPerms]    = useState({});
  const [animal, setAnimal]        = useState(null);
  const [modal, setModal]          = useState(null);
  const [photoBusy, setPhotoBusy]  = useState(false);
  const [online, setOnline]        = useState(() => navigator.onLine !== false);
  const [queue, setQueue]          = useState(() => readJson(QUEUE_KEY, []));
  const [recent, setRecent]        = useState(() => readJson(RECENT_KEY, []));
  const [search, setSearch]        = useState("");
  const [toast, setToast]          = useState("");
  const [loading, setLoading]      = useState(true);

  const pushToast = useCallback((msg) => setToast(msg), []);
  const dismissToast = useCallback(() => setToast(""), []);

  useEffect(() => { writeJson(QUEUE_KEY, queue); }, [queue]);
  useEffect(() => { writeJson(RECENT_KEY, recent); }, [recent]);

  const refresh = useCallback(async () => {
    try {
      const [permData, taskData, snapshot] = await Promise.all([
        fetchMobilePermissions({ deviceId, platform: "android" }),
        fetchMobileTasks().catch(() => ({ tasks: [] })),
        fetchBreederSnapshot().catch(() => ({ animals: [], pairings: [] })),
      ]);
      setPerms(permData?.permissions || {});
      setTasks(Array.isArray(taskData?.tasks) ? taskData.tasks : []);
      setAnimals(Array.isArray(snapshot?.animals) ? snapshot.animals : []);
      setPairings(Array.isArray(snapshot?.pairings) ? snapshot.pairings : []);
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "Failed to load data.");
    } finally {
      setLoading(false);
    }
  }, [deviceId, pushToast]);

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
    if (tab === "messages") fetchMobileCommunication().then(setComms).catch(() => {});
  }, [tab]);

  const openAnimal = useCallback(async (raw) => {
    if (!raw) return;
    const animalId = parseQrValue(raw);

    // Try local lookup first using already-loaded snapshot (no tier check)
    const local = animals.find((a) => a.id === animalId || a.appAnimalId === animalId);
    if (local) {
      setAnimal(local);
      setRecent((prev) => [local, ...prev.filter((a) => a.appAnimalId !== local.appAnimalId)].slice(0, 10));
      setTab("animals");
      return;
    }

    // Fall back to backend
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

  // ── Photo helpers (Full mode) ──────────────────────────────────────────────
  const updateAnimalInSnapshot = useCallback(async (updated) => {
    const snap = await fetchBreederSnapshot().catch(() => ({ animals: [], pairings: [] }));
    const list = Array.isArray(snap?.animals) ? snap.animals : [];
    const idx  = list.findIndex((a) => a.id === updated.id || a.appAnimalId === updated.appAnimalId);
    if (idx >= 0) list[idx] = updated; else list.push(updated);
    await saveBreederSnapshot({ ...snap, animals: list });
    setAnimal(updated);
    setAnimals((prev) => prev.map((a) => a.id === updated.id ? updated : a));
  }, []);

  // ── Pairing save handler ───────────────────────────────────────────────────
  const handleSavePairing = useCallback(async (updatedPairing) => {
    const snap  = await fetchBreederSnapshot().catch(() => ({ animals: [], pairings: [] }));
    const pairs = Array.isArray(snap?.pairings) ? snap.pairings : [];
    const idx   = pairs.findIndex((p) => p.id === updatedPairing.id);
    if (idx >= 0) pairs[idx] = updatedPairing; else pairs.push(updatedPairing);
    await saveBreederSnapshot({ ...snap, pairings: pairs });
    setPairings([...pairs]);
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

  const filteredAnimals = useMemo(() => {
    if (!search.trim()) return animals;
    const q = search.toLowerCase();
    return animals.filter((a) =>
      [a.name, a.genetics, a.sex, a.status, a.appAnimalId, a.id].some((v) => String(v || "").toLowerCase().includes(q))
    );
  }, [animals, search]);

  const bottomTabs = [
    { key: "scan",     label: "Scan" },
    { key: "animals",  label: "Animals" },
    { key: "tasks",    label: "Tasks" },
    { key: "rack",     label: "Rack" },
    { key: "more",     label: "More" },
  ];

  return (
    <div className="mbl-shell">
      <OfflineBanner online={online} queued={queue.length} onSync={runSync} />

      <div className="mbl-full-topbar">
        <span className="mbl-full-title">Breeding Planner</span>
        <button type="button" className="mbl-text-btn mbl-text-btn--sm" onClick={onSwitchMode}>⇄ Mode</button>
      </div>

      <Toast msg={toast} onDismiss={dismissToast} />

      <div className="mbl-full-body">
        {loading && <div className="mbl-loading"><Spinner /><span>Loading…</span></div>}

        {/* ── SCAN TAB ── */}
        {!loading && tab === "scan" && (
          <div className="mbl-screen">
            <div className="mbl-hero-row">
              <h1>Scan QR</h1>
              <p>Scan to open any animal card</p>
            </div>
            <QRScanner onScan={openAnimal} onError={pushToast} />
            <form className="mbl-manual-row" onSubmit={(e) => { e.preventDefault(); const v = e.target.elements.qr.value.trim(); if (v) { openAnimal(v); e.target.reset(); } }}>
              <input name="qr" placeholder="Or paste QR / animal ID" />
              <button type="submit" className="mbl-btn mbl-btn--primary">Open</button>
            </form>
            {recent.length > 0 && (
              <>
                <div className="mbl-section-label">Recent scans</div>
                {recent.slice(0, 5).map((a) => (
                  <button key={a.appAnimalId} type="button" className="mbl-animal-row" onClick={() => openAnimal(a.appAnimalId)}>
                    <div className="mbl-avatar-sm">{String(a.name || "?").slice(0, 1)}</div>
                    <div><strong>{a.name || a.appAnimalId}</strong><small>{locationText(a)}</small></div>
                  </button>
                ))}
              </>
            )}
          </div>
        )}

        {/* ── ANIMALS TAB ── */}
        {!loading && tab === "animals" && (
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
                <div className="mbl-search-row">
                  <input value={search} onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search animals…" className="mbl-search-input" />
                </div>
                <div className="mbl-section-label">{filteredAnimals.length} animal{filteredAnimals.length !== 1 ? "s" : ""}</div>
                {filteredAnimals.map((a) => (
                  <button key={a.id || a.appAnimalId} type="button" className="mbl-animal-row"
                    onClick={() => openAnimal(a.id || a.appAnimalId)}>
                    <div className="mbl-avatar-sm">{String(a.name || "?").slice(0, 1)}</div>
                    <div>
                      <strong>{a.name || a.id}</strong>
                      <small>{[a.sex, a.genetics].filter(Boolean).join(" · ")}</small>
                      <small>{locationText(a)}</small>
                    </div>
                  </button>
                ))}
                {!filteredAnimals.length && <p className="mbl-empty">No animals found.</p>}
              </>
            )}
          </div>
        )}

        {/* ── TASKS TAB ── */}
        {!loading && tab === "tasks" && (
          <div className="mbl-screen">
            <div className="mbl-section-label">{tasks.length} task{tasks.length !== 1 ? "s" : ""} today</div>
            {tasks.map((task) => (
              <div key={task.id} className="mbl-task-card">
                <div className="mbl-task-info">
                  <strong>{task.type}</strong>
                  <span>{task.animalId}</span>
                  <small>{task.location || "—"} · {task.dueStatus || ""}</small>
                </div>
                <div className="mbl-task-btns">
                  <button type="button" className="mbl-btn mbl-btn--sm" onClick={() => completeTask(task, "done")}>Done</button>
                  {task.type === "Feed" && (
                    <button type="button" className="mbl-btn mbl-btn--sm" onClick={() => completeTask(task, "refused")}>Refused</button>
                  )}
                  <button type="button" className="mbl-btn mbl-btn--sm" onClick={() => openAnimal(task.animalId)}>Open</button>
                </div>
              </div>
            ))}
            {!tasks.length && <p className="mbl-empty">No tasks for today.</p>}
          </div>
        )}

        {/* ── RACK TAB ── */}
        {!loading && tab === "rack" && (
          <div className="mbl-screen">
            <div className="mbl-section-label">Rack view</div>
            {(rackData.rooms || []).map((room) => (
              <div key={room.roomName} className="mbl-rack-room">
                <h2>{room.roomName}</h2>
                {(room.racks || []).map((rack) => (
                  <div key={rack.rackName} className="mbl-rack">
                    <h3>{rack.rackName}</h3>
                    <div className="mbl-rack-grid">
                      {(rack.tubs || []).map((tub) => (
                        <button key={`${rack.rackName}-${tub.tub}`} type="button"
                          className={`mbl-tub ${tub.alert ? "is-alert" : ""} ${tub.feedingDue ? "is-feed" : ""}`}
                          onClick={() => openAnimal(tub.animalId)}>
                          <strong>{tub.tub}</strong>
                          <small>{tub.name}</small>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ))}
            {!rackData.rooms?.length && <p className="mbl-empty">No rack data. Configure rooms in the desktop app.</p>}
          </div>
        )}

        {/* ── MORE TAB ── */}
        {!loading && tab === "more" && (
          <div className="mbl-screen">
            <div className="mbl-more-grid">
              <button type="button" className="mbl-more-card" onClick={() => setTab("rack")}>
                <span>⬛</span><strong>Rack Mode</strong>
              </button>
              <button type="button" className="mbl-more-card" onClick={() => setTab("messages")}>
                <span>💬</span><strong>Messages</strong>
              </button>
            </div>
            <div className="mbl-section-label">Account</div>
            <div className="mbl-more-list">
              <button type="button" className="mbl-more-row" onClick={onSwitchMode}>⇄ Switch to Terminal</button>
              <button type="button" className="mbl-more-row mbl-more-row--danger" onClick={onSignOut}>Sign out</button>
            </div>
          </div>
        )}

        {/* ── MESSAGES TAB ── */}
        {!loading && tab === "messages" && (
          <div className="mbl-screen">
            <div className="mbl-section-label">Communication</div>
            {(comms?.pendingConfirmations || []).map((item) => (
              <div key={item.id} className="mbl-task-card">
                <div className="mbl-task-info">
                  <strong>{item.interpretedAction}</strong>
                  <span>{item.originalMessage}</span>
                </div>
                <div className="mbl-task-btns">
                  <button type="button" className="mbl-btn mbl-btn--sm">Confirm</button>
                  <button type="button" className="mbl-btn mbl-btn--sm">Cancel</button>
                </div>
              </div>
            ))}
            {!(comms?.pendingConfirmations?.length) && <p className="mbl-empty">No pending messages.</p>}
          </div>
        )}
      </div>

      {/* Quick action modals */}
      {animal && modal === "feed"   && <FeedModal   animal={animal} onSave={(p) => doQuickAction("feed", p)}   onClose={() => setModal(null)} />}
      {animal && modal === "weight" && <WeightModal animal={animal} onSave={(p) => doQuickAction("weight", p)} onClose={() => setModal(null)} />}
      {animal && modal === "shed"   && <ShedModal   animal={animal} onSave={(p) => doQuickAction("shed", p)}   onClose={() => setModal(null)} />}
      {animal && modal === "note"   && <NoteModal   animal={animal} onSave={(p) => doQuickAction("note", p)}   onClose={() => setModal(null)} />}

      <nav className="mbl-bottom-nav">
        {bottomTabs.map(({ key, label }) => (
          <button key={key} type="button"
            className={`mbl-nav-btn ${tab === key ? "is-active" : ""}`}
            onClick={() => { setAnimal(null); setTab(key); }}>
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────
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

  return <FullMode onSwitchMode={handleSwitchMode} onSignOut={handleSignOut} deviceId={deviceId} />;
}
