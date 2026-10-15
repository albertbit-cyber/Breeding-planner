import React from "react";
import ResultSheet, { ELIGIBLE_STATUSES } from "./ResultSheet.jsx";

/**
 * Result entry embedded in OrderDetailsPage. The sheet itself lives in
 * ResultSheet so the Result Entry page and the order page cannot drift apart.
 */
export default function InlineResultEntry({ orderId, onSaved }) {
  return <ResultSheet orderId={orderId} onSaved={() => onSaved?.()} />;
}

export { ELIGIBLE_STATUSES };
