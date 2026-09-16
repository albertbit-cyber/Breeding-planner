import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import Button from "./Button";
import GeneTags from "./GeneTags";
import Icon from "./Icon";
import { money } from "../format";
import { EmptyState } from "./States";

/**
 * The wishlist: what a buyer is hunting for, and what has turned up.
 *
 * Favouriting answers "I like this animal". This answers the question the
 * marketplace could not: "tell me when an animal like this exists", which
 * otherwise means coming back and running the same search every week.
 *
 * Matches are listed above the entries on purpose. Someone opening this tab
 * after a notification came in is here for the snake, not to edit their filters.
 */
export default function WishlistPanel({ wishlists, matches, onCreate, onRemove, onError }) {
  const { t, i18n } = useTranslation("marketplace");
  const [genes, setGenes] = useState("");
  const [label, setLabel] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [sex, setSex] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    const includeGenes = genes.split(",").map((gene) => gene.trim()).filter(Boolean);
    if (!includeGenes.length) {
      onError?.(t("wishlist.needGene", { defaultValue: "Name at least one gene to watch for." }));
      return;
    }
    setBusy(true);
    try {
      await onCreate({ label: label.trim() || includeGenes.join(" + "), includeGenes, sex, maxPrice });
      setGenes("");
      setLabel("");
      setMaxPrice("");
      setSex("");
    } catch (error) {
      onError?.(error?.message || t("errors.generic", { defaultValue: "Something went wrong." }));
    } finally {
      setBusy(false);
    }
  };

  const drop = async (entry) => {
    try {
      await onRemove(entry);
    } catch (error) {
      onError?.(error?.message || t("errors.generic", { defaultValue: "Something went wrong." }));
    }
  };

  return (
    <div className="mk-col" style={{ gap: 26, maxWidth: 760 }}>
      {matches.length ? (
        <section className="mk-col" style={{ gap: 10 }}>
          <h2 className="mk-h3" style={{ margin: 0 }}>
            {t("wishlist.matchesTitle", { defaultValue: "Found for you" })}
          </h2>
          {matches.map((match) => (
            <article
              key={match.id}
              className="mk-row"
              style={{
                gap: 12,
                alignItems: "center",
                border: "1px solid var(--mk-rule)",
                borderRadius: 10,
                padding: 12,
              }}
            >
              {match.listing?.imageUrl ? (
                <img
                  src={match.listing.imageUrl}
                  alt=""
                  loading="lazy"
                  style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8, flex: "none" }}
                />
              ) : null}
              <div className="mk-col" style={{ gap: 4, flex: 1, minWidth: 0 }}>
                <Link to={`/a/${match.listing?.id}`} style={{ fontWeight: 600 }}>
                  {match.listing?.title}
                </Link>
                <GeneTags genetics={match.listing?.genetics} max={4} />
                <span className="mk-muted" style={{ fontSize: 12 }}>
                  {t("wishlist.matchedBy", { defaultValue: "Matched" })} · {match.wishlist?.label}
                </span>
              </div>
              <div className="mk-col" style={{ gap: 6, alignItems: "flex-end", flex: "none" }}>
                <strong className="mk-tnum">
                  {money(match.listing?.price, match.listing?.currency, i18n.language)
                    || t("listing.priceOnInquiry", { defaultValue: "Price on inquiry" })}
                </strong>
                <Button variant="ink" size="sm" to={`/a/${match.listing?.id}`}>
                  {t("wishlist.contact", { defaultValue: "Contact seller" })}
                </Button>
              </div>
            </article>
          ))}
        </section>
      ) : null}

      <section className="mk-col" style={{ gap: 10 }}>
        <h2 className="mk-h3" style={{ margin: 0 }}>
          {t("wishlist.watchingTitle", { defaultValue: "Watching for" })}
        </h2>

        <form className="mk-col" style={{ gap: 8 }} onSubmit={submit}>
          <label className="mk-col" style={{ gap: 4 }}>
            <span className="mk-muted" style={{ fontSize: 12 }}>
              {t("wishlist.genesLabel", { defaultValue: "Genes, separated by commas" })}
            </span>
            <input
              className="mk-input"
              value={genes}
              onChange={(event) => setGenes(event.target.value)}
              placeholder={t("wishlist.genesPlaceholder", { defaultValue: "Clown, Pastel" })}
            />
          </label>
          <div className="mk-row" style={{ gap: 8, flexWrap: "wrap" }}>
            <input
              className="mk-input"
              style={{ flex: "1 1 180px" }}
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder={t("wishlist.labelPlaceholder", { defaultValue: "Name it (optional)" })}
            />
            <select
              className="mk-input"
              style={{ flex: "0 1 130px" }}
              value={sex}
              onChange={(event) => setSex(event.target.value)}
            >
              <option value="">{t("wishlist.anySex", { defaultValue: "Any sex" })}</option>
              <option value="male">{t("common.male", { defaultValue: "Male" })}</option>
              <option value="female">{t("common.female", { defaultValue: "Female" })}</option>
            </select>
            <input
              className="mk-input"
              style={{ flex: "0 1 140px" }}
              value={maxPrice}
              onChange={(event) => setMaxPrice(event.target.value)}
              inputMode="decimal"
              placeholder={t("wishlist.maxPrice", { defaultValue: "Max price" })}
            />
            <Button type="submit" variant="ink" icon="plus" busy={busy} disabled={busy}>
              {busy
                ? t("common.saving", { defaultValue: "Saving…" })
                : t("wishlist.add", { defaultValue: "Watch this" })}
            </Button>
          </div>
          <span className="mk-muted" style={{ fontSize: 12 }}>
            {t("wishlist.priceHelp", {
              defaultValue:
                "A max price leaves out animals listed as price on inquiry, since those cannot be shown to fit it.",
            })}
          </span>
        </form>

        {wishlists === null ? null : wishlists.length ? (
          <div className="mk-col" style={{ gap: 8 }}>
            {wishlists.map((entry) => (
              <div
                key={entry.id}
                className="mk-row"
                style={{
                  gap: 10,
                  alignItems: "center",
                  border: "1px solid var(--mk-rule)",
                  borderRadius: 10,
                  padding: "10px 12px",
                }}
              >
                <div className="mk-col" style={{ gap: 4, flex: 1, minWidth: 0 }}>
                  <span style={{ fontWeight: 600 }}>{entry.label}</span>
                  <GeneTags genetics={(entry.includeGenes || []).join(", ")} max={5} />
                  <span className="mk-muted" style={{ fontSize: 12 }}>
                    {[
                      entry.sex || null,
                      entry.maxPrice ? money(entry.maxPrice, "EUR", i18n.language) : null,
                      entry.matchCount
                        ? t("wishlist.found", { defaultValue: "{{count}} found", count: entry.matchCount })
                        : t("wishlist.watching", { defaultValue: "watching" }),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => drop(entry)}
                  aria-label={t("wishlist.remove", { defaultValue: "Remove" })}
                >
                  <Icon name="trash" size={15} />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon="search"
            title={t("wishlist.emptyTitle", { defaultValue: "Nothing on your wishlist yet" })}
            body={t("wishlist.emptyBody", {
              defaultValue:
                "Name the genes you are hunting for. When a breeder lists an animal that carries them, you will hear about it.",
            })}
          />
        )}
      </section>
    </div>
  );
}
