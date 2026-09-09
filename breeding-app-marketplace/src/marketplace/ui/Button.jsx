import React, { forwardRef } from "react";
import { Link } from "react-router-dom";
import Icon from "./Icon";

/**
 * Three ranks, and only three.
 *
 * Every button in the marketplace used to be painted by one fourteen-selector
 * rule, so "Browse animals", "Hide filters", "Clear all" and the seller's name
 * on a card all rendered as the same filled primary. `ink` is the one action a
 * screen is actually for; `outline` is the alternative path; `quiet` is
 * everything that is really a link wearing a button's hit area.
 *
 * At most one `ink` per viewport.
 */
const Button = forwardRef(function Button(
  {
    variant = "outline",
    size = "md",
    icon,
    iconAfter,
    busy = false,
    block = false,
    className = "",
    children,
    to,
    href,
    type = "button",
    ...rest
  },
  ref
) {
  const classes = [
    "mk-btn",
    `mk-btn--${variant}`,
    size !== "md" ? `mk-btn--${size}` : "",
    block ? "mk-btn--block" : "",
    !children ? "mk-btn--icon" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const inner = (
    <>
      {busy ? <Icon name="spinner" size={16} className="mk-spin" /> : icon ? <Icon name={icon} size={16} /> : null}
      {children ? <span className="mk-btn__label">{children}</span> : null}
      {iconAfter && !busy ? <Icon name={iconAfter} size={16} /> : null}
    </>
  );

  if (to) {
    return (
      <Link ref={ref} to={to} className={classes} {...rest}>
        {inner}
      </Link>
    );
  }
  if (href) {
    return (
      <a ref={ref} href={href} className={classes} {...rest}>
        {inner}
      </a>
    );
  }
  return (
    <button ref={ref} type={type} className={classes} disabled={busy || rest.disabled} {...rest}>
      {inner}
    </button>
  );
});

export default Button;
