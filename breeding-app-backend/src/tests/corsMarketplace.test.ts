import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import type { Express } from "express";

vi.mock("../lib/prisma", () => ({ prisma: {} }));

/**
 * The marketplace is served from its own origin, and production CORS never
 * listed it: the page loaded, then every API call failed in the browser. The
 * allowlist is CORS_ORIGIN, read once when app.ts loads, so the app is imported
 * here fresh, in production mode, with the documented value from .env.example.
 */
const MARKETPLACE_PAGES = "https://albertbit-cyber.github.io";
const MARKETPLACE_DOMAIN = "https://market.serpentora.com";
const DOCUMENTED_CORS_ORIGIN = [
  "https://serpentora.com",
  "https://www.serpentora.com",
  "https://lab.serpentora.com",
  MARKETPLACE_PAGES,
  MARKETPLACE_DOMAIN,
].join(",");

let app: Express;
const saved = { NODE_ENV: process.env.NODE_ENV, CORS_ORIGIN: process.env.CORS_ORIGIN };

beforeAll(async () => {
  process.env.NODE_ENV = "production";
  process.env.CORS_ORIGIN = DOCUMENTED_CORS_ORIGIN;
  vi.resetModules();
  ({ app } = await import("../app"));
});

afterAll(() => {
  process.env.NODE_ENV = saved.NODE_ENV;
  if (saved.CORS_ORIGIN === undefined) delete process.env.CORS_ORIGIN;
  else process.env.CORS_ORIGIN = saved.CORS_ORIGIN;
  vi.resetModules();
});

describe("CORS for the marketplace origins", () => {
  it.each([MARKETPLACE_PAGES, MARKETPLACE_DOMAIN])("accepts a request from %s", async (origin) => {
    const res = await request(app).get("/api/health").set("Origin", origin);

    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe(origin);
    // Signed-in marketplace calls carry the session cookie.
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("answers the marketplace's preflight for a credentialed write", async () => {
    const res = await request(app)
      .options("/api/marketplace/listings")
      .set("Origin", MARKETPLACE_PAGES)
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "content-type,authorization");

    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe(MARKETPLACE_PAGES);
    expect(String(res.headers["access-control-allow-methods"])).toContain("POST");
  });

  it("gives an unknown origin no CORS headers, so the browser blocks it", async () => {
    const res = await request(app).get("/api/health").set("Origin", "https://evil.example");

    // Not a 500: a refused origin is the browser's call to enforce, not a server error.
    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("does not treat a look-alike of the Pages origin as the Pages origin", async () => {
    for (const origin of ["https://albertbit-cyber.github.io.evil.example", "http://albertbit-cyber.github.io"]) {
      const res = await request(app).get("/api/health").set("Origin", origin);
      expect(res.headers["access-control-allow-origin"]).toBeUndefined();
    }
  });
});
