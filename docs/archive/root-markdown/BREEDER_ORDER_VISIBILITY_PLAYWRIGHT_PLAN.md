# Breeder Order Visibility Playwright Plan

## Runner Constraint

The current Playwright project is under `breeding-app-lab` and starts:

- backend at `127.0.0.1:4000`
- Lab frontend at `127.0.0.1:4173`

It does not start the standalone breeder app, so true browser navigation through the breeder UI is not available in this stage.

## Implementable Scope

- Add Playwright API tests against the local backend.
- Authenticate as seeded breeder through `/api/auth/login`.
- Assert breeder can list own seeded order.
- Assert breeder can open seeded order detail.
- Assert status and animal/test data are present.

## Deferred Scope

- Browser-level breeder UI selectors.
- PDF download event assertions for breeder certificate/labels.
- Dedicated breeder frontend startup and storage-state setup.
