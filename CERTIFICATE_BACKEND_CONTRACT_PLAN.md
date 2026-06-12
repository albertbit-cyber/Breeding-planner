# Certificate Backend Contract Plan

## Current Contract

There is no dedicated backend certificate artifact route yet.

The current shared workflow contract is:

- `GET /api/lab/orders/:id` returns completed order/result data.
- The Lab frontend derives certificate summary and renders the PDF locally.

## Future Backend Contract Recommendation

Add a dedicated endpoint later:

- `GET /api/lab/orders/:id/certificate`
- Roles:
  - `admin`
  - `lab`
  - owning `breeder`
- Success:
  - `200`
  - `application/pdf`
  - attachment filename based on certificate number
- Error cases:
  - `401` unauthenticated
  - `403` forbidden/not owner
  - `404` order not found
  - `409` order has no completed result/certificate not available

## This Stage

No backend certificate route was added. The stage tests the currently implemented frontend certificate artifact behavior against shared backend order/result data.

