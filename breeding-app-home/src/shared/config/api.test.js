import { describe, expect, it } from "vitest";
import { validateSharedApiUrl } from "./api";

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
