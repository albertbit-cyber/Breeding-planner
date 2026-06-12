# Shared State Reset Plan

Date: 2026-05-20

## Problem

Lab and breeder live suites both mutate shared local PostgreSQL state. Running both app suites against one reset can make later tests dependent on earlier suite side effects.

## Plan

Use a deterministic local reset:

1. Reset before lab suite.
2. Run lab suite.
3. Reset before breeder suite.
4. Run breeder suite.

## Constraints

- Local PostgreSQL only.
- No production database.
- Preserve seeded users and deterministic baseline order.

