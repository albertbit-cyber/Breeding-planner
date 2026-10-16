// Photos stored once, referenced everywhere.
//
// Photos are base64 data URLs inside the animal records, and the same photo also sits in the
// cover image, the automatic snapshot and the copy kept to undo a restore. Stored as-is, every
// save rewrote every photo and each copy stored them again. The device store now cuts each
// embedded data URL out of the JSON it writes, keeps it once in a photos table, and leaves a
// short reference in its place; reading puts the photo back.
//
// This happens only between the in-memory cache and IndexedDB. The app, cloud sync, the
// marketplace, backup files and PDF export all keep seeing the same data URLs they always did.
//
// Everything works on JSON text, so a value is never parsed to find its photos. A photo is
// cut out together with its quotes, as the JSON string literal it is, and put back verbatim,
// so the round trip is exact whatever escaping the literal contains.

export const PHOTO_REF_PREFIX = "idbphoto:";

// Small data URLs (icons, tiny thumbnails) are not worth a table row.
const MIN_EXTERNAL_CHARS = 2048;

// A JSON string literal starting with data:. Allows escaped characters inside.
const DATA_LITERAL = /"data:(?:[^"\\]|\\.)*"/g;
const REF_LITERAL = /"idbphoto:([A-Za-z0-9_-]+)"/g;

const defaultIdFactory = () => {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch {
    // Fall through.
  }
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
};

// Cheap fingerprint to find candidates; a full string comparison decides. A collision can
// cost a comparison, never a wrong photo.
const sampleKey = (literal) => {
  const mid = literal.length >> 1;
  return `${literal.length}|${literal.slice(24, 88)}|${literal.slice(mid, mid + 64)}|${literal.slice(-64)}`;
};

export const createPhotoPool = ({ idFactory = defaultIdFactory } = {}) => {
  const photos = new Map(); // id -> JSON string literal, quotes included
  const index = new Map(); // sampleKey -> Set(id)
  let totalChars = 0;

  const indexAdd = (id, literal) => {
    const key = sampleKey(literal);
    if (!index.has(key)) index.set(key, new Set());
    index.get(key).add(id);
  };
  const indexRemove = (id, literal) => {
    const key = sampleKey(literal);
    const ids = index.get(key);
    if (!ids) return;
    ids.delete(id);
    if (!ids.size) index.delete(key);
  };

  const find = (literal, staged) => {
    const ids = index.get(sampleKey(literal));
    if (ids) {
      for (const id of ids) {
        if (photos.get(id) === literal) return id;
      }
    }
    if (staged) {
      for (const [id, value] of staged) {
        if (value === literal) return id;
      }
    }
    return null;
  };

  const add = (id, literal) => {
    if (typeof literal !== "string" || photos.has(id)) return;
    photos.set(id, literal);
    indexAdd(id, literal);
    totalChars += literal.length;
  };

  const remove = (id) => {
    const literal = photos.get(id);
    if (literal === undefined) return;
    photos.delete(id);
    indexRemove(id, literal);
    totalChars -= literal.length;
  };

  // Replaces embedded data URLs with references. Photos the pool does not hold yet are put in
  // `staged` (id -> literal) for the caller to store and then add; nothing is added here, so a
  // write that fails leaves the pool as it was.
  const externalize = (text, staged = new Map()) => {
    if (typeof text !== "string" || text.indexOf("\"data:") < 0) return { text, staged };
    const out = text.replace(DATA_LITERAL, (literal) => {
      if (literal.length < MIN_EXTERNAL_CHARS) return literal;
      let id = find(literal, staged);
      if (!id) {
        id = idFactory();
        staged.set(id, literal);
      }
      return `"${PHOTO_REF_PREFIX}${id}"`;
    });
    return { text: out, staged };
  };

  // Puts photos back. A reference whose photo is missing becomes an empty string, which every
  // reader already treats as "no photo"; `missing` says how many, so it can be logged.
  const rehydrate = (text) => {
    if (typeof text !== "string" || text.indexOf(`"${PHOTO_REF_PREFIX}`) < 0) return { text, missing: 0 };
    let missing = 0;
    const out = text.replace(REF_LITERAL, (ref, id) => {
      const literal = photos.get(id);
      if (literal !== undefined) return literal;
      missing += 1;
      return "\"\"";
    });
    return { text: out, missing };
  };

  const refsIn = (text, into = new Set()) => {
    if (typeof text !== "string") return into;
    REF_LITERAL.lastIndex = 0;
    let match = REF_LITERAL.exec(text);
    while (match) {
      into.add(match[1]);
      match = REF_LITERAL.exec(text);
    }
    return into;
  };

  return {
    add,
    remove,
    has: (id) => photos.has(id),
    get: (id) => photos.get(id),
    ids: () => [...photos.keys()],
    clear: () => {
      photos.clear();
      index.clear();
      totalChars = 0;
    },
    externalize,
    rehydrate,
    refsIn,
    size: () => photos.size,
    totalChars: () => totalChars,
  };
};
