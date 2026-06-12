# Clean Commit Grouping Plan

Date: 2026-05-20

## Recommended Commit Groups

1. Auth/session/security runtime foundation.
2. Marketplace DTO, media schema, upload validation, and moderation schema.
3. Lab and breeder E2E deterministic fixtures.
4. Live E2E runner stabilization.
5. Marketplace runtime route tests.
6. Reports and ChatGPT handoff files.

## Important

The current worktree is heavily dirty from many staged phases. Do not squash everything blindly unless the goal is one checkpoint branch only. A review commit should separate runtime code from report artifacts when possible.

