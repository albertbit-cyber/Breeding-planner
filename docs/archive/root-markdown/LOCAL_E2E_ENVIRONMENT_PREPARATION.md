# Local E2E Environment Preparation

Date: 2026-05-17
Scope: Step 61

## Current Status

Local E2E cannot start yet because no confirmed backend `.env` and no confirmed local/staging database were found.

## Backend Env To Create Manually

Create:

```text
breeding-app-backend/.env
```

Use placeholders from:

```text
breeding-app-backend/.env.example
```

Do not commit this file.

## Frontend Env To Create Manually

For the first frontend E2E target, create one local env file.

Recommended first target:

```text
breeding-app-lab
```

or:

```text
breeding-app-breeder
```

Use:

```env
VITE_API_URL=http://127.0.0.1:4000/api
PUBLIC_URL=/
```

Do not add backend secrets to frontend env files.

## Recommended E2E Order

1. Confirm database is local/staging.
2. Create backend `.env`.
3. Create one frontend `.env`.
4. Run Prisma generate/migrate/seed.
5. Start backend.
6. Verify backend health and DB check.
7. Start one frontend.
8. Log in with a seeded/test user.
9. Verify lab catalog/pricing uses backend requests.

## Acceptance Criteria

- Backend starts.
- Database check passes.
- Frontend starts.
- Login succeeds.
- Catalog/pricing API calls return data from backend.
- No local fallback masks backend failure.

