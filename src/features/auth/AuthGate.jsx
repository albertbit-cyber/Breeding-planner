import React, { useCallback, useState } from "react";

const AUTH_STORAGE_KEY = "breedingPlannerAuthSession";
const USERS_STORAGE_KEY = "breedingPlannerUsers";
const SPECIES_OPTIONS = [
  "Ball python",
  "Boa constrictor",
  "Corn snake",
  "Reticulated python",
  "Monitor lizard",
  "Gecko",
  "Other",
];
const COUNTRY_OPTIONS = [
  "United States",
  "Canada",
  "United Kingdom",
  "Germany",
  "France",
  "Spain",
  "Italy",
  "Australia",
  "New Zealand",
  "South Africa",
  "Brazil",
  "Mexico",
  "Argentina",
  "India",
  "Japan",
  "South Korea",
  "Philippines",
  "Indonesia",
  "Malaysia",
  "Thailand",
  "Singapore",
];
const DEVICE_OPTIONS = [
  { value: "desktop", label: "Desktop only" },
  { value: "mobile", label: "Mobile only" },
  { value: "both", label: "Both desktop and mobile" },
];
const EXPERIENCE_OPTIONS = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced breeder" },
  { value: "professional", label: "Professional" },
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
  speciesKept: [],
  breedsReptiles: true,
  breedingSpecies: "",
  experienceLevel: "intermediate",
  quarantineProtocol: true,
  quarantineNotes: "",
  enableAutomaticReptileSync: true,
  consentDataProcessing: false,
  acceptTerms: false,
};

const createDefaultRegistrationData = () =>
  JSON.parse(JSON.stringify(DEFAULT_REGISTRATION_TEMPLATE));

const REGISTRATION_STEPS = [
  {
    key: "account",
    title: "Account basics",
    description: "Create your keeper profile and secure your login.",
    fields: [
      { name: "fullName", label: "Full name", type: "text", required: true },
      {
        name: "displayName",
        label: "Preferred username / display name",
        type: "text",
        required: true,
      },
      { name: "email", label: "Email address", type: "email", required: true },
      { name: "phone", label: "Phone number (optional)", type: "tel" },
      {
        name: "password",
        label: "Password",
        type: "password",
        required: true,
      },
      {
        name: "confirmPassword",
        label: "Confirm password",
        type: "password",
        required: true,
      },
    ],
    validate: (data) => {
      if (data.password.trim().length < 8) {
        return "Choose a password with at least 8 characters.";
      }
      if (data.password !== data.confirmPassword) {
        return "Passwords do not match.";
      }
      return null;
    },
  },
  {
    key: "preferences",
    title: "Preferences",
    description: "Tell us how you want to use Breeding Planner.",
    fields: [
      {
        name: "country",
        label: "Country",
        type: "select",
        options: COUNTRY_OPTIONS,
        required: true,
      },
      {
        name: "enableCloudSync",
        label: "Enable cloud sync",
        type: "checkbox",
      },
      {
        name: "devicePreference",
        label: "Device preference",
        type: "select",
        options: DEVICE_OPTIONS,
        required: true,
      },
      {
        name: "dataBackupPreference",
        label: "Data backup preference",
        type: "select",
        options: [
          { value: "automatic", label: "Automatic" },
          { value: "manual", label: "Manual" },
        ],
        required: true,
      },
    ],
  },
  {
    key: "keeper",
    title: "Reptile keeper profile",
    description: "Share a bit about your collection and processes.",
    fields: [
      {
        name: "reptileCount",
        label: "How many reptiles do you currently keep?",
        type: "number",
        required: true,
      },
      {
        name: "speciesKept",
        label: "Which species do you keep?",
        type: "multiselect",
        options: SPECIES_OPTIONS,
        required: true,
      },
      {
        name: "breedsReptiles",
        label: "Do you breed reptiles?",
        type: "checkbox",
      },
      {
        name: "breedingSpecies",
        label: "Which species do you breed?",
        type: "text",
        shouldDisplay: (data) => !!data.breedsReptiles,
        required: (data) => !!data.breedsReptiles,
      },
      {
        name: "experienceLevel",
        label: "Experience level",
        type: "select",
        options: EXPERIENCE_OPTIONS,
        required: true,
      },
      {
        name: "quarantineProtocol",
        label: "Do you follow a quarantine protocol?",
        type: "checkbox",
      },
      {
        name: "quarantineNotes",
        label: "Describe your quarantine protocol (optional)",
        type: "textarea",
        shouldDisplay: (data) => !!data.quarantineProtocol,
      },
      {
        name: "enableAutomaticReptileSync",
        label: "Enable automatic reptile-data syncing",
        type: "checkbox",
      },
    ],
  },
  {
    key: "consent",
    title: "Consent & finish",
    description: "Review the legal bits so we can activate your account.",
    fields: [
      {
        name: "consentDataProcessing",
        label: "I consent to data processing for sync & backup services.",
        type: "checkbox",
        required: true,
      },
      {
        name: "acceptTerms",
        label: "I agree to the Terms of Service and keeper guidelines.",
        type: "checkbox",
        required: true,
      },
    ],
  },
];

