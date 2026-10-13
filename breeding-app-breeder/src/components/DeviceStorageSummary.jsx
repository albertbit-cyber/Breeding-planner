import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { estimateDeviceStorage, getDeviceStore } from "../platform/deviceStore.js";

// What the collection takes up on this device, and how much room is left. Before this the
// first sign of a full store was a change silently not being saved.

const formatBytes = (bytes) => {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(0)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

// Inline photos are base64 text inside the animal records; UTF-16 doubles it in memory, which
// is the same accounting the store's usage() uses.
const inlinePhotoBytes = (snakes) => {
  let total = 0;
  (Array.isArray(snakes) ? snakes : []).forEach((snake) => {
    (Array.isArray(snake?.photos) ? snake.photos : []).forEach((photo) => {
      if (typeof photo?.url === "string" && photo.url.startsWith("data:")) total += photo.url.length * 2;
    });
    if (typeof snake?.imageUrl === "string" && snake.imageUrl.startsWith("data:")) total += snake.imageUrl.length * 2;
  });
  return total;
};

const measureRows = (store) => {
  const usage = store.usage();
  const byKey = new Map(usage.map((row) => [row.key, row.bytes]));
  const grouped = new Set();
  const result = GROUPS.map((group) => {
    group.keys.forEach((key) => grouped.add(key));
    return { id: group.id, bytes: group.keys.reduce((sum, key) => sum + (byKey.get(key) || 0), 0) };
  });
  result.push({ id: "other", bytes: usage.filter((row) => !grouped.has(row.key)).reduce((sum, row) => sum + row.bytes, 0) });
  return result;
};

// An empty list is stored as "[]"; a row for a few bytes is noise.
const MIN_ROW_BYTES = 1024;

const GROUPS = [
  { id: "animals", keys: ["breedingPlannerSnakes"] },
  { id: "vault", keys: ["breedingPlannerBackupVault", "breedingPlannerBackupSnapshot"] },
  { id: "undo", keys: ["breedingPlannerPreRestoreSnapshot"] },
];

export default function DeviceStorageSummary({ snakes, refreshKey }) {
  const { t } = useTranslation();
  const [estimate, setEstimate] = useState(null);
  const store = getDeviceStore();
  const status = store.status();

  useEffect(() => {
    let cancelled = false;
    estimateDeviceStorage().then((result) => {
      if (!cancelled) setEstimate(result);
    });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  // The app writes a change to the store in an effect, after this component has rendered and
  // after its own effects have run. Measuring a tick later reads what was just written rather
  // than the value before it.
  const [rows, setRows] = useState(() => measureRows(store));
  useEffect(() => {
    const timer = setTimeout(() => setRows(measureRows(store)), 0);
    return () => clearTimeout(timer);
  }, [store, snakes, refreshKey]);
  const photoBytes = useMemo(() => inlinePhotoBytes(snakes), [snakes]);
  const total = rows.reduce((sum, row) => sum + row.bytes, 0);

  const labels = {
    animals: t("setup.storage.rowAnimals", { defaultValue: "Animals and their photos" }),
    vault: t("setup.storage.rowVault", { defaultValue: "Backup vault on this device" }),
    undo: t("setup.storage.rowUndo", { defaultValue: "Copy kept to undo the last restore" }),
    other: t("setup.storage.rowOther", { defaultValue: "Pairings, breeding records and settings" }),
  };

  return (
    <div className="space-y-3">
      <div>
        <div className="font-semibold text-sm">{t("setup.storage.title", { defaultValue: "Storage on this device" })}</div>
        <div className="text-xs text-neutral-500 mt-1">
          {t("setup.storage.total", { size: formatBytes(total), defaultValue: "Your collection takes up {{size}} here." })}
          {estimate?.quota
            ? ` ${t("setup.storage.available", { size: formatBytes(Math.max(0, estimate.quota - estimate.usage)), defaultValue: "{{size}} more is available to the app." })}`
            : ""}
        </div>
      </div>
      <dl className="text-xs grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 max-w-md">
        {rows.filter((row) => row.bytes >= MIN_ROW_BYTES).map((row) => (
          <React.Fragment key={row.id}>
            <dt className="text-neutral-600">
              {labels[row.id]}
              {row.id === "animals" && photoBytes > 0 ? (
                <span className="text-neutral-400">
                  {" "}{t("setup.storage.photosShare", { size: formatBytes(photoBytes), defaultValue: "(photos: {{size}})" })}
                </span>
              ) : null}
            </dt>
            <dd className="text-right tabular-nums text-neutral-700">{formatBytes(row.bytes)}</dd>
          </React.Fragment>
        ))}
      </dl>
      {status.mode === "local" ? (
        <div className="text-xs text-amber-700">
          {t("setup.storage.legacyMode", { defaultValue: "This browser would not open the app's main storage, so your collection is kept in a small store limited to about 5 MB. Large collections with photos may not fit." })}
        </div>
      ) : null}
      {status.lastFailure ? (
        <div className="text-xs text-red-600" role="status">
          {t("setup.storage.unsaved", { defaultValue: "Some recent changes have not been saved on this device yet. The app keeps trying; save a backup file before closing it." })}
        </div>
      ) : null}
    </div>
  );
}
