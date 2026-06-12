# Staging Frontend Runtime Plan

Date: 2026-05-20

## Apps

- Breeder frontend.
- Lab frontend.
- Marketplace/admin frontends when included in the deployment target.

## Required Runtime Config

- Explicit `VITE_API_URL` pointing at the staging backend `/api`.
- HTTPS frontend URLs included in backend `CORS_ORIGIN`.
- Credentials/cookies enabled through existing shared API clients.

## Validation

After frontend deployment, run:

- Login smoke.
- Backend health smoke.
- Lab order smoke.
- Breeder order/certificate smoke.
- Upload/report/block smoke.

## Status

Planned only. No staging frontend hosting target was provided.

