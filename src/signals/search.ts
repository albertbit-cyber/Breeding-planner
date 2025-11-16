import { getSearchCache, setSearchCache } from "../db/cache";

export interface SearchResult {
  title: string;
  url: string;
}

export interface SearchProvider {
  search(query: string, limit: number): Promise<SearchResult[]>;
}

class SearchError extends Error {
  readonly retryable: boolean;

  constructor(message: string, retryable = true) {
    super(message);
    this.name = "SearchError";
    this.retryable = retryable;
  }
}

const MAX_RESULTS = 8;

const parsePositiveNumber = (value: string | undefined, fallback: number): number => {
  if (value == null) return fallback;
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return fallback;
};

const parseBoolean = (value: string | undefined, fallback = false): boolean => {
  if (value == null) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  return fallback;
};

const env = ((): Record<string, string | undefined> => {
  if (typeof process !== "undefined" && process && process.env) {
    return process.env as Record<string, string | undefined>;
  }
  return {};
})();

const isBrowser = typeof window !== "undefined" && typeof window.document !== "undefined";

const SEARCH_CACHE_TTL_HOURS = parsePositiveNumber(env.SEARCH_CACHE_TTL_HOURS, 12);
const CACHE_ONLY_MODE = parseBoolean(env.CACHE_ONLY, false);
const SEARCH_TIMEOUT_MS = parsePositiveNumber(env.SEARCH_TIMEOUT_MS, 8000);
const SEARCH_RETRY_ATTEMPTS = Math.max(1, Math.floor(parsePositiveNumber(env.SEARCH_RETRY_ATTEMPTS, 2)));
const SEARCH_RETRY_DELAY_MS = parsePositiveNumber(env.SEARCH_RETRY_DELAY_MS, 300);

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const fetchWithTimeout = async (input: string, init: RequestInit): Promise<Response> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);

  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    return response;
  } catch (error) {
    if ((error as Error)?.name === "AbortError") {
      throw new SearchError(`Search request timed out after ${SEARCH_TIMEOUT_MS}ms`, true);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};

const fetchJson = async <T>(input: string, init: RequestInit): Promise<T> => {
  try {
    const response = await fetchWithTimeout(input, init);
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      const retryable = response.status >= 500 || response.status === 429;
      throw new SearchError(
        `Search request failed (${response.status}): ${text || response.statusText}`,
        retryable
      );
    }
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof SearchError) {
      throw error;
    }
    const message = (error as Error)?.message || "Unknown search error";
    throw new SearchError(message, true);
  }
};

const executeWithRetry = async <T>(operation: () => Promise<T>): Promise<T> => {
  let attempt = 0;
  let lastError: unknown;

  while (attempt < SEARCH_RETRY_ATTEMPTS) {
    attempt += 1;
    try {
      return await operation();
    } catch (error) {
      if (error instanceof SearchError) {
        if (!error.retryable || attempt >= SEARCH_RETRY_ATTEMPTS) {
          throw error;
        }
        lastError = error;
      } else {
        if (attempt >= SEARCH_RETRY_ATTEMPTS) {
          throw error;
        }
        lastError = error;
      }
    }

    const backoff = Math.min(SEARCH_TIMEOUT_MS, SEARCH_RETRY_DELAY_MS * attempt);
    await wait(backoff);
  }

  if (lastError instanceof Error) {
    throw lastError;
  }

  throw new SearchError("Search request failed", true);
};

const filterUniqueDomains = (results: SearchResult[]): SearchResult[] => {
  const seenDomains = new Set<string>();
  const filtered: SearchResult[] = [];

  results.forEach((result) => {
    try {
      const domain = new URL(result.url).hostname.replace(/^www\./i, "").toLowerCase();
      if (seenDomains.has(domain)) return;
      seenDomains.add(domain);
      filtered.push(result);
    } catch (error) {
      // Skip invalid URLs silently
    }
  });

  return filtered.slice(0, MAX_RESULTS);
};

const sanitizeLimit = (limit: number): number => {
  if (!Number.isFinite(limit) || limit <= 0) return MAX_RESULTS;
  return Math.min(Math.floor(limit), MAX_RESULTS);
};

const memoryCache = new Map<string, SearchResult[]>();

const readPersistentCache = (key: string): SearchResult[] | null => {
  try {
    const cached = getSearchCache<SearchResult[]>(key, SEARCH_CACHE_TTL_HOURS);
    if (Array.isArray(cached)) {
      return cached;
    }
  } catch (error) {
    // ignore cache failures, fall through to network
  }
  return null;
};

