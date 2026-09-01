import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createOrder,
  createListingInquiry,
  createSavedSearch,
  deleteSavedSearch,
  fetchOrders,
  fetchBreederSnapshot,
  fetchMarketplaceProfiles,
  fetchMarketplaceListings,
  fetchModerationAudit,
  fetchModerationListings,
  fetchMyBreederProfile,
  fetchMyInquiries,
  fetchMyListings,
  fetchNotifications,
  fetchSavedSearches,
  getHealth,
  getAuthToken,
  getRefreshToken,
  login,
  resetSharedBackendState,
  setAuthToken,
  setRefreshToken,
  markNotificationRead,
  saveBreederSnapshot,
  saveMyBreederProfile,
  saveMyListings,
  updateInquiry,
  updateListingStatus,
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

  it("loads and saves marketplace listings", async () => {
    import.meta.env.VITE_API_URL = "https://lab.example.com/api";
    setAuthToken("access-token");

    const fetchMock = vi.fn(async (url, options = {}) => {
      const normalizedUrl = String(url);
      const method = String(options.method || "GET").toUpperCase();
      const headers = new Headers(options.headers || {});

      expect(headers.get("Authorization")).toBe("Bearer access-token");

      if (normalizedUrl.endsWith("/listings/me") && method === "GET") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ listings: [{ id: "listing-1", title: "Banana Clown" }] }),
        };
      }

      if (normalizedUrl.endsWith("/listings/me") && method === "PUT") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ listings: JSON.parse(String(options.body)).listings }),
        };
      }

      if (normalizedUrl.endsWith("/listings/marketplace") && method === "GET") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ listings: [{ id: "listing-1", title: "Banana Clown" }] }),
        };
      }

      throw new Error(`Unexpected URL ${normalizedUrl}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchMyListings()).resolves.toEqual({
      listings: [{ id: "listing-1", title: "Banana Clown" }],
    });
    await expect(saveMyListings([{ id: "listing-2", title: "Pied" }])).resolves.toEqual({
      listings: [{ id: "listing-2", title: "Pied" }],
    });
    await expect(fetchMarketplaceListings()).resolves.toEqual({
      listings: [{ id: "listing-1", title: "Banana Clown" }],
    });
  });

  it("creates and loads marketplace inquiries", async () => {
    import.meta.env.VITE_API_URL = "https://lab.example.com/api";
    setAuthToken("access-token");

    const fetchMock = vi.fn(async (url, options = {}) => {
      const normalizedUrl = String(url);
      const method = String(options.method || "GET").toUpperCase();
      const headers = new Headers(options.headers || {});

      expect(headers.get("Authorization")).toBe("Bearer access-token");

      if (normalizedUrl.endsWith("/inquiries") && method === "POST") {
        return {
          ok: true,
          status: 201,
          json: async () => ({ inquiry: JSON.parse(String(options.body)) }),
        };
      }

      if (normalizedUrl.endsWith("/inquiries/me") && method === "GET") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ inquiries: [{ id: "inquiry-1", listingTitle: "Banana Clown" }] }),
        };
      }

      if (normalizedUrl.endsWith("/inquiries/inquiry-1") && method === "PATCH") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ inquiry: { id: "inquiry-1", ...JSON.parse(String(options.body)) } }),
        };
      }

      throw new Error(`Unexpected URL ${normalizedUrl}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    await expect(createListingInquiry({
      listingId: "listing-1",
      buyerName: "Buyer User",
      buyerEmail: "buyer@example.com",
      message: "Is this still available?",
    })).resolves.toEqual({
      inquiry: {
        listingId: "listing-1",
        buyerName: "Buyer User",
        buyerEmail: "buyer@example.com",
        message: "Is this still available?",
      },
    });
    await expect(fetchMyInquiries()).resolves.toEqual({
      inquiries: [{ id: "inquiry-1", listingTitle: "Banana Clown" }],
    });
    await expect(updateInquiry("inquiry-1", {
      status: "contacted",
      breederResponseNote: "Email sent.",
    })).resolves.toEqual({
      inquiry: {
        id: "inquiry-1",
        status: "contacted",
        breederResponseNote: "Email sent.",
      },
    });
  });

  it("loads moderation listings and updates listing status", async () => {
    import.meta.env.VITE_API_URL = "https://lab.example.com/api";
    setAuthToken("access-token");

    const fetchMock = vi.fn(async (url, options = {}) => {
      const normalizedUrl = String(url);
      const method = String(options.method || "GET").toUpperCase();
      const headers = new Headers(options.headers || {});

      expect(headers.get("Authorization")).toBe("Bearer access-token");

      if (normalizedUrl.endsWith("/listings/moderation") && method === "GET") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ listings: [{ id: "listing-1", status: "draft" }] }),
        };
      }

      if (normalizedUrl.endsWith("/listings/moderation/audit") && method === "GET") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ audits: [{ id: "audit-1", newStatus: "hidden" }] }),
        };
      }

      if (normalizedUrl.endsWith("/listings/listing-1/status") && method === "PATCH") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ listing: { id: "listing-1", ...JSON.parse(String(options.body)) } }),
        };
      }

      throw new Error(`Unexpected URL ${normalizedUrl}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchModerationListings()).resolves.toEqual({
      listings: [{ id: "listing-1", status: "draft" }],
    });
    await expect(fetchModerationAudit()).resolves.toEqual({
      audits: [{ id: "audit-1", newStatus: "hidden" }],
    });
    await expect(updateListingStatus("listing-1", "hidden", "Policy review.")).resolves.toEqual({
      listing: { id: "listing-1", status: "hidden", note: "Policy review." },
    });
  });

  it("loads, creates, and deletes saved marketplace searches", async () => {
    import.meta.env.VITE_API_URL = "https://lab.example.com/api";
    setAuthToken("access-token");

    const fetchMock = vi.fn(async (url, options = {}) => {
      const normalizedUrl = String(url);
      const method = String(options.method || "GET").toUpperCase();
      const headers = new Headers(options.headers || {});

      expect(headers.get("Authorization")).toBe("Bearer access-token");

      if (normalizedUrl.endsWith("/searches") && method === "GET") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ searches: [{ id: "search-1", name: "Clown females" }] }),
        };
      }

      if (normalizedUrl.endsWith("/searches") && method === "POST") {
        return {
          ok: true,
          status: 201,
          json: async () => ({ search: { id: "search-2", ...JSON.parse(String(options.body)) } }),
        };
      }

      if (normalizedUrl.endsWith("/searches/search-1") && method === "DELETE") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ deleted: "search-1" }),
        };
      }

      throw new Error(`Unexpected URL ${normalizedUrl}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchSavedSearches()).resolves.toEqual({
      searches: [{ id: "search-1", name: "Clown females" }],
    });
    await expect(createSavedSearch({
      name: "Pied males",
      filters: { search: "pied", sex: "male" },
    })).resolves.toEqual({
      search: {
        id: "search-2",
        name: "Pied males",
        filters: { search: "pied", sex: "male" },
      },
    });
    await expect(deleteSavedSearch("search-1")).resolves.toEqual({ deleted: "search-1" });
  });

  it("loads notifications and marks them read", async () => {
    import.meta.env.VITE_API_URL = "https://lab.example.com/api";
    setAuthToken("access-token");

    const fetchMock = vi.fn(async (url, options = {}) => {
      const normalizedUrl = String(url);
      const method = String(options.method || "GET").toUpperCase();
      const headers = new Headers(options.headers || {});

      expect(headers.get("Authorization")).toBe("Bearer access-token");

      if (normalizedUrl.endsWith("/notifications") && method === "GET") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ notifications: [{ id: "notification-1", title: "New inquiry" }] }),
        };
      }

      if (normalizedUrl.endsWith("/notifications/notification-1/read") && method === "PATCH") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ notification: { id: "notification-1", readAt: "2026-05-01T10:00:00.000Z" } }),
        };
      }

      throw new Error(`Unexpected URL ${normalizedUrl}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchNotifications()).resolves.toEqual({
      notifications: [{ id: "notification-1", title: "New inquiry" }],
    });
    await expect(markNotificationRead("notification-1")).resolves.toEqual({
      notification: { id: "notification-1", readAt: "2026-05-01T10:00:00.000Z" },
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
