# Railway Deployment Handoff For Claude

Date: 2026-06-08

## Purpose

This handoff documents all Railway backend deployment attempts, failures, fixes already committed, current blockers, and the exact next steps. It is intended for Claude or another agent continuing the Railway staging backend deployment.

Repository:

```text
D:\Git Clone\Breeding-planner
```

Target branch:

```text
staging/runtime-review-20260521
```

Backend service root directory for Railway:

```text
breeding-app-backend
```

Do not deploy production.

## Original Goal

Deploy the first real staging backend using:

- Railway backend
- Supabase staging PostgreSQL
- branch `staging/runtime-review-20260521`

Required safety rules:

- Never use production DB.
- Never deploy production.
- Do not expose secrets/tokens.
- Do not run destructive Prisma commands.
- Preserve deterministic E2E compatibility.
- Preserve rollback safety.
- Keep changes minimal.

## Important Files Already Created

Read these first:

- `CHATGPT_FIRST_REAL_DEPLOYMENT_HANDOFF.md`
- `FIRST_REAL_DEPLOYMENT_EXECUTION_PLAN.md`
- `STAGING_DEPLOYMENT_APPROVAL_REVIEW.md`
- `FIRST_REAL_STAGING_BACKEND_DEPLOYMENT_REPORT.md`
- `RAILWAY_BACKEND_LOCKFILE_FIX_REPORT.md`

## Branch And Commit History

Initial documented deployment commits:

```text
a37644f Stage runtime code for staging review
9560ed3 Add staging database migration and reset tooling
dfb86a2 Add deterministic E2E and CI staging tooling
```

Commits added during Railway build-fix attempts:

```text
296815e Pin backend Prisma versions for Railway build
c2210e0 Remove stale pnpm lockfile for Railway build
8bb552d Fix Railway lockfile deployment error
```

Latest pushed staging branch head at last verification:

```text
8bb552d145471d43b658ec86664323b24d4e5f56
```

Branch pushed to:

```text
origin/staging/runtime-review-20260521
```

## What Was Successfully Done

### 1. Staging branch push

The branch `staging/runtime-review-20260521` was pushed successfully.

Remote branch was verified multiple times using:

```bash
git ls-remote --heads origin staging/runtime-review-20260521
```

### 2. Prisma versions pinned

Railway originally failed because `npm ci` reported `package.json` and `package-lock.json` out of sync.

Railway missing packages:

```text
@emnapi/core@1.10.0
@emnapi/runtime@1.10.0
```

Cause:

- Backend used Prisma ranges:

```json
"@prisma/client": "^6.5.0"
"prisma": "^6.5.0"
```

- Railway could resolve a dependency tree inconsistent with the checked-in backend lockfile.

Fix committed:

```text
296815e Pin backend Prisma versions for Railway build
```

Changed:

```json
"@prisma/client": "6.5.0"
"prisma": "6.5.0"
```

Regenerated:

```text
breeding-app-backend/package-lock.json
```

The backend lockfile now contains the missing dependency entries.

### 3. Stale root pnpm lockfile removed

Railway/Railpack detected root `pnpm-lock.yaml`, selected pnpm, and ran:

```bash
pnpm install --frozen-lockfile
```

This failed with:

```text
ERR_PNPM_OUTDATED_LOCKFILE
```

Cause:

- Root `pnpm-lock.yaml` was stale.
- It referenced old Create React App dependencies such as:
  - `@testing-library/dom`
  - `react-scripts`
- The current repo/package setup had moved to Vite/npm.

Fix committed:

```text
c2210e0 Remove stale pnpm lockfile for Railway build
```

Deleted:

```text
pnpm-lock.yaml
```

Expected result:

- Railpack should fall back to npm/package-lock instead of pnpm.

### 4. Backend `npm ci` and build verified locally

After lockfile fixes, backend install and build were tested:

```bash
cd breeding-app-backend
npm ci
npm run build
```

`npm ci` passed after running outside the sandbox.

`npm run build` initially failed with:

```text
src/services/orderService.ts(252,6): error TS7006: Parameter 'sum' implicitly has an 'any' type.
src/services/orderService.ts(252,11): error TS7006: Parameter 'animal' implicitly has an 'any' type.
```

Minimal fix committed:

```text
8bb552d Fix Railway lockfile deployment error
```

File changed:

```text
breeding-app-backend/src/services/orderService.ts
```

Change:

```ts
(sum: number, animal: { tests: Array<{ id: string }> }) => sum + animal.tests.length
```

After this:

```bash
npm ci
npm run build
```

both passed locally in `breeding-app-backend`.

## Railway Deployment Attempts And Failures

### Railway deployment/build ID seen in dashboard

User provided:

```text
3be9f26f-fed3-4157-9036-2cd60bd93ad6
```

Deployment context URL contained:

```text
context=2026-06-02T00:12:53.403812359Z
```

