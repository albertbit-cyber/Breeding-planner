# API Endpoints Reference

Generated for Step 25.

## Current Backend Route Groups

The extracted backend currently carries these route groups from the original `server/src/app.ts`:

- `GET /health`
- `GET /api/health`
- `/api/auth`
- `/api/breeder`
- `/api/profiles`
- `/api/listings`
- `/api/inquiries`
- `/api/searches`
- `/api/notifications`
- `/api/subscriptions`
- `/api/marketplace`
- `/api/mobile`
- `/api/admin`
- `/api/lab`
- `/api/lab/orders`

## Required Route Groups By App

### Breeder App

| Feature | Route group | Status |
| --- | --- | --- |
| Auth/session | `/api/auth` | Existing |
| Backend health | `/api/health` | Existing |
| Breeder snapshot | `/api/breeder/snapshot` | Existing route group, verify exact endpoint |
| Profiles | `/api/profiles` | Existing |
| My listings | `/api/listings`, `/api/marketplace/listings` | Existing route groups |
| Genetic test orders | `/api/lab/orders` | Existing route group |
| Granular animals | `/api/breeder/animals` | Needed if replacing snapshot-only sync |
| Granular pairings | `/api/breeder/pairings` | Needed if replacing snapshot-only sync |
| Clutches/egg boxes/hatchlings | `/api/breeder/clutches`, `/api/breeder/egg-boxes`, `/api/breeder/hatchlings` | Needed |
| Spaces/racks/tubs | `/api/breeder/spaces`, `/api/breeder/rooms`, `/api/breeder/racks`, `/api/breeder/tubs` | Needed |

### Admin App

| Feature | Route group | Status |
| --- | --- | --- |
| Auth/session | `/api/auth` | Existing |
| Admin dashboard/users/reports | `/api/admin` | Existing |
| Subscriptions/tiers | `/api/subscriptions/admin/*` | Existing route group |
| Marketplace moderation | `/api/admin`, `/api/marketplace/admin` | Existing route groups |
| Audit logs | `/api/admin/audit-logs` | Existing route group, verify UI contract |
| Global settings | `/api/admin/settings` | Needed |
| Support diagnostics | `/api/admin/support/*` | Needed |

### Lab App

| Feature | Route group | Status |
| --- | --- | --- |
| Auth/session | `/api/auth` | Existing |
| Lab catalog/pricing | `/api/lab` | Existing route group |
| Lab orders | `/api/lab/orders` | Existing |
| Sample status | `/api/lab/orders/:id/status` or sample-specific routes | Existing route group, verify exact contract |
| Result drafts/finalization | `/api/lab/orders/:id/results`, `/api/lab/orders/:id/finalize` | Existing route group, verify exact contract |
| Certificates | `/api/lab/orders/:id/certificate` | Needed or verify existing |
| QR sample lookup | `/api/lab/qr/*` | Needed or verify existing |

### Marketplace App

| Feature | Route group | Status |
| --- | --- | --- |
| Auth/session | `/api/auth` | Existing |
| Browse listings | `/api/marketplace/listings` | Existing |
| Listing detail | `/api/marketplace/listings/:id` | Existing |
| Public listing view | `/api/marketplace/public/listings` | Needed if unauthenticated public browsing is required |
| Inquiries | `/api/inquiries`, `/api/marketplace/listings/:id/inquiries` | Existing route group, verify public/buyer flow |
| Conversations/messages | `/api/marketplace/conversations`, `/api/marketplace/messages` | Existing route group |
| Favorites | `/api/marketplace/listings/:id/favorite` | Existing route group |
| Saved searches | `/api/searches` | Existing |
| Notifications | `/api/notifications` | Existing |

## Permission Rules

- All writes require authentication.
- Admin routes require `super_admin`, `admin`, or narrowly scoped support/moderator roles.
- Lab routes require `lab_owner`, `lab_staff`, `admin`, or `super_admin`, except breeder-safe order submission.
- Breeder private routes require owner checks.
- Marketplace public routes must expose only approved public listing/profile fields.
- Marketplace seller routes require listing ownership or admin moderation permission.

## Response Shape

Recommended standard response:

```json
{
  "data": {},
  "meta": {},
  "error": null
}
```

Recommended standard error:

```json
{
  "message": "Human readable error",
  "code": "ERROR_CODE",
  "details": {}
}
```

