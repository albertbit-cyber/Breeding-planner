/**
 * Copies the retired `listings` table into `marketplace_listings`. LOCAL ONLY.
 *
 *   npm run listings:copy-legacy:local                 # report only, writes nothing
 *   npm run listings:copy-legacy:local -- --apply      # write
 *   npm run listings:copy-legacy:local -- --apply --keep-status
 *
 * Refuses to run unless DATABASE_URL points at this machine and
 * LEGACY_LISTINGS_COPY_CONFIRM=local is set (the npm script sets it). It is
 * never to be pointed at a Railway database: whether and when the deployed
 * data is copied is the owner's decision, made separately.
 *
 * For every legacy row, in creation order:
 *
 * 1. Already copied (a marketplace listing carries its id in
 *    `legacy_listing_id`): skipped. This is what makes re-running safe.
 * 2. Same animal already listed (an unarchived marketplace listing for the same
 *    seller and animal id): the two are linked, and only the gaps in the
 *    marketplace listing are filled from the legacy row -- price, description,
 *    genetics, sex, birth date, and a photo if it has none. Its status is never
 *    touched: the marketplace listing is the newer, deliberate one.
 *    If that listing is already linked to another legacy row (an animal can have
 *    both a hand-made and an "auto-animal-" legacy row), the row is reported
 *    and left alone.
 * 3. Otherwise a new marketplace listing is created from the legacy row. It is
 *    created as a DRAFT, whatever the legacy status was: a legacy "available"
 *    row can be months stale, and copying it as live would put an old price, or
 *    an animal already sold, in front of buyers without anyone deciding to.
 *    `--keep-status` copies the legacy status instead.
 *
 * Then, for each legacy row now linked, inquiries and reports that point at it
 * get the matching `marketplace_listing_id` / `related_marketplace_listing_id`
 * (only where those are still empty). The legacy rows themselves are left as
 * they are; the table is frozen, not emptied.
 *
 * Not copied: embedded `data:` image URIs (device photos, often megabytes; the
 * breeder app uploads them properly the next time the animal is published) and
 * payload keys that have no column in `marketplace_listings`. Both remain in the
 * legacy row and in the account data export.
 */

import { prisma } from "../src/lib/prisma";

const APPLY = process.argv.includes("--apply");
const KEEP_STATUS = process.argv.includes("--keep-status");
const CONFIRM_VALUE = "local";
const KNOWN_STATUSES = new Set(["draft", "available", "reserved", "sold", "hidden"]);
const LIVE_STATUSES = new Set(["available", "reserved", "sold"]);

const FORBIDDEN_URL_PARTS = [
  "railway", "rlwy.net", "production", "prod", "staging", "render.com", "supabase",
  "neon.tech", "amazonaws.com", "heroku", "fly.dev", "vercel",
];
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

const assertLocalDatabase = () => {
  if (String(process.env.LEGACY_LISTINGS_COPY_CONFIRM || "").trim().toLowerCase() !== CONFIRM_VALUE) {
    throw new Error("Set LEGACY_LISTINGS_COPY_CONFIRM=local (use `npm run listings:copy-legacy:local`).");
  }
  const raw = String(process.env.DATABASE_URL || "").trim();
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("DATABASE_URL is missing or not a URL.");
  }
  const lowered = raw.toLowerCase();
  const hit = FORBIDDEN_URL_PARTS.find((part) => lowered.includes(part));
  if (hit) throw new Error(`Refusing: DATABASE_URL mentions "${hit}". This script is local only.`);
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!LOCAL_HOSTS.has(host)) throw new Error(`Refusing: DATABASE_URL host "${host}" is not this machine.`);
  return `${host}:${url.port || "5432"}${url.pathname}`;
};

type Json = Record<string, unknown>;
const asRecord = (value: unknown): Json => (value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {});
const text = (value: unknown, max = 2000): string | null => {
  const out = String(value ?? "").replace(/\s+/g, " ").trim();
  return out ? out.slice(0, max) : null;
};
const dateOrNull = (value: unknown): Date | null => {
  const raw = text(value, 40);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};
