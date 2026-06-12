# Dependency Audit Review Plan

Date: 2026-05-17

## Commands Run

Lab production dependencies:

```powershell
npm.cmd audit --omit=dev
```

Lab all dependencies:

```powershell
npm.cmd audit --audit-level=moderate
```

Backend production dependencies:

```powershell
npm.cmd audit --omit=dev
```

No fix command was run.

## Lab Findings

Production dependency findings:

- `jspdf <=4.2.0` depends on vulnerable `dompurify <=3.3.3`.
- `npm audit fix --force` would install `jspdf@4.2.1`, marked as a breaking change.
- Result: 2 vulnerabilities, 1 moderate and 1 critical.

All dependency findings additionally include:

- `esbuild <=0.24.2` through Vite/Vitest tooling.
- `npm audit fix --force` would install `vite@8.0.13`, marked as a breaking change.
- Result: 6 vulnerabilities, 5 moderate and 1 critical.

## Backend Findings

Production dependency findings:

- `defu <=6.1.4`, high.
- `effect <3.20.0`, high, through Prisma config tooling.
- `ip-address <=10.1.0`, moderate, through `express-rate-limit`.
- `path-to-regexp <0.1.13`, high.
- Result: 7 vulnerabilities, 2 moderate and 5 high.
- `npm audit fix` is available, but it was not run in this step.

## Recommendation

Do not run `npm audit fix --force` without a dedicated dependency upgrade branch and full regression pass.

Suggested next dependency task:

1. Try non-force `npm audit fix` in backend on a separate branch or after committing current E2E work.
2. For Lab, investigate whether `jspdf` can be safely upgraded and whether Vite/Vitest can be upgraded without changing build behavior.
3. Run full backend/Lab quality gate after any dependency change.
