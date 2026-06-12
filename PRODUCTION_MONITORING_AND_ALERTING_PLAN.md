# Production Monitoring And Alerting Plan

Date: 2026-05-20

## Backend Signals

- `/api/health` uptime.
- 5xx error rate.
- Auth login/refresh failures.
- Database connection failures.
- Prisma migration/runtime errors.
- Upload validation/storage failures.
- Marketplace report/block volume.

## Frontend Signals

- Browser errors.
- Failed API calls.
- Login/session failures.
- Lab order workflow failures.
- Breeder order/certificate download failures.

## Alerts

- Backend health down.
- Database unavailable.
- Elevated 5xx rate.
- Elevated auth failures.
- Upload storage write/read failures.
- Unusual marketplace abuse/report spikes.

## Logging Rule

Never log secrets, JWTs, refresh tokens, cookies, authorization headers, database URLs, or full `.env` contents.

