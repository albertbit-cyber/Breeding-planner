import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  acceptInvite as acceptInviteApi,
  clearAuthToken,
  fetchInvite as fetchInviteApi,
  login as loginApi,
  requestPasswordReset as requestPasswordResetApi,
  submitPartnerApplication as submitPartnerApplicationApi,
} from "../../shared/apiClient";
import { useSharedBackend } from "../../contexts/SharedBackendContext.jsx";

/**
 * The Lab Portal's authentication gate.
 *
 * This is deliberately NOT the breeder app's AuthGate. It was a copy of it,
 * which meant the Lab Portal shipped a full public multi-step registration form
 * that created breeder accounts — directly contradicting the confirmed product
 * model, in which a laboratory only ever enters the platform through an
 * administrator's invitation.
 *
 * There is therefore no registration path in this file, and there must not be
 * one. `assertNoLabSignupRoute` below is a build-time guard against it coming
 * back. The three ways in are: sign in, reset a forgotten password, and redeem
 * an invitation.
 */

const LAB_AUTH_SESSION_STORAGE_KEY = "breedingPlannerLabAuthSession";
const AUTH_SCOPE = "lab";

const INVITE_HASH_PATTERN = /^#?\/accept-invite/;

const readStoredAuth = () => {
  try {
    const raw = localStorage.getItem(LAB_AUTH_SESSION_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
    // unreadable session; fall through to signed-out
  }
  return { isAuthenticated: false };
};

/** Reads `?token=` out of the hash route, which is where invite links land. */
const inviteTokenFromHash = (hashValue) => {
  const raw = String(hashValue || "").replace(/^#/, "");
  const [path, query] = raw.split("?");
  if (!INVITE_HASH_PATTERN.test(`#${path}`)) return "";
  return new URLSearchParams(query || "").get("token") || "";
};

/**
 * Build-time assertion that no public signup route exists in the Lab Portal.
 *
 * The plan asks for this explicitly: the absence of a signup path is a product
 * decision, not an oversight, and a future copy-paste from the breeder app
 * should fail loudly rather than quietly reopen the door.
 */
export const assertNoLabSignupRoute = (routes) => {
  const offending = (Array.isArray(routes) ? routes : []).filter((route) =>
    /register|signup|sign-up/i.test(String(route || ""))
  );
  if (offending.length) {
    throw new Error(
      `The Lab Portal must not expose a signup route (found: ${offending.join(", ")}). ` +
        "Laboratories are onboarded by admin invitation only."
    );
  }
  return true;
};

export default function AuthGate({ children }) {
  const { t } = useTranslation();
  const { snapshot, retry } = useSharedBackend();

  const [authState, setAuthState] = useState(readStoredAuth);
  const [inviteToken, setInviteToken] = useState(() => inviteTokenFromHash(window?.location?.hash));
  const [loginValues, setLoginValues] = useState({ email: "", password: "" });
  const [loginError, setLoginError] = useState("");
  const [notice, setNotice] = useState("");
  const [isResetting, setIsResetting] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [applyForm, setApplyForm] = useState({
    labName: "",
    contactName: "",
    email: "",
    country: "",
    website: "",
    message: "",
  });
  const [resetEmail, setResetEmail] = useState("");
  const [busy, setBusy] = useState(false);

  // Invite acceptance
  const [invite, setInvite] = useState(null);
  const [inviteError, setInviteError] = useState("");
  const [inviteForm, setInviteForm] = useState({ fullName: "", password: "", confirmPassword: "" });

  const persistAuth = useCallback((next) => {
    setAuthState(next);
    try {
      localStorage.setItem(LAB_AUTH_SESSION_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore write errors
    }
  }, []);

  const signedInAs = useCallback(
    (backendUser, fallbackEmail) => {
      const backendRole = String(backendUser?.role || "").trim().toLowerCase();
      const appRole = backendRole === "lab" ? "lab_staff" : backendRole || "lab_staff";
      persistAuth({
        isAuthenticated: true,
        mode: "login",
        role: appRole,
        profile: {
          fullName: String(backendUser?.fullName || fallbackEmail),
          displayName: String(backendUser?.fullName || fallbackEmail),
          email: String(backendUser?.email || fallbackEmail),
          role: appRole,
        },
        authenticatedAt: new Date().toISOString(),
      });
    },
    [persistAuth]
  );

  useEffect(() => {
    const onHashChange = () => setInviteToken(inviteTokenFromHash(window.location.hash));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const handleLogout = useCallback(() => {
    clearAuthToken(AUTH_SCOPE);
    persistAuth({ isAuthenticated: false });
    setLoginValues({ email: "", password: "" });
    setLoginError("");
    setNotice("");
  }, [persistAuth]);

  // The lab shell triggers logout through an event rather than prop-drilling.
  useEffect(() => {
    const handler = () => handleLogout();
    window.addEventListener("lab:logout", handler);
    return () => window.removeEventListener("lab:logout", handler);
  }, [handleLogout]);

  // A rejected session upstream means the stored one is stale.
  useEffect(() => {
    if (!authState.isAuthenticated || snapshot.state !== "unauthorized") return;
    clearAuthToken(AUTH_SCOPE);
    persistAuth({ isAuthenticated: false });
    setLoginValues((prev) => ({ email: authState.profile?.email || prev.email, password: "" }));
    setLoginError(
      t("auth.sharedBackend.sessionExpiredMessage", {
        defaultValue: "Your session expired. Sign in again.",
      })
    );
  }, [authState.isAuthenticated, authState.profile?.email, persistAuth, snapshot.state, t]);

  // Load the invitation named in the URL, if any.
  useEffect(() => {
    if (!inviteToken) {
      setInvite(null);
      setInviteError("");
      return;
    }
    setBusy(true);
    setInviteError("");
    fetchInviteApi(inviteToken)
      .then((data) => {
        setInvite(data?.invite || null);
        setInviteForm((prev) => ({ ...prev, fullName: prev.fullName || "" }));
      })
      .catch((error) => {
        setInvite(null);
        setInviteError(error instanceof Error ? error.message : "This invitation link is not valid.");
      })
      .finally(() => setBusy(false));
  }, [inviteToken]);

  const handleLogin = async (event) => {
    event.preventDefault();
    setLoginError("");
    setNotice("");
    const email = String(loginValues.email || "").trim().toLowerCase();
    const password = String(loginValues.password || "");
    if (!email || !password) {
      setLoginError(t("auth.errors.missingCredentials", { defaultValue: "Enter your email and password." }));
      return;
    }
    setBusy(true);
    try {
      const response = await loginApi({ email, password }, AUTH_SCOPE);
      signedInAs(response?.user, email);
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "Sign in failed.");
    } finally {
      setBusy(false);
    }
  };

  const handlePasswordReset = async (event) => {
    event.preventDefault();
    setLoginError("");
    const email = String(resetEmail || "").trim().toLowerCase();
    if (!email.includes("@")) {
      setLoginError(t("auth.errors.emailRequired", { defaultValue: "Enter your account email address." }));
      return;
    }
    setBusy(true);
    try {
      await requestPasswordResetApi({ email });
    } catch {
      // Deliberately swallowed: whether the address exists is not something an
      // unauthenticated caller should be able to learn from the response.
    } finally {
      setBusy(false);
      setIsResetting(false);
      setNotice(
        t("auth.reset.sent", {
          defaultValue: "If that address has an account, a reset link is on its way.",
        })
      );
    }
  };

  const handleApply = async (event) => {
    event.preventDefault();
    setLoginError("");
    setBusy(true);
    try {
      await submitPartnerApplicationApi({
        labName: applyForm.labName.trim(),
        contactName: applyForm.contactName.trim(),
        email: applyForm.email.trim(),
        country: applyForm.country.trim() || undefined,
        website: applyForm.website.trim() || undefined,
        message: applyForm.message.trim() || undefined,
      });
      setIsApplying(false);
      setApplyForm({ labName: "", contactName: "", email: "", country: "", website: "", message: "" });
      setNotice(
        t("auth.lab.applicationSent", {
          defaultValue:
            "Thank you — your details are with our team. If we go ahead, you will receive an invitation by email.",
        })
      );
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "Could not send your application.");
    } finally {
      setBusy(false);
    }
  };

  const handleAcceptInvite = async (event) => {
    event.preventDefault();
    setInviteError("");
    const fullName = String(inviteForm.fullName || "").trim();
    if (!fullName) {
      setInviteError("Enter your name.");
      return;
    }
    const needsPassword = invite?.requiresPassword;
    if (needsPassword) {
      if (String(inviteForm.password || "").length < 8) {
        setInviteError("Choose a password of at least 8 characters.");
        return;
      }
      if (inviteForm.password !== inviteForm.confirmPassword) {
        setInviteError("Those passwords do not match.");
        return;
      }
    }

    setBusy(true);
    try {
      const result = await acceptInviteApi(inviteToken, {
        fullName,
        ...(needsPassword ? { password: inviteForm.password } : {}),
      });
      window.location.hash = "#/lab/dashboard";
      setInviteToken("");
      if (result?.requiresSignIn) {
        setNotice("Invitation accepted. Sign in to continue.");
        setLoginValues({ email: String(result.email || ""), password: "" });
        return;
      }
      signedInAs(result?.user, String(invite?.email || ""));
    } catch (error) {
      setInviteError(error instanceof Error ? error.message : "Could not accept this invitation.");
    } finally {
      setBusy(false);
    }
  };

  if (authState.isAuthenticated) {
    return <>{children}</>;
  }

  // ── Invitation acceptance ─────────────────────────────────────────────────
  if (inviteToken) {
    return (
      <div className="auth-shell lab-auth">
        <div className="auth-card">
          <h1 className="auth-card-title">
            {invite?.kind === "vendor_lab" ? "Set up your laboratory" : "Join the team"}
          </h1>

          {inviteError ? <div className="auth-error">{inviteError}</div> : null}

          {invite ? (
            <>
              <p className="auth-subtitle">
                {invite.kind === "vendor_lab" ? (
                  <>
                    You have been invited to run <strong>{invite.organizationName}</strong> on
                    Breeding Planner. Accepting creates your laboratory's own workspace.
                  </>
                ) : (
                  <>
                    You have been invited to join <strong>{invite.organizationName}</strong> as{" "}
                    {String(invite.role || "member").replace(/_/g, " ")}.
                  </>
                )}
              </p>
              <p className="auth-subtitle">
                Invitation for <strong>{invite.email}</strong>
              </p>

              <form onSubmit={handleAcceptInvite}>
                <label>
                  Your name
                  <input
                    value={inviteForm.fullName}
                    onChange={(e) => setInviteForm((p) => ({ ...p, fullName: e.target.value }))}
                    required
                  />
                </label>

                {invite.requiresPassword ? (
                  <>
                    <label>
                      Choose a password
                      <input
                        type="password"
                        value={inviteForm.password}
                        onChange={(e) => setInviteForm((p) => ({ ...p, password: e.target.value }))}
                        minLength={8}
                        required
                      />
                    </label>
                    <label>
                      Confirm password
                      <input
                        type="password"
                        value={inviteForm.confirmPassword}
                        onChange={(e) =>
                          setInviteForm((p) => ({ ...p, confirmPassword: e.target.value }))
                        }
                        required
                      />
                    </label>
                  </>
                ) : (
                  <p className="auth-subtitle">
                    This address already has an account — accept, then sign in with your existing
                    password.
                  </p>
                )}

                <button type="submit" className="primary" disabled={busy}>
                  {busy ? "Working…" : "Accept invitation"}
                </button>
              </form>
            </>
          ) : (
            !inviteError && <p className="auth-subtitle">Checking your invitation…</p>
          )}
        </div>
      </div>
    );
  }

  // ── Sign in ───────────────────────────────────────────────────────────────
  return (
    <div className="auth-shell lab-auth">
      <div className="auth-card">
        <h1 className="auth-card-title">
          {t("auth.lab.title", { defaultValue: "Laboratory Portal" })}
        </h1>
        <p className="auth-subtitle">
          {t("auth.lab.subtitle", {
            defaultValue: "Sign in to manage your laboratory's tests, orders and results.",
          })}
        </p>

        {notice ? <div className="auth-notice">{notice}</div> : null}
        {loginError ? <div className="auth-error">{loginError}</div> : null}

        {snapshot.state === "unreachable" ? (
          <div className="auth-error">
            {snapshot?.message ||
              t("auth.sharedBackend.unreachable", { defaultValue: "The backend is unreachable." })}
            <button type="button" className="ghost" onClick={retry}>
              {t("common.retry", { defaultValue: "Retry" })}
            </button>
          </div>
        ) : null}

        {isResetting ? (
          <form onSubmit={handlePasswordReset}>
            <label>
              {t("auth.fields.email", { defaultValue: "Email" })}
              <input
                type="email"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                required
              />
            </label>
            <button type="submit" className="primary" disabled={busy}>
              {busy ? "Sending…" : t("auth.reset.send", { defaultValue: "Send reset link" })}
            </button>
            <button type="button" className="ghost" onClick={() => setIsResetting(false)}>
              {t("common.cancel", { defaultValue: "Cancel" })}
            </button>
          </form>
        ) : (
          <form onSubmit={handleLogin}>
            <label>
              {t("auth.fields.email", { defaultValue: "Email" })}
              <input
                type="email"
                value={loginValues.email}
                onChange={(e) => setLoginValues((p) => ({ ...p, email: e.target.value }))}
                autoComplete="username"
                required
              />
            </label>
            <label>
              {t("auth.fields.password", { defaultValue: "Password" })}
              <input
                type="password"
                value={loginValues.password}
                onChange={(e) => setLoginValues((p) => ({ ...p, password: e.target.value }))}
                autoComplete="current-password"
                required
              />
            </label>
            <button type="submit" className="primary" disabled={busy}>
              {busy ? "Signing in…" : t("auth.actions.login", { defaultValue: "Sign in" })}
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => {
                setResetEmail(loginValues.email);
                setIsResetting(true);
              }}
            >
              {t("auth.actions.forgotPassword", { defaultValue: "Forgot your password?" })}
            </button>
          </form>
        )}

        {/* Still no registration, by design. Applying creates no account and
            grants no access — it sends the team a note. Only an administrator
            issuing an invitation opens the door. */}
        {isApplying ? (
          <form onSubmit={handleApply} className="auth-apply">
            <h2 className="auth-card-title">
              {t("auth.lab.applyTitle", { defaultValue: "Apply to become a partner laboratory" })}
            </h2>
            <p className="auth-subtitle">
              {t("auth.lab.applyHelp", {
                defaultValue:
                  "Tell us about your laboratory. This does not create an account — if we go ahead, we will send you an invitation.",
              })}
            </p>
            <label>
              {t("auth.lab.applyLabName", { defaultValue: "Laboratory name" })}
              <input
                value={applyForm.labName}
                onChange={(e) => setApplyForm((p) => ({ ...p, labName: e.target.value }))}
                required
              />
            </label>
            <label>
              {t("auth.lab.applyContact", { defaultValue: "Your name" })}
              <input
                value={applyForm.contactName}
                onChange={(e) => setApplyForm((p) => ({ ...p, contactName: e.target.value }))}
                required
              />
            </label>
            <label>
              {t("auth.fields.email", { defaultValue: "Email" })}
              <input
                type="email"
                value={applyForm.email}
                onChange={(e) => setApplyForm((p) => ({ ...p, email: e.target.value }))}
                required
              />
            </label>
            <label>
              {t("auth.lab.applyCountry", { defaultValue: "Country" })}
              <input
                value={applyForm.country}
                onChange={(e) => setApplyForm((p) => ({ ...p, country: e.target.value }))}
              />
            </label>
            <label>
              {t("auth.lab.applyWebsite", { defaultValue: "Website" })}
              <input
                type="url"
                placeholder="https://"
                value={applyForm.website}
                onChange={(e) => setApplyForm((p) => ({ ...p, website: e.target.value }))}
              />
            </label>
            <label>
              {t("auth.lab.applyMessage", { defaultValue: "What do you test?" })}
              <textarea
                rows={3}
                value={applyForm.message}
                onChange={(e) => setApplyForm((p) => ({ ...p, message: e.target.value }))}
              />
            </label>
            <button type="submit" className="primary" disabled={busy}>
              {busy
                ? t("common.sending", { defaultValue: "Sending…" })
                : t("auth.lab.applySend", { defaultValue: "Send application" })}
            </button>
            <button type="button" className="ghost" onClick={() => setIsApplying(false)}>
              {t("common.cancel", { defaultValue: "Cancel" })}
            </button>
          </form>
        ) : (
          <p className="auth-footnote">
            {t("auth.lab.inviteOnly", {
              defaultValue:
                "Laboratory accounts are created by invitation only.",
            })}{" "}
            <button type="button" className="linklike" onClick={() => setIsApplying(true)}>
              {t("auth.lab.applyLink", { defaultValue: "Apply to become a partner laboratory" })}
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
