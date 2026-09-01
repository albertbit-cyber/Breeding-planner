// Shared backend requirements checklist:
// 1. Backend server is deployed/running and serves /api/health
// 2. Shared database is connected behind that backend
// 3. Both Breeder App and Lab App use the same VITE_API_URL
// 4. Client authentication is valid
// 5. Every client device can reach the configured backend URL
export const DEFAULT_SHARED_API_TIMEOUT_MS = 10_000;

export type SharedApiConfigIssueCode =
  | "missing"
  | "empty"
  | "invalid-url"
  | "localhost-production";

export type SharedApiConfigValidation = {
  ok: boolean;
  rawUrl: string;
  baseUrl: string;
  issueCode: SharedApiConfigIssueCode | null;
  message: string;
  warnings: string[];
  isLocalhost: boolean;
};

const DEV_FALLBACK_API_URL = "http://127.0.0.1:4000/api";

const readBrowserLocation = (): Location | null => {
  try {
    return typeof window !== "undefined" ? window.location : null;
  } catch {
    return null;
  }
};

const resolveDevFallbackApiUrl = (): string => {
  const location = readBrowserLocation();
  const hostname = String(location?.hostname || "").trim();
  if (!hostname || hostname === "0.0.0.0") {
    return DEV_FALLBACK_API_URL;
  }
  return `http://${hostname}:4000/api`;
};

const isLikelyDevBrowserSession = (): boolean => {
  const location = readBrowserLocation();
  const port = String(location?.port || "").trim();
  return port === "5173" || port === "4173";
};

const isDevBuild = (): boolean => {
  try {
    if (Boolean((import.meta as any)?.env?.DEV)) {
      return true;
    }
  } catch {
    // Fall through to runtime heuristics below.
  }

  try {
    return isLikelyDevBrowserSession();
  } catch {
    return false;
  }
};

const readRuntimeApiUrl = (): string => {
  try {
    const configured = (import.meta as any)?.env?.VITE_API_URL;
    const trimmed = typeof configured === "string" ? configured.trim() : "";
    if (trimmed) return trimmed;
    return isDevBuild() ? resolveDevFallbackApiUrl() : "";
  } catch {
    return isDevBuild() ? resolveDevFallbackApiUrl() : "";
  }
};

export const isProductionBuild = (): boolean => {
  try {
    if (isLikelyDevBrowserSession()) {
      return false;
    }
    return Boolean((import.meta as any)?.env?.PROD);
  } catch {
    return false;
  }
};

const stripTrailingSlashes = (value: string): string => value.replace(/\/+$/, "");

const normalizeBaseUrl = (value: string): string => {
  const parsed = new URL(value);
  const normalizedPath = parsed.pathname.replace(/\/+$/, "");
  parsed.pathname = /\/api$/i.test(normalizedPath) ? normalizedPath : `${normalizedPath || ""}/api`;
  return stripTrailingSlashes(parsed.toString());
};

const isLoopbackHostname = (hostname: string): boolean => {
  const normalized = String(hostname || "").trim().toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
};

export const validateSharedApiUrl = (
  input?: string,
  options: { production?: boolean } = {}
): SharedApiConfigValidation => {
  const raw = typeof input === "string" ? input.trim() : readRuntimeApiUrl();
  const production = options.production ?? isProductionBuild();

  if (typeof input === "undefined" && !raw) {
    return {
      ok: false,
      rawUrl: "",
      baseUrl: "",
      issueCode: "missing",
      message: "Backend not configured - running in local mode. Shared features are disabled until VITE_API_URL is configured.",
      warnings: [],
      isLocalhost: false,
    };
  }

  if (!raw) {
    return {
      ok: false,
      rawUrl: raw,
      baseUrl: "",
      issueCode: "empty",
      message: "Backend not configured - running in local mode. Shared features are disabled until VITE_API_URL is configured.",
      warnings: [],
      isLocalhost: false,
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return {
      ok: false,
      rawUrl: raw,
      baseUrl: "",
      issueCode: "invalid-url",
      message: `VITE_API_URL is invalid: "${raw}". Expected a full URL such as https://api.example.com.`,
      warnings: [],
      isLocalhost: false,
    };
  }

  const baseUrl = normalizeBaseUrl(parsed.toString());
  const isLocalhost = isLoopbackHostname(parsed.hostname);

  if (production && isLocalhost) {
    return {
      ok: false,
      rawUrl: raw,
      baseUrl,
      issueCode: "localhost-production",
      message: "VITE_API_URL points to localhost in production. Shared backend features must use a network-reachable backend URL.",
      warnings: [],
      isLocalhost,
    };
  }

  const warnings: string[] = [];
  if (!/\/api$/i.test(parsed.pathname.replace(/\/+$/, ""))) {
    warnings.push("VITE_API_URL did not include /api. The app normalized it automatically.");
  }
  if (!production && isLocalhost) {
    warnings.push("VITE_API_URL points to localhost. Other computers will only work if they can reach that same backend host.");
  }

  return {
    ok: true,
    rawUrl: raw,
    baseUrl,
    issueCode: null,
    message: "",
    warnings,
    isLocalhost,
  };
};

export const getSharedApiConfig = (): SharedApiConfigValidation => validateSharedApiUrl();
