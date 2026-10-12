import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Broom, ForkKnife, Scales, X } from "@phosphor-icons/react";
import { QUICK_LOG_TYPES, buildQuickLogEntry, localToday, sexLetter } from "./fieldLogic.js";
import ShedIcon from "./ShedIcon.jsx";

// One bottom sheet for the four quick logs. One or two fields, one primary button, and the
// keeper is back at the rack. Entry shapes come from fieldLogic so they match the desktop.
export default function QuickLogSheet({
  snake,
  type: initialType = "feed",
  onSave,
  onClose,
  lastFeedDefaults = {},
  feedTypeOptions = [],
  feedSizeOptionsByType = {},
}) {
  const { t } = useTranslation();
  const [type, setType] = useState(QUICK_LOG_TYPES.includes(initialType) ? initialType : "feed");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lastWeight = useMemo(() => {
    const weights = Array.isArray(snake?.logs?.weights) ? snake.logs.weights : [];
    const last = weights[weights.length - 1];
    const grams = Number(last?.grams ?? last?.weightGrams ?? snake?.weight);
    return Number.isFinite(grams) && grams > 0 ? grams : "";
  }, [snake]);
  const [form, setForm] = useState(() => ({
    date: localToday(),
    feed: lastFeedDefaults.feed || "Mouse",
    size: lastFeedDefaults.size || "",
    weightGrams: "",
    refused: false,
    grams: lastWeight,
    complete: true,
    notes: "",
  }));

  useEffect(() => {
    setType(QUICK_LOG_TYPES.includes(initialType) ? initialType : "feed");
    setError("");
  }, [initialType, snake?.id]);

  useEffect(() => {
    const onKey = (event) => { if (event.key === "Escape") onClose?.(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!snake || typeof document === "undefined") return null;

  const set = (patch) => setForm((prev) => ({ ...prev, ...patch }));

  const labels = {
    feed: t("field.log.feed", { defaultValue: "Feed" }),
    weight: t("field.log.weight", { defaultValue: "Weight" }),
    shed: t("field.log.shed", { defaultValue: "Shed" }),
    clean: t("field.log.clean", { defaultValue: "Clean" }),
  };
  const icons = { feed: ForkKnife, weight: Scales, shed: ShedIcon, clean: Broom };

  const submit = async (overrides = {}) => {
    setError("");
    setBusy(true);
    try {
      const { key, entry } = buildQuickLogEntry(type, { ...form, ...overrides });
      await onSave?.(type, key, entry);
    } catch (err) {
      setError(err?.message || t("field.log.failed", { defaultValue: "Could not save." }));
      setBusy(false);
      return;
    }
    setBusy(false);
  };

  const sex = sexLetter(snake);
  const feedSizeOptions = feedSizeOptionsByType[form.feed] || Object.values(feedSizeOptionsByType).flat();

  return createPortal(
    <div className="fld-sheet-backdrop" onClick={(event) => { if (event.target === event.currentTarget) onClose?.(); }}>
      <div className="fld-sheet" role="dialog" aria-modal="true" aria-label={t("field.log.title", { name: snake.name || snake.id, defaultValue: "Log for {{name}}" })}>
        <div className="fld-sheet__handle" aria-hidden="true" />
        <div className="fld-sheet__head">
          <div className="min-w-0">
            <div className="fld-sheet__name"><bdi>{snake.name || snake.id}</bdi>{sex ? <span className="fld-sheet__sex">{sex}</span> : null}</div>
            <div className="fld-sheet__id"><bdi>{snake.id}</bdi></div>
          </div>
          <button type="button" className="fld-icon-btn" onClick={onClose} aria-label={t("field.close", { defaultValue: "Close" })}>
            <X size={20} weight="bold" />
          </button>
        </div>

        <div className="fld-seg" role="tablist" aria-label={t("field.log.typeLabel", { defaultValue: "What to log" })}>
          {QUICK_LOG_TYPES.map((key) => {
            const Icon = icons[key];
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={type === key}
                className={type === key ? "is-active" : ""}
                onClick={() => { setType(key); setError(""); }}
              >
                <Icon size={18} weight={type === key ? "fill" : "regular"} aria-hidden="true" />
                <span>{labels[key]}</span>
              </button>
            );
          })}
        </div>

        <form className="fld-sheet__body" onSubmit={(event) => { event.preventDefault(); submit(); }}>
          <label className="fld-field fld-field--inline">
            <span>{t("field.log.date", { defaultValue: "Date" })}</span>
            <input type="date" value={form.date} max={localToday()} onChange={(e) => set({ date: e.target.value })} />
          </label>

          {type === "feed" && (
            <>
              <div className="fld-field">
                <span>{t("field.log.offered", { defaultValue: "Offered" })}</span>
                <div className="fld-chips">
                  {feedTypeOptions.map((option) => (
                    <button key={option} type="button" className={form.feed === option ? "is-active" : ""} onClick={() => set({ feed: option })}>{option}</button>
                  ))}
                </div>
              </div>
              <div className="fld-field">
                <span>{t("field.log.size", { defaultValue: "Size" })}</span>
                <div className="fld-chips fld-chips--scroll">
                  {feedSizeOptions.map((option) => (
                    <button key={option} type="button" className={form.size === option ? "is-active" : ""} onClick={() => set({ size: option })}>{option}</button>
                  ))}
                </div>
              </div>
            </>
          )}

          {type === "weight" && (
            <label className="fld-field">
              <span>{t("field.log.grams", { defaultValue: "Grams" })}</span>
              <input
                type="number"
                inputMode="decimal"
                min="1"
                step="1"
                autoFocus
                value={form.grams}
                onChange={(e) => set({ grams: e.target.value })}
                placeholder={lastWeight ? String(lastWeight) : "0"}
              />
            </label>
          )}

          {type === "shed" && (
            <div className="fld-field">
              <span>{t("field.log.shedResult", { defaultValue: "Result" })}</span>
              <div className="fld-chips">
                <button type="button" className={form.complete ? "is-active" : ""} onClick={() => set({ complete: true })}>{t("field.log.shedComplete", { defaultValue: "Complete" })}</button>
                <button type="button" className={!form.complete ? "is-active" : ""} onClick={() => set({ complete: false })}>{t("field.log.shedIncomplete", { defaultValue: "Incomplete" })}</button>
              </div>
            </div>
          )}

          <label className="fld-field">
            <span>{t("field.log.notes", { defaultValue: "Notes" })}</span>
            <input type="text" value={form.notes} onChange={(e) => set({ notes: e.target.value })} placeholder={t("field.log.notesPlaceholder", { defaultValue: "Optional" })} />
          </label>

          {error && <p className="fld-error" role="alert">{error}</p>}

          <div className="fld-sheet__actions">
            {type === "feed" && (
              <button type="button" className="fld-btn" disabled={busy} onClick={() => submit({ refused: true })}>
                {t("field.log.refused", { defaultValue: "Refused" })}
              </button>
            )}
            <button type="submit" className="fld-btn fld-btn--primary" disabled={busy}>
              {type === "feed" ? t("field.log.saveFed", { defaultValue: "Ate" })
                : type === "weight" ? t("field.log.saveWeight", { defaultValue: "Save weight" })
                : type === "shed" ? t("field.log.saveShed", { defaultValue: "Save shed" })
                : t("field.log.saveClean", { defaultValue: "Mark cleaned" })}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
