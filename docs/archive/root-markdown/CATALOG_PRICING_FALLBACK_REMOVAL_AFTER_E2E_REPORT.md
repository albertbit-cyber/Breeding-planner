# Catalog Pricing Fallback Removal After E2E Report

Date: 2026-05-17

## Result

No code removal needed for the active catalog/pricing client path.

The lab API client already reads catalog/pricing through the shared backend API:

- `fetchTestCatalog()`
- `fetchPricingConfig()`
- `apiRequest("/lab/tests/catalog?...")`
- `apiRequest("/lab/tests/pricing")`

## Files Reviewed

```text
breeding-app-lab/src/features/lab/api/client.ts
breeding-app-lab/src/shared/apiClient.ts
REMAINING_LOCAL_STORE_MIGRATION_PLAN.md
FIRST_FRONTEND_STORE_API_MIGRATION_REPORT.md
```

## Decision

Do not delete broader local lab store modules in this step.

Reason:

- Catalog/pricing runtime reads are already backend-backed in the active shared client.
- The remaining local store modules still support other unmigrated flows.
- Removing them now would exceed the narrow scope of step 86.

## Verification

| Check | Result |
| --- | --- |
| Local backend catalog endpoint | Passed |
| Local backend pricing endpoint | Passed |
| Lab app build | Passed |
| Lab app tests | Passed |
| Backend auth/lab/order tests | Passed |

