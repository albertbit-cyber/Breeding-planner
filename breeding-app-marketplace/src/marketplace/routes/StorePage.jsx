import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { favorite, store as fetchStore, storeReviews } from "../api";
import { initials, shortDate } from "../format";
import { useAuthAction } from "../session";
import { SignInPrompt } from "../components/RequireAuth";
import Button from "../ui/Button";
import Icon from "../ui/Icon";
import ListingCard from "../ui/ListingCard";
import { Pill } from "../ui/Pill";
import StarRating from "../ui/StarRating";
import { EmptyState, ErrorPanel, Spinner } from "../ui/States";
import { useToast } from "../ui/Toast";

/**
 * A breeder's store.
 *
 * Its Reviews tab used to render one string -- five star characters and a
 * count -- and clicking an animal inside the store did nothing at all, because
 * the cards were passed an empty `onSelect`. Every card here is a link, and
 * reviews are the reviews.
 */
const TABS = ["available", "sold", "about", "reviews", "terms"];

export default function StorePage() {
  const { userId } = useParams();
  const { t, i18n } = useTranslation("marketplace");
  const { notify } = useToast();
  const auth = useAuthAction();

  const [state, setState] = useState({ status: "loading" });
  const [reviews, setReviews] = useState(null);
  const [tab, setTab] = useState("available");
  const [favorites, setFavorites] = useState({});

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    fetchStore(userId)
      .then((store) => {
        if (cancelled) return;
        setState({ status: "ready", store });
        if (store) document.title = `${store.storeName} · Serpentora Market`;
      })
      .catch((error) => !cancelled && setState({ status: "error", error }));
    storeReviews(userId)
      .then((result) => !cancelled && setReviews(result))
      .catch(() => setReviews({ reviews: [], reviewCount: 0, ratingAverage: 0 }));
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (state.status === "loading") return <Spinner />;
  if (state.status === "error") {
    return (
      <div className="mk-wrap" style={{ paddingTop: 24 }}>
        <ErrorPanel error={state.error} />
      </div>
    );
  }

  const store = state.store;
  const listings = store.listings || [];
  const available = listings.filter((listing) => String(listing.availability).toLowerCase() !== "sold");
  const sold = listings.filter((listing) => String(listing.availability).toLowerCase() === "sold");
  const shown = tab === "sold" ? sold : available;

  const onFavorite = (listing) =>
    auth.run({ kind: "favorite", listingId: listing.id }, async () => {
      setFavorites((current) => ({ ...current, [listing.id]: !current[listing.id] }));
      try {
        await favorite(listing.id);
      } catch (error) {
        setFavorites((current) => ({ ...current, [listing.id]: !current[listing.id] }));
        notify(error?.message || t("errors.favorite", { defaultValue: "Could not update saved animals." }), { tone: "bad" });
      }
    });

  return (
    <div className="mk-wrap" style={{ paddingTop: 24, paddingBottom: 40 }}>
      <header className="mk-row" style={{ gap: 16, marginBottom: 20 }}>
        {store.logoUrl ? (
          <img src={store.logoUrl} alt="" className="mk-avatar mk-avatar--lg" style={{ objectFit: "cover" }} />
        ) : (
          <span className="mk-avatar mk-avatar--lg" aria-hidden="true">
            {initials(store.storeName)}
          </span>
        )}
        <div className="mk-grow">
          <h1 className="mk-h1" style={{ marginBottom: 4 }}>
            {store.storeName}
          </h1>
          <div className="mk-row" style={{ gap: 12 }}>
            {[store.city, store.country].filter(Boolean).length ? (
              <span className="mk-sm mk-muted">
                <Icon name="pin" size={13} /> {[store.city, store.country].filter(Boolean).join(", ")}
              </span>
            ) : null}
            {store.isVerified ? (
              <Pill tone="sky" icon="shield">
                {t("seller.verified", { defaultValue: "Verified" })}
              </Pill>
            ) : null}
            {Number(store.ratingAverage) > 0 ? (
              <StarRating value={store.ratingAverage} count={store.reviewCount} />
            ) : (
              <span className="mk-xs mk-subtle">{t("reviews.none", { defaultValue: "No reviews yet" })}</span>
            )}
          </div>
        </div>
      </header>

      <nav className="mk-steps-rail" style={{ borderBottom: "1px solid var(--mk-rule)", marginBottom: 22 }}>
        {TABS.map((name) => (
          <button
            key={name}
            type="button"
            className={`mk-steps-rail__item ${tab === name ? "is-on" : ""}`}
            onClick={() => setTab(name)}
          >
            {t(`store.tab.${name}`, { defaultValue: name })}
            {name === "available" && available.length ? ` (${available.length})` : ""}
            {name === "sold" && sold.length ? ` (${sold.length})` : ""}
            {name === "reviews" && reviews?.reviewCount ? ` (${reviews.reviewCount})` : ""}
          </button>
        ))}
      </nav>

      {tab === "available" || tab === "sold" ? (
        shown.length ? (
          <div className="mk-grid">
            {shown.map((listing) => (
              <ListingCard
                key={listing.id}
                listing={listing}
                favorited={favorites[listing.id] ?? listing.isFavorited}
                onFavorite={onFavorite}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon="tag"
            title={
              tab === "sold"
                ? t("store.noSold", { defaultValue: "No sold animals to show" })
                : t("store.noAvailable", { defaultValue: "Nothing available right now" })
            }
            body={
              tab === "available"
                ? t("store.noAvailableBody", {
                    defaultValue: "This breeder has no animals listed at the moment. Their sold history may still be worth a look.",
                  })
                : undefined
            }
          />
        )
      ) : null}

      {tab === "about" ? (
        <div className="mk-prose">
          {store.about ? (
            store.about.split("\n").map((paragraph, index) => <p key={index}>{paragraph}</p>)
          ) : (
            <p className="mk-muted">{t("store.noAbout", { defaultValue: "This breeder hasn't written an about section yet." })}</p>
          )}
          {store.websiteUrl ? (
            <p>
              <a href={store.websiteUrl} target="_blank" rel="noreferrer noopener">
                {store.websiteUrl}
              </a>
            </p>
          ) : null}
        </div>
      ) : null}

      {tab === "reviews" ? (
        reviews === null ? (
          <Spinner />
        ) : reviews.reviews.length ? (
          <div className="mk-col" style={{ gap: 12, maxWidth: 720 }}>
            {reviews.reviews.map((review) => (
              <article className="mk-card" style={{ padding: 16 }} key={review.id}>
                <div className="mk-row mk-row--between" style={{ marginBottom: 8 }}>
                  <div className="mk-row" style={{ gap: 10 }}>
                    <span className="mk-avatar" aria-hidden="true">
                      {initials(review.reviewerName)}
                    </span>
                    <span>
                      <b className="mk-sm">{review.reviewerName}</b>
                      {review.listingTitle ? <span className="mk-xs mk-subtle"> · {review.listingTitle}</span> : null}
                    </span>
                  </div>
                  <span className="mk-row" style={{ gap: 10 }}>
                    <StarRating value={review.rating} showValue={false} size={14} />
                    <span className="mk-xs mk-subtle">{shortDate(review.createdAt, i18n.language)}</span>
                  </span>
                </div>
                {review.reviewText ? <p className="mk-sm" style={{ margin: 0 }}>{review.reviewText}</p> : null}
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            icon="star"
            title={t("reviews.none", { defaultValue: "No reviews yet" })}
            body={t("reviews.noneBody", {
              defaultValue: "Buyers can leave a review once a sale through the marketplace is completed.",
            })}
          />
        )
      ) : null}

      {tab === "terms" ? (
        <div className="mk-prose">
          {[
            [t("store.terms", { defaultValue: "Terms" }), store.terms],
            [t("store.shipping", { defaultValue: "Shipping" }), store.shippingPolicy],
            [t("store.payment", { defaultValue: "Payment" }), store.paymentPolicy],
          ].filter(([, body]) => body).length ? (
            [
              [t("store.terms", { defaultValue: "Terms" }), store.terms],
              [t("store.shipping", { defaultValue: "Shipping" }), store.shippingPolicy],
              [t("store.payment", { defaultValue: "Payment" }), store.paymentPolicy],
            ]
              .filter(([, body]) => body)
              .map(([heading, body]) => (
                <section key={heading}>
                  <h2 className="mk-h2">{heading}</h2>
                  <p>{body}</p>
                </section>
              ))
          ) : (
            <p className="mk-muted">
              {t("store.noTerms", {
                defaultValue: "This breeder hasn't published terms yet. Ask them directly before agreeing a sale.",
              })}
            </p>
          )}
        </div>
      ) : null}

      <SignInPrompt intent={auth.pending} onClose={auth.dismiss} />
    </div>
  );
}
