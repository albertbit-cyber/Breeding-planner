# Testing And Quality Audit

## Test Strategy Today

The repository has meaningful unit and domain tests, but coverage is uneven and there is no end-to-end test layer.

Broadly:

- core genetics and planner logic have unit/domain tests
- some lab services have targeted tests
- shared auth client logic has targeted tests
- backend auth and selected service logic have tests
- UI integration coverage is thin
- browser E2E coverage is absent

## Frontend And Shared Test Inventory

Frontend and root-level tests currently include:

| Area | Example files | What it covers |
|---|---|---|
| Main app utility behavior | [`src/App.test.js`](../../src/App.test.js) | Selected helpers extracted from `App.jsx` |
| Lab utility layout logic | [`src/features/lab/utils/labelLayout.test.js`](../../src/features/lab/utils/labelLayout.test.js), [`src/features/lab/utils/labelSizing.test.js`](../../src/features/lab/utils/labelSizing.test.js) | Label dimensions and layout |
| Lab certificate logic | [`src/services/lab/certificateTemplate.test.ts`](../../src/services/lab/certificateTemplate.test.ts) | Certificate field mapping |
| Lab genetics update logic | [`src/services/lab/geneticsUpdateEngine.test.ts`](../../src/services/lab/geneticsUpdateEngine.test.ts) | Snake genetics mutation rules from lab results |
| Numbering helpers | [`src/services/lab/orderNumber.test.ts`](../../src/services/lab/orderNumber.test.ts), [`src/services/lab/testNumber.test.ts`](../../src/services/lab/testNumber.test.ts) | Human-readable order/test number formatting |
| Pricing | [`src/services/pricing/calculateLabOrderPrice.test.js`](../../src/services/pricing/calculateLabOrderPrice.test.js), [`tests/labPricing.test.ts`](../../tests/labPricing.test.ts) | Lab price calculations |
| Shared API config/client | [`src/shared/config/api.test.js`](../../src/shared/config/api.test.js), [`src/shared/apiClient.test.js`](../../src/shared/apiClient.test.js) | API URL rules, auth refresh handling |
| Genetics and goals | [`src/genetics/punnett.test.ts`](../../src/genetics/punnett.test.ts), [`tests/genetics.test.ts`](../../tests/genetics.test.ts), [`tests/goals.test.ts`](../../tests/goals.test.ts), [`tests/score.test.ts`](../../tests/score.test.ts) | Domain engine coverage |
| Planner utilities | [`tests/planner.test.ts`](../../tests/planner.test.ts), [`tests/labelPresets.test.ts`](../../tests/labelPresets.test.ts), [`tests/qrLookupInput.test.ts`](../../tests/qrLookupInput.test.ts) | Planner-adjacent logic |

## Backend Test Inventory

Backend tests currently include:

| File | Coverage |
|---|---|
| [`server/src/tests/auth.test.ts`](../../server/src/tests/auth.test.ts) | Register/login/recovery/auth flows |
| [`server/src/tests/labConfigService.test.ts`](../../server/src/tests/labConfigService.test.ts) | Catalog/pricing service behavior |
| [`server/src/tests/orderNumber.test.ts`](../../server/src/tests/orderNumber.test.ts) | Backend order numbering |

## What Is Covered Well Enough To Be Useful

The current tests are most useful in these areas:

- deterministic genetics calculations
- lab numbering helpers
- certificate field mapping
- genetics mutation rules after lab results
- shared auth refresh behavior
- selected backend service validations

These tests are valuable because they protect high-risk logic without depending on a browser.

## Major Gaps

### No Browser E2E Coverage

There are no Playwright/Cypress/Selenium style end-to-end tests in the repository.

Implication:

- login, breeder workflows, lab workflows, and certificate UI behavior are primarily verified manually

### Limited UI Integration Tests

Most screen-level behavior is not exercised through rendered component tests. This is especially important because much of the breeder product lives in one large component.

### Partial Backend Test Depth

The backend has tests, but they do not comprehensively cover every route/service combination, role check, or order lifecycle edge case.

### Type Safety Does Not Cover The Main Monolith

The root TypeScript configuration does not typecheck `.jsx` files. That leaves the main active file, `src/App.jsx`, outside strict type checking.

## CI And Release Automation

Current GitHub Actions appear focused on build/deploy packaging rather than test enforcement:

- GitHub Pages deployment workflow
- Windows installer build workflow

What is missing:

- required frontend test workflow
- required backend test workflow
- required lint/typecheck workflow
- browser E2E workflow

This means passing CI is not the same thing as the repository being well tested.

## Useful Local Verification Commands

Frontend:

```bash
npm run build
npm test
```

Backend:

```bash
cd server
npm run build
npm test
```

Targeted examples:

```bash
npm test -- src/shared/apiClient.test.js
npm test -- src/services/lab/geneticsUpdateEngine.test.ts
cd server && npm test -- src/tests/auth.test.ts
```

## Quality Recommendations

Immediate:

- add a CI workflow that runs frontend build, backend build, frontend tests, and backend tests on every PR
- add smoke tests for login, order creation, result submission, and certificate rendering

Next:

- add browser E2E coverage for breeder and lab critical paths
- add component-level tests around the most fragile breeder UI flows
- expand backend route coverage beyond auth and selected service slices

Longer-term:

- move more active frontend logic into typed modules that can be tested in isolation
