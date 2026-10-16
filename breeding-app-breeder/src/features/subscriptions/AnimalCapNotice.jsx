import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useFeatureAccess } from "./FeatureAccessContext.jsx";
import { help } from "../help/help";
import { ANIMAL_CAP_FEATURE, animalCapFrom, checkAnimalCap, describeAnimalCap, nextTierForAnimals } from "./animalCap";

/** Where the keeper stands against their tier's animal cap if they add `adding`. */
export function useAnimalCap(currentCount, adding) {
  const { access, tiers } = useFeatureAccess();
  return useMemo(() => {
    const cap = animalCapFrom(access?.[ANIMAL_CAP_FEATURE]);
    if (!cap) return null;
    return checkAnimalCap({ cap, currentCount, adding, nextTier: nextTierForAnimals(tiers, cap.limit) });
  }, [access, adding, currentCount, tiers]);
}

const TONE = {
  info: "border-neutral-200 bg-neutral-50 text-neutral-600",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  blocked: "border-rose-200 bg-rose-50 text-rose-800",
};

export default function AnimalCapNotice({ result, context = "add", className = "" }) {
  const { t } = useTranslation();
  const { openUpgrade } = useFeatureAccess();
  const copy = describeAnimalCap(result, { context, t });
  if (!copy) return null;
  return (
    <div {...help('account-animal-limit')} className={`rounded-lg border px-3 py-2 text-xs ${TONE[copy.tone] || TONE.info} ${className}`} role={copy.tone === "blocked" ? "alert" : "status"}>
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
