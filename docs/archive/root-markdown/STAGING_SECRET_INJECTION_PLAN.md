# Staging Secret Injection Plan

Date: 2026-05-20

## Requirements

- Inject secrets through hosting provider secret management, not committed `.env` files.
- Rotate staging secrets separately from production.
- Keep staging and production databases isolated.
- Do not expose JWT secrets, database passwords, upload storage credentials, or provider tokens in reports.

## Minimum Secrets

- `DATABASE_URL`
- `JWT_SECRET`
- Upload storage credentials if a cloud/object store is used.

## Rotation Plan

1. Create new secret value.
2. Deploy backend with new value.
3. Confirm login/refresh works.
4. Revoke previous value where supported.

## Status

Planned only. No real secrets were generated or stored.

