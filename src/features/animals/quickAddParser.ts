export type GeneticsType =
  | string
  | {
      name?: string;
      label?: string;
      aliases?: string[];
      shorthand?: string[];
    };

export type ParsedAnimalText = {
  id?: string;
  sex?: 'F' | 'M';
  morphs: string[];
  hets: string[];
  weight?: number;
  hatchYear?: number;
  hatchDate?: string;
  breeder?: string;
  feedingInfo?: string;
  unmatchedNotes?: string;
};

type GeneticsLookupEntry = {
  display: string;
  variants: string[];
};

function normalizeWhitespace(value: string): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toPattern(variant: string): string {
  const words = normalizeWhitespace(variant).split(' ').filter(Boolean);
  return words.map(part => escapeRegex(part)).join('[\\s\\-_]+');
}

function uniqueByLower(tokens: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  tokens.forEach(token => {
    const key = normalizeWhitespace(token).toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    result.push(normalizeWhitespace(token));
  });
  return result;
}

function addBuiltInSynonyms(variants: Set<string>) {
  const lowerSet = new Set(Array.from(variants).map(value => normalizeWhitespace(value).toLowerCase()));
  if (lowerSet.has('pied')) {
    variants.add('Piebald');
  }
  if (lowerSet.has('piebald')) {
    variants.add('Pied');
  }
}

function buildLookup(availableGenetics: GeneticsType[] = []): GeneticsLookupEntry[] {
  const map = new Map<string, { display: string; variants: Set<string> }>();

  availableGenetics.forEach(item => {
    if (!item) return;
    const rawDisplay = typeof item === 'string'
      ? item
      : (item.name || item.label || '');
    const display = normalizeWhitespace(rawDisplay);
    if (!display) return;

    const variants = new Set<string>([display]);
    if (typeof item === 'object') {
      (item.aliases || []).forEach(alias => {
        const cleaned = normalizeWhitespace(alias);
        if (cleaned) variants.add(cleaned);
      });
      (item.shorthand || []).forEach(alias => {
        const cleaned = normalizeWhitespace(alias);
        if (cleaned) variants.add(cleaned);
      });
    }
    addBuiltInSynonyms(variants);

    const key = display.toLowerCase();
    if (!map.has(key)) {
      map.set(key, { display, variants: new Set<string>() });
    }
    const bucket = map.get(key)!;
    if (!bucket.display || bucket.display.length < display.length) {
      bucket.display = display;
    }
    variants.forEach(value => bucket.variants.add(value));
    addBuiltInSynonyms(bucket.variants);
  });

  const entries: GeneticsLookupEntry[] = [];
  map.forEach((bucket) => {
    entries.push({
      display: bucket.display,
      variants: [...bucket.variants],
    });
  });

  entries.sort((a, b) => {
    const aWords = a.display.split(' ').length;
    const bWords = b.display.split(' ').length;
    if (aWords !== bWords) return bWords - aWords;
    return b.display.length - a.display.length;
  });

  return entries;
}

function consumeRegex(source: string, regex: RegExp): { working: string; matches: string[] } {
  const matches: string[] = [];
  const working = source.replace(regex, (...args) => {
    const full = args[0];
    matches.push(full);
    return ' ';
  });
  return { working, matches };
}

function parseSex(text: string): 'F' | 'M' | undefined {
  const female = /(^|\W)(female|0\s*[./:]\s*1|0\s*1|f)(?=\W|$)/i;
  const male = /(^|\W)(male|1\s*[./:]\s*0|1\s*0|m)(?=\W|$)/i;
  if (female.test(text)) return 'F';
  if (male.test(text)) return 'M';
  return undefined;
}

function normalizeYear(year: number): number | undefined {
  const current = new Date().getFullYear();
  if (!Number.isFinite(year)) return undefined;
  if (year < 1990 || year > current + 1) return undefined;
  return year;
}

