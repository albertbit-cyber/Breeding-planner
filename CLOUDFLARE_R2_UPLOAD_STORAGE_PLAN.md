# Cloudflare R2 Upload Storage Plan

Date: 2026-05-21

## Status

Prepared only. No R2 bucket, credentials, or backend integration was activated.

## Target

Use a dedicated R2 bucket for staging upload/media storage.

Suggested bucket:

- `breeding-planner-staging-uploads`

## Required R2 Assets

- staging bucket
- API token or access key scoped to the staging bucket only
- bucket-level lifecycle policy if temporary staging uploads should expire
- public URL strategy:
  - private objects with signed access, or
  - public base URL for safe public media only

## Backend Integration State

The backend currently has upload validation/storage service work, but the active provider configuration still needs to be verified before R2 can be used for real staging uploads. Until that integration is confirmed, use a staging-local upload directory or volume as a temporary backend setting.

## Future Railway Variables

Set these only after the backend supports and validates R2 mode:

- `UPLOAD_STORAGE_PROVIDER=r2`
- `R2_ACCOUNT_ID`
- `R2_BUCKET`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_PUBLIC_BASE_URL`

## Safety

- Staging bucket must not share credentials with production.
- Do not commit R2 credentials.
- Do not make private uploads public by default.
- Do not use local generated upload artifacts as deployment inputs.

## Blockers

- no Cloudflare account/bucket target supplied
- no scoped staging credentials
- backend R2 provider activation still needs implementation/verification

