import { getSharedApiConfig, type SharedApiConfigValidation } from "./config/api";

export type SharedBackendState =
  | "checking"
  | "connected"
  | "disconnected"
  | "config-error"
  | "unauthorized";

export type SharedBackendSnapshot = {
  state: SharedBackendState;
  message: string;
  reason: string;
  baseUrl: string;
  checkedAt: string | null;
  envLoaded: boolean;
  configured: boolean;
  reachable: boolean;
  backendModeEnabled: boolean;
  healthOk: boolean;
  authStatus: "unknown" | "authorized" | "unauthorized";
  activeStorageMode: "backend-only";
  config: SharedApiConfigValidation;
  storageProviders: {
    orders: "backend";
    catalog: "backend";
    pricing: "backend";
    statuses: "backend";
    uiPreferences: "localStorage";
  };
};

type Listener = (snapshot: SharedBackendSnapshot) => void;

const DEFAULT_STORAGE_PROVIDERS = {
  orders: "backend" as const,
  catalog: "backend" as const,
  pricing: "backend" as const,
  statuses: "backend" as const,
  uiPreferences: "localStorage" as const,
};

const createSnapshot = (): SharedBackendSnapshot => {
  const config = getSharedApiConfig();
  return {
    state: config.ok ? "checking" : "config-error",
    message: config.ok ? "Checking shared backend connectivity." : config.message,
    reason: config.ok ? "Waiting for /health validation." : config.message,
    baseUrl: config.baseUrl,
    checkedAt: null,
    envLoaded: Boolean(config.rawUrl),
    configured: config.ok,
    reachable: false,
    backendModeEnabled: false,
    healthOk: false,
    authStatus: "unknown",
    activeStorageMode: "backend-only",
    config,
    storageProviders: DEFAULT_STORAGE_PROVIDERS,
  };
};

let currentSnapshot: SharedBackendSnapshot = createSnapshot();
const listeners = new Set<Listener>();

const emit = () => {
  for (const listener of listeners) {
    listener(currentSnapshot);
  }
};

export const getSharedBackendSnapshot = (): SharedBackendSnapshot => currentSnapshot;

export const subscribeSharedBackendStatus = (listener: Listener): (() => void) => {
  listeners.add(listener);
  listener(currentSnapshot);
  return () => {
    listeners.delete(listener);
  };
};

export const resetSharedBackendSnapshot = (): SharedBackendSnapshot => {
  currentSnapshot = createSnapshot();
  emit();
  return currentSnapshot;
};

export const setSharedBackendSnapshot = (
  patch: Partial<SharedBackendSnapshot> | ((previous: SharedBackendSnapshot) => SharedBackendSnapshot)
): SharedBackendSnapshot => {
  currentSnapshot = typeof patch === "function"
    ? patch(currentSnapshot)
    : { ...currentSnapshot, ...patch };
  emit();
  return currentSnapshot;
};