This was an old failed build/deployment snapshot.

Important instruction:

- Do not redeploy the old failed snapshot if it reuses the same old commit/source.
- Trigger a fresh deploy from latest branch head.
- Expected commit to deploy:

```text
8bb552d
```

If Railway shows `dfb86a2`, `296815e`, or `c2210e0`, it is not deploying the latest state.

### Railway build failure 1: npm lockfile out of sync

Error:

```text
npm ci can only install packages when your package.json and package-lock.json are in sync. Please update your lock file with npm install before continuing.
```

Missing:

```text
@emnapi/core@1.10.0
@emnapi/runtime@1.10.0
```

Fix:

- Pin Prisma versions.
- Regenerate backend `package-lock.json`.
- Commit `296815e`.

### Railway build failure 2: pnpm selected from stale root lockfile

Error:

```text
ERR_PNPM_OUTDATED_LOCKFILE
```

Cause:

- Railpack detected root `pnpm-lock.yaml`.
- It selected pnpm even though project should use npm.
- The pnpm lockfile was stale and CRA-era.

Fix:

- Delete root `pnpm-lock.yaml`.
- Commit `c2210e0`.

### Railway build failure 3: TypeScript build error

After install issues were fixed, local backend build showed:

```text
src/services/orderService.ts(252,6): error TS7006
src/services/orderService.ts(252,11): error TS7006
```

Fix:

- Add explicit reducer parameter types.
- Commit `8bb552d`.

## Railway CLI/Auth Problems

Railway CLI was initially not installed or not visible on PATH.

Installed/updated CLI:

```bash
npm install -g @railway/cli
npm update -g @railway/cli
```

CLI path:

```text
C:\Users\alber\AppData\Roaming\npm\railway.cmd
```

CLI reached:

```text
railway 5.5.0
```

But Codex process repeatedly reported:

```text
Unauthorized. Please login with `railway login`
```

User terminal eventually showed:

```text
Logged in as AlbertBit (albertbit@gmail.com)
```

However, Codex process still could not authenticate.

Likely cause:

- Auth session/token was available in the user's interactive PowerShell but not in the Codex process environment.
- Pasted UUID-like tokens were invalid or not Railway API/account tokens.
- Some tokens were pasted into chat and must be treated as compromised/rotated.

Do not reuse any token pasted in chat.

## Railway Project/Service/Environment Information

User provided Railway URL:

```text
https://railway.com/project/8b86d75b-bf43-444f-801e-85498fbcbfaf/service/ce2609d2-db6b-4024-8684-b721e23d297e?environmentId=67ac6be5-caa5-47b5-a1de-648dca048f7b&id=e5c0e845-9f75-46a2-974b-4bc3734a9416&context=2026-06-02T00%3A12%3A53.403812359Z#build
```

Extracted IDs:

```text
Project: 8b86d75b-bf43-444f-801e-85498fbcbfaf
Service: ce2609d2-db6b-4024-8684-b721e23d297e
Environment: 67ac6be5-caa5-47b5-a1de-648dca048f7b
Deployment/build page id: e5c0e845-9f75-46a2-974b-4bc3734a9416
Old deployment id mentioned separately: 3be9f26f-fed3-4157-9036-2cd60bd93ad6
```

Railway config file showed this linked environment:

```text
project: 8b86d75b-bf43-444f-801e-85498fbcbfaf
environment: 67ac6be5-caa5-47b5-a1de-648dca048f7b
environmentName: production
service: ce2609d2-db6b-4024-8684-b721e23d297e
```

Critical safety stop:

- The environment name was `production`.
- Original instructions said never deploy production.
- Therefore no `railway up`, `railway redeploy`, or deployment command was executed from Codex.

## Current Blockers

1. Need a staging Railway environment, not production.
2. Need Railway CLI auth available to the agent/process, or user must run deploy manually from authenticated terminal.
3. Need Railway service root set to:

```text
breeding-app-backend
```

4. Need Railway deployment to use latest branch head:

```text
8bb552d
```

5. Need staging Supabase PostgreSQL `DATABASE_URL`, not production.
6. Need staging variables configured.
7. Need rollback checkpoint/restore safety before real staging migration.

## Railway Variables Needed

Add these to the Railway staging environment only.

Required:

```text
DATABASE_URL
NODE_ENV=staging
JWT_SECRET
COOKIE_SECRET
CSRF_SECRET
JSON_BODY_LIMIT=8mb
```

Likely also needed for hosted browser auth/CORS:

```text
CORS_ORIGIN=https://your-lab-staging-url,https://your-breeder-staging-url
COOKIE_SECURE=true
COOKIE_SAME_SITE=none
```

Upload/runtime variables if uploads are enabled:

```text
MAX_UPLOAD_BYTES=5242880
UPLOAD_STORAGE_DIR=/app/uploads
```

Do not expose secret values in reports or chat.

