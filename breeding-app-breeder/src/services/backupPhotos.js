// Backup vault entries and the automatic snapshot are kept on the device as undo points.
// With photos inline, each one was a full copy of every photo, and twenty of them is what
// filled a phone's storage. Those copies now leave inline photos out and say so with
// `photosOmitted`; restoring one keeps the photos the animals have now.
//
// Backup files the keeper saves keep their photos. Only on-device copies are stripped.

const isInlinePhoto = (url) => typeof url === "string" && /^data:/i.test(url);

const stripSnake = (snake) => {
  if (!snake || typeof snake !== "object") return snake;
  const photos = Array.isArray(snake.photos) ? snake.photos : null;
  const keptPhotos = photos ? photos.filter((photo) => !isInlinePhoto(photo?.url)) : photos;
  const coverIsInline = isInlinePhoto(snake.imageUrl);
  if ((!photos || keptPhotos.length === photos.length) && !coverIsInline) return snake;
  const next = { ...snake };
  if (photos) next.photos = keptPhotos;
  if (coverIsInline) next.imageUrl = "";
  return next;
};

export function stripInlinePhotos(payload) {
  if (!payload || typeof payload !== "object" || !Array.isArray(payload.snakes)) return payload;
  return { ...payload, snakes: payload.snakes.map(stripSnake), photosOmitted: true };
}

// For a payload that left its photos out: each animal that still exists keeps the photos and
// cover it has now. An animal deleted since the copy was made comes back without its photos,
// which is the one thing an on-device undo point can no longer give back.
export function reattachCurrentPhotos(incomingSnakes, currentSnakes) {
  const current = new Map(
    (Array.isArray(currentSnakes) ? currentSnakes : [])
      .filter((snake) => snake && snake.id != null)
      .map((snake) => [String(snake.id), snake]),
  );
  return (Array.isArray(incomingSnakes) ? incomingSnakes : []).map((snake) => {
    const existing = snake && snake.id != null ? current.get(String(snake.id)) : null;
    if (!existing) return snake;
    return {
      ...snake,
      photos: Array.isArray(existing.photos) ? existing.photos : snake.photos,
      imageUrl: existing.imageUrl || snake.imageUrl || "",
    };
  });
}
