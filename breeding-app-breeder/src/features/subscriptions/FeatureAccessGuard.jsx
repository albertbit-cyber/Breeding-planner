import React from "react";
import { useTranslation } from "react-i18next";
import { useFeatureAccess } from "./FeatureAccessContext.jsx";
import { help } from "../help/help";

/**
 * Says what a plan does not include before the keeper presses the button the
 * backend would refuse, so a 403 is never the first notice.
 *
 * It reads the access fetched once after sign-in. An answer it does not have
 * (signed out, offline, never fetched) lets the action through: this app works
 * on the device first, and the backend still has the last word.
 */
export function LockedFeatureNotice({ access, featureName, onUpgrade, compact = false }) {
  const { t } = useTranslation();
  const usage = access?.limit !== undefined && access?.limit !== null
    ? `${access.currentUsage || 0} / ${access.limit}`
    : "";
  return (
    <div {...help('account-locked-feature')} className="locked-feature-notice rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900" role="status">
      <div className="font-semibold">
        {t("subscriptions.locked.notIncluded", {
          defaultValue: "{{feature}} is not included in {{plan}}",
          feature: featureName || access?.featureKey || t("subscriptions.locked.thisFeature", { defaultValue: "This feature" }),
          plan: access?.currentTier || access?.tier || t("subscriptions.locked.yourPlan", { defaultValue: "your plan" }),
        })}
      </div>
      <div className="mt-0.5">
        {access?.reason === "Usage limit reached" && usage
          ? t("subscriptions.locked.usageReached", { defaultValue: "You have used {{usage}} this plan allows.", usage })
          : access?.requiredTier
            ? t("subscriptions.locked.needsTier", { defaultValue: "It needs the {{tier}} plan.", tier: access.requiredTier })
            : access?.reason || t("subscriptions.locked.notInPlan", { defaultValue: "Your current plan does not include it." })}
      </div>
      {onUpgrade ? (
        <button
          {...help('account-see-plans')}
          type="button"
          className={`mt-2 rounded-md border border-amber-300 bg-white px-2 py-1 font-medium ${compact ? "" : "text-sm"}`}
          onClick={onUpgrade}
        >
          {t("subscriptions.cap.seePlans", { defaultValue: "See plans" })}
        </button>
      ) : null}
    </div>
  );
}

export function UpgradeModal({ access, onClose }) {
  const { t } = useTranslation();
  const { openUpgrade } = useFeatureAccess();
  return (
    <div className="upgrade-modal-backdrop">
      <div className="upgrade-modal">
        <button {...help('app-dialog-close')} type="button" onClick={onClose}>{t("common.close", { defaultValue: "Close" })}</button>
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
