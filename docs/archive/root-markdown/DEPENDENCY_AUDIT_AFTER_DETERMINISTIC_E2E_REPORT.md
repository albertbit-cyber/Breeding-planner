# Dependency Audit After Deterministic E2E Report

Step: 227

## Commands Run

- `npm.cmd audit --audit-level=moderate` in `breeding-app-backend`.
- `npm.cmd audit --audit-level=moderate` in `breeding-app-lab`.
- `npm.cmd audit --audit-level=moderate` in `breeding-app-breeder`.

## Results

Backend:

- Failed with 9 vulnerabilities: 3 moderate, 6 high.
- Main areas: Prisma transitive packages, `express-rate-limit` transitive `ip-address`, old `path-to-regexp`, PostCSS, Vite.

Lab:

- Failed with 6 vulnerabilities: 5 moderate, 1 critical.
- Main areas: `jspdf` transitive `dompurify`, Vite/esbuild/Vitest chain.
- Suggested npm fix includes breaking upgrades.

Breeder:

- Audit could not run because there is no existing lockfile.
- npm reported `ENOLOCK`.

## Recommendation

Handle dependency updates as a separate planned upgrade pass, especially because Lab audit suggests breaking changes and Breeder still needs a lockfile strategy.
