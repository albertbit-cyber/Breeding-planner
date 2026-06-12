# CDN And Cache Strategy

Date: 2026-05-20

## Frontend

- Hash asset filenames.
- Long-cache hashed JS/CSS/assets.
- No-cache or short-cache `index.html`.
- Invalidate CDN on deployment.

## API

- Do not cache authenticated API responses.
- Do not cache auth/session endpoints.
- Do not cache user-specific lab/breeder data.

## Media

- Cache public approved media.
- Do not cache private signed URLs beyond their expiry.
- Invalidate media when replaced or deleted.

## Security Rule

Never cache responses containing cookies, tokens, or user-private data.

