import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  acceptOffer,
  blockUser,
  completeSale,
  conversation as fetchConversation,
  conversations as fetchConversations,
  markRead,
  reportMessage,
  sendMessage,
  submitReview,
  unblockUser,
} from "../api";
import { initials, money, relativeTime, shortDate } from "../format";
import Button from "../ui/Button";
import Dialog from "../ui/Dialog";
import Icon from "../ui/Icon";
import { Pill } from "../ui/Pill";
import { StarInput } from "../ui/StarRating";
import { EmptyState, ErrorPanel, Spinner } from "../ui/States";
import { useToast } from "../ui/Toast";

/**
 * The inbox.
 *
 * This screen did not exist. A buyer sent one message from a modal and the
 * reply had nowhere to arrive -- `GET /marketplace/conversations` was built,
 * rate-limited, and wired into the API client, and no component ever called it.
 *
 * Two things here are more than plain chat, and both were already modelled:
 * an offer is a structured amount with Accept and Counter rather than a number
 * appended to message text, and the rail shows the deal state straight from
 * `MarketplaceSale`, so "is this animal actually mine?" has one answer.
 */

const DEAL_STEPS = ["inquiry", "offer", "reserved", "completed"];

/** The admin console's report types that fit a conversation. */
const MESSAGE_REPORT_TYPES = ["scam_suspicion", "abusive_message", "spam", "other"];
const MESSAGE_REPORT_LABELS = {
  scam_suspicion: "Scam, or asking to pay off the platform",
  abusive_message: "Abusive or threatening",
  spam: "Spam",
  other: "Something else",
};

function DealState({ thread, t, locale }) {
  const sale = thread.sale;
  const status = sale?.saleStatus || (thread.latestOffer ? "offer" : "inquiry");
  const reached = Math.max(0, DEAL_STEPS.indexOf(status));

  return (
    <div className="mk-steps">
      {DEAL_STEPS.map((step, index) => {
        const done = index < reached;
        const now = index === reached;
        return (
          <React.Fragment key={step}>
            <div className={`mk-step ${done ? "is-done" : now ? "is-now" : "is-todo"}`}>
              <span className="mk-step__dot">
                <Icon name="check" size={11} />
              </span>
              <span className="mk-step__body">
                <b>{t(`deal.${step}`, { defaultValue: step })}</b>
                <span className="mk-xs mk-subtle">
                  {step === "offer" && thread.latestOffer
                    ? money(thread.latestOffer.offerAmount, thread.listing?.currency, locale)
                    : step === "reserved" && sale?.depositAmount
                      ? t("deal.depositPaid", {
                          defaultValue: "{{amount}} deposit",
                          amount: money(sale.depositAmount, sale.currency || thread.listing?.currency, locale),
                        })
                      : step === "completed" && sale?.handoverDate
                        ? shortDate(sale.handoverDate, locale)
                        : t(`deal.${step}Hint`, { defaultValue: "" })}
                </span>
              </span>
            </div>
            {index < DEAL_STEPS.length - 1 ? <span className={`mk-step__line ${done ? "is-done" : ""}`} /> : null}
          </React.Fragment>
        );
      })}
    </div>
  );
}