const writePersistentCache = (key: string, results: SearchResult[]): void => {
  try {
    setSearchCache(key, results, SEARCH_CACHE_TTL_HOURS);
  } catch (error) {
    // ignore cache persistence issues
  }
};

const readCachedResults = (key: string): SearchResult[] | null => {
  const memory = memoryCache.get(key);
  if (memory) return memory;
  const persisted = readPersistentCache(key);
  if (persisted) {
    memoryCache.set(key, persisted);
    return persisted;
  }
  return null;
};

const writeCachedResults = (key: string, results: SearchResult[]): void => {
  memoryCache.set(key, results);
  writePersistentCache(key, results);
};

const buildCacheKey = (provider: string, query: string): string => `${provider}:${query.trim().toLowerCase()}`;

const createNoopProvider = (reason: string): SearchProvider => ({
  async search() {
    if (typeof console !== "undefined" && console.warn) {
      console.warn(`[search] ${reason}`);
    }
    return [];
  },
});

const createBingProvider = (): SearchProvider => {
  const apiKey = env.BING_SEARCH_KEY || env.AZURE_BING_KEY;
  if (!apiKey) {
    if (isBrowser) {
      return createNoopProvider("Bing search unavailable: missing API key");
    }
    throw new Error("Bing search provider selected but no BING_SEARCH_KEY (or AZURE_BING_KEY) is configured.");
  }

  return {
    async search(query: string, limit: number): Promise<SearchResult[]> {
      const cappedLimit = sanitizeLimit(limit);
      const cacheKey = buildCacheKey("bing", query);
      const cached = readCachedResults(cacheKey);
      if (cached) {
        return cached.slice(0, cappedLimit);
      }

      if (CACHE_ONLY_MODE) {
        return [];
      }

      type BingResponse = {
        webPages?: {
          value?: Array<{ name?: string; url?: string }>;
        };
      };

      const data = await executeWithRetry(() =>
        fetchJson<BingResponse>(
          `https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(query)}&count=${cappedLimit * 2}`,
          {
            headers: {
              "Ocp-Apim-Subscription-Key": apiKey,
            },
          }
        )
      );

      const rawResults = data.webPages?.value || [];
      const normalized = rawResults
        .map((entry) => ({ title: entry.name || "", url: entry.url || "" }))
        .filter((entry) => entry.title && entry.url);

      const filtered = filterUniqueDomains(normalized);
      writeCachedResults(cacheKey, filtered);
      return filtered.slice(0, cappedLimit);
    },
  };
};

const createSerpApiProvider = (): SearchProvider => {
  const apiKey = env.SERPAPI_API_KEY || env.SERPAPI_KEY;
  if (!apiKey) {
    if (isBrowser) {
      return createNoopProvider("SerpAPI search unavailable: missing API key");
    }
    throw new Error("SerpAPI search provider selected but no SERPAPI_API_KEY (or SERPAPI_KEY) is configured.");
  }

  return {
    async search(query: string, limit: number): Promise<SearchResult[]> {
      const cappedLimit = sanitizeLimit(limit);
      const cacheKey = buildCacheKey("serpapi", query);
      const cached = readCachedResults(cacheKey);
      if (cached) {
        return cached.slice(0, cappedLimit);
      }

      if (CACHE_ONLY_MODE) {
        return [];
      }

      type SerpApiResponse = {
        organic_results?: Array<{ title?: string; link?: string }>;
      };

      const params = new URLSearchParams({
        engine: "google",
        q: query,
        num: String(Math.max(10, cappedLimit * 2)),
        api_key: apiKey,
      });

      const data = await executeWithRetry(() =>
        fetchJson<SerpApiResponse>(`https://serpapi.com/search.json?${params.toString()}`, {})
      );

      const rawResults = data.organic_results || [];
      const normalized = rawResults
        .map((entry) => ({ title: entry.title || "", url: entry.link || "" }))
        .filter((entry) => entry.title && entry.url);

      const filtered = filterUniqueDomains(normalized);
      writeCachedResults(cacheKey, filtered);
      return filtered.slice(0, cappedLimit);
    },
  };
};

export const getSearchProvider = (): SearchProvider => {
  const provider = (env.SEARCH_PROVIDER || "bing").trim().toLowerCase();
  switch (provider) {
    case "serpapi":
      return createSerpApiProvider();
    case "bing":
      return createBingProvider();
    default:
      if (isBrowser) {
        return createNoopProvider(`Unknown search provider '${provider}', falling back to no-op.`);
      }
      throw new Error(`Unknown SEARCH_PROVIDER '${provider}'. Supported providers: bing, serpapi.`);
  }
};
