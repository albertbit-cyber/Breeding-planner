import { DEFAULT_SHARED_API_TIMEOUT_MS, getSharedApiConfig } from "./config/api";
import {
  type SharedBackendState,
  getSharedBackendSnapshot,
  resetSharedBackendSnapshot,
  setSharedBackendSnapshot,
} from "./backendStatus";

export const AUTH_TOKEN_STORAGE_KEY = "breedingPlannerAuthToken";
export const REFRESH_TOKEN_STORAGE_KEY = "breedingPlannerRefreshToken";

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

const getStoredToken = (): string => getStoredValue(AUTH_TOKEN_STORAGE_KEY);

const setStoredToken = (token: string): void => {
  setStoredValue(AUTH_TOKEN_STORAGE_KEY, token);
};

const clearStoredToken = (): void => {
  clearStoredValue(AUTH_TOKEN_STORAGE_KEY);
};

const getStoredRefreshToken = (): string => getStoredValue(REFRESH_TOKEN_STORAGE_KEY);

const setStoredRefreshToken = (token: string): void => {
  setStoredValue(REFRESH_TOKEN_STORAGE_KEY, token);
};

const clearStoredRefreshToken = (): void => {
  clearStoredValue(REFRESH_TOKEN_STORAGE_KEY);
};

const clearStoredAuth = (): void => {
  clearStoredToken();
  clearStoredRefreshToken();
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

let refreshRequestPromise: Promise<{ token: string; refreshToken: string }> | null = null;

const refreshAuthSession = async (): Promise<{ token: string; refreshToken: string }> => {
  if (refreshRequestPromise) {
    return refreshRequestPromise;
  }

  refreshRequestPromise = (async () => {
    const config = getSharedApiConfig();
    if (!config.ok) {
      const error = new SharedApiError(config.message, "config", null, config);
      updateStatusForFailure(error);
      throw error;
    }

    const refreshToken = getStoredRefreshToken();
    if (!refreshToken) {
      const error = new SharedApiError("Your shared backend session expired. Sign in again.", "unauthorized", 401, null);
      clearStoredAuth();
      updateStatusForFailure(error);
      throw error;
    }

    const response = await fetch(`${config.baseUrl}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const mapped = mapResponseError(response, data);
      clearStoredAuth();
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
      clearStoredAuth();
      updateStatusForFailure(error);
      throw error;
    }

    setStoredToken(nextToken);
    setStoredRefreshToken(nextRefreshToken);
    markAuthorized("Refreshed shared backend session.");

    return {
      token: nextToken,
      refreshToken: nextRefreshToken,
    };
  })().finally(() => {
    refreshRequestPromise = null;
  });

  return refreshRequestPromise;
};

const request = async <T>(path: string, options: RequestOptions = {}): Promise<T> => {
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

  const token = getStoredToken();
  if (requiresAuth && token) {
    headers.set("Authorization", `Bearer ${token}`);
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
          && getStoredRefreshToken()
        ) {
          await refreshAuthSession();
          return request<T>(path, {
            ...options,
            skipRefreshRetry: true,
          });
        }
        if (mapped.kind === "unauthorized") {
          clearStoredAuth();
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

export const getAuthToken = (): string => getStoredToken();

export const setAuthToken = (token: string): void => setStoredToken(String(token || "").trim());

export const getRefreshToken = (): string => getStoredRefreshToken();

export const setRefreshToken = (token: string): void => setStoredRefreshToken(String(token || "").trim());

export const hasStoredAuthSession = (): boolean => Boolean(getStoredToken() || getStoredRefreshToken());

export const clearAuthToken = (): void => clearStoredAuth();

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

export const login = async (payload: { email: string; password: string }) => {
  const data = await request<{ token: string; refreshToken: string; user: unknown }>("/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
    requiresAuth: false,
  });
  if (data?.token && data?.refreshToken) {
    setStoredToken(data.token);
    setStoredRefreshToken(data.refreshToken);
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

export const fetchBreederSnapshot = async () =>
  request<BreederSnapshotPayload>("/breeder/snapshot");

export const saveBreederSnapshot = async (payload: BreederSnapshotPayload) =>
  request<BreederSnapshotPayload>("/breeder/snapshot", {
    method: "PUT",
    body: JSON.stringify(payload),
  });

export const fetchOrderById = async (id: string) =>
  request<{ order: unknown }>(`/lab/orders/${encodeURIComponent(id)}`);

export const updateOrderStatus = async (id: string, payload: { status: string }) =>
  request<{ order: unknown }>(`/lab/orders/${encodeURIComponent(id)}/status`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
