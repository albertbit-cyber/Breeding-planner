# Dependency Audit After Sample QR Report

## Commands Run

- `breeding-app-backend`: `npm.cmd audit --audit-level=moderate`
- `breeding-app-lab`: `npm.cmd audit --audit-level=moderate`

## Backend Findings

- `defu`: high.
- `effect` through Prisma config: high.
- `ip-address` through `express-rate-limit`: moderate.
- `path-to-regexp`: high.
- `postcss`: moderate.
- `vite`: high.

## Lab Findings

- `dompurify` through `jspdf`: moderate/critical advisories; npm recommends force upgrade to `jspdf@4.2.1`.
- `esbuild` through Vite/Vitest: moderate; npm recommends force upgrade to Vite 8.

## Decision

No `npm audit fix --force` was run. Upgrades should be handled as a separate dependency modernization stage.

