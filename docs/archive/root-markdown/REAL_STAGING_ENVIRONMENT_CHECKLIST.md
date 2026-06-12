# Real Staging Environment Checklist

Date: 2026-05-21

## Current Status

Local readiness is green. Real staging environment is not yet provisioned.

## Required Provider Assets

- Railway staging project/environment
- Railway backend service from `staging/runtime-review-20260521`
- Supabase staging project and PostgreSQL connection string
- Netlify lab staging site
- Netlify breeder staging site
- Cloudflare R2 staging bucket or approved temporary upload volume
- monitoring/uptime target

## Required Domains And URLs

- Railway staging API URL
- Netlify lab staging URL
- Netlify breeder staging URL
- optional custom staging subdomains
- optional R2 public base URL if public media is used

## Required Secrets

Store only in provider secret managers:

- `DATABASE_URL`
- `JWT_SECRET`
- `CORS_ORIGIN`
- `COOKIE_SECURE`
- `COOKIE_SAME_SITE`
- `MAX_UPLOAD_BYTES`
- `JSON_BODY_LIMIT`
- upload storage variables
- monitoring webhook/API token if used

## Required Deployment Inputs

- Git branch: `staging/runtime-review-20260521`
- Runtime commit: `a37644f`
- Database commit: `9560ed3`
- E2E/CI commit: `dfb86a2`
- Latest local validation: `FINAL_LOCAL_PRE_DEPLOYMENT_VALIDATION.md`

## Required Safety Checks

- confirm no production database URL is used
- confirm no production API URL is used by staging frontends
- confirm staging CORS origins are exact
- confirm upload storage is staging-only
- confirm deterministic reset cannot hit staging unless explicitly approved
- confirm rollback checkpoint exists before migration

