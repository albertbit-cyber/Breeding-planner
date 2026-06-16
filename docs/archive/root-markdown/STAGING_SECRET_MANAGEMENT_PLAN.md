# Staging Secret Management Plan

Date: 2026-05-20

## Strategy

- Store secrets in the hosting provider secret manager.
- Do not commit `.env` values.
- Separate staging secrets from production secrets.
- Rotate staging secrets independently.

## Required Reviews

- Confirm no secret values in reports.
- Confirm no `.env` files are staged.
- Confirm staging and production database URLs are distinct.