`DATABASE_URL` must be the Supabase staging PostgreSQL URL only.

## Exact Next Steps For Claude

### Step 1: Verify local Git state

From repo root:

```bash
cd "D:\Git Clone\Breeding-planner"
git branch --show-current
git rev-parse --short HEAD
git status --short -- package.json package-lock.json pnpm-lock.yaml breeding-app-backend/package.json breeding-app-backend/package-lock.json breeding-app-backend/src/services/orderService.ts
```

Expected:

```text
branch: staging/runtime-review-20260521
HEAD: 8bb552d
pnpm-lock.yaml absent
backend package files clean
orderService.ts clean
```

There may be many unrelated dirty local files. Do not stage them.

### Step 2: Verify backend install/build locally

From backend root:

```bash
cd "D:\Git Clone\Breeding-planner\breeding-app-backend"
npm ci
npm run build
```

Expected:

- `npm ci` passes.
- `npm run build` passes.

Do not run:

```bash
npm audit fix --force
prisma migrate reset
prisma db push --force-reset
```

### Step 3: Verify Railway auth

```powershell
& "$env:APPDATA\npm\railway.cmd" whoami
```

Must show:

```text
Logged in as AlbertBit (albertbit@gmail.com)
```

If it fails:

- Do not deploy.
- Ask user to login in the same terminal/session.
- Do not ask user to paste tokens in chat.

### Step 4: Verify Railway environment is staging

Do not deploy to environment `production`.

Use Railway dashboard or CLI to find/create staging environment.

If CLI is authenticated, use:

```powershell
& "$env:APPDATA\npm\railway.cmd" environment list --json
```

Find staging environment ID/name.

If only production exists, stop and ask user to create staging environment or explicitly approve a staging environment creation.

### Step 5: Link correct project/service/environment

Use IDs only after confirming the environment is staging:

```powershell
& "$env:APPDATA\npm\railway.cmd" link --project 8b86d75b-bf43-444f-801e-85498fbcbfaf --service ce2609d2-db6b-4024-8684-b721e23d297e --environment <STAGING_ENVIRONMENT_ID_OR_NAME>
```

Then verify:

```powershell
& "$env:APPDATA\npm\railway.cmd" status --json
```

Confirm:

```text
Project is correct.
Service is correct.
Environment is staging, not production.
```

### Step 6: Verify service settings

In Railway dashboard:

```text
Repo: albertbit-cyber/Breeding-planner
Branch: staging/runtime-review-20260521
Root Directory: breeding-app-backend
```

If root directory is repo root, fix it to:

```text
breeding-app-backend
```

### Step 7: Trigger fresh deploy from latest commit

Preferred dashboard action:

- Deploy latest commit from branch `staging/runtime-review-20260521`.
- Confirm source commit is `8bb552d`.

Do not redeploy the old failed snapshot if it stays on old deployment `3be9f2...` or commit `dfb86a2`.

CLI option if linked and staging confirmed:

```powershell
cd "D:\Git Clone\Breeding-planner\breeding-app-backend"
& "$env:APPDATA\npm\railway.cmd" up --detach
```

Only run this if the linked Railway environment is definitely staging.

### Step 8: Monitor logs

Use dashboard or CLI:

```powershell
& "$env:APPDATA\npm\railway.cmd" logs
```

Watch for:

- npm selected, not pnpm.
- No `ERR_PNPM_OUTDATED_LOCKFILE`.
- No `npm ci package-lock out of sync`.
- TypeScript build passes.
- Prisma migration deploy runs only against staging DB.
- Backend starts.

### Step 9: Validate health

After Railway gives a URL:

```bash
curl https://<railway-backend-url>/api/health
```

Or PowerShell:

```powershell
Invoke-WebRequest -UseBasicParsing https://<railway-backend-url>/api/health
```

Record status code and response without exposing secrets.

### Step 10: Update report

Update or create deployment report with:

- Railway environment name/ID
- Railway URL
- deployed commit
- install/build result
- migration result
- health result
- unresolved warnings
- rollback checkpoint status
- next frontend steps

## Key Warnings For Claude

- Do not deploy to Railway environment named `production`.
- Do not use the provided environment ID unless it is confirmed staging. It was observed as `production`.
- Do not paste or print tokens.
- Do not commit unrelated dirty worktree files.
- Do not regenerate root package files unless Railway is intentionally installing from root.
- Do not restore `pnpm-lock.yaml`.
- Do not run destructive DB commands.
- Do not run staging E2E reset unless staging DB is confirmed disposable or reset is explicitly approved.

## Current Expected Good Deployment Source

```text
Repo: albertbit-cyber/Breeding-planner
Branch: staging/runtime-review-20260521
Root Directory: breeding-app-backend
Commit: 8bb552d
Package manager: npm
Lockfile: breeding-app-backend/package-lock.json
No root pnpm-lock.yaml
```
