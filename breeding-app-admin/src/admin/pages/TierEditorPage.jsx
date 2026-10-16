import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import AdminLayout from "../components/AdminLayout.jsx";
import Spinner from "../components/Spinner.jsx";
import { useToast } from "../hooks/useToast.jsx";
import {
  fetchSubscriptionTiers, fetchFeatureCatalog,
  createSubscriptionTier, updateSubscriptionTier,
} from "../../shared/apiClient";
import { EMPTY_TIER_FORM, featuresToMap, formToPayload, tierToForm } from "./tierForm";
import { AnimalPhotoLimits, FeatureMatrix, TierBasicsFields, useFeatureMapSetters } from "./TierFields.jsx";

export default function TierEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const isNew = !id || id === "new";

  const [form, setForm] = useState(EMPTY_TIER_FORM);
  const [featureMap, setFeatureMap] = useState({});
  const [allFeatures, setAllFeatures] = useState([]);
  const [loading, setLoading] = useState(!isNew);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { onToggle, onLimit } = useFeatureMapSetters(setFeatureMap);

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
          setForm(tierToForm(tier));
          setFeatureMap(featuresToMap(tier.features));
        })
        .catch((err) => setError(err instanceof Error ? err.message : "Failed to load tier."))
        .finally(() => setLoading(false));
    }
  }, [id]); // eslint-disable-line

  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setError("");
    const payload = formToPayload(form, featureMap);
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

  if (loading) return (
    <AdminLayout breadcrumbs={[{ label: "Tiers", href: "/admin/tiers" }, { label: "Loading…" }]}>
      <Spinner label="Loading tier…" />
    </AdminLayout>
  );

  return (
    <AdminLayout breadcrumbs={[{ label: "Tiers", href: "/admin/tiers" }, { label: isNew ? "New Tier" : form.name }]}>
      <div className="admin-section">
        <button type="button" className="admin-back" onClick={() => navigate("/admin/tiers")}>← Back to Tiers</button>
        <h2 style={{ marginBottom: 4 }}>{isNew ? "Create Tier" : `Edit: ${form.name}`}</h2>

        {error && <div className="admin-error">{error}</div>}

        <form onSubmit={save}>
          <div className="admin-detail-grid">
            <div className="admin-panel">
              <h3>Basic Info</h3>
              <TierBasicsFields form={form} setForm={setForm} isNew={isNew} />
            </div>
            <div className="admin-panel">
              <h3>Animals and photos</h3>
              <AnimalPhotoLimits featureMap={featureMap} onToggle={onToggle} onLimit={onLimit} />
            </div>
          </div>

          <div className="admin-panel" style={{ marginTop: 16 }}>
            <h3>Feature Entitlements</h3>
            <FeatureMatrix features={allFeatures} featureMap={featureMap} onToggle={onToggle} onLimit={onLimit} />
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
