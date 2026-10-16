import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  clearAuthToken,
  confirmEmailChange as confirmEmailChangeApi,
  forgotPassword as forgotPasswordApi,
  getAuthScopeForHash,
  hasStoredAuthSession,
  login as loginApi,
  register as registerApi,
  resendVerification as resendVerificationApi,
  resetPassword as resetPasswordApi,
  verifyEmail as verifyEmailApi,
} from "../../shared/apiClient";
import { useSharedBackend } from "../../contexts/SharedBackendContext.jsx";
import { canRoleUsePortal, normalizeRole, portalRejectionMessage } from "./portalAccess";
import { AccountContext } from "./accountContext";

/**
 * The account-lifecycle emails link back to plain paths (e.g. `${appUrl}/verify-email?token=...`),
 * not hash routes — this app has no router, so these are read from the real
 * pathname/search once on load and handled inline by AuthGate, ahead of the
 * normal login/register overlay.
 */
// The legal documents live on the public marketing site, which is a separate
// deploy from this app. Defaults to the production domain so the links work even
// where the env var hasn't been set; override per environment to point a staging
// build at its own copy.
const LEGAL_SITE_URL = (
  import.meta.env.VITE_PUBLIC_SITE_URL || "https://serpentora.com"
).replace(/\/+$/, "");

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
  // Only pricing is public; root "/" requires auth so the welcome screen
  // always shows on first visit.
  if (path.startsWith("/pricing")) return "public";
  return getAuthScopeForHash(hashValue);
};
const ROLE_OPTIONS_FALLBACK = [
  { value: "breeder", label: "Breeder" },
  { value: "buyer", label: "Buyer" },
];

// Buyer accounts belong to the marketplace, which is a separate deploy. This app
// refuses them at sign-in, so a buyer is sent there before an account exists
// rather than after they have verified one they cannot use here.
const MARKETPLACE_URL = (
  import.meta.env.VITE_MARKETPLACE_URL || "https://albertbit-cyber.github.io/Breeding-planner/"
).replace(/\/+$/, "/");

const DEFAULT_REGISTRATION_TEMPLATE = {
  fullName: "",
  email: "",
  password: "",
  consentDataProcessing: false,
  acceptTerms: false,
  role: "breeder",
};

const createDefaultRegistrationData = () =>
  JSON.parse(JSON.stringify(DEFAULT_REGISTRATION_TEMPLATE));

const createDefaultPasswordRecoveryData = (email = "") => ({ email });

/**
 * Registration is one screen: the four things the backend actually stores, plus the
 * two consents. It used to be four steps whose preferences and keeper-profile answers
 * were never sent anywhere, which is effort asked for and thrown away.
 */
