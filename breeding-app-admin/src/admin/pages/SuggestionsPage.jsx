import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminLayout from "../components/AdminLayout.jsx";
import ConfirmModal from "../components/ConfirmModal.jsx";
import Spinner from "../components/Spinner.jsx";
import useAdminActor from "../hooks/useAdminActor";
import { useToast } from "../hooks/useToast.jsx";
import { fetchAdminSuggestions, fetchFeatureCatalog, fetchSubscriptionTiers, saveAdminSuggestions } from "../../shared/apiClient";
import TierMatrixGrid, { limitText, tierFeaturesOnly } from "./TierMatrixGrid.jsx";

/**
 * The suggestions Serpentora works from, editable by the owner:
 *
 * - the recommended feature set per tier, which the Tier matrix compares every tier against and
 *   which its "Apply recommendation" copies in;
 * - what another breeder sees of an animal when their extended pedigree passes through it.
 *
 * Both start from defaults in code. Saving stores the owner's version; "Reset" goes back to them.
 */

const toCells = (recommendations = {}) =>
  Object.fromEntries(
    Object.entries(recommendations).map(([tierKey, features]) => [
      tierKey,
      Object.fromEntries(Object.entries(features || {}).map(([key, value]) => [key, { enabled: Boolean(value?.enabled), limit: limitText(value?.limit) }])),
    ])
  );

const fromCells = (cells = {}) =>
  Object.fromEntries(
    Object.entries(cells).map(([tierKey, features]) => [
      tierKey,
      Object.fromEntries(
        Object.entries(features || {}).map(([key, value]) => {
          const raw = value?.limit;
          const limit = raw === "" || raw === null || raw === undefined ? null : Math.max(0, Math.floor(Number(raw))) || 0;
          return [key, { enabled: Boolean(value?.enabled), limit: value?.enabled ? limit : null }];
        })
      ),
    ])
  );

/** Readable names for the recommendation keys that have no tier row yet (Custom, before it exists). */
const FALLBACK_NAMES = {
  free: "Free",
  hobby: "Hobby Keeper",
  hobby_plus: "Hobby Breeder",
  breeder: "Breeder",
  professional_breeder: "Professional Breeder",
  enterprise: "Enterprise",
  custom: "Build My Own",
};

