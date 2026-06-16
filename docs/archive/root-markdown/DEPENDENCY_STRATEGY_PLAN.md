# Dependency Strategy Plan

Step: 231

## Policy

- Use npm for the current split packages.
- Keep one package lockfile per installable package that is part of CI.
- Do not use `npm audit fix --force` without a dedicated breaking-upgrade plan.
- Keep Playwright owned by the package that runs the Playwright suite.
- Keep Prisma owned by `breeding-app-backend`.

## Lockfile Scope

Required for this stage:

- `breeding-app-backend/package-lock.json`
- `breeding-app-lab/package-lock.json`
- `breeding-app-breeder/package-lock.json`
- `breeding-app-shared/package-lock.json`

## Rollback Strategy

Dependency changes are isolated to package manifests and lockfiles. If a package upgrade causes regressions, revert that package's manifest and lockfile together.