const buildRegistrationSteps = (t, optionSets = {}) => {
  const roleOptions = (Array.isArray(optionSets.roleOptions) && optionSets.roleOptions.length
    ? optionSets.roleOptions
    : ROLE_OPTIONS_FALLBACK
  ).filter((option) => ["breeder", "buyer"].includes(String(option?.value || option || "").trim().toLowerCase()));
  const roleOptionValues = new Set(roleOptions.map((option) => String(option?.value || option || "").trim().toLowerCase()));
  if (!roleOptionValues.has("buyer")) {
    roleOptions.push({ value: "buyer", label: "Buyer" });
  }
  if (!roleOptionValues.has("breeder")) {
    roleOptions.unshift({ value: "breeder", label: "Breeder" });
  }

  return [
    {
      key: "account",
      title: t("auth:register.title", { defaultValue: "Create your account" }),
      description: t("auth:register.description", {
        defaultValue: "Four fields. Your collection comes next.",
      }),
      fields: [
        {
          name: "fullName",
          label: t("auth:fields.fullName", { defaultValue: "Full name" }),
          type: "text",
          autoComplete: "name",
          required: true,
        },
        {
          name: "email",
          label: t("auth:fields.email", { defaultValue: "Email address" }),
          type: "email",
          autoComplete: "email",
          required: true,
        },
        {
          name: "password",
          label: t("auth:fields.passwordWithHint", { defaultValue: "Password (8+ characters)" }),
          type: "password",
          autoComplete: "new-password",
          required: true,
        },
        {
          name: "role",
          label: t("auth:fields.userRole", { defaultValue: "User role" }),
          type: "select",
          options: roleOptions,
          required: true,
        },
        {
          name: "consentDataProcessing",
          label: t("auth:fields.consentDataProcessing", {
            defaultValue: "I consent to data processing for sync & backup services.",
          }),
          type: "checkbox",
          required: true,
          shouldDisplay: (data) => data.role !== "buyer",
        },
        {
          name: "acceptTerms",
          // Rendered as a node rather than a plain string so the two documents are
          // actually reachable from the consent checkbox. Asking someone to agree
          // to terms they have no way to open is the gap the readiness audit
          // flagged; the translated strings stay translatable around the links.
          label: (
            <>
              {t("auth:fields.acceptTermsPrefix", { defaultValue: "I agree to the" })}{" "}
              <a href={`${LEGAL_SITE_URL}/terms`} target="_blank" rel="noopener noreferrer">
                {t("auth:fields.termsOfService", { defaultValue: "Terms of Service" })}
              </a>{" "}
              {t("auth:common.and", { defaultValue: "and" })}{" "}
              <a href={`${LEGAL_SITE_URL}/privacy`} target="_blank" rel="noopener noreferrer">
                {t("auth:fields.privacyPolicy", { defaultValue: "Privacy Policy" })}
              </a>
              .
            </>
          ),
          type: "checkbox",
          required: true,
          shouldDisplay: (data) => data.role !== "buyer",
        },
      ],
      validate: (data) => {
        if (data.password.trim().length < 8) {
          return t("auth:errors.passwordLength", {
            defaultValue: "Choose a password with at least 8 characters.",
          });
        }
        return null;
      },
    },
  ];
};

const logoSrc = `${process.env.PUBLIC_URL || ""}/app-icons/icon_512x512.png`;

