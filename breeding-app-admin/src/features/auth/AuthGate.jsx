import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { clearAuthToken, getAuthScopeForHash, hasStoredAuthSession, login as loginApi, recoverPassword as recoverPasswordApi, register as registerApi } from "../../shared/apiClient";
import { useSharedBackend } from "../../contexts/SharedBackendContext.jsx";

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

const createDefaultPasswordRecoveryData = (email = "") => ({
  email,
  fullName: "",
  newPassword: "",
  confirmNewPassword: "",
});

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
        defaultValue: "Tell us how you want to use Breeding Planner.",
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

const LANGUAGE_OPTIONS = [
  { code: "en", label: "English" },
  { code: "he", label: "עברית" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "it", label: "Italiano" },
  { code: "nl", label: "Nederlands" },
  { code: "pl", label: "Polski" },
  { code: "pt", label: "Português" },
  { code: "cs", label: "Čeština" },
];

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
    setAuthState(loadStoredAuth(authScope));
    setView("chooser");
    setLoginError("");
    setLoginMessage("");
    setIsRecoveringPassword(false);
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
    setView("chooser");
    setIsRecoveringPassword(false);
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
    setLoginError("");
    setLoginMessage("");
    setPasswordRecoveryError("");
    setPasswordRecoveryData(createDefaultPasswordRecoveryData(recoveryEmail));
  };

  const closePasswordRecovery = () => {
    setIsRecoveringPassword(false);
    setPasswordRecoveryError("");
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
    setLoginMessage("");

    const recoveryEmail = normalizeIdentifier(passwordRecoveryData.email);
    const recoveryFullName = String(passwordRecoveryData.fullName || "").trim();
    const recoveryPassword = String(passwordRecoveryData.newPassword || "");
    const recoveryConfirmPassword = String(passwordRecoveryData.confirmNewPassword || "");

    if (!recoveryEmail || !recoveryEmail.includes("@")) {
      setPasswordRecoveryError(t("auth.errors.emailRequired", {
        defaultValue: "Use the account email address for password recovery.",
      }));
      return;
    }

    if (!recoveryFullName) {
      setPasswordRecoveryError(t("auth.errors.requiredField", {
        defaultValue: 'Please complete "{{field}}".',
        field: t("auth.fields.fullName", { defaultValue: "Full name" }),
      }));
      return;
    }

    if (recoveryPassword.trim().length < 8) {
      setPasswordRecoveryError(t("auth.errors.passwordLength", {
        defaultValue: "Choose a password with at least 8 characters.",
      }));
      return;
    }

    if (recoveryPassword !== recoveryConfirmPassword) {
      setPasswordRecoveryError(t("auth.errors.passwordMismatch", {
        defaultValue: "Passwords do not match.",
      }));
      return;
    }

    try {
      const result = await recoverPasswordApi({
        email: recoveryEmail,
        fullName: recoveryFullName,
        newPassword: recoveryPassword,
      });

      setIsRecoveringPassword(false);
      setPasswordRecoveryData(createDefaultPasswordRecoveryData(recoveryEmail));
      setLoginValues({
        username: recoveryEmail,
        password: "",
      });
      setLoginMessage(String(result?.message || t("auth.recovery.success", {
        defaultValue: "Password updated. Sign in with your new password.",
      })));
    } catch (error) {
      setPasswordRecoveryError(
        error instanceof Error
          ? error.message
          : t("auth.recovery.error", {
              defaultValue: "Password recovery failed.",
            })
      );
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

  const activeRole = String(authState?.role || authState?.profile?.role || "").trim().toLowerCase();
  const canOpenLabApp = activeRole === "lab_staff" || activeRole === "admin";
  const canOpenMarketplace = Boolean(activeRole);

  const openLabApp = () => {
    if (typeof window === "undefined") return;
    window.location.hash = "/lab/dashboard";
  };

  const openMarketplace = () => {
    if (typeof window === "undefined") return;
    window.location.hash = "/marketplace";
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
        <img src={logoSrc} alt={t("auth.logoAlt", { defaultValue: "Breeding Planner logo" })} className="auth-logo" />
        <h1 className="auth-card-title">{t("auth.title", { defaultValue: "Breeding Planner" })}</h1>
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
            resetRegistration();
          }}
        >
          {t("auth.actions.register", { defaultValue: "Register" })}
        </button>
        <button
          type="button"
          className={`ghost ${view === "login" ? "is-active" : ""}`}
          onClick={() => {
            setView("chooser");
            setIsRecoveringPassword(false);
            setPasswordRecoveryError("");
          }}
        >
          {t("auth.actions.login", { defaultValue: "Log in" })}
        </button>
      </div>
      {view === "login" && (
          isRecoveringPassword ? (
            <form className="auth-login-form" onSubmit={handlePasswordRecoverySubmit}>
              <p className="auth-helper-copy">
                {t("auth.recovery.instructions", {
                  defaultValue: "Enter the email and full name on the account, then choose a new password.",
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
                />
              </label>
              <label className="auth-field">
                <span className="auth-field-label">
                  {t("auth.fields.fullName", { defaultValue: "Full name" })}
                </span>
                <input
                  type="text"
                  value={passwordRecoveryData.fullName}
                  onChange={(e) => handlePasswordRecoveryChange("fullName", e.target.value)}
                />
              </label>
              <label className="auth-field">
                <span className="auth-field-label">
                  {t("auth.recovery.newPassword", { defaultValue: "New password" })}
                </span>
                <input
                  type="password"
                  value={passwordRecoveryData.newPassword}
                  onChange={(e) => handlePasswordRecoveryChange("newPassword", e.target.value)}
                />
              </label>
              <label className="auth-field">
                <span className="auth-field-label">
                  {t("auth.recovery.confirmNewPassword", { defaultValue: "Confirm new password" })}
                </span>
                <input
                  type="password"
                  value={passwordRecoveryData.confirmNewPassword}
                  onChange={(e) => handlePasswordRecoveryChange("confirmNewPassword", e.target.value)}
                />
              </label>
              {passwordRecoveryError && <p className="auth-error">{passwordRecoveryError}</p>}
              <button type="submit" className="primary wide">
                {t("auth.actions.resetPassword", { defaultValue: "Reset password" })}
              </button>
              <div className="auth-secondary-action">
                <button type="button" className="text-button" onClick={closePasswordRecovery}>
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
      {canOpenLabApp ? (
        <button type="button" onClick={openLabApp}>
          {t("auth.actions.openLabApp", { defaultValue: "Open Lab App" })}
        </button>
      ) : null}
      {canOpenMarketplace ? (
        <button type="button" onClick={openMarketplace}>
          {t("auth.actions.openMarketplace", { defaultValue: "Marketplace" })}
        </button>
      ) : null}
      <button type="button" onClick={handleLogout}>
        {t("auth.actions.signOut", { defaultValue: "Sign out" })}
      </button>
    </div>
  ) : null;

  const overlayActive = authScope !== "public" && !authState.isAuthenticated;
  const showBackendBlocker = authScope !== "public" && !authState.isAuthenticated && snapshot.state !== "connected" && snapshot.state !== "unauthorized";

  return (
    <div className="auth-shell">
      <div className={`auth-shell__app ${overlayActive ? "is-blurred" : ""}`}>
        {authState.isAuthenticated && signedInChip}
        {children}
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
          ) : view === "register" ? registrationCard : loginCard}
        </div>
      )}
    </div>
  );
}

