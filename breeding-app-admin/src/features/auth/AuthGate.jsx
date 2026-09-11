import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  clearAuthToken,
  confirmEmailChange as confirmEmailChangeApi,
  forgotPassword as forgotPasswordApi,
  hasStoredAuthSession,
  login as loginApi,
  resendVerification as resendVerificationApi,
  resetPassword as resetPasswordApi,
  verifyEmail as verifyEmailApi,
} from "../../shared/apiClient";
import { useSharedBackend } from "../../contexts/SharedBackendContext.jsx";
import { canRoleUsePortal, normalizeRole, portalRejectionMessage } from "./portalAccess";

const ADMIN_APP_AUTH_SCOPE = "admin";

/**
 * The account-lifecycle emails link back to plain paths (e.g. `${appUrl}/verify-email?token=...`),
 * not hash routes — this overlay is mounted ahead of the app's HashRouter, so
 * these are read from the real pathname/search once on load and handled
 * inline here, ahead of the normal login/register overlay.
 */
const LINK_FLOW_PATHS = {
  "/verify-email": "verify-email",
  "/reset-password": "reset-password",
  "/confirm-email-change": "confirm-email-change",
};

const getLinkFlowFromLocation = () => {
  if (typeof window === "undefined") return null;
  const path = String(window.location?.pathname || "").replace(/\/+$/, "") || "/";
  const type = LINK_FLOW_PATHS[path];
  if (!type) return null;
  const params = new URLSearchParams(window.location.search || "");
  const token = params.get("token") || "";
  if (!token) return null;
  return { type, token };
};

const AUTH_SESSION_STORAGE_KEYS = {
  breeder: "breedingPlannerBreederAuthSession",
  lab: "breedingPlannerLabAuthSession",
  admin: "breedingPlannerAdminAuthSession",
};
const LEGACY_AUTH_STORAGE_KEY = "breedingPlannerAuthSession";

