import React from "react";
import { parseGenes } from "../format";

/**
 * Genetics used to render as the raw comma-joined string the seller typed.
 *
 * The product already has a convention for this and uses it in the breeder app:
 * coral for a visual morph, violet and italic for a het, because a het is
 * probabilistic rather than observed. The same tag renders identically in both
 * places, which is a small argument for the product every time someone sees it.
 */
export function GeneTag({ label, het = false, excluded = false, onClick, title }) {
  const classes = ["mk-gene", het ? "mk-gene--het" : "", excluded ? "mk-gene--off" : ""]
    .filter(Boolean)
    .join(" ");
  if (!onClick) {
    return (
      <span className={classes} title={title}>
        {label}
      </span>
    );
  }
  return (
    <button type="button" className={classes} onClick={onClick} title={title}>
      {label}
    </button>
  );
}

export default function GeneTags({ genetics, genes, max, emptyLabel }) {
  const parsed = genes || parseGenes(genetics);
  if (!parsed.length) {
    return emptyLabel ? <span className="mk-muted mk-genes__empty">{emptyLabel}</span> : null;
  }
  const shown = max ? parsed.slice(0, max) : parsed;
  const hidden = parsed.length - shown.length;
  return (
    <div className="mk-genes">
      {shown.map((gene) => (
        <GeneTag key={gene.label} label={gene.label} het={gene.het} />
      ))}
      {hidden > 0 ? <span className="mk-gene mk-gene--more">+{hidden}</span> : null}
    </div>
  );
}
