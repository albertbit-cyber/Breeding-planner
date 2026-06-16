# Staging PostgreSQL Preparation Report

Date: 2026-05-20

## Required

- A dedicated staging PostgreSQL instance.
- A dedicated staging database user.
- No production data or production credentials.
- Backups enabled before first deployment.
- Migration access limited to deployment/runtime role as appropriate.

## Safety Checks Before Use

1. Confirm `DATABASE_URL` host is the staging host.
2. Confirm database name includes a staging identifier.
3. Confirm no production hostname, database name, or credential is present.
4. Run Prisma migrations against staging only after the URL is verified.
5. Do not run E2E reset against production or shared customer data.

## Status

Not executed. No staging PostgreSQL URL was provided in the workspace.

