import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  fetchMyStoredPhotos,
  fetchStoredPhotoUrls,
  uploadMarketplaceMedia,
  uploadMarketplaceMediaFromPhoto,
} from "../../shared/apiClient";
import { getSharedApiConfig } from "../../shared/config/api";
import { resolveMediaUrl } from "../api";
import Button from "./Button";
import Icon from "./Icon";

const MAX_BYTES = 8 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

// A signed photo URL is absolute on Supabase; the local storage driver hands back an /api/ path.
const resolvePhotoUrl = (url) => {
  const value = String(url || "");
  if (!value.startsWith("/api/")) return value;
  const config = getSharedApiConfig();
  return config.ok && config.baseUrl ? `${config.baseUrl}${value.slice(4)}` : value;
};

/**
 * The seller's own animal photos, already in cloud storage from the breeder app. Choosing one
 * copies it onto the listing on the server: nothing is downloaded or uploaded from here.
 */
function StoredPhotoPicker({ onPick, onClose, disabled }) {
  const { t } = useTranslation("marketplace");
  const [state, setState] = useState({ loading: true, photos: [], error: "" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { photos } = await fetchMyStoredPhotos();
        const ids = (photos || []).slice(0, 100).map((photo) => photo.id);
        const { photos: urls } = ids.length ? await fetchStoredPhotoUrls(ids) : { photos: [] };
        const byId = new Map((urls || []).map((entry) => [entry.id, entry]));
        const shown = (photos || [])
          .filter((photo) => byId.has(photo.id))
          .map((photo) => ({ ...photo, thumbUrl: resolvePhotoUrl(byId.get(photo.id).thumbUrl) }));
        if (!cancelled) setState({ loading: false, photos: shown, error: "" });
      } catch (error) {
        if (!cancelled) setState({ loading: false, photos: [], error: error?.message || "" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mk-photos__picker" role="region" aria-label={t("photos.fromAnimalsTitle", { defaultValue: "Your animal photos" })}>
      <div className="mk-photos__picker-head">
        <span>{t("photos.fromAnimalsTitle", { defaultValue: "Your animal photos" })}</span>
        <Button variant="quiet" size="sm" onClick={onClose}>
          {t("photos.fromAnimalsClose", { defaultValue: "Close" })}
        </Button>
      </div>
      {state.loading ? (
        <p className="mk-hint" role="status">{t("photos.fromAnimalsLoading", { defaultValue: "Loading your photos…" })}</p>
      ) : state.error ? (
        <p className="mk-field-error" role="alert">{state.error}</p>
      ) : !state.photos.length ? (
        <p className="mk-hint">
          {t("photos.fromAnimalsEmpty", {
            defaultValue: "No photos in your cloud storage yet. Photos taken in the breeder app appear here once they have synced.",
          })}
        </p>
      ) : (
        <ul className="mk-photos__list">
          {state.photos.map((photo) => (
            <li key={photo.id}>
              <button
                type="button"
                className="mk-photos__pick"
                disabled={disabled}
                onClick={() => onPick(photo.id)}
                aria-label={`${t("photos.fromAnimalsPick", { defaultValue: "Add this photo" })}${photo.animalId ? `: ${photo.animalId}` : ""}`}
              >
                <img src={photo.thumbUrl} alt="" loading="lazy" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

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
  const [picking, setPicking] = useState(false);
  const dragIndex = useRef(null);

  const addStoredPhoto = useCallback(
    async (photoId) => {
      if (images.length >= max) {
        setError(t("photos.full", { defaultValue: "You can attach up to {{max}} photos.", max }));
        return;
      }
      setError("");
      setBusy(true);
      try {
        const result = await uploadMarketplaceMediaFromPhoto({ photoId, listingId });
        if (images.some((image) => image.mediaId === result.media.id)) return;
        const next = [...images, { imageUrl: resolveMediaUrl(result.media.publicUrl), mediaId: result.media.id, isPrimary: false, sortOrder: 0 }];
        onChange(next.map((image, index) => ({ ...image, sortOrder: index, isPrimary: index === 0 })));
      } catch (uploadError) {
        setError(uploadError?.message || t("photos.failed", { defaultValue: "That upload failed." }));
      } finally {
        setBusy(false);
      }
    },
    [images, listingId, max, onChange, t]
  );

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

      {picking ? (
        <StoredPhotoPicker onPick={addStoredPhoto} onClose={() => setPicking(false)} disabled={busy || images.length >= max} />
      ) : images.length < max ? (
        <Button variant="quiet" size="sm" icon="photo" onClick={() => setPicking(true)}>
          {t("photos.fromAnimals", { defaultValue: "Use a photo of your animals" })}
        </Button>
      ) : null}

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
