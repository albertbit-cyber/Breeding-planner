# Staging Monitoring Foundation Plan

Date: 2026-05-20

## Critical Alerts

- Backend `/api/health` down.
- Database connection failure.
- Elevated 5xx rate.
- Login/refresh failures above baseline.
- Upload storage write failure.

## Warning Alerts

- Increased 4xx rate.
- Upload validation rejection spike.
- Marketplace report/block spike.
- Slow response times.
- E2E failure.

## Escalation

1. Notify technical owner.
2. Pause deployments.
3. Review logs and health.
4. Roll back if core workflows are blocked.

## Log Retention

Retain staging logs long enough to diagnose beta issues, but avoid storing secrets or raw credentials.

