import React from "react";
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconBell,
  IconCalendarEvent,
  IconCamera,
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconCircleCheck,
  IconDna2,
  IconEye,
  IconEyeOff,
  IconFlag,
  IconGridDots,
  IconHeart,
  IconHeartFilled,
  IconLoader2,
  IconMail,
  IconMapPin,
  IconMessage,
  IconPhoto,
  IconPlus,
  IconRefresh,
  IconScale,
  IconSearch,
  IconSettings,
  IconShieldCheck,
  IconStar,
  IconStarFilled,
  IconTag,
  IconTrash,
  IconTruck,
  IconUser,
  IconX,
} from "@tabler/icons-react";

/**
 * The marketplace's icon set.
 *
 * It used to be emoji -- a lizard for the empty state, a multiplication sign
 * for close, two heart characters for the favourite toggle, and a run of star
 * glyphs concatenated into a string for ratings. Those inherit the reader's
 * emoji font, cannot take a stroke weight, and in the ratings case could not
 * carry a half star or an accessible name.
 *
 * One family, one stroke weight, one size scale. Icons are decoration by
 * default: give them a `label` only when the icon is the whole control.
 */
const ICONS = {
  alert: IconAlertTriangle,
  back: IconArrowLeft,
  bell: IconBell,
  calendar: IconCalendarEvent,
  camera: IconCamera,
  check: IconCheck,
  chevronDown: IconChevronDown,
  chevronRight: IconChevronRight,
  circleCheck: IconCircleCheck,
  dna: IconDna2,
  eye: IconEye,
  eyeOff: IconEyeOff,
  flag: IconFlag,
  grid: IconGridDots,
  heart: IconHeart,
  heartFilled: IconHeartFilled,
  mail: IconMail,
  message: IconMessage,
  photo: IconPhoto,
  pin: IconMapPin,
  plus: IconPlus,
  refresh: IconRefresh,
  scale: IconScale,
  search: IconSearch,
  settings: IconSettings,
  shield: IconShieldCheck,
  spinner: IconLoader2,
  star: IconStar,
  starFilled: IconStarFilled,
  tag: IconTag,
  trash: IconTrash,
  truck: IconTruck,
  user: IconUser,
  x: IconX,
};

export default function Icon({ name, size = 18, label, className = "", stroke = 1.75, ...rest }) {
  const Glyph = ICONS[name];
  if (!Glyph) return null;
  return (
    <Glyph
      size={size}
      stroke={stroke}
      className={`mk-icon ${className}`.trim()}
      aria-hidden={label ? undefined : "true"}
      aria-label={label}
      role={label ? "img" : undefined}
      focusable="false"
      {...rest}
    />
  );
}
