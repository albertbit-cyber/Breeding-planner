# Certificate Workflow Audit

Date: 2026-05-18

## Current Flow

- Completed lab orders show certificate actions in `breeding-app-lab/src/features/lab/pages/OrderDetailsPage.jsx`.
- `View Certificate` and `Download PDF` both call `api.getBreederCertificateArtifact(order.id)`.
- In shared backend mode, `getBreederCertificateArtifact` is implemented in `breeding-app-lab/src/features/lab/api/client.ts`.
- The Lab frontend fetches the shared order from the backend, finds the latest completed result, builds a certificate summary/template, renders a PDF in the browser, and opens/downloads a blob.

## Backend State

- The shared backend does not currently expose a dedicated certificate artifact route.
- Certificate availability is derived from backend order/result data.
- The required backend state is:
  - order exists
  - order has a completed result
  - caller can access the order through normal order APIs

## Selectors

- Order detail heading: `Shed Test Order Details`
- Certificate action button: `View Certificate`
- Download action button inside certificate card: `Download PDF`
- Header completed-order button: `Download Certificate PDF`

## Risks

- Certificate PDF generation is frontend-side and still relies on local PDF utilities.
- Dedicated backend artifact authorization cannot be tested until a backend certificate endpoint exists.
- PDF/font fallback warning remains in Lab unit test runtime.

