import React, { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { uploadMarketplaceMedia } from "../../shared/apiClient";
import { resolveMediaUrl } from "../api";
import Button from "./Button";
import Icon from "./Icon";

const MAX_BYTES = 8 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

const readAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.readAsDataURL(file);
  });

/**
 * Photos, at last.
 *
 * The editor offered a single text input labelled "Photo URL", so a breeder had
 * to host their images somewhere else and paste a link. The upload endpoint,
 * the media table with checksum and scan status, and the per-image `sortOrder`
 * and `isPrimary` columns were all already built and simply unreachable.
 *
 * Order is meaning here: the first photo is the cover, and it is the one a
 * buyer sees in the grid.
 */
export default function PhotoUploader({ images, onChange, listingId, max = 12 }) {
  const { t } = useTranslation("marketplace");
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dragIndex = useRef(null);

  const addFiles = useCallback(
    async (files) => {
      const list = Array.from(files || []);
      if (!list.length) return;
      setError("");

      const room = max - images.length;
      if (room <= 0) {
        setError(t("photos.full", { defaultValue: "You can attach up to {{max}} photos.", max }));
        return;
      }

      setBusy(true);
      const added = [];
      for (const file of list.slice(0, room)) {
        if (!ACCEPTED.includes(file.type)) {
          setError(t("photos.type", { defaultValue: "{{name}} is not a JPEG, PNG or WebP image.", name: file.name }));
          continue;
        }
        if (file.size > MAX_BYTES) {
          setError(t("photos.size", { defaultValue: "{{name}} is larger than 8 MB.", name: file.name }));
          continue;
        }
        try {
          const dataBase64 = await readAsDataUrl(file);
          const result = await uploadMarketplaceMedia({ dataBase64, originalName: file.name, listingId });
          added.push({
            imageUrl: resolveMediaUrl(result.media.publicUrl),
            mediaId: result.media.id,
            isPrimary: false,
            sortOrder: 0,
          });
        } catch (uploadError) {
          setError(uploadError?.message || t("photos.failed", { defaultValue: "That upload failed." }));
        }
      }
      setBusy(false);
      if (added.length) onChange([...images, ...added].map((image, index) => ({ ...image, sortOrder: index, isPrimary: index === 0 })));
    },
    [images, listingId, max, onChange, t]
  );

  const move = (from, to) => {
    if (from === to || from === null || to === null) return;
    const next = [...images];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next.map((image, index) => ({ ...image, sortOrder: index, isPrimary: index === 0 })));
  };

  const remove = (index) => {
    const next = images.filter((_, position) => position !== index);
    onChange(next.map((image, position) => ({ ...image, sortOrder: position, isPrimary: position === 0 })));
  };

  return (
    <div className="mk-photos">
      <ul className="mk-photos__list">
        {images.map((image, index) => (
          <li
            key={image.mediaId || image.imageUrl || index}
            className={`mk-photos__item ${index === 0 ? "is-cover" : ""}`}
            draggable
            onDragStart={() => {
              dragIndex.current = index;
            }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              move(dragIndex.current, index);
              dragIndex.current = null;
            }}
          >
            <img src={image.imageUrl} alt="" />
            {index === 0 ? <span className="mk-photos__cover">{t("photos.cover", { defaultValue: "Cover" })}</span> : null}
            <span className="mk-photos__tools">
              {/* Dragging is the fast path; these keep reordering reachable
                  without a pointer. */}
              <button
                type="button"
                onClick={() => move(index, index - 1)}
                disabled={index === 0}
                aria-label={t("photos.moveEarlier", { defaultValue: "Move photo earlier" })}
              >
                <Icon name="chevronRight" size={14} className="mk-rot180" />
              </button>
              <button
                type="button"
                onClick={() => move(index, index + 1)}
                disabled={index === images.length - 1}
                aria-label={t("photos.moveLater", { defaultValue: "Move photo later" })}
              >
                <Icon name="chevronRight" size={14} />
              </button>
              <button
                type="button"
                onClick={() => remove(index)}
                aria-label={t("photos.remove", { defaultValue: "Remove photo" })}
              >
                <Icon name="trash" size={14} />
              </button>
            </span>
          </li>
        ))}

        {images.length < max ? (
          <li>
            <button
              type="button"
              className={`mk-photos__drop ${dragOver ? "is-over" : ""}`}
              onClick={() => inputRef.current?.click()}
              onDragOver={(event) => {
                event.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragOver(false);
                addFiles(event.dataTransfer?.files);
              }}
            >
              <Icon name={busy ? "spinner" : "camera"} size={20} className={busy ? "mk-spin" : ""} />
              <span>
                {busy
                  ? t("photos.uploading", { defaultValue: "Uploading…" })
                  : t("photos.drop", { defaultValue: "Drop photos or browse" })}
              </span>
            </button>
          </li>
        ) : null}
      </ul>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(",")}
        multiple
        className="mk-sr-only"
        onChange={(event) => {
          addFiles(event.target.files);
          event.target.value = "";
        }}
      />

      <p className="mk-hint">
        {t("photos.hint", {
          defaultValue: "JPEG, PNG or WebP, up to 8 MB each. The first photo is what buyers see in the grid.",
        })}
      </p>
      {error ? (
        <p className="mk-field-error" role="alert">
          {error}
        </p>
      ) : null}
      {images.length ? (
        <Button variant="quiet" size="sm" onClick={() => onChange([])}>
          {t("photos.clear", { defaultValue: "Remove all photos" })}
        </Button>
      ) : null}
    </div>
  );
}
