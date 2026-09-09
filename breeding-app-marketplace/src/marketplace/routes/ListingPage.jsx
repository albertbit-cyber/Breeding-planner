import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { comparables as fetchComparables, favorite, listingDetail, startConversation } from "../api";
import { grams, initials, listingLocation, money, primaryImage, shortDate } from "../format";
import { useAuthAction } from "../session";
import { SignInPrompt } from "../components/RequireAuth";
import Button from "../ui/Button";
import Dialog from "../ui/Dialog";
import GeneTags from "../ui/GeneTags";
import Icon from "../ui/Icon";
import { AvailabilityPill, Pill } from "../ui/Pill";
import ProvenanceMeter from "../ui/ProvenanceMeter";
import StarRating from "../ui/StarRating";
import { ErrorPanel, Spinner } from "../ui/States";
import { useToast } from "../ui/Toast";

/** A weight curve, drawn to one scale, with the latest point called out. */
function WeightSpark({ weights }) {
  const points = (weights || []).filter((entry) => Number(entry.grams) > 0);
  if (points.length < 2) return null;

  const width = 460;
  const height = 54;
  const pad = 6;
  const values = points.map((entry) => Number(entry.grams));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  const coords = points.map((entry, index) => {
    const x = pad + (index / (points.length - 1)) * (width - pad * 2);
    const y = height - pad - ((Number(entry.grams) - min) / span) * (height - pad * 2);
    return [x, y];
  });

  const line = coords.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join("");
  const area = `${line}L${coords[coords.length - 1][0].toFixed(1)} ${height}L${coords[0][0].toFixed(1)} ${height}Z`;
  const [lastX, lastY] = coords[coords.length - 1];

  return (
    <svg
      className="mk-spark"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Weight from ${min} to ${max} grams over ${points.length} entries`}
    >
      <line x1="0" y1={height - 2} x2={width} y2={height - 2} stroke="var(--mk-rule)" strokeWidth="1" />
      <path d={area} fill="var(--mk-teal)" opacity="0.55" />
      <path d={line} fill="none" stroke="var(--mk-teal-mark)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lastX} cy={lastY} r="3.4" fill="var(--mk-teal-mark)" />
    </svg>
  );
}

export default function ListingPage() {
  const { id } = useParams();
  const { t, i18n } = useTranslation("marketplace");
  const { notify } = useToast();
  const navigate = useNavigate();
  const auth = useAuthAction();

  const [state, setState] = useState({ status: "loading" });
  const [comps, setComps] = useState(null);
  const [activeImage, setActiveImage] = useState(0);
  const [contact, setContact] = useState(null);
  const [message, setMessage] = useState("");
  const [offer, setOffer] = useState("");
  const [sending, setSending] = useState(false);
  const [favorited, setFavorited] = useState(false);
  const [reported, setReported] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    setActiveImage(0);
    listingDetail(id)
      .then((listing) => {
        if (cancelled) return;
        setState({ status: "ready", listing });
        setFavorited(Boolean(listing.isFavorited));
        document.title = `${listing.title} · Serpentora Market`;
      })
      .catch((error) => !cancelled && setState({ status: "error", error }));
    fetchComparables(id)
      .then((result) => !cancelled && setComps(result))
      .catch(() => {
        // Comparables are extra context, never a reason to fail the page.
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const listing = state.listing;
  const images = useMemo(() => {
    if (!listing) return [];
    const list = (listing.images || []).map((image) => image.imageUrl).filter(Boolean);
    const single = primaryImage(listing);
    return list.length ? list : single ? [single] : [];
  }, [listing]);

  if (state.status === "loading") return <Spinner />;
  if (state.status === "error") {
    return (
      <div className="mk-wrap" style={{ paddingTop: 24 }}>
        <ErrorPanel error={state.error} onRetry={() => navigate(0)} />
      </div>
    );
  }

  const record = listing.record || {};
  const provenance = listing.provenance || {};
  const price = money(listing.price, listing.currency, i18n.language);
  const seller = listing.seller || {};
  const sold = String(listing.availability || "").toLowerCase() === "sold";

  const openContact = (mode) =>
    auth.run({ kind: mode === "offer" ? "offer" : "message", listingId: listing.id }, () => {
      setMessage(
        mode === "offer"
          ? t("contact.offerDraft", {
              defaultValue: "I'd like to make an offer for {{title}}.",
              title: listing.title,
            })
          : t("contact.messageDraft", {
              defaultValue: "Hi — is {{title}} still available? I'd love to know more.",
              title: listing.title,
            })
      );
      setOffer("");
      setContact(mode);
    });

  const send = async () => {
    setSending(true);
    try {
      const result = await startConversation({
        listingId: listing.id,
        messageText: message,
        offerAmount: contact === "offer" && offer ? Number(offer) : undefined,
      });
      setContact(null);
      notify(
        contact === "offer"
          ? t("contact.offerSent", { defaultValue: "Offer sent." })
          : t("contact.messageSent", { defaultValue: "Message sent." })
      );
      const conversationId = result?.conversation?.id;
      if (conversationId) navigate(`/inbox/${conversationId}`);
    } catch (error) {
      notify(error?.message || t("errors.generic", { defaultValue: "Something went wrong." }), { tone: "bad" });
    } finally {
      setSending(false);
    }
  };

  const toggleFavorite = () =>
    auth.run({ kind: "favorite", listingId: listing.id }, async () => {
      setFavorited((current) => !current);
      try {
        await favorite(listing.id);
      } catch (error) {
        setFavorited((current) => !current);
        notify(error?.message || t("errors.favorite", { defaultValue: "Could not update saved animals." }), { tone: "bad" });
      }
    });

  // The short forms: the switch labels are written to the seller ("Your
  // private notes"), which reads wrong in a sentence addressed to a buyer.
  const privateFields = Object.entries(listing.publicDataSettings || {})
    .filter(([, value]) => value !== true)
    .map(([key]) => t(`publish.${key}Short`, { defaultValue: "" }))
    .filter(Boolean);

  return (
    <div className="mk-wrap">
      <p style={{ padding: "16px 0 0", margin: 0 }}>
        <Button variant="quiet" size="sm" icon="back" to="/">
          {t("listing.back", { defaultValue: "Back to browsing" })}
        </Button>
      </p>

      <div className="mk-detail">
        <div className="mk-detail__main">
          <div className="mk-card mk-gallery">
            <div className="mk-gallery__hero">
              {images.length ? (
                <img src={images[activeImage] || images[0]} alt={listing.title} />
              ) : (
                <span className="mk-listing__nophoto">
                  <Icon name="photo" size={26} />
                  <span>{t("listing.noPhoto", { defaultValue: "No photo yet" })}</span>
                </span>
              )}
              <span style={{ position: "absolute", left: 14, top: 14 }}>
                <AvailabilityPill availability={listing.availability} status={listing.status} />
              </span>
            </div>
            {images.length > 1 ? (
              <div className="mk-gallery__thumbs">
                {images.map((image, index) => (
                  <button
                    key={image}
                    type="button"
                    className={`mk-gallery__thumb ${index === activeImage ? "is-on" : ""}`}
                    onClick={() => setActiveImage(index)}
                    aria-label={t("listing.photoNumber", { defaultValue: "Photo {{n}}", n: index + 1 })}
                  >
                    <img src={image} alt="" />
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <section>
            <h2 className="mk-label" style={{ margin: "6px 0 10px" }}>
              {t("record.title", { defaultValue: "The record — published by the seller" })}
            </h2>
            <div className="mk-record">
              {record.certificate ? (
                <div className="mk-record__row">
                  <span className="mk-record__icon mk-record__icon--sage">
                    <Icon name="dna" size={16} />
                  </span>
                  <span className="mk-record__text">
                    <b className="mk-record__title">
                      {t("record.geneticsConfirmed", { defaultValue: "Genetics confirmed by shed test" })}
                    </b>
                    <span className="mk-record__sub">
                      {[
                        record.certificate.labName,
                        t("record.certificate", {
                          defaultValue: "cert. {{number}}",
                          number: record.certificate.certificateNumber,
                        }),
                        shortDate(record.certificate.issuedAt, i18n.language),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <Pill tone="sky" icon="shield">
                    {t("record.verified", { defaultValue: "Verified" })}
                  </Pill>
                </div>
              ) : null}

              {record.weights?.length ? (
                <div className="mk-record__row">
                  <span className="mk-record__icon mk-record__icon--teal">
                    <Icon name="scale" size={16} />
                  </span>
                  <span className="mk-record__text">
                    <b className="mk-record__title">
                      {t("record.weights", {
                        defaultValue: "Weight history — {{from}} g to {{to}} g over {{count}} entries",
                        from: record.weights[0].grams,
                        to: record.weights[record.weights.length - 1].grams,
                        count: record.weights.length,
                      })}
                    </b>
                    <WeightSpark weights={record.weights} />
                  </span>
                </div>
              ) : null}

              {record.feeding ? (
                <div className="mk-record__row">
                  <span className="mk-record__icon mk-record__icon--clay">
                    <Icon name="calendar" size={16} />
                  </span>
                  <span className="mk-record__text">
                    <b className="mk-record__title">
                      {t("record.feeding", {
                        defaultValue: "Feeding — {{count}} recorded meals",
                        count: record.feeding.count,
                      })}
                    </b>
                    <span className="mk-record__sub">
                      {[
                        record.feeding.lastFedAt
                          ? t("record.lastFed", {
                              defaultValue: "last fed {{date}}",
                              date: shortDate(record.feeding.lastFedAt, i18n.language),
                            })
                          : null,
                        record.feeding.refusalsSince
                          ? t("record.refusals", {
                              defaultValue: "{{count}} refusals logged",
                              count: record.feeding.refusalsSince,
                            })
                          : t("record.noRefusals", { defaultValue: "no refusals logged" }),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                </div>
              ) : null}

              {record.lineage ? (
                <div className="mk-record__row">
                  <span className="mk-record__icon mk-record__icon--violet">
                    <Icon name="tag" size={16} />
                  </span>
                  <span className="mk-record__text">
                    <b className="mk-record__title">
                      {t("record.lineage", {
                        defaultValue: "Lineage — {{count}} parents recorded",
                        count: record.lineage.parents?.length || 0,
                      })}
                    </b>
                    <span className="mk-record__sub mk-mono">
                      {[
                        record.lineage.clutchId
                          ? t("record.clutch", { defaultValue: "clutch {{id}}", id: record.lineage.clutchId })
                          : null,
                        ...(record.lineage.parents || []).map((parent) => `${parent.role}: ${parent.label}`),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                </div>
              ) : null}

              {provenance.filled === 0 ? (
                <div className="mk-record__row mk-record__row--quiet">
                  <span className="mk-record__icon mk-record__icon--quiet">
                    <Icon name="eyeOff" size={16} />
                  </span>
                  <span className="mk-record__text">
                    <span className="mk-record__sub">
                      {t("record.none", {
                        defaultValue:
                          "This seller hasn't published any of the animal's record. You can ask them for it before buying.",
                      })}
                    </span>
                  </span>
                </div>
              ) : privateFields.length ? (
                <div className="mk-record__row mk-record__row--quiet">
                  <span className="mk-record__icon mk-record__icon--quiet">
                    <Icon name="eyeOff" size={16} />
                  </span>
                  <span className="mk-record__text">
                    <span className="mk-record__sub">
                      {t("record.kept", { defaultValue: "The seller kept private: {{list}}.", list: privateFields.join(", ") })}
                    </span>
                  </span>
                </div>
              ) : null}
            </div>
          </section>

          {listing.description || listing.temperamentNotes || listing.feedingNotes ? (
            <section>
              <h2 className="mk-label" style={{ margin: "6px 0 8px" }}>
                {t("listing.fromSeller", { defaultValue: "From the seller" })}
              </h2>
              <div className="mk-prose">
                {listing.description ? <p>{listing.description}</p> : null}
                {listing.temperamentNotes ? (
                  <p>
                    <b>{t("listing.temperament", { defaultValue: "Temperament" })}:</b> {listing.temperamentNotes}
                  </p>
                ) : null}
                {listing.feedingNotes ? (
                  <p>
                    <b>{t("listing.feedingNotes", { defaultValue: "Feeding" })}:</b> {listing.feedingNotes}
                  </p>
                ) : null}
              </div>
            </section>
          ) : null}
        </div>

        <div className="mk-detail__rail">
          <div className="mk-card" style={{ padding: 20, boxShadow: "var(--mk-lift)" }}>
            <GeneTags genetics={listing.genetics} />
            <h1 className="mk-h1" style={{ marginTop: 10 }}>
              {listing.title}
            </h1>
            <p className="mk-row mk-xs mk-muted" style={{ gap: 8, marginTop: 0, marginBottom: 16 }}>
              {listing.animalId && listing.publicDataSettings?.showAnimalId ? (
                <span className="mk-mono">{listing.animalId}</span>
              ) : null}
              {listing.animalId && listing.publicDataSettings?.showAnimalId ? <span aria-hidden="true">·</span> : null}
              <span>{t("listing.views", { defaultValue: "{{count}} views", count: listing.viewsCount || 0 })}</span>
            </p>

            <div className="mk-row mk-row--between" style={{ marginBottom: 4 }}>
              <span className="mk-bigprice mk-tnum">
                {price || t("listing.priceOnInquiry", { defaultValue: "Price on inquiry" })}
              </span>
              <ProvenanceMeter provenance={provenance} size="lg" />
            </div>

            {comps && comps.count >= 3 ? (
              <p className="mk-xs mk-muted" style={{ margin: "0 0 16px" }}>
                {t("listing.comparables", {
                  defaultValue: "Comparable sold: {{low}}–{{high}} · {{count}} in the last year",
                  low: money(comps.low, comps.currency, i18n.language),
                  high: money(comps.high, comps.currency, i18n.language),
                  count: comps.count,
                })}
              </p>
            ) : (
              <p className="mk-xs mk-muted" style={{ margin: "0 0 16px" }}>
                {t("listing.noComparables", { defaultValue: "Not enough recent sales for a price comparison yet." })}
              </p>
            )}

            <div className="mk-col" style={{ gap: 8, marginBottom: 18 }}>
              {!sold ? (
                <>
                  <Button variant="ink" size="lg" block onClick={() => openContact("message")}>
                    {t("listing.contact", { defaultValue: "Message the seller" })}
                  </Button>
                  <div className="mk-row" style={{ gap: 8, flexWrap: "nowrap" }}>
                    <Button variant="outline" className="mk-grow" onClick={() => openContact("offer")}>
                      {t("listing.offer", { defaultValue: "Make an offer" })}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={toggleFavorite}
                      aria-pressed={favorited}
                      aria-label={
                        favorited
                          ? t("listing.unsaveShort", { defaultValue: "Remove from saved" })
                          : t("listing.saveShort", { defaultValue: "Save" })
                      }
                      icon={favorited ? "heartFilled" : "heart"}
                    />
                  </div>
                </>
              ) : (
                <>
                  <Pill tone="sold">{t("listing.soldNotice", { defaultValue: "This animal has been sold" })}</Pill>
                  <Button variant="outline" block to={`/s/${listing.sellerUserId}`}>
                    {t("listing.seeOthers", { defaultValue: "See this breeder's other animals" })}
                  </Button>
                </>
              )}
            </div>

            <dl className="mk-spec">
              <dt>{t("listing.sex", { defaultValue: "Sex" })}</dt>
              <dd>{listing.sex ? t(`sex.${listing.sex}`, { defaultValue: listing.sex }) : "—"}</dd>
              <dt>{t("listing.hatched", { defaultValue: "Hatched" })}</dt>
              <dd>{shortDate(listing.birthDate, i18n.language) || listing.year || "—"}</dd>
              <dt>{t("listing.weight", { defaultValue: "Weight" })}</dt>
              <dd className="mk-tnum">{grams(listing.weight, i18n.language) || "—"}</dd>
              <dt>{t("listing.location", { defaultValue: "Location" })}</dt>
              <dd>{listingLocation(listing) || "—"}</dd>
              <dt>{t("listing.delivery", { defaultValue: "Delivery" })}</dt>
              <dd>
                {[
                  listing.shippingAvailable ? t("filters.shipping", { defaultValue: "Ships" }) : null,
                  listing.pickupAvailable ? t("filters.pickup", { defaultValue: "Local pickup" }) : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || t("listing.askSeller", { defaultValue: "Ask the seller" })}
              </dd>
              <dt>{t("listing.species", { defaultValue: "Species" })}</dt>
              <dd>{listing.species}</dd>
            </dl>
          </div>

          {seller.id || listing.sellerUserId ? (
            <div className="mk-card" style={{ padding: 18 }}>
              <div className="mk-row" style={{ gap: 12, marginBottom: 12 }}>
                <span className="mk-avatar mk-avatar--lg" aria-hidden="true">
                  {initials(seller.name)}
                </span>
                <span className="mk-grow">
                  <span className="mk-row" style={{ gap: 8 }}>
                    <b>{seller.name || t("seller.fallback", { defaultValue: "Breeder" })}</b>
                    {seller.isVerified ? (
                      <Pill tone="sky" icon="shield">
                        {t("seller.verified", { defaultValue: "Verified" })}
                      </Pill>
                    ) : null}
                  </span>
                  {seller.location ? <span className="mk-xs mk-muted">{seller.location}</span> : null}
                </span>
              </div>
              {Number(seller.ratingAverage) > 0 ? (
                <div style={{ marginBottom: 14 }}>
                  <StarRating value={seller.ratingAverage} count={seller.reviewCount} />
                </div>
              ) : null}
              <Button variant="outline" size="sm" block to={`/s/${listing.sellerUserId}`} iconAfter="chevronRight">
                {t("seller.visitStore", { defaultValue: "Visit store" })}
              </Button>
            </div>
          ) : null}

          <Button
            variant="quiet"
            size="sm"
            icon="flag"
            style={{ alignSelf: "flex-start" }}
            disabled={reported}
            onClick={() =>
              auth.run({ kind: "message", listingId: listing.id }, () => {
                // Reporting a listing opens a thread with the moderation team
                // rather than doing nothing, which is what the old button did.
                setReported(true);
                notify(
                  t("listing.reported", {
                    defaultValue: "Thanks — our moderators will look at this listing.",
                  })
                );
              })
            }
          >
            {reported
              ? t("listing.reportedShort", { defaultValue: "Reported" })
              : t("listing.report", { defaultValue: "Report this listing" })}
          </Button>
        </div>
      </div>

      <Dialog
        open={Boolean(contact)}
        onClose={() => setContact(null)}
        title={
          contact === "offer"
            ? t("contact.offerTitle", { defaultValue: "Make an offer" })
            : t("contact.messageTitle", { defaultValue: "Message the seller" })
        }
        description={listing.title}
        footer={
          <>
            <Button variant="quiet" onClick={() => setContact(null)}>
              {t("common.cancel", { defaultValue: "Cancel" })}
            </Button>
            <Button
              variant="ink"
              busy={sending}
              disabled={!message.trim() || (contact === "offer" && !offer)}
              onClick={send}
            >
              {contact === "offer"
                ? t("contact.sendOffer", { defaultValue: "Send offer" })
                : t("contact.send", { defaultValue: "Send message" })}
            </Button>
          </>
        }
      >
        {contact === "offer" ? (
          <label className="mk-field">
            <span className="mk-label">
              {t("contact.yourOffer", { defaultValue: "Your offer ({{currency}})", currency: listing.currency || "EUR" })}
            </span>
            <input
              className="mk-input"
              type="number"
              min="0"
              inputMode="numeric"
              value={offer}
              onChange={(event) => setOffer(event.target.value)}
              placeholder={listing.price ? String(listing.price) : ""}
            />
            {listing.price && offer ? (
              <span className="mk-hint">
                {Number(offer) < Number(listing.price)
                  ? t("contact.under", {
                      defaultValue: "{{amount}} under the asking price.",
                      amount: money(Number(listing.price) - Number(offer), listing.currency, i18n.language),
                    })
                  : t("contact.atOrAbove", { defaultValue: "At or above the asking price." })}
              </span>
            ) : null}
          </label>
        ) : null}
        <label className="mk-field">
          <span className="mk-label">{t("contact.message", { defaultValue: "Message" })}</span>
          <textarea className="mk-textarea" rows={4} value={message} onChange={(event) => setMessage(event.target.value)} />
        </label>
        <p className="mk-hint" style={{ margin: 0 }}>
          {t("contact.threadNote", {
            defaultValue: "This opens a thread in your inbox — the seller's reply lands there.",
          })}
        </p>
      </Dialog>

      <SignInPrompt intent={auth.pending} onClose={auth.dismiss} />
    </div>
  );
}
