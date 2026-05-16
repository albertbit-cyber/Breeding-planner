import { Demand, Source } from "../types/pairing";
import { getPageCache, setPageCache } from "../db/cache";

const DEFAULT_TIMEOUT = 8000;

const parseTtl = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return fallback;
};

const env = ((): Record<string, string | undefined> => {
  if (typeof process !== "undefined" && process && process.env) {
    return process.env as Record<string, string | undefined>;
  }
  return {};
})();

const PAGE_CACHE_TTL_HOURS = parseTtl(env.PAGE_CACHE_TTL_HOURS, 24);
const PRICE_REGEX = /\$?\b\d{2,5}\b/g;
const DATE_REGEXES: RegExp[] = [
  /\b\d{4}-\d{1,2}-\d{1,2}\b/g,
  /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g,
  /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}\b/gi,
];

const clamp01 = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
};

const sanitizeUrl = (raw: string): URL | null => {
  try {
    return new URL(raw);
  } catch (error) {
    return null;
  }
};

const fetchWithTimeout = async (url: string, timeoutMs: number): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "BreedingPlanner/1.0 (Demand Extractor)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
  } finally {
    clearTimeout(timer);
  }
};

interface ParserBundle {
  JSDOM?: any;
  Readability?: any;
}

let parserBundle: ParserBundle | null = null;

const dynamicImport = new Function("specifier", "return import(specifier);") as (
  specifier: string
) => Promise<any>;

const loadParsers = async (): Promise<ParserBundle> => {
  if (parserBundle) return parserBundle;
  parserBundle = {};
  try {
    const jsdomModule = await dynamicImport("jsdom").catch(() => null);
    parserBundle.JSDOM = jsdomModule?.JSDOM;
    if (parserBundle.JSDOM) {
      try {
        const readabilityModule = await dynamicImport("@mozilla/readability").catch(() => null);
        parserBundle.Readability = readabilityModule?.Readability;
      } catch (error) {
        parserBundle.Readability = undefined;
      }
    }
  } catch (error) {
    parserBundle.JSDOM = undefined;
    parserBundle.Readability = undefined;
  }
  return parserBundle;
};

interface PageExtraction {
  url: string;
  title: string;
  text: string;
  prices: number[];
  freshnessScore: number;
  signals: string[];
}

const parsePrice = (raw: string): number | null => {
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return null;
  const value = Number(digits);
  if (!Number.isFinite(value)) return null;
  if (value < 25 || value > 50000) return null;
  return value;
};

const parseDateToken = (token: string): Date | null => {
  const cleaned = token.replace(/\s+/g, " ").replace(/[,]/g, "").trim();
  if (!cleaned) return null;

  const dashMatch = cleaned.match(/^\d{4}-\d{1,2}-\d{1,2}$/);
  if (dashMatch) {
    const [year, month, day] = cleaned.split("-").map((value) => Number(value));
    return new Date(year, month - 1, day);
  }

  const slashMatch = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slashMatch) {
    let year = Number(slashMatch[3]);
    const month = Number(slashMatch[1]);
    const day = Number(slashMatch[2]);
    if (year < 100) {
      year = year >= 70 ? 1900 + year : 2000 + year;
    }
    return new Date(year, month - 1, day);
  }

  const parsed = Date.parse(cleaned);
  if (!Number.isNaN(parsed)) {
    return new Date(parsed);
  }

  return null;
};

const computeFreshnessScore = (dates: Date[], now: Date): number => {
  if (!dates.length) return 0.2;
  const msPerDay = 24 * 60 * 60 * 1000;
  const best = dates.reduce((min, current) => {
    const delta = Math.max(0, now.getTime() - current.getTime());
    const days = delta / msPerDay;
    return Math.min(min, days);
  }, Number.POSITIVE_INFINITY);
  if (!Number.isFinite(best)) return 0.2;
  const score = Math.exp(-best / 45);
  return clamp01(score);
};

const extractSignalsFromText = (text: string, matches: RegExpMatchArray | null): string[] => {
  if (!text) return [];
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (!sentences.length) return [];
  const snippets: string[] = [];
  if (matches) {
    const uniqueMatches = new Set<string>(Array.from(matches));
    uniqueMatches.forEach((price) => {
      const sentence = sentences.find((line) => line.includes(price));
      if (sentence) {
        snippets.push(sentence.substring(0, 240));
      }
    });
  }
  if (!snippets.length) {
    snippets.push(sentences[0].substring(0, 240));
  }
  return snippets.slice(0, 3);
};

