# Production Security Operations Plan

Date: 2026-05-20

## Required Operations

- Secret rotation process.
- Security event review cadence.
- Admin account review cadence.
- Backup restore test cadence.
- Dependency audit cadence.
- Incident response checklist.

## Runtime Protections

- HTTPS only.
- Secure cookies.
- Explicit production CORS origins.
- Rate limiters enabled in production.
- Cookie-preferred auth with Bearer fallback until migration is complete.
- Upload validation and size limits.

## Incident Response

1. Identify impacted service.
2. Disable affected feature if possible.
3. Rotate exposed secrets.
4. Preserve logs without exposing secrets.
5. Patch and redeploy.
6. Document timeline and corrective actions.

