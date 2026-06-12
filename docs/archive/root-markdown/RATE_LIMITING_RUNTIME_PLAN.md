# Rate Limiting Runtime Plan

Step: 268

## Goal

Add runtime abuse protection without disrupting local E2E.

## Recommended Buckets

- Auth write limiter for login/register.
- Password recovery limiter with stricter hourly cap.
- Refresh limiter.
- Marketplace message/contact limiter.
- QR lookup limiter.
- Upload initiation limiter.

## Implemented First

Basic auth write, recovery, and refresh limiters were added for production mode.

