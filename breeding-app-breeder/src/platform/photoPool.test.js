import { describe, expect, it } from "vitest";
import { createPhotoPool } from "./photoPool.js";

const big = (body) => `data:image/png;base64,${body.repeat(3000)}`;

describe("photoPool", () => {
  it("round-trips escaped literals exactly", () => {
    const pool = createPhotoPool({ idFactory: () => "x1" });
    // An SVG data URL carries quotes, which JSON escapes.
    const svg = `data:image/svg+xml;utf8,<svg a="${"b".repeat(3000)}"/>`;
    const text = JSON.stringify({ photos: [{ url: svg }], note: "keep" });

    const { text: stored, staged } = pool.externalize(text);
    staged.forEach((literal, id) => pool.add(id, literal));

    expect(stored).toBe('{"photos":[{"url":"idbphoto:x1"}],"note":"keep"}');
    expect(pool.rehydrate(stored).text).toBe(text);
    expect(JSON.parse(pool.rehydrate(stored).text).photos[0].url).toBe(svg);
  });

  it("leaves small data URLs inline", () => {
    const pool = createPhotoPool();
    const text = JSON.stringify({ icon: "data:image/png;base64,AAAA" });
    expect(pool.externalize(text).text).toBe(text);
  });

  it("does not take a photo that only shares a fingerprint", () => {
    let n = 0;
    const pool = createPhotoPool({ idFactory: () => `id${(n += 1)}` });
    const a = big("A");
    // Same length, same start, middle and end; differs elsewhere.
    const b = `${a.slice(0, 200)}Z${a.slice(201)}`;
    const { text, staged } = pool.externalize(JSON.stringify([a, b]));
    expect(staged.size).toBe(2);
    staged.forEach((literal, id) => pool.add(id, literal));
    expect(JSON.parse(pool.rehydrate(text).text)).toEqual([a, b]);
  });

  it("turns a reference with no photo into an empty string and counts it", () => {
    const pool = createPhotoPool();
    const { text, missing } = pool.rehydrate('{"url":"idbphoto:gone","imageUrl":"x"}');
    expect(text).toBe('{"url":"","imageUrl":"x"}');
    expect(missing).toBe(1);
  });

  it("lists the references in a value", () => {
    const pool = createPhotoPool();
    expect([...pool.refsIn('["idbphoto:a","idbphoto:b","idbphoto:a"]')]).toEqual(["a", "b"]);
  });
});
