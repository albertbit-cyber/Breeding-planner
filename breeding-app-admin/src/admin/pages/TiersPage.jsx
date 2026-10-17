import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminLayout from "../components/AdminLayout.jsx";
import Spinner from "../components/Spinner.jsx";
import { useToast } from "../hooks/useToast.jsx";
import { fetchSubscriptionTiers, updateSubscriptionTier } from "../../shared/apiClient";
import { ANIMALS_FEATURE, PHOTOS_FEATURE, featuresToMap, formToPayload, tierToForm } from "./tierForm";
import { AnimalPhotoLimits, TierBasicsFields, useFeatureMapSetters } from "./TierFields.jsx";

/**
 * Name, prices and the animal and photo limits. Only the two limit rows are sent back, so a quick
 * edit never touches the rest of the tier's features (the full editor has those).
 */
function TierQuickEditModal({ tier, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(() => tierToForm(tier));
  const [featureMap, setFeatureMap] = useState(() => {
    const all = featuresToMap(tier.features);
    return { [ANIMALS_FEATURE]: all[ANIMALS_FEATURE] || { enabled: false, limit: "" }, [PHOTOS_FEATURE]: all[PHOTOS_FEATURE] || { enabled: false, limit: "" } };
  });
  const { onToggle, onLimit } = useFeatureMapSetters(setFeatureMap);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    setBusy(true); setError("");
    try {
      await updateSubscriptionTier(tier.id, formToPayload(form, featureMap));
      toast(`Tier "${form.name}" saved.`);
      onSaved();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save tier.";
      setError(msg); toast(msg, "error");
    } finally { setBusy(false); }
  };

  return (
    <div className="admin-modal-backdrop">
      <div className="admin-modal" style={{ maxWidth: 700, maxHeight: "90vh", overflowY: "auto" }}>
        <div className="admin-modal-header">
          <h3>Edit Tier: {tier.name}</h3>
          <button type="button" className="admin-modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="admin-modal-body">
          {error && <div className="admin-error">{error}</div>}
          <TierBasicsFields form={form} setForm={setForm} />
          <h4 style={{ margin: "20px 0 10px" }}>Animals and photos</h4>
          <AnimalPhotoLimits featureMap={featureMap} onToggle={onToggle} onLimit={onLimit} />
        </div>
        <div className="admin-modal-footer">
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="button" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save tier"}</button>
        </div>
      </div>
    </div>
  );
}

const limitText = (feature, unit) => {
  if (!feature?.enabled) return `no ${unit}`;
  return feature.limitValue === null || feature.limitValue === undefined ? `unlimited ${unit}` : `${feature.limitValue} ${unit}`;
};

const money = (value, currency) => {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "EUR" }).format(Number(value || 0));
  } catch {
    return `${Number(value || 0).toFixed(2)} ${currency || ""}`.trim();
  }
};

export default function TiersPage() {
  const navigate = useNavigate();
  const [tiers, setTiers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null);

  const load = () => {
    setLoading(true); setError("");
    fetchSubscriptionTiers()
      .then((tierData) => setTiers(Array.isArray(tierData.tiers) ? tierData.tiers : []))
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load tiers."))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  return (
    <AdminLayout breadcrumbs={[{ label: "Tiers" }]}>
      {editing && (
        <TierQuickEditModal tier={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      )}
      <div className="admin-section">
        <div className="admin-section-header">
          <div>
            <h2>Subscription Tiers</h2>
            <p>Manage tier definitions, pricing, and feature entitlements.</p>
          </div>
          <div className="admin-row-actions">
            <button type="button" onClick={load}>Refresh</button>
            <button type="button" onClick={() => navigate("/admin/tiers/matrix")}>Tier matrix</button>
            <button type="button" onClick={() => navigate("/admin/tiers/new")}>Create tier</button>
          </div>
        </div>

        {error && <div className="admin-error">{error}</div>}
        {loading ? <Spinner label="Loading tiers…" /> : (
          <div className="admin-card-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
            {tiers.map((tier) => {
              const features = tier.features || [];
              const animals = features.find((f) => f.featureKey === ANIMALS_FEATURE);
              const photos = features.find((f) => f.featureKey === PHOTOS_FEATURE);
              return (
                <div key={tier.id} className="admin-panel" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 16 }}>{tier.name}</div>
                      <div className="admin-muted" style={{ fontSize: 12 }}>{tier.key}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontWeight: 700 }}>{tier.customPrice ? "Custom" : money(tier.monthlyPrice, tier.currency)}</div>
                      <div className="admin-muted" style={{ fontSize: 11 }}>{tier.customPrice ? "price" : "per month"}</div>
                    </div>
                  </div>
                  <div className="admin-muted" style={{ fontSize: 12 }}>
                    {tier.isActive === false ? "Inactive · " : ""}{tier.isPublic !== false ? "Public" : "Hidden"} · Sort {tier.sortOrder ?? 0} · {tier.activeUsers ?? 0} subscription{tier.activeUsers === 1 ? "" : "s"}
                  </div>
                  <div style={{ fontSize: 12 }}>
                    <strong>{limitText(animals, "animals")}</strong> · <strong>{photos?.enabled && photos.limitValue != null ? `${photos.limitValue} photos per animal` : limitText(photos, "photos")}</strong>
                  </div>
                  <div style={{ fontSize: 12 }}>
                    <strong>{features.filter((f) => f.enabled).length}</strong> features enabled
                  </div>
                  <div className="admin-row-actions" style={{ marginTop: "auto" }}>
                    <button type="button" onClick={() => setEditing(tier)}>Quick edit</button>
                    <button type="button" onClick={() => navigate(`/admin/tiers/${tier.id}`)}>Full editor</button>
                  </div>
                </div>
              );
            })}
            {!tiers.length && <p className="admin-muted">No tiers configured.</p>}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
