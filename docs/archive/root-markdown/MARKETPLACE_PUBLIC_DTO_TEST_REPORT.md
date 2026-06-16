# Marketplace Public DTO Test Report

Step: 276

## Added

- `breeding-app-backend/src/tests/marketplaceDto.test.ts`

## Coverage

- Legacy listing payload private fields are not exposed.
- Marketplace seller private email/password/refresh fields are not exposed.
- Image private storage keys are not exposed.
- Store owner private fields are filtered.

## Validation

- Targeted backend tests passed.

