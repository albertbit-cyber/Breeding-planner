# Breeder Lab Workflow Audit

Stage: steps 169-190 breeder-facing lab workflow.

## Current Workflow

- Breeder-facing lab order UI lives in `BreederShedTestingPanel.jsx` in both Lab and Breeder app copies.
- The panel lists breeder-visible orders, opens details, shows statuses/payment, shows completed results, and exposes label/certificate actions.
- Breeder order creation uses `createBatchOrder`/`createTestOrderFromBreeder`, which call `POST /api/lab/orders`.
- Breeder order list/detail calls use `GET /api/lab/orders` and `GET /api/lab/orders/:id`.
- Lab result submission remains lab/admin only through `POST /api/lab/orders/:id/results/draft` and `/submit`.

## Backend Rules Observed

- `listOrdersForUser` returns all orders only for admin/lab roles.
- Breeders are scoped to `where: { breederId: user.id }`.
- `getOrderByIdForUser` blocks breeders from foreign orders with 403.
- Buyers/viewers are blocked from lab order workflows.
- Order creation is route-limited to breeders.

## UI/Artifact Notes

- Certificate and label PDFs are generated client-side from backend order/result data.
- There is no backend PDF artifact route for breeder certificate/label download yet.
- Existing Playwright runner starts backend and Lab frontend only. It does not start a dedicated breeder frontend.

## Risks

- Browser-level breeder UI E2E needs a breeder app runner or a shared multi-app Playwright config.
- Client-side PDF generation cannot be fully verified by API-only E2E.
- Local fallback modules still exist for labels, certificate data composition, cart persistence, and demo/dev paths.
