# Backend API And Data Model

## Backend Purpose

The backend exists to support shared, multi-device parts of the product. It is not the source of truth for the entire breeder planner yet.

Current backend responsibilities:

- authentication
- role-based access control
- lab test catalog
- pricing configuration
- shared order lifecycle
- result submission and retrieval

Primary files:

- [`server/src/app.ts`](../../server/src/app.ts)
- [`server/src/server.ts`](../../server/src/server.ts)
- [`server/src/routes`](../../server/src/routes)
- [`server/src/services`](../../server/src/services)
- [`server/prisma/schema.prisma`](../../server/prisma/schema.prisma)

## Environment Variables

Backend environment variables documented in [`server/.env.example`](../../server/.env.example):

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_SECRET` | Yes | Access/refresh token signing secret |
| `CORS_ORIGIN` | No | Allowed origins |
| `PORT` | No | Defaults to `4000` |
| `NODE_ENV` | No | `development` or `production` |

Frontend environment variables that matter to backend connectivity:

| Variable | Notes |
|---|---|
| `VITE_API_URL` | Shared backend base URL used by the frontend |

## Route Inventory

### Auth Routes

Defined in [`server/src/routes/authRoutes.ts`](../../server/src/routes/authRoutes.ts):

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/auth/register` | Create breeder account |
| `POST` | `/api/auth/login` | Sign in |
| `POST` | `/api/auth/recover-password` | In-app recovery flow |
| `POST` | `/api/auth/refresh` | Refresh expired access token |
| `GET` | `/api/auth/me` | Return current user |

### Lab Config Routes

Defined in [`server/src/routes/labRoutes.ts`](../../server/src/routes/labRoutes.ts):

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/lab/tests/catalog` | Fetch lab test catalog |
| `GET` | `/api/lab/tests/pricing` | Fetch pricing configuration |
| `PATCH` | `/api/lab/tests/catalog/:id` | Edit catalog item |
| `PATCH` | `/api/lab/pricing/:id` | Edit pricing rule |

### Order Routes

Defined in [`server/src/routes/orderRoutes.ts`](../../server/src/routes/orderRoutes.ts):

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/lab/orders/calculate-price` | Server-side price calculation |
| `POST` | `/api/lab/orders` | Create order |
| `GET` | `/api/lab/orders` | List orders |
| `DELETE` | `/api/lab/orders` | Bulk delete orders |
| `DELETE` | `/api/lab/orders/:id` | Delete one order |
| `GET` | `/api/lab/orders/:id` | Get order details |
| `POST` | `/api/lab/orders/:id/results/draft` | Save draft result |
| `POST` | `/api/lab/orders/:id/results/submit` | Submit final result |
| `PATCH` | `/api/lab/orders/:id/status` | Update order status |

## Prisma Data Model

Current main Prisma models:

| Model | Purpose |
|---|---|
| `User` | Auth and role model |
| `ShedTestCatalog` | Test definitions and catalog metadata |
| `PricingConfig` | Pricing logic configuration |
| `ShedTestOrder` | Shared order header |
| `ShedTestOrderAnimal` | Animals attached to an order |
| `ShedTestOrderAnimalTest` | Tests ordered per animal |
| `ShedTestOrderResult` | Saved/submitted result records |

Seed data is defined in [`server/prisma/seed.ts`](../../server/prisma/seed.ts).

## Backend Service Layout

The backend is relatively cleanly separated by service:

- auth logic in auth services and route handlers
- catalog/pricing logic in lab configuration services
- order creation and mutation logic in order services

Controllers are generally thin. Service files are the real behavior layer.

## Shared Backend Boundaries

Important architectural reality:

- the backend is authoritative for shared lab and auth behavior
- it is not authoritative for all breeder planner state
- the frontend still contains compatibility logic for local-mode behavior

This means backend changes should be reviewed in the context of `src/features/lab/api/client.ts`, not in isolation.

## Known Gaps And Caveats

The frontend compatibility client explicitly shows that some operations are not fully supported on the shared backend path yet. Examples include:

- creating new catalog tests from the shared path
- some pending shed/batch-style operations
- certain download/admin utilities
- some payment-status related actions

For a new developer, this is a warning sign: not every feature visible in local lab services or old UI affordances is guaranteed to exist end-to-end on the backend.

## Migration History

The Prisma migrations indicate an actively evolving backend. The current state includes multiple recent migrations for:

- refresh-token auth support
- lab order numbering
- catalog metadata expansion

Treat schema history as active project history, not a stable long-settled layer.
