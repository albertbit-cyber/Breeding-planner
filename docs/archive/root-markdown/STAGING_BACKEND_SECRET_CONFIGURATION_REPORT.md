# Staging Backend Secret Configuration Report

Date: 2026-05-21

## Status

Blocked. No staging backend secrets were configured.

## Required Secret Names

- `DATABASE_URL`
- `JWT_SECRET`
- `CORS_ORIGIN`
- `COOKIE_SECURE`
- `COOKIE_SAME_SITE`
- `MAX_UPLOAD_BYTES`
- `JSON_BODY_LIMIT`
- upload storage provider settings if externalized

## Safety Decision

Use the hosting provider secret manager. Do not commit `.env` files or expose values in reports. Staging and production secrets must be separate and independently rotated.

