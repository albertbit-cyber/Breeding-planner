import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createOrder,
  getHealth,
  getAuthToken,
  login,
  resetSharedBackendState,
  setAuthToken,
  clearAuthToken,
  SharedApiError,
} from "./apiClient";
import { getSharedBackendSnapshot } from "./backendStatus";

const originalApiUrl = import.meta.env.VITE_API_URL;

const createStorageMock = () => {
  const store = new Map();
  return {
    getItem: vi.fn((key) => (store.has(key) ? store.get(key) : null)),
    setItem: vi.fn((key, value) => { store.set(key, String(value)); }),
    removeItem: vi.fn((key) => { store.delete(key); }),
    clear: vi.fn(() => { store.clear(); }),
  };
};

describe("shared api client", () => {
  beforeEach(() => {
    import.meta.env.VITE_API_URL = originalApiUrl;
    resetSharedBackendState();
    clearAuthToken();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.stubGlobal("localStorage", createStorageMock());
  });

  it("falls back to the local dev backend when VITE_API_URL is missing", async () => {
    import.meta.env.VITE_API_URL = "";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    await expect(createOrder({ animals: [{ animalId: "snake-1", selectedTestIds: ["clown"] }] }))
      .rejects.toBeInstanceOf(SharedApiError);

    expect(getSharedBackendSnapshot().state).toBe("disconnected");
  });

  it("enters disconnected state when the backend health check fails", async () => {
    import.meta.env.VITE_API_URL = "https://lab.example.com/api";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    await expect(getHealth()).rejects.toBeInstanceOf(SharedApiError);
    expect(getSharedBackendSnapshot().state).toBe("disconnected");
  });

  it("enters connected state after a successful backend health check", async () => {
    import.meta.env.VITE_API_URL = "https://lab.example.com/api";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: "ok", ok: true }),
    }));

    await expect(getHealth()).resolves.toEqual({ status: "ok", ok: true });
    expect(getSharedBackendSnapshot().state).toBe("connected");
  });

  it("marks protected requests as unauthorized when the backend rejects the token", async () => {
    import.meta.env.VITE_API_URL = "https://lab.example.com/api";
    setAuthToken("bad-token");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ message: "Missing or invalid token" }),
    }));

    await expect(createOrder({ animals: [{ animalId: "snake-1", selectedTestIds: ["clown"] }] }))
      .rejects.toBeInstanceOf(SharedApiError);

    expect(getSharedBackendSnapshot().state).toBe("unauthorized");
    expect(getAuthToken()).toBe("");
  });

  it("does not mark login failures as disconnected or unauthorized backend state", async () => {
    import.meta.env.VITE_API_URL = "https://lab.example.com/api";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ message: "Login failed." }),
    }));

    await expect(login({ email: "keeper@example.com", password: "badpass" }))
      .rejects.toBeInstanceOf(SharedApiError);

    expect(getSharedBackendSnapshot().state).toBe("connected");
  });
});
