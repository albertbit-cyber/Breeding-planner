import React from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import Icon from "./Icon";
import GeneTags from "./GeneTags";
import ProvenanceMeter from "./ProvenanceMeter";
import { AvailabilityPill, Pill } from "./Pill";
import { grams, initials, isNewListing, listingLocation, money, primaryImage } from "../format";

/**
 * The card the whole marketplace runs on.
 *
 * The old one was `role="button"` with a favourite button and a "view store"
 * button nested inside it -- interactive controls inside an interactive
 * control, which breaks both keyboard and screen-reader traversal, and it
 * handled Enter but not Space. Here the title is the only link; it stretches
 * over the card so the whole surface is still clickable, and the favourite
 * toggle sits above it with its own pressed state.
 */
export default function ListingCard({
  listing,
  onFavorite,
  favorited,
  compact = false,
  href,
  as = "link",
  selected = false,
  onSelect,
  footerSlot,
}) {
  const { t, i18n } = useTranslation("marketplace");
  const image = primaryImage(listing);
  const price = money(listing.price, listing.currency, i18n.language);
  const location = listingLocation(listing);
  const weight = grams(listing.weight, i18n.language);
  const photoCount = listing.images?.length || (image ? 1 : 0);
  const isFavorited = favorited !== undefined ? favorited : Boolean(listing.isFavorited);
  const target = href || `/a/${listing.id}`;

  const title = listing.title || t("listing.untitled", { defaultValue: "Untitled listing" });

  const heading =
    as === "button" ? (
      <button type="button" className="mk-listing__link mk-listing__link--button" onClick={() => onSelect?.(listing)}>
        {title}
      </button>
    ) : (
      <Link to={target} className="mk-listing__link">
        {title}
      </Link>
    );

  return (
    <article className={`mk-card mk-listing ${compact ? "mk-listing--compact" : ""} ${selected ? "is-selected" : ""}`.trim()}>
      <div className="mk-listing__photo">
        {image ? (
          <img src={image} alt="" loading="lazy" decoding="async" />
        ) : (
          <span className="mk-listing__nophoto">
            <Icon name="photo" size={22} />
            <span>{t("listing.noPhoto", { defaultValue: "No photo yet" })}</span>
          </span>
        )}

        <div className="mk-listing__badges">
          <AvailabilityPill availability={listing.availability} status={listing.status} />
          {isNewListing(listing) ? (
            <Pill tone="ink" className="mk-listing__new">
              {t("listing.new", { defaultValue: "New" })}
            </Pill>
          ) : null}
        </div>

        {onFavorite ? (
          <button
            type="button"
            className={`mk-heart ${isFavorited ? "is-on" : ""}`}
            aria-pressed={isFavorited}
            aria-label={
              isFavorited
                ? t("listing.unsave", { defaultValue: "Remove {{title}} from saved", title })
                : t("listing.save", { defaultValue: "Save {{title}}", title })
            }
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onFavorite(listing);
            }}
          >
            <Icon name={isFavorited ? "heartFilled" : "heart"} size={17} />
          </button>
        ) : null}

        {photoCount > 1 ? <span className="mk-listing__count mk-mono">{photoCount}</span> : null}
      </div>

      <div className="mk-listing__body">
        <h3 className="mk-listing__title">{heading}</h3>

        <GeneTags
          genetics={listing.genetics}
          max={compact ? 2 : 3}
          emptyLabel={t("listing.geneticsOnInquiry", { defaultValue: "Genetics on inquiry" })}
        />

        {!compact ? (
          <p className="mk-listing__facts">
            {weight ? (
              <span>
                <Icon name="scale" size={14} />
                <span className="mk-tnum">{weight}</span>
              </span>
            ) : null}
            {location ? (
              <span>
                <Icon name="pin" size={14} />
                {location}
              </span>
            ) : null}
          </p>
        ) : null}

        <ProvenanceMeter provenance={listing.provenance} showLabel={!compact} />

        <div className="mk-listing__foot">
          <strong className="mk-price mk-tnum">
            {price || t("listing.priceOnInquiry", { defaultValue: "Price on inquiry" })}
          </strong>
          {footerSlot ||
            (listing.seller && !compact ? (
              <Link to={`/s/${listing.sellerUserId}`} className="mk-seller" onClick={(event) => event.stopPropagation()}>
                <span className="mk-avatar" aria-hidden="true">
                  {initials(listing.seller.name)}
                </span>
                <span className="mk-seller__name">{listing.seller.name}</span>
                {listing.seller.isVerified ? (
                  <Icon
                    name="shield"
                    size={14}
                    className="mk-verified"
                    label={t("seller.verified", { defaultValue: "Verified breeder" })}
                  />
                ) : null}
              </Link>
            ) : null)}
        </div>
      </div>
    </article>
  );
}
