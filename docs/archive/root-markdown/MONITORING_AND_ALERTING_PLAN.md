# Monitoring And Alerting Plan

Date: 2026-05-20

## Backend Monitoring

- `/api/health` uptime.
- Error rate.
- Response latency.
- Auth login/refresh failures.
- Prisma/database errors.
- Upload validation failures.
- Marketplace report/block event counts.

## Frontend Monitoring

- Browser runtime errors.
- Failed API calls.
- Login/session refresh failures.
- Lab order workflow failures.
- Breeder certificate/download failures.

## Alerts

- Backend health down.
- Database connection failures.
- Elevated 5xx rate.
- Elevated auth failures.
- Upload storage write failures.

## Logs

Logs must not include secrets, tokens, cookies, database URLs, or raw authorization headers.

