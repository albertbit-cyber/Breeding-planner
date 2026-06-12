# Deployment Secrets Checklist

Date: 2026-05-20

## Required Secrets

- `DATABASE_URL`
- `JWT_SECRET`
- cookie/session-related settings
- upload storage credentials if external storage is used
- monitoring provider token if required

## Frontend Environment

- `VITE_API_URL`

## Rotation Policy

- Rotate staging secrets independently from production.
- Rotate on exposure, staff changes, or provider incident.
- Keep old value only long enough for safe transition.

## Revocation

- Remove leaked secret from provider.
- Redeploy with new value.
- Invalidate affected sessions/tokens if relevant.

## Rule

Use placeholders only in files and reports.

