# Dependency Audit Safe Pass Report

## Commands Run

- `breeding-app-backend`: `npm.cmd audit --audit-level=moderate`
- `breeding-app-lab`: `npm.cmd audit --audit-level=moderate`

## Backend Findings

- `defu`: high, fix available with normal audit fix.
- `effect` through Prisma config: high, fix available with normal audit fix.
- `ip-address` through `express-rate-limit`: moderate, fix available.
- `path-to-regexp`: high, fix available.
- `postcss`: moderate, fix available.
- `vite`: high, fix available.

## Lab Findings

- `dompurify` through `jspdf`: includes critical/moderate findings; audit suggests force upgrade to `jspdf@4.2.1`, which is breaking.
- `esbuild` through `vite`/`vitest`: moderate; audit suggests force upgrade to Vite 8, which is breaking for the current Lab app.

## Decision

No `npm audit fix --force` was run. Dependency upgrades should be planned separately with full regression testing.

