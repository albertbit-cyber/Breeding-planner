# Post-Split Cleanup Plan

Date: 2026-05-16
Scope: Step 31 cleanup planning only. No cleanup was performed, so no `POST_SPLIT_CLEANUP_REPORT.md` was created.

## Summary

The split folders appear to contain functional extracted applications, but the root repository still contains the original application, generated artifacts, dependency folders, and duplicated shared logic. Cleanup should be staged after local split validation and after the team agrees which repository remains canonical for each area.

## Cleanup Candidates

### Generated And Dependency Folders

- `node_modules` exists in all six split folders.
- `build` exists in frontend split folders.
- `dist` exists in backend and shared split folders.
- Root also contains generated/dependency artifacts such as `node_modules`, `build`, and `dist`.

Recommendation: decide per repository whether generated artifacts are intentionally committed. `.gitignore` files were added on 2026-05-16; the next cleanup step is to remove ignored generated artifacts from the Git index in a dedicated, reviewable commit.

### Duplicate Application Code

- Original root folders still exist: `src`, `server`, `shared`, `packages`, `apps`, `android`, `ios`, `electron`, and related root configs.
- Split folders include copied app source for admin, backend, breeder, lab, marketplace, and shared.

Recommendation: do not delete root originals until the split apps pass local and deployment-prep tests and ownership is clear.

### Duplicated Shared Logic

Likely duplicated across app folders and `breeding-app-shared`:

- Genetics logic
- Lab label utilities
- Lab pricing helpers
- API client/config helpers
- Lab and marketplace types
- Locales and UI shell helpers

Recommendation: after dependency wiring is finalized, replace duplicated copies with imports from `breeding-app-shared` where practical.

### Old Environment Examples

- Root `.env.example` still includes legacy search/cache values and shared backend `VITE_API_URL`.
- Split `.env.example` files are simple and deployment-oriented.

Recommendation: keep root env docs only if the root repo remains a runnable development shell. Otherwise move historical root env details into migration notes.

### Repository Metadata

- Split roots now have `.gitignore` files.
- License files were not verified in split roots.
- README files exist but should be reviewed once hosting and publication decisions are final.

Recommendation: complete metadata before creating standalone GitHub repositories.

## Safe Cleanup Sequence

1. Confirm split system works locally.
2. Decide generated artifact policy for `build`, `dist`, and `node_modules`.
3. Remove ignored generated artifacts in a separate, reviewable commit.
4. Re-check `git status` to confirm only intended source/config/report files remain staged.
5. Run tests/builds for every split app.
6. Replace duplicated shared logic with package imports where proven stable.
7. Update READMEs and environment examples.
8. Archive or remove root legacy app code only after a rollback branch/tag exists and stakeholders approve.

## Do Not Delete Without Approval

- Root `src`, `server`, `shared`, `packages`, `apps`, `android`, `ios`, or `electron`.
- Database migrations or Prisma schema files.
- Any user data, local `.env`, certificates, signing files, or generated app stores.
- Split app source files.

## Cleanup Status

Planning only. No files were deleted or modified outside these report artifacts.
