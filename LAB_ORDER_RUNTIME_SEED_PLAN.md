# Lab Order Runtime Seed Plan

Date: 2026-05-17

## Goal

Create safe local lab order data through the backend API before migrating or verifying frontend order-list runtime behavior.

## Seed Method

Use the running local backend API instead of direct database writes:

1. Log in as the seeded breeder user.
2. Fetch backend catalog tests.
3. Create one order with a local test animal and real catalog IDs.

## Test Data

| Field | Value |
| --- | --- |
| Breeder user | Seeded local breeder |
| Animal ID | `local-e2e-animal-1` |
| Animal name | `Local E2E Animal 1` |
| Selected tests | First two backend catalog IDs |
| Database | Local PostgreSQL only |

## Cleanup

Use admin/lab order deletion endpoints or reset the local database if the seed order needs to be removed.

