# QR Lookup Backend Contract Plan

## Current Contract

No dedicated shared backend QR lookup route exists yet.

The Lab frontend accepts QR payloads and tokens, then resolves them against synthetic sample tokens derived from backend order data.

## Future Route Recommendation

- `POST /api/lab/samples/resolve`
- Payload options:
  - `sampleId`
  - `qrToken`
  - `rawQrString`
- Roles:
  - `admin`
  - `lab`
- Errors:
  - `401` unauthenticated
  - `403` forbidden
  - `400` malformed input
  - `404` sample not found

