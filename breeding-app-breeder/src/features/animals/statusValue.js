/**
 * One spelling per status. The status list used to offer the misspelt "for sell", and the phone
 * app writes "For Sale"; both mean "For sale", so every variant is read as that one value.
 *
 * Deterministic and idempotent on purpose: it runs on every load and every sync merge, and two
 * devices must always agree on the result or the record would churn.
 */
export const FOR_SALE_STATUS = 'For sale';

const FOR_SALE_SPELLINGS = new Set(['for sale', 'for sell', 'forsale', 'forsell']);

export function canonicalStatusValue(value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (FOR_SALE_SPELLINGS.has(trimmed.toLowerCase())) return FOR_SALE_STATUS;
  return trimmed;
}
