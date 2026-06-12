# SecurityEvent Test Report

## Added
- `breeding-app-backend/src/tests/securityEventService.test.ts`

## Coverage
- Security events are persisted through `securityEvent.create`.
- Sensitive metadata fields are redacted recursively.

## Validation
Targeted tests and full backend test suite passed.

