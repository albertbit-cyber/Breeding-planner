import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { browse, favorite, saveSearch } from "../api";
import { DEFAULT_FILTERS, QUICK_GENES, SORTS, activeChips, countActive, cycleGene, fromSearchParams, geneState, toSearchParams } from "../filters";
import { geneTokens, joinTokens } from "../format";
import { useAuthAction } from "../session";
import FilterSheet from "../components/FilterSheet";
import { SignInPrompt } from "../components/RequireAuth";
import Button from "../ui/Button";
import Icon from "../ui/Icon";
import ListingCard from "../ui/ListingCard";
import { GeneTag } from "../ui/GeneTags";
import { EmptyState, ErrorPanel, ListingSkeletonGrid } from "../ui/States";
import { useToast } from "../ui/Toast";
import Dialog from "../ui/Dialog";

/**
 * Browse is the front door.
 *
 * It used to sit under a 280px hero with a stock photo pulled from
 * unsplash.com, which pushed every animal below the fold for a visitor whose
 * entire intent was to see animals. Search bar, then catalogue.
 */
export default function BrowsePage() {
  const { t } = useTranslation("marketplace");
  const { notify } = useToast();
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => fromSearchParams(params), [params]);

  const [state, setState] = useState({ status: "loading", listings: [], total: 0, pageCount: 1 });
  const [sheetOpen, setSheetOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [searchName, setSearchName] = useState("");
  const [term, setTerm] = useState(filters.search);
  const [favorites, setFavorites] = useState({});
  const auth = useAuthAction();
  const requestId = useRef(0);

  useEffect(() => setTerm(filters.search), [filters.search]);

  const apply = useCallback(
    (next, { replace = false } = {}) => {
      setParams(toSearchParams({ ...filters, ...next }), { replace });
    },
    [filters, setParams]
  );

  useEffect(() => {
    const id = ++requestId.current;
    setState((current) => ({ ...current, status: "loading" }));
    browse({ ...filters, page: filters.page || 1 })
      .then((result) => {
        if (requestId.current !== id) return;
        setState({
          status: "ready",
          listings: result.listings || [],
          total: result.total || 0,
          pageCount: result.pageCount || 1,
        });
      })
      .catch((error) => {
        if (requestId.current !== id) return;
        setState({ status: "error", error, listings: [], total: 0, pageCount: 1 });
      });
  }, [filters]);

  const chips = useMemo(() => activeChips(filters, t), [filters, t]);
  const activeCount = countActive(filters);
  const page = Math.max(1, Number(filters.page || 1));

  const onFavorite = (listing) =>
    auth.run({ kind: "favorite", listingId: listing.id }, async () => {
      // Flip immediately; the grid is the feedback, not a toast.
      setFavorites((current) => ({ ...current, [listing.id]: !current[listing.id] }));
      try {
        await favorite(listing.id);
      } catch (error) {
        setFavorites((current) => ({ ...current, [listing.id]: !current[listing.id] }));
        notify(error?.message || t("errors.favorite", { defaultValue: "Could not update saved animals." }), { tone: "bad" });
      }
    });

  const onSaveSearch = () =>
    auth.run({ kind: "savedSearch", filters }, () => {
      setSearchName(
        joinTokens(geneTokens(filters.includeGenes)) ||
          filters.search ||
          t("saved.searchDefaultName", { defaultValue: "My search" })
      );
      setSaveOpen(true);
    });

  const commitSavedSearch = async () => {
    try {
      await saveSearch({ name: searchName, filters });
      setSaveOpen(false);
      notify(t("saved.searchSaved", { defaultValue: "Saved. We'll email you when a match is listed." }));
    } catch (error) {
      notify(error?.message || t("errors.generic", { defaultValue: "Something went wrong." }), { tone: "bad" });
    }
  };

  const commitTerm = (value) => {
    // A bare gene name typed into the search box is almost always meant as a
    // gene filter, so promote it rather than leaving it as free text.
    const match = QUICK_GENES.find((gene) => gene.toLowerCase() === value.trim().toLowerCase());
    if (match) {
      apply({ ...cycleGene(filters, match), search: "" });
      setTerm("");
      return;
    }
    apply({ search: value.trim() });
  };

  return (
    <>
      <div className="mk-searchband">
        <div className="mk-searchband__inner">
          <h1 className="mk-sr-only">{t("browse.title", { defaultValue: "Browse animals" })}</h1>

          <div className="mk-searchbar">
            <div className="mk-tokenfield">
              <Icon name="search" size={17} />
              {geneTokens(filters.includeGenes).map((gene) => (
                <span key={`in-${gene}`} className="mk-gene">
                  {gene}
                  <button
                    type="button"
                    className="mk-token-remove"
                    aria-label={t("filters.removeGene", { defaultValue: "Remove {{gene}}", gene })}
                    onClick={() =>
                      apply({ includeGenes: joinTokens(geneTokens(filters.includeGenes).filter((token) => token !== gene)) })
                    }
                  >
                    <Icon name="x" size={12} />
                  </button>
                </span>
              ))}
              {geneTokens(filters.excludeGenes).map((gene) => (
                <span key={`out-${gene}`} className="mk-gene mk-gene--off">
                  {gene}
                  <button
                    type="button"
                    className="mk-token-remove"
                    aria-label={t("filters.removeGene", { defaultValue: "Remove {{gene}}", gene })}
                    onClick={() =>
                      apply({ excludeGenes: joinTokens(geneTokens(filters.excludeGenes).filter((token) => token !== gene)) })
                    }
                  >
                    <Icon name="x" size={12} />
                  </button>
                </span>
              ))}
              <input
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") commitTerm(term);
                  if (event.key === "Backspace" && !term) {
                    const tokens = geneTokens(filters.includeGenes);
                    if (tokens.length) apply({ includeGenes: joinTokens(tokens.slice(0, -1)) });
                  }
                }}
                onBlur={() => term !== filters.search && commitTerm(term)}
                placeholder={t("browse.searchPlaceholder", {
                  defaultValue: "Add a gene, morph, breeder or city…",
                })}
                aria-label={t("browse.searchLabel", { defaultValue: "Search animals" })}
              />
            </div>

            <Button variant="outline" icon="settings" onClick={() => setSheetOpen(true)}>
              {t("filters.all", { defaultValue: "All filters" })}
              {activeCount > 0 ? <span className="mk-pill mk-pill--sky">{activeCount}</span> : null}
            </Button>
            <Button variant="ink" icon="bell" onClick={onSaveSearch}>
              {t("browse.saveSearch", { defaultValue: "Save this search" })}
            </Button>
          </div>

          <div className="mk-chiprow">
            <button
              type="button"
              className={`mk-chip ${!filters.includeSold ? "is-on" : ""}`}
              onClick={() => apply({ includeSold: filters.includeSold ? "" : "true" })}
            >
              <Icon name="check" size={13} />
              {t("filters.availableOnly", { defaultValue: "Available only" })}
            </button>
            <button
              type="button"
              className={`mk-chip ${filters.verifiedOnly ? "is-active" : ""}`}
              onClick={() => apply({ verifiedOnly: filters.verifiedOnly ? "" : "true" })}
            >
              <Icon name="shield" size={13} />
              {t("filters.verified", { defaultValue: "Verified breeders" })}
            </button>
            <button
              type="button"
              className={`mk-chip ${filters.shippingAvailable ? "is-active" : ""}`}
              onClick={() => apply({ shippingAvailable: filters.shippingAvailable ? "" : "true" })}
            >
              <Icon name="truck" size={13} />
              {t("filters.shipping", { defaultValue: "Ships" })}
            </button>
            <button
              type="button"
              className={`mk-chip ${filters.minProvenance === "4" ? "is-active" : ""}`}
              onClick={() => apply({ minProvenance: filters.minProvenance === "4" ? "" : "4" })}
            >
              <Icon name="dna" size={13} />
              {t("filters.fullRecord", { defaultValue: "Full record" })}
            </button>
            {QUICK_GENES.slice(0, 4).map((gene) => (
              <GeneTag
                key={gene}
                label={gene}
                excluded={geneState(filters, gene) === "exclude"}
                onClick={() => apply(cycleGene(filters, gene))}
                style={geneState(filters, gene) === "off" ? { opacity: 0.6 } : undefined}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="mk-wrap">
        {chips.length ? (
          <div className="mk-chiprow" style={{ paddingBottom: 0 }}>
            {chips.map((chip) => (
              <button key={chip.key} type="button" className="mk-chip is-active" onClick={() => apply(chip.patch)}>
                {chip.label}
                <Icon name="x" size={13} />
              </button>
            ))}
            <Button variant="quiet" size="sm" onClick={() => setParams(new URLSearchParams())}>
              {t("filters.clearAll", { defaultValue: "Clear all" })}
            </Button>
          </div>
        ) : null}

        <div className="mk-resultbar">
          <p className="mk-resultbar__count" style={{ margin: 0 }}>
            {state.status === "loading" ? (
              <span className="mk-muted">{t("browse.searching", { defaultValue: "Searching…" })}</span>
            ) : (
              <>
                <b className="mk-tnum">{state.total.toLocaleString()}</b>{" "}
                <span className="mk-muted">
                  {t("browse.matchCount", { defaultValue: "animals match", count: state.total })}
                </span>
              </>
            )}
          </p>
          <label className="mk-row" style={{ gap: 8 }}>
            <span className="mk-muted mk-xs">{t("browse.sort", { defaultValue: "Sort" })}</span>
            <select
              className="mk-select"
              style={{ width: "auto" }}
              value={filters.sort}
              onChange={(event) => apply({ sort: event.target.value, page: "" })}
            >
              {SORTS.map((sort) => (
                <option key={sort} value={sort}>
                  {t(`sortOptions.${sort}`, { defaultValue: sort })}
                </option>
              ))}
            </select>
          </label>
        </div>

        {state.status === "error" ? (
          <ErrorPanel error={state.error} onRetry={() => apply({})} />
        ) : state.status === "loading" ? (
          <ListingSkeletonGrid />
        ) : state.listings.length === 0 ? (
          <EmptyState
            title={t("browse.emptyTitle", { defaultValue: "No animals match those filters" })}
            body={t("browse.emptyBody", {
              defaultValue: "Try widening the price range, removing a gene, or including sold animals as price comparison.",
            })}
            action={
              activeCount ? (
                <Button variant="outline" onClick={() => setParams(new URLSearchParams())}>
                  {t("filters.clearAll", { defaultValue: "Clear all" })}
                </Button>
              ) : null
            }
          />
        ) : (
          <>
            <div className="mk-grid">
              {state.listings.map((listing) => (
                <ListingCard
                  key={listing.id}
                  listing={listing}
                  favorited={favorites[listing.id] ?? listing.isFavorited}
                  onFavorite={onFavorite}
                />
              ))}
            </div>

            {state.pageCount > 1 ? (
              <nav className="mk-pagebar" aria-label={t("browse.pagination", { defaultValue: "Pages" })}>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => {
                    apply({ page: String(page - 1) });
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                >
                  {t("common.previous", { defaultValue: "Previous" })}
                </Button>
                <span className="mk-tnum">
                  {t("browse.pageOf", { defaultValue: "Page {{page}} of {{total}}", page, total: state.pageCount })}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= state.pageCount}
                  onClick={() => {
                    apply({ page: String(page + 1) });
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                >
                  {t("common.next", { defaultValue: "Next" })}
                </Button>
              </nav>
            ) : null}
          </>
        )}
      </div>

      <FilterSheet
        open={sheetOpen}
        filters={filters}
        resultCount={state.status === "ready" ? state.total : undefined}
        onClose={() => setSheetOpen(false)}
        onApply={(next) => {
          setSheetOpen(false);
          setParams(toSearchParams({ ...DEFAULT_FILTERS, ...next, page: "" }));
        }}
      />

      <Dialog
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        size="sm"
        title={t("saved.saveTitle", { defaultValue: "Save this search" })}
        description={t("saved.saveBody", {
          defaultValue: "We'll email you when an animal matching these filters is listed.",
        })}
        footer={
          <>
            <Button variant="quiet" onClick={() => setSaveOpen(false)}>
              {t("common.cancel", { defaultValue: "Cancel" })}
            </Button>
            <Button variant="ink" onClick={commitSavedSearch} disabled={!searchName.trim()}>
              {t("saved.save", { defaultValue: "Save search" })}
            </Button>
          </>
        }
      >
        <label className="mk-field">
          <span className="mk-label">{t("saved.name", { defaultValue: "Name this search" })}</span>
          <input className="mk-input" value={searchName} onChange={(event) => setSearchName(event.target.value)} />
        </label>
        <div className="mk-genes">
          {chips.map((chip) => (
            <span key={chip.key} className="mk-pill">
              {chip.label}
            </span>
          ))}
        </div>
      </Dialog>

      <SignInPrompt intent={auth.pending} onClose={auth.dismiss} />
    </>
  );
}
