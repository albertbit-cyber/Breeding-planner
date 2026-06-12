# Staging PostgreSQL Provisioning Report

Date: 2026-05-21

## Status

Blocked. No staging PostgreSQL was provisioned.

## Missing Inputs

- staging PostgreSQL provider/instance
- staging `DATABASE_URL`
- migration approval
- reset safety decision for staging E2E

## Safety Requirements

- Staging database must be isolated from production.
- Production `DATABASE_URL` must not be used.
- Connection strings must stay in the provider secret manager and out of commits/reports.
- A backup or restore point should exist before staging live E2E if reset-capable tests are used.

