import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createOrder,
  fetchOrders,
  fetchBreederSnapshot,
  fetchMarketplaceProfiles,
  fetchMyBreederProfile,
  getHealth,
  getAuthToken,
  getRefreshToken,
  login,
  resetSharedBackendState,
  setAuthToken,
  setRefreshToken,
  saveBreederSnapshot,
  saveMyBreederProfile,
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

  it("refreshes an expired access token and retries the protected request", async () => {
    import.meta.env.VITE_API_URL = "https://lab.example.com/api";
    setAuthToken("expired-access");
    setRefreshToken("refresh-token-1");

    const fetchMock = vi.fn(async (url, options = {}) => {
      const normalizedUrl = String(url);
      const headers = new Headers(options.headers || {});

      if (normalizedUrl.endsWith("/auth/refresh")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ token: "fresh-access", refreshToken: "refresh-token-2" }),
        };
      }

      if (normalizedUrl.endsWith("/lab/orders")) {
        if (headers.get("Authorization") === "Bearer fresh-access") {
          return {
            ok: true,
            status: 200,
            json: async () => ({ orders: [{ id: "order-1" }] }),
          };
        }
        return {
          ok: false,
          status: 401,
          json: async () => ({ message: "Missing or invalid token" }),
        };
      }

      throw new Error(`Unexpected URL ${normalizedUrl}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchOrders()).resolves.toEqual({ orders: [{ id: "order-1" }] });
    expect(getAuthToken()).toBe("fresh-access");
    expect(getRefreshToken()).toBe("refresh-token-2");
    expect(getSharedBackendSnapshot().authStatus).toBe("authorized");
  });

  it("reuses one refresh request when multiple protected requests fail together", async () => {
    import.meta.env.VITE_API_URL = "https://lab.example.com/api";
    setAuthToken("expired-access");
    setRefreshToken("refresh-token-1");

    let refreshCalls = 0;
    const fetchMock = vi.fn(async (url, options = {}) => {
      const normalizedUrl = String(url);
      const headers = new Headers(options.headers || {});

      if (normalizedUrl.endsWith("/auth/refresh")) {
        refreshCalls += 1;
        return {
          ok: true,
          status: 200,
          json: async () => ({ token: "fresh-access", refreshToken: "refresh-token-2" }),
        };
      }

      if (normalizedUrl.endsWith("/lab/orders")) {
        if (headers.get("Authorization") === "Bearer fresh-access") {
          return {
            ok: true,
            status: 200,
            json: async () => ({ orders: [] }),
          };
        }
        return {
          ok: false,
          status: 401,
          json: async () => ({ message: "Missing or invalid token" }),
        };
      }

      throw new Error(`Unexpected URL ${normalizedUrl}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    await expect(Promise.all([fetchOrders(), fetchOrders()])).resolves.toEqual([
      { orders: [] },
      { orders: [] },
    ]);
    expect(refreshCalls).toBe(1);
    expect(getAuthToken()).toBe("fresh-access");
    expect(getRefreshToken()).toBe("refresh-token-2");
  });

  it("round-trips breeder planner snapshots through the shared backend", async () => {
    import.meta.env.VITE_API_URL = "https://lab.example.com/api";
    setAuthToken("access-token");

    const fetchMock = vi.fn(async (url, options = {}) => {
      const normalizedUrl = String(url);
      const method = String(options.method || "GET").toUpperCase();
      const headers = new Headers(options.headers || {});

      expect(headers.get("Authorization")).toBe("Bearer access-token");

      if (normalizedUrl.endsWith("/breeder/snapshot") && method === "GET") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ animals: [{ id: "snake-1" }], pairings: [], clutches: [] }),
        };
      }

      if (normalizedUrl.endsWith("/breeder/snapshot") && method === "PUT") {
        return {
          ok: true,
          status: 200,
          json: async () => JSON.parse(String(options.body)),
        };
      }

      throw new Error(`Unexpected URL ${normalizedUrl}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchBreederSnapshot()).resolves.toEqual({
      animals: [{ id: "snake-1" }],
      pairings: [],
      clutches: [],
    });
    await expect(saveBreederSnapshot({ animals: [], pairings: [{ id: "pairing-1" }] })).resolves.toEqual({
      animals: [],
      pairings: [{ id: "pairing-1" }],
    });
  });

  it("loads marketplace profiles and saves my breeder profile", async () => {
    import.meta.env.VITE_API_URL = "https://lab.example.com/api";
    setAuthToken("access-token");

    const fetchMock = vi.fn(async (url, options = {}) => {
      const normalizedUrl = String(url);
      const method = String(options.method || "GET").toUpperCase();
      const headers = new Headers(options.headers || {});

      expect(headers.get("Authorization")).toBe("Bearer access-token");

      if (normalizedUrl.endsWith("/profiles/marketplace") && method === "GET") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ profiles: [{ id: "profile-1", breederName: "Demo Breeder" }] }),
        };
      }

      if (normalizedUrl.endsWith("/profiles/me") && method === "GET") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ profile: { id: "profile-1", breederName: "Demo Breeder" } }),
        };
      }

      if (normalizedUrl.endsWith("/profiles/me") && method === "PUT") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ profile: JSON.parse(String(options.body)) }),
        };
      }

      throw new Error(`Unexpected URL ${normalizedUrl}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchMarketplaceProfiles()).resolves.toEqual({
      profiles: [{ id: "profile-1", breederName: "Demo Breeder" }],
    });
    await expect(fetchMyBreederProfile()).resolves.toEqual({
      profile: { id: "profile-1", breederName: "Demo Breeder" },
    });
    await expect(saveMyBreederProfile({ breederName: "Updated", isPublic: true })).resolves.toEqual({
      profile: { breederName: "Updated", isPublic: true },
    });
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
