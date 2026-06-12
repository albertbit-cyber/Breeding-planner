# Next Certificate Or Sample Workflow Plan

## Recommended Next Slice

Certificate workflow.

## Why

Result submission now completes the seeded order and exposes certificate actions in the UI. Certificate generation/download is the natural next user-visible workflow after result submission.

## Suggested Scope

- Inspect certificate backend artifact route and frontend download/view behavior.
- Add backend tests for certificate artifact access.
- Add Playwright test that submits or uses a completed seeded order, opens certificate actions, and verifies generated artifact response.
- Keep sample/QR lookup for the following slice.

## Risks

- PDF/font behavior has known test-runtime fallback warnings.
- Certificate file output should be tested locally without committing generated files.

