import { DEFAULT_SHARED_API_TIMEOUT_MS, getSharedApiConfig } from "./config/api";
import {
  type SharedBackendState,
  getSharedBackendSnapshot,
  resetSharedBackendSnapshot,
  setSharedBackendSnapshot,
} from "./backendStatus";

export type AuthScope = "breeder" | "lab" | "admin";

export const AUTH_TOKEN_STORAGE_KEYS: Record<AuthScope, string> = {
  breeder: "breedingPlannerBreederAuthToken",
  lab: "breedingPlannerLabAuthToken",
  admin: "breedingPlannerAdminAuthToken",
};

export const REFRESH_TOKEN_STORAGE_KEYS: Record<AuthScope, string> = {
  breeder: "breedingPlannerBreederRefreshToken",
  lab: "breedingPlannerLabRefreshToken",
  admin: "breedingPlannerAdminRefreshToken",
};

export const AUTH_MODE_STORAGE_KEYS: Record<AuthScope, string> = {
  breeder: "breedingPlannerBreederAuthMode",
  lab: "breedingPlannerLabAuthMode",
  admin: "breedingPlannerAdminAuthMode",
};

export const CSRF_TOKEN_STORAGE_KEYS: Record<AuthScope, string> = {
  breeder: "breedingPlannerBreederCsrfToken",
  lab: "breedingPlannerLabCsrfToken",
  admin: "breedingPlannerAdminCsrfToken",
};

export const AUTH_TOKEN_STORAGE_KEY = AUTH_TOKEN_STORAGE_KEYS.breeder;
export const REFRESH_TOKEN_STORAGE_KEY = REFRESH_TOKEN_STORAGE_KEYS.breeder;

const LEGACY_AUTH_TOKEN_STORAGE_KEY = "breedingPlannerAuthToken";
const LEGACY_REFRESH_TOKEN_STORAGE_KEY = "breedingPlannerRefreshToken";
const COOKIE_PREFERRED_AUTH_MODE = "cookie-preferred";
const CSRF_HEADER_NAME = "x-csrf-token";

export const getAuthScopeForHash = (hashValue?: string): AuthScope => {
  const fallbackHash = typeof window !== "undefined" ? window.location.hash : "";
  const raw = String((hashValue ?? fallbackHash) || "")
    .replace(/^#/, "")
    .trim();
  const path = raw.startsWith("/") ? raw : `/${raw}`;
  if (path.startsWith("/admin")) return "admin";
  if (path.startsWith("/lab")) return "lab";
  return "breeder";
};

export type SharedApiErrorKind =
  | "config"
  | "connection"
  | "unauthorized"
  | "forbidden"
  | "not-found"
  | "validation"
  | "server";

export class SharedApiError extends Error {
  kind: SharedApiErrorKind;
  status: number | null;
  details: unknown;

  constructor(message: string, kind: SharedApiErrorKind, status: number | null = null, details: unknown = null) {
    super(message);
    this.name = "SharedApiError";
    this.kind = kind;
    this.status = status;
    this.details = details;
  }
}

const getStoredValue = (key: string): string => {
  try {
    return localStorage.getItem(key) || "";
  } catch {
    return "";
  }
};

const setStoredValue = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore storage failures in private mode.
  }
};

const clearStoredValue = (key: string): void => {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore storage failures in private mode.
  }
};

const normalizeAuthScope = (scope?: AuthScope): AuthScope => scope || getAuthScopeForHash();

const getStoredToken = (scope?: AuthScope): string => {
  const resolvedScope = normalizeAuthScope(scope);
  const scoped = getStoredValue(AUTH_TOKEN_STORAGE_KEYS[resolvedScope]);
  if (scoped) return scoped;
  return resolvedScope === "breeder" ? getStoredValue(LEGACY_AUTH_TOKEN_STORAGE_KEY) : "";
};

const setStoredToken = (token: string, scope?: AuthScope): void => {
  setStoredValue(AUTH_TOKEN_STORAGE_KEYS[normalizeAuthScope(scope)], token);
};

const clearStoredToken = (scope?: AuthScope): void => {
  const resolvedScope = normalizeAuthScope(scope);
  clearStoredValue(AUTH_TOKEN_STORAGE_KEYS[resolvedScope]);
  if (resolvedScope === "breeder") clearStoredValue(LEGACY_AUTH_TOKEN_STORAGE_KEY);
};

