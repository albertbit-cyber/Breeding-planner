# Between Suite Reset Implementation Report

Date: 2026-05-20

## Implemented

The root live E2E runner now resets local PostgreSQL before the breeder suite by default.

## Controls

The runner accepts:

- `-SkipReset`: skips all local resets.
- `-NoResetBetweenSuites`: skips the reset between lab and breeder.

## Result

The passing root live E2E run used this sequence:

1. Reset before lab.
2. Lab E2E.
3. Reset before breeder.
4. Breeder E2E.