const logoSrc = `${process.env.PUBLIC_URL || ""}/app-icons/icon_512x512.png`;

const loadStoredAuth = () => {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return { isAuthenticated: false };
    const parsed = JSON.parse(raw);
    if (parsed?.isAuthenticated) {
      return parsed;
    }
    return { isAuthenticated: false };
  } catch {
    return { isAuthenticated: false };
  }
};

const loadStoredUsers = () => {
  try {
    const raw = localStorage.getItem(USERS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((user) => user && typeof user === "object")
      .map((user) => ({
        fullName: user.fullName || "",
        displayName: user.displayName || "",
        email: user.email || "",
        password: user.password || "",
        reptileCount: user.reptileCount || "",
        registeredAt: user.registeredAt || user.authenticatedAt || user.createdAt || "",
      }));
  } catch {
    return [];
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
  const [authState, setAuthState] = useState(() => loadStoredAuth());
  const [users, setUsers] = useState(() => loadStoredUsers());
  const [view, setView] = useState("chooser");
  const [loginValues, setLoginValues] = useState({ username: "", password: "" });
  const [loginError, setLoginError] = useState("");
  const [registrationData, setRegistrationData] = useState(
    createDefaultRegistrationData(),
  );
  const [registerStep, setRegisterStep] = useState(0);
  const [registrationError, setRegistrationError] = useState("");

  const currentStep = REGISTRATION_STEPS[registerStep];

  const persistAuth = useCallback((next) => {
    setAuthState(next);
    try {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore write errors
    }
  }, []);

  const persistUsers = useCallback((nextUsers) => {
    setUsers(nextUsers);
    try {
      localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(nextUsers));
    } catch {
      // ignore write errors
    }
  }, []);

  const handleLogout = useCallback(() => {
    persistAuth({ isAuthenticated: false });
    setView("chooser");
    setRegisterStep(0);
    setRegistrationData(createDefaultRegistrationData());
  }, [persistAuth]);

  const handleLoginSubmit = (event) => {
    event.preventDefault();
    setLoginError("");
    const { username, password } = loginValues;
    if (!username.trim() || !password.trim()) {
      setLoginError("Enter both username and password.");
      return;
    }
    if (!users.length) {
      setLoginError("No accounts found. Please register first.");
      return;
    }

    const normalizedInput = normalizeIdentifier(username);
    const matchedUser = users.find(
      (user) =>
        normalizeIdentifier(user.displayName) === normalizedInput ||
        normalizeIdentifier(user.email) === normalizedInput,
    );

    if (!matchedUser) {
      setLoginError("No account matches that username or email.");
      return;
    }

    if (matchedUser.password !== password) {
      setLoginError("Incorrect password. Try again.");
      return;
    }

    persistAuth({
      isAuthenticated: true,
      mode: "login",
      profile: {
        fullName: matchedUser.fullName,
        displayName: matchedUser.displayName || matchedUser.fullName,
        email: matchedUser.email,
        reptileCount: matchedUser.reptileCount,
      },
      authenticatedAt: new Date().toISOString(),
    });
  };

  const handleRegistrationChange = (name, value) => {
    setRegistrationData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleRegistrationStepSubmit = (event) => {
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
      setRegistrationError(`Please complete "${missingField.label}".`);
      return;
    }

    if (currentStep.validate) {
      const error = currentStep.validate(registrationData);
      if (error) {
        setRegistrationError(error);
        return;
      }
    }

    if (registerStep === REGISTRATION_STEPS.length - 1) {
      const desiredDisplayName = (registrationData.displayName || registrationData.fullName).trim();
      const desiredEmail = registrationData.email.trim();
      const desiredFullName = registrationData.fullName.trim();

      const conflictingUser = users.find(
        (user) =>
          normalizeIdentifier(user.displayName) ===
            normalizeIdentifier(desiredDisplayName) ||
          normalizeIdentifier(user.email) === normalizeIdentifier(desiredEmail),
      );

      if (conflictingUser) {
        const collisions = [];
        if (
          normalizeIdentifier(conflictingUser.displayName) ===
          normalizeIdentifier(desiredDisplayName)
        ) {
          collisions.push("username");
        }
        if (normalizeIdentifier(conflictingUser.email) === normalizeIdentifier(desiredEmail)) {
          collisions.push("email");
        }
        setRegistrationError(
          `That ${collisions.join(" and ")} is already registered. Please choose another.`,
        );
        return;
      }

      const newUser = {
        fullName: desiredFullName || registrationData.fullName,
        displayName: desiredDisplayName,
        email: desiredEmail,
        password: registrationData.password,
        reptileCount: registrationData.reptileCount,
        registeredAt: new Date().toISOString(),
      };

      persistUsers([...users, newUser]);

      persistAuth({
        isAuthenticated: true,
        mode: "registered",
        profile: {
          fullName: registrationData.fullName,
          displayName: desiredDisplayName,
          email: registrationData.email,
          reptileCount: registrationData.reptileCount,
        },
        registeredAt: new Date().toISOString(),
        preferences: {
          enableCloudSync: registrationData.enableCloudSync,
          enableAutomaticReptileSync:
            registrationData.enableAutomaticReptileSync,
          devicePreference: registrationData.devicePreference,
        },
      });
      return;
    }

    setRegisterStep((prev) => Math.min(prev + 1, REGISTRATION_STEPS.length - 1));
  };

  const resetRegistration = () => {
    setRegisterStep(0);
    setRegistrationError("");
    setRegistrationData(createDefaultRegistrationData());
  };

  const handleSpeciesToggle = (name, option) => {
    setRegistrationData((prev) => {
      const next = new Set(prev[name] || []);
      if (next.has(option)) {
        next.delete(option);
      } else {
        next.add(option);
      }
      return { ...prev, [name]: Array.from(next) };
    });
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
              <option value="">Select an option</option>
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
      case "multiselect":
        return (
          <div key={field.name} className="auth-field">
            {label}
            <div className="auth-multiselect">
              {field.options.map((option) => {
                const optionValue = option.value || option;
                const optionLabel = option.label || option;
                const selected = Array.isArray(value)
                  ? value.includes(optionValue)
                  : false;
                return (
                  <label
                    key={optionValue}
                    className="auth-multiselect-option"
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() =>
                        handleSpeciesToggle(field.name, optionValue)
                      }
                    />
                    <span>{optionLabel}</span>
                  </label>
                );
              })}
            </div>
          </div>
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
        <img src={logoSrc} alt="Breeding Planner logo" className="auth-logo" />
        <h1 className="auth-card-title">Breeding Planner</h1>
      </div>
      <p className="auth-subtitle">
        Keep your reptiles synced across desktop and mobile with one secure
        account.
      </p>
      <div className="auth-primary-actions">
        <button
          type="button"
          className={`primary ${view === "register" ? "is-active" : ""}`}
          onClick={() => {
            setView("register");
            resetRegistration();
          }}
        >
          Register
        </button>
        <button
          type="button"
          className={`ghost ${view === "login" ? "is-active" : ""}`}
          onClick={() => setView("login")}
        >
          Log in
        </button>
      </div>
      {view === "login" && (
        <form className="auth-login-form" onSubmit={handleLoginSubmit}>
          <label className="auth-field">
            <span className="auth-field-label">Username or email</span>
            <input
              type="text"
              value={loginValues.username}
              onChange={(e) =>
                setLoginValues((prev) => ({ ...prev, username: e.target.value }))
              }
            />
          </label>
          <label className="auth-field">
            <span className="auth-field-label">Password</span>
            <input
              type="password"
              value={loginValues.password}
              onChange={(e) =>
                setLoginValues((prev) => ({ ...prev, password: e.target.value }))
              }
            />
          </label>
          {loginError && <p className="auth-error">{loginError}</p>}
          <button type="submit" className="primary wide">
            Continue
          </button>
        </form>
      )}
    </div>
  );

  const registrationCard = (
    <div className="auth-card registration-card">
      <div className="auth-card-header">
        <button type="button" className="text-button" onClick={() => setView("chooser")}>
          ← Back
        </button>
        <div>
          Step {registerStep + 1} of {REGISTRATION_STEPS.length}
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
            Previous
          </button>
          <button type="submit" className="primary">
            {registerStep === REGISTRATION_STEPS.length - 1
              ? "Create account"
              : "Next"}
          </button>
        </div>
      </form>
    </div>
  );

  const signedInChip = authState.isAuthenticated ? (
    <div className="auth-floating-chip">
      <span>
        Signed in as{" "}
        {authState.profile?.displayName ||
          authState.profile?.fullName ||
          "Keeper"}
      </span>
      <button type="button" onClick={handleLogout}>
        Sign out
      </button>
    </div>
  ) : null;

  const overlayActive = !authState.isAuthenticated;

  return (
    <div className="auth-shell">
      <div className={`auth-shell__app ${overlayActive ? "is-blurred" : ""}`}>
        {authState.isAuthenticated && signedInChip}
        {children}
      </div>
      {overlayActive && (
        <div className="auth-overlay">
          {view === "register" ? registrationCard : loginCard}
        </div>
      )}
    </div>
  );
}
