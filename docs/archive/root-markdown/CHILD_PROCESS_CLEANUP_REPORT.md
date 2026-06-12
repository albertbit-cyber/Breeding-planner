# Child Process Cleanup Report

Date: 2026-05-20

## Implemented

`scripts/run-live-e2e.ps1` now attempts cleanup after each app suite.

## Cleanup Scope

The cleanup checks common local E2E ports:

- `4000`
- `4173`
- `4174`

Only listener processes with process names matching local Node/npm runtime patterns are targeted.

## Controls

The runner accepts:

- `-NoCleanupPorts`

This allows cleanup to be disabled when a developer intentionally wants to reuse an existing local server.

