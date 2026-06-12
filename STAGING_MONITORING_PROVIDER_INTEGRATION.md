# Staging Monitoring Provider Integration

Date: 2026-05-21

## Status

Prepared only. No monitoring provider was connected.

## Initial Monitoring Choice

Start with:

- Railway logs and service health for backend runtime visibility
- external uptime monitor for `GET /api/health`
- Netlify deploy status checks for both frontend sites
- manual smoke/E2E result reports for first deployment

Add application error monitoring later if staging produces enough signal to justify instrumentation.

## Required Checks

Critical:

- Railway backend health endpoint down
- Railway backend 5xx spike
- Supabase connection failures
- auth login/refresh failures
- upload write failures

Warning:

- frontend deploy failure
- increased 4xx rate
- marketplace report/block spike
- slow backend responses
- staging live E2E failure

## Alert Routing

Define before deployment:

- alert recipient
- severity policy
- escalation path
- deployment freeze condition

## Data Safety

Logs and alerts must not expose:

- passwords
- tokens
- cookies
- authorization headers
- database URLs
- R2 credentials
- `.env` contents

## Blockers

- no Railway service URL
- no Netlify site URLs
- no monitoring account/target
- no alert recipient