function cleanupNotes(text: string): string {
  return normalizeWhitespace(
    text
      .replace(/[|;,]+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
  );
}

function normalizeMonthYear(year: number, month: number): string | null {
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null;
  if (month < 1 || month > 12) return null;
  const normalizedYear = normalizeYear(year);
  if (!normalizedYear) return null;
  return `${normalizedYear}-${String(month).padStart(2, '0')}`;
}

function monthNameToNumber(raw: string): number | null {
  const value = normalizeWhitespace(raw).toLowerCase();
  const map: Record<string, number> = {
    jan: 1,
    january: 1,
    feb: 2,
    february: 2,
    mar: 3,
    march: 3,
    apr: 4,
    april: 4,
    may: 5,
    jun: 6,
    june: 6,
    jul: 7,
    july: 7,
    aug: 8,
    august: 8,
    sep: 9,
    sept: 9,
    september: 9,
    oct: 10,
    october: 10,
    nov: 11,
    november: 11,
    dec: 12,
    december: 12,
  };
  return Number.isFinite(map[value]) ? map[value] : null;
}

export function parseAnimalText(text: string, availableGenetics: GeneticsType[] = []): ParsedAnimalText {
  const input = normalizeWhitespace(text || '');
  if (!input) {
    return { morphs: [], hets: [] };
  }

  let working = ` ${input} `;
  const parsed: ParsedAnimalText = {
    morphs: [],
    hets: [],
  };

  const idMatch = working.match(/\b[A-Za-z0-9]{2,}(?:[-_][A-Za-z0-9]{1,})+\b/);
  if (idMatch?.[0]) {
    parsed.id = idMatch[0].trim();
    working = working.replace(idMatch[0], ' ');
  }

  const sex = parseSex(working);
  if (sex) {
    parsed.sex = sex;
    working = working.replace(/(^|\W)(female|male|0\s*[./:]\s*1|1\s*[./:]\s*0|0\s*1|1\s*0|f|m)(?=\W|$)/gi, ' ');
  }

  const weightMatch = working.match(/\b(\d{2,5})\s*g\b/i);
  if (weightMatch?.[1]) {
    const weight = Number(weightMatch[1]);
    if (Number.isFinite(weight) && weight > 0) parsed.weight = weight;
    working = working.replace(weightMatch[0], ' ');
  }

  const dateMatch = working.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (dateMatch?.[1]) {
    parsed.hatchDate = dateMatch[1];
    const yearFromDate = Number(dateMatch[1].slice(0, 4));
    parsed.hatchYear = normalizeYear(yearFromDate);
    working = working.replace(dateMatch[0], ' ');
  } else {
    const monthYearNumericMatch = working.match(/\b(0?[1-9]|1[0-2])[\/\-](\d{4})\b/);
    if (monthYearNumericMatch?.[1] && monthYearNumericMatch?.[2]) {
      const month = Number(monthYearNumericMatch[1]);
      const year = Number(monthYearNumericMatch[2]);
      const normalized = normalizeMonthYear(year, month);
      if (normalized) {
        parsed.hatchDate = normalized;
        parsed.hatchYear = year;
      }
      working = working.replace(monthYearNumericMatch[0], ' ');
    } else {
      const monthYearTextMatch = working.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{4})\b/i);
      if (monthYearTextMatch?.[1] && monthYearTextMatch?.[2]) {
        const month = monthNameToNumber(monthYearTextMatch[1]);
        const year = Number(monthYearTextMatch[2]);
        const normalized = month ? normalizeMonthYear(year, month) : null;
        if (normalized) {
          parsed.hatchDate = normalized;
          parsed.hatchYear = year;
        }
        working = working.replace(monthYearTextMatch[0], ' ');
      }
    }
  }

  const bornMatch = working.match(/\bborn\s+(\d{4})\b/i);
  if (bornMatch?.[1]) {
    const year = normalizeYear(Number(bornMatch[1]));
    if (year) {
      parsed.hatchYear = year;
      if (!parsed.hatchDate) parsed.hatchDate = String(year);
    }
    working = working.replace(bornMatch[0], ' ');
  } else if (!parsed.hatchYear) {
    const yearMatch = working.match(/\b(19\d{2}|20\d{2})\b/);
    if (yearMatch?.[1]) {
      const year = normalizeYear(Number(yearMatch[1]));
      if (year) {
        parsed.hatchYear = year;
        if (!parsed.hatchDate) parsed.hatchDate = String(year);
        working = working.replace(yearMatch[0], ' ');
      }
    }
  }

  const breederMatch = working.match(/\bbreeder\s+(.+?)(?=(?:\beating\b|\bfed\b|\bfeeding\b|\bborn\b|\b\d{2,5}\s*g\b|$))/i);
  if (breederMatch?.[1]) {
    parsed.breeder = cleanupNotes(breederMatch[1]);
    working = working.replace(breederMatch[0], ' ');
  }

  const feedingMatch = working.match(/\b(?:eating|feeding?|fed)\s+(.+?)(?=(?:\bbreeder\b|\bborn\b|\b\d{4}\b|\b\d{2,5}\s*g\b|$))/i);
  if (feedingMatch?.[1]) {
    parsed.feedingInfo = cleanupNotes(feedingMatch[1]);
    working = working.replace(feedingMatch[0], ' ');
  }

  const lookup = buildLookup(availableGenetics);
  let geneticsWorking = working;

  lookup.forEach(entry => {
    const variantPatterns = uniqueByLower(entry.variants)
      .sort((a, b) => b.length - a.length)
      .map(toPattern);

    variantPatterns.forEach(pattern => {
      const hetRegex = new RegExp(`(^|[^a-z0-9])(?:(\\d{1,3})\\s*%\\s*)?(?:(poss(?:ible)?|ph)\\s+)?het\\s+(${pattern})(?=$|[^a-z0-9])`, 'gi');
      const hetMatches: string[] = [];
      geneticsWorking = geneticsWorking.replace(hetRegex, (...args) => {
        const percent = args[2] ? `${args[2]}% ` : '';
        const possRaw = args[3] ? 'Possible ' : '';
        const token = `${percent}${possRaw}${entry.display}`.trim();
        parsed.hets.push(token);
        hetMatches.push(args[0]);
        return ' ';
      });

      if (hetMatches.length > 0) return;

      const morphRegex = new RegExp(`(^|[^a-z0-9])(${pattern})(?=$|[^a-z0-9])`, 'gi');
      const consumed = consumeRegex(geneticsWorking, morphRegex);
      if (consumed.matches.length > 0) {
        parsed.morphs.push(entry.display);
        geneticsWorking = consumed.working;
      }
    });
  });

  parsed.morphs = uniqueByLower(parsed.morphs);
  parsed.hets = uniqueByLower(parsed.hets);

  const unmatchedSegments: string[] = [];
  const leftoverGenetics = cleanupNotes(geneticsWorking);
  if (leftoverGenetics) unmatchedSegments.push(leftoverGenetics);

  const mergedNotes = uniqueByLower(unmatchedSegments).join(' ').trim();
  if (mergedNotes) parsed.unmatchedNotes = mergedNotes;

  return parsed;
}

