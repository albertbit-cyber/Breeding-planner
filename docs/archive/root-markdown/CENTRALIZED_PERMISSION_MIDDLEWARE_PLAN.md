# Centralized Permission Middleware Plan

Step: 263

## Goal

Reduce duplicated role and ownership checks by using shared helpers for admin, lab, breeder, seller, and owner-or-admin boundaries.

## Plan

- Keep route-level `requireAuth` and `requireRole`.
- Use service-level helpers for ownership-sensitive operations.
- Add focused tests for ownership boundaries.
- Avoid moving all permission checks into route middleware until service contracts are stable.

## First Implementation

Implemented shared helpers in `breeding-app-backend/src/services/permissionHelpers.ts` and started using them in marketplace/listing services.

