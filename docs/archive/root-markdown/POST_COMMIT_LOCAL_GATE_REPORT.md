# Post Commit Local Gate Report

Date: 2026-05-21

## Status

Blocked because no approved commits were created.

## Last Known Gate

`FINAL_LOCAL_RUNTIME_VALIDATION_REPORT.md` records a passing gate on 2026-05-20:

- backend tests: 19 files, 95 tests
- backend build
- lab build
- breeder build
- full live E2E in elevated local mode
- lab E2E: 19/19
- breeder E2E: 9/9

## Required Gate After Approved Commits

Run in order:

```powershell
cd breeding-app-backend
npm.cmd test
npm.cmd run build
```

```powershell
cd breeding-app-lab
npm.cmd run build
```

```powershell
cd breeding-app-breeder
npm.cmd run build
```

```powershell
npm.cmd run test:e2e:live
```

The live E2E command should use the previously validated elevated local execution mode.

