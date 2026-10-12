// The .bpbackup file: how it is named, serialized, saved and checked on the way back in.
//
// Saving goes through the platform module, so the same call downloads in a browser, downloads
// in Electron and opens the share sheet on the phone. App.jsx used to carry three copies of an
// anchor-download routine for the three places a backup can be saved from.
import { saveFile } from "../../platform/index.js";

export const BACKUP_FILE_EXTENSION = "bpbackup";
export const BACKUP_FILE_DOT_EXTENSION = `.${BACKUP_FILE_EXTENSION}`;
export const BACKUP_FILE_MIME = "application/x-breeding-planner-backup+json";
export const BACKUP_FORMAT_VERSION = 1;

export const buildBackupFilename = (basename, timestamp) => `${basename}-${timestamp}${BACKUP_FILE_DOT_EXTENSION}`;

export const fileSafeName = (value, fallback = "serpentora-backup") => {
  const cleaned = String(value || "").replace(/[\\/:*?"<>|]+/g, "-").trim();
  return cleaned || fallback;
};

export const isoToFileTimestamp = (iso) => String(iso || new Date().toISOString()).replace(/[:.]/g, "-");

export const serializeBackup = (payload) => JSON.stringify(payload, null, 2);

// saveBackupFile(payload, { filename, title }) -> { method, name, cancelled? }
export const saveBackupFile = async (payload, { filename, title } = {}) => {
  if (!payload || typeof payload !== "object") throw new Error("Nothing to back up.");
  const name = filename || buildBackupFilename("serpentora-backup", isoToFileTimestamp(payload.generatedAt));
  return saveFile({
    name,
    mime: BACKUP_FILE_MIME,
    data: serializeBackup(payload),
    title: title || name,
  });
};

// Counts shown in the "backup saved" feedback line.
export const describeBackupPayload = (payload = {}) => ({
  snakes: Array.isArray(payload?.snakes) ? payload.snakes.length : 0,
  pairings: Array.isArray(payload?.pairings) ? payload.pairings.length : 0,
});

// Throws a plain-language error when the file is not a backup this build can restore.
// Returns the payload otherwise. The desktop never checked `version`, so a file from a future
// format would have been applied field by field and silently lost whatever it did not know.
export const assertRestorableBackup = (payload) => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Backup file is invalid.");
  }
  if (payload.version !== undefined && payload.version !== null) {
    const version = Number(payload.version);
    if (!Number.isFinite(version)) throw new Error("Backup file has an unreadable version number.");
    if (version > BACKUP_FORMAT_VERSION) {
      throw new Error(`This backup was made by a newer Serpentora (format ${version}). Update the app before restoring it.`);
    }
  }
  const hasSnakes = Array.isArray(payload.snakes) && payload.snakes.length > 0;
  const hasPairings = Array.isArray(payload.pairings) && payload.pairings.length > 0;
  if (!hasSnakes && !hasPairings) {
    throw new Error("Backup file does not contain any animals or pairings.");
  }
  return payload;
};

// Validates a picked file's name and declared type before it is read. `lenient` is for the
// phone: Android content providers report names and MIME types unreliably (a transferred
// backup may arrive as application/octet-stream, text/plain, or with a mangled name), so there
// only an obviously wrong extension is refused and the contents decide on parse.
export const assertBackupFileSelectable = (file, { allowLegacyJson = false, lenient = false } = {}) => {
  const name = typeof file?.name === "string" ? file.name : "";
  const lowerName = name.toLowerCase();
  let isNativeBackup = !!name && lowerName.endsWith(BACKUP_FILE_DOT_EXTENSION);
  const isLegacyJson = !!name && lowerName.endsWith(".json");
  if (lenient) {
    if (!isNativeBackup && !isLegacyJson) {
      const extension = lowerName.includes(".") ? lowerName.slice(lowerName.lastIndexOf(".") + 1) : "";
      const obviouslyWrong = ["jpg", "jpeg", "png", "gif", "webp", "heic", "mp4", "mov", "pdf", "apk", "zip"];
      if (obviouslyWrong.includes(extension)) {
        throw new Error(`That is a .${extension} file, not a ${BACKUP_FILE_DOT_EXTENSION} backup.`);
      }
      isNativeBackup = true;
    }
    return { isNativeBackup: isNativeBackup || !isLegacyJson, isLegacyJson };
  }
  if (!isNativeBackup && !(allowLegacyJson && isLegacyJson)) {
    throw new Error(`Select a ${BACKUP_FILE_DOT_EXTENSION} backup${allowLegacyJson ? " or legacy .json file" : ""}.`);
  }
  if (file.type) {
    const normalizedType = String(file.type).toLowerCase();
    const allowedNativeTypes = [BACKUP_FILE_MIME, "application/octet-stream", "application/json"];
    const allowedLegacyTypes = ["application/json", "text/json", "application/octet-stream"];
    if (isNativeBackup && !allowedNativeTypes.includes(normalizedType)) {
      throw new Error("Unsupported backup file type.");
    }
    if (!isNativeBackup && allowLegacyJson && isLegacyJson && !allowedLegacyTypes.includes(normalizedType)) {
      throw new Error("Unsupported legacy backup file type.");
    }
  }
  return { isNativeBackup, isLegacyJson };
};