const getStoredRefreshToken = (scope?: AuthScope): string => {
  const resolvedScope = normalizeAuthScope(scope);
  const scoped = getStoredValue(REFRESH_TOKEN_STORAGE_KEYS[resolvedScope]);
  if (scoped) return scoped;
  return resolvedScope === "breeder" ? getStoredValue(LEGACY_REFRESH_TOKEN_STORAGE_KEY) : "";
};

const setStoredRefreshToken = (token: string, scope?: AuthScope): void => {
  setStoredValue(REFRESH_TOKEN_STORAGE_KEYS[normalizeAuthScope(scope)], token);
};

const clearStoredRefreshToken = (scope?: AuthScope): void => {
  const resolvedScope = normalizeAuthScope(scope);
  clearStoredValue(REFRESH_TOKEN_STORAGE_KEYS[resolvedScope]);
  if (resolvedScope === "breeder") clearStoredValue(LEGACY_REFRESH_TOKEN_STORAGE_KEY);
};

const clearStoredAuth = (scope?: AuthScope): void => {
  clearStoredToken(scope);
  clearStoredRefreshToken(scope);
  clearStoredValue(AUTH_MODE_STORAGE_KEYS[normalizeAuthScope(scope)]);
  clearStoredValue(CSRF_TOKEN_STORAGE_KEYS[normalizeAuthScope(scope)]);
};

const isCookiePreferredAuth = (scope?: AuthScope): boolean =>
  getStoredValue(AUTH_MODE_STORAGE_KEYS[normalizeAuthScope(scope)]) === COOKIE_PREFERRED_AUTH_MODE;

const setCookiePreferredAuth = (scope?: AuthScope): void => {
  setStoredValue(AUTH_MODE_STORAGE_KEYS[normalizeAuthScope(scope)], COOKIE_PREFERRED_AUTH_MODE);
};

const getStoredCsrfToken = (scope?: AuthScope): string =>
  getStoredValue(CSRF_TOKEN_STORAGE_KEYS[normalizeAuthScope(scope)]);

const setStoredCsrfToken = (token: string, scope?: AuthScope): void => {
  setStoredValue(CSRF_TOKEN_STORAGE_KEYS[normalizeAuthScope(scope)], token);
};

const isUnsafeHttpMethod = (method?: string): boolean => {
  const normalized = String(method || "GET").toUpperCase();
  return normalized !== "GET" && normalized !== "HEAD" && normalized !== "OPTIONS";
};

const categorizeHttpError = (status: number): SharedApiErrorKind => {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not-found";
  if (status === 400 || status === 409 || status === 422) return "validation";
  return "server";
};

const mapResponseError = (response: Response, data: any): SharedApiError => {
  const kind = categorizeHttpError(response.status);
  const message = String(data?.message || data?.error || `Shared backend request failed: ${response.status}`).trim();
  return new SharedApiError(message, kind, response.status, data);
};

const updateStatusForSuccess = (): void => {
  const next = getSharedBackendSnapshot();
  const config = getSharedApiConfig();
  setSharedBackendSnapshot({
    ...next,
    state: "connected",
    message: "Connected to shared backend.",
    reason: "Shared backend health check passed.",
    checkedAt: new Date().toISOString(),
    envLoaded: Boolean(config.rawUrl),
    configured: config.ok,
    reachable: true,
    backendModeEnabled: true,
    healthOk: true,
    authStatus: next.authStatus === "unauthorized" ? "unknown" : next.authStatus,
    activeStorageMode: "backend-only",
    config,
    baseUrl: config.baseUrl,
  });
};

const updateStatusForFailure = (
  error: SharedApiError,
  options: { stateOverride?: SharedBackendState; reason?: string } = {}
): void => {
  const config = getSharedApiConfig();
  const previous = getSharedBackendSnapshot();
  const state = options.stateOverride || (error.kind === "config"
    ? "config-error"
    : error.kind === "connection"
      ? "disconnected"
      : error.kind === "unauthorized"
        ? "unauthorized"
        : "connected");
  const reachable = state === "connected" || state === "unauthorized";
  const healthOk = state === "connected" || state === "unauthorized";
  setSharedBackendSnapshot({
    ...previous,
    state,
    message: state === "connected" ? "Connected to shared backend." : error.message,
    reason: options.reason || error.message,
    checkedAt: new Date().toISOString(),
    envLoaded: Boolean(config.rawUrl),
    configured: config.ok,
    reachable,
    backendModeEnabled: state === "connected",
    healthOk,
    authStatus: error.kind === "unauthorized" ? "unauthorized" : previous.authStatus,
    activeStorageMode: "backend-only",
    config,
    baseUrl: config.baseUrl,
  });
};