const extractPage = async (url: string, html: string, now: Date): Promise<PageExtraction> => {
  const { JSDOM, Readability } = await loadParsers();
  let title = url;
  let text = "";

  if (JSDOM && Readability) {
    try {
      const dom = new JSDOM(html, { url });
      title = dom.window.document.title || title;
      const reader = new Readability(dom.window.document);
      const article = reader.parse();
      if (article?.textContent) {
        text = article.textContent;
        title = article.title || title;
      } else {
        text = dom.window.document.body?.textContent || "";
      }
    } catch (error) {
      text = "";
    }
  }

  if (!text) {
    const stripped = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    title = titleMatch?.[1]?.trim() || title;
    text = stripped;
  }

  const priceMatches = text.match(PRICE_REGEX);
  const prices: number[] = [];
  if (priceMatches) {
    priceMatches.forEach((match) => {
      const value = parsePrice(match);
      if (value) prices.push(value);
    });
  }

  const dateTokens: Date[] = [];
  DATE_REGEXES.forEach((regex) => {
    const matches = text.match(regex);
    if (matches) {
      matches.forEach((token) => {
        const parsed = parseDateToken(token);
        if (parsed) {
          dateTokens.push(parsed);
        }
      });
    }
  });

  const freshnessScore = computeFreshnessScore(dateTokens, now);
  const signals = extractSignalsFromText(text, priceMatches);

  return {
    url,
    title,
    text,
    prices,
    freshnessScore,
    signals,
  };
};

const dedupeHosts = (urls: string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  urls.forEach((url) => {
    const parsed = sanitizeUrl(url);
    if (!parsed) return;
    const host = parsed.host.toLowerCase();
    if (seen.has(host)) return;
    seen.add(host);
    result.push(parsed.toString());
  });
  return result;
};

const readCachedPage = (url: string): string | null => {
  try {
    const cached = getPageCache(url, PAGE_CACHE_TTL_HOURS);
    return typeof cached === "string" ? cached : null;
  } catch (error) {
    return null;
  }
};

const writeCachedPage = (url: string, html: string): void => {
  try {
    setPageCache(url, html, PAGE_CACHE_TTL_HOURS);
  } catch (error) {
    // ignore cache persistence issues
  }
};

const average = (values: number[]): number => {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

export interface ExtractOptions {
  timeoutMs?: number;
  now?: Date;
}

export const extractDemand = async (urls: string[], options: ExtractOptions = {}): Promise<Demand> => {
  const uniqueUrls = dedupeHosts(urls);
  if (!uniqueUrls.length) {
    return {
      index: 0,
      priceBand: null,
      signals: [],
      sources: [],
    };
  }

  const timeout = options.timeoutMs ?? DEFAULT_TIMEOUT;
  const now = options.now ?? new Date();

  const extractions: PageExtraction[] = [];
  const sources: Source[] = [];
  const signals: string[] = [];
  const priceValues: number[] = [];
  const freshnessValues: number[] = [];

  const registerPage = (page: PageExtraction) => {
    extractions.push(page);
    sources.push({ title: page.title || page.url, url: page.url });
    signals.push(...page.signals);
    priceValues.push(...page.prices);
    freshnessValues.push(page.freshnessScore);
  };

  await Promise.all(
    uniqueUrls.map(async (url) => {
      try {
        let html = readCachedPage(url);

        if (html) {
          try {
            const page = await extractPage(url, html, now);
            registerPage(page);
            return;
          } catch (error: any) {
            signals.push(`Cached content parse failed for ${url}: ${error?.message || "unknown error"}`);
            html = null;
          }
        }

        const response = await fetchWithTimeout(url, timeout);
        if (!response.ok) {
          signals.push(`Skipped ${url} (status ${response.status})`);
          return;
        }

        html = await response.text();
        const page = await extractPage(url, html, now);
        registerPage(page);
        writeCachedPage(url, html);
      } catch (error: any) {
        signals.push(`Fetch failed for ${url}: ${error?.message || "unknown error"}`);
      }
    })
  );

  const boundedSignals = Array.from(new Set(signals.map((signal) => signal.trim()).filter(Boolean))).slice(0, 12);

  let priceBand: [number, number] | null = null;
  if (priceValues.length) {
    const minPrice = Math.min(...priceValues);
    const maxPrice = Math.max(...priceValues);
    if (Number.isFinite(minPrice) && Number.isFinite(maxPrice)) {
      priceBand = [minPrice, maxPrice];
    }
  }

  const mentionScore = clamp01(boundedSignals.length / 6);
  const priceScore = priceBand ? clamp01(average(priceValues) / 5000) : 0;
  const freshnessScore = freshnessValues.length ? clamp01(average(freshnessValues)) : 0.2;

  const aggregateScore = clamp01(0.4 * priceScore + 0.35 * mentionScore + 0.25 * freshnessScore);
  const index = Math.round(aggregateScore * 100);

  return {
    index,
    priceBand,
    signals: boundedSignals,
    sources,
  };
};
