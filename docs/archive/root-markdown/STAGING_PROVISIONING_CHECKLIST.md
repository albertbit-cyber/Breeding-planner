# Staging Provisioning Checklist

Date: 2026-05-20

## Required Infrastructure

- Isolated staging PostgreSQL.
- Staging backend runtime.
- Staging breeder frontend host.
- Staging lab frontend host.
- Isolated upload/media storage.
- Provider secret management.
- HTTPS domains/subdomains.
- Monitoring/alerting destination.

## Required Secrets

- `DATABASE_URL`
- `JWT_SECRET`
- `CORS_ORIGIN`
- `COOKIE_SECURE`
- `COOKIE_SAME_SITE`
- `MAX_UPLOAD_BYTES`
- `JSON_BODY_LIMIT`
- upload storage config if externalized

## Domains

- staging API URL.
- staging lab frontend URL.
- staging breeder frontend URL.
- optional staging marketplace/admin URLs.

## Status

Checklist prepared only. No staging infrastructure was provisioned.

