declare const require: any;

const ONE_HOUR_MS = 60 * 60 * 1000;

const clampTtl = (ttlHours?: number): number => {
  if (!ttlHours || !Number.isFinite(ttlHours) || ttlHours <= 0) return 0;
  return ttlHours;
};

type CacheFns = {
  getSearchCache<T>(query: string, ttlHours?: number): T | null;
  setSearchCache(query: string, payload: unknown, ttlHours?: number): void;
  getPageCache(url: string, ttlHours?: number): string | null;
  setPageCache(url: string, html: string, ttlHours?: number): void;
};

const isBrowser = typeof window !== "undefined" && typeof window.document !== "undefined";

const createMemoryCache = (): CacheFns => {
  type Entry<T> = { value: T; ts: number };
  const searchCache = new Map<string, Entry<unknown>>();
  const pageCache = new Map<string, Entry<string>>();

  const isExpired = (entry: Entry<unknown>, ttlHours?: number): boolean => {
    const ttl = clampTtl(ttlHours);
    if (!ttl) return false;
    const cutoff = Date.now() - ttl * ONE_HOUR_MS;
    return entry.ts < cutoff;
  };

  return {
    getSearchCache<T>(query: string, ttlHours?: number): T | null {
      if (!query) return null;
      const entry = searchCache.get(query);
      if (!entry) return null;
      if (isExpired(entry, ttlHours)) {
        searchCache.delete(query);
        return null;
      }
      return entry.value as T;
    },
    setSearchCache(query: string, payload: unknown, ttlHours?: number): void {
      if (!query) return;
      searchCache.set(query, { value: payload, ts: Date.now() });
      if (clampTtl(ttlHours)) {
        const ttl = clampTtl(ttlHours);
        const cutoff = Date.now() - ttl * ONE_HOUR_MS;
        Array.from(searchCache.entries()).forEach(([key, value]) => {
          if (value.ts < cutoff) {
            searchCache.delete(key);
          }
        });
      }
    },
    getPageCache(url: string, ttlHours?: number): string | null {
      if (!url) return null;
      const entry = pageCache.get(url);
      if (!entry) return null;
      if (isExpired(entry, ttlHours)) {
        pageCache.delete(url);
        return null;
      }
      return entry.value;
    },
    setPageCache(url: string, html: string, ttlHours?: number): void {
      if (!url) return;
      pageCache.set(url, { value: html, ts: Date.now() });
      if (clampTtl(ttlHours)) {
        const ttl = clampTtl(ttlHours);
        const cutoff = Date.now() - ttl * ONE_HOUR_MS;
        Array.from(pageCache.entries()).forEach(([key, value]) => {
          if (value.ts < cutoff) {
            pageCache.delete(key);
          }
        });
      }
    },
  };
};

const createSqliteCache = (): CacheFns => {
  const fs = require("fs") as typeof import("fs");
  const path = require("path") as typeof import("path");

  const DatabaseConstructor: any = (() => {
    try {
      return require("better-sqlite3");
    } catch (error) {
      return null;
    }
  })();

  const DEFAULT_DB_PATH = process.env.CACHE_DB_PATH
    ? path.resolve(process.cwd(), process.env.CACHE_DB_PATH)
    : path.resolve(process.cwd(), "data", "cache.sqlite");

  type SearchRow = {
    json: string;
    ts: number;
  };

  type PageRow = {
    html: string;
    ts: number;
  };

  let database: any = null;

  const ensureDatabase = (): any => {
    if (database) return database;

    if (!DatabaseConstructor) {
      throw new Error(
        "better-sqlite3 is required for caching. Install it by running 'npm install better-sqlite3'."
      );
    }

    const dbPath = DEFAULT_DB_PATH;
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });

    const db = new DatabaseConstructor(dbPath);
    db.pragma("journal_mode = WAL");
    db.exec(
      "CREATE TABLE IF NOT EXISTS search_hits (query TEXT PRIMARY KEY, json TEXT NOT NULL, ts INTEGER NOT NULL)"
    );
    db.exec(
      "CREATE TABLE IF NOT EXISTS pages (url TEXT PRIMARY KEY, html TEXT NOT NULL, ts INTEGER NOT NULL)"
    );

    database = db;
    return database;
  };

  const prune = (table: "search_hits" | "pages", ttlHours?: number): void => {
    const boundedTtl = clampTtl(ttlHours);
    if (!boundedTtl) return;

    try {
      const cutoff = Date.now() - boundedTtl * ONE_HOUR_MS;
      ensureDatabase()
        .prepare(`DELETE FROM ${table} WHERE ts < ?`)
        .run(cutoff);
    } catch (error) {
      // ignore cache pruning errors
    }
  };

  return {
    getSearchCache<T>(query: string, ttlHours?: number): T | null {
      if (!query) return null;
      try {
        const statement = ensureDatabase().prepare("SELECT json, ts FROM search_hits WHERE query = ?");
        const row = statement.get(query) as SearchRow | undefined;
        if (!row) return null;

        if (clampTtl(ttlHours)) {
          const cutoff = Date.now() - clampTtl(ttlHours) * ONE_HOUR_MS;
          if (row.ts < cutoff) return null;
        }

        return JSON.parse(row.json) as T;
      } catch (error) {
        return null;
      }
    },
    setSearchCache(query: string, payload: unknown, ttlHours?: number): void {
      if (!query) return;
      try {
        const now = Date.now();
        ensureDatabase()
          .prepare(
            "INSERT INTO search_hits (query, json, ts) VALUES (?, ?, ?) ON CONFLICT(query) DO UPDATE SET json = excluded.json, ts = excluded.ts"
          )
          .run(query, JSON.stringify(payload), now);
        prune("search_hits", ttlHours);
      } catch (error) {
        // swallow cache writes
      }
    },
    getPageCache(url: string, ttlHours?: number): string | null {
      if (!url) return null;
      try {
        const statement = ensureDatabase().prepare("SELECT html, ts FROM pages WHERE url = ?");
        const row = statement.get(url) as PageRow | undefined;
        if (!row) return null;

        if (clampTtl(ttlHours)) {
          const cutoff = Date.now() - clampTtl(ttlHours) * ONE_HOUR_MS;
          if (row.ts < cutoff) return null;
        }

        return row.html;
      } catch (error) {
        return null;
      }
    },
    setPageCache(url: string, html: string, ttlHours?: number): void {
      if (!url) return;
      try {
        const now = Date.now();
        ensureDatabase()
          .prepare(
            "INSERT INTO pages (url, html, ts) VALUES (?, ?, ?) ON CONFLICT(url) DO UPDATE SET html = excluded.html, ts = excluded.ts"
          )
          .run(url, html, now);
        prune("pages", ttlHours);
      } catch (error) {
        // swallow cache writes
      }
    },
  };
};

const cache = isBrowser ? createMemoryCache() : createSqliteCache();

export const getSearchCache = <T = unknown>(query: string, ttlHours?: number): T | null =>
  cache.getSearchCache<T>(query, ttlHours);

export const setSearchCache = (query: string, payload: unknown, ttlHours?: number): void =>
  cache.setSearchCache(query, payload, ttlHours);

export const getPageCache = (url: string, ttlHours?: number): string | null =>
  cache.getPageCache(url, ttlHours);

export const setPageCache = (url: string, html: string, ttlHours?: number): void =>
  cache.setPageCache(url, html, ttlHours);
