import React from "react";
import { useFeatureAccess } from "./FeatureAccessContext.jsx";

/**
 * Says what a plan does not include before the keeper presses the button the
 * backend would refuse, so a 403 is never the first notice.
 *
 * It reads the access fetched once after sign-in. An answer it does not have
 * (signed out, offline, never fetched) lets the action through: this app works
 * on the device first, and the backend still has the last word.
 */
export function LockedFeatureNotice({ access, featureName, onUpgrade, compact = false }) {
  const usage = access?.limit !== undefined && access?.limit !== null
    ? `${access.currentUsage || 0} / ${access.limit}`
    : "";
  return (
    <div className="locked-feature-notice rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900" role="status">
      <div className="font-semibold">
        {featureName || access?.featureKey || "This feature"} is not included in {access?.currentTier || access?.tier || "your plan"}
      </div>
      <div className="mt-0.5">
        {access?.reason === "Usage limit reached" && usage
          ? `You have used ${usage} this plan allows.`
          : access?.requiredTier
            ? `It needs the ${access.requiredTier} plan.`
            : access?.reason || "Your current plan does not include it."}
      </div>
      {onUpgrade ? (
        <button
          type="button"
          className={`mt-2 rounded-md border border-amber-300 bg-white px-2 py-1 font-medium ${compact ? "" : "text-sm"}`}
          onClick={onUpgrade}
        >
          See plans
        </button>
      ) : null}
    </div>
  );
}

export function UpgradeModal({ access, onClose }) {
  const { openUpgrade } = useFeatureAccess();
  return (
    <div className="upgrade-modal-backdrop">
      <div className="upgrade-modal">
        <button type="button" onClick={onClose}>Close</button>
        <LockedFeatureNotice access={access} onUpgrade={() => { onClose?.(); openUpgrade(); }} />
      </div>
    </div>
  );
}

export default function FeatureAccessGuard({ feature, featureName, children, fallback, showUpgrade = true }) {
  const { access, openUpgrade } = useFeatureAccess();
  const entry = access?.[feature];
  if (!entry || entry.allowed !== false) return children;
  if (fallback !== undefined) return fallback;
  return <LockedFeatureNotice access={entry} featureName={featureName} onUpgrade={showUpgrade ? openUpgrade : null} compact />;
}
