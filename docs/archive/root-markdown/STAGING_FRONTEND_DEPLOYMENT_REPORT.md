# Staging Frontend Deployment Report

Date: 2026-05-21

## Status

Blocked. No staging frontend deployment was performed.

## Blockers

- no approved deployment branch
- no lab frontend hosting target
- no breeder frontend hosting target
- no staging API URL
- no deployment approval

## Intended Order After Approval

1. Configure lab `VITE_API_URL` to the staging API.
2. Build and deploy lab frontend.
3. Configure breeder `VITE_API_URL` to the staging API.
4. Build and deploy breeder frontend.
5. Confirm both frontends use staging backend only.

