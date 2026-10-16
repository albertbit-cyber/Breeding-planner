// The one place the app talks to the device it runs on.
//
// Browser, Electron and the Android shell each do these things differently, and before this
// module existed the differences leaked into App.jsx as three copies of an anchor-download
// routine and a second app for the phone. Every caller goes through `platform` now; the
// Android implementation loads lazily so the web bundle never carries the Capacitor plugins.

const detectKind = () => {
  if (typeof window === "undefined") return "web";
  try {
    const cap = window.Capacitor;
    if (cap && typeof cap.isNativePlatform === "function" && cap.isNativePlatform()) {
      return cap.getPlatform?.() === "ios" ? "ios" : "android";
    }
  } catch {
    // Capacitor is absent in the browser; fall through.
  }
  if (window.electronAPI) return "electron";
  return "web";
};

export const platformKind = detectKind();
export const isNativeShell = platformKind === "android" || platformKind === "ios";

// Hardware back on Android. Screens and sheets register a handler while they are open; the
// most recently registered one that returns true wins. With nothing registered the app goes
// to the background instead of quitting, which is what every other Android app does.
const backHandlers = [];
export const onBackButton = (handler) => {
  if (typeof handler !== "function") return () => {};
  backHandlers.push(handler);
  return () => {
    const index = backHandlers.lastIndexOf(handler);
    if (index >= 0) backHandlers.splice(index, 1);
  };
};
export const runBackHandlers = () => {
  for (let i = backHandlers.length - 1; i >= 0; i -= 1) {
    try {
      if (backHandlers[i]() === true) return true;
    } catch (err) {
      console.warn("Back handler failed", err);
    }
  }
  return false;
};

// Browser: a temporary anchor click. Electron routes downloads through the same path.
const saveFileWeb = async ({ name, mime, data }) => {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("Downloads are not supported in this environment.");
  }
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime || "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { method: "download", name };
};

let nativeModulePromise = null;
const loadNative = () => {
  if (!nativeModulePromise) nativeModulePromise = import("./android.js");
  return nativeModulePromise;
};

// saveFile({ name, mime, data, title }) -> { method: 'download' | 'share', name }
export const saveFile = async (options) => {
  if (isNativeShell) {
    const native = await loadNative();
    return native.saveFile(options);
  }
  return saveFileWeb(options);
};

// haptic('light' | 'medium' | 'success' | 'warning' | 'error') is a no-op off the phone.
export const haptic = async (kind = "light") => {
  if (!isNativeShell) return;
  try {
    const native = await loadNative();
    await native.haptic(kind);
  } catch {
    // Haptics are a nicety; never let them break an action.
  }
};

// Called once from AppEntry. Wires the back button, status bar and splash screen on the
// phone; does nothing elsewhere.
export const initPlatform = async () => {
  if (typeof document !== "undefined") {
    document.documentElement.dataset.platform = platformKind;
  }
  if (!isNativeShell) return;
  try {
    const native = await loadNative();
    await native.init({ runBackHandlers });
  } catch (err) {
    console.warn("Native platform init failed", err);
  }
};

// Theme changes repaint the status bar so it never sits light-on-light.
export const applyPlatformTheme = async (mode) => {
  if (!isNativeShell) return;
  try {
    const native = await loadNative();
    await native.applyTheme(mode);
  } catch {
    // Status bar styling is cosmetic.
  }
};

export const platform = {
  kind: platformKind,
  isNative: isNativeShell,
  saveFile,
  haptic,
  onBackButton,
  init: initPlatform,
  applyTheme: applyPlatformTheme,
};

export default platform;
