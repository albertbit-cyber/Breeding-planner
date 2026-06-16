# Missing Backend Endpoints

Generated for Step 24 and used by Step 25.

## Summary

The backend already has broad route groups for auth, breeder snapshots, lab orders, marketplace, admin, subscriptions, profiles, notifications, and mobile.

Missing or not-yet-cleanly-separated endpoints are mostly about replacing local frontend SQLite/lab services and narrowing frontend apps to backend-only access.

## Endpoint Work Needed

### Breeder App

| Need | Suggested endpoint | Notes |
| --- | --- | --- |
| Animal CRUD beyond full snapshot sync | `GET/POST/PATCH/DELETE /api/breeder/animals` | Current app uses snapshot-style sync; granular routes would reduce payload coupling. |
| Pairing CRUD beyond full snapshot sync | `GET/POST/PATCH/DELETE /api/breeder/pairings` | Needed before removing large local planner state assumptions. |
| Clutch/egg box/hatchling CRUD | `GET/POST/PATCH /api/breeder/clutches`, `/api/breeder/egg-boxes`, `/api/breeder/hatchlings` | Must preserve laid-date clutch numbering and split egg box rules. |
| Spaces/rooms/racks/tubs CRUD | `/api/breeder/spaces`, `/api/breeder/rooms`, `/api/breeder/racks`, `/api/breeder/tubs` | Current app owns this in local planner state. |
| Breeder lab order workflow | `/api/lab/orders` and breeder-safe order routes | Existing backend order routes should be reviewed and mapped to breeder UI. |

### Lab App

| Need | Suggested endpoint | Notes |
| --- | --- | --- |
| Replace local lab store order lists | `GET /api/lab/orders` | Existing route group likely covers part of this; map UI handlers directly to backend. |
| Sample intake/status updates | `PATCH /api/lab/orders/:id/status`, sample-specific route if needed | Backend must enforce `lab_owner`/`lab_staff`. |
| Result draft/save/submit/finalize | `/api/lab/orders/:id/results`, `/api/lab/orders/:id/finalize` | Existing finalization routes should be made the only write path. |
| Test catalog management | `/api/lab/catalog` | Existing lab routes likely cover catalog, but frontend still imports local services. |
| Pricing management | `/api/lab/pricing` | Existing lab routes likely cover pricing, but frontend still imports local services. |
| Certificate generation | `/api/lab/orders/:id/certificate` | Should return generated certificate metadata/file. |

### Marketplace App

| Need | Suggested endpoint | Notes |
| --- | --- | --- |
| Public unauthenticated browsing if desired | `GET /api/marketplace/public/listings` | Current marketplace routes require auth in places; public/private boundary must be explicit. |
| Listing detail public view | `GET /api/marketplace/public/listings/:id` | Must expose only public-safe fields. |
| Buyer inquiry form | `POST /api/marketplace/listings/:id/inquiries` | Existing inquiry routes should be reviewed for public/buyer flow. |
| Messaging thread detail | `/api/marketplace/conversations/:id/messages` | Existing marketplace conversation routes likely cover this; document contract. |

### Admin App

| Need | Suggested endpoint | Notes |
| --- | --- | --- |
| Audit log filters | `GET /api/admin/audit-logs` | Existing route likely present; frontend needs dedicated screen. |
| Global settings | `/api/admin/settings` | Needed for platform-wide configuration. |
| Support diagnostics | `/api/admin/support/*` | Must be admin/support gated and audited. |

## Priority

1. Remove frontend local lab store dependency by mapping lab UI to backend lab routes.
2. Add breeder granular animal/pairing/clutch/spaces routes if snapshot sync is too coarse.
3. Clarify marketplace public versus authenticated route contracts.
4. Add admin settings/support/audit UI contracts.

