# Push And Branch Strategy Decision

Date: 2026-05-17
Scope: Step 59

## Current Git State

Current branch:

```text
all-branches-merged
```

Remote:

```text
origin https://github.com/albertbit-cyber/Breeding-planner.git
```

The branch is ahead of `origin/all-branches-merged` by 3 commits:

```text
504cf94 fix: persist normalized auth roles
e08457d docs: record api migration planning
7b0b66f chore: stabilize split app repositories
```

Known local warning:

```text
warning: unable to access 'C:\Users\alber/.config/git/ignore': Permission denied
```

This appears to be a local Git global-ignore permission issue, not an application build blocker.

## Recommendation

Keep `all-branches-merged` as the integration branch for now.

Recommended branch strategy:

1. Keep all split apps inside this repository until local E2E and staging validation pass.
2. Do not create separate GitHub repositories yet.
3. Do not deploy from this branch yet.
4. Push only after the user explicitly approves pushing the 3 local commits.
5. Use a later dedicated publication step to decide whether each split app becomes a standalone repository.

## Why

- The split apps build and test, but true database-backed E2E has not run yet.
- Several backend route families and local-store migrations remain.
- Keeping one integration branch is simpler and easier to roll back during E2E/staging validation.

## Before Push

- Confirm no generated artifacts are staged.
- Confirm no real `.env` files are staged.
- Confirm no Android signing files are staged.
- Confirm the branch history is acceptable.
- Optionally fix the local Git global-ignore permission warning.

## Do Not Do Without Approval

- Do not push.
- Do not force-push.
- Do not publish separate repositories.
- Do not deploy.

