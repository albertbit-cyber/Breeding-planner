# Remaining Local Store Migration Plan

Date: 2026-05-16
Scope: Step 53.

## Priority Order

### 1. Lab Catalog/Pricing Fallback Removal

Risk: Low.

Backend routes:

- `GET /api/lab/tests/catalog`
- `GET /api/lab/tests/pricing`
- `PATCH /api/lab/tests/catalog/:id`
- `PATCH /api/lab/pricing/:id`

Next action:

- Decide whether local fallback/mock handlers remain for offline demo mode.

### 2. Lab Order List/Detail/Status

Risk: Medium.

Backend routes:

- `GET /api/lab/orders`
- `GET /api/lab/orders/:id`
- `PATCH /api/lab/orders/:id/status`
- `PATCH /api/lab/orders/:id/payment`

Tests:

- order ownership
- lab/admin access
- breeder access to own orders only

### 3. Result Draft/Submit

Risk: Medium-high.

Backend routes:

- `POST /api/lab/orders/:id/results/draft`
- `POST /api/lab/orders/:id/results/submit`

Tests:

- lab role required
- order state validation
- result payload validation

### 4. Sample Lookup / QR

Risk: Medium-high.

Backend routes needed:

- QR resolve
- sample lookup
- mark sample received

### 5. Certificates And Labels

Risk: High.

Backend routes needed:

- certificate artifact/PDF
- sample labels
- shipment labels
- public certificate verification

### 6. Genetics Update Engine

Risk: High.

Reason:

- Mutates animal genetics after lab result finalization.
- Needs ownership, audit log, and rollback behavior.

## General Rollback

- Keep local fallback modules until each backend migration is tested.
- Migrate one flow at a time.
- Build/test after each flow.

