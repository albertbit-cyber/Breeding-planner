import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  fetchBreederSnapshot,
  fetchMobileCommunication,
  fetchMobilePermissions,
  fetchMobileRackMode,
  fetchMobileTasks,
  logMobileClean,
  logMobileFeed,
  logMobileNote,
  logMobileShed,
  logMobileWater,
  logMobileWeight,
  scanMobileQr,
  syncMobileQueue,
} from "../../shared/apiClient";

const DEVICE_KEY = "breedingPlannerMobileDeviceId";
const RECENT_KEY = "breedingPlannerMobileRecentAnimals";
const QUEUE_KEY = "breedingPlannerMobileSyncQueue";

const getDeviceId = () => {
  try {
    const existing = localStorage.getItem(DEVICE_KEY);
    if (existing) return existing;
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
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore private mode storage failures.
  }
};

const title = (value) => String(value || "").replace(/[_-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
const first = (items) => Array.isArray(items) && items.length ? items[0] : null;
const locationText = (animal) => [animal?.room, animal?.rack, animal?.tub].filter(Boolean).join(" / ") || "No location";
const featureAllowed = (permissions, featureKey) => Boolean(permissions?.[featureKey]?.allowed);
const denied = (permissions, featureKey) => permissions?.[featureKey] || { reason: "This feature is locked.", currentTier: "Current plan", requiredTier: "" };

function StatusChip({ children, tone = "neutral" }) {
  return <span className={`mobile-chip mobile-chip--${tone}`}>{children}</span>;
}

function AlertBadge({ children }) {
  return <span className="mobile-alert-badge">{children}</span>;
}

function OfflineSyncBanner({ online, queued, onSync }) {
  return (
    <div className={`mobile-sync-banner ${online ? "is-online" : "is-offline"}`}>
      <span>{online ? "Online" : "Offline"} - {queued} queued update{queued === 1 ? "" : "s"}</span>
      {queued ? <button type="button" onClick={onSync}>Sync</button> : <strong>Synced</strong>}
    </div>
  );
}

function LockedFeatureNoticeMobile({ access, featureName }) {
  return (
    <section className="mobile-locked">
      <strong>{featureName || "Feature locked"}</strong>
      <p>{access?.reason || "This feature is not included in your current plan."}</p>
      <dl>
        <dt>Current plan</dt><dd>{access?.currentTier || access?.tier || "Current plan"}</dd>
        <dt>Required plan</dt><dd>{access?.requiredTier || "Upgrade required"}</dd>
      </dl>
      <div>
        <button type="button" onClick={() => { window.location.hash = "/pricing"; }}>View plans</button>
        <button type="button" onClick={() => { window.location.hash = "/"; }}>Contact support</button>
      </div>
    </section>
  );
}

function TierAwareButton({ permissions, feature, children, onClick, className = "", ...props }) {
  const allowed = featureAllowed(permissions, feature);
  return (
    <button
      type="button"
      className={`${className} ${allowed ? "" : "is-locked"}`}
      onClick={allowed ? onClick : props.onLocked}
      {...props}
    >
      <span>{children}</span>
      {!allowed ? <small>Locked</small> : null}
    </button>
  );
}

function TierAwareTab({ permissions, feature, children, active, onClick }) {
  return (
    <button type="button" className={active ? "is-active" : ""} onClick={onClick}>
      {children}
      {!featureAllowed(permissions, feature) ? <small>Locked</small> : null}
    </button>
  );
}

function MobileBottomNav({ tab, setTab }) {
  const tabs = [
    ["scan", "Scan"],
    ["animals", "Animals"],
    ["tasks", "Tasks"],
    ["messages", "Messages"],
    ["more", "More"],
  ];
  return (
    <nav className="mobile-bottom-nav">
      {tabs.map(([key, label]) => (
        <button key={key} type="button" className={tab === key ? "is-active" : ""} onClick={() => setTab(key)}>
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}

function QRScannerScreen({ onScan, recent, tasks, message, setMessage }) {
  const [manual, setManual] = useState("");
  const [cameraOn, setCameraOn] = useState(false);
  const videoRef = useRef(null);

  useEffect(() => {
    if (!cameraOn || !navigator.mediaDevices?.getUserMedia) return undefined;
    let stream;
    let stopped = false;
    let timer;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
      .then((next) => {
        stream = next;
        if (videoRef.current) videoRef.current.srcObject = next;
        if ("BarcodeDetector" in window) {
          const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
          const detect = async () => {
            if (stopped || !videoRef.current) return;
            try {
              const codes = await detector.detect(videoRef.current);
              const value = codes?.[0]?.rawValue;
              if (value) {
                stopped = true;
                setCameraOn(false);
                onScan(value);
                return;
              }
            } catch {
              // Keep manual input available when detector support is partial.
            }
            timer = window.setTimeout(detect, 650);
          };
          timer = window.setTimeout(detect, 900);
        }
      })
      .catch(() => setMessage("Camera access failed. Use manual scan input."));
    return () => {
      stopped = true;
      if (timer) window.clearTimeout(timer);
      if (stream) stream.getTracks().forEach((track) => track.stop());
    };
  }, [cameraOn, onScan, setMessage]);

  return (
    <section className="mobile-screen mobile-scan-screen">
      <div className="mobile-hero-card">
        <p>Scan. See. Update.</p>
        <h1>Rack terminal</h1>
        <button type="button" className="mobile-scan-button" onClick={() => setCameraOn((value) => !value)}>
          {cameraOn ? "Close camera" : "Scan QR"}
        </button>
        {cameraOn ? (
          <div className="mobile-camera-box">
            <video ref={videoRef} autoPlay playsInline muted />
            <p>Point the camera at an animal, rack, sample, shipping, or order QR. Manual input stays available below.</p>
          </div>
        ) : null}
        <form className="mobile-manual-scan" onSubmit={(event) => { event.preventDefault(); onScan(manual); setManual(""); }}>
          <input value={manual} onChange={(event) => setManual(event.target.value)} placeholder="Scan or paste QR value" />
          <button type="submit">Open</button>
        </form>
      </div>
      {message ? <AlertBadge>{message}</AlertBadge> : null}
      <div className="mobile-section-head"><h2>Recent scans</h2></div>
      <div className="mobile-card-list">
        {!recent.length ? <p className="mobile-empty">No recent scans yet.</p> : null}
        {recent.slice(0, 5).map((animal) => (
          <button key={`${animal.appAnimalId}-${animal.updatedAt || ""}`} type="button" className="mobile-animal-row" onClick={() => onScan(animal.appAnimalId)}>
            {animal.imageUrl ? <img src={animal.imageUrl} alt="" /> : <span>{String(animal.name || animal.appAnimalId).slice(0, 1)}</span>}
            <strong>{animal.name || animal.appAnimalId}</strong>
            <small>{locationText(animal)}</small>
          </button>
        ))}
      </div>
      <div className="mobile-section-head"><h2>Today</h2><span>{tasks.length} tasks</span></div>
      <div className="mobile-card-list">
        {tasks.slice(0, 4).map((task) => <TaskCard key={task.id} task={task} compact onOpen={() => onScan(task.animalId)} />)}
      </div>
    </section>
  );
}

function QuickActionPanel({ animal, permissions, onAction, onLocked }) {
  const actions = [
    ["Feed", "mobile.quick_feed", "feed"],
    ["Weight", "mobile.quick_weight", "weight"],
    ["Shed", "mobile.quick_shed", "shed"],
    ["Clean", "mobile.quick_clean", "clean"],
    ["Water", "mobile.quick_water", "water"],
    ["Note", "mobile.notes", "note"],
    ["Photo", "mobile.photos", "photo"],
    ["Lab Test", "mobile.lab", "lab"],
  ];
  return (
    <div className="mobile-quick-actions">
      {actions.map(([label, feature, action]) => (
        <TierAwareButton
          key={action}
          permissions={permissions}
          feature={feature}
          onClick={() => onAction(action)}
          onLocked={() => onLocked(feature, label)}
        >
          {label}
        </TierAwareButton>
      ))}
    </div>
  );
}

function FeedLogModal({ animal, onSave, onClose }) {
  const [food, setFood] = useState("Rat pup");
  const [result, setResult] = useState("ate");
  return (
    <ActionSheet title="Feed" onClose={onClose}>
      <label>Food size / type<input value={food} onChange={(event) => setFood(event.target.value)} /></label>
      <div className="mobile-segment">
        {["ate", "refused"].map((item) => <button key={item} type="button" className={result === item ? "is-active" : ""} onClick={() => setResult(item)}>{title(item)}</button>)}
      </div>
      <button type="button" className="mobile-primary" onClick={() => onSave({ animalId: animal.appAnimalId, food, result })}>Save feed</button>
    </ActionSheet>
  );
}

function WeightLogModal({ animal, onSave, onClose }) {
  const [grams, setGrams] = useState(animal?.weight || "");
  return (
    <ActionSheet title="Weight" onClose={onClose}>
      <label>Grams<input type="number" inputMode="numeric" value={grams} onChange={(event) => setGrams(event.target.value)} /></label>
      <button type="button" className="mobile-primary" onClick={() => onSave({ animalId: animal.appAnimalId, grams })}>Save weight</button>
    </ActionSheet>
  );
}

function ShedLogModal({ animal, onSave, onClose }) {
  const [result, setResult] = useState("complete");
  return (
    <ActionSheet title="Shed" onClose={onClose}>
      <div className="mobile-segment">
        {["complete", "bad"].map((item) => <button key={item} type="button" className={result === item ? "is-active" : ""} onClick={() => setResult(item)}>{item === "bad" ? "Bad shed" : "Complete"}</button>)}
      </div>
      <button type="button" className="mobile-primary" onClick={() => onSave({ animalId: animal.appAnimalId, result })}>Save shed</button>
    </ActionSheet>
  );
}

function NoteModal({ animal, onSave, onClose }) {
  const [note, setNote] = useState("");
  const startVoice = () => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) return;
    const recognition = new Recognition();
    recognition.onresult = (event) => setNote((prev) => `${prev} ${event.results?.[0]?.[0]?.transcript || ""}`.trim());
    recognition.start();
  };
  return (
    <ActionSheet title="Note" onClose={onClose}>
      <textarea rows={5} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Type or use voice note" />
      <div className="mobile-action-row">
        <button type="button" onClick={startVoice}>Voice</button>
        <button type="button" className="mobile-primary" onClick={() => onSave({ animalId: animal.appAnimalId, note })}>Save note</button>
      </div>
    </ActionSheet>
  );
}

function ActionSheet({ title: sheetTitle, children, onClose }) {
  return (
    <section className="mobile-sheet">
      <div className="mobile-sheet-panel">
        <header><h2>{sheetTitle}</h2><button type="button" onClick={onClose}>Close</button></header>
        {children}
      </div>
    </section>
  );
}

function MobileAnimalProfile({ animal, permissions, onAction, onLocked }) {
  const [tab, setTab] = useState("overview");
  if (!animal) return null;
  const logs = animal.logs || {};
  const latestFeed = first(logs.feeds);
  const latestWeight = first(logs.weights);
  const latestShed = first(logs.sheds);
  return (
    <section className="mobile-profile">
      <header className="mobile-profile-header">
        {animal.imageUrl ? <img src={animal.imageUrl} alt="" /> : <div>{String(animal.name || "B").slice(0, 1)}</div>}
        <div>
          <h1>{animal.name}</h1>
          <p>{animal.appAnimalId} - {animal.sex || "Unknown sex"}</p>
          <strong>{animal.genetics || "Genetics not set"}</strong>
          <small>{locationText(animal)}</small>
        </div>
      </header>
      <div className="mobile-badge-row">
        {(animal.badges || []).map((badge) => <StatusChip key={badge} tone={/alert|quarantine|bad/i.test(badge) ? "warning" : "ok"}>{badge}</StatusChip>)}
      </div>
      <QuickActionPanel animal={animal} permissions={permissions} onAction={onAction} onLocked={onLocked} />
      <div className="mobile-tabs">
        {[
          ["overview", "Overview", "mobile.profile"],
          ["logs", "Logs", "mobile.profile"],
          ["breeding", "Breeding", "breeding.pairings"],
          ["health", "Health", "animals.health_logs"],
          ["lab", "Lab", "mobile.lab"],
          ["sales", "Sales", "mobile.sales"],
        ].map(([key, label, feature]) => (
          <TierAwareTab key={key} permissions={permissions} feature={feature} active={tab === key} onClick={() => setTab(key)}>{label}</TierAwareTab>
        ))}
      </div>
      {tab === "overview" ? (
        <div className="mobile-data-grid">
          <DataCard label="Last feed" value={latestFeed ? `${latestFeed.result || "fed"} ${latestFeed.food || ""}` : "No record"} />
          <DataCard label="Last weight" value={latestWeight ? `${latestWeight.grams || latestWeight.weight || animal.weight} g` : `${animal.weight || "-"} g`} />
          <DataCard label="Last shed" value={latestShed ? latestShed.result || latestShed.date : "No record"} />
          <DataCard label="Breeding" value={animal.breeding?.pairingStatus || "No active pairing"} />
          <DataCard label="Health" value={(animal.badges || []).includes("health alert") ? "Alert" : "Clear"} />
          <DataCard label="Lab" value={animal.lab?.orderStatus || "No order"} />
        </div>
      ) : null}
      {tab === "logs" ? <LogList logs={logs} /> : null}
      {tab === "breeding" ? featureAllowed(permissions, "breeding.pairings") ? <InfoPanel data={animal.breeding} /> : <LockedFeatureNoticeMobile access={denied(permissions, "breeding.pairings")} featureName="Breeding" /> : null}
      {tab === "health" ? featureAllowed(permissions, "animals.health_logs") ? <InfoPanel data={{ quarantine: animal.badges?.includes("quarantine") ? "Active" : "None", status: animal.status || "Normal", documents: "Open desktop for documents" }} /> : <LockedFeatureNoticeMobile access={denied(permissions, "animals.health_logs")} featureName="Health" /> : null}
      {tab === "lab" ? featureAllowed(permissions, "mobile.lab") ? <InfoPanel data={animal.lab} /> : <LockedFeatureNoticeMobile access={denied(permissions, "mobile.lab")} featureName="Lab Test" /> : null}
      {tab === "sales" ? featureAllowed(permissions, "mobile.sales") ? <InfoPanel data={animal.sales} /> : <LockedFeatureNoticeMobile access={denied(permissions, "mobile.sales")} featureName="Sales" /> : null}
    </section>
  );
}

function DataCard({ label, value }) {
  return <article className="mobile-data-card"><span>{label}</span><strong>{value}</strong></article>;
}

function LogList({ logs }) {
  const entries = [
    ...(logs.feeds || []).map((item) => ({ ...item, label: "Feed" })),
    ...(logs.weights || []).map((item) => ({ ...item, label: "Weight" })),
    ...(logs.sheds || []).map((item) => ({ ...item, label: "Shed" })),
    ...(logs.cleanings || []).map((item) => ({ ...item, label: "Clean" })),
    ...(logs.water || []).map((item) => ({ ...item, label: "Water" })),
    ...(logs.notes || []).map((item) => ({ ...item, label: "Note" })),
  ].sort((a, b) => String(b.createdAt || b.date || "").localeCompare(String(a.createdAt || a.date || ""))).slice(0, 60);
  return <div className="mobile-card-list">{entries.map((entry) => <article key={entry.id || `${entry.label}-${entry.createdAt}`} className="mobile-log-row"><strong>{entry.label}</strong><span>{entry.note || entry.result || entry.food || entry.grams || entry.date || "Saved"}</span><small>{entry.date || String(entry.createdAt || "").slice(0, 10)}</small></article>)}</div>;
}

function InfoPanel({ data }) {
  return <div className="mobile-card-list">{Object.entries(data || {}).map(([key, value]) => <DataCard key={key} label={title(key)} value={String(value || "-")} />)}</div>;
}

function TaskCard({ task, onComplete, onOpen, compact = false }) {
  return (
    <article className={`mobile-task-card ${compact ? "is-compact" : ""}`}>
      <div><strong>{task.type} {task.animalId}</strong><span>{task.location || "No location"}</span><small>{task.dueStatus}</small></div>
      <div>
        {onComplete ? <button type="button" onClick={() => onComplete(task, "done")}>Done</button> : null}
        {onComplete && task.type === "Feed" ? <button type="button" onClick={() => onComplete(task, "refused")}>Refused</button> : null}
        {onOpen ? <button type="button" onClick={onOpen}>Open</button> : null}
      </div>
    </article>
  );
}

function TaskListMobile({ tasks, onComplete, onOpen }) {
  const groups = ["Feed", "Water", "Clean", "Shed check", "Health alert", "Lab samples", "Shipping"];
  return (
    <section className="mobile-screen">
      <div className="mobile-section-head"><h1>Tasks</h1><span>{tasks.length} today</span></div>
      {groups.map((group) => {
        const rows = tasks.filter((task) => task.type === group || (group === "Feed" && task.type === "Feed"));
        if (!rows.length) return null;
        return <div key={group} className="mobile-task-group"><h2>{group}</h2>{rows.map((task) => <TaskCard key={task.id} task={task} onComplete={onComplete} onOpen={() => onOpen(task.animalId)} />)}</div>;
      })}
    </section>
  );
}

function RackModeMobile({ permissions, rackData, onOpen }) {
  if (!featureAllowed(permissions, "mobile.rack_mode")) {
    return <LockedFeatureNoticeMobile access={denied(permissions, "mobile.rack_mode")} featureName="Rack Mode" />;
  }
  return (
    <section className="mobile-screen">
      <h1>Rack Mode</h1>
      {(rackData.rooms || []).map((room) => (
        <article key={room.roomName} className="mobile-rack-room">
          <h2>{room.roomName}</h2>
          {(room.racks || []).map((rack) => (
            <div key={rack.rackName}>
              <h3>{rack.rackName}</h3>
              <div className="mobile-rack-grid">
                {(rack.tubs || []).map((tub) => (
                  <button key={`${rack.rackName}-${tub.tub}`} type="button" className={`${tub.alert ? "is-alert" : ""} ${tub.feedingDue ? "is-feed-due" : ""} ${tub.cleaningDue ? "is-clean-due" : ""}`} onClick={() => onOpen(tub.animalId)}>
                    <strong>{tub.tub}</strong>
                    <small>{tub.name}</small>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </article>
      ))}
    </section>
  );
}

function MobileCommunicationCenter({ permissions, data }) {
  if (!featureAllowed(permissions, "mobile.communication")) {
    return <LockedFeatureNoticeMobile access={denied(permissions, "mobile.communication")} featureName="Communication Center" />;
  }
  return (
    <section className="mobile-screen">
      <div className="mobile-section-head"><h1>Messages</h1><StatusChip tone={data?.telegram?.connected ? "ok" : "neutral"}>{data?.telegram?.status || "Telegram not connected"}</StatusChip></div>
      <h2>Pending confirmations</h2>
      <div className="mobile-card-list">
        {(data?.pendingConfirmations || []).map((item) => (
          <article key={item.id} className="mobile-message-card">
            <strong>{item.interpretedAction}</strong>
            <p>{item.originalMessage}</p>
            <small>{item.targetAnimal || "No target animal"}</small>
            <div><button type="button">Confirm</button><button type="button">Edit</button><button type="button">Cancel</button></div>
          </article>
        ))}
        {!(data?.pendingConfirmations || []).length ? <p className="mobile-empty">No pending confirmations.</p> : null}
      </div>
      <h2>Activity log</h2>
      <div className="mobile-card-list">
        {(data?.activity || []).slice(0, 10).map((item) => <article key={item.id} className="mobile-log-row"><strong>{item.title}</strong><span>{item.message}</span></article>)}
      </div>
    </section>
  );
}

export default function MobileApp() {
  const [tab, setTab] = useState("scan");
  const [permissions, setPermissions] = useState({});
  const [plan, setPlan] = useState("Current plan");
  const [animal, setAnimal] = useState(null);
  const [animals, setAnimals] = useState([]);
  const [recent, setRecent] = useState(() => readJson(RECENT_KEY, []));
  const [tasks, setTasks] = useState([]);
  const [rackData, setRackData] = useState({ rooms: [] });
  const [communication, setCommunication] = useState(null);
  const [modal, setModal] = useState(null);
  const [locked, setLocked] = useState(null);
  const [message, setMessage] = useState("");
  const [online, setOnline] = useState(() => navigator.onLine !== false);
  const [queue, setQueue] = useState(() => readJson(QUEUE_KEY, []));
  const deviceId = useMemo(getDeviceId, []);

  const refresh = async () => {
    const [permissionData, taskData, snapshot] = await Promise.all([
      fetchMobilePermissions({ deviceId, platform: navigator.platform || "web" }),
      fetchMobileTasks().catch(() => ({ tasks: [] })),
      fetchBreederSnapshot().catch(() => ({ animals: [] })),
    ]);
    setPermissions(permissionData.permissions || {});
    setPlan(permissionData.plan || "Current plan");
    setTasks(Array.isArray(taskData.tasks) ? taskData.tasks : []);
    setAnimals(Array.isArray(snapshot.animals) ? snapshot.animals : []);
  };

  useEffect(() => {
    refresh().catch((error) => setMessage(error instanceof Error ? error.message : "Mobile app failed to load."));
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => writeJson(QUEUE_KEY, queue), [queue]);
  useEffect(() => writeJson(RECENT_KEY, recent), [recent]);

  const openAnimal = async (qrCode) => {
    if (!qrCode) return;
    try {
      const result = await scanMobileQr({ qrCode, metadata: { deviceId } });
      if (result.animal) {
        setAnimal(result.animal);
        setRecent((prev) => [result.animal, ...prev.filter((item) => item.appAnimalId !== result.animal.appAnimalId)].slice(0, 12));
        setTab("animals");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "QR scan failed.");
    }
  };

  const lockedFeature = (feature, featureName) => setLocked({ featureName, access: denied(permissions, feature) });

  const saveAction = async (type, payload) => {
    const api = { feed: logMobileFeed, weight: logMobileWeight, shed: logMobileShed, note: logMobileNote, clean: logMobileClean, water: logMobileWater }[type];
    if (!api) {
      lockedFeature(type === "lab" ? "mobile.lab" : type === "photo" ? "mobile.photos" : "mobile.profile", title(type));
      return;
    }
    if (!online) {
      setQueue((prev) => [...prev, { id: `queued-${Date.now()}`, actionType: type, payload, deviceId }]);
      setModal(null);
      setMessage("Saved offline. It will sync when online.");
      return;
    }
    try {
      const result = await api(payload);
      setAnimal(result.animal);
      setModal(null);
      setMessage(`${title(type)} saved.`);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Save failed.");
    }
  };

  const completeTask = async (task, result) => {
    const type = task.type === "Feed" ? "feed" : task.type === "Water" ? "water" : task.type === "Clean" ? "clean" : "note";
    await saveAction(type, { animalId: task.animalId, result, note: `${task.type} ${result}` });
  };

  const startAction = (type) => {
    if ((type === "clean" || type === "water") && animal?.appAnimalId) {
      saveAction(type, { animalId: animal.appAnimalId });
      return;
    }
    setModal(type);
  };

  const runSync = async () => {
    if (!queue.length) return;
    try {
      await syncMobileQueue({ deviceId, actions: queue });
      setQueue([]);
      setMessage("Offline updates synced.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sync failed.");
    }
  };

  const loadRack = async () => {
    try {
      setRackData(await fetchMobileRackMode());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Rack mode failed.");
    }
  };

  const loadCommunication = async () => {
    try {
      setCommunication(await fetchMobileCommunication());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Communication failed.");
    }
  };

  useEffect(() => {
    if (tab === "more") loadRack();
    if (tab === "messages") loadCommunication();
  }, [tab]);

  return (
    <main className="mobile-app-shell">
      <OfflineSyncBanner online={online} queued={queue.length} onSync={runSync} />
      <header className="mobile-topbar">
        <button type="button" onClick={() => { window.location.hash = "/"; }}>Start</button>
        <strong>Breeding Planner Mobile</strong>
        <span>{plan}</span>
      </header>
      {tab === "scan" ? <QRScannerScreen onScan={openAnimal} recent={recent} tasks={tasks} message={message} setMessage={setMessage} /> : null}
      {tab === "animals" ? (
        <section className="mobile-screen">
          {animal ? <MobileAnimalProfile animal={animal} permissions={permissions} onAction={startAction} onLocked={lockedFeature} /> : (
            <>
              <h1>Animals</h1>
              <div className="mobile-card-list">
                {animals.map((item) => (
                  <button key={item.id || item.appAnimalId} type="button" className="mobile-animal-row" onClick={() => openAnimal(item.id || item.appAnimalId)}>
                    <span>{String(item.name || item.id || "B").slice(0, 1)}</span>
                    <strong>{item.name || item.id}</strong>
                    <small>{[item.room, item.rack, item.tub].filter(Boolean).join(" / ") || "Open profile"}</small>
                  </button>
                ))}
              </div>
            </>
          )}
        </section>
      ) : null}
      {tab === "tasks" ? <TaskListMobile tasks={tasks} onComplete={completeTask} onOpen={openAnimal} /> : null}
      {tab === "messages" ? <MobileCommunicationCenter permissions={permissions} data={communication || {}} /> : null}
      {tab === "more" ? <RackModeMobile permissions={permissions} rackData={rackData} onOpen={openAnimal} /> : null}
      <button type="button" className="mobile-floating-scan" onClick={() => setTab("scan")}>Scan QR</button>
      <MobileBottomNav tab={tab} setTab={setTab} />
      {modal === "feed" ? <FeedLogModal animal={animal} onSave={(payload) => saveAction("feed", payload)} onClose={() => setModal(null)} /> : null}
      {modal === "weight" ? <WeightLogModal animal={animal} onSave={(payload) => saveAction("weight", payload)} onClose={() => setModal(null)} /> : null}
      {modal === "shed" ? <ShedLogModal animal={animal} onSave={(payload) => saveAction("shed", payload)} onClose={() => setModal(null)} /> : null}
      {modal === "note" ? <NoteModal animal={animal} onSave={(payload) => saveAction("note", payload)} onClose={() => setModal(null)} /> : null}
      {locked ? (
        <section className="mobile-sheet">
          <div className="mobile-sheet-panel">
            <header><h2>Upgrade</h2><button type="button" onClick={() => setLocked(null)}>Close</button></header>
            <LockedFeatureNoticeMobile access={locked.access} featureName={locked.featureName} />
          </div>
        </section>
      ) : null}
    </main>
  );
}
