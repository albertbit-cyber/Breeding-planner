import React from "react";
import { useTranslation } from "react-i18next";

/**
 * How much of the animal's real record this listing carries.
 *
 * Four segments, each filled from data that already exists: two or more photos;
 * a published weight history with at least three entries; published lineage
 * with a parent or a clutch; and a published lab certificate. It is not a score
 * and not a rating -- a seller cannot raise it by writing more text, only by
 * publishing more of what they actually logged.
 *
 * A switch turned on over an empty log fills nothing, which is what keeps the
 * meter honest.
 */

export const SEGMENTS = ["photos", "weights", "lineage", "verifiedGenetics"];

export const provenanceLabel = (provenance, t) => {
  const filled = Number(provenance?.filled || 0);
  if (filled === 0) return t("provenance.none", { defaultValue: "No record published" });
  if (filled === SEGMENTS.length) return t("provenance.full", { defaultValue: "Full record" });
  if (provenance?.verifiedGenetics) return t("provenance.labVerified", { defaultValue: "Lab-verified" });
  if (provenance?.lineage) return t("provenance.lineage", { defaultValue: "Lineage published" });
  if (provenance?.weights) return t("provenance.weights", { defaultValue: "Weight history" });
  return t("provenance.photosOnly", { defaultValue: "Photos only" });
};

export default function ProvenanceMeter({ provenance, size = "sm", showLabel = true }) {
  const { t } = useTranslation("marketplace");
  const flags = provenance || {};
  const filled = Number(flags.filled || 0);
  const label = provenanceLabel(flags, t);

  const description = SEGMENTS.filter((segment) => flags[segment])
    .map((segment) => t(`provenance.segment.${segment}`, { defaultValue: segment }))
    .join(", ");

  return (
    <div
      className={`mk-prov mk-prov--${size}`}
      title={
        description
          ? t("provenance.tooltip", { defaultValue: "Published: {{list}}", list: description })
          : t("provenance.tooltipEmpty", { defaultValue: "The seller has not published any of this animal's record." })
      }
    >
      <span
        className="mk-prov__bars"
        role="img"
        aria-label={t("provenance.aria", {
          defaultValue: "{{filled}} of {{total}} record segments published",
          filled,
          total: SEGMENTS.length,
        })}
      >
        {SEGMENTS.map((segment) => (
          <i key={segment} className={flags[segment] ? "is-filled" : ""} />
        ))}
      </span>
      {showLabel ? <span className="mk-prov__label">{label}</span> : null}
    </div>
  );
}