function PedigreeSharing({ sharing, fields, setFields, canWrite, onSave, onReset, saving, dirty }) {
  const toggle = (key) => setFields((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  return (
    <div className="admin-panel">
      <h3>Extended pedigree: what crosses between breeders</h3>
      <p className="admin-muted" style={{ marginTop: 0 }}>
        Breeder, Professional Breeder and Enterprise see every connection Serpentora knows about, including animals that came from
        another breeder and their lines. When a tree passes into another breeder&apos;s animals, only the fields ticked here are shown.
        Notes, prices, health and husbandry logs never cross.
      </p>
      <div className="admin-suggest-fields">
        {(sharing?.options || []).map((option) => (
          <label key={option.key} className="admin-checkbox-row">
            <input type="checkbox" checked={fields.includes(option.key)} onChange={() => toggle(option.key)} disabled={!canWrite} />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
      {canWrite && (
        <div className="admin-row-actions admin-suggest-actions" style={{ marginTop: 12 }}>
          <button type="button" onClick={onSave} disabled={saving || !dirty}>{saving ? "Saving…" : "Save sharing"}</button>
          <button type="button" onClick={onReset} disabled={saving || sharing?.isDefault}>Reset to default</button>
        </div>
      )}
      <p className="admin-muted" style={{ marginBottom: 0 }}>
        {sharing?.isDefault ? "Using the default." : `Your version, saved ${sharing?.updatedAt ? new Date(sharing.updatedAt).toLocaleString() : ""}.`}
      </p>
    </div>
  );
}

export default function SuggestionsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { canWrite } = useAdminActor();
  const [data, setData] = useState(null);
  const [features, setFeatures] = useState([]);
  const [tierNames, setTierNames] = useState({});
  const [tierOrder, setTierOrder] = useState([]);
  const [cells, setCells] = useState({});
  const [fields, setFields] = useState([]);
  const [dirtyRecs, setDirtyRecs] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [error, setError] = useState("");

  const apply = (result) => {
    setData(result);
    setCells(toCells(result.tierRecommendations?.recommendations));
    setFields(result.pedigreeSharing?.fields || []);
    setDirtyRecs(false);
  };

  const load = () => {
    setError("");
    Promise.all([fetchAdminSuggestions(), fetchFeatureCatalog(), fetchSubscriptionTiers().catch(() => ({ tiers: [] }))])
      .then(([result, catalog, tierData]) => {
        apply(result);
        setFeatures(tierFeaturesOnly(Array.isArray(catalog.features) ? catalog.features : []));
        const tiers = (Array.isArray(tierData.tiers) ? tierData.tiers : []).filter((tier) => !tier.archivedAt);
        setTierNames(Object.fromEntries(tiers.map((tier) => [tier.key, tier.name])));
        setTierOrder(tiers.map((tier) => tier.key));
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load suggestions."));
  };

  useEffect(() => { load(); }, []);

  const onToggle = (tierKey, featureKey) => {
    setCells((prev) => {
      const cell = prev[tierKey]?.[featureKey] || { enabled: false, limit: "" };
      return { ...prev, [tierKey]: { ...prev[tierKey], [featureKey]: { ...cell, enabled: !cell.enabled } } };
    });
    setDirtyRecs(true);
  };
  const onLimit = (tierKey, featureKey, limit) => {
    setCells((prev) => ({ ...prev, [tierKey]: { ...prev[tierKey], [featureKey]: { enabled: true, ...(prev[tierKey]?.[featureKey] || {}), limit } } }));
    setDirtyRecs(true);
  };

  const save = async (payload, message) => {
    setSaving(true); setError("");
    try {
      apply(await saveAdminSuggestions(payload));
      toast(message);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed.";
      setError(msg); toast(msg, "error");
    } finally {
      setSaving(false);
    }
  };

  // Columns: the database's tiers in their order, then any recommended tier the database lacks.
  const recKeys = Object.keys(cells);
  const columnKeys = [...tierOrder.filter((key) => recKeys.includes(key)), ...recKeys.filter((key) => !tierOrder.includes(key))];
  const columns = columnKeys.map((key) => ({
    key,
    label: tierNames[key] || FALLBACK_NAMES[key] || key,
    sub: tierNames[key] ? key : `${key} · no tier yet`,
  }));

  const sharingDirty = JSON.stringify([...fields].sort()) !== JSON.stringify([...(data?.pedigreeSharing?.fields || [])].sort());
  const recs = data?.tierRecommendations;

  return (
    <AdminLayout breadcrumbs={[{ label: "Tiers", href: "/admin/tiers" }, { label: "Suggestions" }]}>
      {confirmReset && (
        <ConfirmModal
          title="Reset the tier recommendations?"
          message="Your edited recommendations are replaced by the defaults. Tiers themselves do not change."
          confirmLabel="Reset"
          danger
          onConfirm={() => { setConfirmReset(false); save({ tierRecommendations: null }, "Recommendations reset to the defaults."); }}
          onCancel={() => setConfirmReset(false)}
        />
      )}
      <div className="admin-section">
        <div className="admin-section-header">
          <div>
            <h2>Suggestions</h2>
            <p>The recommendations the Tier matrix works from, and what an extended pedigree shares between breeders. Editing these changes no tier and no account.</p>
          </div>
          <button type="button" onClick={() => navigate("/admin/tiers/matrix")}>Open Tier matrix</button>
        </div>
        {error && <div className="admin-error">{error}</div>}
        {!data ? <Spinner label="Loading suggestions…" /> : (
          <PedigreeSharing
            sharing={data.pedigreeSharing}
            fields={fields}
            setFields={setFields}
            canWrite={canWrite}
            saving={saving}
            dirty={sharingDirty}
            onSave={() => save({ pedigreeSharedFields: fields }, "Pedigree sharing saved.")}
            onReset={() => save({ pedigreeSharedFields: null }, "Pedigree sharing reset to the default.")}
          />
        )}
      </div>

      {data && (
        <div className="admin-section">
          <div className="admin-section-header">
            <div>
              <h2>Recommended features per tier</h2>
              <p>
                {recs?.isDefault
                  ? "Showing Claude's suggested set (17 Oct 2026). Change anything and save to make it yours."
                  : `Your version, saved ${recs?.updatedAt ? new Date(recs.updatedAt).toLocaleString() : ""}.`}
              </p>
            </div>
            {canWrite && (
              <div className="admin-row-actions">
                <button type="button" onClick={() => save({ tierRecommendations: fromCells(cells) }, "Recommendations saved.")} disabled={saving || !dirtyRecs}>
                  {saving ? "Saving…" : "Save recommendations"}
                </button>
                <button type="button" onClick={() => apply(data)} disabled={saving || !dirtyRecs}>Discard</button>
                <button type="button" onClick={() => setConfirmReset(true)} disabled={saving || recs?.isDefault}>Reset to defaults</button>
              </div>
            )}
          </div>
          <TierMatrixGrid columns={columns} features={features} values={cells} onToggle={onToggle} onLimit={onLimit} readOnly={!canWrite} />
        </div>
      )}
    </AdminLayout>
  );
}
