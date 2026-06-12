# Dual Mode Cookie Auth Migration Plan

Step: 279

## Strategy

- Keep Bearer tokens as the current runtime default.
- Add cookie auth in parallel.
- Require CSRF only when the request is authenticated through cookies.
- Keep JSON token responses and refresh body support for existing clients.
- Migrate frontend apps one at a time after backend tests pass.

## Rollback

- Frontend can continue using Bearer tokens.
- Backend cookie support can be left unused without breaking current clients.

