import React from "react";
import { useTranslation } from "react-i18next";
import AuthGate from "../../features/auth/AuthGate";
import { useSession } from "../session";
import Button from "../ui/Button";
import Dialog from "../ui/Dialog";

/**
 * A route that needs an account.
 *
 * The whole marketplace used to sit behind this gate, so nobody could see a
 * single animal without signing up. It now wraps four things -- the inbox,
 * saved, selling and the dashboard -- and everything else is public.
 */
export function RequireAuth({ children, seller = false }) {
  const { t } = useTranslation("marketplace");
  const session = useSession();

  if (session.isAuthenticated && seller && !session.isSeller) {
    return (
      <div className="mk-wrap">
        <div className="mk-empty">
          <h3>{t("gate.sellerTitle", { defaultValue: "Selling needs a breeder account" })}</h3>
          <p>
            {t("gate.sellerBody", {
              defaultValue:
                "You're signed in, but this account can't list animals. Ask an administrator to enable selling, or use your breeder account.",
            })}
          </p>
          <Button variant="outline" to="/">
            {t("gate.backToBrowse", { defaultValue: "Back to browsing" })}
          </Button>
        </div>
      </div>
    );
  }

  return <AuthGate scope="breeder">{children}</AuthGate>;
}

/**
 * Asked at the moment of the action, not at the door: the sheet says what is
 * being saved and sends the visitor somewhere that can sign them in. The
 * intent is already held, so the action replays afterwards.
 */
export function SignInPrompt({ intent, onClose }) {
  const { t } = useTranslation("marketplace");
  if (!intent) return null;

  const copy = {
    favorite: {
      title: t("gate.favoriteTitle", { defaultValue: "Sign in to save this animal" }),
      body: t("gate.favoriteBody", {
        defaultValue: "We'll keep it in your saved list and bring you straight back here.",
      }),
    },
    message: {
      title: t("gate.messageTitle", { defaultValue: "Sign in to message the seller" }),
      body: t("gate.messageBody", {
        defaultValue: "Your message is held and sent as soon as you're in.",
      }),
    },
    offer: {
      title: t("gate.offerTitle", { defaultValue: "Sign in to make an offer" }),
      body: t("gate.offerBody", { defaultValue: "Offers go to the seller with your account attached." }),
    },
    savedSearch: {
      title: t("gate.searchTitle", { defaultValue: "Sign in to save this search" }),
      body: t("gate.searchBody", {
        defaultValue: "We'll email you when an animal matching these filters is listed.",
      }),
    },
  }[intent.kind] || {
    title: t("gate.defaultTitle", { defaultValue: "Sign in to continue" }),
    body: t("gate.defaultBody", { defaultValue: "This part of the marketplace needs an account." }),
  };

  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title={copy.title}
      description={copy.body}
      footer={
        <>
          <Button variant="quiet" onClick={onClose}>
            {t("common.notNow", { defaultValue: "Not now" })}
          </Button>
          <Button variant="ink" to="/inbox" onClick={onClose}>
            {t("gate.signIn", { defaultValue: "Sign in" })}
          </Button>
        </>
      }
    >
      <p className="mk-muted mk-sm" style={{ margin: 0 }}>
        {t("gate.browsingIsFree", {
          defaultValue: "Browsing, filtering and opening any listing stay free — no account needed.",
        })}
      </p>
    </Dialog>
  );
}

export default RequireAuth;
