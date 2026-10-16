import { describe, expect, it } from "vitest";
import { reattachCurrentPhotos, stripInlinePhotos } from "./backupPhotos.js";

const inline = "data:image/jpeg;base64,AAAA";
const remote = "https://cdn.example/p.jpg";

describe("stripInlinePhotos", () => {
  it("drops inline photos and an inline cover, keeps remote ones, and marks the payload", () => {
    const payload = {
      pairings: [{ id: "p1" }],
      snakes: [
        { id: "a", imageUrl: inline, photos: [{ url: inline }, { url: remote }] },
        { id: "b", imageUrl: remote, photos: [{ url: remote }] },
      ],
    };

    const stripped = stripInlinePhotos(payload);

    expect(stripped.photosOmitted).toBe(true);
    expect(stripped.pairings).toBe(payload.pairings);
    expect(stripped.snakes[0]).toEqual({ id: "a", imageUrl: "", photos: [{ url: remote }] });
    expect(stripped.snakes[1]).toBe(payload.snakes[1]);
    expect(payload.snakes[0].photos).toHaveLength(2);
  });

  it("leaves a payload without snakes alone", () => {
    const payload = { pairings: [] };
    expect(stripInlinePhotos(payload)).toBe(payload);
  });
});

describe("reattachCurrentPhotos", () => {
  it("gives restored animals the photos they have now, and leaves unknown animals as they are", () => {
    const incoming = [
      { id: "a", name: "old name", imageUrl: "", photos: [] },
      { id: "gone", imageUrl: "", photos: [] },
    ];
    const current = [{ id: "a", name: "new name", imageUrl: inline, photos: [{ url: inline }] }];

    const result = reattachCurrentPhotos(incoming, current);

    expect(result[0]).toEqual({ id: "a", name: "old name", imageUrl: inline, photos: [{ url: inline }] });
    expect(result[1]).toBe(incoming[1]);
  });
});
