# Local Fallback Modules Post-E2E Review

Date: 2026-05-17

## Summary

The new E2E suite proves the Lab backend runtime works for health, auth, catalog/pricing, and order list. It is still too early to remove the broader local fallback modules because several Lab workflows continue to import or depend on `db/labStore` and browser `localStorage`.

## Backend-Backed Areas Now Covered

- Lab auth/login
- Lab order list
- Test catalog
- Pricing endpoint reachability

## Remaining Local or Fallback Areas Found

- `breeding-app-lab/src/db/labStore.ts`
- `breeding-app-lab/src/services/lab/resultEntryService.ts`
- `breeding-app-lab/src/services/lab/resultFinalizationService.ts`
- `breeding-app-lab/src/services/lab/certificateService.ts`
- `breeding-app-lab/src/services/lab/adminOversightService.ts`
- `breeding-app-lab/src/services/lab/sampleLookupService.ts`
- `breeding-app-lab/src/services/lab/shedTerminalService.ts`
- `breeding-app-lab/src/services/lab/shipmentLabelService.ts`
- `breeding-app-lab/src/services/lab/geneticsUpdateEngine.ts`
- `breeding-app-lab/src/features/lab/api/testOrderHandlers.ts`
- Lab UI preferences, auth session, batch cart, i18n settings, and appearance settings still intentionally use `localStorage`.

## Recommendation

Do not delete `db/labStore` yet. Continue migrating one workflow at a time and add a browser E2E test before each fallback removal.
