# Remaining Dependency And CI Risks

Step: 240

## Remaining Dependency Risks

- Lab still has `jspdf`/`dompurify` and Vite/Vitest/esbuild audit findings requiring breaking upgrades.
- Breeder still has `jspdf`/`dompurify`, Vite/Vitest/esbuild, `pdfjs-dist`, `xlsx`, and transitive native tooling audit findings.
- Shared still has Vite/Vitest/esbuild audit findings.
- `xlsx` has no audit fix available and needs replacement or risk acceptance.

## Remaining CI Risks

- The CI workflow is implemented but has not been run remotely in GitHub Actions.
- Admin and Marketplace packages are not yet part of this CI gate.
- Existing deploy workflows still exist separately and were not modified.

## Recommended Next Action

Plan a breaking dependency upgrade phase focused on PDF generation, spreadsheet import/export, Vite/Vitest, and `pdfjs-dist`.
