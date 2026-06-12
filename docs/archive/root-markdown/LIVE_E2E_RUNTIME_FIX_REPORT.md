# Live E2E Runtime Fix Report

Date: 2026-05-20

## Fixed

The root live E2E runner now:

- Logs phases.
- Applies phase timeouts.
- Resets state before each app suite.
- Cleans common E2E dev-server ports after each suite.
- Invokes Playwright directly through `node node_modules/@playwright/test/cli.js test --reporter=list`.

## Why Playwright Direct CLI Is Used

The npm wrapper was part of the previous hang pattern. Direct Playwright CLI execution completed cleanly in isolated checks and in the final elevated root live run.

## Remaining Note

Sandboxed root live E2E execution is still not the authoritative mode for this project because Playwright/dev-server child processes behave differently under sandbox supervision. The authoritative local gate is the elevated root command.