export function collectLiveGenetics(snakes: Array<Record<string, any>> = []): GeneticsType[] {
  const map = new Map<string, { name: string; aliases: string[] }>();

  const upsert = (raw: string) => {
    const cleaned = normalizeWhitespace(raw);
    if (!cleaned) return;
    const lower = cleaned.toLowerCase();
    if (!map.has(lower)) {
      map.set(lower, { name: cleaned, aliases: [] });
      return;
    }
    const existing = map.get(lower)!;
    if (existing.name.length < cleaned.length) {
      existing.name = cleaned;
    }
  };

  snakes.forEach(snake => {
    const morphs = Array.isArray(snake?.morphs) ? snake.morphs : [];
    morphs.forEach(entry => upsert(String(entry || '')));

    const hets = Array.isArray(snake?.hets) ? snake.hets : [];
    hets.forEach(entry => {
      const normalized = normalizeWhitespace(String(entry || ''))
        .replace(/^\d{1,3}%\s*/i, '')
        .replace(/^(possible|probable|maybe)\s+/i, '')
        .replace(/^het\s+/i, '')
        .trim();
      upsert(normalized);
    });

    const possible = Array.isArray(snake?.possibleHets) ? snake.possibleHets : [];
    possible.forEach(entry => {
      const normalized = normalizeWhitespace(String(entry || ''))
        .replace(/^\d{1,3}%\s*/i, '')
        .replace(/^(possible|probable|maybe)\s+/i, '')
        .replace(/^het\s+/i, '')
        .trim();
      upsert(normalized);
    });
  });

  return [...map.values()];
}
