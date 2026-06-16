# Login Runtime With Database Report

Date: 2026-05-17

## Result

Passed.

Login was verified against the backend running on the approved local PostgreSQL database.

## Test User

| Field | Value |
| --- | --- |
| Email | `breeder@proherper.dev` |
| Role | `breeder` |
| Source | Local seed data |

The password and token value are not printed in this report.

## Checks

| Check | Result |
| --- | --- |
| Backend auth endpoint called | Passed |
| Token created | Passed |
| User role returned | Passed |
| Token used for protected lab endpoints | Passed |

