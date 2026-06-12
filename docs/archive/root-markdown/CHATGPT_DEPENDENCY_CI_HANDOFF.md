# ChatGPT Dependency CI Handoff

Step: 243

## Summary

Steps 230-243 stabilized dependency ownership, normalized missing lockfiles, fixed breeder-local Playwright, added an initial CI workflow, ran the local CI-equivalent gate, and documented remaining dependency/security risks.

## Key Changes

- Breeder now owns its Playwright runtime with `@playwright/test@1.60.0`.
- Breeder no longer imports Playwright from Lab's `node_modules`.
- Breeder `@capacitor/preferences` is pinned to valid stable v8: `^8.0.1`.
- Breeder and Shared now have package lockfiles.
- Backend reset script uses cross-platform `cross-env`.
- Lab and Breeder reset scripts use cross-platform `npm`.
- Lab and Breeder Playwright webServer commands use cross-platform `npm`.
- Added `.github/workflows/dependency-ci.yml`.

## Validation

Passed locally:

- Backend: 68 tests and build.
- Shared: 40 tests and build.
- Lab: 56 tests, build, and 19 Playwright E2E tests.
- Breeder: 44 tests, build, and 9 Playwright E2E tests.
- Backend audit: 0 vulnerabilities after non-forced fix.

## Remaining Audit Risks

- Lab: 6 vulnerabilities remain, requiring breaking upgrades.
- Breeder: 10 vulnerabilities remain, including `dompurify`, `pdfjs-dist`, `xlsx`, Vite/Vitest/esbuild, and transitive `tar`.
- Shared: 4 moderate vulnerabilities remain through Vite/Vitest/esbuild.
- `xlsx` has no audit fix available.

## Important CI Notes

- The new CI workflow is local/test only.
- It uses PostgreSQL 17 service and deterministic E2E reset.
- It does not deploy.
- It uploads Playwright artifacts only on failure.
- It has not yet been run remotely on GitHub Actions.

## Recommended Next Steps

1. Run the new GitHub Actions workflow remotely.
2. Plan a breaking dependency upgrade phase for Vite/Vitest, `jspdf`, `pdfjs-dist`, and spreadsheet handling.
3. Replace or isolate `xlsx`.
4. Add Admin and Marketplace packages to CI after their runtime/test boundaries are ready.
5. Start the security hardening phase described in `SECURITY_HARDENING_PHASE_PLAN.md`.

## Do Not Do Yet

- Do not run `npm audit fix --force` without a migration plan.
- Do not deploy.
- Do not push unless explicitly approved.
- Do not commit `.env` files or Playwright artifacts.
