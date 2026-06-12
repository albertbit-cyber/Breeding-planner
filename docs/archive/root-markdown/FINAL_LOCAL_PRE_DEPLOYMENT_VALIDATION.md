# Final Local Pre-Deployment Validation

Date: 2026-05-21

## Result

Passed.

## Commit Context

Validated after these staging review commits:

- `a37644f` - `Stage runtime code for staging review`
- `9560ed3` - `Add staging database migration and reset tooling`
- `dfb86a2` - `Add deterministic E2E and CI staging tooling`

## Commands

Backend tests:

```powershell
cd breeding-app-backend
npm.cmd test
```

Result:

- 19 test files passed
- 95 tests passed

Backend build:

```powershell
cd breeding-app-backend
npm.cmd run build
```

Result: passed.

Lab build:

```powershell
cd breeding-app-lab
npm.cmd run build
```

Result: passed.

Breeder build:

```powershell
cd breeding-app-breeder
npm.cmd run build
```

Result: passed.

Full local live E2E:

```powershell
npm.cmd run test:e2e:live
```

Result:

- lab live E2E: 19/19 passed
- breeder live E2E: 9/9 passed

## Warnings

- Lab and breeder builds still report circular chunk warnings.
- Breeder build still reports `pdfjs-dist` eval warning.
- Breeder bundle remains large.
- Live E2E reports Prisma `package.json#prisma` deprecation warning.
- Live E2E web server output confirms local `.env` loading; no `.env` contents were printed.

## Blocker Conditions

No local validation blockers remain after the commit preparation gate.

## Push/Deployment Status

- No push was performed.
- No staging deployment was performed.
- No production deployment was performed.

