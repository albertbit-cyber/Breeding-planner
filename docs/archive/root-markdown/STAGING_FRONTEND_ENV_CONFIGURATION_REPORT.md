# Staging Frontend Env Configuration Report

Date: 2026-05-21

## Status

Blocked. No staging frontend environment variables were configured.

## Required Inputs

- staging API URL
- staging lab frontend URL
- staging breeder frontend URL
- hosting provider/project targets

## Required Frontend Environment

- `VITE_API_URL=<https-staging-api>/api`

Apply separately for:

- `breeding-app-lab`
- `breeding-app-breeder`

## Safety Decision

Do not point staging frontends at production API hosts. Do not commit environment-specific values.

