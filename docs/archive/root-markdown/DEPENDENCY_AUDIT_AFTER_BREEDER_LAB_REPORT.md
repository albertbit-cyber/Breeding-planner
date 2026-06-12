# Dependency Audit After Breeder Lab Report

## Commands

- Backend: `npm.cmd audit --audit-level=moderate`
- Lab: `npm.cmd audit --audit-level=moderate`
- Breeder: `npm.cmd audit --audit-level=moderate`
- Shared: `breeding-app-shared npm.cmd audit --audit-level=moderate`

## Findings

- Backend audit failed with 9 vulnerabilities: `defu`, `effect` through Prisma config, `ip-address` through express-rate-limit, `path-to-regexp`, `postcss`, and `vite`.
- Lab audit failed with 6 vulnerabilities: `dompurify` through jspdf and `esbuild` through vite/vitest chain. Available fixes require force/breaking upgrades.
- Breeder audit could not run because there is no lockfile.
- Shared audit could not run because there is no lockfile.

## Decision

No `npm audit fix --force` was run. Dependency updates should be planned as a separate upgrade/test slice.
