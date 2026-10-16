import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowCounterClockwise, CaretRight, ForkKnife, MagnifyingGlass, QrCode, X } from "@phosphor-icons/react";
import { buildLocationIndex, dueFeeds, geneticsText, isRetired, searchSnakes, sexLetter, snakeImage } from "./fieldLogic.js";
import PhotoImg from "../../components/PhotoImg.jsx";
import "./field.css";

// The phone's home screen: scan, see what is due, get to an animal in one tap. Everything
// here reads the real store; nothing is cached separately for the phone.

function AnimalRow({ snake, location, meta, onOpen, onLog, logLabel }) {
  const { t } = useTranslation();
  const image = snakeImage(snake);
  const sex = sexLetter(snake);
  const genetics = geneticsText(snake);
  return (
    <li className="fld-row">
      <button type="button" className="fld-row__main" onClick={() => onOpen(snake)}>
        <span className="fld-row__avatar" aria-hidden="true">
          {image ? <PhotoImg src={image} variant="thumb" alt="" /> : <span>{String(snake.name || snake.id || "?").slice(0, 1)}</span>}
        </span>
        <span className="fld-row__text">
          <span className="fld-row__title">
            <bdi>{snake.name || snake.id}</bdi>
            {sex ? (
              <span className={`fld-row__sex fld-row__sex--${sex}`} aria-label={sex === "F" ? t("snake.sex.female", { defaultValue: "Female" }) : t("snake.sex.male", { defaultValue: "Male" })}>
                {sex}
              </span>
            ) : null}
          </span>
          <span className="fld-row__sub">
            {genetics ? <bdi>{genetics}</bdi> : <bdi>{snake.id}</bdi>}
          </span>
          {(meta || location) && (
            <span className="fld-row__meta">
              {meta ? <span className={`fld-row__due ${meta.tone ? `fld-row__due--${meta.tone}` : ""}`}>{meta.text}</span> : null}
              {location ? <span className="fld-row__loc"><bdi>{location}</bdi></span> : null}
            </span>
          )}
        </span>
        <CaretRight size={18} className="fld-row__chevron" aria-hidden="true" />
      </button>
      {onLog && (
        <button type="button" className="fld-row__log" onClick={() => onLog(snake)} aria-label={logLabel || t("field.logAction", { name: snake.name || snake.id, defaultValue: "Log for {{name}}" })}>
          <ForkKnife size={20} weight="bold" aria-hidden="true" />
          <span className="fld-row__log-caption" aria-hidden="true">{t("field.logShort", { defaultValue: "Log" })}</span>
        </button>
      )}
    </li>
  );
}

