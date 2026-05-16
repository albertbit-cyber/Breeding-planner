# First API Contract

Date: 2026-05-16
Scope: Step 49.

## Flow

Lab catalog and pricing reads.

## Endpoints

### List Catalog

```http
GET /api/lab/tests/catalog?breederView=true|false
Authorization: Bearer <token>
```

Roles:

- `admin`
- `super_admin`
- `lab_owner`
- `lab_staff`
- `breeder`

Query:

- `breederView=true`: return only active tests visible to breeders.
- `breederView=false`: return full lab/admin catalog.

Response:

```json
{
  "tests": []
}
```

Errors:

- `401` when missing/invalid token.
- `500` for unexpected backend/database failures.

### Get Active Pricing

```http
GET /api/lab/tests/pricing
Authorization: Bearer <token>
```

Response:

```json
{
  "pricing": {}
}
```

Errors:

- `401` when missing/invalid token.
- `400` when no active pricing configuration exists.

### Calculate Order Price

```http
POST /api/lab/orders/calculate-price
Authorization: Bearer <token>
Content-Type: application/json
```

Request:

```json
{
  "animals": []
}
```

Response:

```json
{
  "animalCount": 0,
  "tier": "tier_1_9",
  "perAnimal": [],
  "totalMorphCharges": 0,
  "totalSexCharges": 0,
  "total": 0
}
```

## Backend Test Coverage

Added backend route contract tests in:

- `breeding-app-backend/src/tests/labRoutes.test.ts`

Covered:

- authenticated breeder-view catalog read
- unauthenticated catalog request rejection
- authenticated active pricing read

