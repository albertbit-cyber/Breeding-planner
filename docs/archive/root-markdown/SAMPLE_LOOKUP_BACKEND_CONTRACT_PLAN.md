# Sample Lookup Backend Contract Plan

## Current Contract

No dedicated backend sample lookup route exists in the shared backend.

The current behavior uses backend order APIs and frontend synthetic sample construction.

## Future Route Recommendation

- `GET /api/lab/samples/:sampleId`
- Roles:
  - `admin`
  - `lab`
  - owning `breeder` if breeder lookup is required
- Success:
  - sample summary
  - linked order summary
  - linked animal summary
  - requested tests
- Errors:
  - `401` unauthenticated
  - `403` forbidden
  - `404` sample not found
  - `400` invalid sample ID

