# Lab Order Frontend API Migration Report

Date: 2026-05-17
Scope: Step 70

## Result

No frontend lab order flow was migrated in this pass.

## Reason

The required database-backed E2E environment is not available yet. Migrating UI behavior without runtime validation would risk hiding backend/data issues.

## Existing State

The frontend hosted API client already includes backend calls for several lab order flows, but local-store/service fallback code remains in breeder/lab app surfaces.

## Recommended First Frontend Flow

Migrate lab order list view first.

Why:

- read-only
- easier rollback
- verifies auth/ownership
- avoids status/payment mutation until list/detail are proven

## Required Before Implementation

- local/staging DB configured
- backend running
- login verified
- lab order route tests passing
- at least one seeded/test order available

