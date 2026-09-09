import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { dashboard as fetchDashboard, saveStore, setListingStatus } from "../api";
import { money, primaryImage, relativeTime } from "../format";
import Button from "../ui/Button";
import Dialog from "../ui/Dialog";
import Icon from "../ui/Icon";
import { AvailabilityPill, Pill } from "../ui/Pill";
import ProvenanceMeter from "../ui/ProvenanceMeter";
import { EmptyState, ErrorPanel, Spinner } from "../ui/States";
import { useToast } from "../ui/Toast";

/**
 * The seller's dashboard.
 *
 * It used to open with `Object.entries(analytics)` -- whatever the API happened
 * to return, in whatever order, rendered as eight identical tiles. A seller's
 * first question is never "what is my conversion rate", it is "what is waiting
 * on me", so that queue comes first, the listings second, and the numbers last.
 */
export default function DashboardPage() {
  const { t, i18n } = useTranslation("marketplace");
  const { notify } = useToast();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState("available");
  const [storeOpen, setStoreOpen] = useState(false);
  const [storeDraft, setStoreDraft] = useState({ storeName: "", about: "", city: "", country: "" });

  const load = useCallback(() => {
    fetchDashboard()
      .then((result) => {
        setData(result);
        setError(null);
        setStoreDraft({
          storeName: result.store?.storeName || "",
          about: result.store?.about || "",
          city: result.store?.city || "",
          country: result.store?.country || "",
        });
      })
      .catch(setError);
  }, []);

  useEffect(load, [load]);

  if (error) {
    return (
      <div className="mk-wrap" style={{ paddingTop: 24 }}>
        <ErrorPanel error={error} onRetry={load} />
      </div>
    );
  }
  if (!data) return <Spinner />;

  const listings = data.listings || [];
  const counts = {
    available: listings.filter((item) => item.status === "available" && item.availability !== "reserved").length,
    reserved: listings.filter((item) => item.availability === "reserved").length,
    draft: listings.filter((item) => item.status === "draft").length,
    sold: listings.filter((item) => item.availability === "sold").length,
  };
  const shown = listings.filter((item) => {
    if (tab === "reserved") return item.availability === "reserved";
    if (tab === "sold") return item.availability === "sold";
    if (tab === "draft") return item.status === "draft";
    return item.status === "available" && item.availability !== "reserved";
  });

  const changeStatus = async (listing, status) => {
    try {
      await setListingStatus(listing.id, status);
      notify(t("dashboard.statusChanged", { defaultValue: "Listing updated." }));
      load();
    } catch (statusError) {
      notify(statusError?.message || t("errors.generic", { defaultValue: "Something went wrong." }), { tone: "bad" });
    }
  };

  const persistStore = async () => {
    try {
      await saveStore(storeDraft);
      setStoreOpen(false);
      notify(t("dashboard.storeSaved", { defaultValue: "Store profile saved." }));
      load();
    } catch (storeError) {
      notify(storeError?.message || t("errors.generic", { defaultValue: "Something went wrong." }), { tone: "bad" });
    }
  };

  const analytics = data.analytics || {};

  return (
    <div className="mk-wrap" style={{ paddingTop: 24, paddingBottom: 40 }}>
      <div className="mk-row mk-row--between" style={{ marginBottom: 18 }}>
        <div>
          <h1 className="mk-h1" style={{ marginBottom: 3 }}>
            {data.store?.storeName || t("dashboard.noStoreName", { defaultValue: "Your listings" })}
          </h1>
          <span className="mk-sm mk-muted">
            {t("dashboard.summary", {
              defaultValue: "{{available}} available · {{reserved}} reserved · {{sold}} sold",
              available: counts.available,
              reserved: counts.reserved,
              sold: counts.sold,
            })}
          </span>
        </div>
        <div className="mk-row" style={{ gap: 8 }}>
          <Button variant="outline" size="sm" onClick={() => setStoreOpen(true)}>
            {data.store ? t("dashboard.editStore", { defaultValue: "Edit store" }) : t("dashboard.createStore", { defaultValue: "Create store profile" })}
          </Button>
          {data.store ? (
            <Button variant="outline" size="sm" iconAfter="chevronRight" to={`/s/${data.store.userId}`}>
              {t("dashboard.viewStore", { defaultValue: "View public store" })}
            </Button>
          ) : null}
        </div>
      </div>

      {data.needsYou?.length ? (
        <div className="mk-card" style={{ marginBottom: 22, borderColor: "color-mix(in srgb, var(--mk-sky) 35%, transparent)" }}>
          <div
            className="mk-row mk-row--between"
            style={{ padding: "14px 18px", borderBottom: "1px solid var(--mk-rule)", background: "var(--mk-sky-wash)" }}
          >
            <b className="mk-sm" style={{ color: "var(--mk-sky-text)" }}>
              {t("dashboard.needsYou", { defaultValue: "Needs you — {{count}} things", count: data.needsYou.length })}
            </b>
            <span className="mk-xs" style={{ color: "var(--mk-sky-text)" }}>
              {t("dashboard.oldest", {
                defaultValue: "Oldest waiting {{when}}",
                when: relativeTime(data.needsYou[0].waitingSince, i18n.language),
              })}
            </span>
          </div>
          <div className="mk-record" style={{ border: 0, borderRadius: 0 }}>
            {data.needsYou.map((item, index) => (
              <div className="mk-record__row" key={`${item.kind}-${item.conversationId || item.saleId}-${index}`}>
                <span className={`mk-record__icon mk-record__icon--${item.kind === "deposit" ? "clay" : "gold"}`}>
                  <Icon name={item.kind === "deposit" ? "calendar" : "message"} size={16} />
                </span>
                <span className="mk-record__text">
                  <b className="mk-record__title">
                    {item.kind === "offer"
                      ? t("dashboard.offerFrom", {
                          defaultValue: "{{name}} offered {{amount}} for {{title}}",
                          name: item.counterpartyName,
                          amount: money(item.offerAmount, item.currency, i18n.language),
                          title: item.listingTitle,
                        })
                      : item.kind === "deposit"
                        ? t("dashboard.depositExpiring", {
                            defaultValue: "Deposit on {{title}} expires in {{days}} days",
                            title: item.listingTitle,
                            days: item.daysLeft,
                          })
                        : t("dashboard.questionFrom", {
                            defaultValue: "{{name}} asked about {{title}}",
                            name: item.counterpartyName,
                            title: item.listingTitle,
                          })}
                  </b>
                  <span className="mk-record__sub">
                    {[
                      relativeTime(item.waitingSince, i18n.language),
                      item.kind === "offer" && item.askingPrice
                        ? t("dashboard.underAsking", {
                            defaultValue: "{{amount}} under asking",
                            amount: money(Number(item.askingPrice) - Number(item.offerAmount), item.currency, i18n.language),
                          })
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                {item.conversationId ? (
                  <Button variant="outline" size="sm" onClick={() => navigate(`/inbox/${item.conversationId}`)}>
                    {item.kind === "offer"
                      ? t("dashboard.reviewOffer", { defaultValue: "Review offer" })
                      : t("dashboard.reply", { defaultValue: "Reply" })}
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" to="/inbox">
                    {t("dashboard.openInbox", { defaultValue: "Open inbox" })}
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mk-row mk-row--between" style={{ marginBottom: 12 }}>
        <b className="mk-h3">{t("dashboard.yourListings", { defaultValue: "Your listings" })}</b>
        <div className="mk-chiprow" style={{ padding: 0 }}>
          {["available", "reserved", "draft", "sold"].map((value) => (
            <button
              key={value}
              type="button"
              className={`mk-chip ${tab === value ? "is-on" : ""}`}
              style={{ padding: "5px 12px", fontSize: 12 }}
              onClick={() => setTab(value)}
            >
              {t(`availability.${value}`, { defaultValue: value })} {counts[value]}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <EmptyState
          icon="tag"
          title={t("dashboard.emptyTitle", { defaultValue: "Nothing here yet" })}
          body={t("dashboard.emptyBody", {
            defaultValue: "Animals you list appear here with their views, saves and offers.",
          })}
          action={
            <Button variant="ink" icon="plus" to="/sell">
              {t("nav.sell", { defaultValue: "List an animal" })}
            </Button>
          }
        />
      ) : (
        <div className="mk-table-rows" style={{ marginBottom: 24 }}>
          {shown.map((listing) => {
            const suggestion = (data.suggestions || []).find((entry) => entry.listingId === listing.id);
            return (
              <React.Fragment key={listing.id}>
                <div className="mk-table-row">
                  {primaryImage(listing) ? (
                    <img className="mk-table-row__thumb" src={primaryImage(listing)} alt="" />
                  ) : (
                    <span className="mk-table-row__thumb" />
                  )}
                  <span className="mk-grow" style={{ minWidth: 180 }}>
                    <Link to={`/a/${listing.id}`} style={{ color: "inherit", fontWeight: 500, fontSize: 13 }}>
                      {listing.title}
                    </Link>
                    <br />
                    <span className="mk-xs mk-subtle mk-mono">{listing.animalId || "—"}</span>
                  </span>
                  <ProvenanceMeter provenance={listing.provenance} showLabel={false} />
                  <span className="mk-sm mk-muted mk-tnum" style={{ minWidth: 130 }}>
                    {t("dashboard.viewsSaves", {
                      defaultValue: "{{views}} views · {{saves}} saved",
                      views: listing.viewsCount || 0,
                      saves: listing.favoritesCount || 0,
                    })}
                  </span>
                  <span className="mk-price mk-tnum" style={{ minWidth: 90, textAlign: "end" }}>
                    {money(listing.price, listing.currency, i18n.language) || "—"}
                  </span>
                  <AvailabilityPill availability={listing.availability} status={listing.status} />
                  <span className="mk-row" style={{ gap: 6 }}>
                    {listing.status === "draft" ? (
                      <Button variant="ink" size="sm" onClick={() => changeStatus(listing, "available")}>
                        {t("dashboard.publish", { defaultValue: "Publish" })}
                      </Button>
                    ) : null}
                    {listing.availability === "reserved" ? (
                      <Button variant="outline" size="sm" onClick={() => changeStatus(listing, "sold")}>
                        {t("dashboard.markSold", { defaultValue: "Mark sold" })}
                      </Button>
                    ) : null}
                    <Button variant="outline" size="sm" to={`/sell/${listing.id}`}>
                      {t("common.edit", { defaultValue: "Edit" })}
                    </Button>
                  </span>
                </div>

                {suggestion ? (
                  <div className="mk-table-row" style={{ background: "var(--mk-gold)" }}>
                    <span className="mk-record__icon mk-record__icon--gold" style={{ background: "transparent" }}>
                      <Icon name="dna" size={18} />
                    </span>
                    <span className="mk-grow" style={{ color: "var(--mk-gold-mark)" }}>
                      <b className="mk-sm">
                        {t("dashboard.unpublishedTitle", {
                          defaultValue: "{{title}} is carrying evidence you haven't published",
                          title: suggestion.listingTitle,
                        })}
                      </b>
                      <br />
                      <span className="mk-xs">
                        {t("dashboard.unpublishedBody", {
                          defaultValue: "You have {{list}} on file for this animal. Publishing it strengthens the listing.",
                          list: suggestion.missing.map((key) => t(`publish.${key}Short`, { defaultValue: key })).join(", "),
                        })}
                      </span>
                    </span>
                    <Button variant="ink" size="sm" to={`/sell/${listing.id}`}>
                      {t("dashboard.publishRecord", { defaultValue: "Publish it" })}
                    </Button>
                  </div>
                ) : null}
              </React.Fragment>
            );
          })}
        </div>
      )}

      <b className="mk-h3" style={{ display: "block", marginBottom: 12 }}>
        {t("dashboard.numbers", { defaultValue: "Your numbers" })}
      </b>
      <div className="mk-stats">
        {[
          ["viewsCount", t("dashboard.views", { defaultValue: "Views" })],
          ["favoritesCount", t("dashboard.saves", { defaultValue: "Saves" })],
          ["openConversations", t("dashboard.conversations", { defaultValue: "Open conversations" })],
          ["soldListings", t("dashboard.sold", { defaultValue: "Sold" })],
          ["medianDaysToSell", t("dashboard.daysToSell", { defaultValue: "Median days to sell" })],
        ].map(([key, label]) => (
          <div className="mk-card mk-stat" key={key}>
            <span className="mk-label">{label}</span>
            <b className="mk-stat__value mk-tnum">
              {analytics[key] === null || analytics[key] === undefined ? "—" : Number(analytics[key]).toLocaleString()}
            </b>
          </div>
        ))}
      </div>

      <Dialog
        open={storeOpen}
        onClose={() => setStoreOpen(false)}
        title={t("dashboard.storeTitle", { defaultValue: "Store profile" })}
        description={t("dashboard.storeBody", {
          defaultValue: "This is what buyers see when they open your store from a listing.",
        })}
        footer={
          <>
            <Button variant="quiet" onClick={() => setStoreOpen(false)}>
              {t("common.cancel", { defaultValue: "Cancel" })}
            </Button>
            <Button variant="ink" disabled={!storeDraft.storeName.trim()} onClick={persistStore}>
              {t("common.save", { defaultValue: "Save" })}
            </Button>
          </>
        }
      >
        <label className="mk-field">
          <span className="mk-label">{t("dashboard.storeName", { defaultValue: "Store name" })}</span>
          <input
            className="mk-input"
            value={storeDraft.storeName}
            onChange={(event) => setStoreDraft({ ...storeDraft, storeName: event.target.value })}
          />
        </label>
        <div className="mk-row" style={{ gap: 12 }}>
          <label className="mk-field mk-grow">
            <span className="mk-label">{t("sell.city", { defaultValue: "City / region" })}</span>
            <input
              className="mk-input"
              value={storeDraft.city}
              onChange={(event) => setStoreDraft({ ...storeDraft, city: event.target.value })}
            />
          </label>
          <label className="mk-field mk-grow">
            <span className="mk-label">{t("filters.country", { defaultValue: "Country" })}</span>
            <input
              className="mk-input"
              value={storeDraft.country}
              onChange={(event) => setStoreDraft({ ...storeDraft, country: event.target.value })}
            />
          </label>
        </div>
        <label className="mk-field">
          <span className="mk-label">{t("dashboard.about", { defaultValue: "About your programme" })}</span>
          <textarea
            className="mk-textarea"
            rows={5}
            value={storeDraft.about}
            onChange={(event) => setStoreDraft({ ...storeDraft, about: event.target.value })}
          />
        </label>
      </Dialog>
    </div>
  );
}
