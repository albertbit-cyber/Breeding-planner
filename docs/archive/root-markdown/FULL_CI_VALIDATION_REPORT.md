# Full CI Validation Report

Step: 239

## Local Commands Run

- `npm.cmd run prisma:generate` in backend.
- `npm.cmd test` in backend: 68 passed.
- `npm.cmd run build` in backend: passed.
- `npm.cmd test` in shared: 40 passed.
- `npm.cmd run build` in shared: passed.
- `npm.cmd test` in lab: 56 passed.
- `npm.cmd run build` in lab: passed.
- `npm.cmd test` in breeder: 44 passed.
- `npm.cmd run build` in breeder: passed.
- `npm.cmd run test:e2e:reset` in lab: 19 passed.
- `npm.cmd run test:e2e:reset` in breeder: 9 passed.

## Notes

- Prisma generate initially failed because an existing backend dev server locked the generated Windows query engine DLL. I stopped only the backend dev server processes and reran successfully.
- Running Lab and Breeder E2E reset scripts in parallel exposed a reset race. The reset now upserts the baseline order and is idempotent.

## Warnings

- Prisma package.json config deprecation warning remains.
- Lab unit tests still log the known PDF font fallback warning.
- Lab and breeder builds still report circular chunk warnings.
- Breeder build still warns about `pdfjs-dist` eval and large `src/App.jsx`.
