import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { favorites as fetchFavorites, removeSearch, reviewableSales, savedSearches, submitReview } from "../api";
import { activeChips, toSearchParams } from "../filters";
import Button from "../ui/Button";
import Dialog from "../ui/Dialog";
import Icon from "../ui/Icon";
import ListingCard from "../ui/ListingCard";
import { StarInput } from "../ui/StarRating";
import { EmptyState, ErrorPanel, ListingSkeletonGrid } from "../ui/States";
import { useToast } from "../ui/Toast";

/**
 * Saved animals, saved searches, and reviews waiting to be written.
 *
 * Saved searches had a table, a service and three routes and no interface at
 * all; the same is true of the review form. Both are the reason someone comes
 * back, so they live together on one page.
 */
export default function SavedPage() {
  const { t } = useTranslation("marketplace");
  const { notify } = useToast();
  const navigate = useNavigate();

  const [tab, setTab] = useState("animals");
  const [saved, setSaved] = useState(null);
  const [searches, setSearches] = useState(null);
  const [pending, setPending] = useState([]);
  const [error, setError] = useState(null);
  const [reviewFor, setReviewFor] = useState(null);
  const [rating, setRating] = useState(5);
  const [reviewText, setReviewText] = useState("");

  const load = useCallback(() => {
    fetchFavorites()
      .then(setSaved)
      .catch((loadError) => {
        setError(loadError);
        setSaved([]);
      });
    savedSearches().then(setSearches).catch(() => setSearches([]));
    reviewableSales().then(setPending).catch(() => setPending([]));
  }, []);

  useEffect(load, [load]);

  const runSearch = (search) => {
    navigate({ pathname: "/", search: toSearchParams(search.filters || {}).toString() });
  };

  const drop = async (search) => {
    try {
      await removeSearch(search.id);
      setSearches((current) => (current || []).filter((entry) => entry.id !== search.id));
      notify(t("saved.searchRemoved", { defaultValue: "Saved search removed." }));
    } catch (removeError) {
      notify(removeError?.message || t("errors.generic", { defaultValue: "Something went wrong." }), { tone: "bad" });
    }
  };

  const sendReview = async () => {
    try {
      await submitReview({ saleId: reviewFor.id, rating, reviewText });
      setReviewFor(null);
      setReviewText("");
      setRating(5);
      setPending((current) => current.filter((sale) => sale.id !== reviewFor.id));
      notify(t("reviews.thanks", { defaultValue: "Thanks — your review is published." }));
    } catch (reviewError) {
      notify(reviewError?.message || t("errors.generic", { defaultValue: "Something went wrong." }), { tone: "bad" });
    }
  };

  return (
    <div className="mk-wrap" style={{ paddingTop: 24, paddingBottom: 40 }}>
      <h1 className="mk-h1">{t("saved.title", { defaultValue: "Saved" })}</h1>

      <nav className="mk-steps-rail" style={{ borderBottom: "1px solid var(--mk-rule)", margin: "12px 0 22px" }}>
        {[
          ["animals", t("saved.animals", { defaultValue: "Animals" })],
          ["searches", t("saved.searches", { defaultValue: "Searches" })],
          ["reviews", t("saved.reviews", { defaultValue: "Reviews to write" })],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={`mk-steps-rail__item ${tab === value ? "is-on" : ""}`}
            onClick={() => setTab(value)}
          >
            {label}
            {value === "searches" && searches?.length ? ` (${searches.length})` : ""}
            {value === "reviews" && pending.length ? ` (${pending.length})` : ""}
          </button>
        ))}
      </nav>

      {error ? <ErrorPanel error={error} onRetry={load} /> : null}

      {tab === "animals" ? (
        saved === null ? (
          <ListingSkeletonGrid count={4} />
        ) : saved.length ? (
          <div className="mk-grid">
            {saved.map((listing) => (
              <ListingCard key={listing.id} listing={listing} favorited />
            ))}
          </div>
        ) : (
          <EmptyState
            icon="heart"
            title={t("saved.noAnimals", { defaultValue: "Nothing saved yet" })}
            body={t("saved.noAnimalsBody", {
              defaultValue: "Tap the heart on any animal to keep it here while you decide.",
            })}
            action={
              <Button variant="ink" to="/">
                {t("gate.backToBrowse", { defaultValue: "Back to browsing" })}
              </Button>
            }
          />
        )
      ) : null}

      {tab === "searches" ? (
        searches === null ? null : searches.length ? (
          <div className="mk-col" style={{ gap: 10, maxWidth: 760 }}>
            {searches.map((search) => {
              const chips = activeChips(search.filters || {}, t);
              return (
                <article className="mk-card" style={{ padding: 16 }} key={search.id}>
                  <div className="mk-row mk-row--between" style={{ marginBottom: 10 }}>
                    <b>{search.name}</b>
                    <span className="mk-row" style={{ gap: 8 }}>
                      <Button variant="outline" size="sm" onClick={() => runSearch(search)}>
                        {t("saved.run", { defaultValue: "Run search" })}
                      </Button>
                      <Button
                        variant="quiet"
                        size="sm"
                        icon="trash"
                        onClick={() => drop(search)}
                        aria-label={t("saved.remove", { defaultValue: "Remove saved search" })}
                      />
                    </span>
                  </div>
                  <div className="mk-genes">
                    {chips.length ? (
                      chips.map((chip) => (
                        <span className="mk-pill" key={chip.key}>
                          {chip.label}
                        </span>
                      ))
                    ) : (
                      <span className="mk-xs mk-subtle">{t("saved.noFilters", { defaultValue: "No filters" })}</span>
                    )}
                  </div>
                  <p className="mk-hint" style={{ marginBottom: 0 }}>
                    <Icon name="bell" size={13} />{" "}
                    {t("saved.alertNote", { defaultValue: "You'll be emailed when a new animal matches." })}
                  </p>
                </article>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon="bell"
            title={t("saved.noSearches", { defaultValue: "No saved searches" })}
            body={t("saved.noSearchesBody", {
              defaultValue:
                "Set up the filters you actually want — a gene, a sex, a price ceiling — then save them, and we'll email you when something matches.",
            })}
            action={
              <Button variant="ink" to="/">
                {t("saved.startSearch", { defaultValue: "Start a search" })}
              </Button>
            }
          />
        )
      ) : null}

      {tab === "reviews" ? (
        pending.length ? (
          <div className="mk-col" style={{ gap: 10, maxWidth: 640 }}>
            {pending.map((sale) => (
              <article className="mk-card mk-row mk-row--between" style={{ padding: 16 }} key={sale.id}>
                <span>
                  <b className="mk-sm">{sale.listingTitle}</b>
                  <br />
                  <span className="mk-xs mk-muted">{sale.sellerName}</span>
                </span>
                <Button variant="ink" size="sm" onClick={() => setReviewFor(sale)}>
                  {t("reviews.write", { defaultValue: "Write a review" })}
                </Button>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            icon="star"
            title={t("reviews.nonePending", { defaultValue: "Nothing to review" })}
            body={t("reviews.nonePendingBody", {
              defaultValue: "Once a purchase through the marketplace is completed, you can review the breeder here.",
            })}
          />
        )
      ) : null}

      <Dialog
        open={Boolean(reviewFor)}
        onClose={() => setReviewFor(null)}
        title={t("reviews.writeTitle", { defaultValue: "Review this breeder" })}
        description={reviewFor?.listingTitle}
        footer={
          <>
            <Button variant="quiet" onClick={() => setReviewFor(null)}>
              {t("common.cancel", { defaultValue: "Cancel" })}
            </Button>
            <Button variant="ink" onClick={sendReview}>
              {t("reviews.publish", { defaultValue: "Publish review" })}
            </Button>
          </>
        }
      >
        <div className="mk-field">
          <span className="mk-label">{t("reviews.yourRating", { defaultValue: "Your rating" })}</span>
          <StarInput value={rating} onChange={setRating} />
        </div>
        <label className="mk-field">
          <span className="mk-label">{t("reviews.yourWords", { defaultValue: "In your words" })}</span>
          <textarea
            className="mk-textarea"
            rows={4}
            value={reviewText}
            onChange={(event) => setReviewText(event.target.value)}
            placeholder={t("reviews.placeholder", {
              defaultValue: "How was the communication, the accuracy of the listing, and the animal's condition?",
            })}
          />
        </label>
      </Dialog>
    </div>
  );
}