export const normalizeSharedApiError = (error: unknown): SharedApiError => {
  if (error instanceof SharedApiError) return error;
  if (error instanceof Error) {
    return new SharedApiError(error.message, "server", null, null);
  }
  return new SharedApiError("Unexpected shared backend error.", "server", null, error);
};

type RequestOptions = RequestInit & {
  timeoutMs?: number;
  requiresAuth?: boolean;
  statusOnHttpError?: SharedBackendState;
  skipRefreshRetry?: boolean;
  skipBearerFallback?: boolean;
  forceBearerAuth?: boolean;
  authScope?: AuthScope;
};

const markAuthorized = (reason = "Authenticated against shared backend."): void => {
  setSharedBackendSnapshot((previous) => ({
    ...previous,
    authStatus: "authorized",
    state: "connected",
    message: "Connected to shared backend.",
    reason,
    checkedAt: new Date().toISOString(),
    reachable: true,
    configured: true,
    backendModeEnabled: true,
    healthOk: true,
  }));
};

const refreshRequestPromises: Partial<Record<AuthScope, Promise<{ token: string; refreshToken: string }>>> = {};
const csrfRequestPromises: Partial<Record<AuthScope, Promise<string>>> = {};

export const fetchCsrfToken = async (scope?: AuthScope): Promise<string> => {
  const authScope = normalizeAuthScope(scope);
  const cached = getStoredCsrfToken(authScope);
  if (cached) return cached;
  if (csrfRequestPromises[authScope]) return csrfRequestPromises[authScope]!;

  csrfRequestPromises[authScope] = (async () => {
    const config = getSharedApiConfig();
    if (!config.ok) {
      const error = new SharedApiError(config.message, "config", null, config);
      updateStatusForFailure(error);
      throw error;
    }

    const response = await fetch(`${config.baseUrl}/auth/csrf-token`, {
      method: "GET",
      credentials: "include",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw mapResponseError(response, data);
    }
    const token = String(data?.csrfToken || "").trim();
    if (!token) {
      throw new SharedApiError("Shared backend did not return a CSRF token.", "server", response.status, data);
    }
    setStoredCsrfToken(token, authScope);
    return token;
  })().finally(() => {
    csrfRequestPromises[authScope] = undefined;
  });

  return csrfRequestPromises[authScope]!;
};

const refreshAuthSession = async (scope: AuthScope): Promise<{ token: string; refreshToken: string }> => {
  if (refreshRequestPromises[scope]) {
    return refreshRequestPromises[scope]!;
  }

  refreshRequestPromises[scope] = (async () => {
    const config = getSharedApiConfig();
    if (!config.ok) {
      const error = new SharedApiError(config.message, "config", null, config);
      updateStatusForFailure(error);
      throw error;
    }

    const refreshToken = getStoredRefreshToken(scope);
    if (!refreshToken && !isCookiePreferredAuth(scope)) {
      const error = new SharedApiError("Your shared backend session expired. Sign in again.", "unauthorized", 401, null);
      clearStoredAuth(scope);
      updateStatusForFailure(error);
      throw error;
    }

    const response = await fetch(`${config.baseUrl}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(refreshToken ? { refreshToken } : {}),
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const mapped = mapResponseError(response, data);
      clearStoredAuth(scope);
      updateStatusForFailure(mapped);
      throw mapped;
    }

    const nextToken = String(data?.token || "").trim();
    const nextRefreshToken = String(data?.refreshToken || "").trim();
    if (!nextToken || !nextRefreshToken) {
      const error = new SharedApiError(
        "Shared backend refresh did not return valid auth tokens.",
        "unauthorized",
        401,
        data
      );
      clearStoredAuth(scope);
      updateStatusForFailure(error);
      throw error;
    }

    setStoredToken(nextToken, scope);
    setStoredRefreshToken(nextRefreshToken, scope);
    setCookiePreferredAuth(scope);
    if (data?.csrfToken) setStoredCsrfToken(String(data.csrfToken), scope);
    markAuthorized("Refreshed shared backend session.");

    return {
      token: nextToken,
      refreshToken: nextRefreshToken,
    };
  })().finally(() => {
    refreshRequestPromises[scope] = undefined;
  });

  return refreshRequestPromises[scope]!;
};

const request = async <T>(path: string, options: RequestOptions = {}): Promise<T> => {
  const authScope = normalizeAuthScope(options.authScope);
  const config = getSharedApiConfig();
  if (!config.ok) {
    const error = new SharedApiError(config.message, "config", null, config);
    updateStatusForFailure(error);
    throw error;
  }

  const headers = new Headers(options.headers || {});
  const requiresAuth = options.requiresAuth !== false;
  if (!headers.has("Content-Type") && options.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  const token = getStoredToken(authScope);
  const preferCookieAuth = isCookiePreferredAuth(authScope);
  if (requiresAuth && token && (options.forceBearerAuth || !preferCookieAuth)) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  if (requiresAuth && preferCookieAuth && isUnsafeHttpMethod(options.method) && !headers.has(CSRF_HEADER_NAME)) {
    const csrfToken = await fetchCsrfToken(authScope);
    headers.set(CSRF_HEADER_NAME, csrfToken);
  }

  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeoutMs = Number(options.timeoutMs || DEFAULT_SHARED_API_TIMEOUT_MS);
  const timeoutId = controller
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null;

  try {
      const response = await fetch(`${config.baseUrl}${path}`, {
        ...options,
        headers,
        credentials: "include",
        signal: controller?.signal,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const mapped = mapResponseError(response, data);
        if (
          mapped.kind === "unauthorized"
          && requiresAuth
          && !options.skipRefreshRetry
          && path !== "/auth/refresh"
          && (getStoredRefreshToken(authScope) || preferCookieAuth)
        ) {
          await refreshAuthSession(authScope);
          return request<T>(path, {
            ...options,
            skipRefreshRetry: true,
          });
        }
        if (
          mapped.kind === "unauthorized"
          && requiresAuth
          && preferCookieAuth
          && token
          && !options.forceBearerAuth
          && !options.skipBearerFallback
        ) {
          return request<T>(path, {
            ...options,
            forceBearerAuth: true,
            skipBearerFallback: true,
          });
        }
        if (mapped.kind === "unauthorized") {
          clearStoredAuth(authScope);
        }
        if (mapped.kind === "unauthorized" && !requiresAuth) {
          updateStatusForSuccess();
        } else {
          updateStatusForFailure(mapped, { stateOverride: options.statusOnHttpError });
        }
        throw mapped;
      }
    updateStatusForSuccess();
    return data as T;
  } catch (error) {
    if (error instanceof SharedApiError) {
      throw error;
    }
    const message = error instanceof Error && error.name === "AbortError"
      ? "Timed out while connecting to the shared backend."
      : "Unable to reach the shared backend.";
    const mapped = new SharedApiError(message, "connection", null, error);
    updateStatusForFailure(mapped);
    throw mapped;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

export const apiRequest = request;

export const getAuthToken = (scope?: AuthScope): string => getStoredToken(scope);

export const setAuthToken = (token: string, scope?: AuthScope): void => setStoredToken(String(token || "").trim(), scope);

export const getRefreshToken = (scope?: AuthScope): string => getStoredRefreshToken(scope);

export const setRefreshToken = (token: string, scope?: AuthScope): void => setStoredRefreshToken(String(token || "").trim(), scope);

export const hasStoredAuthSession = (scope?: AuthScope): boolean => Boolean(getStoredToken(scope) || getStoredRefreshToken(scope));

export const clearAuthToken = (scope?: AuthScope): void => clearStoredAuth(scope);

export const resetSharedBackendState = (): void => {
  resetSharedBackendSnapshot();
};

export const getHealth = async () =>
  {
    const data = await request<{ status?: string; ok?: boolean; service?: string }>("/health", {
      requiresAuth: false,
      timeoutMs: 5_000,
      statusOnHttpError: "disconnected",
    });
    if (data?.status !== "ok" && data?.ok !== true) {
      const error = new SharedApiError(
        "Shared backend health endpoint returned an unexpected response.",
        "connection",
        null,
        data
      );
      updateStatusForFailure(error, {
        stateOverride: "disconnected",
        reason: "Health endpoint did not return status=ok.",
      });
      throw error;
    }
    setSharedBackendSnapshot((previous) => ({
      ...previous,
      reason: "Shared backend health check passed.",
      reachable: true,
      configured: true,
      healthOk: true,
      backendModeEnabled: previous.authStatus !== "unauthorized",
    }));
    return data;
  };

export const login = async (payload: { email: string; password: string }, authScope?: AuthScope) => {
  const scope = normalizeAuthScope(authScope);
  const data = await request<{ token: string; refreshToken: string; user: unknown }>("/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
    requiresAuth: false,
    authScope: scope,
  });
  if (data?.token && data?.refreshToken) {
    setStoredToken(data.token, scope);
    setStoredRefreshToken(data.refreshToken, scope);
    setCookiePreferredAuth(scope);
    if ((data as { csrfToken?: string })?.csrfToken) setStoredCsrfToken(String((data as { csrfToken?: string }).csrfToken), scope);
    markAuthorized();
  }
  return data;
};

export const register = async (payload: { email: string; password: string; fullName: string }) =>
  request<{ user: unknown }>("/auth/register", {
    method: "POST",
    body: JSON.stringify(payload),
    requiresAuth: false,
  });

export const recoverPassword = async (payload: { email: string; fullName: string; newPassword: string }) =>
  request<{ message: string }>("/auth/recover-password", {
    method: "POST",
    body: JSON.stringify(payload),
    requiresAuth: false,
  });

export const getCurrentUser = async () => {
  const data = await request<{ user: unknown }>("/auth/me");
  markAuthorized();
  return data;
};

export const fetchTestCatalog = async () => request<{ tests: unknown[] }>("/lab/tests/catalog?breederView=true");

export const fetchPricingConfig = async () => request<{ pricing: unknown }>("/lab/tests/pricing");

export const calculateOrderPrice = async (payload: { animals: Array<{ animalId: string; animalName?: string; selectedTestIds: string[] }> }) =>
  request("/lab/orders/calculate-price", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const createOrder = async (payload: { animals: Array<{ animalId: string; animalName?: string; selectedTestIds: string[] }> }) =>
  request("/lab/orders", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const fetchOrders = async () => request<{ orders: unknown[] }>("/lab/orders");

export const fetchMyOrders = fetchOrders;

export type BreederSnapshotPayload = {
  animals: unknown[];
  pairings: unknown[];
  clutches?: unknown[];
};

export type BreederProfilePayload = {
  breederName?: string;
  logoUrl?: string;
  location?: string;
  bio?: string;
  websiteUrl?: string;
  instagramHandle?: string;
  facebookHandle?: string;
  telegramHandle?: string;
  publicContactEmail?: string;
  publicContactPhone?: string;
  contactPreference?: string;
  isPublic?: boolean;
};

export type MarketplaceListingPayload = {
  id?: string;
  animalAppId?: string;
  title?: string;
  status?: string;
  price?: string | number;
  currency?: string;
  description?: string;
  imageUrl?: string;
  sex?: string;
  hatchDate?: string;
  genetics?: string;
};

export const fetchBreederSnapshot = async () =>
  request<BreederSnapshotPayload>("/breeder/snapshot");

export const saveBreederSnapshot = async (payload: BreederSnapshotPayload) =>
  request<BreederSnapshotPayload>("/breeder/snapshot", {
    method: "PUT",
    body: JSON.stringify(payload),
  });

export const fetchMyBreederProfile = async () =>
  request<{ profile: unknown | null }>("/profiles/me");

export const saveMyBreederProfile = async (payload: BreederProfilePayload) =>
  request<{ profile: unknown }>("/profiles/me", {
    method: "PUT",
    body: JSON.stringify(payload),
  });

export const fetchMarketplaceProfiles = async () =>
  request<{ profiles: unknown[] }>("/profiles/marketplace");

export const fetchMyListings = async () =>
  request<{ listings: unknown[] }>("/listings/me");

export const saveMyListings = async (listings: MarketplaceListingPayload[]) =>
  request<{ listings: unknown[] }>("/listings/me", {
    method: "PUT",
    body: JSON.stringify({ listings }),
  });

export const fetchMarketplaceListings = async () =>
  request<{ listings: unknown[] }>("/listings/marketplace");

export const fetchMarketplaceCatalog = async (params: Record<string, string | number | boolean | undefined> = {}) => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") query.set(key, String(value));
  });
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return request<{ listings: unknown[] }>(`/marketplace/listings${suffix}`);
};

export const fetchMarketplaceListingDetail = async (id: string) =>
  request<{ listing: unknown }>(`/marketplace/listings/${encodeURIComponent(id)}`);

export const createMarketplaceListing = async (payload: Record<string, unknown>) =>
  request<{ listing: unknown }>("/marketplace/listings", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const updateMarketplaceListing = async (id: string, payload: Record<string, unknown>) =>
  request<{ listing: unknown }>(`/marketplace/listings/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });

export const updateMarketplaceListingWorkflow = async (id: string, payload: Record<string, unknown>) =>
  request<{ listing: unknown }>(`/marketplace/listings/${encodeURIComponent(id)}/status`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });

export const favoriteMarketplaceListing = async (id: string) =>
  request<{ favorited: boolean }>(`/marketplace/listings/${encodeURIComponent(id)}/favorite`, {
    method: "POST",
  });

export const fetchSellerDashboard = async () =>
  request<{ store: unknown; listings: unknown[]; conversations: unknown[]; sales: unknown[]; analytics: unknown }>("/marketplace/seller/dashboard");

export const saveMarketplaceStore = async (payload: Record<string, unknown>) =>
  request<{ store: unknown }>("/marketplace/seller/store", {
    method: "PUT",
    body: JSON.stringify(payload),
  });

export const fetchMarketplaceStore = async (userId: string) =>
  request<{ store: unknown }>(`/marketplace/stores/${encodeURIComponent(userId)}`);

export const createMarketplaceConversation = async (payload: Record<string, unknown>) =>
  request<{ conversation: unknown }>("/marketplace/conversations", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const fetchMarketplaceConversations = async () =>
  request<{ conversations: unknown[] }>("/marketplace/conversations");

export const addMarketplaceMessage = async (id: string, payload: Record<string, unknown>) =>
  request<{ message: unknown }>(`/marketplace/conversations/${encodeURIComponent(id)}/messages`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const createMarketplaceSale = async (payload: Record<string, unknown>) =>
  request<{ sale: unknown }>("/marketplace/sales", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const createMarketplaceReview = async (payload: Record<string, unknown>) =>
  request<{ review: unknown }>("/marketplace/reviews", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const fetchAdminMarketplace = async () =>
  request<{ listings: unknown[]; stores: unknown[]; disputes: unknown[] }>("/marketplace/admin");

export const fetchModerationListings = async () =>
  request<{ listings: unknown[] }>("/listings/moderation");

export const fetchModerationAudit = async () =>
  request<{ audits: unknown[] }>("/listings/moderation/audit");

export const updateListingStatus = async (id: string, status: string, note = "") =>
  request<{ listing: unknown }>(`/listings/${encodeURIComponent(id)}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status, note }),
  });

export const fetchSavedSearches = async () =>
  request<{ searches: unknown[] }>("/searches");

export const createSavedSearch = async (payload: { name: string; filters: unknown }) =>
  request<{ search: unknown }>("/searches", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const deleteSavedSearch = async (id: string) =>
  request<{ deleted: string }>(`/searches/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });

export const fetchNotifications = async () =>
  request<{ notifications: unknown[] }>("/notifications");

export const markNotificationRead = async (id: string) =>
  request<{ notification: unknown }>(`/notifications/${encodeURIComponent(id)}/read`, {
    method: "PATCH",
  });

export const createListingInquiry = async (payload: {
  listingId: string;
  buyerName: string;
  buyerEmail: string;
  message: string;
}) =>
  request<{ inquiry: unknown }>("/inquiries", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const fetchMyInquiries = async () =>
  request<{ inquiries: unknown[] }>("/inquiries/me");

export const updateInquiry = async (id: string, payload: {
  status?: string;
  breederResponseNote?: string;
}) =>
  request<{ inquiry: unknown }>(`/inquiries/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });

export const fetchAdminDashboard = async () =>
  request<{ cards: Record<string, number> }>("/admin/dashboard");

export const fetchFeatureCatalog = async () =>
  request<{ features: unknown[] }>("/subscriptions/admin/features");

export const fetchPublicSubscriptionTiers = async () =>
  request<{ tiers: unknown[] }>("/subscriptions/public/tiers");

export const fetchSubscriptionTiers = async (params: Record<string, string | number | boolean | undefined> = {}) => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") query.set(key, String(value));
  });
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return request<{ tiers: unknown[] }>(`/subscriptions/admin/tiers${suffix}`);
};

export const fetchSubscriptionTier = async (id: string) =>
  request<{ tier: unknown }>(`/subscriptions/admin/tiers/${encodeURIComponent(id)}`);

export const createSubscriptionTier = async (payload: Record<string, unknown>) =>
  request<{ tier: unknown }>("/subscriptions/admin/tiers", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const updateSubscriptionTier = async (id: string, payload: Record<string, unknown>) =>
  request<{ tier: unknown }>(`/subscriptions/admin/tiers/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });

export const duplicateSubscriptionTier = async (id: string) =>
  request<{ tier: unknown }>(`/subscriptions/admin/tiers/${encodeURIComponent(id)}/duplicate`, {
    method: "POST",
  });

export const archiveSubscriptionTier = async (id: string, payload: { reason: string }) =>
  request<{ tier: unknown }>(`/subscriptions/admin/tiers/${encodeURIComponent(id)}/archive`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const fetchUserSubscriptionPanel = async (id: string) =>
  request<{ user: unknown; subscription: unknown; overrides: unknown[]; enabledFeatures: string[]; disabledFeatures: string[]; usage: unknown[] }>(
    `/subscriptions/admin/users/${encodeURIComponent(id)}/subscription`
  );

export const assignUserSubscriptionTier = async (id: string, payload: Record<string, unknown>) =>
  request(`/subscriptions/admin/users/${encodeURIComponent(id)}/subscription`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });

export const addUserFeatureOverride = async (id: string, payload: Record<string, unknown>) =>
  request(`/subscriptions/admin/users/${encodeURIComponent(id)}/overrides`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const removeUserFeatureOverride = async (id: string, overrideId: string, payload: { reason: string }) =>
  request(`/subscriptions/admin/users/${encodeURIComponent(id)}/overrides/${encodeURIComponent(overrideId)}`, {
    method: "DELETE",
    body: JSON.stringify(payload),
  });

export const resetUserUsage = async (id: string, payload: Record<string, unknown>) =>
  request(`/subscriptions/admin/users/${encodeURIComponent(id)}/usage/reset`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const checkFeatureAccess = async (featureKey: string) =>
  request(`/subscriptions/access?featureKey=${encodeURIComponent(featureKey)}`);

export const fetchMobilePermissions = async (payload: Record<string, unknown> = {}) =>
  request<{ plan: string; permissions: Record<string, unknown> }>("/mobile/permissions", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const scanMobileQr = async (payload: { qrCode: string; metadata?: Record<string, unknown> }) =>
  request<{ targetType: string; animal?: unknown }>("/mobile/scan", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const fetchMobileAnimal = async (qrCode: string) =>
  request<{ animal: unknown }>(`/mobile/animal/${encodeURIComponent(qrCode)}`);

export const logMobileFeed = async (payload: Record<string, unknown>) =>
  request<{ animal: unknown; log: unknown }>("/mobile/log/feed", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const logMobileWeight = async (payload: Record<string, unknown>) =>
  request<{ animal: unknown; log: unknown }>("/mobile/log/weight", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const logMobileShed = async (payload: Record<string, unknown>) =>
  request<{ animal: unknown; log: unknown }>("/mobile/log/shed", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const logMobileNote = async (payload: Record<string, unknown>) =>
  request<{ animal: unknown; log: unknown }>("/mobile/log/note", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const logMobileClean = async (payload: Record<string, unknown>) =>
  request<{ animal: unknown; log: unknown }>("/mobile/log/clean", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const logMobileWater = async (payload: Record<string, unknown>) =>
  request<{ animal: unknown; log: unknown }>("/mobile/log/water", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const fetchMobileTasks = async () =>
  request<{ tasks: unknown[] }>("/mobile/tasks/today");

export const fetchMobileRackMode = async () =>
  request<{ rooms: unknown[] }>("/mobile/rack-mode");

export const fetchMobileCommunication = async () =>
  request<{ telegram: unknown; pendingConfirmations: unknown[]; activity: unknown[] }>("/mobile/communication");

export const syncMobileQueue = async (payload: Record<string, unknown>) =>
  request<{ processed: number; results: unknown[] }>("/mobile/sync", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const fetchAdminUsers = async (params: Record<string, string | number | undefined> = {}) => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") query.set(key, String(value));
  });
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return request<{ users: unknown[]; total: number; page: number; pageSize: number }>(`/admin/users${suffix}`);
};

export const fetchAdminUserDetail = async (id: string) =>
  request<{ user: unknown; auditLogs: unknown[]; reports: unknown[]; activity: unknown[] }>(`/admin/users/${encodeURIComponent(id)}`);

export const updateAdminUserRole = async (id: string, payload: { role: string; reason: string; internalNote?: string }) =>
  request<{ user: unknown }>(`/admin/users/${encodeURIComponent(id)}/role`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });

export const updateAdminUserStatus = async (id: string, payload: { status: string; reason: string; internalNote?: string }) =>
  request<{ user: unknown }>(`/admin/users/${encodeURIComponent(id)}/status`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });

export const updateAdminUserSubscription = async (id: string, payload: {
  plan: string;
  status: string;
  paymentStatus: string;
  startDate?: string;
  renewalDate?: string;
  trialEndsAt?: string;
  reason: string;
  internalNote?: string;
}) =>
  request<{ user: unknown }>(`/admin/users/${encodeURIComponent(id)}/subscription`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });

export const updateAdminUserVerification = async (id: string, payload: { verificationStatus: string; reason: string; internalNote?: string }) =>
  request<{ user: unknown }>(`/admin/users/${encodeURIComponent(id)}/verification`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });

export const fetchAdminReports = async (params: Record<string, string | number | undefined> = {}) => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") query.set(key, String(value));
  });
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return request<{ reports: unknown[]; total: number; page: number; pageSize: number; reportTypes: string[]; reportStatuses: string[] }>(`/admin/reports${suffix}`);
};

export const updateAdminReportStatus = async (id: string, payload: { status: string; resolutionNote?: string; reason: string; internalNote?: string }) =>
  request<{ report: unknown }>(`/admin/reports/${encodeURIComponent(id)}/status`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });

export const applyAdminReportAction = async (id: string, payload: { action: string; reason: string; internalNote?: string }) =>
  request<{ report: unknown }>(`/admin/reports/${encodeURIComponent(id)}/action`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const fetchAdminVerificationRequests = async (params: Record<string, string | number | undefined> = {}) => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") query.set(key, String(value));
  });
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return request<{ requests: unknown[]; total: number; page: number; pageSize: number; statuses: string[] }>(`/admin/verification-requests${suffix}`);
};

export const updateAdminVerificationRequest = async (id: string, payload: { status: string; reason: string; adminNote?: string; internalNote?: string }) =>
  request<{ request: unknown }>(`/admin/verification-requests/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });

export const fetchAdminMarketplacePermission = async (userId: string) =>
  request<{ user: unknown; permission: unknown }>(`/admin/users/${encodeURIComponent(userId)}/marketplace-permission`);

export const updateAdminMarketplacePermission = async (userId: string, payload: {
  canAccess: boolean;
  activeListingLimit: number;
  requireApproval: boolean;
  featuredBreeder: boolean;
  disabledReason?: string;
  reason: string;
}) =>
  request<{ permission: unknown }>(`/admin/users/${encodeURIComponent(userId)}/marketplace-permission`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });

export const fetchAdminLabAccounts = async (params: Record<string, string | number | undefined> = {}) => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") query.set(key, String(value));
  });
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return request<{ labs: unknown[]; statuses: string[] }>(`/admin/lab-accounts${suffix}`);
};

export const updateAdminLabAccount = async (id: string, payload: { status: string; reason: string; adminNote?: string }) =>
  request<{ lab: unknown }>(`/admin/lab-accounts/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });

export const sendAdminNotification = async (payload: {
  recipientId?: string;
  audience: string;
  title: string;
  message: string;
  type?: string;
  reason: string;
}) =>
  request<{ sent: number }>("/admin/notifications/send", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const fetchAdminGdprRequests = async (params: Record<string, string | number | undefined> = {}) => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") query.set(key, String(value));
  });
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return request<{ requests: unknown[]; types: string[]; statuses: string[] }>(`/admin/gdpr-requests${suffix}`);
};

