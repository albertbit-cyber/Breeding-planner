import React from "react";
import { useTranslation } from "react-i18next";
import { parseGenes } from "../format";
import { claimsOf, provenanceText } from "../genetics";
import Icon from "./Icon";

/**
 * Genetics used to render as the raw comma-joined string the seller typed.
 *
 * The product already has a convention for this and uses it in the breeder app:
 * coral for a visual morph, violet and italic for a het, because a het is
 * probabilistic rather than observed. The same tag renders identically in both
 * places, which is a small argument for the product every time someone sees it.
 *
 * Each tag also carries its own provenance. A lab-confirmed claim gets a tick
 * and a solid edge, an untested het stays violet; nothing is summed into one
 * "verified" badge, because a listing can be part tested and part guessed.
 */
export function GeneTag({ label, het = false, excluded = false, provenance, disputed = false, onClick, title, style }) {
  const classes = [
    "mk-gene",
    het ? "mk-gene--het" : "",
    excluded ? "mk-gene--off" : "",
    provenance === "lab_confirmed" ? "mk-gene--lab" : "",
    disputed ? "mk-gene--disputed" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const mark =
    provenance === "lab_confirmed" ? (
      <Icon name="check" size={11} className="mk-gene__mark" aria-hidden="true" />
    ) : disputed ? (
      <Icon name="x" size={11} className="mk-gene__mark" aria-hidden="true" />
    ) : null;

  if (!onClick) {
    return (
      <span className={classes} title={title} style={style}>
        {mark}
        {label}
        {title ? <span className="mk-sr-only">, {title}</span> : null}
      </span>
    );
  }
  return (
    <button type="button" className={classes} onClick={onClick} title={title} style={style}>
      {label}
    </button>
  );
}

/**
 * Accepts a listing (claims with provenance), or a bare genetics string for
 * the seller's own preview, which has no provenance yet.
 */
export default function GeneTags({ listing, genetics, genes, max, emptyLabel }) {
  const { t } = useTranslation("marketplace");
  const claims = listing
    ? claimsOf(listing)
    : (genes || parseGenes(genetics)).map((gene) => ({
        label: gene.label,
        zygosity: gene.het ? "het" : "visual",
        provenance: null,
      }));

  if (!claims.length) {
    return emptyLabel ? <span className="mk-muted mk-genes__empty">{emptyLabel}</span> : null;
  }
  const shown = max ? claims.slice(0, max) : claims;
  const hidden = claims.length - shown.length;
  return (
    <div className="mk-genes">
      {shown.map((claim, index) => (
        <GeneTag
          key={`${claim.label}-${index}`}
          label={claim.label}
          het={claim.zygosity !== "visual"}
          provenance={claim.provenance}
          disputed={claim.labDisagrees}
          title={claim.provenance ? provenanceText(claim, t) : undefined}
        />
      ))}
      {hidden > 0 ? <span className="mk-gene mk-gene--more">+{hidden}</span> : null}
    </div>
  );
}
