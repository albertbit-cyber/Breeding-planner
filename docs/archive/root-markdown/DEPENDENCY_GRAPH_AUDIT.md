# Dependency Graph Audit

Step: 230

## Packages Reviewed

- Root app: `package.json` and `package-lock.json`.
- Backend: `breeding-app-backend/package.json` and lockfile.
- Lab: `breeding-app-lab/package.json` and lockfile.
- Breeder: `breeding-app-breeder/package.json`.
- Shared: `breeding-app-shared/package.json`.
- Legacy `server/` package still exists with its own lockfile.
- Admin and Marketplace package files exist but are not part of the current deterministic E2E gate.

## Findings

- Backend already had a lockfile and is the Prisma owner.
- Lab already had a lockfile and owned Playwright before this stage.
- Breeder had no lockfile and was borrowing Lab's Playwright runtime.
- Breeder used `@capacitor/preferences@^8.1.0`, but npm registry inspection showed no stable `8.1.0` release. Stable v8 is `8.0.1`.
- Shared had no lockfile before this stage.
- A root `pnpm-lock.yaml` exists alongside npm lockfiles, but current package scripts and installs are npm-based.

## Risk

The highest dependency risk was breeder install reproducibility. Without a breeder lockfile and local Playwright dependency, CI could not reliably run breeder browser tests.
