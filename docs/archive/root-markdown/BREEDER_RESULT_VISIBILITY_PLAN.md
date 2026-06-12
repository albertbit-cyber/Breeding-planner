# Breeder Result Visibility Plan

## Contract

- Breeders should see completed result data for their own orders.
- Breeders should not be able to save drafts, submit results, update statuses, or modify payments.
- Result visibility should be read-only and tied to order ownership.

## UI Location

- `BreederShedTestingPanel.jsx` order cards and order detail expansion.
- Completed orders show latest result and certificate availability.

## Tests

- Backend service visibility tests cover own vs foreign order detail.
- Route tests preserve breeder 403 on result submission routes.
- E2E/API test completes a seeded order as lab, then fetches it as breeder and asserts completed result data is visible.
