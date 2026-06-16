# Staging Environment Architecture Plan

Step: 256

## Goal

Create a staging environment that is isolated from local and production data.

## Components

- Staging backend.
- Staging PostgreSQL database.
- Staging object/media storage.
- Staging frontend URLs for breeder, lab, admin, and marketplace.
- Separate JWT secret and CORS origins.

## Rules

- Never reuse production database credentials.
- Never point deterministic reset at staging unless a staging-only reset command is explicitly created.
- Use seeded demo data only.
- Use short-lived test secrets.
- Keep deployment manual until CI is consistently green.

## Recommended Gates

- Backend tests/build.
- Shared tests/build.
- Lab and breeder builds.
- Deterministic local E2E.
- Staging smoke test after deployment.
