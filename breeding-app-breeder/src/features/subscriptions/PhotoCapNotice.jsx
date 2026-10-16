import React, { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useFeatureAccess } from "./FeatureAccessContext.jsx";
import { help } from "../help/help";
import { PHOTO_CAP_FEATURE, checkPhotoCap, describePhotoCap, nextTierForPhotos, photoCapFrom } from "./photoCap";

/**
 * `check(current, adding)` says where one animal stands against the account's photos-per-animal
 * limit. Always answers: without a known tier limit it is the technical cap.
 */
export function usePhotoCap() {
  const { access, tiers } = useFeatureAccess();
  const cap = useMemo(() => photoCapFrom(access?.[PHOTO_CAP_FEATURE]), [access]);
  const nextTier = useMemo(() => nextTierForPhotos(tiers, cap.limit), [cap.limit, tiers]);
  return useCallback(
    (current, adding = 0) => checkPhotoCap({ cap, current, adding, nextTier }),
    [cap, nextTier]
  );
}

const TONE = {
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  blocked: "border-rose-200 bg-rose-50 text-rose-800",
};

export default function PhotoCapNotice({ result, className = "" }) {
  const { t } = useTranslation();
  const { openUpgrade } = useFeatureAccess();
  const copy = describePhotoCap(result, { t });
  if (!copy) return null;
  return (
    <div {...help('account-photo-limit')} className={`rounded-lg border px-3 py-2 text-xs ${TONE[copy.tone] || TONE.blocked} ${className}`} role="status">
      <div>{copy.text}</div>
      {copy.upgrade ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <span className="font-medium">{copy.upgrade}</span>
          <button
            {...help('account-see-plans')}
            type="button"
            className="rounded-md border border-current/30 bg-white px-2 py-1 font-medium"
            onClick={openUpgrade}
          >
            {t("subscriptions.cap.seePlans", { defaultValue: "See plans" })}
          </button>
        </div>
      ) : null}
    </div>
  );
}
