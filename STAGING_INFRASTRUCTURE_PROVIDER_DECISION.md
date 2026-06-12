# Staging Infrastructure Provider Decision

Date: 2026-05-21

## Decision

Use this first real staging stack:

- Backend: Railway
- PostgreSQL: Supabase staging project
- Frontends: Netlify, one site for lab and one site for breeder
- Upload storage: Cloudflare R2
- Monitoring: provider health checks plus an external uptime monitor, with application log review in Railway

No provider resources were created, no secrets were configured, and no deployment was executed.

## Why This Stack

The current repository is a monorepo with independently deployable directories:

- `breeding-app-backend`
- `breeding-app-lab`
- `breeding-app-breeder`

Railway and Netlify both support monorepo deployment patterns where a service/site can be configured with a root or package directory. Supabase gives an isolated managed PostgreSQL target for Prisma migrations. R2 gives S3-compatible object storage that can later replace or augment local upload storage.

## Tradeoffs

Railway backend:

- Pros: simple Node service deployment, environment variables, monorepo root-directory support, easy staging environment isolation.
- Cons: requires provider configuration and runtime variable discipline; migration execution must be controlled so staging and production cannot be confused.

Supabase PostgreSQL:

- Pros: managed Postgres, dashboard-managed connection strings, backup/restore options depending on plan, good staging isolation by separate project.
- Cons: Prisma connection string choice must be explicit; pooling/direct connection behavior must be verified for migration deploys.

Netlify frontends:

- Pros: strong static frontend hosting, monorepo site configuration, build environment variables, deploy previews if needed.
- Cons: two separate sites must be kept aligned with the same staging API URL; cache headers and redirects need explicit review.

Cloudflare R2:

- Pros: S3-compatible API, good fit for staged object storage isolation, avoids committing local upload artifacts.
- Cons: backend currently needs provider integration before R2 can be active; bucket policy and public/private URL model must be chosen.

Monitoring:

- Pros: can start small with uptime checks and platform logs.
- Cons: deeper error/event monitoring needs instrumentation and alert routing decisions.

## Isolation Rules

- Staging must use a separate Supabase project from production.
- Railway staging variables must not contain production values.
- Netlify staging sites must point only at the Railway staging API.
- R2 staging bucket must be separate from any production bucket.
- Deterministic E2E reset must not run against staging unless reset safety is explicitly confirmed.

## Official References

- Railway monorepos: https://docs.railway.com/guides/monorepo
- Railway environments: https://docs.railway.com/reference/environments
- Supabase connection strings: https://supabase.com/docs/reference/postgres/connection-strings
- Netlify monorepos: https://docs.netlify.com/build/configure-builds/monorepos/
- Netlify environment variables: https://docs.netlify.com/build/environment-variables/overview
- Cloudflare R2 S3 API: https://developers.cloudflare.com/r2/api/s3/api/

