# Pre Deployment Live E2E Report

Date: 2026-05-20

## Command

`npm.cmd run test:e2e:live`

## Execution Mode

Elevated local execution, which is the validated mode for this Playwright/dev-server runner.

## Result

Passed.

## Details

- Reset before lab: passed.
- Lab live E2E: 19/19 passed.
- Reset before breeder: passed.
- Breeder live E2E: 9/9 passed.

## Runtime

- Lab phase: about 1 minute 27 seconds.
- Breeder phase: about 1 minute 38 seconds.

## Warnings

- Prisma `package.json#prisma` deprecation warning remains.
- Breeder app still logs Babel deoptimised styling for large `App.jsx`.

