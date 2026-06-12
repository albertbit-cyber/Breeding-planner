# Final Staging Topology Report

Date: 2026-05-20

## Recommended Staging Shape

- One shared backend API.
- One shared staging PostgreSQL database.
- Separate deployed frontend apps for breeder, lab, marketplace, and admin.
- HTTPS only.
- Cookie-preferred auth with cross-origin credentials configured explicitly.
- Upload storage isolated from the repo working tree.

## Pre-Staging Gate Required

Before staging deployment, the root live E2E command must complete reliably:

`npm.cmd run test:e2e:live`

## Current Local Evidence

The isolated app suites pass, but the cross-app runner still times out.

