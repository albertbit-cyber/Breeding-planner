# Safe Dependency Upgrade Report

Step: 235

## Applied

- Backend: ran `npm.cmd audit fix` without `--force`.
- Backend audit is now clean.
- Backend resolved versions include:
  - `@prisma/client@6.19.3`
  - `prisma@6.19.3`
  - `express-rate-limit@8.5.2`
  - `vite@8.0.13`
  - `cross-env@7.0.3`
- Breeder: fixed invalid Capacitor Preferences version and added local Playwright.
- Breeder resolved versions include:
  - `@capacitor/preferences@8.0.1`
  - `@playwright/test@1.60.0`
  - `vite@5.4.21`
  - `vitest@1.6.1`

## Not Applied

- No `npm audit fix --force`.
- No forced upgrades for `jspdf`, `pdfjs-dist`, Vite/Vitest major versions, or `xlsx`.