export default function FieldScreen({
  snakes = [],
  spaces = null,
  recentIds = [],
  getNextFeedCycleEvent,
  onScan,
  onOpenSnake,
  onQuickLog,
  notice = null,
  onDismissNotice,
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");

  const locationIndex = useMemo(() => buildLocationIndex(spaces || {}), [spaces]);
  const due = useMemo(() => dueFeeds(snakes, getNextFeedCycleEvent), [snakes, getNextFeedCycleEvent]);
  const results = useMemo(() => searchSnakes(snakes, query), [snakes, query]);
  const recent = useMemo(() => {
    const byId = new Map((Array.isArray(snakes) ? snakes : []).map((s) => [String(s?.id || ""), s]));
    return (Array.isArray(recentIds) ? recentIds : []).map((id) => byId.get(String(id))).filter((s) => s && !isRetired(s));
  }, [snakes, recentIds]);
  const liveCount = useMemo(() => (Array.isArray(snakes) ? snakes.filter((s) => s && !s.isDemo && !isRetired(s)).length : 0), [snakes]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => onDismissNotice?.(), 4500);
    return () => window.clearTimeout(timer);
  }, [notice, onDismissNotice]);

  const dueMeta = (row) => {
    if (row.overdueDays <= 0) return { text: t("field.dueToday", { defaultValue: "Due today" }), tone: "today" };
    return { text: t("field.overdueDays", { count: row.overdueDays, defaultValue: "{{count}} days overdue", defaultValue_one: "{{count}} day overdue" }), tone: "overdue" };
  };

  const searching = query.trim().length > 0;

  return (
    <section className="fld" aria-label={t("field.title", { defaultValue: "Field" })}>
      <div className="fld-top">
        <button type="button" className="fld-scan" onClick={onScan}>
          <QrCode size={28} weight="bold" aria-hidden="true" />
          <span className="fld-scan__text">
            <strong>{t("field.scan", { defaultValue: "Scan a tag" })}</strong>
            <small>{t("field.scanHint", { defaultValue: "Opens the animal's card" })}</small>
          </span>
        </button>
        <label className="fld-search">
          <MagnifyingGlass size={18} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("field.searchPlaceholder", { defaultValue: "Name, ID or morph" })}
            aria-label={t("field.search", { defaultValue: "Find an animal" })}
            autoComplete="off"
            enterKeyHint="search"
          />
          {searching && (
            <button type="button" className="fld-search__clear" onClick={() => setQuery("")} aria-label={t("field.clearSearch", { defaultValue: "Clear search" })}>
              <X size={16} weight="bold" />
            </button>
          )}
        </label>
      </div>

      {searching ? (
        <div className="fld-section">
          <h2 className="fld-section__title">{t("field.results", { count: results.length, defaultValue: "{{count}} matches", defaultValue_one: "{{count}} match" })}</h2>
          {results.length ? (
            <ul className="fld-list">
              {results.map((snake) => (
                <AnimalRow key={snake.id} snake={snake} location={locationIndex.get(String(snake.id))} onOpen={onOpenSnake} onLog={(s) => onQuickLog(s, "feed")} />
              ))}
            </ul>
          ) : (
            <p className="fld-empty">{t("field.noMatches", { defaultValue: "No animal matches that. Try the ID on the tag." })}</p>
          )}
        </div>
      ) : (
        <>
          <div className="fld-section">
            <h2 className="fld-section__title">
              {t("field.dueTitle", { defaultValue: "Feeds due" })}
              {due.length ? <span className="fld-count">{due.length}</span> : null}
            </h2>
            {due.length ? (
              <ul className="fld-list">
                {due.map((row) => (
                  <AnimalRow
                    key={row.snake.id}
                    snake={row.snake}
                    location={locationIndex.get(String(row.snake.id))}
                    meta={dueMeta(row)}
                    onOpen={onOpenSnake}
                    onLog={(s) => onQuickLog(s, "feed")}
                    logLabel={t("field.logFeed", { name: row.snake.name || row.snake.id, defaultValue: "Log a feed for {{name}}" })}
                  />
                ))}
              </ul>
            ) : (
              <p className="fld-empty">
                {liveCount
                  ? t("field.nothingDue", { defaultValue: "Nothing is due. Feeds appear here once an animal has a feeding interval and an accepted feed." })
                  : t("field.noAnimals", { defaultValue: "Add your animals on the Home tab and they show up here." })}
              </p>
            )}
          </div>

          {recent.length > 0 && (
            <div className="fld-section">
              <h2 className="fld-section__title">{t("field.recent", { defaultValue: "Recent" })}</h2>
              <ul className="fld-list">
                {recent.map((snake) => (
                  <AnimalRow key={snake.id} snake={snake} location={locationIndex.get(String(snake.id))} onOpen={onOpenSnake} onLog={(s) => onQuickLog(s, "feed")} />
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {notice && (
        <div className="fld-toast" role="status">
          <span>{notice.message}</span>
          {notice.onUndo && (
            <button type="button" onClick={() => { notice.onUndo(); onDismissNotice?.(); }}>
              <ArrowCounterClockwise size={16} weight="bold" aria-hidden="true" />
              {t("field.undo", { defaultValue: "Undo" })}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
