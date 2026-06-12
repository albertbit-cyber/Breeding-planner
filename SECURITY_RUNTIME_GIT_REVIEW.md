# Security Runtime Git Review

Step: 307

## Changed In Steps 292-308

- Frontend shared API clients in breeder, lab, admin, marketplace, shared, and root app were updated for cookie-preferred auth with Bearer fallback.
- Playwright auth setup was updated to preserve cookies and mark cookie-preferred mode.
- Backend auth now returns `csrfToken` on login/refresh.
- Backend refresh-token persistence now stores SHA-256 hashes in the existing `User.refreshToken` column.
- Added backend refresh token hash helper and security event foundation service.
- Added production-only marketplace abuse limiters and wired marketplace/listing write and message routes.
- Added the required planning, implementation, quality gate, and ChatGPT handoff markdown files for steps 292-308.

## Existing Dirty Worktree

The repository already had many unrelated modified and untracked files from earlier phases. I did not revert or clean unrelated work.

## Validation

- Backend targeted security tests passed: 43 tests.
- Full backend test suite passed: 79 tests.
- Backend build passed.
- Breeder tests passed: 44 tests.
- Lab tests passed: 56 tests.
- Admin tests passed: 19 tests.
- Marketplace tests passed: 19 tests.
- Shared tests passed: 40 tests.
- Breeder, lab, admin, marketplace, shared, and root builds passed.

## Warnings

- Git reported permission warnings reading `C:\Users\alber/.config/git/ignore`.
- Vite circular chunk warnings remain in breeder/lab builds.
- pdfjs eval warning remains in breeder/root builds.
- Vitest websocket port reuse warnings appeared but did not fail tests.
- Lab PDF font fallback warning appeared but tests passed.
