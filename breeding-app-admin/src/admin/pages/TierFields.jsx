import React from "react";
import { ANIMALS_FEATURE, PHOTOS_FEATURE, MAX_PHOTOS_PER_ANIMAL, describeAnimalPhotoLimits, hasLimit } from "./tierForm";

/** Name, prices and visibility: the parts of a tier a keeper sees on the plans page. */
export function TierBasicsFields({ form, setForm, isNew = false }) {
  const set = (key) => (e) => setForm((p) => ({ ...p, [key]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  return (
    <div className="admin-action-grid">
      <label>Name *<input value={form.name} onChange={set("name")} required /></label>
      <label>
        Key
        <input value={form.key} onChange={set("key")} disabled={!isNew} placeholder={isNew ? "from the name" : ""} />
      </label>
      <label>Monthly price<input type="number" step="0.01" min="0" value={form.monthlyPrice} onChange={set("monthlyPrice")} /></label>
      <label>Yearly price<input type="number" step="0.01" min="0" value={form.yearlyPrice} onChange={set("yearlyPrice")} /></label>
      <label>Currency<input value={form.currency} onChange={(e) => setForm((p) => ({ ...p, currency: e.target.value.toUpperCase() }))} maxLength={3} /></label>
      <label>Sort order<input type="number" value={form.sortOrder} onChange={set("sortOrder")} /></label>
      <label style={{ gridColumn: "1 / -1" }}>Short description<textarea rows={2} value={form.shortDescription} onChange={set("shortDescription")} style={{ width: "100%", resize: "vertical" }} /></label>
      <label className="admin-checkbox-row"><input type="checkbox" checked={form.isActive} onChange={set("isActive")} /> Active</label>
      <label className="admin-checkbox-row"><input type="checkbox" checked={form.isPublic} onChange={set("isPublic")} /> Publicly visible</label>
    </div>
  );
}

function LimitField({ label, hint, entry, onToggle, onLimit, max }) {
  return (
    <div className="admin-tier-limit">
      <label className="admin-checkbox-row">
        <input type="checkbox" checked={Boolean(entry?.enabled)} onChange={onToggle} />
        <span>{label}</span>
      </label>
      <input
        type="number"
        min="0"
        max={max}
        className="admin-limit-input"
        value={entry?.limit ?? ""}
        onChange={(e) => onLimit(e.target.value)}
        disabled={!entry?.enabled}
        placeholder="∞"
        aria-label={`${label} (blank for unlimited)`}
      />
      <span className="admin-tier-limit__hint">{hint}</span>
    </div>
  );
}

/**
 * The two limits a keeper meets every day, set side by side: how many animals the account keeps,
 * and how many photos each of them can have. Blank is unlimited.
 */
export function AnimalPhotoLimits({ featureMap, onToggle, onLimit }) {
  return (
    <div className="admin-tier-limits">
      <LimitField
        label="Animals in the collection"
        hint="Blank = unlimited. Archived animals do not count."
        entry={featureMap[ANIMALS_FEATURE]}
        onToggle={() => onToggle(ANIMALS_FEATURE)}
        onLimit={(value) => onLimit(ANIMALS_FEATURE, value)}
      />
      <LimitField
        label="Photos per animal"
        hint={`Blank = no tier limit (the technical cap of ${MAX_PHOTOS_PER_ANIMAL} still applies). Off = no photos.`}
        entry={featureMap[PHOTOS_FEATURE]}
        onToggle={() => onToggle(PHOTOS_FEATURE)}
        onLimit={(value) => onLimit(PHOTOS_FEATURE, value)}
        max={MAX_PHOTOS_PER_ANIMAL}
      />
      <p className="admin-tier-limits__summary">{describeAnimalPhotoLimits(featureMap)}</p>
      <p className="admin-muted admin-tier-limits__note">
        Lowering a limit never removes anything. An account over it keeps every animal and photo, and cannot add more until it is under.
      </p>
    </div>
  );
}

/** Every other feature, grouped as the catalogue groups them. */
export function FeatureMatrix({ features, featureMap, onToggle, onLimit, skip = [ANIMALS_FEATURE, PHOTOS_FEATURE] }) {
  const groups = features.reduce((acc, f) => {
    if (skip.includes(f.featureKey)) return acc;
    const g = f.featureGroup || "General";
    if (!acc[g]) acc[g] = [];
    acc[g].push(f);
    return acc;
  }, {});
  return Object.entries(groups).map(([group, feats]) => (
    <div key={group} style={{ marginBottom: 20 }}>
      <div className="admin-field-label" style={{ marginBottom: 8, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.05em" }}>{group}</div>
      <div className="admin-feature-matrix">
        {feats.map((f) => {
          const entry = featureMap[f.featureKey] || { enabled: false, limit: "" };
          return (
            <div key={f.featureKey} className="admin-feature-row">
              <label className="admin-checkbox-row" style={{ flex: 1, minWidth: 0 }}>
                <input type="checkbox" checked={Boolean(entry.enabled)} onChange={() => onToggle(f.featureKey)} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={f.description || f.featureName}>{f.featureName}</span>
              </label>
              {hasLimit(f) && (
                <input
                  type="number"
                  min="0"
                  className="admin-limit-input"
                  value={entry.limit}
                  onChange={(e) => onLimit(f.featureKey, e.target.value)}
                  disabled={!entry.enabled}
                  placeholder="∞"
                  aria-label={`${f.featureName} limit (blank for unlimited)`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  ));
}

/** State helpers shared by both tier screens. */
export function useFeatureMapSetters(setFeatureMap) {
  const onToggle = (key) => setFeatureMap((p) => ({ ...p, [key]: { limit: "", ...(p[key] || {}), enabled: !(p[key]?.enabled) } }));
  const onLimit = (key, value) => setFeatureMap((p) => ({ ...p, [key]: { enabled: true, ...(p[key] || {}), limit: value } }));
  return { onToggle, onLimit };
}
