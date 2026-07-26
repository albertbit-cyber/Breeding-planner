import React, { useEffect, useState } from "react";
import { checkFeatureAccess } from "../../shared/apiClient";

export function LockedFeatureNotice({ access, featureName }) {
  return (
    <div className="locked-feature-notice">
      <h2>{featureName || access?.featureKey || "Feature"} is locked</h2>
      <p>{access?.reason || "Your current plan does not include this feature."}</p>
      <dl>
        <dt>Current plan</dt><dd>{access?.currentTier || "Unknown"}</dd>
        <dt>Required plan</dt><dd>{access?.requiredTier || "Upgrade required"}</dd>
        <dt>Feature</dt><dd>{access?.featureKey || featureName || "-"}</dd>
        {access?.limit !== undefined ? <><dt>Usage</dt><dd>{access.currentUsage || 0} / {access.limit}</dd></> : null}
      </dl>
      <div className="pricing-actions">
        <button type="button" onClick={() => { window.location.hash = "/pricing"; }}>Upgrade</button>
        <button type="button" onClick={() => { window.location.hash = "/"; }}>Contact admin</button>
      </div>
    </div>
  );
}

export function UpgradeModal({ access, onClose }) {
  return (
    <div className="upgrade-modal-backdrop">
      <div className="upgrade-modal">
        <button type="button" onClick={onClose}>Close</button>
        <LockedFeatureNotice access={access} />
      </div>
    </div>
  );
}

export default function FeatureAccessGuard({ feature, featureName, children }) {
  const [access, setAccess] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    checkFeatureAccess(feature)
      .then((data) => mounted && setAccess(data))
      .catch((err) => mounted && setAccess({
        allowed: false,
        featureKey: feature,
        reason: err instanceof Error ? err.message : "Feature access could not be checked.",
      }))
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, [feature]);

  if (loading) return <div className="locked-feature-notice">Checking feature access...</div>;
  if (!access?.allowed) return <LockedFeatureNotice access={access} featureName={featureName} />;
  return children;
}
