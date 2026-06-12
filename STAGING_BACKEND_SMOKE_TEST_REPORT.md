# Staging Backend Smoke Test Report

Date: 2026-05-21

## Status

Blocked. No staging backend exists to test.

## Planned Smoke Coverage

- `GET /api/health`
- login
- refresh session
- logout
- CSRF behavior
- upload route behavior
- marketplace public list
- marketplace media/report/block permissions
- ownership and permission boundaries

## Safety

Smoke tests must target staging URLs only. No production endpoint should be used.

