# Planning Phase Report

Generated after running planning files `04` through `13`.

## Scope

Only the planning phase was handled.

Included files:

- `04_extract_shared_logic_plan.md`
- `05_backend_api_plan.md`
- `06_database_schema_plan.md`
- `07_create_breeder_repo_plan.md`
- `08_create_admin_repo_plan.md`
- `09_create_lab_repo_plan.md`
- `10_create_marketplace_repo_plan.md`
- `11_create_shared_package_plan.md`
- `12_environment_config_plan.md`
- `13_auth_permissions_plan.md`

Not run:

- `14_actual_repo_split_execution.md`

No app code, backend code, database schema, environment file, or repository files were moved or refactored.

## Agent Workstreams

Three parallel planning agents were used.

| Workstream | Planning files handled | Output files |
| --- | --- | --- |
| Backend/database | `05`, `06` | `BACKEND_API_PLAN.md`, `SHARED_DATABASE_SCHEMA_PLAN.md` |
| Frontend repo extraction | `07`, `08`, `09`, `10` | `BREEDER_REPO_EXTRACTION_PLAN.md`, `ADMIN_REPO_EXTRACTION_PLAN.md`, `LAB_REPO_EXTRACTION_PLAN.md`, `MARKETPLACE_REPO_EXTRACTION_PLAN.md` |
| Shared/env/auth | `11`, `12`, `13` | `SHARED_PACKAGE_PLAN.md`, `ENVIRONMENT_CONFIGURATION_PLAN.md`, `AUTH_AND_PERMISSIONS_PLAN.md` |

Step `04` was already completed before the agent run:

- `SHARED_LOGIC_EXTRACTION_PLAN.md`

## Documents Created

### `SHARED_LOGIC_EXTRACTION_PLAN.md`

Identifies reusable logic that should be extracted before splitting apps.

Covered:

- Genetics logic.
- Quick-add/free text parsing.
- Snake and pairing types.
- Lab statuses and test order types.
- API client helpers.
- Auth roles/scopes.
- Subscription feature catalog.
- Marketplace listing types.
- Label and QR logic.
- Shared UI candidates.
- Backend-only logic that must not move to frontend packages.

### `BACKEND_API_PLAN.md`

Defines the target shared API/backend.

Covered:

- Recommended backend module structure.
- API modules for auth, users, breeders, snakes, pairings, spaces, lab orders, genetic tests, marketplace, messages, subscriptions, admin, and audit logs.
- Authentication and refresh-token strategy.
- Role-based API permissions.
- Important API routes.
- Which apps may call which routes.
- Backend security rules.
- Environment variables.
- Migration path from the current `server/` implementation.

### `SHARED_DATABASE_SCHEMA_PLAN.md`

Defines the target shared database plan.

Covered:

- Table groups for users, roles, breeders, snakes, genetics, pairings, spaces, lab tests, QR samples, certificates, marketplace, messages, subscriptions, payments, settings, and audit logs.
- Purpose and important fields for each table.
- Relationships.
- Ownership rules.
- Role-based access rules.
- PostgreSQL/Supabase row-level security notes.
- Migration risks from the current Prisma schema.

### `BREEDER_REPO_EXTRACTION_PLAN.md`

Plans the future `breeding-app-breeder` repo.

Covered:

- Existing breeder files/folders to copy.
- Files/folders to remove.
- Needed routes/pages.
- Shared package dependencies.
- Backend API dependencies.
- Environment variables.
- Build/test commands.
- Risks and cleanup tasks.

### `ADMIN_REPO_EXTRACTION_PLAN.md`

Plans the future `breeding-app-admin` repo.

Covered:

- Existing admin files/folders.
- Missing admin features.
- Admin routes/pages.
- Shared dependencies.
- Backend API dependencies.
- Required permissions.
- Environment variables.
- Build/test commands.
- Risks and cleanup tasks.

### `LAB_REPO_EXTRACTION_PLAN.md`

Plans the future `breeding-app-lab` repo.

Covered:

- Existing lab files/folders.
- Missing lab features.
- Lab routes/pages.
- Shared dependencies.
- Backend API dependencies.
- Required lab permissions.
- Environment variables.
- Build/test commands.
- Risks and cleanup tasks.

### `MARKETPLACE_REPO_EXTRACTION_PLAN.md`

Plans the future `breeding-app-marketplace` repo.

Covered:

- Existing marketplace files/folders.
- Missing marketplace features.
- Public routes/pages.
- Shared dependencies.
- Backend API dependencies.
- Public/private data boundaries.
- Environment variables.
- Build/test commands.
- Risks and cleanup tasks.

### `SHARED_PACKAGE_PLAN.md`

Plans the future `breeding-app-shared` package.

Covered:

- Recommended package folder structure.
- Files to move from the current app.
- Files that should not be shared.
- Import strategy for all apps.
- Package build setup.
- Versioning strategy.
- Risks.

### `ENVIRONMENT_CONFIGURATION_PLAN.md`

Plans environment variables for the split repos.

Covered:

- Frontend env vars for breeder, admin, lab, and marketplace apps.
- Backend env vars.
- Public versus secret configuration.
- PostgreSQL/Supabase connection rules.
- API base URL rules.
- Local development examples.
- Production deployment examples.
- Security warnings.

### `AUTH_AND_PERMISSIONS_PLAN.md`

Plans shared authentication and permissions.

Covered:

- Target user roles.
- App access per role.
- Route permissions.
- API permissions.
- Database ownership rules.
- Admin override rules.
- Lab access rules.
- Marketplace public/private boundaries.
- Subscription/tier permissions.
- Recommended implementation approach.

## Current Git State

All planning outputs are currently untracked.

Untracked planning files:

- `ADMIN_REPO_EXTRACTION_PLAN.md`
- `AUTH_AND_PERMISSIONS_PLAN.md`
- `BACKEND_API_PLAN.md`
- `BACKUP_BRANCH_REPORT.md`
- `BREEDER_REPO_EXTRACTION_PLAN.md`
- `CODEBASE_SPLIT_AUDIT.md`
- `ENVIRONMENT_CONFIGURATION_PLAN.md`
- `LAB_REPO_EXTRACTION_PLAN.md`
- `MARKETPLACE_REPO_EXTRACTION_PLAN.md`
- `PLANNING_PHASE_REPORT.md`
- `SHARED_DATABASE_SCHEMA_PLAN.md`
- `SHARED_LOGIC_EXTRACTION_PLAN.md`
- `SHARED_PACKAGE_PLAN.md`
- `TARGET_ARCHITECTURE.md`

Git also continues to print:

```text
warning: unable to access 'C:\Users\alber/.config/git/ignore': Permission denied
```

## Next Step

Do not run `14_actual_repo_split_execution.md` until these planning documents are reviewed and committed or intentionally archived.

Recommended next action:

1. Review all generated planning documents.
2. Commit the planning docs if they should be preserved.
3. Update the backup branch if the committed planning docs should be included in the backup point.
4. Only then proceed to Step `14`.

