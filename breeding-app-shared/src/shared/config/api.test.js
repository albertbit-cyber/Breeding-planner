import { afterEach, describe, expect, it, vi } from "vitest";
import { createSharedApiConfig, getSharedApiConfig, isProductionBuild, validateSharedApiUrl } from "./api";

describe("shared api config validation", () => {
  it("returns a config error when VITE_API_URL is missing", () => {
    const result = validateSharedApiUrl("", { production: false });
    expect(result.ok).toBe(false);
    expect(result.issueCode).toBe("empty");
  });

  it("returns a config error for malformed URLs", () => {
    const result = validateSharedApiUrl("not-a-url", { production: false });
    expect(result.ok).toBe(false);
    expect(result.issueCode).toBe("invalid-url");
  });

  it("rejects localhost URLs in production mode", () => {
    const result = validateSharedApiUrl("http://localhost:4000/api", { production: true });
    expect(result.ok).toBe(false);
    expect(result.issueCode).toBe("localhost-production");
  });

  it("accepts valid shared backend URLs", () => {
    const result = validateSharedApiUrl("https://lab.example.com/api", { production: true });
    expect(result.ok).toBe(true);
    expect(result.baseUrl).toBe("https://lab.example.com/api");
  });

  it("normalizes URLs that omit the /api suffix", () => {
    const result = validateSharedApiUrl("https://lab.example.com", { production: true });
    expect(result.ok).toBe(true);
    expect(result.baseUrl).toBe("https://lab.example.com/api");
    expect(result.warnings).toContain("VITE_API_URL did not include /api. The app normalized it automatically.");
  });
});

// Breeder's settings: preview on 4174 still counts as a dev session, and the
// invalid-URL message does not echo the configured value back to the user.
const breederConfig = createSharedApiConfig({
  devPorts: ["5173", "4173", "4174"],
  invalidUrlMessage: () => "Backend configuration is invalid. Expected a full API URL.",
});

describe("createSharedApiConfig", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("keeps the default invalid-URL message, which names the bad value", () => {
    expect(validateSharedApiUrl("not-a-url", { production: false }).message).toBe(
      'VITE_API_URL is invalid: "not-a-url". Expected a full URL such as https://api.example.com.'
    );
  });

  it("uses an app's own invalid-URL message", () => {
    const result = breederConfig.validateSharedApiUrl("not-a-url", { production: false });
    expect(result.issueCode).toBe("invalid-url");
    expect(result.message).toBe("Backend configuration is invalid. Expected a full API URL.");
  });

  it("treats 5173 and 4173 as dev sessions by default but not 4174", () => {
    vi.stubEnv("PROD", true);
    for (const [port, production] of [["5173", false], ["4173", false], ["4174", true], ["443", true]]) {
      vi.stubGlobal("window", { location: { hostname: "example.test", port } });
      expect(isProductionBuild(), `port ${port}`).toBe(production);
    }
  });

  it("lets an app add 4174 as a dev port", () => {
    vi.stubEnv("PROD", true);
    vi.stubGlobal("window", { location: { hostname: "example.test", port: "4174" } });
    expect(breederConfig.isProductionBuild()).toBe(false);
  });

  it("falls back to the page host on port 4000 when VITE_API_URL is unset in dev", () => {
    vi.stubEnv("VITE_API_URL", "");
    vi.stubGlobal("window", { location: { hostname: "192.168.1.20", port: "5173" } });
    const result = getSharedApiConfig();
    expect(result.ok).toBe(true);
    expect(result.baseUrl).toBe("http://192.168.1.20:4000/api");
  });

  it("reads VITE_API_URL when it is set", () => {
    vi.stubEnv("VITE_API_URL", "https://api.serpentora.test");
    const result = breederConfig.getSharedApiConfig();
    expect(result.ok).toBe(true);
    expect(result.baseUrl).toBe("https://api.serpentora.test/api");
  });
});
