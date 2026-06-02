# Shared Package Dependency Strategy

Date: 2026-05-17
Scope: Step 71

## Recommendation

Use a workspace-style monorepo dependency first, then publish `breeding-app-shared` later if the apps become separate repositories.

## Options Compared

### Temporary Local Copies

Pros:

- current apps already build
- lowest immediate risk

Cons:

- duplicates logic
- fixes must be copied across apps
- type drift likely

### `file:../breeding-app-shared`

Pros:

- simple inside current folder structure
- no registry required

Cons:

- fragile if apps become separate repos
- requires package manager install updates in every app

### npm Workspaces

Pros:

- best fit while split apps remain in one repo
- consistent local development
- shared package can be consumed directly

Cons:

- needs root workspace configuration
- changes install behavior

### Private Package Registry

Pros:

- best once apps are separate repositories
- versioned releases

Cons:

- requires registry credentials
- slows local iteration

## Short-Term Decision

Keep local copies until E2E runtime is proven, then introduce npm workspaces or `file:` links in a small batch.

## Long-Term Decision

Publish `breeding-app-shared` as a private versioned package if the split apps become independent repositories.

## First Cleanup Candidate

API config/backend status helpers.

