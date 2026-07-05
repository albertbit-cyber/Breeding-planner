import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import AdminLayout from "../components/AdminLayout.jsx";
import Spinner from "../components/Spinner.jsx";
import { useToast } from "../hooks/useToast.jsx";
import {
  fetchSubscriptionTiers, fetchFeatureCatalog,
  createSubscriptionTier, updateSubscriptionTier,
} from "../../shared/apiClient.js";

const EMPTY = {
  name: "", displayName: "", description: "", price: "", currency: "USD",
  interval: "month", isPublic: true, sortOrder: 0,
};

export default function TierEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const isNew = !id || id === "new";

  const [form, setForm] = useState(EMPTY);
  const [featureMap, setFeatureMap] = useState({});
  const [allFeatures, setAllFeatures] = useState([]);
  const [loading, setLoading] = useState(!isNew);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchFeatureCatalog()
      .then((data) => setAllFeatures(Array.isArray(data.features) ? data.features : []))
      .catch(() => {});
    if (!isNew) {
      setLoading(true);
      fetchSubscriptionTiers()
        .then((data) => {
          const tiers = Array.isArray(data.tiers) ? data.tiers : [];
          const tier = tiers.find((t) => t.id === id || String(t.id) === String(id));
          if (!tier) throw new Error("Tier not found.");
          setForm({
            name: tier.name || "",
            displayName: tier.displayName || "",
            description: tier.description || "",
            price: tier.price ?? "",
            currency: tier.currency || "USD",
            interval: tier.interval || "month",
            isPublic: tier.isPublic !== false,
            sortOrder: tier.sortOrder || 0,
          });
          const map = {};
          (tier.features || []).forEach((f) => { map[f.featureKey] = { enabled: f.enabled !== false, limit: f.limit ?? "" }; });
          setFeatureMap(map);
        })
        .catch((err) => setError(err instanceof Error ? err.message : "Failed to load tier."))
        .finally(() => setLoading(false));
    }
  }, [id]); // eslint-disable-line

  const toggleFeature = (key) => setFeatureMap((p) => ({ ...p, [key]: { ...(p[key] || {}), enabled: !(p[key]?.enabled) } }));
  const setLimit = (key, value) => setFeatureMap((p) => ({ ...p, [key]: { ...(p[key] || {}), limit: value } }));

  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setError("");
    const featureArray = Object.entries(featureMap).map(([featureKey, v]) => ({
      featureKey, enabled: Boolean(v.enabled), limit: v.limit === "" ? null : Number(v.limit),
    }));
    const payload = { ...form, price: Number(form.price || 0), sortOrder: Number(form.sortOrder || 0), features: featureArray };
    try {
      if (isNew) {
        await createSubscriptionTier(payload);
        toast("Tier created.");
      } else {
        await updateSubscriptionTier(id, payload);
        toast("Tier saved.");
      }
      navigate("/admin/tiers");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed.";
      setError(msg); toast(msg, "error");
    } finally { setBusy(false); }
  };

  const groups = allFeatures.reduce((acc, f) => {
    const g = f.featureGroup || "General";
    if (!acc[g]) acc[g] = [];
    acc[g].push(f);
    return acc;
  }, {});

  if (loading) return (
    <AdminLayout breadcrumbs={[{ label: "Tiers", href: "/admin/tiers" }, { label: "Loading…" }]}>
      <Spinner label="Loading tier…" />
    </AdminLayout>
  );

  return (
    <AdminLayout breadcrumbs={[{ label: "Tiers", href: "/admin/tiers" }, { label: isNew ? "New Tier" : (form.displayName || form.name) }]}>
      <div className="admin-section">
        <button type="button" className="admin-back" onClick={() => navigate("/admin/tiers")}>← Back to Tiers</button>
        <h2 style={{ marginBottom: 4 }}>{isNew ? "Create Tier" : `Edit: ${form.displayName || form.name}`}</h2>

        {error && <div className="admin-error">{error}</div>}

        <form onSubmit={save}>
          <div className="admin-detail-grid">
            <div className="admin-panel">
              <h3>Basic Info</h3>
              <div className="admin-action-grid">
                <label>Slug (internal key) *<input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required /></label>
                <label>Display name<input value={form.displayName} onChange={(e) => setForm((p) => ({ ...p, displayName: e.target.value }))} /></label>
                <label style={{ gridColumn: "1 / -1" }}>Description<textarea rows={3} value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} style={{ width: "100%", resize: "vertical" }} /></label>
              </div>
            </div>
            <div className="admin-panel">
              <h3>Pricing</h3>
              <div className="admin-action-grid">
                <label>Price<input type="number" step="0.01" min="0" value={form.price} onChange={(e) => setForm((p) => ({ ...p, price: e.target.value }))} required /></label>
                <label>Currency<input value={form.currency} onChange={(e) => setForm((p) => ({ ...p, currency: e.target.value.toUpperCase() }))} maxLength={3} /></label>
                <label>Billing interval<select value={form.interval} onChange={(e) => setForm((p) => ({ ...p, interval: e.target.value }))}><option value="month">Monthly</option><option value="year">Yearly</option><option value="lifetime">Lifetime</option></select></label>
                <label>Sort order<input type="number" value={form.sortOrder} onChange={(e) => setForm((p) => ({ ...p, sortOrder: e.target.value }))} /></label>
                <label className="admin-checkbox-row"><input type="checkbox" checked={form.isPublic} onChange={(e) => setForm((p) => ({ ...p, isPublic: e.target.checked }))} /> Publicly visible</label>
              </div>
            </div>
          </div>

          <div className="admin-panel" style={{ marginTop: 16 }}>
            <h3>Feature Entitlements</h3>
            {Object.entries(groups).map(([group, feats]) => (
              <div key={group} style={{ marginBottom: 20 }}>
                <div className="admin-field-label" style={{ marginBottom: 8, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.05em" }}>{group}</div>
                <div className="admin-feature-matrix">
                  {feats.map((f) => {
                    const entry = featureMap[f.featureKey] || { enabled: false, limit: "" };
                    return (
                      <div key={f.featureKey} className="admin-feature-row">
                        <label className="admin-checkbox-row" style={{ flex: 1, minWidth: 0 }}>
                          <input type="checkbox" checked={Boolean(entry.enabled)} onChange={() => toggleFeature(f.featureKey)} />
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.featureName}</span>
                        </label>
                        {f.hasLimit && (
                          <input
                            type="number"
                            className="admin-limit-input"
                            value={entry.limit}
                            onChange={(e) => setLimit(f.featureKey, e.target.value)}
                            placeholder="∞"
                            title="Leave blank for unlimited"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <button type="submit" disabled={busy}>{busy ? "Saving…" : isNew ? "Create tier" : "Save changes"}</button>
            <button type="button" onClick={() => navigate("/admin/tiers")}>Cancel</button>
          </div>
        </form>
      </div>
    </AdminLayout>
  );
}
