import React from "react";
import { useTranslation } from "react-i18next";
import Icon from "./Icon";

/**
 * Status, in a shape you can read without reading.
 *
 * Availability, "New", shipping and pickup all used to render as identically
 * weighted badges, so a card could carry five of them and none of them meant
 * anything. Shipping and pickup are filter concerns and live on the detail
 * page now; a card shows at most two pills.
 */

const VARIANTS = {
  available: "ok",
  featured: "ok",
  reserved: "hold",
  sold: "sold",
  draft: "quiet",
  hidden: "quiet",
  archived: "quiet",
};

export const availabilityVariant = (value) => VARIANTS[String(value || "").toLowerCase()] || "ok";

export function Pill({ tone = "quiet", icon, children, className = "", ...rest }) {
  return (
    <span className={`mk-pill mk-pill--${tone} ${className}`.trim()} {...rest}>
      {icon ? <Icon name={icon} size={13} /> : null}
      {children}
    </span>
  );
}

export function AvailabilityPill({ availability, status }) {
  const { t } = useTranslation("marketplace");
  const value = String(availability || status || "available").toLowerCase();
  const tone = availabilityVariant(value);
  const icon = tone === "ok" ? "circleCheck" : undefined;
  return (
    <Pill tone={tone} icon={icon}>
      {t(`availability.${value}`, { defaultValue: value.charAt(0).toUpperCase() + value.slice(1) })}
    </Pill>
  );
}

export default Pill;
