import React, { useEffect, useReducer } from 'react';
import { getPhotoResolver } from '../services/cloudPhotos';
import { isPhotoRef } from '../services/photoRefs';

/**
 * The address to put in an <img> for any stored photo value: an inline `data:` photo, an ordinary
 * URL, or a `photo:{id}` reference to cloud storage. References resolve to a short-lived signed
 * URL (or this device's own copy), and are asked for again shortly before that URL expires, so an
 * animal card left open for an hour does not end up with a dead image.
 *
 * `variant` "thumb" asks for the small WebP where one was stored; lists and grids should use it.
 */
export function usePhotoSrc(value, variant = 'full') {
  const [, rerender] = useReducer((count) => count + 1, 0);
  const isRef = isPhotoRef(value);

  useEffect(() => {
    if (!isRef) return undefined;
    const resolver = getPhotoResolver();
    let cancelled = false;
    let timer = null;
    const run = async () => {
      await resolver.resolve(value, variant);
      if (cancelled) return;
      rerender();
      const refreshAt = resolver.refreshAt(value);
      if (refreshAt) timer = setTimeout(run, Math.max(5000, refreshAt - Date.now()));
    };
    run();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [value, variant, isRef]);

  if (!isRef) return typeof value === 'string' ? value : '';
  return getPhotoResolver().peek(value, variant);
}

/** A link that opens a stored photo full size, for any photo value. */
export function PhotoLink({ src, children, ...rest }) {
  const resolved = usePhotoSrc(src, 'full');
  return <a href={resolved || undefined} {...rest}>{children}</a>;
}

/** An <img> for a stored photo value. Renders nothing until a reference has an address. */
export default function PhotoImg({ src, variant = 'full', alt = '', ...rest }) {
  const resolved = usePhotoSrc(src, variant);
  if (!resolved) return null;
  return <img src={resolved} alt={alt} {...rest} />;
}