/** "450", "€450", "450,50" -> number; anything else -> null rather than a guess. */
const priceFrom = (cents: number | null, payloadPrice: unknown): number | null => {
  if (typeof cents === "number" && Number.isFinite(cents) && cents >= 0) return cents / 100;
  const raw = String(payloadPrice ?? "").trim();
  if (!raw || raw.startsWith("-")) return null;
  const digits = raw.replace(/[^0-9.,]/g, "");
  if (!digits) return null;
  const parsed = Number(digits.includes(".") ? digits.replace(/,/g, "") : digits.replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};
const imageFrom = (payload: Json): { url: string | null; embedded: boolean } => {
  const url = text(payload.imageUrl ?? payload.photoUrl, 4000);
  if (!url) return { url: null, embedded: false };
  if (url.startsWith("data:")) return { url: null, embedded: true };
  return { url, embedded: false };
};

const main = async () => {
  const target = assertLocalDatabase();
  console.log(`[legacy-listings] database ${target} -- ${APPLY ? "APPLY" : "report only (pass --apply to write)"}${KEEP_STATUS ? ", keeping legacy status" : ", new copies as draft"}`);

  const rows = await prisma.listing.findMany({ orderBy: { createdAt: "asc" } });
  const tally = { total: rows.length, alreadyCopied: 0, linked: 0, created: 0, linkConflict: 0, embeddedImagesSkipped: 0, inquiriesRelinked: 0, reportsRelinked: 0 };
  const byStatus: Record<string, number> = {};

  for (const row of rows) {
    byStatus[row.status] = (byStatus[row.status] || 0) + 1;
    const payload = asRecord(row.payload);

    const copied = await prisma.marketplaceListing.findUnique({ where: { legacyListingId: row.id }, select: { id: true } });
    let targetId: string | null = copied?.id ?? null;
    if (copied) {
      tally.alreadyCopied += 1;
    } else {
      const animalId = text(row.animalAppId, 160) || text(payload.animalAppId, 160) || text(payload.animalId, 160);
      const image = imageFrom(payload);
      if (image.embedded) tally.embeddedImagesSkipped += 1;
      const price = priceFrom(row.priceCents, payload.price);
      const genetics = text(payload.genetics ?? payload.morph);
      const sex = text(payload.sex, 40);
      const birthDate = dateOrNull(payload.birthDate ?? payload.hatchDate);
      const description = text(payload.description ?? payload.saleDescription, 5000);

      const existing = animalId
        ? await prisma.marketplaceListing.findFirst({
            where: { sellerUserId: row.ownerId, animalId, archivedAt: null },
            orderBy: { createdAt: "asc" },
            include: { images: { select: { id: true } } },
          })
        : null;

      if (existing && existing.legacyListingId && existing.legacyListingId !== row.id) {
        tally.linkConflict += 1;
        console.log(`[legacy-listings] ${row.id} (${row.appListingId}): animal ${animalId} already linked to legacy ${existing.legacyListingId}; left alone`);
        continue;
      }

      if (existing) {
        // Fill the silences only. The marketplace listing is the deliberate one.
        const fill: Json = { legacyListingId: row.id };
        if (existing.price === null && price !== null) fill.price = price;
        if (!existing.description && description) fill.description = description;
        if (!existing.genetics && genetics) fill.genetics = genetics;
        if (!existing.sex && sex) fill.sex = sex;
        if (!existing.birthDate && birthDate) fill.birthDate = birthDate;
        const addImage = existing.images.length === 0 && image.url;
        console.log(`[legacy-listings] ${row.id} -> link to ${existing.id}, fill ${Object.keys(fill).filter((k) => k !== "legacyListingId").join(", ") || "nothing"}${addImage ? " + photo" : ""}`);
        if (APPLY) {
          await prisma.marketplaceListing.update({
            where: { id: existing.id },
            data: {
              ...(fill as any),
              ...(addImage ? { images: { create: [{ imageUrl: image.url as string, isPrimary: true, sortOrder: 0 }] } } : {}),
            },
          });
        }
        targetId = existing.id;
        tally.linked += 1;
      } else {
        const legacyStatus = KNOWN_STATUSES.has(row.status) ? row.status : "draft";
        const status = KEEP_STATUS ? legacyStatus : "draft";
        console.log(`[legacy-listings] ${row.id} -> new listing "${row.title || payload.title || row.appListingId}" as ${status} (legacy: ${row.status})`);
        if (APPLY) {
          const created = await prisma.marketplaceListing.create({
            data: {
              sellerUserId: row.ownerId,
              legacyListingId: row.id,
              animalId,
              title: text(row.title, 180) || text(payload.title, 180) || "Marketplace animal",
              genetics,
              sex,
              birthDate,
              year: birthDate ? birthDate.getUTCFullYear() : null,
              price,
              currency: text(row.currency, 12) || "EUR",
              status,
              availability: LIVE_STATUSES.has(status) ? status : "available",
              description,
              publishedAt: LIVE_STATUSES.has(status) ? row.updatedAt : null,
              createdAt: row.createdAt,
              ...(image.url ? { images: { create: [{ imageUrl: image.url, isPrimary: true, sortOrder: 0 }] } } : {}),
            },
            select: { id: true },
          });
          targetId = created.id;
        }
        tally.created += 1;
      }
    }

    if (APPLY && targetId) {
      const inquiries = await prisma.listingInquiry.updateMany({
        where: { listingId: row.id, marketplaceListingId: null },
        data: { marketplaceListingId: targetId },
      });
      const reports = await prisma.report.updateMany({
        where: { relatedListingId: row.id, relatedMarketplaceListingId: null },
        data: { relatedMarketplaceListingId: targetId },
      });
      tally.inquiriesRelinked += inquiries.count;
      tally.reportsRelinked += reports.count;
    }
  }

  console.log("[legacy-listings] legacy rows by status:", byStatus);
  console.log("[legacy-listings] summary:", tally);
  if (!APPLY) console.log("[legacy-listings] nothing written. Re-run with --apply.");
};

main()
  .catch((error) => {
    console.error("[legacy-listings]", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
