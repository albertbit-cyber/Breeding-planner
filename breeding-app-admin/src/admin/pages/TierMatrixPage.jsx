import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminLayout from "../components/AdminLayout.jsx";
import Spinner from "../components/Spinner.jsx";
import useAdminActor from "../hooks/useAdminActor";
import { useToast } from "../hooks/useToast.jsx";
import {
  fetchAdminSuggestions,
  fetchFeatureCatalog,
  fetchSubscriptionTiers,
  updateFeatureAddon,
  updateSubscriptionTier,
} from "../../shared/apiClient";
import { featuresToMap } from "./tierForm";
import TierMatrixGrid, { limitText, tierFeaturesOnly } from "./TierMatrixGrid.jsx";

/**
 * Every tier side by side, every customer feature as a checkbox, with the recommendation for each
 * cell beside it and a "Build My Own" add-on price per feature. Nothing is saved until "Save
 * changes"; then each changed tier and each changed add-on price is written once.
 */

const limitValueOf = (raw) => {
  if (raw === "" || raw === null || raw === undefined) return null;
  const number = Number(raw);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : null;
};

/** The recommendation in the matrix's own shape ({ enabled, limit as text }). */
const recommendationToCells = (rec = {}) =>
  Object.fromEntries(Object.entries(rec).map(([key, value]) => [key, { enabled: Boolean(value?.enabled), limit: limitText(value?.limit) }]));

const priceText = (value) => (value === null || value === undefined ? "" : String(value));

