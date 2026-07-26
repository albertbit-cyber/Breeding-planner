import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminLayout from "../components/AdminLayout.jsx";
import Spinner from "../components/Spinner.jsx";
import { useToast } from "../hooks/useToast.jsx";
import { fetchSubscriptionTiers, fetchFeatureCatalog, updateSubscriptionTier } from "../../shared/apiClient";

function TierQuickEditModal({ tier, features, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({
    name: tier.name || "",
    displayName: tier.displayName || "",
    price: tier.price || 0,
    currency: tier.currency || "USD",
    interval: tier.interval || "month",
    isPublic: tier.isPublic !== false,
    sortOrder: tier.sortOrder || 0,
  });
  const [featureMap, setFeatureMap] = useState(() => {
    const map = {};
    (tier.features || []).forEach((f) => { map[f.featureKey] = { enabled: f.enabled !== false, limit: f.limit ?? "" }; });
    return map;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const toggleFeature = (key) => setFeatureMap((p) => ({ ...p, [key]: { ...(p[key] || {}), enabled: !(p[key]?.enabled) } }));
  const setLimit = (key, value) => setFeatureMap((p) => ({ ...p, [key]: { ...(p[key] || {}), limit: value } }));

  const save = async () => {
    setBusy(true); setError("");
    try {
      const featureArray = Object.entries(featureMap).map(([featureKey, v]) => ({
        featureKey,
        enabled: Boolean(v.enabled),
        limit: v.limit === "" ? null : Number(v.limit),
      }));
      await updateSubscriptionTier(tier.id, { ...form, features: featureArray });
      toast(`Tier "${form.displayName || form.name}" saved.`);
      onSaved();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save tier.";
      setError(msg); toast(msg, "error");
    } finally { setBusy(false); }
  };

  const groups = features.reduce((acc, f) => {
    const g = f.featureGroup || "General";
    if (!acc[g]) acc[g] = [];
    acc[g].push(f);
    return acc;
  }, {});

  return (
    <div className="admin-modal-backdrop">
      <div className="admin-modal" style={{ maxWidth: 700, maxHeight: "90vh", overflowY: "auto" }}>
        <div className="admin-modal-header">
          <h3>Edit Tier: {tier.name}</h3>
          <button type="button" className="admin-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="admin-modal-body">
          {error && <div className="admin-error">{error}</div>}
          <div className="admin-action-grid">
            <label>Slug (name)<input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} /></label>
            <label>Display name<input value={form.displayName} onChange={(e) => setForm((p) => ({ ...p, displayName: e.target.value }))} /></label>
            <label>Price<input type="number" step="0.01" value={form.price} onChange={(e) => setForm((p) => ({ ...p, price: e.target.value }))} /></label>
            <label>Currency<input value={form.currency} onChange={(e) => setForm((p) => ({ ...p, currency: e.target.value }))} /></label>
            <label>Interval<select value={form.interval} onChange={(e) => setForm((p) => ({ ...p, interval: e.target.value }))}><option value="month">Monthly</option><option value="year">Yearly</option><option value="lifetime">Lifetime</option></select></label>
            <label>Sort order<input type="number" value={form.sortOrder} onChange={(e) => setForm((p) => ({ ...p, sortOrder: e.target.value }))} /></label>
            <label className="admin-checkbox-row"><input type="checkbox" checked={form.isPublic} onChange={(e) => setForm((p) => ({ ...p, isPublic: e.target.checked }))} /> Publicly visible</label>
          </div>
          <div style={{ marginTop: 20 }}>
            <h4 style={{ marginBottom: 12 }}>Feature Matrix</h4>
            {Object.entries(groups).map(([group, feats]) => (
              <div key={group} style={{ marginBottom: 14 }}>
                <div className="admin-field-label" style={{ marginBottom: 6 }}>{group}</div>
                <div className="admin-feature-matrix">
                  {feats.map((f) => {
                    const entry = featureMap[f.featureKey] || { enabled: false, limit: "" };
                    return (
                      <div key={f.featureKey} className="admin-feature-row">
                        <label className="admin-checkbox-row" style={{ flex: 1 }}>
                          <input type="checkbox" checked={Boolean(entry.enabled)} onChange={() => toggleFeature(f.featureKey)} />
                          {f.featureName}
                        </label>
                        {f.hasLimit && (
                          <input
                            type="number"
                            className="admin-limit-input"
                            value={entry.limit}
                            onChange={(e) => setLimit(f.featureKey, e.target.value)}
                            placeholder="∞"
                            title="Limit (blank = unlimited)"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="admin-modal-footer">
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="button" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save tier"}</button>
        </div>
      </div>
    </div>
  );
}

export default function TiersPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [tiers, setTiers] = useState([]);
  const [features, setFeatures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null);

  const load = () => {
    setLoading(true); setError("");
    Promise.all([fetchSubscriptionTiers(), fetchFeatureCatalog()])
      .then(([tierData, featureData]) => {
        setTiers(Array.isArray(tierData.tiers) ? tierData.tiers : []);
        setFeatures(Array.isArray(featureData.features) ? featureData.features : []);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load tiers."))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  return (
    <AdminLayout breadcrumbs={[{ label: "Tiers" }]}>
      {editing && (
        <TierQuickEditModal tier={editing} features={features} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      )}
      <div className="admin-section">
        <div className="admin-section-header">
          <div>
            <h2>Subscription Tiers</h2>
            <p>Manage tier definitions, pricing, and feature entitlements.</p>
          </div>
          <div className="admin-row-actions">
            <button type="button" onClick={load}>Refresh</button>
            <button type="button" onClick={() => navigate("/admin/tiers/new")}>Create tier</button>
          </div>
        </div>

        {error && <div className="admin-error">{error}</div>}
        {loading ? <Spinner label="Loading tiers…" /> : (
          <div className="admin-card-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
            {tiers.map((tier) => (
              <div key={tier.id} className="admin-panel" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>{tier.displayName || tier.name}</div>
                    <div className="admin-muted" style={{ fontSize: 12 }}>{tier.name} · {tier.interval}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 700 }}>${Number(tier.price || 0).toFixed(2)}</div>
                    <div className="admin-muted" style={{ fontSize: 11 }}>{tier.currency || "USD"}</div>
                  </div>
                </div>
                <div className="admin-muted" style={{ fontSize: 12 }}>
                  {tier.isPublic !== false ? "Public" : "Hidden"} · Sort {tier.sortOrder ?? 0}
                </div>
                <div style={{ fontSize: 12 }}>
                  <strong>{(tier.features || []).filter((f) => f.enabled).length}</strong> features enabled
                </div>
                <div className="admin-row-actions" style={{ marginTop: "auto" }}>
                  <button type="button" onClick={() => setEditing(tier)}>Quick edit</button>
                  <button type="button" onClick={() => navigate(`/admin/tiers/${tier.id}`)}>Full editor</button>
                </div>
              </div>
            ))}
            {!tiers.length && <p className="admin-muted">No tiers configured.</p>}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
