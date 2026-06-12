# Lab Order Backend Runtime Verification Report

Date: 2026-05-17

## Result

Passed.

Lab order backend runtime was verified against the approved local PostgreSQL database.

## Checks

| Check | Result |
| --- | --- |
| Breeder order list | Passed, 1 order returned |
| Breeder order detail | Passed |
| Lab role status update | Passed, status changed to `received` |
| Lab role payment update | Passed, payment changed to `paid` |
| Authentication | Passed |
| Secrets/tokens printed | No |

## Verified Endpoints

```text
GET /api/lab/orders
GET /api/lab/orders/:id
PATCH /api/lab/orders/:id/status
PATCH /api/lab/orders/:id/payment
```

