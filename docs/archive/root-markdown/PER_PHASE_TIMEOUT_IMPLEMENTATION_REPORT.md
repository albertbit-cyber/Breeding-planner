# Per Phase Timeout Implementation Report

Date: 2026-05-20

## Implemented

`scripts/run-live-e2e.ps1` now accepts:

- `-PhaseTimeoutSeconds`, default `900`.

Reset phases use a shorter internal timeout of 300 seconds.

## Behavior

If a phase exceeds its timeout, the runner:

1. Prints the timed-out phase name.
2. Attempts to terminate the phase process tree.
3. Fails the script with a clear message.

## Compatibility Notes

The runner was adjusted for Windows PowerShell 5 compatibility:

- Avoided `ProcessStartInfo.ArgumentList`, which was unavailable.
- Avoided async redirected output handlers, which caused runspace errors.
- Uses `cmd.exe /c` wrapping for child commands.

