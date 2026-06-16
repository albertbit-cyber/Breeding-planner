# Backend Deployment Runtime Plan

Date: 2026-05-20

## Runtime

- Node runtime compatible with backend dependencies.
- `npm.cmd run build` before artifact publication.
- `npm.cmd run prisma:migrate:deploy` before backend traffic.
- `npm.cmd start` or provider equivalent to run `dist/server.js`.

## Startup Validation

- Environment variables present.
- Production CORS origins non-empty.
- Database reachable.
- `/api/health` returns healthy response.

## Logging

- Log request summary and errors.
- Do not log tokens, cookies, authorization headers, database URLs, or `.env` contents.

## Failure Handling

- If migration fails, do not start new backend version.
- If health check fails, roll back backend artifact.
- If auth/session fails after deploy, stop rollout and restore previous backend.

