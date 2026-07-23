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

/**
 * The account-lifecycle emails link back to plain paths (e.g. `${appUrl}/verify-email?token=...`),
 * not hash routes — this app has no router, so these are read from the real
 * pathname/search once on load and handled inline by AuthGate, ahead of the
 * normal login/register overlay.
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
  // Only pricing is public; root "/" requires auth so the welcome screen
  // always shows on first visit.
  if (path.startsWith("/pricing")) return "public";
  return getAuthScopeForHash(hashValue);
};
const COUNTRY_OPTIONS_FALLBACK = [
  "Afghanistan",
  "Albania",
  "Algeria",
  "Andorra",
  "Angola",
  "Antigua and Barbuda",
  "Argentina",
  "Armenia",
  "Australia",
  "Austria",
  "Azerbaijan",
  "Bahamas",
  "Bahrain",
  "Bangladesh",
  "Barbados",
  "Belarus",
  "Belgium",
  "Belize",
  "Benin",
  "Bhutan",
  "Bolivia",
  "Bosnia and Herzegovina",
  "Botswana",
  "Brazil",
  "Brunei",
  "Bulgaria",
  "Burkina Faso",
  "Burundi",
  "Cabo Verde",
  "Cambodia",
  "Cameroon",
  "Canada",
  "Central African Republic",
  "Chad",
  "Chile",
  "China",
  "Colombia",
  "Comoros",
  "Congo (Congo-Brazzaville)",
  "Costa Rica",
  "Cote d'Ivoire",
  "Croatia",
  "Cuba",
  "Cyprus",
  "Czechia",
  "Democratic Republic of the Congo",
  "Denmark",
  "Djibouti",
  "Dominica",
  "Dominican Republic",
  "Ecuador",
  "Egypt",
  "El Salvador",
  "Equatorial Guinea",
  "Eritrea",
  "Estonia",
  "Eswatini",
  "Ethiopia",
  "Fiji",
  "Finland",
  "France",
  "Gabon",
  "Gambia",
  "Georgia",
  "Germany",
  "Ghana",
  "Greece",
  "Grenada",
  "Guatemala",
  "Guinea",
  "Guinea-Bissau",
  "Guyana",
  "Haiti",
  "Holy See",
  "Honduras",
  "Hungary",
  "Iceland",
  "India",
  "Indonesia",
  "Iran",
  "Iraq",
  "Ireland",
  "Israel",
  "Italy",
  "Jamaica",
  "Japan",
  "Jordan",
  "Kazakhstan",
  "Kenya",
  "Kiribati",
  "Kuwait",
  "Kyrgyzstan",
  "Laos",
  "Latvia",
  "Lebanon",
  "Lesotho",
  "Liberia",
  "Libya",
  "Liechtenstein",
  "Lithuania",
  "Luxembourg",
  "Madagascar",
  "Malawi",
  "Malaysia",
  "Maldives",
  "Mali",
  "Malta",
  "Marshall Islands",
  "Mauritania",
  "Mauritius",
  "Mexico",
  "Micronesia",
  "Moldova",
  "Monaco",
  "Mongolia",
  "Montenegro",
  "Morocco",
  "Mozambique",
  "Myanmar",
  "Namibia",
  "Nauru",
  "Nepal",
  "Netherlands",
  "New Zealand",
  "Nicaragua",
  "Niger",
  "Nigeria",
  "North Korea",
  "North Macedonia",
  "Norway",
  "Oman",
  "Pakistan",
  "Palau",
  "Panama",
  "Papua New Guinea",
  "Paraguay",
  "Peru",
  "Philippines",
  "Poland",
  "Portugal",
  "Qatar",
  "Romania",
  "Russia",
  "Rwanda",
  "Saint Kitts and Nevis",
  "Saint Lucia",
  "Saint Vincent and the Grenadines",
  "Samoa",
  "San Marino",
  "Sao Tome and Principe",
  "Saudi Arabia",
  "Senegal",
  "Serbia",
  "Seychelles",
  "Sierra Leone",
  "Singapore",
  "Slovakia",
  "Slovenia",
  "Solomon Islands",
  "Somalia",
  "South Africa",
  "South Korea",
  "South Sudan",
  "Spain",
  "Sri Lanka",
  "Sudan",
  "Suriname",
  "Sweden",
  "Switzerland",
  "Syria",
  "Tajikistan",
  "Tanzania",
  "Thailand",
  "Timor-Leste",
  "Togo",
  "Tonga",
  "Trinidad and Tobago",
  "Tunisia",
  "Turkey",
  "Turkmenistan",
  "Tuvalu",
  "Uganda",
  "Ukraine",
  "United Arab Emirates",
  "United Kingdom",
  "United States",
  "Uruguay",
  "Uzbekistan",
  "Vanuatu",
  "Venezuela",
  "Vietnam",
  "Yemen",
  "Zambia",
  "Zimbabwe",
];
const DEVICE_OPTIONS_FALLBACK = [
  { value: "desktop", label: "Desktop only" },
  { value: "mobile", label: "Mobile only" },
  { value: "both", label: "Both desktop and mobile" },
];
const DATA_BACKUP_OPTIONS_FALLBACK = [
  { value: "automatic", label: "Automatic" },
  { value: "manual", label: "Manual" },
];
const EXPERIENCE_OPTIONS_FALLBACK = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced breeder" },
  { value: "professional", label: "Professional" },
];
const ROLE_OPTIONS_FALLBACK = [
  { value: "breeder", label: "Breeder" },
  { value: "buyer", label: "Buyer" },
];

const DEFAULT_REGISTRATION_TEMPLATE = {
  fullName: "",
  displayName: "",
  email: "",
  phone: "",
  password: "",
  confirmPassword: "",
  country: "",
  enableCloudSync: true,
  devicePreference: "both",
  dataBackupPreference: "automatic",
  reptileCount: "",
  experienceLevel: "intermediate",
  enableAutomaticReptileSync: true,
  consentDataProcessing: false,
  acceptTerms: false,
  role: "breeder",
};

const createDefaultRegistrationData = () =>
  JSON.parse(JSON.stringify(DEFAULT_REGISTRATION_TEMPLATE));

const createDefaultPasswordRecoveryData = (email = "") => ({ email });

const buildRegistrationSteps = (t, optionSets = {}) => {
  const countries = Array.isArray(optionSets.countries) && optionSets.countries.length
    ? optionSets.countries
    : COUNTRY_OPTIONS_FALLBACK;
  const devicePreferences = Array.isArray(optionSets.devicePreferences) && optionSets.devicePreferences.length
    ? optionSets.devicePreferences
    : DEVICE_OPTIONS_FALLBACK;
  const dataBackup = Array.isArray(optionSets.dataBackup) && optionSets.dataBackup.length
    ? optionSets.dataBackup
    : DATA_BACKUP_OPTIONS_FALLBACK;
  const experienceLevels = Array.isArray(optionSets.experienceLevels) && optionSets.experienceLevels.length
    ? optionSets.experienceLevels
    : EXPERIENCE_OPTIONS_FALLBACK;
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
      title: t("auth.steps.account.title", { defaultValue: "Account basics" }),
      description: t("auth.steps.account.description", {
        defaultValue: "Create your keeper profile and secure your login.",
      }),
      fields: [
        {
          name: "fullName",
          label: t("auth.fields.fullName", { defaultValue: "Full name" }),
          type: "text",
          required: true,
        },
        {
          name: "displayName",
          label: t("auth.fields.displayName", {
            defaultValue: "Preferred username / display name",
          }),
          type: "text",
          required: true,
        },
        {
          name: "email",
          label: t("auth.fields.email", { defaultValue: "Email address" }),
          type: "email",
          required: true,
        },
        {
          name: "phone",
          label: t("auth.fields.phone", { defaultValue: "Phone number (optional)" }),
          type: "tel",
        },
        {
          name: "password",
          label: t("auth.fields.password", { defaultValue: "Password" }),
          type: "password",
          required: true,
        },
        {
          name: "confirmPassword",
          label: t("auth.fields.confirmPassword", { defaultValue: "Confirm password" }),
          type: "password",
          required: true,
        },
      ],
      validate: (data) => {
        if (data.password.trim().length < 8) {
          return t("auth.errors.passwordLength", {
            defaultValue: "Choose a password with at least 8 characters.",
          });
        }
        if (data.password !== data.confirmPassword) {
          return t("auth.errors.passwordMismatch", {
            defaultValue: "Passwords do not match.",
          });
        }
        return null;
      },
    },
    {
      key: "preferences",
      title: t("auth.steps.preferences.title", { defaultValue: "Preferences" }),
      description: t("auth.steps.preferences.description", {
        defaultValue: "Tell us how you want to use Serpentora.",
      }),
      fields: [
        {
          name: "country",
          label: t("auth.fields.country", { defaultValue: "Country" }),
          type: "select",
          options: countries,
          required: true,
        },
        {
          name: "enableCloudSync",
          label: t("auth.fields.enableCloudSync", { defaultValue: "Enable cloud sync" }),
          type: "checkbox",
        },
        {
          name: "devicePreference",
          label: t("auth.fields.devicePreference", { defaultValue: "Device preference" }),
          type: "select",
          options: devicePreferences,
          required: true,
        },
        {
          name: "dataBackupPreference",
          label: t("auth.fields.dataBackupPreference", {
            defaultValue: "Data backup preference",
          }),
          type: "select",
          options: dataBackup,
          required: true,
        },
      ],
    },
    {
      key: "keeper",
      title: t("auth.steps.keeper.title", { defaultValue: "Reptile keeper profile" }),
      description: t("auth.steps.keeper.description", {
        defaultValue: "Share a bit about your collection and processes.",
      }),
      fields: [
        {
          name: "role",
          label: t("auth.fields.userRole", { defaultValue: "User role" }),
          type: "select",
          options: roleOptions,
          required: true,
        },
        {
          name: "reptileCount",
          label: t("auth.fields.reptileCount", {
            defaultValue: "How many reptiles do you currently keep?",
          }),
          type: "number",
          required: true,
        },
        {
          name: "experienceLevel",
          label: t("auth.fields.experienceLevel", { defaultValue: "Experience level" }),
          type: "select",
          options: experienceLevels,
          required: true,
        },
        {
          name: "enableAutomaticReptileSync",
          label: t("auth.fields.enableAutomaticReptileSync", {
            defaultValue: "Enable automatic reptile-data syncing",
          }),
          type: "checkbox",
        },
      ],
    },
    {
      key: "consent",
      title: t("auth.steps.consent.title", { defaultValue: "Consent & finish" }),
      description: t("auth.steps.consent.description", {
        defaultValue: "Review the legal bits so we can activate your account.",
      }),
      fields: [
        {
          name: "consentDataProcessing",
          label: t("auth.fields.consentDataProcessing", {
            defaultValue: "I consent to data processing for sync & backup services.",
          }),
          type: "checkbox",
          required: true,
        },
        {
          name: "acceptTerms",
          label: t("auth.fields.acceptTerms", {
            defaultValue: "I agree to the Terms of Service and keeper guidelines.",
          }),
          type: "checkbox",
          required: true,
        },
      ],
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
  const [registrationData, setRegistrationData] = useState(
    createDefaultRegistrationData(),
  );
  const [registerStep, setRegisterStep] = useState(0);
  const [registrationError, setRegistrationError] = useState("");
  const registrationSteps = useMemo(() => {
    const countries = t("auth.options.countries", {
      returnObjects: true,
      defaultValue: COUNTRY_OPTIONS_FALLBACK,
    });
    const devicePreferences = t("auth.options.devicePreferences", {
      returnObjects: true,
      defaultValue: DEVICE_OPTIONS_FALLBACK,
    });
    const dataBackup = t("auth.options.dataBackup", {
      returnObjects: true,
      defaultValue: DATA_BACKUP_OPTIONS_FALLBACK,
    });
    const experienceLevels = t("auth.options.experienceLevels", {
      returnObjects: true,
      defaultValue: EXPERIENCE_OPTIONS_FALLBACK,
    });
    const roleOptions = t("auth.options.roles", {
      returnObjects: true,
      defaultValue: ROLE_OPTIONS_FALLBACK,
    });

    return buildRegistrationSteps(t, {
      countries,
      devicePreferences,
      dataBackup,
      experienceLevels,
      roleOptions,
    });
  }, [t, i18n.language]);

  const currentStep = registrationSteps[registerStep] || registrationSteps[0];
  const totalSteps = registrationSteps.length || 1;

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
    setPasswordRecoveryError("");
    setPasswordRecoveryData(createDefaultPasswordRecoveryData());
    setRegisterStep(0);
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
      t("auth.sharedBackend.sessionExpiredMessage", {
        defaultValue: "Your shared backend session expired. Sign in again.",
      })
    );
    setLoginMessage("");
    setPasswordRecoveryError("");
    setPasswordRecoveryData(createDefaultPasswordRecoveryData(authState.profile?.email || ""));
    setRegisterStep(0);
    setRegistrationData(createDefaultRegistrationData());
    setRegistrationError("");
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

      const response = await loginApi({ email: loginEmail, password: String(password || "") }, authScope === "public" ? "breeder" : authScope);
      const backendUser = response?.user || {};
      const backendRole = String((backendUser && backendUser.role) || "breeder").trim().toLowerCase();
      const appRole = backendRole === "lab" ? "lab_staff" : backendRole || "breeder";

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

  const handleRegistrationChange = (name, value) => {
    setRegistrationData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleRegistrationStepSubmit = async (event) => {
    event.preventDefault();
    setRegistrationError("");
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
      setRegistrationError(t("auth.errors.requiredField", { defaultValue: 'Please complete "{{field}}".', field: missingField.label }));
      return;
    }

    if (currentStep.validate) {
      const error = currentStep.validate(registrationData);
      if (error) {
        setRegistrationError(error);
        return;
      }
    }

    if (registerStep === totalSteps - 1) {
      const desiredDisplayName = (registrationData.displayName || registrationData.fullName).trim();
      const desiredEmail = registrationData.email.trim();
      const desiredFullName = registrationData.fullName.trim();

      try {
        await registerApi({
          fullName: desiredFullName || registrationData.fullName,
          email: desiredEmail,
          password: registrationData.password,
          role: String(registrationData.role || "breeder").trim().toLowerCase() === "buyer" ? "buyer" : "breeder",
        });

        const loginResponse = await loginApi({
          email: desiredEmail,
          password: registrationData.password,
        }, authScope === "public" ? "breeder" : authScope);

        const backendUser = loginResponse?.user || {};
        const backendRole = String((backendUser && backendUser.role) || "breeder").trim().toLowerCase();
        const appRole = backendRole === "lab" ? "lab_staff" : backendRole || "breeder";

        persistAuth({
          isAuthenticated: true,
          mode: "registered",
          role: appRole,
          profile: {
            fullName: String((backendUser && backendUser.fullName) || desiredFullName),
            displayName: desiredDisplayName,
            email: String((backendUser && backendUser.email) || desiredEmail),
            reptileCount: registrationData.reptileCount,
            role: appRole,
            emailVerified: backendUser?.emailVerified !== false,
          },
          registeredAt: new Date().toISOString(),
          preferences: {
            enableCloudSync: registrationData.enableCloudSync,
            enableAutomaticReptileSync:
              registrationData.enableAutomaticReptileSync,
            devicePreference: registrationData.devicePreference,
          },
        });
      } catch (error) {
        setRegistrationError(error instanceof Error ? error.message : "Registration failed.");
      }
      return;
    }

    setRegisterStep((prev) => Math.min(prev + 1, totalSteps - 1));
  };

  const resetRegistration = () => {
    setRegisterStep(0);
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
        <img src={logoSrc} alt={t("auth.logoAlt", { defaultValue: "Serpentora logo" })} className="auth-logo" />
        <h1 className="auth-card-title">{t("auth.title", { defaultValue: "Serpentora" })}</h1>
        <p className="auth-card-tagline">
          {t("auth.tagline", { defaultValue: "Complete Reptile Management App" })}
        </p>
      </div>
      <p className="auth-subtitle">
        {t("auth.subtitle", {
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
          {t("auth.actions.register", { defaultValue: "Register" })}
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
          {t("auth.actions.login", { defaultValue: "Log in" })}
        </button>
      </div>
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
                      value={resendVerificationEmail}
                      onChange={(e) => setResendVerificationEmail(e.target.value)}
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
                  <code>admin@Serpentora.dev</code>
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

  const registrationCard = (
    <div className="auth-card registration-card">
      <div className="auth-card-header">
        <button type="button" className="text-button" onClick={() => setView("chooser")}>
          {t("common.back", { defaultValue: "Back" })}
        </button>
        <div>
          {t("auth.steps.progress", { defaultValue: "Step {{current}} of {{total}}", current: registerStep + 1, total: totalSteps, })}
        </div>
      </div>
      <h2>{currentStep.title}</h2>
      <p className="auth-subtitle">{currentStep.description}</p>
      <form className="auth-registration-form" onSubmit={handleRegistrationStepSubmit}>
        {currentStep.fields.map((field) => renderField(field))}
        {registrationError && <p className="auth-error">{registrationError}</p>}
        <div className="auth-registration-actions">
          <button
            type="button"
            className="ghost"
            disabled={registerStep === 0}
            onClick={() =>
              setRegisterStep((prev) => Math.max(0, prev - 1))
            }
          >
            {t("common.previous", { defaultValue: "Previous" })}
          </button>
          <button type="submit" className="primary">
            {registerStep === totalSteps - 1
              ? t("auth.actions.createAccount", { defaultValue: "Create account" })
              : t("common.next", { defaultValue: "Next" })}
          </button>
        </div>
      </form>
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
        <img src={logoSrc} alt={t("auth.logoAlt", { defaultValue: "Serpentora logo" })} className="auth-logo" />
        <h1 className="auth-card-title">{t("auth.title", { defaultValue: "Serpentora" })}</h1>
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
        <img src={logoSrc} alt={t("auth.logoAlt", { defaultValue: "Serpentora logo" })} className="auth-logo" />
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

  const overlayActive = Boolean(linkFlow) || unverifiedGateActive || (authScope !== "public" && !authState.isAuthenticated);
  const showBackendBlocker = !linkFlow && !unverifiedGateActive && authScope !== "public" && !authState.isAuthenticated && snapshot.state !== "connected" && snapshot.state !== "unauthorized";

  return (
    <div className="auth-shell">
      <div className={`auth-shell__app ${overlayActive ? "is-blurred" : ""}`}>
        {authState.isAuthenticated && signedInChip}
        {!overlayActive ? children : null}
      </div>
      {overlayActive && (
        <div className="auth-overlay">
          {showBackendBlocker ? (
            <div className="auth-card">
              <div className="auth-card-brand">
                <img src={logoSrc} alt={t("auth.logoAlt", { defaultValue: "Serpentora logo" })} className="auth-logo" />
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
          ) : linkFlow ? linkFlowCard : unverifiedGateActive ? unverifiedGateCard : view === "register" ? registrationCard : loginCard}
        </div>
      )}
    </div>
  );
}

