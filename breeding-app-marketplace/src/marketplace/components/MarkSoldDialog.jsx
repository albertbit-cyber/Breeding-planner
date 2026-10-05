import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { markSold, setListingStatus } from "../api";
import { money } from "../format";
import Button from "../ui/Button";
import Dialog from "../ui/Dialog";

const OFF_PLATFORM = "__off_platform__";

/**
 * Marking a listing sold, from the dashboard.
 *
 * "Mark sold" used to flip the status and nothing else, so the buyer got an
 * animal and no record. Now the seller says who bought it: anyone who wrote
 * about the listing is offered, and choosing them sends the animal's record to
 * their account. A sale to someone without an account is still possible and
 * says plainly that no record travels.
 */
export default function MarkSoldDialog({ listing, threads = [], onClose, onDone }) {
  const { t, i18n } = useTranslation("marketplace");
  const buyers = useMemo(() => {
    const seen = new Map();
    threads
      .filter((thread) => thread.listingId === listing?.id && thread.counterparty?.id)
      .forEach((thread) => {
        if (!seen.has(thread.counterparty.id)) {
          seen.set(thread.counterparty.id, {
            id: thread.counterparty.id,
            name: thread.counterparty.name,
            offer: thread.latestOffer && !thread.latestOffer.mine ? thread.latestOffer.offerAmount : null,
          });
        }
      });
    return [...seen.values()];
  }, [threads, listing?.id]);

  const [buyerId, setBuyerId] = useState("");
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!listing) return;
    const first = buyers[0] || null;
    setBuyerId(first ? first.id : OFF_PLATFORM);
    setPrice(String(first?.offer ?? listing.price ?? ""));
    setError("");
  }, [listing, buyers]);

  if (!listing) return null;
  const offPlatform = buyerId === OFF_PLATFORM;

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      if (offPlatform) {
        await setListingStatus(listing.id, "sold");
        onDone?.({ transferred: false });
      } else {
        await markSold(listing.id, { buyerUserId: buyerId, price: price === "" ? null : Number(price) });
        onDone?.({ transferred: true, buyerName: buyers.find((buyer) => buyer.id === buyerId)?.name });
      }
    } catch (submitError) {
      setError(submitError?.message || t("errors.generic", { defaultValue: "Something went wrong." }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={t("sold.title", { defaultValue: "Who bought {{title}}?", title: listing.title })}
      description={
        buyers.length
          ? t("sold.body", {
              defaultValue:
                "The buyer gets the animal's record in their account: genetics with where each claim comes from, weights, feeding, sheds, health entries, lineage and certificates. Your own copy stays, marked Sold.",
            })
          : t("sold.bodyNoBuyers", {
              defaultValue: "Only a buyer with a Serpentora account can receive the animal's record.",
            })
      }
      footer={
        <>
          <Button variant="quiet" onClick={onClose}>
            {t("common.cancel", { defaultValue: "Cancel" })}
          </Button>
          <Button variant="ink" busy={busy} disabled={!buyerId} onClick={submit}>
            {offPlatform
              ? t("sold.confirmOffPlatform", { defaultValue: "Mark sold" })
              : t("sold.confirm", { defaultValue: "Mark sold and send the record" })}
          </Button>
        </>
      }
    >
      <fieldset className="mk-field">
        <legend className="mk-label">{t("sold.buyer", { defaultValue: "Buyer" })}</legend>
        {buyers.map((buyer) => (
          <label key={buyer.id} className="mk-row" style={{ gap: 8 }}>
            <input
              type="radio"
              name="sold-buyer"
              value={buyer.id}
              checked={buyerId === buyer.id}
              onChange={() => {
                setBuyerId(buyer.id);
                if (buyer.offer) setPrice(String(buyer.offer));
              }}
            />
            <span className="mk-sm">
              {buyer.name}
              {buyer.offer ? (
                <span className="mk-muted">
                  {" "}
                  · {t("sold.offered", { defaultValue: "offered {{amount}}", amount: money(buyer.offer, listing.currency, i18n.language) })}
                </span>
              ) : null}
            </span>
          </label>
        ))}
        <label className="mk-row" style={{ gap: 8 }}>
          <input
            type="radio"
            name="sold-buyer"
            value={OFF_PLATFORM}
            checked={offPlatform}
            onChange={() => setBuyerId(OFF_PLATFORM)}
          />
          <span className="mk-sm">{t("sold.offPlatform", { defaultValue: "Someone without a Serpentora account" })}</span>
        </label>
        {!buyers.length ? (
          <p className="mk-hint" style={{ margin: 0 }}>
            {t("sold.noThreads", {
              defaultValue: "Nobody has messaged you about this animal here, so there is no account to send the record to.",
            })}
          </p>
        ) : null}
      </fieldset>

      {offPlatform ? (
        <p className="mk-hint" style={{ margin: 0 }}>
          {t("sold.offPlatformNote", {
            defaultValue: "The listing is marked sold. No record is transferred, because there is no account to receive it.",
          })}
        </p>
      ) : (
        <label className="mk-field">
          <span className="mk-label">
            {t("sold.price", { defaultValue: "Sale price ({{currency}})", currency: listing.currency || "EUR" })}
          </span>
          <input
            className="mk-input"
            type="number"
            min="0"
            inputMode="numeric"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
          />
        </label>
      )}
      {error ? (
        <p className="mk-hint" role="alert" style={{ color: "var(--mk-gene-text)", margin: 0 }}>
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}
