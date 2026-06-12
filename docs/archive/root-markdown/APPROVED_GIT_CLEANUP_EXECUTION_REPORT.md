# Approved Git Cleanup Execution Report

Date: 2026-05-16
Scope: Step 46.

## Completed

Generated/dependency artifacts and one Android signing file were removed from the Git index in the previous cleanup pass.

Unstaged patterns:

- `breeding-app-admin/build`
- `breeding-app-admin/node_modules`
- `breeding-app-backend/dist`
- `breeding-app-backend/node_modules`
- `breeding-app-breeder/build`
- `breeding-app-breeder/node_modules`
- `breeding-app-lab/build`
- `breeding-app-lab/node_modules`
- `breeding-app-marketplace/build`
- `breeding-app-marketplace/node_modules`
- `breeding-app-shared/dist`
- `breeding-app-shared/node_modules`
- `breeding-app-breeder/android/key.properties`

## Verification

No staged generated/dependency artifact path patterns were found after cleanup.

## Ignore Coverage

Ignore rules now include:

- split repo build/dependency outputs
- real environment files
- Android signing files

## Not Done

- No source files were deleted.
- No split folders were deleted.
- No deployment was performed.