export default function InboxPage() {
  const { conversationId } = useParams();
  const { t, i18n } = useTranslation("marketplace");
  const { notify } = useToast();
  const navigate = useNavigate();

  const [threads, setThreads] = useState(null);
  const [error, setError] = useState(null);
  const [active, setActive] = useState(null);
  const [draft, setDraft] = useState("");
  const [offerMode, setOfferMode] = useState(false);
  const [offerAmount, setOfferAmount] = useState("");
  const [sending, setSending] = useState(false);
  const [filter, setFilter] = useState("all");
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [deposit, setDeposit] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportType, setReportType] = useState("scam_suspicion");
  const [completeOpen, setCompleteOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef(null);

  const loadThreads = useCallback(async () => {
    try {
      const list = await fetchConversations();
      setThreads(list);
      setError(null);
      return list;
    } catch (loadError) {
      setError(loadError);
      setThreads([]);
      return [];
    }
  }, []);

  useEffect(() => {
    loadThreads();
  }, [loadThreads]);

  useEffect(() => {
    if (!conversationId) {
      setActive(null);
      return;
    }
    let cancelled = false;
    fetchConversation(conversationId)
      .then(async (thread) => {
        if (cancelled) return;
        setActive(thread);
        if (thread.unreadCount > 0) {
          await markRead(conversationId).catch(() => {});
          loadThreads();
        }
      })
      .catch((loadError) => !cancelled && setError(loadError));
    return () => {
      cancelled = true;
    };
  }, [conversationId, loadThreads]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [active?.messages?.length]);

  if (threads === null) return <Spinner />;

  const visible = (threads || []).filter((thread) => {
    if (filter === "unread") return thread.unreadCount > 0;
    if (filter === "offers") return Boolean(thread.latestOffer);
    return true;
  });

  const send = async () => {
    if (!draft.trim() || !active) return;
    setSending(true);
    try {
      await sendMessage(active.id, {
        messageText: draft,
        offerAmount: offerMode && offerAmount ? Number(offerAmount) : undefined,
      });
      setDraft("");
      setOfferMode(false);
      setOfferAmount("");
      const refreshed = await fetchConversation(active.id);
      setActive(refreshed);
      loadThreads();
    } catch (sendError) {
      notify(sendError?.message || t("errors.generic", { defaultValue: "Something went wrong." }), { tone: "bad" });
    } finally {
      setSending(false);
    }
  };

  const accept = async () => {
    try {
      await acceptOffer(active.id, { depositAmount: deposit ? Number(deposit) : undefined });
      setAcceptOpen(false);
      setDeposit("");
      const refreshed = await fetchConversation(active.id);
      setActive(refreshed);
      loadThreads();
      notify(t("deal.acceptedToast", { defaultValue: "Offer accepted. The animal is now reserved." }));
    } catch (acceptError) {
      notify(acceptError?.message || t("errors.generic", { defaultValue: "Something went wrong." }), { tone: "bad" });
    }
  };

  const refresh = async () => {
    const refreshed = await fetchConversation(active.id);
    setActive(refreshed);
    loadThreads();
  };

  const lastFromThem = active ? [...(active.messages || [])].reverse().find((message) => !message.mine) : null;

  const submitReport = async () => {
    if (!lastFromThem) return;
    try {
      await reportMessage(lastFromThem.id, { type: reportType, reason: reportType, note: reportReason });
      setReportOpen(false);
      setReportReason("");
      notify(t("inbox.reported", { defaultValue: "Reported. Our moderators will take a look." }));
    } catch (reportError) {
      notify(reportError?.message || t("errors.generic", { defaultValue: "Something went wrong." }), { tone: "bad" });
    }
  };

  const block = async () => {
    if (!active?.counterparty?.id) return;
    try {
      await blockUser({ blockedUserId: active.counterparty.id });
      await refresh();
      notify(t("inbox.blocked", { defaultValue: "Blocked. They can no longer message you." }));
    } catch (blockError) {
      notify(blockError?.message || t("errors.generic", { defaultValue: "Something went wrong." }), { tone: "bad" });
    }
  };

  const unblock = async () => {
    if (!active?.counterparty?.id) return;
    try {
      await unblockUser(active.counterparty.id);
      await refresh();
      notify(t("inbox.unblocked", { defaultValue: "Unblocked. You can message each other again." }));
    } catch (unblockError) {
      notify(unblockError?.message || t("errors.generic", { defaultValue: "Something went wrong." }), { tone: "bad" });
    }
  };

  const markHandedOver = async () => {
    if (!active?.sale?.id) return;
    setBusy(true);
    try {
      await completeSale(active.sale.id);
      setCompleteOpen(false);
      await refresh();
      notify(t("deal.completedToast", { defaultValue: "Sale complete. The animal is marked sold." }));
    } catch (completeError) {
      notify(completeError?.message || t("errors.generic", { defaultValue: "Something went wrong." }), { tone: "bad" });
    } finally {
      setBusy(false);
    }
  };

  const sendReview = async () => {
    if (!active?.sale?.id || !rating) return;
    setBusy(true);
    try {
      await submitReview({ saleId: active.sale.id, rating, reviewText });
      setReviewOpen(false);
      setRating(0);
      setReviewText("");
      await refresh();
      notify(t("reviews.thanks", { defaultValue: "Thanks — your review is published." }));
    } catch (reviewError) {
      notify(reviewError?.message || t("errors.generic", { defaultValue: "Something went wrong." }), { tone: "bad" });
    } finally {
      setBusy(false);
    }
  };

  const blocked = active?.blocked || null;
  const sale = active?.sale || null;
  const canComplete = active?.role === "seller" && sale?.saleStatus === "reserved";
  const canReview = active?.role === "buyer" && sale?.isBuyer && sale?.saleStatus === "completed" && !sale?.reviewed;

  const canAccept =
    active?.role === "seller" &&
    active?.latestOffer &&
    !active.latestOffer.mine &&
    active.sale?.saleStatus !== "reserved" &&
    active.sale?.saleStatus !== "completed";

  return (
    <div className={`mk-inbox ${conversationId ? "mk-inbox--thread-open" : ""}`}>
      <aside className="mk-inbox__list" aria-label={t("nav.inbox", { defaultValue: "Inbox" })}>
        <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--mk-rule)" }}>
          <div className="mk-row mk-row--between" style={{ marginBottom: 10 }}>
            <b className="mk-h3">{t("nav.inbox", { defaultValue: "Inbox" })}</b>
            <span className="mk-xs mk-muted">
              {t("inbox.needsReply", {
                defaultValue: "{{count}} unread",
                count: (threads || []).reduce((sum, thread) => sum + Number(thread.unreadCount || 0), 0),
              })}
            </span>
          </div>
          <div className="mk-chiprow" style={{ padding: 0 }}>
            {["all", "unread", "offers"].map((value) => (
              <button
                key={value}
                type="button"
                className={`mk-chip ${filter === value ? "is-on" : ""}`}
                style={{ padding: "5px 11px", fontSize: 11.5 }}
                onClick={() => setFilter(value)}
              >
                {t(`inbox.filter.${value}`, { defaultValue: value })}
              </button>
            ))}
          </div>
        </div>

        {visible.length === 0 ? (
          <p className="mk-muted mk-sm" style={{ padding: 20 }}>
            {t("inbox.noThreads", { defaultValue: "No conversations yet." })}
          </p>
        ) : (
          visible.map((thread) => (
            <button
              key={thread.id}
              type="button"
              className={`mk-thread-item ${thread.unreadCount > 0 ? "is-unread" : ""} ${
                thread.id === conversationId ? "is-active" : ""
              }`}
              onClick={() => navigate(`/inbox/${thread.id}`)}
            >
              <span className="mk-thread-item__top">
                <b className="mk-sm">{thread.counterparty?.name || t("inbox.someone", { defaultValue: "Marketplace user" })}</b>
                <span className="mk-xs mk-subtle">{relativeTime(thread.lastMessageAt, i18n.language)}</span>
              </span>
              <span className="mk-thread-item__listing">
                {thread.listing?.imageUrl ? (
                  <img className="mk-thread-item__thumb" src={thread.listing.imageUrl} alt="" />
                ) : (
                  <span className="mk-thread-item__thumb" />
                )}
                <span className="mk-xs mk-muted mk-thread-item__preview">{thread.listing?.title}</span>
              </span>
              <p className="mk-thread-item__preview">{thread.lastMessage?.messageText}</p>
              {thread.latestOffer ? (
                <span style={{ display: "inline-block", marginTop: 7 }}>
                  <Pill tone={thread.sale?.saleStatus === "reserved" || thread.sale?.saleStatus === "completed" ? "ok" : "hold"}>
                    {thread.sale?.saleStatus === "completed"
                      ? t("deal.completedPill", { defaultValue: "Sale complete" })
                      : thread.sale?.saleStatus === "reserved"
                      ? t("deal.reserved", { defaultValue: "Reserved" })
                      : t("inbox.offerPill", {
                          defaultValue: "Offer {{amount}}",
                          amount: money(thread.latestOffer.offerAmount, thread.listing?.currency, i18n.language),
                        })}
                  </Pill>
                </span>
              ) : null}
            </button>
          ))
        )}
      </aside>

      <section className="mk-inbox__thread">
        {error ? (
          <div style={{ padding: 20 }}>
            <ErrorPanel error={error} onRetry={loadThreads} />
          </div>
        ) : !active ? (
          <EmptyState
            icon="message"
            title={t("inbox.pickTitle", { defaultValue: "Pick a conversation" })}
            body={t("inbox.pickBody", {
              defaultValue: "Messages about an animal, the offers on it, and where the deal stands all live in one thread.",
            })}
            action={
              <Button variant="outline" to="/">
                {t("gate.backToBrowse", { defaultValue: "Back to browsing" })}
              </Button>
            }
          />
        ) : (
          <>
            <header
              className="mk-row mk-row--between"
              style={{ padding: "13px 20px", borderBottom: "1px solid var(--mk-rule)", background: "var(--mk-surface)" }}
            >
              <div className="mk-row" style={{ gap: 10 }}>
                <Button
                  variant="quiet"
                  size="sm"
                  icon="back"
                  className="mk-inbox__back"
                  onClick={() => navigate("/inbox")}
                  aria-label={t("inbox.backToList", { defaultValue: "Back to conversations" })}
                />
                <span className="mk-avatar" aria-hidden="true">
                  {initials(active.counterparty?.name)}
                </span>
                <span>
                  <b className="mk-sm">{active.counterparty?.name}</b>
                  <br />
                  <span className="mk-xs mk-subtle">
                    {active.role === "seller"
                      ? t("inbox.theyAreBuyer", { defaultValue: "Buyer" })
                      : t("inbox.theyAreSeller", { defaultValue: "Seller" })}
                  </span>
                </span>
              </div>
              <div className="mk-row" style={{ gap: 8 }}>
                <Button
                  variant="quiet"
                  size="sm"
                  icon="flag"
                  disabled={!lastFromThem}
                  title={lastFromThem ? undefined : t("inbox.nothingToReport", { defaultValue: "They haven't written anything yet." })}
                  onClick={() => setReportOpen(true)}
                >
                  {t("inbox.report", { defaultValue: "Report" })}
                </Button>
                {blocked === "by_me" ? (
                  <Button variant="quiet" size="sm" onClick={unblock}>
                    {t("inbox.unblock", { defaultValue: "Unblock" })}
                  </Button>
                ) : (
                  <Button variant="quiet" size="sm" onClick={block} disabled={blocked === "by_them"}>
                    {t("inbox.block", { defaultValue: "Block" })}
                  </Button>
                )}
              </div>
            </header>

            <div className="mk-msgs">
              {(active.messages || []).map((message) =>
                message.offerAmount !== null && message.offerAmount !== undefined ? (
                  <div key={message.id} className={`mk-msg ${message.mine ? "mk-msg--mine" : "mk-msg--theirs"}`}>
                    <div className="mk-offer">
                      <div className="mk-offer__body">{message.messageText}</div>
                      <div className="mk-offer__bar">
                        <span>
                          <span className="mk-label" style={{ color: "inherit", fontSize: 10 }}>
                            {t("inbox.offer", { defaultValue: "Offer" })}
                          </span>
                          <br />
                          <b className="mk-offer__amount mk-tnum">
                            {money(message.offerAmount, active.listing?.currency, i18n.language)}
                          </b>
                        </span>
                        {canAccept && active.latestOffer?.id === message.id ? (
                          <span className="mk-row" style={{ gap: 8 }}>
                            <Button variant="outline" size="sm" onClick={() => setOfferMode(true)}>
                              {t("inbox.counter", { defaultValue: "Counter" })}
                            </Button>
                            <Button variant="ink" size="sm" onClick={() => setAcceptOpen(true)}>
                              {t("inbox.accept", { defaultValue: "Accept" })}
                            </Button>
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <span className="mk-msg__meta">{relativeTime(message.createdAt, i18n.language)}</span>
                  </div>
                ) : (
                  <div key={message.id} className={`mk-msg ${message.mine ? "mk-msg--mine" : "mk-msg--theirs"}`}>
                    <div className="mk-msg__bubble">{message.messageText}</div>
                    <span className="mk-msg__meta">
                      {relativeTime(message.createdAt, i18n.language)}
                      {message.mine && message.readAt ? ` · ${t("inbox.read", { defaultValue: "Read" })}` : ""}
                    </span>
                  </div>
                )
              )}
              <span ref={bottomRef} />
            </div>

            {blocked ? (
              <div className="mk-composer" role="status">
                <p className="mk-muted mk-sm" style={{ margin: 0 }}>
                  {blocked === "by_me"
                    ? t("inbox.youBlocked", {
                        defaultValue: "You blocked {{name}}. Neither of you can send messages here until you unblock them.",
                        name: active.counterparty?.name || t("inbox.someone", { defaultValue: "Marketplace user" }),
                      })
                    : t("inbox.closedThread", { defaultValue: "This conversation is closed. New messages can't be sent." })}
                </p>
              </div>
            ) : (
            <div className="mk-composer">
              {offerMode ? (
                <label className="mk-field" style={{ marginBottom: 10 }}>
                  <span className="mk-label">
                    {t("inbox.offerAmount", {
                      defaultValue: "Offer amount ({{currency}})",
                      currency: active.listing?.currency || "EUR",
                    })}
                  </span>
                  <input
                    className="mk-input"
                    type="number"
                    min="0"
                    inputMode="numeric"
                    value={offerAmount}
                    onChange={(event) => setOfferAmount(event.target.value)}
                  />
                </label>
              ) : null}
              <textarea
                className="mk-textarea"
                rows={2}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) send();
                }}
                placeholder={t("inbox.placeholder", { defaultValue: "Write a reply…" })}
                aria-label={t("inbox.placeholder", { defaultValue: "Write a reply…" })}
              />
              <div className="mk-composer__actions">
                <Button variant="outline" size="sm" onClick={() => setOfferMode((current) => !current)}>
                  {offerMode
                    ? t("inbox.cancelOffer", { defaultValue: "Plain message" })
                    : active.role === "seller"
                      ? t("inbox.counterOffer", { defaultValue: "Counter-offer" })
                      : t("inbox.makeOffer", { defaultValue: "Attach an offer" })}
                </Button>
                <Button
                  variant="ink"
                  size="sm"
                  busy={sending}
                  disabled={!draft.trim() || (offerMode && !offerAmount)}
                  onClick={send}
                >
                  {t("inbox.send", { defaultValue: "Send" })}
                </Button>
              </div>
            </div>
            )}
          </>
        )}
      </section>

      {active ? (
        <aside className="mk-inbox__rail" aria-label={t("deal.title", { defaultValue: "Where this stands" })}>
          {active.listing ? (
            <Link to={`/a/${active.listingId}`} className="mk-card" style={{ display: "block", overflow: "hidden", marginBottom: 18, textDecoration: "none", color: "inherit" }}>
              {active.listing.imageUrl ? (
                <img
                  src={active.listing.imageUrl}
                  alt=""
                  style={{ width: "100%", aspectRatio: "16/10", objectFit: "cover", display: "block" }}
                />
              ) : null}
              <div style={{ padding: "12px 13px" }}>
                <b className="mk-sm">{active.listing.title}</b>
                <div className="mk-row mk-row--between" style={{ marginTop: 6 }}>
                  <span className="mk-price mk-tnum" style={{ fontSize: 15 }}>
                    {money(active.listing.price, active.listing.currency, i18n.language)}
                  </span>
                </div>
              </div>
            </Link>
          ) : null}

          <h2 className="mk-label" style={{ margin: "0 0 12px" }}>
            {t("deal.title", { defaultValue: "Where this stands" })}
          </h2>
          <DealState thread={active} t={t} locale={i18n.language} />

          {canComplete ? (
            <Button variant="ink" block style={{ marginTop: 16 }} onClick={() => setCompleteOpen(true)}>
              {t("deal.markHandedOver", { defaultValue: "Mark as handed over" })}
            </Button>
          ) : null}

          {canReview ? (
            <div className="mk-card" style={{ marginTop: 16, padding: "12px 14px" }}>
              <p className="mk-sm" style={{ margin: "0 0 10px" }}>
                {t("deal.reviewPrompt", {
                  defaultValue: "The sale is complete. How did it go with {{name}}?",
                  name: active.counterparty?.name || t("seller.fallback", { defaultValue: "Breeder" }),
                })}
              </p>
              <Button variant="ink" size="sm" icon="star" onClick={() => setReviewOpen(true)}>
                {t("reviews.write", { defaultValue: "Write a review" })}
              </Button>
            </div>
          ) : active.role === "buyer" && sale?.reviewed ? (
            <p className="mk-xs mk-muted" style={{ marginTop: 14 }}>
              {t("deal.reviewed", { defaultValue: "You reviewed this sale. It shows on the breeder's store page." })}
            </p>
          ) : null}

          {active.role === "seller" ? (
            <div className="mk-card" style={{ marginTop: 18, padding: "12px 14px", background: "var(--mk-bg)", boxShadow: "none" }}>
              <span className="mk-xs mk-muted">
                {t("deal.acceptExplainer", {
                  defaultValue:
                    "Accepting an offer marks the animal Reserved and writes the sale record. It stays visible with a Reserved badge until you mark it collected.",
                })}
              </span>
            </div>
          ) : null}
        </aside>
      ) : null}

      <Dialog
        open={acceptOpen}
        onClose={() => setAcceptOpen(false)}
        size="sm"
        title={t("deal.acceptTitle", { defaultValue: "Accept this offer?" })}
        description={
          active?.latestOffer
            ? t("deal.acceptBody", {
                defaultValue: "{{amount}} for {{title}}. This reserves the animal.",
                amount: money(active.latestOffer.offerAmount, active.listing?.currency, i18n.language),
                title: active.listing?.title,
              })
            : ""
        }
        footer={
          <>
            <Button variant="quiet" onClick={() => setAcceptOpen(false)}>
              {t("common.cancel", { defaultValue: "Cancel" })}
            </Button>
            <Button variant="ink" onClick={accept}>
              {t("deal.acceptConfirm", { defaultValue: "Accept and reserve" })}
            </Button>
          </>
        }
      >
        <label className="mk-field">
          <span className="mk-label">{t("deal.depositOptional", { defaultValue: "Deposit received (optional)" })}</span>
          <input
            className="mk-input"
            type="number"
            min="0"
            inputMode="numeric"
            value={deposit}
            onChange={(event) => setDeposit(event.target.value)}
          />
          <span className="mk-hint">
            {t("deal.depositHint", { defaultValue: "Record it here if the buyer has already paid a deposit." })}
          </span>
        </label>
      </Dialog>

      <Dialog
        open={completeOpen}
        onClose={() => setCompleteOpen(false)}
        size="sm"
        title={t("deal.completeTitle", { defaultValue: "Mark this animal as handed over?" })}
        description={t("deal.completeBody", {
          defaultValue:
            "The sale is recorded as complete, the listing shows as sold, and the buyer is invited to review you. This can't be undone here.",
        })}
        footer={
          <>
            <Button variant="quiet" onClick={() => setCompleteOpen(false)}>
              {t("common.cancel", { defaultValue: "Cancel" })}
            </Button>
            <Button variant="ink" busy={busy} onClick={markHandedOver}>
              {t("deal.completeConfirm", { defaultValue: "Mark handed over" })}
            </Button>
          </>
        }
      />

      <Dialog
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        title={t("reviews.writeTitle", { defaultValue: "Review this breeder" })}
        description={active?.listing?.title}
        footer={
          <>
            <Button variant="quiet" onClick={() => setReviewOpen(false)}>
              {t("common.cancel", { defaultValue: "Cancel" })}
            </Button>
            <Button variant="ink" busy={busy} disabled={!rating} onClick={sendReview}>
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

      <Dialog
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        size="sm"
        title={t("inbox.reportTitle", { defaultValue: "Report this conversation" })}
        description={t("inbox.reportGoesTo", {
          defaultValue: "This goes to the moderators with their last message attached.",
        })}
        footer={
          <>
            <Button variant="quiet" onClick={() => setReportOpen(false)}>
              {t("common.cancel", { defaultValue: "Cancel" })}
            </Button>
            <Button variant="ink" onClick={submitReport}>
              {t("inbox.sendReport", { defaultValue: "Send report" })}
            </Button>
          </>
        }
      >
        <fieldset className="mk-field">
          <legend className="mk-label">{t("inbox.reportWhat", { defaultValue: "What's wrong?" })}</legend>
          {MESSAGE_REPORT_TYPES.map((value) => (
            <label key={value} className="mk-row" style={{ gap: 8 }}>
              <input
                type="radio"
                name="message-report-type"
                value={value}
                checked={reportType === value}
                onChange={() => setReportType(value)}
              />
              <span className="mk-sm">{t(`inbox.reportTypes.${value}`, { defaultValue: MESSAGE_REPORT_LABELS[value] })}</span>
            </label>
          ))}
        </fieldset>
        <label className="mk-field">
          <span className="mk-label">{t("inbox.reportNote", { defaultValue: "Details (optional)" })}</span>
          <textarea
            className="mk-textarea"
            rows={3}
            value={reportReason}
            onChange={(event) => setReportReason(event.target.value)}
            placeholder={t("inbox.reportPlaceholder", { defaultValue: "Scam attempt, abusive language, off-platform payment…" })}
          />
        </label>
      </Dialog>
    </div>
  );
}
