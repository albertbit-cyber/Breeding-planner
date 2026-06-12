# Production Infrastructure Separation Plan

Date: 2026-05-20

## Principle

Production must be fully isolated from local and staging environments.

## Required Separation

- Separate production PostgreSQL instance.
- Separate production upload/media storage.
- Separate production secrets.
- Separate production frontend origins.
- Separate production backend deployment.
- Separate production monitoring and alerting channels.

## Safety Rules

- Do not run deterministic E2E reset against production.
- Do not reuse staging credentials in production.
- Do not point staging frontends at production API.
- Do not point production frontends at staging API.
- Keep rollback artifacts for backend and frontends.

## Current Status

Planning only. Production infrastructure was not touched.

