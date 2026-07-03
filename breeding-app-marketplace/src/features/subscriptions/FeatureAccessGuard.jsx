import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { checkFeatureAccess } from "../../shared/apiClient";

export function LockedFeatureNotice({ access, featureName }) {
  const { t } = useTranslation();
  const resolvedFeatureName = featureName || access?.featureKey || t("featureAccess.fallbackFeature", { defaultValue: "Feature" });
  return (
    <div className="locked-feature-notice">
      <h2>{t("featureAccess.lockedTitle", { defaultValue: "{{feature}} is locked", feature: resolvedFeatureName })}</h2>
      <p>{access?.reason || t("featureAccess.defaultReason", { defaultValue: "Your current plan does not include this feature." })}</p>
      <dl>
        <dt>{t("featureAccess.currentPlan", { defaultValue: "Current plan" })}</dt><dd>{access?.currentTier || t("common.unknown", { defaultValue: "Unknown" })}</dd>
        <dt>{t("featureAccess.requiredPlan", { defaultValue: "Required plan" })}</dt><dd>{access?.requiredTier || t("featureAccess.upgradeRequired", { defaultValue: "Upgrade required" })}</dd>
        <dt>{t("featureAccess.feature", { defaultValue: "Feature" })}</dt><dd>{access?.featureKey || featureName || "-"}</dd>
        {access?.limit !== undefined ? <><dt>{t("featureAccess.usage", { defaultValue: "Usage" })}</dt><dd>{access.currentUsage || 0} / {access.limit}</dd></> : null}
      </dl>
      <div className="pricing-actions">
        <button type="button" onClick={() => { window.location.hash = "/pricing"; }}>{t("featureAccess.upgrade", { defaultValue: "Upgrade" })}</button>
        <button type="button" onClick={() => { window.location.hash = "/"; }}>{t("featureAccess.contactAdmin", { defaultValue: "Contact admin" })}</button>
      </div>
    </div>
  );
}

export function UpgradeModal({ access, onClose }) {
  const { t } = useTranslation();
  return (
    <div className="upgrade-modal-backdrop">
      <div className="upgrade-modal">
        <button type="button" onClick={onClose}>{t("common.close", { defaultValue: "Close" })}</button>
        <LockedFeatureNotice access={access} />
      </div>
    </div>
  );
}

export default function FeatureAccessGuard({ feature, featureName, children }) {
  const { t } = useTranslation();
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
        reason: err instanceof Error ? err.message : t("featureAccess.checkFailed", { defaultValue: "Feature access could not be checked." }),
      }))
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, [feature, t]);

  if (loading) return <div className="locked-feature-notice">{t("featureAccess.checking", { defaultValue: "Checking feature access..." })}</div>;
  if (!access?.allowed) return <LockedFeatureNotice access={access} featureName={featureName} />;
  return children;
}