const getAuthSurfaceForHash = (hashValue) => {
  const raw = String(hashValue || "").replace(/^#/, "").trim();
  const path = raw ? (raw.startsWith("/") ? raw : `/${raw}`) : "/";
  // Only pricing is truly public; root "/" now requires auth so the
  // welcome screen always shows on first visit.
  if (path.startsWith("/pricing")) return "public";
  return ADMIN_APP_AUTH_SCOPE;
};
const createDefaultPasswordRecoveryData = (email = "") => ({ email });

const loadStoredAuth = (scope = "breeder") => {
  if (scope === "public") return { isAuthenticated: false };
  const storageKey = AUTH_SESSION_STORAGE_KEYS[scope] || AUTH_SESSION_STORAGE_KEYS.breeder;
  try {
    const raw = localStorage.getItem(storageKey) || (scope === "breeder" ? localStorage.getItem(LEGACY_AUTH_STORAGE_KEY) : "");
    if (!raw) return { isAuthenticated: false };
    const parsed = JSON.parse(raw);
    if (parsed?.isAuthenticated) {
      // A session stored by an older build could hold any role. Evicting it on
      // boot is what stops a reload from restoring the empty console shell that
      // a breeder sign-in used to produce.
      if (!canRoleUsePortal(parsed?.role || parsed?.profile?.role, ADMIN_APP_AUTH_SCOPE)) {
        try {
          localStorage.removeItem(storageKey);
          clearAuthToken(scope);
        } catch {}
        return { isAuthenticated: false };
      }
      // Keep the session only if either the access token or refresh token is still
      // available. This lets the app silently restore auth after a reload.
      if (!hasStoredAuthSession(scope)) {
        try {
          localStorage.removeItem(storageKey);
          if (scope === "breeder") localStorage.removeItem(LEGACY_AUTH_STORAGE_KEY);
        } catch {}
        return { isAuthenticated: false };
      }
      return parsed;
    }
    return { isAuthenticated: false };
  } catch {
    return { isAuthenticated: false };
  }
};

const normalizeIdentifier = (value) => String(value ?? "").trim().toLowerCase();

export default function AuthGate({ children }) {
  const { t, i18n } = useTranslation();
  const { snapshot, retry } = useSharedBackend();
  const [authScope, setAuthScope] = useState(() => getAuthSurfaceForHash(window?.location?.hash));
  const [authState, setAuthState] = useState(() => loadStoredAuth(authScope));
  const [view, setView] = useState("login");
  const [loginValues, setLoginValues] = useState({ username: "", password: "" });
  const [loginError, setLoginError] = useState("");
  const [loginMessage, setLoginMessage] = useState("");
  const [isRecoveringPassword, setIsRecoveringPassword] = useState(false);
  const [passwordRecoveryData, setPasswordRecoveryData] = useState(() =>
    createDefaultPasswordRecoveryData()
  );
  const [passwordRecoveryError, setPasswordRecoveryError] = useState("");
  const [recoveryEmailSent, setRecoveryEmailSent] = useState(false);
  const [linkFlow] = useState(() => getLinkFlowFromLocation());
  const [linkFlowResult, setLinkFlowResult] = useState({ status: "pending", message: "" });
  const [resetPasswordValues, setResetPasswordValues] = useState({ newPassword: "", confirmPassword: "" });
  const [resetPasswordError, setResetPasswordError] = useState("");
  const [resetPasswordDone, setResetPasswordDone] = useState(false);
  const [isResendingVerification, setIsResendingVerification] = useState(false);
  const [resendVerificationEmailValue, setResendVerificationEmailValue] = useState("");
  const [resendVerificationSent, setResendVerificationSent] = useState(false);
  const [resendVerificationError, setResendVerificationError] = useState("");
  const [resendVerificationBusy, setResendVerificationBusy] = useState(false);
  // Set right after a successful registration, before any session exists — registration isn't
  // "done" until the user clicks the emailed link, so no login/persistAuth happens until then.
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState("");
  useEffect(() => {
    const onHashChange = () => {
      setAuthScope(getAuthSurfaceForHash(window.location.hash));
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    if (!linkFlow) return undefined;
    // Clear the token out of the URL immediately so it can't be re-submitted
    // (e.g. on refresh) or leak via browser history/referrer headers.
    try {
      window.history.replaceState({}, "", window.location.pathname);
    } catch {
      // ignore
    }
    if (linkFlow.type === "reset-password") return undefined;

    let cancelled = false;
    const run = async () => {
      try {
        if (linkFlow.type === "verify-email") {
          const result = await verifyEmailApi({ token: linkFlow.token });
          if (cancelled) return;
          setLinkFlowResult({ status: "success", message: result?.message || t("auth.verifyEmail.success", { defaultValue: "Your email address is verified." }) });
        } else if (linkFlow.type === "confirm-email-change") {
          const result = await confirmEmailChangeApi({ token: linkFlow.token });
          if (cancelled) return;
          setLinkFlowResult({ status: "success", message: result?.message || t("auth.confirmEmailChange.success", { defaultValue: "Your new email address is confirmed." }) });
        }
      } catch (error) {
        if (cancelled) return;
        setLinkFlowResult({
          status: "error",
          message: error instanceof Error ? error.message : t("auth.linkFlow.error", { defaultValue: "This link is invalid or has expired." }),
        });
      }
    };
    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkFlow]);

  useEffect(() => {
    setAuthState(loadStoredAuth(authScope));
    setView("chooser");
    setLoginError("");
    setLoginMessage("");
    setIsRecoveringPassword(false);
    setIsResendingVerification(false);
    setPendingVerificationEmail("");
  }, [authScope]);

  const persistAuth = useCallback((next) => {
    setAuthState(next);
    if (authScope === "public") return;
    const storageKey = AUTH_SESSION_STORAGE_KEYS[authScope] || AUTH_SESSION_STORAGE_KEYS.breeder;
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // ignore write errors
    }
  }, [authScope]);

  const handleLogout = useCallback(() => {
    if (authScope !== "public") clearAuthToken(authScope);
    persistAuth({ isAuthenticated: false });
    setView("login");
    setLoginError("");
    setLoginMessage("");
    setIsRecoveringPassword(false);
    setIsResendingVerification(false);
    setPendingVerificationEmail("");
    setPasswordRecoveryError("");
    setPasswordRecoveryData(createDefaultPasswordRecoveryData());
  }, [authScope, persistAuth]);

  useEffect(() => {
    if (!authState.isAuthenticated || snapshot.state !== "unauthorized") {
      return;
    }

    if (authScope !== "public") clearAuthToken(authScope);
    persistAuth({ isAuthenticated: false });
    setView("chooser");
    setIsRecoveringPassword(false);
    setIsResendingVerification(false);
    setLoginValues((prev) => ({
      username: authState.profile?.email || prev.username || "",
      password: "",
    }));
    setLoginError(
      t("auth.sharedBackend.sessionExpiredMessage", {
        defaultValue: "Your shared backend session expired. Sign in again.",
      })
    );
    setLoginMessage("");
    setPasswordRecoveryError("");
    setPasswordRecoveryData(createDefaultPasswordRecoveryData(authState.profile?.email || ""));
  }, [authScope, authState.isAuthenticated, authState.profile?.email, persistAuth, snapshot.state, t]);

  const handleLoginSubmit = async (event) => {
    event.preventDefault();
    setLoginError("");
    setLoginMessage("");
    const { username, password } = loginValues;
    if (!username.trim() || !password.trim()) {
      setLoginError(t("auth.errors.missingCredentials", { defaultValue: "Enter both username and password." }));
      return;
    }
    try {
      const normalizedInput = normalizeIdentifier(username);
      const loginEmail = String(normalizedInput.includes("@") ? normalizedInput : "").trim();

      if (!loginEmail) {
        setLoginError(t("auth.errors.emailRequired", { defaultValue: "Use your account email address to sign in." }));
        return;
      }

      const response = await loginApi(
        { email: loginEmail, password: String(password || ""), portal: ADMIN_APP_AUTH_SCOPE },
        authScope === "public" ? "breeder" : authScope
      );
      const backendUser = response?.user || {};
      const backendRole = String((backendUser && backendUser.role) || "breeder").trim().toLowerCase();
      const appRole = normalizeRole(backendRole) || "breeder";

      // The backend already refuses these credentials, so reaching here means
      // an older API. Checked anyway rather than trusted: the whole defect was
      // a session that existed on the client and nowhere else.
      if (!canRoleUsePortal(appRole, ADMIN_APP_AUTH_SCOPE)) {
        clearAuthToken(authScope);
        setLoginError(portalRejectionMessage(appRole, ADMIN_APP_AUTH_SCOPE));
        return;
      }

      persistAuth({
        isAuthenticated: true,
        mode: "login",
        role: appRole,
        profile: {
          fullName: String((backendUser && backendUser.fullName) || loginEmail),
          displayName: String((backendUser && backendUser.fullName) || loginEmail),
          email: String((backendUser && backendUser.email) || loginEmail),
          reptileCount: "",
          role: appRole,
          emailVerified: backendUser?.emailVerified !== false,
        },
        authenticatedAt: new Date().toISOString(),
      });
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : t("auth.errors.badPassword", { defaultValue: "Login failed." }));
    }
  };

  const openPasswordRecovery = () => {
    const normalizedInput = normalizeIdentifier(loginValues.username);
    const recoveryEmail = normalizedInput.includes("@") ? normalizedInput : "";
    setIsRecoveringPassword(true);
    setIsResendingVerification(false);
    setLoginError("");
    setLoginMessage("");
    setPasswordRecoveryError("");
    setPasswordRecoveryData(createDefaultPasswordRecoveryData(recoveryEmail));
  };

  const closePasswordRecovery = () => {
    setIsRecoveringPassword(false);
    setPasswordRecoveryError("");
    setRecoveryEmailSent(false);
    setPasswordRecoveryData((prev) => createDefaultPasswordRecoveryData(prev.email));
  };

  const handlePasswordRecoveryChange = (name, value) => {
    setPasswordRecoveryData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handlePasswordRecoverySubmit = async (event) => {
    event.preventDefault();
    setPasswordRecoveryError("");

    const recoveryEmail = normalizeIdentifier(passwordRecoveryData.email);
    if (!recoveryEmail || !recoveryEmail.includes("@")) {
      setPasswordRecoveryError(t("auth.errors.emailRequired", {
        defaultValue: "Enter the email address on your account.",
      }));
      return;
    }

    try {
      await forgotPasswordApi({ email: recoveryEmail });
      setRecoveryEmailSent(true);
    } catch (error) {
      setPasswordRecoveryError(
        error instanceof Error
          ? error.message
          : t("auth.recovery.error", { defaultValue: "Something went wrong. Please try again." })
      );
    }
  };

  const handleResetPasswordSubmit = async (event) => {
    event.preventDefault();
    setResetPasswordError("");
    const { newPassword, confirmPassword } = resetPasswordValues;
    if (newPassword.trim().length < 8) {
      setResetPasswordError(t("auth.errors.passwordLength", { defaultValue: "Choose a password with at least 8 characters." }));
      return;
    }
    if (newPassword !== confirmPassword) {
      setResetPasswordError(t("auth.errors.passwordMismatch", { defaultValue: "Passwords do not match." }));
      return;
    }
    try {
      await resetPasswordApi({ token: linkFlow.token, newPassword });
      setResetPasswordDone(true);
    } catch (error) {
      setResetPasswordError(
        error instanceof Error ? error.message : t("auth.resetPassword.error", { defaultValue: "This link is invalid or has expired." })
      );
    }
  };

  const openResendVerification = (prefillEmail = "") => {
    setIsResendingVerification(true);
    setIsRecoveringPassword(false);
    setResendVerificationEmailValue(prefillEmail);
    setResendVerificationSent(false);
    setResendVerificationError("");
  };

  const closeResendVerification = () => {
    setIsResendingVerification(false);
    setResendVerificationError("");
    setResendVerificationSent(false);
  };

  const handleResendVerificationSubmit = async (event) => {
    event.preventDefault();
    setResendVerificationError("");
    const email = normalizeIdentifier(resendVerificationEmailValue);
    if (!email || !email.includes("@")) {
      setResendVerificationError(t("auth.errors.emailRequired", { defaultValue: "Enter the email address on your account." }));
      return;
    }
    setResendVerificationBusy(true);
    try {
      await resendVerificationApi({ email });
      setResendVerificationSent(true);
    } catch (error) {
      setResendVerificationError(
        error instanceof Error ? error.message : t("auth.recovery.error", { defaultValue: "Something went wrong. Please try again." })
      );
    } finally {
      setResendVerificationBusy(false);
    }
  };

  const loginCard = (
    <div className="auth-card">
      <div className="auth-card-brand">
        <img src={logoSrc} alt={t("auth.logoAlt", { defaultValue: "Breeding Planner logo" })} className="auth-logo" />
        <h1 className="auth-card-title">{t("auth.title", { defaultValue: "Breeding Planner" })}</h1>
      </div>
      <p className="auth-subtitle">
        {t("auth.subtitle", {
          defaultValue:
            "Keep your reptiles synced across desktop and mobile with one secure account.",
        })}
      </p>
      {/*
        No registration here, by design. This console used to carry the public
        breeder signup form, which meant anyone who found its URL could create
        an account from the admin login screen. Team members are invited by the
        account owner instead.
      */}
      <p className="auth-helper-copy">
        {t("auth.admin.inviteOnly", {
          defaultValue: "The admin console is invite-only. Ask the account owner for access.",
        })}
      </p>
      {view === "login" && (
          isRecoveringPassword ? (
            <form className="auth-login-form" onSubmit={handlePasswordRecoverySubmit}>
              {recoveryEmailSent ? (
                <p className="auth-helper-copy">
                  {t("auth.recovery.emailSent", {
                    defaultValue: "Check your email — we sent a reset link. It expires in 1 hour.",
                  })}
                </p>
              ) : (
                <>
                  <p className="auth-helper-copy">
                    {t("auth.recovery.instructions", {
                      defaultValue: "Enter your account email and we'll send you a reset link.",
                    })}
                  </p>
                  <label className="auth-field">
                    <span className="auth-field-label">
                      {t("auth.fields.email", { defaultValue: "Email address" })}
                    </span>
                    <input
                      type="email"
                      value={passwordRecoveryData.email}
                      onChange={(e) => handlePasswordRecoveryChange("email", e.target.value)}
                      autoComplete="email"
                    />
                  </label>
                  {passwordRecoveryError && <p className="auth-error">{passwordRecoveryError}</p>}
                  <button type="submit" className="primary wide">
                    {t("auth.actions.sendResetLink", { defaultValue: "Send reset link" })}
                  </button>
                </>
              )}
              <div className="auth-secondary-action">
                <button type="button" className="text-button" onClick={closePasswordRecovery}>
                  {t("auth.actions.backToLogin", { defaultValue: "Back to login" })}
                </button>
              </div>
            </form>
          ) : isResendingVerification ? (
            <form className="auth-login-form" onSubmit={handleResendVerificationSubmit}>
              {resendVerificationSent ? (
                <p className="auth-helper-copy">
                  {t("auth.resendVerification.sent", {
                    defaultValue: "If that email is registered and unverified, a new verification link has been sent. Check your inbox (and spam folder).",
                  })}
                </p>
              ) : (
                <>
                  <p className="auth-helper-copy">
                    {t("auth.resendVerification.instructions", {
                      defaultValue: "Enter your account email and we'll send a new verification link.",
                    })}
                  </p>
                  <label className="auth-field">
                    <span className="auth-field-label">
                      {t("auth.fields.email", { defaultValue: "Email address" })}
                    </span>
                    <input
                      type="email"
                      value={resendVerificationEmailValue}
                      onChange={(e) => setResendVerificationEmailValue(e.target.value)}
                      autoComplete="email"
                    />
                  </label>
                  {resendVerificationError && <p className="auth-error">{resendVerificationError}</p>}
                  <button type="submit" className="primary wide" disabled={resendVerificationBusy}>
                    {resendVerificationBusy
                      ? t("common.sending", { defaultValue: "Sending..." })
                      : t("auth.actions.resendVerification", { defaultValue: "Resend verification email" })}
                  </button>
                </>
              )}
              <div className="auth-secondary-action">
                <button type="button" className="text-button" onClick={closeResendVerification}>
                  {t("auth.actions.backToLogin", { defaultValue: "Back to login" })}
                </button>
              </div>
            </form>
          ) : (
            <form className="auth-login-form" onSubmit={handleLoginSubmit}>
              <label className="auth-field">
                <span className="auth-field-label">
                  {t("auth.fields.email", { defaultValue: "Email address" })}
                </span>
                <input
                  type="email"
                  value={loginValues.username}
                  onChange={(e) =>
                    setLoginValues((prev) => ({ ...prev, username: e.target.value }))
                }
              />
              </label>
              <label className="auth-field">
                <span className="auth-field-label">
                  {t("auth.fields.password", { defaultValue: "Password" })}
                </span>
                <input
                  type="password"
                  value={loginValues.password}
                  onChange={(e) =>
                    setLoginValues((prev) => ({ ...prev, password: e.target.value }))
                }
              />
              </label>
              <div className="auth-inline-link-row">
                <button type="button" className="text-button" onClick={openPasswordRecovery}>
                  {t("auth.actions.forgotPassword", { defaultValue: "Forgot password?" })}
                </button>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => openResendVerification(normalizeIdentifier(loginValues.username).includes("@") ? loginValues.username : "")}
                >
                  {t("auth.actions.resendVerificationLink", { defaultValue: "Resend verification email" })}
                </button>
              </div>
              {loginMessage && <p className="auth-success">{loginMessage}</p>}
              {loginError && <p className="auth-error">{loginError}</p>}
              <button type="submit" className="primary wide">
                {t("common.continue", { defaultValue: "Continue" })}
              </button>
              {import.meta.env.DEV ? (
                <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
                  Dev login:
                  {" "}
                  <code>lab@proherper.dev</code>
                  {" / "}
                  <code>demo1234</code>
                  {" "}
                  or
                  {" "}
                  <code>admin@BreedingPlanner.dev</code>
                  {" / "}
                  <code>admin1234</code>.
                  {" "}
                  Public registration creates breeder accounts only.
                </div>
              ) : null}
            </form>
          )
        )}
    </div>
  );

  const signedInChip = authState.isAuthenticated ? (
    <div className="auth-floating-chip">
      <span>
        {t("auth.status.signedInAs", { defaultValue: "Signed in as" })}{" "}
        {authState.profile?.displayName ||
          authState.profile?.fullName ||
          t("auth.status.defaultName", { defaultValue: "Keeper" })}
      </span>
      <button type="button" onClick={handleLogout}>
        {t("auth.actions.signOut", { defaultValue: "Sign out" })}
      </button>
    </div>
  ) : null;

  const maskEmailForDisplay = (email) => {
    const [local, domain] = String(email || "").split("@");
    if (!domain) return email || "";
    const visible = local.slice(0, 2);
    return `${visible}${"*".repeat(Math.max(local.length - visible.length, 1))}@${domain}`;
  };

  const linkFlowCard = linkFlow ? (
    <div className="auth-card">
      <div className="auth-card-brand">
        <img src={logoSrc} alt={t("auth.logoAlt", { defaultValue: "Breeding Planner logo" })} className="auth-logo" />
        <h1 className="auth-card-title">{t("auth.title", { defaultValue: "Breeding Planner" })}</h1>
      </div>
      {linkFlow.type === "reset-password" ? (
        resetPasswordDone ? (
          <>
            <p className="auth-helper-copy">
              {t("auth.resetPassword.success", { defaultValue: "Your password has been updated. You can now sign in with your new password." })}
            </p>
            <button type="button" className="primary wide" onClick={() => { window.location.href = "/"; }}>
              {t("auth.actions.backToLogin", { defaultValue: "Back to login" })}
            </button>
          </>
        ) : (
          <form className="auth-login-form" onSubmit={handleResetPasswordSubmit}>
            <p className="auth-helper-copy">
              {t("auth.resetPassword.instructions", { defaultValue: "Choose a new password for your account." })}
            </p>
            <label className="auth-field">
              <span className="auth-field-label">{t("auth.fields.newPassword", { defaultValue: "New password" })}</span>
              <input
                type="password"
                value={resetPasswordValues.newPassword}
                onChange={(e) => setResetPasswordValues((prev) => ({ ...prev, newPassword: e.target.value }))}
                autoComplete="new-password"
              />
            </label>
            <label className="auth-field">
              <span className="auth-field-label">{t("auth.fields.confirmPassword", { defaultValue: "Confirm password" })}</span>
              <input
                type="password"
                value={resetPasswordValues.confirmPassword}
                onChange={(e) => setResetPasswordValues((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                autoComplete="new-password"
              />
            </label>
            {resetPasswordError && <p className="auth-error">{resetPasswordError}</p>}
            <button type="submit" className="primary wide">
              {t("auth.actions.setNewPassword", { defaultValue: "Set new password" })}
            </button>
          </form>
        )
      ) : (
        <>
          <p className={linkFlowResult.status === "error" ? "auth-error" : "auth-helper-copy"}>
            {linkFlowResult.status === "pending"
              ? t("auth.linkFlow.working", { defaultValue: "Working..." })
              : linkFlowResult.message}
          </p>
          {linkFlowResult.status !== "pending" && (
            <button type="button" className="primary wide" onClick={() => { window.location.href = "/"; }}>
              {t("auth.actions.backToLogin", { defaultValue: "Back to login" })}
            </button>
          )}
        </>
      )}
    </div>
  ) : null;

  const unverifiedGateActive = authScope !== "public" && authState.isAuthenticated && authState.profile?.emailVerified === false;
  const unverifiedGateCard = unverifiedGateActive ? (
    <div className="auth-card">
      <div className="auth-card-brand">
        <img src={logoSrc} alt={t("auth.logoAlt", { defaultValue: "Breeding Planner logo" })} className="auth-logo" />
        <h1 className="auth-card-title">{t("auth.unverified.title", { defaultValue: "Verify your email address" })}</h1>
      </div>
      <p className="auth-subtitle">
        {t("auth.unverified.description", {
          defaultValue: "Your email address ({{email}}) has not been verified yet. Check your inbox for the verification link, or request a new one.",
          email: maskEmailForDisplay(authState.profile?.email),
        })}
      </p>
      {resendVerificationSent ? (
        <p className="auth-helper-copy">
          {t("auth.resendVerification.sent", {
            defaultValue: "If that email is registered and unverified, a new verification link has been sent. Check your inbox (and spam folder).",
          })}
        </p>
      ) : (
        <>
          {resendVerificationError && <p className="auth-error">{resendVerificationError}</p>}
          <button
            type="button"
            className="primary wide"
            disabled={resendVerificationBusy}
            onClick={async () => {
              setResendVerificationError("");
              setResendVerificationBusy(true);
              try {
                await resendVerificationApi({ email: authState.profile?.email });
                setResendVerificationSent(true);
              } catch (error) {
                setResendVerificationError(error instanceof Error ? error.message : t("auth.recovery.error", { defaultValue: "Something went wrong. Please try again." }));
              } finally {
                setResendVerificationBusy(false);
              }
            }}
          >
            {resendVerificationBusy
              ? t("common.sending", { defaultValue: "Sending..." })
              : t("auth.actions.resendVerification", { defaultValue: "Resend verification email" })}
          </button>
        </>
      )}
      <div className="auth-secondary-action">
        <button type="button" className="text-button" onClick={handleLogout}>
          {t("auth.actions.signOut", { defaultValue: "Sign out" })}
        </button>
      </div>
    </div>
  ) : null;

  // Shown right after registration, before any session exists. The user must click the
  // emailed verification link (which lands on the linkFlowCard above, possibly in a
  // different tab) before they can sign in for the first time.
  const pendingVerificationCard = pendingVerificationEmail ? (
    <div className="auth-card">
      <div className="auth-card-brand">
        <img src={logoSrc} alt={t("auth.logoAlt", { defaultValue: "Breeding Planner logo" })} className="auth-logo" />
        <h1 className="auth-card-title">{t("auth.pendingVerification.title", { defaultValue: "Check your inbox" })}</h1>
      </div>
      <p className="auth-subtitle">
        {t("auth.pendingVerification.description", {
          defaultValue: "We sent a verification link to {{email}}. Click it to finish creating your account, then sign in below.",
          email: maskEmailForDisplay(pendingVerificationEmail),
        })}
      </p>
      {resendVerificationSent ? (
        <p className="auth-helper-copy">
          {t("auth.resendVerification.sent", {
            defaultValue: "If that email is registered and unverified, a new verification link has been sent. Check your inbox (and spam folder).",
          })}
        </p>
      ) : (
        <>
          {resendVerificationError && <p className="auth-error">{resendVerificationError}</p>}
          <button
            type="button"
            className="primary wide"
            disabled={resendVerificationBusy}
            onClick={async () => {
              setResendVerificationError("");
              setResendVerificationBusy(true);
              try {
                await resendVerificationApi({ email: pendingVerificationEmail });
                setResendVerificationSent(true);
              } catch (error) {
                setResendVerificationError(error instanceof Error ? error.message : t("auth.recovery.error", { defaultValue: "Something went wrong. Please try again." }));
              } finally {
                setResendVerificationBusy(false);
              }
            }}
          >
            {resendVerificationBusy
              ? t("common.sending", { defaultValue: "Sending..." })
              : t("auth.actions.resendVerification", { defaultValue: "Resend verification email" })}
          </button>
        </>
      )}
      <div className="auth-secondary-action">
        <button
          type="button"
          className="text-button"
          onClick={() => {
            setLoginValues({ username: pendingVerificationEmail, password: "" });
            setResendVerificationSent(false);
            setResendVerificationError("");
            setPendingVerificationEmail("");
            setView("login");
          }}
        >
          {t("auth.actions.backToLogin", { defaultValue: "Back to login" })}
        </button>
      </div>
    </div>
  ) : null;

  const overlayActive = Boolean(linkFlow) || unverifiedGateActive || Boolean(pendingVerificationEmail) || (authScope !== "public" && !authState.isAuthenticated);
  const showBackendBlocker = !linkFlow && !unverifiedGateActive && !pendingVerificationEmail && authScope !== "public" && !authState.isAuthenticated && snapshot.state !== "connected" && snapshot.state !== "unauthorized";

  return (
    <div className="auth-shell">
      <div className={`auth-shell__app ${overlayActive ? "is-blurred" : ""}`}>
        {authState.isAuthenticated && signedInChip}
        {!overlayActive ? children : null}
      </div>
      {overlayActive && (
        <div className="auth-overlay">
          <div className="auth-lang-switcher">
            <select
              value={i18n.language?.split("-")[0] || "en"}
              onChange={(e) => i18n.changeLanguage(e.target.value)}
              aria-label={t("common.selectLanguage", { defaultValue: "Select language" })}
            >
              {LANGUAGE_OPTIONS.map((lang) => (
                <option key={lang.code} value={lang.code}>{lang.label}</option>
              ))}
            </select>
          </div>
          {showBackendBlocker ? (
            <div className="auth-card">
              <div className="auth-card-brand">
                <img src={logoSrc} alt={t("auth.logoAlt", { defaultValue: "Breeding Planner logo" })} className="auth-logo" />
                <h1 className="auth-card-title">
                  {snapshot.state === "config-error"
                    ? t("auth.sharedBackend.configTitle", { defaultValue: "Shared backend configuration error" })
                    : snapshot.state === "unauthorized"
                      ? t("auth.sharedBackend.unauthorizedTitle", { defaultValue: "Shared backend session expired" })
                      : t("auth.sharedBackend.unavailableTitle", { defaultValue: "Shared backend unavailable" })}
                </h1>
              </div>
              <p className="auth-subtitle">{snapshot.message}</p>
              <div className="text-xs text-neutral-500">
                {t("auth.sharedBackend.requirements", {
                  defaultValue: "Cross-computer sync requires a running backend server, a shared database, the same VITE_API_URL in both apps, valid authentication, and network reachability from each device.",
                })}
              </div>
              {Array.isArray(snapshot.config.warnings) && snapshot.config.warnings.length ? (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  {snapshot.config.warnings.join(" ")}
                </div>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" className="primary" onClick={retry}>
                  {t("common.retry", { defaultValue: "Retry" })}
                </button>
              </div>
            </div>
          ) : linkFlow ? linkFlowCard : unverifiedGateActive ? unverifiedGateCard : pendingVerificationEmail ? pendingVerificationCard : loginCard}
        </div>
      )}
    </div>
  );
}