export const createAdminGdprRequest = async (userId: string, payload: { type: string; reason: string; adminNote?: string }) =>
  request<{ request: unknown }>(`/admin/users/${encodeURIComponent(userId)}/gdpr-requests`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const updateAdminGdprRequest = async (id: string, payload: { status: string; reason: string; adminNote?: string }) =>
  request<{ request: unknown }>(`/admin/gdpr-requests/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });

export const fetchOrderById = async (id: string) =>
  request<{ order: unknown }>(`/lab/orders/${encodeURIComponent(id)}`);

export const updateOrderStatus = async (id: string, payload: { status: string }) =>
  request<{ order: unknown }>(`/lab/orders/${encodeURIComponent(id)}/status`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });

// ── Reproductive Intelligence ─────────────────────────────────────────────────

export const fetchFemaleReproductiveProfile = async (femaleAppId: string) =>
  request<unknown>(`/reproductive/female/${encodeURIComponent(femaleAppId)}`);

export const postManualLock = async (
  femaleAppId: string,
  payload: { lockDate: string; cycleId?: string; notes?: string }
) =>
  request<unknown>(`/reproductive/female/${encodeURIComponent(femaleAppId)}/lock`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const putCycleManual = async (
  femaleAppId: string,
  payload: {
    season: number;
    cycleIndex?: number;
    maleAppId?: string;
    pairingStartDate?: string;
    ovulationDate?: string;
    preLayShedDate?: string;
    eggLayingDate?: string;
    eggCount?: number;
    fertileCount?: number;
    slugCount?: number;
    notes?: string;
  }
) =>
  request<unknown>(`/reproductive/female/${encodeURIComponent(femaleAppId)}/cycle`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
