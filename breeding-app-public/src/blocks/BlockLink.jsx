import React from 'react';
import { Link } from 'react-router-dom';

const EXTERNAL = /^(https?:|mailto:|tel:)/i;

/**
 * Content links are authored as plain strings, so the renderer decides how to
 * follow them: router navigation for in-site paths, a real anchor for anything
 * that leaves the site. This matters more than it looks — the breeder app now
 * lives on a different host, so every "Login" and "Get started" target is an
 * absolute URL that a router <Link> would mangle into a relative path.
 */
export default function BlockLink({ href, children, ...rest }) {
  const target = String(href || '').trim();
  if (!target) return null;

  if (EXTERNAL.test(target)) {
    return <a href={target} {...rest}>{children}</a>;
  }
  return <Link to={target} {...rest}>{children}</Link>;
}

const VARIANT_CLASS = {
  primary: 'btn btn-primary',
  gold: 'btn btn-gold',
  outline: 'btn btn-outline',
};

/** A CTA authored as `{ label, href, variant }`. */
export function BlockButton({ action, size = 'btn-lg', style }) {
  if (!action || !action.label) return null;
  const variant = VARIANT_CLASS[action.variant] || VARIANT_CLASS.primary;
  return (
    <BlockLink href={action.href} className={size ? `${variant} ${size}` : variant} style={style}>
      {action.label}
    </BlockLink>
  );
}
