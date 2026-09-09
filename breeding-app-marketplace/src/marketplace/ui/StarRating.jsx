import React, { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import Icon from "./Icon";

/**
 * Ratings used to be a concatenated string of star glyphs -- no accessible
 * name, no half star, and nothing a stylesheet could reach. This renders the
 * real value with a clipped overlay for the fractional star, and reads out as
 * a number.
 */
export function StarRating({ value = 0, count, size = 15, showValue = true }) {
  const { t } = useTranslation("marketplace");
  const clipId = useId();
  const rating = Math.max(0, Math.min(5, Number(value) || 0));
  const percent = (rating / 5) * 100;

  return (
    <span className="mk-stars" role="img" aria-label={t("reviews.aria", { defaultValue: "Rated {{rating}} out of 5", rating: rating.toFixed(1) })}>
      <span className="mk-stars__track" style={{ "--mk-star-size": `${size}px` }}>
        <span className="mk-stars__row" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((index) => (
            <Icon key={index} name="star" size={size} />
          ))}
        </span>
        <span className="mk-stars__row mk-stars__row--fill" aria-hidden="true" style={{ clipPath: `inset(0 ${100 - percent}% 0 0)`, WebkitClipPath: `inset(0 ${100 - percent}% 0 0)` }} data-clip={clipId}>
          {[0, 1, 2, 3, 4].map((index) => (
            <Icon key={index} name="starFilled" size={size} />
          ))}
        </span>
      </span>
      {showValue ? <b className="mk-tnum">{rating.toFixed(1)}</b> : null}
      {count !== undefined ? (
        <span className="mk-muted mk-xs">{t("reviews.count", { defaultValue: "{{count}} reviews", count: Number(count) || 0 })}</span>
      ) : null}
    </span>
  );
}

/** The write side: five buttons, keyboard reachable, with a live label. */
export function StarInput({ value = 0, onChange, label }) {
  const { t } = useTranslation("marketplace");
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <span className="mk-stars-input" role="radiogroup" aria-label={label || t("reviews.yourRating", { defaultValue: "Your rating" })}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          role="radio"
          aria-checked={value === star}
          aria-label={t("reviews.starLabel", { defaultValue: "{{count}} stars", count: star })}
          className={`mk-stars-input__btn ${star <= shown ? "is-on" : ""}`}
          onMouseEnter={() => setHover(star)}
          onMouseLeave={() => setHover(0)}
          onFocus={() => setHover(star)}
          onBlur={() => setHover(0)}
          onClick={() => onChange?.(star)}
        >
          <Icon name={star <= shown ? "starFilled" : "star"} size={22} />
        </button>
      ))}
    </span>
  );
}

export default StarRating;
