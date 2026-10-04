import React from 'react';

/**
 * Logo using the actual logo image file.
 * size = rendered pixel size (default 34).
 */
export default function Logo({ size = 34 }) {
  return (
    <img
      src="/Logo.png"
      alt="Serpentora"
      style={{ width: size, height: size, objectFit: 'contain', display: 'block', flexShrink: 0 }}
    />
  );
}