const loadStoredAuth = (scope = "breeder") => {
  if (scope === "public") return { isAuthenticated: false };
  const storageKey = AUTH_SESSION_STORAGE_KEYS[scope] || AUTH_SESSION_STORAGE_KEYS.breeder;
  try {
    const raw = localStorage.getItem(storageKey) || (scope === "breeder" ? localStorage.getItem(LEGACY_AUTH_STORAGE_KEY) : "");
    if (!raw) return { isAuthenticated: false };
    const parsed = JSON.parse(raw);
    if (parsed?.isAuthenticated) {
      // A session stored by an older build could hold any role — a laboratory
      // account, say, which this app has nothing to show. Evicting it here is
      // what stops a reload from restoring a portal the account cannot use.
      if (!canRoleUsePortal(parsed?.role || parsed?.profile?.role, scope)) {
        try {
          localStorage.removeItem(storageKey);
          if (scope === "breeder") localStorage.removeItem(LEGACY_AUTH_STORAGE_KEY);
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

const hasValue = (value) => {
  if (typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (value === 0) return true;
  return Boolean(String(value ?? "").trim());
};

const normalizeIdentifier = (value) => String(value ?? "").trim().toLowerCase();

export default function AuthGate({ children }) {
  const { t, i18n } = useTranslation();
  const { snapshot, retry } = useSharedBackend();
  const [authScope, setAuthScope] = useState(() => getAuthSurfaceForHash(window?.location?.hash));
  const [authState, setAuthState] = useState(() => loadStoredAuth(authScope));
  const [view, setView] = useState("chooser");
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
  const [resendVerificationEmail, setResendVerificationEmail] = useState("");
  const [resendVerificationSent, setResendVerificationSent] = useState(false);
  const [resendVerificationError, setResendVerificationError] = useState("");
  const [resendVerificationBusy, setResendVerificationBusy] = useState(false);
  // Set right after a successful registration, before any session exists — registration isn't
  // "done" until the user clicks the emailed link, so no login/persistAuth happens until then.
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState("");
  // False when the account was created but the backend could not queue the
  // verification mail. Telling the user to check an inbox that will stay empty
  // is the difference between a 10-second retry and a lost signup.
  const [verificationEmailQueued, setVerificationEmailQueued] = useState(true);
  const [registrationData, setRegistrationData] = useState(
    createDefaultRegistrationData(),
  );
  const [registrationError, setRegistrationError] = useState("");
  const registrationSteps = useMemo(() => {
    const roleOptions = t("auth:options.roles", {
      returnObjects: true,
      defaultValue: ROLE_OPTIONS_FALLBACK,
    });

    return buildRegistrationSteps(t, { roleOptions });
  }, [t, i18n.language]);

  const currentStep = registrationSteps[0];

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
          setLinkFlowResult({ status: "success", message: result?.message || t("auth:verifyEmail.success", { defaultValue: "Your email address is verified." }) });
        } else if (linkFlow.type === "confirm-email-change") {
          const result = await confirmEmailChangeApi({ token: linkFlow.token });
          if (cancelled) return;
          setLinkFlowResult({ status: "success", message: result?.message || t("auth:confirmEmailChange.success", { defaultValue: "Your new email address is confirmed." }) });
        }
      } catch (error) {
        if (cancelled) return;
        setLinkFlowResult({
          status: "error",
          message: error instanceof Error ? error.message : t("auth:linkFlow.error", { defaultValue: "This link is invalid or has expired." }),
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
    setView("chooser");
    setLoginError("");
    setLoginMessage("");
    setIsRecoveringPassword(false);
    setIsResendingVerification(false);
    setPendingVerificationEmail("");
    setPasswordRecoveryError("");
    setPasswordRecoveryData(createDefaultPasswordRecoveryData());
    setRegistrationData(createDefaultRegistrationData());
  }, [authScope, persistAuth]);

  useEffect(() => {
    if (!authState.isAuthenticated || snapshot.state !== "unauthorized") {
      return;
    }

    if (authScope !== "public") clearAuthToken(authScope);
    persistAuth({ isAuthenticated: false });
    setView("login");
    setIsRecoveringPassword(false);
    setIsResendingVerification(false);
    setLoginValues((prev) => ({
      username: authState.profile?.email || prev.username || "",
      password: "",
    }));
    setLoginError(
      t("auth:sharedBackend.sessionExpiredMessage", {
        defaultValue: "Your shared backend session expired. Sign in again.",
      })
    );
    setLoginMessage("");
    setPasswordRecoveryError("");
    setPasswordRecoveryData(createDefaultPasswordRecoveryData(authState.profile?.email || ""));
    setRegistrationData(createDefaultRegistrationData());
    setRegistrationError("");
  }, [authScope, authState.isAuthenticated, authState.profile?.email, persistAuth, snapshot.state, t]);

  const handleLoginSubmit = async (event) => {
    event.preventDefault();
    setLoginError("");
    setLoginMessage("");
    const { username, password } = loginValues;
    if (!username.trim() || !password.trim()) {
      setLoginError(t("auth:errors.missingCredentials", { defaultValue: "Enter both username and password." }));
      return;
    }
    try {
      const normalizedInput = normalizeIdentifier(username);
      const loginEmail = String(normalizedInput.includes("@") ? normalizedInput : "").trim();

      if (!loginEmail) {
        setLoginError(t("auth:errors.emailRequired", { defaultValue: "Use your account email address to sign in." }));
        return;
      }

      const portal = authScope === "public" ? "breeder" : authScope;
      const response = await loginApi(
        { email: loginEmail, password: String(password || ""), portal },
        portal
      );
      const backendUser = response?.user || {};
      const backendRole = String((backendUser && backendUser.role) || "breeder").trim().toLowerCase();
      const appRole = normalizeRole(backendRole) || "breeder";

      // The backend already refuses these credentials; checked again because the
      // whole defect this fixes was a session that existed on the client alone.
      if (!canRoleUsePortal(appRole, portal)) {
        clearAuthToken(portal);
        setLoginError(portalRejectionMessage(appRole, portal));
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
      setLoginError(error instanceof Error ? error.message : t("auth:errors.badPassword", { defaultValue: "Login failed." }));
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
      setPasswordRecoveryError(t("auth:errors.accountEmailRequired", {
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
          : t("auth:recovery.error", { defaultValue: "Something went wrong. Please try again." })
      );
    }
  };

  const handleResetPasswordSubmit = async (event) => {
    event.preventDefault();
    setResetPasswordError("");
    const { newPassword, confirmPassword } = resetPasswordValues;
    if (newPassword.trim().length < 8) {
      setResetPasswordError(t("auth:errors.passwordLength", { defaultValue: "Choose a password with at least 8 characters." }));
      return;
    }
    if (newPassword !== confirmPassword) {
      setResetPasswordError(t("auth:errors.passwordMismatch", { defaultValue: "Passwords do not match." }));
      return;
    }
    try {
      await resetPasswordApi({ token: linkFlow.token, newPassword });
      setResetPasswordDone(true);
    } catch (error) {
      setResetPasswordError(
        error instanceof Error ? error.message : t("auth:resetPassword.error", { defaultValue: "This link is invalid or has expired." })
      );
    }
  };

  const openResendVerification = (prefillEmail = "") => {
    setIsResendingVerification(true);
    setIsRecoveringPassword(false);
    setResendVerificationEmail(prefillEmail);
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
    const email = normalizeIdentifier(resendVerificationEmail);
    if (!email || !email.includes("@")) {
      setResendVerificationError(t("auth:errors.accountEmailRequired", { defaultValue: "Enter the email address on your account." }));
      return;
    }
    setResendVerificationBusy(true);
    try {
      await resendVerificationApi({ email });
      setResendVerificationSent(true);
    } catch (error) {
      setResendVerificationError(
        error instanceof Error ? error.message : t("auth:recovery.error", { defaultValue: "Something went wrong. Please try again." })
      );
    } finally {
      setResendVerificationBusy(false);
    }
  };

  const handleRegistrationChange = (name, value) => {
    setRegistrationData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const isBuyerRegistration = registrationData.role === "buyer";

  const handleRegistrationStepSubmit = async (event) => {
    event.preventDefault();
    setRegistrationError("");
    // A buyer account is made on the marketplace; the form offers the link instead of a submit.
    if (isBuyerRegistration) return;
    const missingField = currentStep.fields.find((field) => {
      if (field.shouldDisplay && !field.shouldDisplay(registrationData)) {
        return false;
      }
      const required =
        typeof field.required === "function"
          ? field.required(registrationData)
          : field.required;
      if (!required) return false;
      const value = registrationData[field.name];
      return !hasValue(value);
    });

    if (missingField) {
      // The terms label is a node with links in it, so it cannot be quoted back as text.
      setRegistrationError(missingField.type === "checkbox"
        ? t("auth:errors.consentRequired", { defaultValue: "Tick both consent boxes to create your account." })
        : t("auth:errors.requiredField", { defaultValue: 'Please complete "{{field}}".', field: missingField.label }));
      return;
    }

    if (currentStep.validate) {
      const error = currentStep.validate(registrationData);
      if (error) {
        setRegistrationError(error);
        return;
      }
    }

    const desiredEmail = registrationData.email.trim();
    const desiredFullName = registrationData.fullName.trim();

    try {
      const registration = await registerApi({
        fullName: desiredFullName || registrationData.fullName,
        email: desiredEmail,
        password: registrationData.password,
        role: "breeder",
      });

      // Registration isn't complete until the emailed link is clicked — no session is
      // created here. Show the "check your inbox" card instead of logging the user in.
      setResendVerificationSent(false);
      setResendVerificationError("");
      // Older backends do not report this; absence means "assume it was sent".
      setVerificationEmailQueued(registration?.user?.verificationEmailQueued !== false);
      setPendingVerificationEmail(desiredEmail);
    } catch (error) {
      setRegistrationError(error instanceof Error ? error.message : "Registration failed.");
    }
  };

  const resetRegistration = () => {
    setRegistrationError("");
    setRegistrationData(createDefaultRegistrationData());
  };

  const renderField = (field) => {
    if (field.shouldDisplay && !field.shouldDisplay(registrationData)) {
      return null;
    }
    const value = registrationData[field.name];
    const label = (
      <span className="auth-field-label">
        {field.label}
        {typeof field.required === "function"
          ? field.required(registrationData) && <span className="required">*</span>
          : field.required && <span className="required">*</span>}
      </span>
    );

    switch (field.type) {
      case "checkbox":
        return (
          <label key={field.name} className="auth-field auth-field-checkbox">
            <input
              type="checkbox"
              checked={Boolean(value)}
              onChange={(e) =>
                handleRegistrationChange(field.name, e.target.checked)
              }
            />
            <span>{field.label}</span>
          </label>
        );
      case "textarea":
        return (
          <label key={field.name} className="auth-field">
            {label}
            <textarea
              value={value}
              rows={3}
              onChange={(e) =>
                handleRegistrationChange(field.name, e.target.value)
              }
            />
          </label>
        );
      case "select":
        return (
          <label key={field.name} className="auth-field">
            {label}
            <select
              value={value}
              onChange={(e) =>
                handleRegistrationChange(field.name, e.target.value)
              }
            >
              <option value="">{t("common.selectOption", { defaultValue: "Select an option" })}</option>
              {field.options.map((option) => (
                <option
                  key={option.value || option}
                  value={option.value || option}
                >
                  {option.label || option}
                </option>
              ))}
            </select>
          </label>
        );
      default:
        return (
          <label key={field.name} className="auth-field">
            {label}
            <input
              type={field.type || "text"}
              autoComplete={field.autoComplete}
              value={value}
              onChange={(e) =>
                handleRegistrationChange(field.name, e.target.value)
              }
            />
          </label>
        );
    }
  };

  const loginCard = (
    <div className="auth-card">
      <div className="auth-card-brand">
        <img src={logoSrc} alt={t("auth:logoAlt", { defaultValue: "Serpentora logo" })} className="auth-logo" />
        <h1 className="auth-card-title">{t("auth:title", { defaultValue: "Serpentora" })}</h1>
        <p className="auth-card-tagline">
          {t("auth:tagline", { defaultValue: "Complete Reptile Management App" })}
        </p>
      </div>
      <p className="auth-subtitle">
        {t("auth:subtitle", {
          defaultValue:
            "Keep your reptiles synced across desktop and mobile with one secure account.",
        })}
      </p>
      <div className="auth-primary-actions">
        <button
          type="button"
          className={`primary ${view === "register" ? "is-active" : ""}`}
          onClick={() => {
            setView("register");
            setIsRecoveringPassword(false);
            setIsResendingVerification(false);
            resetRegistration();
          }}
        >
          {t("auth:actions.register", { defaultValue: "Register" })}
        </button>
        <button
          type="button"
          className={`ghost ${view === "login" ? "is-active" : ""}`}
          onClick={() => {
            setView("login");
            setIsRecoveringPassword(false);
            setIsResendingVerification(false);
            setPasswordRecoveryError("");
          }}
        >
          {t("auth:actions.login", { defaultValue: "Log in" })}
        </button>
      </div>
      {view === "login" && (
          isRecoveringPassword ? (
            <form className="auth-login-form" onSubmit={handlePasswordRecoverySubmit}>
              {recoveryEmailSent ? (
                <p className="auth-helper-copy">
                  {t("auth:recovery.emailSent", {
                    defaultValue: "Check your email — we sent a reset link. It expires in 1 hour.",
                  })}
                </p>
              ) : (
                <>
                  <p className="auth-helper-copy">
                    {t("auth:recovery.instructions", {
                      defaultValue: "Enter your account email and we'll send you a reset link.",
                    })}
                  </p>
                  <label className="auth-field">
                    <span className="auth-field-label">
                      {t("auth:fields.email", { defaultValue: "Email address" })}
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
                    {t("auth:actions.sendResetLink", { defaultValue: "Send reset link" })}
                  </button>
                </>
              )}
              <div className="auth-secondary-action">
                <button type="button" className="text-button" onClick={closePasswordRecovery}>
                  {t("auth:actions.backToLogin", { defaultValue: "Back to login" })}
                </button>
              </div>
            </form>
          ) : isResendingVerification ? (
            <form className="auth-login-form" onSubmit={handleResendVerificationSubmit}>
              {resendVerificationSent ? (
                <p className="auth-helper-copy">
                  {t("auth:resendVerification.sent", {
                    defaultValue: "If that email is registered and unverified, a new verification link has been sent. Check your inbox (and spam folder).",
                  })}
                </p>
              ) : (
                <>
                  <p className="auth-helper-copy">
                    {t("auth:resendVerification.instructions", {
                      defaultValue: "Enter your account email and we'll send a new verification link.",
                    })}
                  </p>
                  <label className="auth-field">
                    <span className="auth-field-label">
                      {t("auth:fields.email", { defaultValue: "Email address" })}
                    </span>
                    <input
                      type="email"
                      value={resendVerificationEmail}
                      onChange={(e) => setResendVerificationEmail(e.target.value)}
                      autoComplete="email"
                    />
                  </label>
                  {resendVerificationError && <p className="auth-error">{resendVerificationError}</p>}
                  <button type="submit" className="primary wide" disabled={resendVerificationBusy}>
                    {resendVerificationBusy
                      ? t("common.sending", { defaultValue: "Sending..." })
                      : t("auth:actions.resendVerification", { defaultValue: "Resend verification email" })}
                  </button>
                </>
              )}
              <div className="auth-secondary-action">
                <button type="button" className="text-button" onClick={closeResendVerification}>
                  {t("auth:actions.backToLogin", { defaultValue: "Back to login" })}
                </button>
              </div>
            </form>
          ) : (
            <form className="auth-login-form" onSubmit={handleLoginSubmit}>
              <label className="auth-field">
                <span className="auth-field-label">
                  {t("auth:fields.email", { defaultValue: "Email address" })}
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
                  {t("auth:fields.password", { defaultValue: "Password" })}
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
                  {t("auth:actions.forgotPassword", { defaultValue: "Forgot password?" })}
                </button>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => openResendVerification(normalizeIdentifier(loginValues.username).includes("@") ? loginValues.username : "")}
                >
                  {t("auth:actions.resendVerificationLink", { defaultValue: "Resend verification email" })}
                </button>
              </div>
              {loginMessage && <p className="auth-success">{loginMessage}</p>}
              {loginError && <p className="auth-error">{loginError}</p>}
              <button type="submit" className="primary wide">
                {t("common.continue", { defaultValue: "Continue" })}
              </button>
            </form>
          )
        )}
    </div>
  );

  const registrationCard = (
    <div className="auth-card registration-card">
      <div className="auth-card-header">
        <button type="button" className="text-button" onClick={() => setView("chooser")}>
          {t("common.back", { defaultValue: "Back" })}
        </button>
      </div>
      <h2>{currentStep.title}</h2>
      <p className="auth-subtitle">{currentStep.description}</p>
      <form className="auth-registration-form" onSubmit={handleRegistrationStepSubmit}>
        {currentStep.fields.map((field) => renderField(field))}
        {isBuyerRegistration && (
          <p className="auth-helper-copy" role="status">
            {t("auth:register.buyerElsewhere", {
              defaultValue: "Buyer accounts live on the Serpentora Marketplace, not in this breeder app. Create yours there; this form won't make one.",
            })}
          </p>
        )}
        {registrationError && <p className="auth-error">{registrationError}</p>}
        <div className="auth-registration-actions">
          {isBuyerRegistration ? (
            <a className="primary" href={MARKETPLACE_URL} target="_blank" rel="noopener noreferrer">
              {t("auth:actions.goToMarketplace", { defaultValue: "Go to the Marketplace" })}
            </a>
          ) : (
            <button type="submit" className="primary">
              {t("auth:actions.createAccount", { defaultValue: "Create account" })}
            </button>
          )}
        </div>
      </form>
    </div>
  );

  // Who is signed in, for the account menu in the app's top bar (features/auth/AccountMenu).
  const account = useMemo(
    () => (authState.isAuthenticated ? { profile: authState.profile || null, signOut: handleLogout } : null),
    [authState.isAuthenticated, authState.profile, handleLogout],
  );

  const maskEmailForDisplay = (email) => {
    const [local, domain] = String(email || "").split("@");
    if (!domain) return email || "";
    const visible = local.slice(0, 2);
    return `${visible}${"*".repeat(Math.max(local.length - visible.length, 1))}@${domain}`;
  };

  const linkFlowCard = linkFlow ? (
    <div className="auth-card">
      <div className="auth-card-brand">
        <img src={logoSrc} alt={t("auth:logoAlt", { defaultValue: "Serpentora logo" })} className="auth-logo" />
        <h1 className="auth-card-title">{t("auth:title", { defaultValue: "Serpentora" })}</h1>
      </div>
      {linkFlow.type === "reset-password" ? (
        resetPasswordDone ? (
          <>
            <p className="auth-helper-copy">
              {t("auth:resetPassword.success", { defaultValue: "Your password has been updated. You can now sign in with your new password." })}
            </p>
            <button type="button" className="primary wide" onClick={() => { window.location.href = "/"; }}>
              {t("auth:actions.backToLogin", { defaultValue: "Back to login" })}
            </button>
          </>
        ) : (
          <form className="auth-login-form" onSubmit={handleResetPasswordSubmit}>
            <p className="auth-helper-copy">
              {t("auth:resetPassword.instructions", { defaultValue: "Choose a new password for your account." })}
            </p>
            <label className="auth-field">
              <span className="auth-field-label">{t("auth:fields.newPassword", { defaultValue: "New password" })}</span>
              <input
                type="password"
                value={resetPasswordValues.newPassword}
                onChange={(e) => setResetPasswordValues((prev) => ({ ...prev, newPassword: e.target.value }))}
                autoComplete="new-password"
              />
            </label>
            <label className="auth-field">
              <span className="auth-field-label">{t("auth:fields.confirmPassword", { defaultValue: "Confirm password" })}</span>
              <input
                type="password"
                value={resetPasswordValues.confirmPassword}
                onChange={(e) => setResetPasswordValues((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                autoComplete="new-password"
              />
            </label>
            {resetPasswordError && <p className="auth-error">{resetPasswordError}</p>}
            <button type="submit" className="primary wide">
              {t("auth:actions.setNewPassword", { defaultValue: "Set new password" })}
            </button>
          </form>
        )
      ) : (
        <>
          <p className={linkFlowResult.status === "error" ? "auth-error" : "auth-helper-copy"}>
            {linkFlowResult.status === "pending"
              ? t("auth:linkFlow.working", { defaultValue: "Working..." })
              : linkFlowResult.message}
          </p>
          {linkFlowResult.status !== "pending" && (
            <button type="button" className="primary wide" onClick={() => { window.location.href = "/"; }}>
              {t("auth:actions.backToLogin", { defaultValue: "Back to login" })}
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
        <img src={logoSrc} alt={t("auth:logoAlt", { defaultValue: "Serpentora logo" })} className="auth-logo" />
        <h1 className="auth-card-title">{t("auth:unverified.title", { defaultValue: "Verify your email address" })}</h1>
      </div>
      <p className="auth-subtitle">
        {t("auth:unverified.description", {
          defaultValue: "Your email address ({{email}}) has not been verified yet. Check your inbox for the verification link, or request a new one.",
          email: maskEmailForDisplay(authState.profile?.email),
        })}
      </p>
      {resendVerificationSent ? (
        <p className="auth-helper-copy">
          {t("auth:resendVerification.sent", {
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
                setResendVerificationError(error instanceof Error ? error.message : t("auth:recovery.error", { defaultValue: "Something went wrong. Please try again." }));
              } finally {
                setResendVerificationBusy(false);
              }
            }}
          >
            {resendVerificationBusy
              ? t("common.sending", { defaultValue: "Sending..." })
              : t("auth:actions.resendVerification", { defaultValue: "Resend verification email" })}
          </button>
        </>
      )}
      <div className="auth-secondary-action">
        <button type="button" className="text-button" onClick={handleLogout}>
          {t("auth:actions.signOut", { defaultValue: "Sign out" })}
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
        <img src={logoSrc} alt={t("auth:logoAlt", { defaultValue: "Serpentora logo" })} className="auth-logo" />
        <h1 className="auth-card-title">{t("auth:pendingVerification.title", { defaultValue: "Check your inbox" })}</h1>
      </div>
      <p className="auth-subtitle">
        {verificationEmailQueued
          ? t("auth:pendingVerification.description", {
              defaultValue: "We sent a verification link to {{email}}. Click it to finish creating your account, then sign in below.",
              email: maskEmailForDisplay(pendingVerificationEmail),
            })
          : t("auth:pendingVerification.notSent", {
              defaultValue:
                "Your account was created, but we could not send the verification link to {{email}} just now. Use the button below to try again.",
              email: maskEmailForDisplay(pendingVerificationEmail),
            })}
      </p>
      {resendVerificationSent ? (
        <p className="auth-helper-copy">
          {t("auth:resendVerification.sent", {
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
                setResendVerificationError(error instanceof Error ? error.message : t("auth:recovery.error", { defaultValue: "Something went wrong. Please try again." }));
              } finally {
                setResendVerificationBusy(false);
              }
            }}
          >
            {resendVerificationBusy
              ? t("common.sending", { defaultValue: "Sending..." })
              : t("auth:actions.resendVerification", { defaultValue: "Resend verification email" })}
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
          {t("auth:actions.backToLogin", { defaultValue: "Back to login" })}
        </button>
      </div>
    </div>
  ) : null;

  const overlayActive = Boolean(linkFlow) || unverifiedGateActive || Boolean(pendingVerificationEmail) || (authScope !== "public" && !authState.isAuthenticated);
  const showBackendBlocker = !linkFlow && !unverifiedGateActive && !pendingVerificationEmail && authScope !== "public" && !authState.isAuthenticated && snapshot.state !== "connected" && snapshot.state !== "unauthorized";

  return (
    <div className="auth-shell">
      <div className={`auth-shell__app ${overlayActive ? "is-blurred" : ""}`}>
        <AccountContext.Provider value={account}>
          {!overlayActive ? children : null}
        </AccountContext.Provider>
      </div>
      {overlayActive && (
        <div className="auth-overlay">
          {showBackendBlocker ? (
            <div className="auth-card">
              <div className="auth-card-brand">
                <img src={logoSrc} alt={t("auth:logoAlt", { defaultValue: "Serpentora logo" })} className="auth-logo" />
                <h1 className="auth-card-title">
                  {!import.meta.env.DEV
                    ? t("auth:sharedBackend.offlineTitle", { defaultValue: "Can't connect right now" })
                    : snapshot.state === "config-error"
                      ? t("auth:sharedBackend.configTitle", { defaultValue: "Shared backend configuration error" })
                      : snapshot.state === "unauthorized"
                        ? t("auth:sharedBackend.unauthorizedTitle", { defaultValue: "Shared backend session expired" })
                        : t("auth:sharedBackend.unavailableTitle", { defaultValue: "Shared backend unavailable" })}
                </h1>
              </div>
              {/* Backend diagnostics are for developers; users get one plain sentence. */}
              {import.meta.env.DEV ? (
                <>
                  <p className="auth-subtitle">{snapshot.message}</p>
                  <div className="text-xs text-neutral-500">
                    Cross-computer sync requires a running backend server, a shared database, the same VITE_API_URL in both apps, valid authentication, and network reachability from each device.
                  </div>
                  {Array.isArray(snapshot.config.warnings) && snapshot.config.warnings.length ? (
                    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                      {snapshot.config.warnings.join(" ")}
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="auth-subtitle">
                  {t("auth:sharedBackend.offlineMessage", {
                    defaultValue: "Serpentora can't reach its server. Check your internet connection and try again.",
                  })}
                </p>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" className="primary" onClick={retry}>
                  {t("common.retry", { defaultValue: "Retry" })}
                </button>
              </div>
            </div>
          ) : linkFlow ? linkFlowCard : unverifiedGateActive ? unverifiedGateCard : pendingVerificationEmail ? pendingVerificationCard : view === "register" ? registrationCard : loginCard}
        </div>
      )}
    </div>
  );
}

