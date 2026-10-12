// Android implementation of the platform module. Only ever loaded inside the Capacitor shell,
// so the plugin imports stay out of the web bundle.
import { App } from "@capacitor/app";
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";
import { Share } from "@capacitor/share";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";

// A WebView cannot "download". The file is written to the app's cache and handed to the
// system share sheet, where the keeper picks Files, Drive, mail or any other target. The
// FileProvider in AndroidManifest.xml already exposes the cache directory.
export const saveFile = async ({ name, mime, data, title }) => {
  const text = data instanceof Blob ? await data.text() : String(data ?? "");
  const safeName = String(name || "export.txt").replace(/[\\/:*?"<>|]+/g, "-");
  const path = `exports/${safeName}`;
  const written = await Filesystem.writeFile({
    path,
    data: text,
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
    recursive: true,
  });
  try {
    await Share.share({
      title: title || safeName,
      dialogTitle: title || safeName,
      url: written.uri,
    });
  } catch (err) {
    // Dismissing the sheet rejects with a cancel message; that is not an error to surface.
    const message = String(err?.message || err || "").toLowerCase();
    if (message.includes("cancel") || message.includes("canceled") || message.includes("cancelled")) {
      return { method: "share", name: safeName, cancelled: true };
    }
    throw err;
  }
  return { method: "share", name: safeName, mime };
};

const impactFor = {
  light: ImpactStyle.Light,
  medium: ImpactStyle.Medium,
  heavy: ImpactStyle.Heavy,
};
const notificationFor = {
  success: NotificationType.Success,
  warning: NotificationType.Warning,
  error: NotificationType.Error,
};

export const haptic = async (kind = "light") => {
  if (notificationFor[kind]) {
    await Haptics.notification({ type: notificationFor[kind] });
    return;
  }
  await Haptics.impact({ style: impactFor[kind] || ImpactStyle.Light });
};

export const applyTheme = async (mode) => {
  // Style.Dark means dark status bar content; use it on light surfaces.
  await StatusBar.setStyle({ style: mode === "dark" ? Style.Light : Style.Dark });
};

let backListener = null;

export const init = async ({ runBackHandlers }) => {
  if (!backListener) {
    backListener = await App.addListener("backButton", () => {
      if (runBackHandlers()) return;
      App.minimizeApp();
    });
  }
  try {
    const mode = document.documentElement.dataset.themeMode === "dark" ? "dark" : "light";
    await applyTheme(mode);
  } catch {
    // Not fatal.
  }
  try {
    await SplashScreen.hide();
  } catch {
    // Already hidden, or the plugin is absent.
  }
};
