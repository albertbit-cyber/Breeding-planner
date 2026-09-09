/**
 * Formatting the marketplace's own units: money, grams, dates, and the gene
 * strings that carry most of the meaning on a card.
 */

const CURRENCY_FALLBACK = "EUR";

/**
 * Prices used to render as `EUR 1450` -- the currency code, a space, and an
 * unseparated number. `Intl` gives the locale its own grouping and symbol.
 */
export const money = (value, currency = CURRENCY_FALLBACK, locale) => {
  if (value === null || value === undefined || value === "") return null;
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  try {
    return new Intl.NumberFormat(locale || undefined, {
      style: "currency",
      currency: String(currency || CURRENCY_FALLBACK).toUpperCase(),
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currency || CURRENCY_FALLBACK} ${amount.toLocaleString()}`;
  }
};

export const grams = (value, locale) => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return `${amount.toLocaleString(locale || undefined)} g`;
};

export const shortDate = (value, locale) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(locale || undefined, { day: "numeric", month: "short", year: "numeric" });
};

export const relativeTime = (value, locale) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const steps = [
    [60, "second", 1],
    [3600, "minute", 60],
    [86400, "hour", 3600],
    [604800, "day", 86400],
    [2629800, "week", 604800],
    [31557600, "month", 2629800],
    [Infinity, "year", 31557600],
  ];
  const magnitude = Math.abs(seconds);
  const [, unit, divisor] = steps.find(([limit]) => magnitude < limit) || steps[steps.length - 1];
  try {
    return new Intl.RelativeTimeFormat(locale || undefined, { numeric: "auto" }).format(
      Math.round(seconds / divisor),
      unit
    );
  } catch {
    return shortDate(value, locale);
  }
};

/**
 * Genetics arrive as one free-text string. Splitting it lets each trait render
 * as its own tag, and lets het traits be marked as probabilistic rather than
 * observed -- the same two-hue convention the breeder app uses.
 */
export const parseGenes = (genetics) =>
  String(genetics || "")
    .split(/[,/]|(?:\s+\+\s+)/)
    .map((gene) => gene.trim())
    .filter(Boolean)
    .map((gene) => ({
      label: gene,
      het: /^(?:\d+%\s*)?(?:poss\.?\s*)?het\b/i.test(gene),
    }));

export const geneTokens = (value) =>
  String(value || "")
    .split(",")
    .map((gene) => gene.trim())
    .filter(Boolean);

export const joinTokens = (tokens) => tokens.filter(Boolean).join(", ");

export const listingLocation = (listing) =>
  [listing?.city, listing?.country].filter(Boolean).join(", ") || listing?.seller?.location || "";

export const primaryImage = (listing) =>
  listing?.images?.find((image) => image.isPrimary)?.imageUrl ||
  listing?.images?.[0]?.imageUrl ||
  listing?.imageUrl ||
  "";

export const isNewListing = (listing) => {
  if (!listing?.publishedAt) return false;
  const days = (Date.now() - new Date(listing.publishedAt).getTime()) / 86400000;
  return days >= 0 && days <= 7;
};

export const initials = (name) =>
  String(name || "?")
    .trim()
    .slice(0, 1)
    .toUpperCase();
