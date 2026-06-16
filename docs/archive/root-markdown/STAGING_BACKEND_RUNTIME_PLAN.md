# Staging Backend Runtime Plan

Date: 2026-05-20

## Runtime Shape

- One backend API deployment.
- HTTPS only.
- Production-mode CORS with explicit staging origins.
- Cookie-preferred auth with Bearer fallback preserved.
- Prisma migrations applied against staging PostgreSQL only.
- Upload storage outside the repo working tree.

## Deployment Boundary

Deploy backend first, verify `/api/health`, then deploy frontends.

## Status

Planned only. No staging target or credentials were provided, and the instruction says not to deploy publicly yet.

