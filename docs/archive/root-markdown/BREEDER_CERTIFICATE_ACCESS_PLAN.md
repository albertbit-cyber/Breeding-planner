# Breeder Certificate Access Plan

## Current Behavior

- Certificate artifacts are generated in the frontend from completed order/result data.
- `getBreederCertificateArtifact` builds the certificate client-side after fetching order data.

## Rules

- Certificate actions should be available only when the breeder owns the order and at least one completed result exists.
- Incomplete orders should show certificate unavailable.
- Backend order ownership checks remain the primary authorization boundary.

## E2E Strategy

- Current API-level E2E can verify the data required for certificate generation is visible.
- Full PDF view/download browser assertions require a breeder frontend Playwright runner.
