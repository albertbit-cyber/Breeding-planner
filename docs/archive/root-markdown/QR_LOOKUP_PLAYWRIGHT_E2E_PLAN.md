# QR Lookup Playwright E2E Plan

## Scenario

Open Sample Intake, enter a raw QR payload for the seeded synthetic sample, resolve it, and verify linked order/sample context.

## Assertions

- `GET /api/lab/orders` is called.
- QR payload resolves to the seeded sample.
- Linked order context appears.
- Malformed input keeps the resolve button disabled and no result context appears.