export default function TierMatrixPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { canWrite } = useAdminActor();
  const [tiers, setTiers] = useState([]);
  const [features, setFeatures] = useState([]);
  const [recommendations, setRecommendations] = useState({});
  const [values, setValues] = useState({});
  const [addons, setAddons] = useState({});
  const [dirtyTiers, setDirtyTiers] = useState(() => new Set());
  const [dirtyAddons, setDirtyAddons] = useState(() => new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true); setError("");
    Promise.all([fetchSubscriptionTiers(), fetchFeatureCatalog(), fetchAdminSuggestions().catch(() => null)])
      .then(([tierData, catalog, suggestions]) => {
        const list = (Array.isArray(tierData.tiers) ? tierData.tiers : []).filter((tier) => !tier.archivedAt);
        const catalogue = Array.isArray(catalog.features) ? catalog.features : [];
        setTiers(list);
        setFeatures(tierFeaturesOnly(catalogue));
        setRecommendations(suggestions?.tierRecommendations?.recommendations || {});
        setValues(Object.fromEntries(list.map((tier) => [tier.key, featuresToMap(tier.features)])));
        setAddons(Object.fromEntries(catalogue.map((f) => [f.featureKey, { available: Boolean(f.addonAvailable), price: priceText(f.addonMonthlyPrice) }])));
        setDirtyTiers(new Set());
        setDirtyAddons(new Set());
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load tiers."))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const markTier = (key) => setDirtyTiers((prev) => new Set(prev).add(key));
  const onToggle = (tierKey, featureKey) => {
    setValues((prev) => {
      const cell = prev[tierKey]?.[featureKey] || { enabled: false, limit: "" };
      return { ...prev, [tierKey]: { ...prev[tierKey], [featureKey]: { ...cell, enabled: !cell.enabled } } };
    });
    markTier(tierKey);
  };
  const onLimit = (tierKey, featureKey, limit) => {
    setValues((prev) => ({ ...prev, [tierKey]: { ...prev[tierKey], [featureKey]: { enabled: true, ...(prev[tierKey]?.[featureKey] || {}), limit } } }));
    markTier(tierKey);
  };

  const applyRecommendation = (tierKey) => {
    const rec = recommendationToCells(recommendations[tierKey]);
    setValues((prev) => ({ ...prev, [tierKey]: { ...prev[tierKey], ...rec } }));
    markTier(tierKey);
  };

  const differences = useMemo(() => {
    const counts = {};
    tiers.forEach((tier) => {
      const rec = recommendations[tier.key];
      if (!rec) return;
      counts[tier.key] = features.filter((feature) => {
        const cell = values[tier.key]?.[feature.featureKey] || { enabled: false, limit: "" };
        const hint = rec[feature.featureKey] || { enabled: false, limit: null };
        return Boolean(cell.enabled) !== Boolean(hint.enabled) || (cell.enabled && limitText(cell.limit) !== limitText(hint.limit));
      }).length;
    });
    return counts;
  }, [tiers, features, values, recommendations]);

  const setAddon = (featureKey, patch) => {
    setAddons((prev) => ({ ...prev, [featureKey]: { ...(prev[featureKey] || { available: false, price: "" }), ...patch } }));
    setDirtyAddons((prev) => new Set(prev).add(featureKey));
  };

  const save = async () => {
    setSaving(true); setError("");
    const failures = [];
    for (const tier of tiers.filter((t) => dirtyTiers.has(t.key))) {
      const map = values[tier.key] || {};
      try {
        await updateSubscriptionTier(tier.id, {
          reason: "tier_matrix",
          features: Object.entries(map).map(([featureKey, entry]) => ({ featureKey, enabled: Boolean(entry?.enabled), limitValue: limitValueOf(entry?.limit) })),
        });
      } catch (err) {
        failures.push(`${tier.name}: ${err instanceof Error ? err.message : "failed"}`);
      }
    }
    for (const featureKey of dirtyAddons) {
      const entry = addons[featureKey] || {};
      try {
        await updateFeatureAddon(featureKey, { addonAvailable: Boolean(entry.available), addonMonthlyPrice: entry.price === "" ? null : Number(entry.price) });
      } catch (err) {
        failures.push(`${featureKey}: ${err instanceof Error ? err.message : "failed"}`);
      }
    }
    setSaving(false);
    if (failures.length) {
      setError(`Some changes were not saved. ${failures.join("; ")}`);
      toast("Some changes were not saved.", "error");
    } else {
      toast("Tier matrix saved.");
    }
    load();
  };

  const dirtyCount = dirtyTiers.size + dirtyAddons.size;

  const columns = tiers.map((tier) => ({
    key: tier.key,
    label: tier.name,
    sub: `${tier.key}${tier.isPublic === false ? " · hidden" : ""}`,
    action: canWrite && recommendations[tier.key] ? (
      <button
        type="button"
        className="admin-matrix__apply"
        onClick={() => applyRecommendation(tier.key)}
        disabled={!differences[tier.key]}
        title="Copy the recommendation into this tier (saved when you press Save changes)"
      >
        {differences[tier.key] ? `Apply recommendation (${differences[tier.key]})` : "Matches recommendation"}
      </button>
    ) : null,
  }));

  const addonColumn = {
    render: (feature) => {
      const entry = addons[feature.featureKey] || { available: false, price: "" };
      return (
        <div className="admin-matrix__addon-cell">
          <input
            type="checkbox"
            checked={Boolean(entry.available)}
            onChange={() => setAddon(feature.featureKey, { available: !entry.available })}
            disabled={!canWrite}
            aria-label={`${feature.featureName}: sold as an add-on`}
          />
          <input
            type="number"
            min="0"
            step="0.01"
            className="admin-limit-input admin-matrix__price"
            value={entry.price}
            onChange={(e) => setAddon(feature.featureKey, { price: e.target.value })}
            disabled={!canWrite || !entry.available}
            placeholder="€"
            aria-label={`${feature.featureName}: add-on price per month`}
          />
        </div>
      );
    },
  };

  return (
    <AdminLayout breadcrumbs={[{ label: "Tiers", href: "/admin/tiers" }, { label: "Tier matrix" }]}>
      <div className="admin-section">
        <div className="admin-editor-bar">
          <button type="button" className="admin-back" onClick={() => navigate("/admin/tiers")}>← Back to Tiers</button>
          {canWrite && (
            <>
              <button type="button" className="admin-back admin-back--primary" onClick={save} disabled={saving || !dirtyCount}>
                {saving ? "Saving…" : dirtyCount ? `Save changes (${dirtyCount})` : "No changes"}
              </button>
              <button type="button" className="admin-back" onClick={load} disabled={saving || !dirtyCount}>Discard</button>
            </>
          )}
          <button type="button" className="admin-back" onClick={() => navigate("/admin/suggestions")}>Edit recommendations</button>
        </div>
        <div className="admin-section-header">
          <div>
            <h2>Tier matrix</h2>
            <p>
              Tick what each tier includes. <span className="admin-matrix__legend"><span className="admin-matrix__legend-swatch" aria-hidden="true" /> A ringed cell</span> differs from the recommendation; hover it to see what is recommended.
              Limits: blank is unlimited. Add-on price: what a customer pays per month to add one feature to their plan ("Build My Own").
            </p>
          </div>
        </div>
        {error && <div className="admin-error">{error}</div>}
        {loading ? <Spinner label="Loading tiers…" /> : (
          <TierMatrixGrid
            columns={columns}
            features={features}
            values={values}
            compare={recommendations ? Object.fromEntries(Object.entries(recommendations).map(([key, rec]) => [key, recommendationToCells(rec)])) : undefined}
            onToggle={onToggle}
            onLimit={onLimit}
            readOnly={!canWrite}
            addon={addonColumn}
          />
        )}
        <p className="admin-muted" style={{ marginTop: 12 }}>
          Lab-portal tools and admin permissions are not here: a lab is a vendor, not a tier, and admin access is a staff role.
          Add-ons are not on sale until checkout supports them; until then grant one to an account as a feature override on the user's page.
        </p>
      </div>
    </AdminLayout>
  );
}
